import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  NativeSettings,
  AndroidSettings,
  IOSSettings,
} from "capacitor-native-settings";

// Unified, platform-aware GPS access for the punch-in / punch-out flow.
//
// On the Capacitor Android APK we use the native @capacitor/geolocation plugin
// (reliable runtime-permission handling) and capacitor-native-settings to deep
// link the user straight to the OS screen where they can enable location.
// In the browser / PWA we fall back to the standard navigator.geolocation API.

export type Coords = { lat: number; lng: number; accuracy: number };

// Why location acquisition failed — drives which help text + settings screen we show.
export type LocationFailureReason =
  | "denied" // permission refused (needs app permission toggle)
  | "unavailable" // device location services / GPS turned off
  | "timeout" // no fix within the timeout window
  | "unsupported"; // no geolocation capability at all

export type LocationResult =
  | { ok: true; coords: Coords }
  | { ok: false; reason: LocationFailureReason; message: string };

const POSITION_OPTS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
} as const;

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatform(): "android" | "ios" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "android" || p === "ios") return p;
    return "web";
  } catch {
    return "web";
  }
}

export type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

// Best-effort read of the current permission state (never prompts the user).
export async function checkLocationPermission(): Promise<PermissionStatus> {
  try {
    if (isNativeApp()) {
      const status = await Geolocation.checkPermissions();
      const s = status.location;
      if (s === "granted") return "granted";
      if (s === "denied") return "denied";
      return "prompt"; // "prompt" | "prompt-with-rationale"
    }
    if (typeof navigator !== "undefined" && navigator.permissions) {
      const res = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      return res.state as PermissionStatus;
    }
    return "unsupported";
  } catch {
    // Unknown — let an actual acquisition attempt decide.
    return "prompt";
  }
}

function mapError(e: unknown): LocationResult {
  const err = e as { code?: number; message?: string };
  // Browser GeolocationPositionError codes.
  if (err && typeof err.code === "number") {
    if (err.code === 1)
      return { ok: false, reason: "denied", message: "Location permission was denied." };
    if (err.code === 2)
      return {
        ok: false,
        reason: "unavailable",
        message: "Location is unavailable. Your device GPS / location services may be turned off.",
      };
    if (err.code === 3)
      return { ok: false, reason: "timeout", message: "Timed out while getting your location." };
  }
  // Native plugin throws string messages instead of codes.
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("denied") || msg.includes("permission"))
    return { ok: false, reason: "denied", message: err?.message || "Location permission was denied." };
  if (
    msg.includes("not enabled") ||
    msg.includes("disabled") ||
    msg.includes("unavailable") ||
    msg.includes("location services")
  )
    return {
      ok: false,
      reason: "unavailable",
      message: err?.message || "Device location services are turned off.",
    };
  if (msg.includes("time"))
    return { ok: false, reason: "timeout", message: err?.message || "Timed out while getting your location." };
  return {
    ok: false,
    reason: "unavailable",
    message: err?.message || "Could not get your location.",
  };
}

// Acquire the current position.
//   silent=true  → only returns a fix if permission is ALREADY granted; never
//                  triggers a permission prompt (used for the passive load fetch).
//   silent=false → actively requests permission (native dialog / browser prompt),
//                  then reads the position (used when the user taps Punch In/Out).
export async function acquirePosition(
  opts: { silent?: boolean } = {}
): Promise<LocationResult> {
  const silent = opts.silent ?? false;
  try {
    if (isNativeApp()) {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        if (silent) {
          return { ok: false, reason: "denied", message: "Permission not granted yet." };
        }
        if (perm.location === "prompt" || perm.location === "prompt-with-rationale") {
          perm = await Geolocation.requestPermissions({ permissions: ["location"] });
        }
      }
      if (perm.location !== "granted") {
        return { ok: false, reason: "denied", message: "Location permission was denied." };
      }
      const pos = await Geolocation.getCurrentPosition(POSITION_OPTS);
      return {
        ok: true,
        coords: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
        },
      };
    }

    // Web / PWA
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { ok: false, reason: "unsupported", message: "Geolocation is not supported by this browser." };
    }
    if (silent) {
      const state = await checkLocationPermission();
      if (state !== "granted") {
        return { ok: false, reason: "denied", message: "Permission not granted yet." };
      }
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, POSITION_OPTS);
    });
    return {
      ok: true,
      coords: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
      },
    };
  } catch (e) {
    return mapError(e);
  }
}

// Deep link into the OS settings screen most relevant to the failure:
//   "unavailable" (GPS off)  → device Location source settings
//   anything else (denied)   → this app's details / permissions page
// Returns false on web (no OS settings to open — caller shows browser steps instead).
export async function openLocationSettings(
  reason?: LocationFailureReason
): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const optionAndroid =
      reason === "unavailable"
        ? AndroidSettings.Location
        : AndroidSettings.ApplicationDetails;
    await NativeSettings.open({
      optionAndroid,
      optionIOS: reason === "unavailable" ? IOSSettings.LocationServices : IOSSettings.App,
    });
    return true;
  } catch {
    return false;
  }
}
