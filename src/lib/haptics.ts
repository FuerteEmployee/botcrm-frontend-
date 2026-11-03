import { Capacitor } from "@capacitor/core";

// Cross-platform haptic feedback for punch-in/out and similar moments:
// success, error, warning, plus light UI taps (selection/impact).
//
// THE iOS SITUATION, STATED HONESTLY. iOS has never exposed the Vibration API
// (`navigator.vibrate`) to web content -- not in Safari, not in a home-screen
// PWA, on any version. There is exactly ONE way to make an iPhone produce a
// haptic from a web page, and it is indirect: since iOS 17.4, toggling a
// native switch control (`<input type="checkbox" switch>`) plays the system's
// own haptic tick. So the app keeps a hidden switch in the DOM and flips it.
//
// !! APPLE CLOSED THE PROGRAMMATIC PATH IN iOS 26.5 !!
//
// A script-dispatched toggle is now ignored; only genuine finger contact with
// the control fires the Taptic Engine. Everything below the `ios-switch` plan
// therefore does NOTHING on iOS 26.5 and later, which includes every iPhone in
// this fleet (they report iOS 27). It is kept because it still works on
// 17.4-26.4 and costs nothing when it does not -- not because it is expected to
// fire on a current device.
//
// The surviving technique needs the tap itself, so it cannot live behind a
// function call like this one: see components/shared/haptic-overlay.tsx, which
// puts a real invisible switch ON a button. That also means feedback tied to an
// OUTCOME -- the success haptic that rides on a toast after the server answers
// -- is simply not recoverable on current iOS. Pressing can be felt; succeeding
// cannot.
//
// Be clear about what that does and does not buy:
//   - It is ONE fixed tick. iOS gives no way to choose intensity or to play
//     the distinct success/warning/error notification haptics that a real
//     native app gets through UIFeedbackGenerator. Feedback types are
//     therefore distinguished by REPEATING the tick (1 / 2 / 3), which is a
//     cruder signal than the Android path gets, but is genuinely felt.
//   - It needs iOS 17.4+. Older iPhones fall through to silence, as before.
//   - It is an undocumented side effect of a UI control, not an API Apple
//     offers for this. Apple could remove it in any release. It is
//     feature-detected (never version-sniffed) and every failure is swallowed,
//     so the day it stops working the app degrades to silence rather than
//     breaking a punch.
//
// Full parity with Android (true notification haptics, real intensity) needs a
// genuine native iOS build via Capacitor -- a Mac, Xcode, and an Apple
// Developer account -- not a PWA. That is a separate decision, not something
// this file can fake.
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
  /**
   * iOS 17.4+ Safari/PWA: `<input type="checkbox" switch>` is supported, so
   * toggling one produces the system haptic tick. Feature-detected via the
   * reflected IDL property, never by sniffing the iOS version -- the day
   * Apple ships this elsewhere, or drops it, detection stays correct.
   */
  hasIosSwitchHaptic: boolean;
}

export type HapticPlan =
  | { kind: "native-notification"; type: "Success" | "Warning" | "Error" }
  | { kind: "native-impact"; style: "Light" | "Medium" | "Heavy" }
  | { kind: "native-selection" }
  | { kind: "web-vibrate"; pattern: number[] }
  /**
   * Flip a hidden iOS switch control `ticks` times, `gapMs` apart. Only one
   * tick strength exists, so count is the ONLY way to tell types apart.
   */
  | { kind: "ios-switch"; ticks: number; gapMs: number }
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

  if (env.hasIosSwitchHaptic) {
    // One tick is all iOS gives a web page, so meaning has to come from the
    // COUNT: 1 = done, 2 = careful, 3 = wrong. Deliberately mirrors the shape
    // of the web-vibrate patterns above so the two platforms teach the same
    // vocabulary -- an employee who learns "three buzzes means it failed" on
    // Android reads three ticks the same way on an iPhone.
    //
    // gapMs is what makes a double and a triple readable as distinct rather
    // than as one long blur. Below ~60ms iOS coalesces them; much above
    // ~120ms they stop feeling like a single signal.
    switch (type) {
      case "success":
        return { kind: "ios-switch", ticks: 1, gapMs: 90 };
      case "warning":
        return { kind: "ios-switch", ticks: 2, gapMs: 90 };
      case "error":
        return { kind: "ios-switch", ticks: 3, gapMs: 90 };
      case "selection":
      case "impactLight":
      case "impactMedium":
      case "impactHeavy":
        // No intensity control exists on this path -- pretending otherwise by
        // stacking ticks would turn a light UI tap into a notification-sized
        // event, which is worse than an honest single tick.
        return { kind: "ios-switch", ticks: 1, gapMs: 90 };
    }
  }

  // Nothing is available -- pre-17.4 iOS, and any browser without vibration.
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
      case "ios-switch":
        await tickIosSwitch(plan.ticks, plan.gapMs);
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

/**
 * The hidden switch iOS taps for us.
 *
 * Created once and LEFT IN THE DOM: iOS plays the haptic as part of rendering
 * the control's state change, so an element created and removed around each
 * click gets no chance to produce one. It must also stay genuinely rendered --
 * `display:none` / `visibility:hidden` suppress the haptic along with the
 * control -- hence off-screen and transparent rather than hidden, with
 * pointer-events and the tab order explicitly given up so an invisible
 * checkbox can never take a tap or a keyboard focus from the real UI.
 */
let iosSwitch: HTMLInputElement | null = null;

function getIosSwitch(): HTMLInputElement | null {
  if (typeof document === "undefined") return null;
  if (iosSwitch?.isConnected) return iosSwitch;

  const el = document.createElement("input");
  el.type = "checkbox";
  el.setAttribute("switch", "");
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  iosSwitch = el;
  return el;
}

async function tickIosSwitch(ticks: number, gapMs: number): Promise<void> {
  const el = getIosSwitch();
  if (!el) return;
  for (let i = 0; i < ticks; i++) {
    // .click() rather than setting .checked: the haptic rides on the control's
    // activation behaviour, which assigning the property does not trigger.
    el.click();
    if (i < ticks - 1) await new Promise((r) => setTimeout(r, gapMs));
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

  let hasIosSwitchHaptic = false;
  try {
    // Supported browsers reflect the content attribute as an IDL property on
    // HTMLInputElement; everything else simply does not have the key.
    hasIosSwitchHaptic =
      typeof document !== "undefined" && "switch" in document.createElement("input");
  } catch {
    // No DOM (SSR, a worker, this file under a bare Node test runner).
  }

  return {
    hasNativeHaptics,
    hasVibrate: typeof navigator !== "undefined" && typeof navigator.vibrate === "function",
    hasIosSwitchHaptic,
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
