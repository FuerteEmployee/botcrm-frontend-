import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Device } from "@capacitor/device";
import { Geolocation } from "@capacitor/geolocation";
import { apiClient, setNetworkErrorReporter } from "./api-client";
import { getSession } from "./auth";

// Reports which build each employee is actually running, what permissions they
// granted, and the errors they were shown — so the team can fix what users hit
// rather than what reproduces in the office.
//
// Every platform call here is individually guarded. @capacitor/app's getInfo()
// is native-only and throws outright in a browser, and permission APIs vary by
// Android WebView version, so a single unguarded call would break the whole
// report on some devices. Anything we can't read stays "unknown" rather than
// being guessed as denied — an admin chasing a permission the APK never asked
// for is worse than an admin seeing a blank.

const INSTALL_ID_KEY = "bot_install_id";
const REPORT_THROTTLE_MS = 10 * 60 * 1000;

type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unavailable"
  | "unknown";

export interface ClientInfo {
  installId: string;
  appVersion: string | null;
  appBuild: string | null;
  platform: string;
  osVersion: string | null;
  deviceModel: string | null;
  manufacturer: string | null;
  isNative: boolean;
  permissions: {
    location: PermissionState;
    coarseLocation: PermissionState;
    camera: PermissionState;
    notifications: PermissionState;
  };
}

/**
 * Stable per-install id. Deliberately app-generated rather than a hardware id:
 * reading a real device identifier needs privileged permissions on modern
 * Android and isn't necessary to answer "which install is on which build".
 * A reinstall or cleared storage mints a new one, which correctly reads as a
 * new install.
 */
export function getInstallId(): string {
  try {
    const existing = window.localStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(INSTALL_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage disabled — a per-tab id still lets errors be
    // grouped within this session even though it won't persist.
    return `ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function readLocationPermissions(): Promise<{
  location: PermissionState;
  coarseLocation: PermissionState;
}> {
  try {
    const res = await Geolocation.checkPermissions();
    return {
      location: (res.location as PermissionState) ?? "unknown",
      coarseLocation: (res.coarseLocation as PermissionState) ?? "unknown",
    };
  } catch {
    return { location: "unknown", coarseLocation: "unknown" };
  }
}

async function readCameraPermission(): Promise<PermissionState> {
  // No camera plugin is installed, so there's no native state to query. The web
  // Permissions API is the only signal available and is itself optional — some
  // Android WebViews reject the 'camera' name entirely.
  try {
    const anyNav = navigator as any;
    if (!anyNav.permissions?.query) return "unknown";
    const status = await anyNav.permissions.query({ name: "camera" });
    if (status.state === "prompt") return "prompt";
    return (status.state as PermissionState) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readNotificationPermission(): PermissionState {
  try {
    if (typeof Notification === "undefined") return "unavailable";
    if (Notification.permission === "default") return "prompt";
    return Notification.permission as PermissionState;
  } catch {
    return "unknown";
  }
}

export async function collectClientInfo(): Promise<ClientInfo> {
  const isNative = Capacitor.isNativePlatform();

  let appVersion: string | null = null;
  let appBuild: string | null = null;
  if (isNative) {
    // Native-only: throws "not implemented" on web, hence the platform guard
    // rather than relying on the catch.
    try {
      const info = await App.getInfo();
      appVersion = info.version ?? null;
      appBuild = info.build ?? null;
    } catch {
      /* leave null — a build that can't self-identify still reports the rest */
    }
  }

  let osVersion: string | null = null;
  let deviceModel: string | null = null;
  let manufacturer: string | null = null;
  try {
    const d = await Device.getInfo();
    osVersion = d.osVersion ?? null;
    deviceModel = d.model ?? null;
    manufacturer = d.manufacturer ?? null;
  } catch {
    /* ignore */
  }

  const [loc, camera] = await Promise.all([readLocationPermissions(), readCameraPermission()]);

  return {
    installId: getInstallId(),
    appVersion,
    appBuild,
    platform: Capacitor.getPlatform(),
    osVersion,
    deviceModel,
    manufacturer,
    isNative,
    permissions: {
      location: loc.location,
      coarseLocation: loc.coarseLocation,
      camera,
      notifications: readNotificationPermission(),
    },
  };
}

let lastReportAt = 0;
let cachedInfo: ClientInfo | null = null;

/**
 * Send the current build + permission state. Throttled because this fires on
 * every app resume, and an employee switching apps repeatedly shouldn't
 * generate a request per switch. `force` bypasses it for login, where the row
 * needs to exist immediately.
 */
export async function reportClient(force = false): Promise<void> {
  if (!getSession()?.token) return; // the route needs the employee's own JWT
  if (!force && Date.now() - lastReportAt < REPORT_THROTTLE_MS) return;

  try {
    const info = await collectClientInfo();
    cachedInfo = info;
    await apiClient.post("/client/report", info);
    lastReportAt = Date.now();
  } catch {
    // Never surface a telemetry failure to the employee — it isn't their
    // problem and there is nothing for them to do about it.
  }
}

// Collapse repeats so one crash loop doesn't fill the log with the same line.
// The server rate-limits too; this just avoids making the request at all.
const recentErrors = new Map<string, number>();
const ERROR_DEDUPE_MS = 60 * 1000;
let reportingError = false;

export interface ReportedError {
  message: string;
  kind?: "ui" | "network" | "unhandled";
  stack?: string | null;
  route?: string | null;
  requestUrl?: string | null;
  statusCode?: number | null;
}

export async function reportClientError(err: ReportedError): Promise<void> {
  if (!getSession()?.token) return;
  const message = (err.message || "").trim();
  if (!message) return;

  // A failing error-report request must not itself be reported, or one network
  // fault becomes an infinite loop.
  if (reportingError) return;

  const key = `${err.kind || "unhandled"}|${message.slice(0, 200)}`;
  const now = Date.now();
  const seen = recentErrors.get(key);
  if (seen && now - seen < ERROR_DEDUPE_MS) return;
  recentErrors.set(key, now);
  if (recentErrors.size > 200) recentErrors.clear();

  reportingError = true;
  try {
    await apiClient.post("/client/error", {
      installId: getInstallId(),
      appVersion: cachedInfo?.appVersion ?? null,
      appBuild: cachedInfo?.appBuild ?? null,
      platform: Capacitor.getPlatform(),
      message: message.slice(0, 2000),
      kind: err.kind || "unhandled",
      stack: err.stack ? String(err.stack).slice(0, 8000) : null,
      route: err.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      requestUrl: err.requestUrl ?? null,
      statusCode: err.statusCode ?? null,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    /* swallow */
  } finally {
    reportingError = false;
  }
}

let initialised = false;

/**
 * Wire up reporting. Safe to call once at startup before anyone has logged in —
 * both senders no-op without a session, and the auth-change listener picks up
 * the login when it happens.
 */
export function initClientTelemetry(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  // Failed API calls, reported from the axios interceptor via this callback.
  setNetworkErrorReporter(({ message, requestUrl, statusCode }) => {
    void reportClientError({ message, kind: "network", requestUrl, statusCode });
  });

  window.addEventListener("error", (event) => {
    void reportClientError({
      message: event.message || "Unhandled error",
      kind: "unhandled",
      stack: event.error?.stack ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    void reportClientError({
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      kind: "unhandled",
      stack: reason?.stack ?? null,
    });
  });

  // Report on login (and re-report on account switch).
  window.addEventListener("bot-auth-change", () => {
    void reportClient(true);
  });

  // Re-report when the app comes back to the foreground, so permission changes
  // made in Android settings while the app was backgrounded are picked up.
  if (Capacitor.isNativePlatform()) {
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void reportClient();
    }).catch(() => {});
  } else {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void reportClient();
    });
  }

  void reportClient(true);
}
