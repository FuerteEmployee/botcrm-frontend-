import { toast } from "sonner";
import { hapticError, hapticSuccess, hapticWarning } from "./haptics";

// Give EVERY action in the app the right haptic, by hanging it off the thing
// that already marks every action: the toast.
//
// The alternative -- a haptic call next to each mutation -- was rejected on
// purpose. Success and failure are reported from ~59 files here, services
// included (several screens don't even import `toast`, because their service
// raises it), so per-call-site wiring would be wrong the moment anyone adds a
// screen, and wrong silently. Patching the three toast entry points once means
// a new screen gets correct feedback without knowing this file exists.
//
// It self-limits to devices that can actually do something: an admin on a
// desktop browser resolves to a no-op plan inside `haptics.ts`, so nothing
// fires and nothing is gated here.
//
// `toast.message`/`.info`/`.custom`/`.promise` are deliberately left alone --
// they are neutral notices, and a buzz for every informational toast is the
// fastest way to make people turn the whole thing off.

let installed = false;

export function installHapticToasts(): void {
  if (installed) return;
  installed = true;

  const wrap = <T extends (...args: never[]) => unknown>(fn: T, feel: () => Promise<void>): T =>
    ((...args: Parameters<T>) => {
      // Fired without awaiting: the toast must render at exactly the moment it
      // would have anyway. A haptic that delays the visible confirmation of a
      // punch is a worse trade than one that lands a frame late.
      void feel();
      return fn(...args);
    }) as unknown as T;

  try {
    toast.success = wrap(toast.success, hapticSuccess);
    toast.error = wrap(toast.error, hapticError);
    toast.warning = wrap(toast.warning, hapticWarning);
  } catch {
    // A future sonner could freeze the object. Losing haptics is acceptable;
    // taking the app down at startup over it is not.
  }
}
