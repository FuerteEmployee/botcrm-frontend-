import { History } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One approved correction of a punch on an attendance day, as stored in
 * `Attendance.corrections` by the regularization approval. The punch fields on
 * the day already hold the corrected (`to`) time, and that is what hours,
 * late mark, grade and salary use. `from` is kept for reference only.
 */
export interface PunchCorrectionEntry {
  field: "punchIn" | "punchOut" | "lunchInTime" | "lunchOutTime";
  from?: string | null;
  to?: string | null;
  regularizationId?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

const IST_TZ = "Asia/Kolkata";

/** "9:30 AM" in IST. */
export const fmtIST12 = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", {
        timeZone: IST_TZ,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "no time";

/** "26 Sept" in IST. */
export const fmtISTDay = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        timeZone: IST_TZ,
        day: "numeric",
        month: "short",
      })
    : "";

const PUNCHED: Record<PunchCorrectionEntry["field"], string> = {
  punchIn: "Punched in",
  punchOut: "Punched out",
  lunchInTime: "Lunch started",
  lunchOutTime: "Lunch ended",
};

/** "Punched 10:00 AM · corrected to 9:30 AM by Priya on 26 Sept". */
export function correctionSentence(c: PunchCorrectionEntry) {
  const from = c.from
    ? `${PUNCHED[c.field] ?? "Punched"} ${fmtIST12(c.from)}`
    : `${PUNCHED[c.field] ?? "Punch"}: no time`;
  const by = c.approvedByName ? ` by ${c.approvedByName}` : "";
  const on = c.approvedAt ? ` on ${fmtISTDay(c.approvedAt)}` : "";
  return `${from} · corrected to ${fmtIST12(c.to)}${by}${on}`;
}

/**
 * The day's correction history, for the admin day detail and the employee's
 * Home day detail. Renders nothing when the day was never corrected.
 *
 * `tone="dark"` is for the employee Home card, which sits on a dark gradient.
 */
export function CorrectionLog({
  corrections,
  tone = "panel",
  className,
}: {
  corrections?: PunchCorrectionEntry[] | null;
  tone?: "panel" | "dark";
  className?: string;
}) {
  const list = Array.isArray(corrections) ? corrections.filter((c) => c && c.to) : [];
  if (!list.length) return null;
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 space-y-1.5",
        dark ? "border-white/10 bg-white/5" : "border-border/40 bg-muted/20",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-bold",
          dark ? "text-white/70" : "text-muted-foreground",
        )}
      >
        <History className="h-3.5 w-3.5 shrink-0" />
        {list.length === 1 ? "Time corrected" : `Times corrected (${list.length})`}
      </p>
      {list.map((c, i) => (
        <p
          key={`${c.field}-${c.approvedAt ?? i}`}
          className={cn(
            "text-[12px] leading-snug font-semibold break-words",
            dark ? "text-white/90" : "text-foreground/80",
          )}
        >
          {correctionSentence(c)}
        </p>
      ))}
      <p
        className={cn("text-[11px] leading-snug", dark ? "text-white/60" : "text-muted-foreground")}
      >
        Hours and pay use the corrected time.
      </p>
    </div>
  );
}
