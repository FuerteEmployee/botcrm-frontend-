import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { CenterModal } from "@/components/shared/center-modal";
import { HapticOverlay } from "@/components/shared/haptic-overlay";
import {
  useMissedPunchOuts,
  useRegularizationService,
  type MissedPunchOut,
} from "@/services/regularization-service";
import { toDatetimeLocalValue, toISTDateKey } from "@/lib/utils";

/**
 * Asks the employee what time they actually left, on a day the system closed
 * for them.
 *
 * When nobody punches out, the 04:00 job stamps the shift end so the day can
 * still be graded and paid. On a day with no GPS there is no geofence
 * evaluation either, so that fallback is the only thing the record has — and it
 * is a guess. This is the one chance to ask the person who knows.
 *
 * Deliberately NOT a blocker. It offers the shift-end time already filled in,
 * so agreeing is one tap; changing it is a time picker; and closing it is
 * always allowed. A prompt that traps someone who genuinely cannot remember
 * would just teach them to submit any time at all to get past it, which is
 * worse than the fallback it replaces. Where it is dismissed the record keeps
 * the shift-end value and stays flagged for the admin.
 */

const DISMISSED_KEY = "bot_missed_punchout_dismissed";

/** Records dismissed on this device, so the prompt asks once rather than nags. */
function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // Private windows and blocked site data both throw here. A prompt that
    // cannot remember a dismissal is mildly annoying; a crash is not an option.
    return [];
  }
}

function markDismissed(attendanceId: string) {
  try {
    const next = [...new Set([...readDismissed(), attendanceId])].slice(-40);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* see readDismissed */
  }
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : "--:--";

export function MissedPunchOutPrompt() {
  const { missedPunchOuts } = useMissedPunchOuts();
  // Mutations only — the shell has no use for the full request list, and
  // fetching it on every app open would be a wasted round trip.
  const { submitRegularization, isSubmitting } = useRegularizationService({ enabled: false });

  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());
  const [leftAt, setLeftAt] = useState("");
  const [reason, setReason] = useState("");

  /**
   * One prompt per app open, however many days are waiting.
   *
   * `pending` is the OLDEST unresolved day, so resolving it immediately
   * promoted the next one and the modal re-rendered on the spot -- with a
   * different date, but no transition and no gap. Reported as "it shows twice
   * even though I already submitted the correct time", which is exactly what it
   * looks like: three employees currently have two missed days each, so this
   * fires for most people who have any.
   *
   * Asking again tomorrow is fine. Asking again half a second later, right
   * after someone has done what was asked, reads as the submission having
   * failed -- and teaches them to distrust the next one.
   */
  const [askedThisSession, setAskedThisSession] = useState(false);

  // Oldest first: if two days are waiting, the older one is the one closer to
  // falling outside the correction window.
  const pending: MissedPunchOut | undefined = useMemo(() => {
    const open = missedPunchOuts.filter((m) => !dismissed.includes(m.attendanceId));
    return [...open].sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
  }, [missedPunchOuts, dismissed]);

  // Prefill with the shift-end time the system already wrote. Agreeing with it
  // is then a single tap, and the employee is correcting a concrete number
  // rather than answering an open question hours after the fact.
  useEffect(() => {
    if (!pending) return;
    setLeftAt(toDatetimeLocalValue(new Date(pending.systemPunchOut)));
    setReason("");
  }, [pending?.attendanceId]);

  const remaining = missedPunchOuts.filter((m) => !dismissed.includes(m.attendanceId)).length;

  if (!pending || askedThisSession) return null;

  const close = () => {
    markDismissed(pending.attendanceId);
    setDismissed(readDismissed());
    setAskedThisSession(true);
  };

  const submit = async () => {
    if (!leftAt) {
      toast.error("Please set the time you left");
      return;
    }
    try {
      await submitRegularization({
        // No employeeId: the server takes it from the token for employees, and
        // the client session carries no user _id to send.
        date: toISTDateKey(new Date(pending.date)),
        requestedPunchOut: leftAt,
        reason: reason.trim() || "Forgot to punch out",
      });
      // Marks THIS day handled and stops the next one taking its place in the
      // same breath. The service has already toasted the success, and the
      // remaining days are offered next time the app is opened.
      close();
      if (remaining > 1) {
        toast.info(`${remaining - 1} more day${remaining === 2 ? "" : "s"} to confirm \u2014 we'll ask next time you open the app.`);
      }
    } catch {
      // The service already toasted; keep the dialog open so the typed time is
      // not thrown away.
    }
  };

  return (
    <AnimatePresence>
      <CenterModal
        zIndex={75}
        onClose={close}
        labelledBy="missed-punchout-title"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={isSubmitting}
              className="flex-1 rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting || !leftAt}
              className="relative flex-[1.6] rounded-xl bg-primary px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-primary/25 disabled:opacity-50"
            >
              <HapticOverlay radius="12px" />
              {isSubmitting ? "Sending…" : "Raise request"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            {/* pr-8 keeps the title clear of the modal's close button. */}
            <div className="min-w-0 flex-1 pr-8">
              <h4 id="missed-punchout-title" className="text-sm font-bold text-slate-800 dark:text-white">
                You didn't punch out
              </h4>
              <p className="text-[11px] leading-relaxed text-slate-500 mt-0.5">
                We recorded your shift end for now. Tell us when you actually left
                and we'll send it for approval.
              </p>
            </div>
            {/* The close affordance now comes from CenterModal, so every
                dialog has the same one in the same place. */}
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 px-3.5 py-3 grid grid-cols-3 gap-2">
            {[
              ["Date", fmtDay(pending.date)],
              ["Punched in", fmtTime(pending.punchIn)],
              ["Recorded out", fmtTime(pending.systemPunchOut)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="left-at" className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              What time did you leave?
            </label>
            <input
              id="left-at"
              type="datetime-local"
              value={leftAt}
              onChange={(e) => setLeftAt(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="left-reason" className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Reason <span className="font-medium normal-case tracking-normal text-slate-300">(optional)</span>
            </label>
            <input
              id="left-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Forgot to punch out"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200 outline-none focus:border-primary placeholder:text-slate-300"
            />
          </div>

        </div>
      </CenterModal>
    </AnimatePresence>
  );
}
