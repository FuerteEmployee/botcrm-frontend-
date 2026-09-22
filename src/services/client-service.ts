import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Admin-facing reads for app-install telemetry: which build each employee runs,
// what permissions they granted, the errors they were shown, and the real login
// history. Written by the app via POST /client/report and /client/error (see
// lib/client-telemetry.ts) — this module never writes.

export type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unavailable"
  | "unknown";

export interface ClientDevice {
  _id: string;
  employeeId: { _id: string; name?: string; phone?: string } | string;
  installId: string;
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  manufacturer: string | null;
  isNative: boolean;
  permissions: {
    location: PermissionState;
    coarseLocation: PermissionState;
    camera: PermissionState;
    notifications: PermissionState;
    backgroundLocation: PermissionState;
    preciseLocation: PermissionState;
    batteryUnrestricted: PermissionState;
    autoStart: PermissionState;
  };
  /**
   * Auto-start was OBSERVED working — the app resumed tracking by itself after
   * a reboot. The difference between a permission the employee says they
   * granted and one we watched function.
   */
  autoStartProven?: boolean;
  /** Setup gate completed at least once. Latches on and is never cleared. */
  trackingSetupComplete?: boolean;
  trackingSetupCompletedAt?: string | null;
  oemHint?: string | null;
  appOpenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * The permissions background tracking actually depends on, in the order the
 * setup gate asks for them.
 *
 * `camera` and `coarseLocation` are deliberately absent: the APK never requests
 * a camera permission, so it is always "unknown" and listing it only sends
 * admins chasing a fault that cannot exist.
 */
export const TRACKING_PERMISSIONS: Array<{
  key: keyof ClientDevice["permissions"];
  label: string;
  /** What to tell the employee when this one is the problem. */
  fix: string;
  /** True when no API can verify it, so 'granted' is the employee's claim. */
  selfDeclared?: boolean;
}> = [
  {
    key: "location",
    label: "Location",
    fix: "Settings → Apps → BOT → Permissions → Location",
  },
  {
    key: "preciseLocation",
    label: "Precise location",
    fix: "In the location permission screen, switch from Approximate to Precise.",
  },
  {
    key: "backgroundLocation",
    label: "Allow all the time",
    fix: "Settings → Apps → BOT → Permissions → Location → Allow all the time. Without this, recording stops when the screen locks.",
  },
  {
    key: "notifications",
    label: "Notifications",
    fix: "Settings → Apps → BOT → Notifications. Android stops the recording itself if this is blocked.",
  },
  {
    key: "batteryUnrestricted",
    label: "Battery unrestricted",
    fix: "Settings → Apps → BOT → Battery → Unrestricted.",
  },
  {
    key: "autoStart",
    label: "Auto-start",
    fix: "Phone manufacturer's security app → Auto-start / Startup manager → enable BOT.",
    selfDeclared: true,
  },
];

export interface ClientError {
  _id: string;
  employeeId: { _id: string; name?: string; phone?: string } | string;
  installId: string | null;
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  message: string;
  kind: "ui" | "network" | "unhandled";
  stack: string | null;
  route: string | null;
  requestUrl: string | null;
  statusCode: number | null;
  occurredAt: string;
  createdAt: string;
}

export interface LoginSession {
  _id: string;
  userId: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  action: "login" | "logout";
  ipAddress: string | null;
  userAgent: string | null;
  appName: string | null;
  installId: string | null;
  appVersion: string | null;
  createdAt: string;
}

/** Every reporting install for the tenant, or just one employee's. */
export function useClientDevices(employeeId?: string) {
  return useQuery<ClientDevice[]>({
    queryKey: ["client-devices", employeeId ?? "all"],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/devices", {
        params: employeeId ? { employeeId } : undefined,
      });
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useClientErrors(employeeId?: string, limit = 50) {
  return useQuery<ClientError[]>({
    queryKey: ["client-errors", employeeId ?? "all", limit],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/errors", {
        params: { ...(employeeId ? { employeeId } : {}), limit },
      });
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useLoginSessions(userId?: string, limit = 50) {
  return useQuery<LoginSession[]>({
    queryKey: ["login-sessions", userId ?? "all", limit],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/sessions", {
        params: { ...(userId ? { userId } : {}), limit },
      });
      return data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Newest install per employee, keyed by employee id — for the employees list,
 * where an employee with a phone and a tablet should show one current build
 * rather than a row per device. Devices arrive sorted lastSeenAt desc, so the
 * first one seen per employee is the newest.
 */
export function latestDeviceByEmployee(devices: ClientDevice[] | undefined) {
  const map = new Map<string, ClientDevice>();
  for (const d of devices ?? []) {
    const id = typeof d.employeeId === "string" ? d.employeeId : d.employeeId?._id;
    if (id && !map.has(id)) map.set(id, d);
  }
  return map;
}

/** Human label for a permission state, for table cells and badges. */
export const PERMISSION_LABELS: Record<PermissionState, string> = {
  granted: "Granted",
  denied: "Denied",
  prompt: "Not asked yet",
  "prompt-with-rationale": "Needs rationale",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

/**
 * Does this state actually stop background tracking?
 *
 * Only states the EMPLOYEE can act on count. `unavailable` and `unknown` mean
 * the app could not READ the setting -- usually because no plugin exists for
 * it -- which is not evidence that anything is wrong.
 *
 * Treating "not granted" as "blocked" is what produced a red "Location will
 * stop when the screen locks" warning on a device where every real permission
 * was granted: `notifications` reports `unavailable` on every build, because
 * nothing installed can query it. An admin then chases a permission the app
 * never asked for, and the warning that means something real gets lost among
 * warnings that never do.
 */
export function isPermissionBlocking(state: PermissionState): boolean {
  return state === "denied" || state === "prompt" || state === "prompt-with-rationale";
}

/** The app cannot read this one. Report it as unverified, never as broken. */
export function isPermissionUnreadable(state: PermissionState): boolean {
  return state === "unavailable" || state === "unknown";
}


// ── Device activity log ───────────────────────────────────────────────────────
//
// Written by the phone (TrackerEventLog.kt), read here. This is the answer to
// "the app is not working": a timeline of the device-state changes that can
// stop background tracking, so a gap in someone's location history can be
// attributed instead of argued about.

export type TrackerEventType =
  | "gps_on" | "gps_off"
  | "network_on" | "network_off"
  | "power_save_on" | "power_save_off"
  | "doze_on" | "doze_off"
  | "airplane_on" | "airplane_off"
  | "service_start" | "service_stop"
  | "task_removed" | "boot_restart" | "watchdog_restart"
  | "permission_lost" | "fg_denied" | "fix_gap"
  | "battery";

export interface TrackerEvent {
  _id: string;
  installId: string | null;
  appVersion: string | null;
  type: TrackerEventType;
  /** Device clock at the moment it happened. */
  at: string;
  /** Server receive time. Far later than `at` means the device was offline. */
  createdAt: string;
  meta: Record<string, string | number | boolean> | null;
  batteryLevel: number | null;
  charging: boolean | null;
}

/**
 * How each event reads to somebody triaging a complaint.
 *
 * `severity` drives colour only, and is about what the event MEANS for
 * tracking, not about how alarming it sounds:
 *
 *   bad     — tracking was stopped or crippled by this
 *   warn    — tracking degraded, or recovered from something that had gone wrong
 *   good    — a return to normal
 *   neutral — context, not a problem
 *
 * A watchdog restart is `warn` rather than `good` even though it is the app
 * fixing itself: the recovery is welcome, but it is also proof the process was
 * killed, and that is the finding.
 */
export const TRACKER_EVENT_META: Record<
  TrackerEventType,
  { label: string; detail: string; severity: "bad" | "warn" | "good" | "neutral" }
> = {
  gps_off:          { label: "GPS turned off",        severity: "bad",     detail: "Location services were switched off on the phone. Nothing can be recorded until they are back on." },
  gps_on:           { label: "GPS turned on",         severity: "good",    detail: "Location services were switched back on." },
  network_off:      { label: "Went offline",          severity: "warn",    detail: "No internet. Fixes are still recorded on the phone and upload when it reconnects." },
  network_on:       { label: "Back online",           severity: "good",    detail: "Internet returned; anything held on the phone is uploaded." },
  airplane_on:      { label: "Airplane mode on",      severity: "warn",    detail: "Deliberately offline. Recording continues locally." },
  airplane_off:     { label: "Airplane mode off",     severity: "good",    detail: "Airplane mode switched off." },
  power_save_on:    { label: "Battery saver on",      severity: "warn",    detail: "Android throttles location while battery saver is on, so fixes arrive further apart." },
  power_save_off:   { label: "Battery saver off",     severity: "good",    detail: "Normal update rate resumes." },
  doze_on:          { label: "Phone idle (Doze)",     severity: "neutral", detail: "The phone was left untouched and the system started deferring background work." },
  doze_off:         { label: "Phone active again",    severity: "neutral", detail: "The phone came out of idle." },
  service_start:    { label: "Tracking started",      severity: "good",    detail: "The background service began recording." },
  service_stop:     { label: "Tracking stopped",      severity: "neutral", detail: "Stopped deliberately — a punch-out, or the app being told to stop." },
  task_removed:     { label: "App swiped away",       severity: "warn",    detail: "The app was closed from recents. Tracking is meant to continue and is restarted automatically." },
  boot_restart:     { label: "Resumed after restart", severity: "good",    detail: "The phone rebooted and tracking came back on its own — which also proves auto-start is enabled." },
  watchdog_restart: { label: "Recovered after kill",  severity: "warn",    detail: "The app had been killed — usually by the phone's battery manager — and was restarted automatically." },
  permission_lost:  { label: "Location permission revoked", severity: "bad", detail: "The location permission was taken away while the employee was on duty. Nothing can be recorded." },
  fg_denied:        { label: "Android blocked tracking",    severity: "bad", detail: "The system refused to let the service run. Usually a notification or battery restriction." },
  fix_gap:          { label: "Gap in recording",      severity: "warn",    detail: "A long silence between fixes. The events around it usually say why." },
  battery:          { label: "Battery",               severity: "neutral", detail: "Charge level sample." },
};

/** An outage derived from a pair of tracker events. */
export interface OutageInterval {
  kind: "network" | "gps" | "airplane";
  /** Null when the outage had already begun before the window we fetched. */
  start: string | null;
  /** Null when it never ended — still down, or the phone stopped reporting. */
  end: string | null;
  /** Null whenever either edge is unknown; never guess a duration. */
  durationMs: number | null;
  startedBeforeWindow: boolean;
  stillOpen: boolean;
}

const OUTAGE_PAIRS: { kind: OutageInterval["kind"]; down: TrackerEventType; up: TrackerEventType }[] = [
  { kind: "network", down: "network_off", up: "network_on" },
  { kind: "gps", down: "gps_off", up: "gps_on" },
  // Inverted on purpose: for airplane mode, switching it ON is the outage.
  { kind: "airplane", down: "airplane_on", up: "airplane_off" },
];

/**
 * Turn raw on/off events into outages with durations.
 *
 * The event list answers "what happened"; an admin explaining a patchy day to a
 * client needs "for how long", and computing that means pairing rows and
 * subtracting — which is exactly the arithmetic nobody does correctly while
 * reading a table.
 *
 * Three edges are deliberately reported as unknown rather than guessed, because
 * a made-up duration in a document shown to a client is worse than a gap:
 *
 *  - an `up` with no preceding `down` means the outage started before the range
 *    we fetched, so there is no start and no duration;
 *  - a trailing `down` means it never came back, OR the phone stopped reporting
 *    entirely — indistinguishable from here, so it gets no end;
 *  - a second `down` with no `up` between is a repeat, not a new outage. The
 *    FIRST one is when it actually went down, so later ones are dropped.
 *
 * Input may be in any order — the API returns newest-first — so this sorts.
 */
export function buildOutageIntervals(events: TrackerEvent[]): OutageInterval[] {
  const ordered = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const out: OutageInterval[] = [];

  for (const { kind, down, up } of OUTAGE_PAIRS) {
    const relevant = ordered.filter((e) => e.type === down || e.type === up);
    let openedAt: string | null = null;
    let seenDown = false;

    for (const e of relevant) {
      if (e.type === down) {
        // Repeat while already down: keep the original start.
        if (!seenDown) {
          openedAt = e.at;
          seenDown = true;
        }
        continue;
      }

      if (!seenDown) {
        // Came back up without us ever seeing it go down.
        out.push({
          kind, start: null, end: e.at, durationMs: null,
          startedBeforeWindow: true, stillOpen: false,
        });
        continue;
      }

      out.push({
        kind,
        start: openedAt,
        end: e.at,
        durationMs: openedAt ? +new Date(e.at) - +new Date(openedAt) : null,
        startedBeforeWindow: false,
        stillOpen: false,
      });
      openedAt = null;
      seenDown = false;
    }

    if (seenDown && openedAt) {
      out.push({
        kind, start: openedAt, end: null, durationMs: null,
        startedBeforeWindow: false, stillOpen: true,
      });
    }
  }

  return out.sort((a, b) => +new Date(b.start ?? b.end ?? 0) - +new Date(a.start ?? a.end ?? 0));
}

/** The event types worth asking the server for when building outages. */
export const OUTAGE_EVENT_TYPES = OUTAGE_PAIRS.flatMap((p) => [p.down, p.up]);

/** A fix that reached the server later than it was taken — i.e. was queued offline. */
export interface HeldFix {
  timestamp: string;
  receivedAt: string;
  lagMs: number;
}

/**
 * Fixes recorded during an outage and delivered afterwards.
 *
 * Counted by when the fix was TAKEN, not when it arrived: the point is "what
 * was happening while the phone was dark", and every one of these arrived after
 * the outage ended by definition.
 */
export function heldFixesWithin(fixes: HeldFix[], start: string | null, end: string | null): number {
  if (!start) return 0;
  const from = +new Date(start);
  // An outage with no recorded end is still counted up to now — the fixes are
  // real whether or not we ever saw the network come back.
  const until = end ? +new Date(end) : Date.now();
  return fixes.filter((f) => {
    const t = +new Date(f.timestamp);
    return t >= from && t <= until;
  }).length;
}

export function useHeldFixes(employeeId?: string, opts?: { from?: string; to?: string }) {
  return useQuery<{ fixes: HeldFix[]; minLagMs: number }>({
    queryKey: ["held-fixes", employeeId ?? "none", opts?.from ?? "", opts?.to ?? ""],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await apiClient.get("/tracking/held-fixes", {
        params: {
          employeeId,
          ...(opts?.from ? { from: opts.from } : {}),
          ...(opts?.to ? { to: opts.to } : {}),
        },
      });
      return data;
    },
  });
}

/**
 * Does this build report diagnostics at all?
 *
 * The tracker event log shipped in 1.5. An older install is not a healthy
 * phone — it is a silent one, and showing an admin an empty timeline for it
 * invites the conclusion that nothing is wrong.
 */
export function reportsDiagnostics(appVersion?: string | null): boolean {
  if (!appVersion) return false;
  const m = /^(\d+)\.(\d+)/.exec(appVersion.trim());
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 1 || (major === 1 && minor >= 5);
}

/** One-line human summary, including whatever detail the phone attached. */
export function describeTrackerEvent(e: TrackerEvent): string {
  const base = TRACKER_EVENT_META[e.type]?.detail ?? "";
  const m = e.meta ?? {};

  if (e.type === "fix_gap" && m.gapMinutes != null) {
    return `No location recorded for ${m.gapMinutes} minute${m.gapMinutes === 1 ? "" : "s"}. ${base}`;
  }
  if (e.type === "watchdog_restart") {
    const killed = m.processWasKilled === true;
    return killed
      ? "The app had been killed by the phone and was restarted automatically. This is the phone's battery manager, not a fault in the app."
      : "The service had stopped responding and was restarted automatically.";
  }
  if (e.type === "network_on" && m.transport) return `Back online over ${m.transport}.`;
  if (e.type === "battery") {
    return e.charging === true ? "Charging." : e.charging === false ? "Running on battery." : base;
  }
  if (e.type === "fg_denied" && m.error) return `${base} (${m.error})`;
  return base;
}

/**
 * One employee's device timeline.
 *
 * `employeeId` is required by the endpoint — a tenant-wide feed of every
 * phone's GPS toggles answers no question anyone actually asks.
 */
export function useTrackerEvents(
  employeeId?: string,
  opts?: { from?: string; to?: string; limit?: number; types?: string[] },
) {
  const types = opts?.types?.length ? [...opts.types].sort().join(",") : "";
  return useQuery<TrackerEvent[]>({
    queryKey: ["tracker-events", employeeId ?? "none", opts?.from ?? "", opts?.to ?? "", opts?.limit ?? 200, types],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await apiClient.get("/client/events", {
        params: {
          employeeId,
          ...(opts?.from ? { from: opts.from } : {}),
          ...(opts?.to ? { to: opts.to } : {}),
          // The server filters server-side and caps at 500, so asking for only
          // the types we need keeps a busy device's outages from being pushed
          // out of the window by routine noise.
          ...(types ? { types } : {}),
          limit: opts?.limit ?? 200,
        },
      });
      return data;
    },
    staleTime: 30 * 1000,
  });
}
