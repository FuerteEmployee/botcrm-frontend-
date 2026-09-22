import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Fingerprint,
  LogIn,
  MapPin,
  MapPinOff,
  Route as RouteIcon,
  Satellite,
  ScanFace,
  ShieldCheck,
  Undo2,
  Smartphone,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, AttendanceSession, PunchChannel } from "@/services/attendance-service";

// Read-only blocks for the Attendance Dashboard detail sheet.
//
// Everything here mirrors server-side maths that already exists, so the two
// must not drift: worked time comes from `totalWorkMs` (already lunch-deducted
// and shift-clamped by utils/shift_status.js) by default, and the
// required-hours figure repeats the backend's `requiredWorkMs`: shift span -
// configured lunch - grace.
//
// `getWorkedEstimate` below is the one narrow exception: a server timezone bug
// (fixed, but not yet backfilled) saved `totalWorkMs` as 0 for many closed
// records between 11-20 Sep 2026 despite real punches. Rather than showing a
// bare, misleading "0h 0m", these blocks fall back to a client-computed
// estimate in that specific case (and in the separate case of a missing
// punch-out). It is always visibly flagged as an estimate and never feeds back
// into `record.status` or anything persisted — display only.
//
// The one thing computed here and nowhere else is the plain-English REASON a
// day came out as a half day. That is presentation, not policy: it explains a
// verdict the server already reached, and must never be able to change it.

// ─── Shared bits ─────────────────────────────────────────────────────────────

const LABEL = "text-[10px] font-black uppercase tracking-widest text-muted-foreground/60";

/** Which channel reported a punch. Same three the day-level source icon uses. */
const CHANNEL: Record<PunchChannel, { icon: typeof Smartphone; label: string }> = {
  app: { icon: Smartphone, label: "Phone app" },
  lens: { icon: ScanFace, label: "Lens camera" },
  biometric: { icon: Fingerprint, label: "Biometric machine" },
  system: { icon: MapPinOff, label: "Automatic" },
  admin: { icon: UserCog, label: "Admin correction" },
};

export const fmtHM = (ms: number | null | undefined) => {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const mins = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// ─── Worked-hours estimate (display-only fallback) ──────────────────────────

/**
 * A punch-in/out gap this short (ms) with a stored 0 is treated as a genuine
 * near-instant punch, not the known zero-totalWorkMs bug — below it we trust
 * the stored 0 as real.
 */
const STALE_ZERO_GAP_MS = 3 * 60_000;

export interface WorkedEstimate {
  ms: number;
  estimated: boolean;
  reason: "measured" | "stale-zero-fallback" | "live" | "shift-end-estimate";
}

export const ESTIMATE_TOOLTIP: Record<WorkedEstimate["reason"], string | undefined> = {
  measured: undefined,
  "stale-zero-fallback":
    "Estimated — the server recorded 0 worked time for this day (a known data issue for records between 11–20 Sep 2026); calculated here from punch-in/punch-out instead of the stored figure.",
  live: "Estimated — still on duty; this is punch-in through now, not yet finalized.",
  "shift-end-estimate":
    "Estimated — punch-out was never recorded for this day; shown as punch-in through the scheduled shift end.",
};

/** Actual punched lunch duration if longer than the configured minimum, else the configured minimum. */
function actualOrConfiguredLunchMins(record: AttendanceRecord, lunchMins: number): number {
  if (record.lunchInTime && record.lunchOutTime) {
    const punched = Math.round(
      (new Date(record.lunchOutTime).getTime() - new Date(record.lunchInTime).getTime()) / 60000,
    );
    return Math.max(punched, lunchMins);
  }
  return lunchMins;
}

/**
 * Live worked ms for someone still on duty right now, correctly handling
 * where they are relative to lunch — NOT a blanket "elapsed minus configured
 * lunch", which would wrongly dock a person 30 minutes of lunch they haven't
 * taken yet (showing "2 min worked" 32 minutes into their shift).
 *
 * - Not yet at lunch: count everything from punch-in to now.
 * - Currently on lunch break (lunch-in set, no lunch-out yet): the clock
 *   pauses — count only up to when lunch started.
 * - Back from lunch: count elapsed time minus the actual lunch gap.
 */
function liveWorkedMs(record: AttendanceRecord): number {
  const punchInMs = new Date(record.punchIn!).getTime();
  const lunchInMs = record.lunchInTime ? new Date(record.lunchInTime).getTime() : null;
  const lunchOutMs = record.lunchOutTime ? new Date(record.lunchOutTime).getTime() : null;

  if (lunchInMs && !lunchOutMs) return Math.max(0, lunchInMs - punchInMs);
  if (lunchInMs && lunchOutMs) return Math.max(0, Date.now() - punchInMs - (lunchOutMs - lunchInMs));
  return Math.max(0, Date.now() - punchInMs);
}

/**
 * Worked time for display, falling back to a clearly-flagged estimate only
 * when the stored `totalWorkMs` is missing/wrong in a known way. Never writes
 * anything, never changes `record.status` — see the file header comment.
 */
export function getWorkedEstimate(
  record: AttendanceRecord,
  shift: ShiftLike | null | undefined,
  lunchMins: number,
  effectivePunchOut: string | null | undefined,
  isRecordToday: boolean,
): WorkedEstimate | null {
  if (!record.punchIn) return { ms: record.totalWorkMs || 0, estimated: false, reason: "measured" };
  if (record.totalWorkMs) return { ms: record.totalWorkMs, estimated: false, reason: "measured" };

  if (effectivePunchOut) {
    const rawMs = new Date(effectivePunchOut).getTime() - new Date(record.punchIn).getTime();
    if (rawMs <= STALE_ZERO_GAP_MS) return { ms: record.totalWorkMs || 0, estimated: false, reason: "measured" };
    const ms = Math.max(0, rawMs - actualOrConfiguredLunchMins(record, lunchMins) * 60000);
    return { ms, estimated: true, reason: "stale-zero-fallback" };
  }

  if (isRecordToday) {
    return { ms: liveWorkedMs(record), estimated: true, reason: "live" };
  }

  if (!shift?.endTime) return null;
  const punchInDate = new Date(record.punchIn);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const shiftEnd = new Date(punchInDate);
  shiftEnd.setHours(eh, em, 0, 0);
  if (shiftEnd < punchInDate) shiftEnd.setDate(shiftEnd.getDate() + 1); // overnight shift wraps past midnight
  const rawMs = Math.max(0, shiftEnd.getTime() - punchInDate.getTime());
  const ms = Math.max(0, rawMs - actualOrConfiguredLunchMins(record, lunchMins) * 60000);
  return { ms, estimated: true, reason: "shift-end-estimate" };
}

const fmtTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

/** "HH:mm" to minutes past midnight. */
const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
};

const fmt12 = (t?: string | null) => {
  const mins = toMin(t);
  if (mins == null) return t || "—";
  const h = Math.floor(mins / 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")} ${ampm}`;
};

export interface ShiftLike {
  name?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Minutes an employee must work for a full day: span - lunch - grace.
 *
 * Mirrors backend `requiredWorkMs()`, including its calibration traps. Lunch is
 * subtracted because worked time is stored net of it -- comparing net hours
 * against the raw span would make a full day unreachable for someone present
 * the entire shift. The half-hour floor applies ONLY when lunch is longer than
 * the shift itself, which is a misconfiguration; applied generally it would
 * stop a genuinely short relief shift ever reaching full day.
 */
export function requiredMinutes(shift: ShiftLike | null | undefined, lunchMins: number, graceMins: number) {
  const start = toMin(shift?.startTime);
  const end = toMin(shift?.endTime);
  if (start == null || end == null) return null;
  const span = end <= start ? end + 1440 - start : end - start;
  const required = span - lunchMins - graceMins;
  return required <= 0 ? Math.min(span, 30) : required;
}

export function shiftSpanMinutes(shift: ShiftLike | null | undefined) {
  const start = toMin(shift?.startTime);
  const end = toMin(shift?.endTime);
  if (start == null || end == null) return null;
  return end <= start ? end + 1440 - start : end - start;
}

function ChannelMark({ channel, title }: { channel?: PunchChannel | null; title: string }) {
  if (!channel) return null;
  const meta = CHANNEL[channel];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span title={`${title}: ${meta.label}`} className="text-muted-foreground/60 shrink-0">
      <Icon className="h-3 w-3" />
    </span>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/**
 * Every session of the day, each end tagged with the channel that reported it.
 *
 * The per-end channel marks are the point of this list. A day can legitimately
 * be opened on a phone and closed on the terminal, and without showing both an
 * admin looking at a disputed day cannot tell that from a single-device day.
 */
export function SessionTimeline({ sessions }: { sessions: AttendanceSession[] }) {
  if (!sessions.length) return null;

  return (
    <div className="space-y-2">
      <p className={LABEL}>Sessions</p>
      {sessions.map((s, i) => {
        const open = !!s.punchIn && !s.punchOut;
        const autoExit = s.closeReason === "auto_geofence";

        // Per-session workMs is gross (never lunch-deducted — see shift_status.js),
        // so the fallback estimate here is just the raw punch gap, no lunch
        // subtraction, matching what a real workMs would have measured.
        const rawGapMs = s.punchIn && s.punchOut ? new Date(s.punchOut).getTime() - new Date(s.punchIn).getTime() : null;
        const sessionIsStale = !s.workMs && rawGapMs != null && rawGapMs > STALE_ZERO_GAP_MS;
        const sessionWorkedMs = sessionIsStale ? rawGapMs : s.workMs;

        return (
          <div
            key={i}
            className={cn(
              "rounded-xl border px-3 py-2 space-y-1 text-[11px] font-semibold",
              open
                ? "bg-success/10 border-success/25 text-success"
                : "bg-muted/30 border-border/40 text-foreground/80",
            )}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <LogIn className="h-3 w-3 shrink-0 opacity-60" />
              <span className="font-black">S{i + 1}</span>

              <span className="font-mono">{fmtTime(s.punchIn)}</span>
              <ChannelMark channel={s.punchInSource} title="Punched in via" />

              <ArrowRight className="h-3 w-3 opacity-40 shrink-0" />

              {s.punchOut ? (
                <>
                  <span className="font-mono">{fmtTime(s.punchOut)}</span>
                  <ChannelMark channel={s.punchOutSource} title="Punched out via" />
                </>
              ) : (
                <span className="font-black text-success">Live</span>
              )}

              {sessionWorkedMs != null && (
                <span
                  className={cn("ml-auto text-muted-foreground font-bold", sessionIsStale && "italic")}
                  title={sessionIsStale ? ESTIMATE_TOOLTIP["stale-zero-fallback"] : undefined}
                >
                  {fmtHM(sessionWorkedMs)}
                  {sessionIsStale && "*"}
                </span>
              )}

              {autoExit && (
                <Badge
                  variant="outline"
                  className="border-destructive/25 bg-destructive/10 text-destructive text-[9px] font-black uppercase px-1.5 py-0"
                >
                  Auto exit
                </Badge>
              )}
              {s.closeReason === "shift_end" && (
                <Badge
                  variant="outline"
                  className="border-warning/25 bg-warning/10 text-warning-foreground text-[9px] font-black uppercase px-1.5 py-0"
                >
                  Shift end
                </Badge>
              )}
            </div>

            {(s.punchInLocation || s.punchOutLocation) && (
              <div className="pl-5 space-y-0.5 font-normal text-[10px] text-muted-foreground leading-tight">
                {s.punchInLocation && <p className="truncate">In: {s.punchInLocation}</p>}
                {s.punchOutLocation && <p className="truncate">Out: {s.punchOutLocation}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export function DayStatsRow({
  record,
  displayStatus,
  worked,
}: {
  record: AttendanceRecord;
  displayStatus: string;
  worked?: WorkedEstimate | null;
}) {
  const geo = record.autoPunchOut
    ? { label: "Auto exit", className: "bg-destructive/10 text-destructive border-destructive/25" }
    : record.geoStatus === "inside_geofence"
      ? { label: "Inside fence", className: "bg-success/10 text-success border-success/25" }
      : record.geoStatus === "outside_geofence"
        ? { label: "Outside fence", className: "bg-warning/10 text-warning-foreground border-warning/25" }
        : null;

  return (
    <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/40 bg-muted/20 p-4 text-center">
      <div className="space-y-1">
        <p className={LABEL}>Total Hours</p>
        <p
          className={cn("text-[13px] font-black text-primary", worked?.estimated && "italic")}
          title={worked?.estimated ? ESTIMATE_TOOLTIP[worked.reason] : undefined}
        >
          {fmtHM(worked?.ms ?? record.totalWorkMs)}
          {worked?.estimated && "*"}
        </p>
      </div>
      <div className="space-y-1">
        <p className={LABEL}>Geo Status</p>
        {geo ? (
          <Badge variant="outline" className={cn("text-[9px] font-black uppercase", geo.className)}>
            {geo.label}
          </Badge>
        ) : (
          <p className="text-[13px] font-bold text-muted-foreground/50">—</p>
        )}
      </div>
      <div className="space-y-1">
        <p className={LABEL}>Status</p>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] font-black uppercase capitalize border-transparent",
            displayStatus === "on-duty"
              ? "bg-blue-500/10 text-blue-600"
              : record.status === "present"
                ? "bg-success/10 text-success"
                : record.status === "half-day" || record.status === "late"
                  ? "bg-warning/15 text-warning-foreground"
                  : record.status === "wfh"
                    ? "bg-info/15 text-info"
                    : "bg-destructive/10 text-destructive",
          )}
        >
          {displayStatus === "on-duty" ? "On Duty" : record.status}
        </Badge>
      </div>
    </div>
  );
}

// ─── Why the auto punch-out fired ────────────────────────────────────────────

/**
 * A punch-out the employee did not make has to be explainable, not asserted.
 *
 * Everything shown is what the decision actually used: the measured distance,
 * the GPS quality of the deciding fix, and how old that fix was. A fix captured
 * minutes before the close is the tell for a stale reading, which is the most
 * common cause of a wrong auto punch-out and is invisible without this.
 */
export function AutoPunchOutCard({ record, onRevert }: { record: AttendanceRecord; onRevert?: () => void }) {
  if (!record.autoPunchOut) return null;

  const session = (record.shifts || []).find((s) => s.closeReason === "auto_geofence");
  const coords = session?.punchOutCoordinates || null;
  const accuracy = session?.punchOutAccuracy ?? record.punchOutAccuracy ?? null;
  const distance = record.calculatedDistance ?? session?.punchOutDistance ?? null;

  const fixAt = record.punchOutFixAt ? new Date(record.punchOutFixAt) : null;
  const outAt = session?.punchOut ? new Date(session.punchOut) : record.punchOut ? new Date(record.punchOut) : null;
  const staleMin = fixAt && outAt ? Math.round((outAt.getTime() - fixAt.getTime()) / 60000) : null;

  const employeeId = record.employeeId?._id;
  const canMap = !!employeeId && typeof coords?.lat === "number" && typeof coords?.lng === "number";

  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-warning-foreground">
          <AlertTriangle className="h-4 w-4" />
          Auto punch-out
          {outAt && <span className="font-bold normal-case"> at {fmtTime(session?.punchOut || record.punchOut)}</span>}
        </span>

        {distance != null && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-warning-foreground">
            <RouteIcon className="h-3.5 w-3.5" />
            {distance} m from branch
          </span>
        )}

        {accuracy != null && (
          <span
            title={
              accuracy > 35
                ? "Low-quality fix — the position was uncertain by this many metres"
                : "GPS accuracy at the moment of the close"
            }
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-bold",
              accuracy > 35 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <Satellite className="h-3.5 w-3.5" />±{Math.round(accuracy)} m
          </span>
        )}

        {staleMin != null && staleMin >= 2 && (
          <span
            title="The device captured this position well before the punch-out — it may be a stale reading"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive"
          >
            <Clock className="h-3.5 w-3.5" /> fix {staleMin} min old
          </span>
        )}
      </div>

      {session?.punchOutLocation && (
        <p className="flex items-start gap-1.5 text-[11px] font-medium text-foreground/80">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{session.punchOutLocation}</span>
        </p>
      )}

      {record.autoPunchOutReason && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">{record.autoPunchOutReason}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {canMap && (
          <Link
            to="/tracking"
            search={{
              employeeId,
              date: record.date?.slice(0, 10),
              exitLat: coords!.lat,
              exitLng: coords!.lng,
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RouteIcon className="h-3.5 w-3.5" /> Show on map — why this happened
          </Link>
        )}

        {/* The undo, put where the decision is being read rather than buried in
            a settings page. An admin who has just decided the engine was wrong
            should not then have to go and hand-edit punch times -- that is
            slower than the mistake and leaves no trace of what happened. */}
        {onRevert && (
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-[11px] font-black text-foreground hover:bg-muted transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" /> This was wrong — undo
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shift requirement + why half day ────────────────────────────────────────

export function ShiftRequirementCard({
  shift,
  lunchMins,
  graceMins,
  worked,
}: {
  shift: ShiftLike | null | undefined;
  lunchMins: number;
  graceMins: number;
  worked: WorkedEstimate | null;
}) {
  const required = requiredMinutes(shift, lunchMins, graceMins);
  const span = shiftSpanMinutes(shift);
  const workedMs = worked?.ms ?? 0;
  const workedMins = Math.round(workedMs / 60000);

  return (
    <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <p className={LABEL}>Shift &amp; Requirement</p>
      </div>

      {shift && required != null ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className={LABEL}>Shift</p>
            <p className="text-[12px] font-black text-foreground">{shift.name || "—"}</p>
            <p className="text-[10px] text-muted-foreground">
              {fmt12(shift.startTime)} – {fmt12(shift.endTime)}
            </p>
          </div>
          <div>
            <p className={LABEL}>Required</p>
            <p className="text-[12px] font-black text-foreground">{fmtHM(required * 60000)}</p>
            {(lunchMins > 0 || graceMins > 0) && span != null && (
              <p className="text-[10px] text-muted-foreground">
                {fmtHM(span * 60000)}
                {lunchMins > 0 && ` − ${lunchMins}m lunch`}
                {graceMins > 0 && ` − ${graceMins}m grace`}
              </p>
            )}
          </div>
          <div>
            <p className={LABEL}>Worked</p>
            <p
              className={cn(
                "text-[12px] font-black",
                workedMins >= required ? "text-success" : "text-warning-foreground",
                worked?.estimated && "italic",
              )}
              title={worked?.estimated ? ESTIMATE_TOOLTIP[worked.reason] : undefined}
            >
              {fmtHM(workedMs)}
              {worked?.estimated && "*"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {required > 0 ? Math.round((workedMins / required) * 100) : 0}% of required
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No shift assigned — this day cannot be graded on hours, so it keeps the status its punches produced.
        </p>
      )}
    </div>
  );
}

/**
 * The exact reasons a day came out short.
 *
 * Deliberately lists every contributing factor rather than the single largest
 * one: "you were 73 minutes short" invites an argument, whereas naming the late
 * arrival, the mid-shift gap and the lunch deduction that together make up
 * those 73 minutes usually ends it.
 */
export function WhyHalfDay({
  record,
  sessions,
  shift,
  lunchMins,
  graceMins,
  worked,
}: {
  record: AttendanceRecord;
  sessions: AttendanceSession[];
  shift: ShiftLike | null | undefined;
  lunchMins: number;
  graceMins: number;
  worked: WorkedEstimate | null;
}) {
  if (record.status !== "half-day") return null;

  const required = requiredMinutes(shift, lunchMins, graceMins);
  const workedMs = worked?.ms ?? 0;
  const workedMins = Math.round(workedMs / 60000);
  const reasons: string[] = [];

  if (worked?.estimated) {
    reasons.push(ESTIMATE_TOOLTIP[worked.reason]!);
  }

  if (required != null && workedMins < required) {
    reasons.push(
      `Worked ${fmtHM(workedMs)} — ${required - workedMins} min short of the required ${fmtHM(required * 60000)}.`,
    );

    const firstIn = sessions[0]?.punchIn || record.punchIn;
    const startMin = toMin(shift?.startTime);
    if (firstIn && startMin != null) {
      const d = new Date(firstIn);
      const inMin = d.getHours() * 60 + d.getMinutes();
      if (inMin > startMin) {
        reasons.push(
          `Arrived ${inMin - startMin} min after shift start (${fmtTime(firstIn)} vs ${fmt12(shift?.startTime)}).`,
        );
      }
    }

    const lastOut = [...sessions].reverse().find((s) => s.punchOut)?.punchOut || record.punchOut;
    const endMin = toMin(shift?.endTime);
    if (lastOut && endMin != null) {
      const d = new Date(lastOut);
      const outMin = d.getHours() * 60 + d.getMinutes();
      if (outMin < endMin) {
        reasons.push(
          `Left ${endMin - outMin} min before shift end (${fmtTime(lastOut)} vs ${fmt12(shift?.endTime)}).`,
        );
      }
    }

    // Mid-shift gaps: the "punched out at lunch, came back at shift end"
    // pattern that neither the arrival nor the departure check can see.
    const spans = sessions
      .filter((s) => s.punchIn && s.punchOut)
      .map((s) => ({ in: new Date(s.punchIn!).getTime(), out: new Date(s.punchOut!).getTime() }))
      .sort((a, b) => a.in - b.in);
    for (let i = 1; i < spans.length; i++) {
      const gap = spans[i].in - spans[i - 1].out;
      if (gap >= 30 * 60000) {
        reasons.push(
          `Away ${fmtHM(gap)} mid-shift (out ${fmtTime(new Date(spans[i - 1].out).toISOString())}, back ${fmtTime(new Date(spans[i].in).toISOString())}).`,
        );
      }
    }

    if (lunchMins > 0) {
      const punched =
        record.lunchInTime && record.lunchOutTime
          ? Math.round(
              (new Date(record.lunchOutTime).getTime() - new Date(record.lunchInTime).getTime()) / 60000,
            )
          : 0;
      reasons.push(
        punched > lunchMins
          ? `Lunch ran ${punched} min — longer than the ${lunchMins} min allowance, so the full break was deducted.`
          : `${lunchMins} min lunch deducted (configured minimum${punched > 0 ? `; actual break ${punched} min` : " — no lunch was punched"}).`,
      );
    }

    if (record.autoPunchOut) reasons.push("A geofence auto punch-out ended a session early.");
    if (sessions.some((s) => s.closeReason === "shift_end")) {
      reasons.push("Punch-out was never recorded — the day was auto-closed at shift end.");
    }
  } else if (required != null) {
    reasons.push(
      `Hours met the requirement (${fmtHM(workedMs)} ≥ ${fmtHM(required * 60000)}) — the half day came from a late arrival or early departure rule, or an admin correction.`,
    );
  }

  if (!reasons.length) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/10 p-4">
      <div className="h-8 w-8 rounded-xl bg-warning/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="h-4 w-4 text-warning-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-black text-warning-foreground mb-1">Why half day</p>
        <ul className="space-y-1">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-foreground/80">
              <span className="shrink-0">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Banner for a day the fence closed, shown under the explainer. */
export function GeofenceExitBanner({ record }: { record: AttendanceRecord }) {
  if (!record.autoPunchOut) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
      <div className="h-8 w-8 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
        <MapPinOff className="h-4 w-4 text-destructive" />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-black text-destructive mb-0.5">Auto punch-out — geofence exit</p>
        <p className="text-[11px] leading-relaxed text-destructive/80">
          {record.autoPunchOutReason || "The employee left the assigned branch geo-fence area."}
        </p>
        {record.calculatedDistance != null && (
          <p className="mt-1 text-[10px] font-bold text-destructive/70">
            Distance from branch: {(record.calculatedDistance / 1000).toFixed(2)} km
          </p>
        )}
      </div>
    </div>
  );
}

/** Small inline confirmation that a day stayed inside the fence. */
export function InsideFenceNote({ record }: { record: AttendanceRecord }) {
  if (record.autoPunchOut || record.geoStatus !== "inside_geofence") return null;
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-bold text-success">
      <ShieldCheck className="h-3.5 w-3.5" />
      All punches were inside the branch geo-fence.
    </p>
  );
}
