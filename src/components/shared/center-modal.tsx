import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * A centred modal that cannot be clipped by the app shell.
 *
 * Three things here are load-bearing, and each was a real bug:
 *
 *  1. PORTALLED TO document.body. Both prompts used to render inside
 *     `<main>`, which sits in the employee shell's flex column next to the
 *     bottom nav. An ancestor there establishes a stacking context, so the
 *     modal's z-index was resolved INSIDE it and the nav (a sibling of
 *     `<main>`) painted over the modal's footer — the buttons were on screen
 *     and untappable. A portal takes the overlay out of that subtree entirely,
 *     so no future wrapper can trap it again.
 *
 *  2. CENTRED AT EVERY WIDTH. They were `items-end sm:items-center`, i.e.
 *     bottom-anchored on exactly the devices this app runs on. A tall card then
 *     ran off the bottom of the viewport, which is how "Raise request" and
 *     "Restart now" both became invisible.
 *
 *  3. CAPPED HEIGHT WITH A PINNED FOOTER. The card is capped at 85dvh (dvh, not
 *     vh — mobile browser chrome makes vh taller than what you can actually
 *     see) and only the body scrolls. The actions stay visible no matter how
 *     much content is above them, which is the actual guarantee worth having:
 *     a modal you cannot dismiss or confirm is a trap.
 */
/** Shared across every open CenterModal — see the scroll-lock effect below. */
let lockCount = 0;
let previousOverflow = "";

export function CenterModal({
  children,
  footer,
  onClose,
  dismissOnBackdrop = true,
  zIndex = 80,
  labelledBy,
}: {
  children: React.ReactNode;
  /** Pinned below the scroll area — never scrolls out of reach. */
  footer?: React.ReactNode;
  /** Called by the X, by Escape, and by a backdrop click. */
  onClose?: () => void;
  /**
   * Whether tapping the backdrop closes it. The X and Escape always do.
   *
   * Split from `onClose` because "this must stay closable" and "a stray tap
   * must not dismiss it" are different requirements, and tying them together
   * forced a choice between the two. The update prompt needs both while a
   * download is running: hiding the progress by brushing the screen is bad, but
   * a modal with no way out at all reads as a frozen app.
   */
  dismissOnBackdrop?: boolean;
  zIndex?: number;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the background scroll, reference-counted.
  //
  // Two of these can be open at once — the update prompt appears 4s after the
  // shell mounts, the missed-punch-out prompt when its query resolves. With a
  // naive save-and-restore, the FIRST to unmount would restore the empty value
  // it captured (unlocking behind a still-open modal) and the second would then
  // restore "hidden" — leaving the whole app permanently unscrollable with no
  // modal on screen. Counting is the only version of this that composes.
  useEffect(() => {
    if (lockCount === 0) previousOverflow = document.body.style.overflow;
    lockCount += 1;
    document.body.style.overflow = "hidden";

    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={dismissOnBackdrop ? onClose : undefined}
      className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{
        zIndex,
        // Respect the notch and the gesture bar: a centred card does not need
        // these, but a tall one grows into them.
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        // Stop a click inside the card reaching the backdrop handler.
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        style={{ maxHeight: "85dvh" }}
      >
        {/* One close affordance for every modal, rather than each building its
            own (or forgetting to). Absolutely positioned so it does not disturb
            the content's own layout. Rendered whenever an onClose exists —
            which every prompt now provides, including the mandatory update:
            dismissing the dialog grants nothing, so withholding the X only
            trapped someone who could not act on it right then. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 p-4 dark:border-white/10">
            {footer}
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
