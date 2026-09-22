import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  available,
  checkAllPermissions,
  type TrackerReadiness,
} from "@/plugins/background-tracker";

// Decides whether this device is actually capable of background tracking, and
// therefore whether the employee may punch in.
//
// The gate exists because the failure it prevents is invisible. An employee
// whose phone has "While using the app" location, or battery optimisation left
// on, can punch in perfectly happily — and then their location silently stops
// the moment the screen locks. Nobody finds out until payroll, when the
// geofence engine has been abstaining for a fortnight and the day never closed.
// Blocking punch-in is intrusive exactly once, on first run; the alternative is
// a quiet failure that costs somebody their hours.
//
// Two things it deliberately does NOT do:
//
//  - It never blocks a device that CANNOT satisfy it. A browser, a PWA, or an
//    APK built before the tracker plugin existed has no way to grant any of
//    this, so gating them would lock out every employee on the current build
//    the moment this ships. Those devices report `applicable: false` and punch
//    in exactly as they do today.
//
//  - It is deliberately UNCONDITIONAL on any capable device -- every employee
//    goes through the same one-time setup, matching the reference app's own
//    behaviour, regardless of whether an admin has separately flipped their
//    per-employee `trackingEnabled` flag (that flag still exists, and still
//    gates whether the native service actually STARTS recording -- see the
//    effect in routes/user/index.tsx -- it just no longer gates whether the
//    permission screen appears). An earlier version made `applicable` depend
//    on `enabled && available()`, which meant an employee whose admin had
//    not yet turned tracking on saw NO gate at all: not "0 requirements
//    satisfied", not the punch-in button blocked -- literally nothing asked,
//    because the effect that would ever populate a step was gated on the
//    same flag as the render condition. Onboarding everyone up front means
//    that whenever an admin later does flip that switch, the permissions are
//    already in place and tracking starts working immediately instead of
//    requiring a fresh, surprising onboarding at that later moment.
//
//  - It never blocks INDEFINITELY on a check that itself cannot get an answer.
//    If the native call fails (old APK mid-rollout, a bridge error, a device
//    that mis-reports plugin availability), the first attempt fails and the
//    gate must not sit at "0 requirements" forever with nothing the employee
//    can do about it -- that is a worse failure than the one this screen
//    exists to prevent. After a failed check it lets punch-in through, and
//    says so, rather than silently claiming nothing is required.
//
//  - It never treats auto-start as verified. No Android API can read the OEM
//    whitelist state, so that step is the employee's own claim.

export type StepId =
  | "precise"
  | "background"
  | "notifications"
  | "activity"
  | "battery"
  | "autostart";

export interface SetupStep {
  id: StepId;
  title: string;
  /** What the employee is actually being asked to do, in their words. */
  detail: string;
  done: boolean;
  /** True when nothing can verify this — the employee confirms it themselves. */
  selfDeclared?: boolean;
}

export interface DeviceIdentity {
  manufacturer: string;
  model: string;
  osVersion: string;
}

export interface TrackingSetup {
  /** False on web/PWA/old APK — such a device is never gated. */
  applicable: boolean;
  loading: boolean;
  steps: SetupStep[];
  /** Every required step satisfied. */
  ready: boolean;
  readiness: TrackerReadiness | null;
  refresh: () => Promise<void>;
  /** The employee's confirmation that they enabled the OEM auto-start screen. */
  confirmAutostart: () => void;
  autostartConfirmed: boolean;
  /**
   * True once a readiness check has been attempted and failed to produce an
   * answer at all (as opposed to producing an answer that says work remains).
   * The gate reads this to fail OPEN — see the file header.
   */
  checkFailed: boolean;
  /**
   * Brand/model/OS version, shown alongside the auto-start step so the
   * employee (and whoever is helping them over the phone) can see exactly
   * which device they're on — auto-start screens differ by OEM and this is
   * the same information that decides which one `openAutostartSettings()`
   * opens. Null until `@capacitor/device` resolves, which is near-instant
   * but still async.
   */
  deviceIdentity: DeviceIdentity | null;
}

/** Per-install, because it is a property of THIS phone, not of the account. */
const AUTOSTART_KEY = "bot_autostart_confirmed";

const readAutostartConfirmed = () => {
  try {
    return localStorage.getItem(AUTOSTART_KEY) === "1";
  } catch {
    // Private mode / blocked storage. Falling back to false means the employee
    // is asked again, which is mildly annoying and always safe.
    return false;
  }
};

export function useTrackingSetup(): TrackingSetup {
  const [readiness, setReadiness] = useState<TrackerReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [autostartConfirmed, setAutostartConfirmed] = useState(readAutostartConfirmed);
  // Distinct from readiness===null-while-loading: this means a check actually
  // RAN and came back with nothing, which must fail open rather than present
  // as "0 requirements, stuck forever".
  const [checkFailed, setCheckFailed] = useState(false);
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);

  // Gate applies whenever the device CAN run the tracker, full stop -- see
  // the file header for why this is no longer also conditioned on the
  // per-employee trackingEnabled flag.
  const applicable = available();

  const refresh = useCallback(async () => {
    if (!applicable) { setLoading(false); return; }
    setLoading(true);
    const r = await checkAllPermissions();
    setReadiness(r);
    setCheckFailed(r === null);
    setLoading(false);
  }, [applicable]);

  useEffect(() => {
    if (!applicable) return;
    void refresh();
  }, [applicable, refresh]);

  // Re-check whenever the app comes back to the foreground. Every one of these
  // settings is changed in a SYSTEM screen, so the app is backgrounded for the
  // whole interaction and returning is the only moment the new state can be
  // observed.
  useEffect(() => {
    if (!applicable) return;
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    let remove: (() => void) | undefined;
    Capacitor.isNativePlatform() &&
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => { if (isActive) void refresh(); })
          .then((h) => { remove = () => void h.remove(); })
          .catch(() => {});
      }).catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      remove?.();
    };
  }, [applicable, refresh]);

  // Device identity for display only -- resolveAutostartIntent() on the
  // native side picks the OEM screen by checking which vendor packages are
  // actually installed, not by reading this string, so a mismatch here never
  // sends anyone to the wrong settings screen. It just lets the employee (and
  // anyone helping them over the phone) see which device they're on.
  useEffect(() => {
    if (!applicable) return;
    let cancelled = false;
    import("@capacitor/device")
      .then(({ Device }) => Device.getInfo())
      .then((info) => {
        if (cancelled) return;
        setDeviceIdentity({
          manufacturer: info.manufacturer || "",
          model: info.model || "",
          osVersion: info.osVersion || "",
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [applicable]);

  const confirmAutostart = useCallback(() => {
    try { localStorage.setItem(AUTOSTART_KEY, "1"); } catch { /* storage blocked */ }
    setAutostartConfirmed(true);
  }, []);

  const steps: SetupStep[] = applicable && readiness
    ? [
        {
          id: "precise",
          title: "Precise location",
          detail:
            "Choose Precise, not Approximate. Approximate rounds your position to about a kilometre, which is far too coarse to tell whether you are at your branch.",
          done: !!readiness.precise,
        },
        {
          id: "background",
          title: 'Location set to "Allow all the time"',
          detail:
            'With "While using the app", Android stops sharing your location seconds after the screen locks — so your attendance stops being recorded the moment you put your phone in your pocket.',
          done: !!readiness.background,
        },
        {
          id: "notifications",
          title: "Notifications",
          detail:
            "Android requires a visible notification while location is being recorded. Blocking it stops the recording itself, not just the message.",
          done: !!readiness.notifications,
        },
        {
          id: "activity",
          title: "Physical activity",
          detail:
            "Lets the app read your phone's motion sensor, so it can tell when you are genuinely still. Without it a phone resting on a desk records a route it never took \u2014 and the distance shows against your name.",
          done: !!readiness.activityRecognition,
        },
        {
          id: "battery",
          title: "Battery set to Unrestricted",
          detail:
            "Battery optimisation freezes the app after a few minutes with the screen off. Unrestricted keeps attendance recording while you work.",
          done: !!readiness.batteryUnrestricted,
        },
        ...(readiness.hasAutostartScreen
          ? [{
              id: "autostart" as StepId,
              title: `Auto-start${readiness.manufacturer ? ` (${readiness.manufacturer})` : ""}`,
              detail:
                "Your phone's manufacturer adds its own restriction on top of Android. Without enabling auto-start here, attendance stops after a restart — and we have no way to check this one, so please confirm once you have switched it on.",
              done: autostartConfirmed,
              selfDeclared: true,
            }]
          : []),
      ]
    : [];

  return {
    applicable,
    loading,
    steps,
    // Fails open in every direction that matters:
    //  - not applicable (device can't run this check at all) -> ready
    //  - the check ran and genuinely could not answer -> ready, rather than
    //    presenting an unmeetable "0 requirements"
    //  - otherwise, every listed step must be done
    ready: !applicable || checkFailed || (steps.length > 0 && steps.every((s) => s.done)),
    readiness,
    refresh,
    confirmAutostart,
    autostartConfirmed,
    checkFailed,
    deviceIdentity,
  };
}
