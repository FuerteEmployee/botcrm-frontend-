import { Capacitor } from "@capacitor/core";

// Cross-platform haptic feedback for punch-in/out and similar moments:
// success, error, warning, plus light UI taps (selection/impact).
//
// THE HONEST LIMIT, STATED UP FRONT: iOS has never exposed a way for web
// content to trigger a vibration -- not in Safari, not in a home-screen PWA,
// on any iOS version. This is an Apple platform restriction with no
// workaround from JavaScript; it applies whether or not the page is
// installed to the home screen. So "haptics on iOS PWA" is not achievable as
// literal vibration -- what this file does instead is behave correctly
// EVERYWHERE it can (real native haptics on Capacitor, real vibration on
// Android's web Vibration API) and degrade to a silent no-op on iOS rather
// than throwing or pretending to do something it cannot. If a felt cue is
// wanted specifically on iOS, that has to be visual/audio, not haptic --
// a separate, deliberate addition, not something to fake here.
//
// The file is split into a PURE decision (planHapticFeedback: given a
// feedback type and what the environment can do, decide what to trigger) and
// an IMPURE executor (executeHapticPlan: actually call the platform API).
// Same split as utils/geofence_window.js / geofence_engine.js on the backend,
// and for the same reason: the decision can be tested exhaustively against
// fabricated environments with a plain script, with no device, no browser,
// and no Capacitor runtime required.

export type HapticFeedbackType =
  | "success"
  | "warning"
  | "error"
  | "selection"
  | "impactLight"
  | "impactMedium"
  | "impactHeavy";

/**
 * What CAN this environment actually do. Kept as plain booleans (not "which
 * platform am I on") because that is what the decision genuinely depends on --
 * an Android APK missing the native Haptics plugin (installed before this
 * feature shipped; OTA delivers JS, never native code) must degrade exactly
 * like a browser would, not crash because it assumed the plugin exists.
 */
export interface HapticEnv {
  /** Capacitor.isNativePlatform() AND Capacitor.isPluginAvailable('Haptics'). */
  hasNativeHaptics: boolean;
  /** typeof navigator.vibrate === 'function' -- true on Android Chrome/WebView, always false on iOS. */
  hasVibrate: boolean;
}

export type HapticPlan =
  | { kind: "native-notification"; type: "Success" | "Warning" | "Error" }
  | { kind: "native-impact"; style: "Light" | "Medium" | "Heavy" }
  | { kind: "native-selection" }
  | { kind: "web-vibrate"; pattern: number[] }
  | { kind: "none" };

/**
 * Decide what to trigger. No platform API is touched here -- this is what
 * makes it testable with a plain Node script and zero mocking of
 * Capacitor/navigator.
 *
 * Priority is deliberate: native haptics first (the real Taptic-style
 * feedback), then the web Vibration API (a real buzz, just one actuator, no
 * notification/impact nuance), then nothing. A native app that happens to be
 * missing the Haptics plugin still falls through to web-vibrate, since
 * Android's WebView generally supports the Vibration API too -- it is not an
 * all-or-nothing choice between "full native" and "silent".
 */
export function planHapticFeedback(type: HapticFeedbackType, env: HapticEnv): HapticPlan {
  if (env.hasNativeHaptics) {
    switch (type) {
      case "success":
        return { kind: "native-notification", type: "Success" };
      case "warning":
        return { kind: "native-notification", type: "Warning" };
      case "error":
        return { kind: "native-notification", type: "Error" };
      case "selection":
        return { kind: "native-selection" };
      case "impactLight":
        return { kind: "native-impact", style: "Light" };
      case "impactMedium":
        return { kind: "native-impact", style: "Medium" };
      case "impactHeavy":
        return { kind: "native-impact", style: "Heavy" };
    }
  }

  if (env.hasVibrate) {
    // Patterns are alternating on/off milliseconds. Distinct SHAPES, not just
    // durations, so success and error are still tellable apart with the
    // phone in a pocket: one short buzz reads as "done"; three short buzzes
    // read as "something is wrong" the way a native error haptic does.
    switch (type) {
      case "success":
        return { kind: "web-vibrate", pattern: [15] };
      case "warning":
        return { kind: "web-vibrate", pattern: [20, 40, 20] };
      case "error":
        return { kind: "web-vibrate", pattern: [30, 50, 30, 50, 30] };
      case "selection":
        return { kind: "web-vibrate", pattern: [8] };
      case "impactLight":
        return { kind: "web-vibrate", pattern: [10] };
      case "impactMedium":
        return { kind: "web-vibrate", pattern: [20] };
      case "impactHeavy":
        return { kind: "web-vibrate", pattern: [35] };
    }
  }

  // Neither is available -- iOS Safari/PWA lands here for every type, always.
  return { kind: "none" };
}

/**
 * Execute a plan. Every branch is wrapped so a haptics failure can NEVER
 * throw into the caller: feedback is a nicety layered onto a punch, never a
 * reason the punch itself should appear to fail. Native calls are dynamically
 * imported so a pure-web build (PWA, or any bundle running in a browser tab)
 * never even parses `@capacitor/haptics`'s code, and so it is fetched as a
 * separate chunk only on the devices that will ever use it.
 */
export async function executeHapticPlan(plan: HapticPlan): Promise<void> {
  try {
    switch (plan.kind) {
      case "native-notification": {
        const { Haptics, NotificationType } = await import("@capacitor/haptics");
        await Haptics.notification({ type: NotificationType[plan.type] });
        return;
      }
      case "native-impact": {
        const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
        await Haptics.impact({ style: ImpactStyle[plan.style] });
        return;
      }
      case "native-selection": {
        const { Haptics } = await import("@capacitor/haptics");
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
        return;
      }
      case "web-vibrate":
        navigator.vibrate?.(plan.pattern);
        return;
      case "none":
        return;
    }
  } catch {
    // A haptics failure (plugin missing despite the availability check
    // racing a hot-reload, a native call rejecting, vibrate() throwing in an
    // unfocused iframe) must never be visible to whatever triggered it.
  }
}

/** Read what THIS runtime can actually do, right now. Never throws. */
export function detectHapticEnv(): HapticEnv {
  let hasNativeHaptics = false;
  try {
    hasNativeHaptics = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");
  } catch {
    // Capacitor global unavailable at all -- a plain web bundle.
  }
  return {
    hasNativeHaptics,
    hasVibrate: typeof navigator !== "undefined" && typeof navigator.vibrate === "function",
  };
}

/** The one function most call sites need: decide, then do it, safely. */
export async function haptic(type: HapticFeedbackType): Promise<void> {
  await executeHapticPlan(planHapticFeedback(type, detectHapticEnv()));
}

// Named shorthands matching the vocabulary this was asked for: correct/wrong,
// success/failed.
export const hapticSuccess = () => haptic("success");
export const hapticError = () => haptic("error");
export const hapticWarning = () => haptic("warning");
export const hapticSelection = () => haptic("selection");
