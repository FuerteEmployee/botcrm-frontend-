import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native Android foreground service that keeps recording GPS
// after the app is closed and swiped out of recents.
//
// THE GUARD IS THE POINT OF THIS FILE.
//
// We ship web bundles over the air via @capgo/capacitor-updater, but OTA
// carries JavaScript only -- a native plugin exists only in a newly installed
// APK. So the moment this module ships, it lands on every employee's phone,
// including the ones still running the June build with no such plugin
// compiled in. Calling straight through would throw on those handsets and
// break punch-in, which currently works fine for them.
//
// Hence: every call goes through `available()`, and every failure degrades to
// the existing in-app tracker rather than surfacing as an error. An employee on
// an old APK must keep working exactly as they do today, silently.

export interface TrackerStatus {
  active: boolean;
  /**
   * Rows still waiting in the device's offline queue.
   *
   * -1 means NOT YET KNOWN, not "empty". getStatus() resolves immediately with
   * a placeholder rather than blocking the Capacitor bridge thread on a SQLite
   * read, and the true count arrives moments later on the `trackerStatus`
   * event. Render -1 as "checking", never as zero -- reporting an unknown
   * backlog as empty is how a device that has been failing to upload for hours
   * looks perfectly healthy.
   */
  queued: number;
  /** Epoch milliseconds, not an ISO string -- the native side sends a Long. */
  lastFixAt: number | null;
  permissionState: "granted" | "denied" | "partial" | "unknown";
}

/**
 * Everything the setup gate needs, read WITHOUT prompting.
 *
 * `autoStart` is absent on purpose: no Android API can read the OEM whitelist,
 * so it is the employee's own claim and lives in the hook, not here. A field
 * that looks like a reading but is really a guess is worse than no field.
 */
export interface TrackerReadiness {
  fine: boolean;
  coarse: boolean;
  /** False when the user granted "Approximate" — useless for a geofence. */
  precise: boolean;
  background: boolean;
  notifications: boolean;
  batteryUnrestricted: boolean;
  /**
   * Physical-activity permission. Lets the tracker read the accelerometer and
   * tell a phone standing still from one whose GPS is drifting.
   *
   * Optional in the sense that refusing it costs route accuracy, not
   * attendance -- but it is the difference between a desk phone logging 0 km
   * and logging 11.
   */
  activityRecognition: boolean;
  locationState: "always" | "foreground" | "denied";
  manufacturer: string;
  /** Whether this OEM has an auto-start screen worth sending the user to. */
  hasAutostartScreen: boolean;
  /**
   * Has the app ever actually resumed tracking after a device reboot?
   *
   * The only real evidence that OEM auto-start is enabled. No Android API
   * exposes that setting, so the alternative is asking the employee — and an
   * admin reading "granted" wants to know whether that was observed or merely
   * claimed. Absent on builds older than 1.5.
   */
  autostartProven?: boolean;
  /** Epoch ms of that reboot recovery, 0 if it has never happened. */
  lastBootRestartAt?: number;
}

export interface TrackerPermissions {
  fine: string;
  background: string;
  notifications: string;
}

export interface StartOptions {
  token: string;
  apiBase: string;
  employeeId: string;
  sessionId?: string;
  /**
   * The web layer's install id, handed to native so the device event log and
   * the device row describe the same install. Optional: an older native build
   * ignores it, and a missing one only costs the events their device grouping.
   */
  installId?: string;
}

export interface NativeCrash {
  /** Epoch ms at which the process died. */
  at: number;
  thread: string;
  /** Fully-qualified Throwable class, e.g. android.app.RemoteServiceException. */
  type: string;
  message: string;
  stack: string;
}

interface BackgroundTrackerPlugin {
  start(options: StartOptions): Promise<{ started: boolean }>;
  getLastCrash(): Promise<{ crash: NativeCrash | null }>;
  stop(): Promise<void>;
  getStatus(): Promise<TrackerStatus>;
  requestPermissions(): Promise<TrackerPermissions>;
  checkAllPermissions(): Promise<TrackerReadiness>;
  isDeveloperOptionsEnabled(): Promise<{ enabled: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  openAutostartSettings(): Promise<void>;
  openAppDetailsSettings(): Promise<void>;
  addListener(
    event: "trackerStatus",
    cb: (status: TrackerStatus) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Native = registerPlugin<BackgroundTrackerPlugin>("BackgroundTracker");

/**
 * Is the native service actually present on THIS device?
 *
 * Both halves matter. `isNativePlatform` excludes the browser and the PWA;
 * `isPluginAvailable` excludes a native build that predates the plugin, which
 * is the case that OTA creates and the one that would otherwise crash.
 */
export function available(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundTracker");
  } catch {
    return false;
  }
}

/**
 * Start background tracking. Resolves false when it could not start, for any
 * reason -- old APK, permission refused, plugin error.
 *
 * Never throws. The caller is a punch-in flow, and background tracking failing
 * must not stop somebody recording their attendance.
 */
export async function startBackgroundTracking(opts: StartOptions): Promise<boolean> {
  if (!available()) return false;
  try {
    const res = await Native.start(opts);
    // `started` now means the service CONFIRMED it is up, not merely that the
    // start was dispatched -- see BackgroundTrackerPlugin.start(). A false here
    // is a real failure on a build that has the plugin, and the caller must
    // treat it as "not tracking" rather than as "use the web fallback and carry
    // on", because the web tracker stops the moment the WebView is suspended.
    const started = !!res?.started;
    if (!started) {
      console.warn("[bg-tracker] native service did not come up");
      reportTrackerIssue("native background tracker did not start");
    }
    return started;
  } catch (err) {
    console.warn("[bg-tracker] start failed:", err);
    reportTrackerIssue(`native background tracker threw: ${String((err as Error)?.message || err)}`);
    return false;
  }
}

/**
 * Surface a tracker start failure where somebody will actually see it.
 *
 * The native side records its own `start_failed` event, but that only reaches
 * the server when the service is alive enough to flush its queue -- which is
 * exactly what is in doubt here. This is the independent path: it goes through
 * the ordinary client-error channel, so a device that cannot track still says
 * so from the web layer.
 *
 * Imported lazily because client-telemetry pulls in apiClient, and this module
 * is imported by the punch screen at load; a static import would drag the axios
 * instance into that chunk for a path that almost never runs.
 */
function reportTrackerIssue(message: string) {
  void import("@/lib/client-telemetry")
    .then((m) => m.reportClientError?.({ kind: "tracker", message }))
    .catch(() => {
      /* telemetry must never break a punch */
    });
}

export async function stopBackgroundTracking(): Promise<void> {
  if (!available()) return;
  try {
    await Native.stop();
  } catch (err) {
    console.warn("[bg-tracker] stop failed:", err);
  }
}

/**
 * The stack trace of the last fatal NATIVE crash, or null.
 *
 * Native crashes are invisible to every other channel we have: the system kills
 * the process, so window.onerror never fires and no request is ever made. This
 * is the only way one is ever seen. Reading it clears it.
 */
export async function getLastNativeCrash(): Promise<NativeCrash | null> {
  if (!available()) return null;
  try {
    const res = await Native.getLastCrash();
    return res?.crash ?? null;
  } catch {
    // An older APK has no such method. Nothing to report, and certainly nothing
    // worth surfacing at startup.
    return null;
  }
}

export async function getTrackerStatus(): Promise<TrackerStatus | null> {
  if (!available()) return null;
  try {
    return await Native.getStatus();
  } catch {
    return null;
  }
}

/**
 * Ask for the permissions the service needs.
 *
 * Android requires these in a strict ORDER, and asking out of order fails
 * silently: background location can only be requested once foreground location
 * is already granted, and requesting it first simply returns denied without
 * showing the user anything. The native side owns that sequencing -- this is
 * one call so the order cannot be got wrong from here.
 */
export async function requestTrackerPermissions(): Promise<TrackerPermissions | null> {
  if (!available()) return null;
  try {
    return await Native.requestPermissions();
  } catch (err) {
    console.warn("[bg-tracker] permission request failed:", err);
    return null;
  }
}

/**
 * Subscribe to status pushes from the native service.
 *
 * This is the only way to learn the real queue depth: getStatus() cannot read
 * SQLite without blocking the bridge, so it answers -1 and the service emits
 * the true figure here a moment later.
 *
 * Returns a no-op unsubscribe when the plugin is unavailable, so callers can
 * always call it in a cleanup without checking first.
 */
export async function onTrackerStatus(
  cb: (status: TrackerStatus) => void,
): Promise<() => void> {
  if (!available()) return () => {};
  try {
    const handle = await Native.addListener("trackerStatus", cb);
    return () => { void handle.remove(); };
  } catch {
    return () => {};
  }
}

/**
 * Read every readiness signal without prompting.
 *
 * Deliberately NOT requestPermissions(): the setup screen re-checks each time
 * the app returns to the foreground, and using the requesting variant to read
 * state would re-prompt on every poll. On Android 11+ that burns the user's two
 * "deny" strikes and permanently blocks the dialog — turning a fixable setup
 * into an unfixable one.
 */
export async function checkAllPermissions(): Promise<TrackerReadiness | null> {
  if (!available()) return null;
  try {
    return await Native.checkAllPermissions();
  } catch (err) {
    console.warn("[bg-tracker] permission check failed:", err);
    return null;
  }
}

export async function isDeveloperOptionsEnabled(): Promise<boolean> {
  if (!available()) return false;
  try {
    const res = await Native.isDeveloperOptionsEnabled();
    return !!res?.enabled;
  } catch (err) {
    console.warn("[bg-tracker] dev options check failed:", err);
    return false;
  }
}

export async function openBatterySettings(): Promise<void> {
  if (!available()) return;
  try { await Native.requestIgnoreBatteryOptimizations(); } catch { /* no settings screen */ }
}

export async function openAutostartSettings(): Promise<void> {
  if (!available()) return;
  try { await Native.openAutostartSettings(); } catch { /* no settings screen */ }
}

export async function openAppSettings(): Promise<void> {
  if (!available()) return;
  try { await Native.openAppDetailsSettings(); } catch { /* no settings screen */ }
}
