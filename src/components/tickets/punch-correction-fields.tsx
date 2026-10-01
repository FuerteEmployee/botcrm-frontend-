import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { requestErrorMessage } from "@/services/request-error";
import {
  correctionInstant,
  correctionProblem,
  fmt12,
  from24,
  istHHMM,
  to24,
  type CorrectionContext,
  type CorrectionField,
} from "./punch-correction-rules";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const SELECT =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-2 text-[16px] font-semibold text-slate-800 " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

/** What the parent needs to send, or why it cannot yet. */
export interface PunchCorrectionValue {
  date: string;
  /** "HH:mm", 24-hour. Null until a full time is picked. */
  time: string | null;
  /** A plain reason Send is disabled, or null when it can be sent. */
  blocker: string | null;
}

/**
 * The day + time part of a "Forgot to punch in / out" ticket.
 *
 * Shows what the day recorded ("You punched in at 10:00 AM") next to a
 * 12-hour picker, and explains any rule the pick breaks before Send is
 * pressed. The server re-checks every rule.
 */
export function PunchCorrectionFields({
  field,
  onChange,
}: {
  field: CorrectionField;
  onChange: (value: PunchCorrectionValue) => void;
}) {
  const [date, setDate] = useState<string>("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [ampm, setAmpm] = useState<"AM" | "PM">(field === "punchIn" ? "AM" : "PM");
  // Once the employee touches the time, a context refetch must not overwrite it.
  const [touched, setTouched] = useState(false);

  const {
    data: ctx,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<CorrectionContext>({
    queryKey: ["ticket-correction-context", date || "today"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets/correction-context", {
        params: date ? { date } : {},
      });
      return data;
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  // The first answer names "today" in IST; use it as the default day.
  useEffect(() => {
    if (!date && ctx?.today) setDate(ctx.today);
  }, [ctx?.today, date]);

  // Prefill with the shift boundary -- the owner's case is exactly "my shift
  // starts at 9:30, I punched at 10". Only while untouched.
  useEffect(() => {
    if (!ctx || touched) return;
    const boundary = field === "punchIn" ? ctx.shift?.start : ctx.shift?.end;
    const usable = boundary && +new Date(boundary) <= Date.now() ? boundary : null;
    const pick = from24(usable ? istHHMM(usable) : null);
    if (pick) {
      setHour(pick.hour);
      setMinute(pick.minute);
      setAmpm(pick.ampm);
    } else {
      setHour("");
      setMinute("");
      setAmpm(field === "punchIn" ? "AM" : "PM");
    }
  }, [ctx, field, touched]);

  const time = to24(hour, minute, ampm);
  const requested = useMemo(
    () => (ctx && date && time ? correctionInstant(date, time, ctx.shift) : null),
    [ctx, date, time],
  );
  const rule = ctx ? correctionProblem(field, requested, ctx) : null;

  const blocker = !ctx
    ? isError
      ? "This day could not be loaded."
      : "Loading…"
    : (rule ?? (time ? null : "Please pick the time."));

  useEffect(() => {
    onChange({ date: ctx?.date ?? date, time, blocker });
    // onChange is a parent setter; including it would loop on a new closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.date, date, time, blocker]);

  const recorded = field === "punchIn" ? ctx?.punchIn : ctx?.punchOut;
  const verb = field === "punchIn" ? "punched in" : "punched out";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="fix-day"
          className="text-[13px] font-bold text-slate-600 dark:text-slate-300"
        >
          Which day?
        </label>
        <input
          id="fix-day"
          type="date"
          value={date}
          min={ctx?.earliest}
          max={ctx?.today}
          onChange={(e) => {
            setDate(e.target.value);
            setTouched(false);
          }}
          className={SELECT + " px-3"}
        />
        {ctx && (
          <p className="text-[12px] text-slate-500">You can fix the last {ctx.windowDays} days.</p>
        )}
      </div>

      {/* What the day recorded, beside the picker. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] dark:border-slate-700 dark:bg-slate-800/60">
        {isLoading || (isFetching && !ctx) ? (
          <span className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking this day…
          </span>
        ) : isError && !ctx ? (
          <span className="flex flex-wrap items-center gap-2 text-rose-600">
            {requestErrorMessage(error, "This day could not be loaded.") ||
              "This day could not be loaded."}
            <button
              type="button"
              onClick={() => refetch()}
              className="h-10 rounded-lg px-3 font-bold text-primary underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </span>
        ) : ctx ? (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              {recorded
                ? `You ${verb} at ${fmt12(recorded)}`
                : ctx.hasAttendance
                  ? `No ${verb.replace("punched ", "punch-")} recorded on this day`
                  : "No attendance on this day"}
            </p>
            {ctx.shift && (
              <p className="text-[12px] text-slate-500">
                Your shift: {fmt12(ctx.shift.start)} – {fmt12(ctx.shift.end)}
                {ctx.shift.overnight
                  ? " (night shift: times after midnight count as the next morning)"
                  : ""}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <span
          className="text-[13px] font-bold text-slate-600 dark:text-slate-300"
          id="fix-time-label"
        >
          {field === "punchIn"
            ? "What time did you really come in?"
            : "What time did you really leave?"}
        </span>
        <div
          className="grid grid-cols-[1fr_1fr_1fr] gap-2"
          role="group"
          aria-labelledby="fix-time-label"
        >
          <select
            aria-label="Hour"
            value={hour}
            onChange={(e) => {
              setHour(e.target.value);
              setTouched(true);
            }}
            className={SELECT}
          >
            <option value="">Hour</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <select
            aria-label="Minute"
            value={minute}
            onChange={(e) => {
              setMinute(e.target.value);
              setTouched(true);
            }}
            className={SELECT}
          >
            <option value="">Min</option>
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="AM or PM"
            value={ampm}
            onChange={(e) => {
              setAmpm(e.target.value as "AM" | "PM");
              setTouched(true);
            }}
            className={SELECT}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
        {ctx?.punchIn && ctx.hasAttendance && !rule && (
          <p className="text-[12px] text-slate-500">
            {field === "punchIn"
              ? `Pick a time before ${fmt12(ctx.punchIn)}${ctx.shift ? `, not before ${fmt12(ctx.shift.start)}` : ""}.`
              : `Pick a time after ${fmt12(ctx.lastSessionPunchIn || ctx.punchIn)}${ctx.shift ? `, not after ${fmt12(ctx.shift.end)}` : ""}.`}
          </p>
        )}
      </div>

      {ctx && rule && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {rule}
        </p>
      )}
    </div>
  );
}
