import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

/**
 * In-app updates: what version am I on, is there a newer one, fetch it, apply it.
 *
 * The app ships as a web bundle inside a WebView, so most releases are delivered
 * over the air rather than as a new APK. That worked, but invisibly — a bundle
 * landed whenever Capgo happened to check on a cold start, applied on the start
 * after that, and nobody could see any of it. The practical result was an
 * employee looking at a screen two versions old, being told the fix had shipped,
 * with no way for either of them to find out who was right.
 *
 * So this module exists to make the whole thing legible and manual:
 *
 *   · which version is actually running, in Settings, for support to ask for
 *   · a real "Check for updates" button that reports what it found
 *   · a prompt when something is waiting, saying what changed
 *
 * Everything degrades to "not supported" in a browser and on an APK too old to
 * have the plugin. None of it ever throws at the caller — an update check that
 * breaks the page it lives on is worse than no update check.
 */

export type UpdateCheck =
  | { status: "unsupported" }
  | { status: "up-to-date"; current: string }
  | { status: "error"; message: string }
  /** Downloaded and waiting for a restart — nothing left to fetch. */
  | { status: "ready"; current: string; version: string; bundleId: string }
  | {
      status: "available";
      current: string;
      version: string;
      url: string;
      checksum?: string;
      /** Release notes from the server, if whoever published bothered. */
      notes?: string;
      sizeBytes?: number;
    };

export interface VersionInfo {
  /** The installed APK, e.g. "1.6-staging". Changes only on a reinstall. */
  native: string | null;
  nativeBuild: string | null;
  /** The web bundle actually running — what OTA replaces. */
  bundle: string | null;
  /**
   * True when this is the APK's own built-in bundle, i.e. no OTA applied.
   * `null` means the read failed and we genuinely do not know.
   */
  isBuiltin: boolean | null;
  native_platform: boolean;
  /**
   * Why a field above is missing, when one is. Surfaced in the UI rather than
   * swallowed: "—" with no explanation is the least useful thing a diagnostic
   * panel can display.
   */
  problem?: string;
}

/**
 * How long a download may go silent — no progress event, no result — before it
 * is treated as wedged. Generous, because the post-100% unzip and checksum on a
 * slow handset is not instant.
 */
const STALL_MS = 90_000;

const LAST_CHECK_KEY = "bot_update_last_check";
const DISMISSED_KEY = "bot_update_dismissed";

/**
 * Never await a bridge call without a deadline.
 *
 * A Capacitor call that the native side never answers hangs forever — there is
 * no built-in timeout — and an `await` inside a try/catch that never settles
 * cannot be caught, because nothing is ever thrown. That is how the first
 * version of this panel got stuck on "Checking..." with no error and no way to
 * tell which call was to blame.
 *
 * Every await below therefore carries one, and the rejection names the call so
 * the failure reaches the screen instead of a spinner.
 */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not respond after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CapacitorUpdater");
  } catch {
    return false;
  }
}

/*
 * WHY A STATIC IMPORT.
 *
 * This was `await import("@capgo/capacitor-updater")`, on the reasoning that a
 * browser build should not pull a native plugin into its graph. That reasoning
 * was already void — lib/live-update.ts imports the same module statically, so
 * it is in the main chunk regardless — and on a real handset the dynamic import
 * never settled. It did not reject, it hung, which is the worst of the three
 * outcomes: a try/catch cannot see it and the UI waits forever.
 *
 * The named timeout added alongside it is what turned that into a diagnosable
 * "Loading the updater did not respond after 5s" instead of a permanent
 * spinner, and is worth keeping on the calls below for the same reason.
 *
 * registerPlugin() is safe to evaluate in a browser — Capacitor substitutes a
 * web implementation — and every call site here is already behind isNative().
 */

/**
 * What is running right now.
 *
 * Both numbers are reported because they answer different questions and support
 * needs both: the APK version says which native capabilities exist (background
 * tracking, the crash reporter), the bundle version says which UI and which
 * fixes. An employee can be on the newest bundle and still be missing a native
 * fix, and reading only one number hides that completely.
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const base: VersionInfo = {
    native: null, nativeBuild: null, bundle: null, isBuiltin: true,
    native_platform: isNative(),
  };

  try {
    const { App } = await import("@capacitor/app");
    if (Capacitor.isNativePlatform()) {
      const info = await withTimeout(App.getInfo(), 5000, "App.getInfo()");
      base.native = info.version ?? null;
      base.nativeBuild = info.build ?? null;
    }
  } catch (err) {
    base.problem = err instanceof Error ? err.message : "Could not read the app version";
  }

  if (!isNative()) return base;

  try {
    const current = await withTimeout(CapacitorUpdater.current(), 5000, "CapacitorUpdater.current()");
    base.bundle = current?.bundle?.version ?? null;
    // Capgo reports the built-in bundle as "builtin"; anything else came from
    // an OTA download.
    base.isBuiltin = !base.bundle || base.bundle === "builtin";
  } catch (err) {
    // null, not true. Claiming "Bundled with the app" because the read FAILED
    // is worse than admitting we do not know — it is a confident wrong answer
    // to the exact question the panel exists to answer, and it is what this
    // panel displayed while the plugin import was hanging.
    base.isBuiltin = null;
    base.problem = err instanceof Error ? err.message : "Could not read the content version";
  }

  return base;
}

/**
 * Ask the server whether there is a newer bundle.
 *
 * Deliberately does NOT download. A check that silently pulls 1.5 MB on
 * somebody's mobile data, because they tapped a button labelled "check", is the
 * kind of thing that gets an app uninstalled.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!isNative()) return { status: "unsupported" };

  try {
    const currentBundle = (await withTimeout(CapacitorUpdater.current(), 5000, "CapacitorUpdater.current()"))?.bundle;
    const current = currentBundle?.version ?? "unknown";
    // Running the code baked into the APK rather than a downloaded bundle.
    // Capgo reports this as the id/version "builtin", but on some builds it
    // reports the NATIVE app version instead -- which is a different numbering
    // sequence from OTA bundles entirely.
    const onBuiltin =
      !currentBundle ||
      currentBundle.id === "builtin" ||
      current === "builtin" ||
      current === "unknown";
    // Generous, because this one really does go to the network — but finite,
    // because a captive wifi portal will otherwise hold it open indefinitely.
    const latest = await withTimeout(CapacitorUpdater.getLatest(), 25000, "The update check");

    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }

    if (latest?.error) return { status: "error", message: String(latest.error) };

    // The server answers "Up to date" with a message and no url; the plugin also
    // has its own `kind`. Treat either as up to date rather than trusting one,
    // because a missing url with a version string would otherwise read as an
    // available update that can never be downloaded.
    if (latest?.kind === "up_to_date" || !latest?.url || !latest?.version) {
      return { status: "up-to-date", current };
    }
    // Strictly newer, not merely different -- see isNewerVersion.
    //
    // ONLY when both sides are OTA bundle versions. The two sequences are not
    // comparable: the APK is versioned 1.9.1 while OTA bundles are at 1.6.x, so
    // comparing them rejected every bundle for anyone on a current APK. That is
    // exactly backwards -- a freshly installed APK is the case that most needs
    // the newest bundle, and it was the only case that never got one.
    //
    // On the built-in bundle the server's answer is authoritative: it has
    // already picked the right release for this tenant and channel, and any
    // bundle it offers is by definition newer than what shipped in the APK.
    if (!onBuiltin && !isNewerVersion(latest.version, current)) {
      return { status: "up-to-date", current };
    }
    // Same version string on both sides is never an update, builtin or not.
    if (latest.version === current) return { status: "up-to-date", current };

    // Already downloaded, just not running yet.
    //
    // Pressing "Later" queues the bundle with next() but leaves current() on
    // the old version until a restart. Without this check that reads as a
    // brand-new update on every app open, so the employee is asked to download
    // something already sitting on the phone — repeatedly, and forever, since
    // downloading it again cannot change current().
    const ready = await findUsableBundle(latest.version);
    if (ready) {
      return { status: "ready", current, version: latest.version, bundleId: ready };
    }

    return {
      status: "available",
      current,
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
      notes: latest.comment || undefined,
      sizeBytes: (latest as { sizeBytes?: number }).sizeBytes,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update check failed";
    // The plugin signals "nothing to install" by REJECTING with the server's
    // message, so the happy path arrives here looking like a failure. Belt and
    // braces alongside the server now sending kind:'up_to_date' — an older
    // backend, or any response shape we have not met, must still not tell an
    // employee that being current is an error.
    if (/up[\s-]?to[\s-]?date|no release|no update/i.test(msg)) {
      return { status: "up-to-date", current: "unknown" };
    }
    return { status: "error", message: msg };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Compare two dotted version strings numerically. -1 / 0 / 1.
 *
 * Numeric per SEGMENT, never as strings: "1.10.0" is newer than "1.9.0", but
 * string comparison puts "1.10" before "1.9" and would have told the newest
 * install it was behind. Missing segments count as 0, so "1.6" === "1.6.0".
 * Any non-numeric suffix ("1.6.2-staging") is ignored for ordering, because it
 * marks a channel rather than a position in the sequence.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    String(v).trim().split(/[.\-+]/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  const A = parts(a);
  const B = parts(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * Should `latest` be offered to someone running `current`?
 *
 * The check used to be `latest.version === current` -- pure inequality. That
 * offered an "update" whenever the strings merely DIFFERED, so a rollback to an
 * older bundle, or the same version written differently ("1.6" vs "1.6.0"),
 * prompted an employee to update to something they already had or had
 * deliberately been moved off. An update prompt that appears when you are
 * current is the fastest way to teach people to dismiss update prompts.
 *
 * An unreadable `current` still prompts, unlike the APK path which stays
 * silent. The two are not comparable: an OTA bundle is small, dismissible and
 * reversible, and refusing to offer it would strand a device that cannot report
 * its own version. A mandatory APK can stop someone punching in, so a failed
 * read there must never be treated as "out of date".
 */
export function isNewerVersion(latest: string, current: string): boolean {
  if (!latest) return false;
  if (!current || current === "unknown") return true;
  return compareVersions(latest, current) > 0;
}

/**
 * The id of a locally stored bundle for this version that is ready to activate.
 *
 * This is the authority on "did the download work", rather than any one
 * promise. `pending` is a bundle downloaded but not yet run; `success` is one
 * that has run and called notifyAppReady. Either can be handed to set().
 * Everything else — downloading, error, deleted — is not usable yet.
 */
async function findUsableBundle(version: string): Promise<string | null> {
  try {
    const res = await withTimeout(CapacitorUpdater.list(), 5000, "CapacitorUpdater.list()");
    const match = (res?.bundles ?? []).find(
      (b) => b.version === version && (b.status === "pending" || b.status === "success"),
    );
    return match?.id ?? null;
  } catch {
    // Unreadable store is not the same as "not there"; the caller retries.
    return null;
  }
}

/**
 * Download a bundle, reporting progress.
 *
 * Returns the bundle id needed to apply it. Downloading and applying are kept
 * apart on purpose: the download can happen while the employee carries on
 * working, and only the apply interrupts them.
 */
export async function downloadUpdate(
  update: Extract<UpdateCheck, { status: "available" }>,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true; bundleId: string } | { ok: false; message: string }> {
  if (!isNative()) return { ok: false, message: "Updates are only available in the app." };

  // ── Already here? ─────────────────────────────────────────────────────────
  //
  // autoUpdate is ON, so the plugin fetches new bundles by itself in the
  // background. Asking it to download a version it has already got is the
  // single most likely thing to happen when someone taps Download, and it is
  // what wedged this function twice: the plugin will not start a second
  // download for the same version, so our call never settled — while the
  // progress listener, which filters only on version, happily painted the
  // BACKGROUND download's progress to 100%. A finished download and a frozen
  // dialog, at the same time, for the same bundle.
  const already = await findUsableBundle(update.version);
  if (already) {
    onProgress?.(100);
    return { ok: true, bundleId: already };
  }

  let handle: { remove: () => Promise<void> } | null = null;
  let lastTick = Date.now();
  let lastPercent = -1;

  /*
   * Latched the instant this function decides an outcome, in the `finally`
   * below -- which runs before the returned promise resolves, and therefore
   * before the caller can render anything off the back of it.
   *
   * THIS IS WHAT FIXES THE DIALOG THAT STUCK ON "Downloading 100%".
   *
   * Capgo keeps emitting `download` at 100% after the bundle has already
   * landed, and removing the listener is an async bridge round-trip that we
   * deliberately do not await (see the finally). Events therefore still arrive
   * AFTER we have returned ok -- by which point the caller has painted the
   * "ready / Restart now" state. Forwarding one of them pushed the UI back to
   * "Downloading 100%" with nothing left running to ever move it off again,
   * because this function had already finished. The download itself had
   * succeeded; only the screen lied, which is exactly why force-closing the app
   * "fixed" it, and why every previous attempt here missed.
   *
   * Those attempts all hardened the download's own timing. The download was
   * never what broke. The listener outliving the result was.
   */
  let settled = false;

  try {
    handle = await CapacitorUpdater.addListener("download", (state) => {
      // Past the finish line -- no longer ours to paint.
      if (settled) return;
      if (state?.bundle?.version !== update.version) return;
      const percent = state.percent ?? 0;

      // Only FORWARD progress counts as liveness.
      //
      // This used to reset the stall clock on every event, including repeated
      // ones at the same percent. The plugin keeps emitting at 100% while the
      // bundle never becomes usable in the store, so the watchdog below was
      // refreshed forever, the download promise had already been turned into a
      // never-settling one by its own catch, and the race simply never ended —
      // the UI sat at "Downloading 100%" until the app was killed.
      //
      // Tying the clock to actual progress means a download wedged at 100%
      // trips the stall timeout like any other wedge, and the employee gets an
      // error they can retry instead of a bar that never moves.
      if (percent > lastPercent) {
        lastPercent = percent;
        lastTick = Date.now();
      }

      onProgress?.(percent);
    });

    // ── Two ways to learn we succeeded, and the store is the authority ──────
    //
    // The lesson from three separate hangs here is that a bridge promise is
    // evidence, not proof. So: ask for the download, AND independently watch
    // the bundle store for the version turning up. Whichever proves it first
    // wins, and it does not matter who actually did the downloading — us, or
    // the background auto-updater we are racing.
    const viaDownload: Promise<string | null> = CapacitorUpdater.download({
      url: update.url,
      version: update.version,
      ...(update.checksum ? { checksum: update.checksum } : {}),
    })
      .then((b) => b?.id ?? null)
      // A rejection here must NOT decide the race. The plugin refusing a
      // duplicate download is exactly the case where the store is about to
      // report success, so hand the decision to the watcher below rather than
      // reporting a failure that is not one. The watcher's stall timeout is
      // what guarantees this terminates.
      .catch(() => new Promise<string | null>(() => {}));

    const viaStore: Promise<string | null> = (async () => {
      for (;;) {
        await sleep(1500);
        // The race is already decided -- stop polling. Without this the loop
        // outlives the function for good, waking every 1.5s and eventually
        // throwing its stall error into nothing, minutes after the download
        // actually succeeded.
        if (settled) return null;
        const id = await findUsableBundle(update.version);
        if (id) return id;
        // Silence means no progress events AND nothing in the store. A slow
        // download keeps resetting lastTick, so this only fires when something
        // is genuinely wedged.
        if (Date.now() - lastTick > STALL_MS) {
          throw new Error("The download stopped responding. Please try again.");
        }
      }
    })();
    // Promise.race attaches a rejection handler, but only while the race is
    // live. A stall tripping after viaDownload has already won would otherwise
    // surface as an unhandled rejection; this keeps a handler on it for good.
    void viaStore.catch(() => {});

    const bundleId = await Promise.race([viaDownload, viaStore]);
    if (bundleId) return { ok: true, bundleId };

    // download() resolved without an id. Give the store the last word.
    const fallback = await findUsableBundle(update.version);
    return fallback
      ? { ok: true, bundleId: fallback }
      : { ok: false, message: "The update did not download correctly." };
  } catch (err) {
    // Even a thrown error is not proof of failure — check before reporting one.
    const landed = await findUsableBundle(update.version);
    if (landed) return { ok: true, bundleId: landed };
    return { ok: false, message: err instanceof Error ? err.message : "Download failed" };
  } finally {
    // Latch BEFORE anything else here. A `return` inside the try runs this
    // block first, so by the time the caller's `await` resumes, no further
    // progress event can repaint the screen it is about to render.
    settled = true;
    // NOT awaited. A `return` inside the try runs this first, so awaiting a
    // bridge call here would let a hung teardown discard a download that
    // succeeded — which is exactly what happened once already.
    void handle?.remove().catch(() => {});
  }
}

/**
 * Switch to a downloaded bundle immediately, restarting the WebView.
 *
 * This ends the current session in the app — any half-typed form is gone — so
 * it must only ever run from an explicit "restart now" the employee chose.
 */
export async function applyUpdateNow(bundleId: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await CapacitorUpdater.set({ id: bundleId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Queue a downloaded bundle for the next time the app restarts.
 *
 * The polite option, and the default for anyone who taps "Later": nothing is
 * interrupted, and they get the new version whenever they next open the app.
 */
export async function applyUpdateLater(bundleId: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await CapacitorUpdater.next({ id: bundleId });
    return true;
  } catch {
    return false;
  }
}

// ── prompt bookkeeping ────────────────────────────────────────────────────────

/**
 * Has this exact version already been dismissed?
 *
 * Per-version rather than a global "don't ask again": someone who postpones one
 * update should still be told about the next, and an app that stops mentioning
 * updates entirely because of one dismissal is how devices end up a year behind.
 */
export function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === version;
  } catch {
    return false;
  }
}

export function dismissVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* private mode — they will simply be asked again */
  }
}

export function lastCheckedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Human size for the prompt, so nobody is surprised on mobile data. */
export function formatBytes(n?: number): string | null {
  if (!n || !Number.isFinite(n)) return null;
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
