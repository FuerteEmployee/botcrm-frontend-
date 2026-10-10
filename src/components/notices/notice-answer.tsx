import { useEffect, useState } from "react";
import { Check, CheckCheck, Clock, Loader2, Minus, Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasQuestion, useNoticeActions, type Announcement } from "@/services/announcement-service";
import { answerText, fmtWhen } from "./notice-utils";

/**
 * The employee's side of a notice: its question (yes/no, pick one, pick
 * several, a number) and the "Mark as read" button. Used in the popup and on
 * the Announcements page, so both behave the same.
 */
export function NoticeResponse({
  notice,
  onAnswered,
  onRead,
}: {
  notice: Announcement;
  onAnswered?: () => void;
  onRead?: () => void;
}) {
  return (
    <div className="space-y-3">
      {hasQuestion(notice) && <NoticeQuestion notice={notice} onDone={onAnswered} />}
      <NoticeReadButton notice={notice} onDone={onRead} />
    </div>
  );
}

export function NoticeReadButton({
  notice,
  onDone,
}: {
  notice: Announcement;
  onDone?: () => void;
}) {
  const { markRead, isMarkingRead } = useNoticeActions();
  if (!notice.display?.markAsRead) return null;
  const readAt = notice.myResponse?.readAt;
  if (readAt) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCheck className="h-4 w-4" /> You marked this as read · {fmtWhen(readAt)}
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={isMarkingRead}
      onClick={() =>
        markRead(notice._id)
          .then(() => onDone?.())
          .catch(() => {
            /* toast shown */
          })
      }
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 text-[14px] font-bold text-emerald-700 transition-colors hover:bg-emerald-600/15 disabled:opacity-60 dark:text-emerald-400"
    >
      {isMarkingRead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Mark as read
    </button>
  );
}

function NoticeQuestion({ notice, onDone }: { notice: Announcement; onDone?: () => void }) {
  const q = notice.question!;
  const { respond, isResponding } = useNoticeActions();
  const answered = !!notice.myResponse?.answeredAt;
  const open = notice.isOpen !== false;
  const canChange = q.allowChange !== false;
  const [editing, setEditing] = useState(!answered);
  const initialChoices = notice.myResponse?.answer?.choices || [];
  const initialNumber = notice.myResponse?.answer?.number;
  const [choices, setChoices] = useState<number[]>(initialChoices);
  const [num, setNum] = useState<string>(
    typeof initialNumber === "number" ? String(initialNumber) : "",
  );

  // A fresh answer from the server (another device, or after sending) resets the form.
  useEffect(() => {
    setEditing(!notice.myResponse?.answeredAt);
    setChoices(notice.myResponse?.answer?.choices || []);
    const n = notice.myResponse?.answer?.number;
    setNum(typeof n === "number" ? String(n) : "");
  }, [notice.myResponse?.answeredAt, notice.myResponse?.answer]);

  const options = q.options || [];
  const min = q.min ?? 0;
  const max = q.max ?? null;
  const parsed = num.trim() === "" ? NaN : Number(num);
  const numberProblem =
    q.kind !== "number"
      ? ""
      : Number.isNaN(parsed)
        ? ""
        : !Number.isInteger(parsed)
          ? "Whole numbers only"
          : parsed < min
            ? `At least ${min}`
            : max !== null && parsed > max
              ? `At most ${max}`
              : "";
  const ready = q.kind === "number" ? !Number.isNaN(parsed) && !numberProblem : choices.length > 0;

  const send = () => {
    if (!ready || isResponding) return;
    const answer = q.kind === "number" ? { number: parsed } : { choices };
    respond({ id: notice._id, answer })
      .then(() => {
        setEditing(false);
        onDone?.();
      })
      .catch(() => {
        /* toast shown */
      });
  };

  const toggle = (i: number) => {
    if (q.kind === "multiple")
      setChoices((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
    else setChoices([i]);
  };
  const step = (d: number) => {
    const cur = Number.isNaN(parsed) ? min : parsed;
    let next = Math.round(cur) + d;
    if (next < min) next = min;
    if (max !== null && next > max) next = max;
    setNum(String(next));
  };

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3.5 space-y-3">
      <div className="space-y-0.5">
        {q.prompt ? (
          <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100 break-words">
            {q.prompt}
          </p>
        ) : null}
        <p className="text-[12px] text-slate-500 flex items-center gap-1.5 flex-wrap">
          {/* How to answer, only while answering. */}
          {editing && open
            ? q.kind === "multiple"
              ? "Tick all that apply"
              : q.kind === "number"
                ? `Enter a number${max !== null ? ` (${min} to ${max})` : min > 0 ? ` (at least ${min})` : ""}`
                : "Pick one"
            : null}
          {notice.closesAt && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                open ? "text-amber-700 dark:text-amber-400" : "text-rose-600",
              )}
            >
              <Clock className="h-3 w-3" />{" "}
              {open ? `Answer by ${fmtWhen(notice.closesAt)}` : "Answers closed"}
            </span>
          )}
        </p>
      </div>

      {!editing || !open ? (
        <div className="space-y-2">
          {answered ? (
            <p className="text-[13px] text-slate-700 dark:text-slate-200">
              Your answer: <span className="font-bold text-primary">{answerText(notice)}</span>
            </p>
          ) : (
            <p className="text-[13px] text-slate-500">{open ? "" : "You did not answer."}</p>
          )}
          {answered && open && canChange && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-[13px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Change answer
            </button>
          )}
          {answered && open && !canChange && (
            <p className="text-[12px] text-slate-500">Answers cannot be changed for this notice.</p>
          )}
        </div>
      ) : (
        <>
          {q.kind === "number" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Less"
                  onClick={() => step(-1)}
                  className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center bg-white dark:bg-slate-900"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Your number"
                  value={num}
                  min={min}
                  max={max ?? undefined}
                  onChange={(e) => setNum(e.target.value)}
                  className="h-11 w-full min-w-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-center text-[18px] font-bold outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => step(1)}
                  className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center bg-white dark:bg-slate-900"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {q.unit ? (
                  <span className="text-[13px] font-semibold text-slate-500 shrink-0">
                    {q.unit}
                  </span>
                ) : null}
              </div>
              {numberProblem && (
                <p className="text-[12px] font-semibold text-rose-600">{numberProblem}</p>
              )}
            </div>
          ) : (
            <div
              className={cn("gap-2", q.kind === "yes_no" ? "grid grid-cols-2" : "flex flex-col")}
            >
              {options.map((label, i) => {
                const on = choices.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    role={q.kind === "multiple" ? "checkbox" : "radio"}
                    aria-checked={on}
                    onClick={() => toggle(i)}
                    className={cn(
                      "min-h-11 rounded-xl border px-3 py-2 text-left text-[14px] font-semibold flex items-center gap-2.5 transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-primary/40",
                      q.kind === "yes_no" && "justify-center text-center",
                    )}
                  >
                    {q.kind !== "yes_no" && (
                      <span
                        className={cn(
                          "h-5 w-5 shrink-0 border-2 flex items-center justify-center",
                          q.kind === "multiple" ? "rounded-md" : "rounded-full",
                          on ? "border-white" : "border-slate-300",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="break-words">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            {answered && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-11 px-4 rounded-xl text-[13px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!ready || isResponding}
              onClick={send}
              className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isResponding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {answered ? "Update answer" : "Send answer"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
