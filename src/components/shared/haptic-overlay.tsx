import { useEffect, useState } from "react";

/**
 * The only way an iPhone still produces a haptic from a web page.
 *
 * BACKGROUND, because this looks absurd without it. iOS has never exposed the
 * Vibration API to web content. Since iOS 17.4 the one exploitable path has been
 * WebKit's native switch control (`<input type="checkbox" switch>`): toggling it
 * plays the system's haptic tick. Until iOS 26.4 a SCRIPTED toggle worked, which
 * is what `lib/haptics.ts` does and what every published library did.
 *
 * **Apple closed that in iOS 26.5.** Only genuine finger contact with the native
 * control fires the Taptic Engine now; a script-dispatched click is ignored. The
 * devices in this fleet report iOS 27, so the programmatic path is already dead
 * for them and no amount of tuning brings it back.
 *
 * What survives is this: put a real, invisible switch control ON the button, so
 * the employee's own finger toggles it. The tap is genuine (`isTrusted`), iOS
 * plays the tick, and because the input sits INSIDE the button the click bubbles
 * on to the button's own handler exactly as before.
 *
 * WHAT THIS CANNOT DO, stated plainly so nobody designs around a fiction:
 *
 *   - It fires when the button is PRESSED, never when the action SUCCEEDS.
 *     Most feedback in this app hangs off the toast (see lib/haptic-toast.ts),
 *     which fires after the server answers. That is precisely the programmatic
 *     case Apple removed, and it cannot be recovered on iOS 26.5+.
 *   - One tick, one intensity. The multi-tick patterns that distinguish
 *     success from error elsewhere do not survive: only the first tick of any
 *     sequence fires.
 *
 * Android and desktop are untouched: this renders NOTHING unless the switch
 * control actually exists, so there is no invisible element over any button on
 * any platform that did not need one. Those platforms keep the real
 * `navigator.vibrate` / Capacitor paths in lib/haptics.ts.
 */

/** Does this browser have WebKit's native switch control at all? */
function supportsSwitchControl(): boolean {
  try {
    if (typeof document === "undefined") return false;
    return "switch" in document.createElement("input");
  } catch {
    return false;
  }
}

export function HapticOverlay({
  /**
   * Corner radius of the button this sits on, as a CSS length.
   *
   * `clip-path` is not decoration. `overflow`/`border-radius` mask only what is
   * PAINTED; the control would still take taps in the square corners outside a
   * rounded button, so a near-miss at the corner would tick without activating
   * the button. Clipping the hit area to the button's real shape removes that.
   */
  radius = "9999px",
  className,
}: {
  radius?: string;
  className?: string;
}) {
  // Detected after mount, never during render: the check touches `document`,
  // and the PWA is prerendered/hydrated in contexts where it does not exist.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(supportsSwitchControl()), []);

  if (!supported) return null;

  return (
    <input
      type="checkbox"
      // React does not know this WebKit attribute; the string form sets it
      // as a plain content attribute, which is what the control reads.
      {...{ switch: "" }}
      aria-hidden="true"
      tabIndex={-1}
      // Deliberately NOT pointer-events:none. The whole mechanism depends on
      // this element receiving the touch itself -- that is the difference
      // between a haptic and no haptic on iOS 26.5+.
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        margin: 0,
        opacity: 0,
        // NO `appearance: none`, and no display/visibility hiding. The haptic is
        // produced by the NATIVE control's activation; stripping its native
        // appearance, or removing it from rendering, removes the tick with it.
        // Transparent-but-rendered is the whole trick.
        clipPath: `inset(0 round ${radius})`,
        cursor: "inherit",
      }}
    />
  );
}

/**
 * True when a real tap can produce a haptic here.
 *
 * Exposed so a caller can decide whether an overlay is worth adding at all,
 * rather than duplicating the feature test.
 */
export function canTapHaptic(): boolean {
  return supportsSwitchControl();
}
