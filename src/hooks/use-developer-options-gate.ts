import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { available, isDeveloperOptionsEnabled } from "@/plugins/background-tracker";

// Blocks the ENTIRE employee app -- not just punch-in -- while Android
// Developer Options is switched on.
//
// Developer Options is the prerequisite for GPS mocking: with it on, an
// employee can install a mock-location app and make every punch, every
// tracked fix, and every geofence decision believe they are wherever they
// choose. `@capacitor/geolocation` (what the punch buttons use) wraps the
// standard web Geolocation shape and has no way to tell a mocked fix from a
// real one -- so this is a coarse, blunt, but real precondition we CAN check:
// if the switch that makes spoofing possible is off, spoofing isn't happening
// through it.
//
// This is deliberately a HARD block, not a warning: the whole employee app is
// unusable -- not merely punch-in -- until the setting is off, checked again
// on mount and every time the app returns from the background (a system
// Settings screen backgrounds this app for the whole interaction, so return
// is the only moment the new state is observable).
//
// Same "never block what cannot be checked" rule as the tracking setup gate:
// a browser, a PWA, or any APK built before this plugin existed has no way to
// read this setting at all, so those report `applicable: false` and are never
// blocked by it.

export interface DeveloperOptionsGate {
  /** False on web/PWA/old APK -- such a device is never gated by this check. */
  applicable: boolean;
  /** True once the first check has resolved. Avoids a flash of either state. */
  checked: boolean;
  /** True while Developer Options is on -- the app must show nothing else. */
  blocked: boolean;
  refresh: () => Promise<void>;
}

export function useDeveloperOptionsGate(): DeveloperOptionsGate {
  const applicable = available();
  const [checked, setChecked] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const check = useCallback(async () => {
    if (!applicable) {
      setBlocked(false);
      setChecked(true);
      return;
    }
    const enabled = await isDeveloperOptionsEnabled();
    setBlocked(enabled);
    setChecked(true);
  }, [applicable]);

  useEffect(() => {
    void check();
  }, [check]);

  // Re-check whenever the app returns to the foreground -- the only moment a
  // change made in system Settings becomes observable.
  useEffect(() => {
    if (!applicable) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    let remove: (() => void) | undefined;
    Capacitor.isNativePlatform() &&
      import("@capacitor/app")
        .then(({ App }) => {
          App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void check();
          })
            .then((h) => {
              remove = () => void h.remove();
            })
            .catch(() => {});
        })
        .catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      remove?.();
    };
  }, [applicable, check]);

  return { applicable, checked, blocked, refresh: check };
}
