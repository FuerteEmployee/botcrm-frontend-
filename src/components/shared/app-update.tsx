import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CenterModal } from "@/components/shared/center-modal";
import { checkApkUpdate, type ApkStatus } from "@/lib/apk-update";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { haptic, hapticSuccess } from "@/lib/haptics";
import {
  checkForUpdate,
  downloadUpdate,
  applyUpdateNow,
  applyUpdateLater,
  getVersionInfo,
  isDismissed,
  dismissVersion,
  lastCheckedAt,
  formatBytes,
  type UpdateCheck,
  type VersionInfo,
} from "@/lib/app-update";

/**
 * Update UI, shared by the admin panel and the employee portal.
 *
 * Two pieces, because updating has two audiences:
 *
 *   UpdatePrompt    — appears by itself when something is waiting. For the
 *                     people who will never open Settings, which is most of
 *                     them.
 *   AppVersionCard  — the Settings entry. For the one asking "what version are
 *                     you on?", and for anyone who wants to pull an update
 *                     rather than wait to be offered it.
 *
 * Both are no-ops outside the installed app, and neither ever blocks what the
 * person was doing.
 */

// ── shared machine ────────────────────────────────────────────────────────────

type Phase =
  | { k: "idle" }
  | { k: "checking" }
  | { k: "up-to-date"; current: string }
  | { k: "available"; update: Extract<UpdateCheck, { status: "available" }> }
  | { k: "downloading"; update: Extract<UpdateCheck, { status: "available" }>; percent: number }
  | { k: "ready"; version: string; bundleId: string }
  | { k: "error"; message: string }
  | { k: "unsupported" };

function useUpdater() {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  // Set on EVERY mount, not just initialised once.
  //
  // React StrictMode mounts, unmounts and remounts in development, and the
  // cleanup below runs on that simulated unmount. With the flag only
  // initialised at useRef(true) it stayed false from then on, so every state
  // update was discarded and the panel sat on "Checking..." forever while the
  // check underneath had actually completed.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const check = useCallback(async () => {
    setPhase({ k: "checking" });
    const res = await checkForUpdate();
    if (!alive.current) return res;
    if (res.status === "available") setPhase({ k: "available", update: res });
    // Already on the device, only a restart away — go straight to the ready
    // state instead of offering a download that has nothing left to fetch.
    else if (res.status === "ready") setPhase({ k: "ready", version: res.version, bundleId: res.bundleId });
    else if (res.status === "up-to-date") setPhase({ k: "up-to-date", current: res.current });
    else if (res.status === "unsupported") setPhase({ k: "unsupported" });
    else setPhase({ k: "error", message: res.message });
    return res;
  }, []);

  const download = useCallback(async (update: Extract<UpdateCheck, { status: "available" }>) => {
    setPhase({ k: "downloading", update, percent: 0 });

    // Progress may only paint while this download is still the live one.
    //
    // downloadUpdate latches its own listener for the same reason, but the
    // guarantee has to hold independently on this side too: it can also return
    // EARLY, with no listener involved at all, when the bundle was already on
    // disk. A progress callback landing after the terminal setPhase below
    // reinstates the spinner permanently -- "Downloading 100%" with no code
    // left running to clear it, recoverable only by killing the app.
    //
    // Two latches on purpose. This state is unrecoverable from inside the app,
    // so it is worth being certain about rather than economical.
    let done = false;

    const res = await downloadUpdate(update, (percent) => {
      if (done || !alive.current) return;
      setPhase({ k: "downloading", update, percent });
    });
    done = true;
    if (!alive.current) return;
    if (res.ok) setPhase({ k: "ready", version: update.version, bundleId: res.bundleId });
    else setPhase({ k: "error", message: res.message });
  }, []);

  return { phase, setPhase, check, download };
}

function relative(ts: number | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? "" : "s"} ago`;
}

// ── the prompt ────────────────────────────────────────────────────────────────

/**
 * Checks once when the app opens and, if something is waiting, says so.
 *
 * Deliberately NOT a forced update. An employee mid punch-in should not have the
 * app restart under them, so "Later" is a real choice — it still queues the
 * bundle, which then applies whenever they next open the app. Dismissal is
 * remembered per version, so postponing one release does not silence the next.
 *
 * The check runs 4 seconds after mount rather than immediately: the first
 * seconds after launch are already busy with the profile fetch, the attendance
 * fetch and the tracker starting, and an update dialog racing the punch-in
 * button is a good way to get the wrong one tapped.
 */
export function UpdatePrompt() {
  const { phase, setPhase, check, download } = useUpdater();
  const [open, setOpen] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const t = window.setTimeout(async () => {
      const res = await check();
      // Open for something the employee can actually act on: a download to
      // start, or one already finished that just needs the restart. Anything
      // else — up to date, unsupported, a failed check — must not raise a
      // dialog, least of all the "up to date" case.
      const actionable = res.status === "available" || res.status === "ready";
      if (actionable && !isDismissed(res.version)) setOpen(true);
    }, 4000);

    return () => window.clearTimeout(t);
  }, [check]);

  if (!open) return null;

  const update = phase.k === "available" ? phase.update
    : phase.k === "downloading" ? phase.update
    : null;
  const size = update ? formatBytes(update.sizeBytes) : null;

  const close = (remember: boolean) => {
    if (remember && update) dismissVersion(update.version);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      <CenterModal
        zIndex={80}
        labelledBy="app-update-title"
        // Always closable. While a download runs the BACKDROP is inert, so
        // brushing the screen cannot hide progress that is still going, but the
        // X and Escape still work -- an employee who needs the screen back is
        // not held hostage by a download they can restart later.
        dismissOnBackdrop={phase.k !== "downloading"}
        onClose={() => { close(true); setPhase({ k: "idle" }); }}
        footer={
          <div className="flex flex-col gap-2">
            {phase.k === "available" && (
              <Button onClick={() => { void haptic("impactLight"); void download(phase.update); }} className="w-full h-11 rounded-[14px] text-xs font-semibold gap-2">
                <Download className="h-4 w-4" /> Download update
              </Button>
            )}

            {phase.k === "downloading" && (
              <Button disabled className="w-full h-11 rounded-[14px] text-xs font-semibold gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Downloading&hellip;
              </Button>
            )}

            {phase.k === "ready" && (
              <Button
                onClick={() => { void haptic("impactMedium"); void applyUpdateNow(phase.bundleId); }}
                className="w-full h-11 rounded-[14px] text-xs font-semibold gap-2"
              >
                <RefreshCw className="h-4 w-4" /> Restart now
              </Button>
            )}

            {phase.k === "error" && (
              <Button onClick={() => void check()} variant="outline" className="w-full h-11 rounded-[14px] text-xs font-semibold gap-2">
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
            )}

            {phase.k !== "downloading" && (
              <Button
                variant="ghost"
                onClick={async () => {
                  // "Later" still queues it, so the update lands on the next
                  // launch without anyone having to come back and ask for it.
                  if (phase.k === "ready") await applyUpdateLater(phase.bundleId);
                  close(true);
                  setPhase({ k: "idle" });
                }}
                className="w-full h-10 rounded-[14px] text-xs font-semibold text-slate-500"
              >
                {phase.k === "ready" ? "Later (applies on next open)" : "Not now"}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <div className="mx-auto mb-2.5 h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              {phase.k === "ready"
                ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                : <Sparkles className="h-6 w-6 text-primary" />}
            </div>
            <h4 id="app-update-title" className="text-sm font-bold text-slate-800 dark:text-white">
              {phase.k === "ready" ? "Update ready" : "Update available"}
            </h4>
            {update && (
              <p className="text-[10.5px] text-slate-500 mt-1">
                Version {update.version}
                {size && <span className="text-slate-400"> &middot; {size}</span>}
              </p>
            )}
          </div>

          {/* Release notes if the publisher wrote any. A prompt that cannot say
              what changed teaches people to dismiss prompts. */}
          {update?.notes && phase.k !== "ready" && (
            <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 px-3.5 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">What's new</p>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                {update.notes}
              </p>
            </div>
          )}

          {phase.k === "downloading" && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.max(3, phase.percent)}%` }}
                />
              </div>
              <p className="text-[10px] text-center text-slate-400 tabular-nums">
                Downloading {Math.round(phase.percent)}%
              </p>
            </div>
          )}

          {phase.k === "ready" && (
            <p className="text-[11px] text-center leading-relaxed text-slate-500">
              The app will restart to finish. Anything you were typing will be lost, so finish up first
              if you were in the middle of something.
            </p>
          )}

          {phase.k === "error" && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[10.5px] text-destructive leading-relaxed">{phase.message}</p>
            </div>
          )}

        </div>
      </CenterModal>
    </AnimatePresence>
  );
}

// ── the Settings card ─────────────────────────────────────────────────────────

/**
 * Version numbers and a manual check.
 *
 * Shows BOTH versions because they answer different questions and support needs
 * both: the app version is the installed APK and governs what the phone can do
 * natively (background location, crash reporting); the content version is the
 * web bundle and governs the screens and most fixes. Someone can be fully up to
 * date on one and months behind on the other, and a single version number hides
 * exactly that case.
 */
export function AppVersionCard({ className }: { className?: string }) {
  const { phase, check, download } = useUpdater();
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [checked, setChecked] = useState<number | null>(lastCheckedAt());
  const [apk, setApk] = useState<ApkStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void checkApkUpdate(getSession()?.adminId).then((s) => {
      if (alive) setApk(s);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // .catch as well as the timeouts inside getVersionInfo: `info` staying null
    // renders a bare "—" with no explanation, which is exactly the unhelpful
    // state this panel exists to replace.
    void getVersionInfo()
      .then(setInfo)
      .catch((err) =>
        setInfo({
          native: null, nativeBuild: null, bundle: null, isBuiltin: false,
          native_platform: true,
          problem: err instanceof Error ? err.message : "Could not read version information",
        }),
      );
  }, []);

  const busy = phase.k === "checking" || phase.k === "downloading";

  return (
    <div className={cn("rounded-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/50 overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-white/5">
        <Smartphone className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">App version</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/5">
        <Row
          label="App version"
          value={info?.native ? `${info.native}${info.nativeBuild ? ` (build ${info.nativeBuild})` : ""}` : info?.native_platform === false ? "Browser" : "—"}
          hint="The installed app. Changes only when a new APK is installed."
        />
        <Row
          label="Content version"
          value={
            info?.bundle
              ? info.bundle
              : info?.isBuiltin === true
                ? "Bundled with the app"
                : info?.isBuiltin === null
                  ? "Could not read"
                  : "—"
          }
          hint="Screens and fixes. Updates over the air, no reinstall needed."
        />
        <Row label="Last checked" value={relative(checked)} />
      </div>

      {/* A newer APK, always reachable.
          The popup that offers one can be dismissed with "Later", and a
          dismissal is remembered per version — so without a permanent home for
          this, an employee who tapped Later had no way back to the download
          short of clearing app data. This is that way back. */}
      {apk?.release && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                App version {apk.release.versionName} is available
              </p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                {apk.release.mandatory
                  ? "Required — punching stays off until this is installed."
                  : "Opens your browser to download. Tap the file to install."}
              </p>
            </div>
            <Button
              size="sm"
              variant={apk.release.mandatory ? "default" : "outline"}
              className="h-8 shrink-0 gap-1.5 text-[11px]"
              onClick={() => {
                void haptic("impactMedium");
                window.open(apk.release!.url, "_blank", "noopener");
              }}
            >
              <Download className="h-3.5 w-3.5" /> Get app
            </Button>
          </div>
          <p className="mt-2 break-all text-[9.5px] text-slate-400 select-all">
            {apk.release.url}
          </p>
        </div>
      )}

      {info?.problem && (
        <div className="px-5 pt-3">
          <Note tone="bad" icon={AlertCircle}>{info.problem}</Note>
        </div>
      )}

      <div className="px-5 py-4 space-y-3">
        {phase.k === "up-to-date" && (
          <Note tone="good" icon={CheckCircle2}>You're on the latest version.</Note>
        )}
        {phase.k === "unsupported" && (
          <Note tone="muted" icon={AlertCircle}>
            Updates apply to the installed Android app. In a browser, just refresh the page.
          </Note>
        )}
        {phase.k === "error" && phase.message !== info?.problem && (
          <Note tone="bad" icon={AlertCircle}>{phase.message}</Note>
        )}
        {phase.k === "available" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3 space-y-2">
            <p className="text-[11.5px] font-bold text-primary">
              Version {phase.update.version} is available
              {formatBytes(phase.update.sizeBytes) && (
                <span className="font-normal opacity-70"> &middot; {formatBytes(phase.update.sizeBytes)}</span>
              )}
            </p>
            {phase.update.notes && (
              <p className="text-[10.5px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                {phase.update.notes}
              </p>
            )}
            <Button size="sm" onClick={() => { void haptic("impactLight"); void download(phase.update); }} className="h-8 text-[11px] gap-1.5 rounded-lg">
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </div>
        )}
        {phase.k === "downloading" && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(3, phase.percent)}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 tabular-nums">Downloading {Math.round(phase.percent)}%</p>
          </div>
        )}
        {phase.k === "ready" && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 space-y-2">
            <p className="text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400">
              Version {phase.version} is ready
            </p>
            <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Restart to finish, or leave it and it will apply the next time you open the app.
            </p>
            <Button size="sm" onClick={() => { void haptic("impactMedium"); void applyUpdateNow(phase.bundleId); }} className="h-8 text-[11px] gap-1.5 rounded-lg">
              <RefreshCw className="h-3.5 w-3.5" /> Restart now
            </Button>
          </div>
        )}

        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => { void haptic("impactLight"); const r = await check(); setChecked(Date.now()); if (r.status === "available") void hapticSuccess(); }}
          className="w-full h-10 rounded-[14px] text-xs font-semibold gap-2"
        >
          {phase.k === "checking"
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking&hellip;</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Check for updates</>}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">{label}</p>
        {hint && <p className="text-[9.5px] text-slate-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-semibold">{value}</Badge>
    </div>
  );
}

function Note({
  tone, icon: Icon, children,
}: { tone: "good" | "bad" | "muted"; icon: React.ElementType; children: React.ReactNode }) {
  const cls = {
    good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bad: "border-destructive/20 bg-destructive/10 text-destructive",
    muted: "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500",
  }[tone];

  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-3.5 py-2.5", cls)}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <p className="text-[10.5px] leading-relaxed">{children}</p>
    </div>
  );
}
