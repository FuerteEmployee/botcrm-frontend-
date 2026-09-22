import { useState } from "react";
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
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, toISTDateKey } from "@/lib/utils";
import { statusLabel, statusClass, NEEDS_REVIEW_HINT } from "@/lib/attendance-status";
import type { AttendanceRecord, AttendanceSession, PunchChannel } from "@/services/attendance-service";

// Read-only blocks for the Attendance Dashboard detail sheet.
//
// Everything here mirrors server-side maths that already exists, so the two
// must not drift: worked time comes from `totalWorkMs` (already lunch-deducted
// and shift-clamped by utils/shift_status.js) rather than being recomputed from
// punchIn/punchOut, and the required-hours figure repeats the backend's
// `requiredWorkMs`: shift span - configured lunch - grace.
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
export function SessionTimeline({
  sessions,
  onAutoExitClick,
  totalWorkMs,
}: {
  sessions: AttendanceSession[];
  /**
   * Open this session's auto punch-out detail. Supplied by the detail sheet;
   * without it the badge stays a plain badge, so the component is still usable
   * anywhere that has nothing to open.
   */
  onAutoExitClick?: (sessionIndex: number) => void;
  /**
   * The day's credited total. When supplied, any gap between it and the sum of
   * the sessions above is shown and named.
   *
   * Observed 2026-09-17: four sessions reading 5h06 + 1h35 + 0h54 + 0h17 sat
   * directly above a total of 7h23. They sum to 7h52. The missing 29 minutes
   * were the unpaid lunch, deducted server-side by lunchDeductionMs and
   * mentioned nowhere on the screen -- so the panel looked like it could not
   * add up, and the employee it belonged to had punched no lunch at all.
   *
   * Derived from the two figures rather than fetched: the deduction is whatever
   * the server did NOT credit, so this can never disagree with payroll the way
   * a second client-side lunch calculation would.
   */
  totalWorkMs?: number | null;
}) {
  if (!sessions.length) return null;

  const summed = sessions.reduce((n, s) => n + (s.workMs || 0), 0);
  // Only worth showing when it is both real and unexplained by rounding.
  const deducted =
    typeof totalWorkMs === "number" && summed > 0 && summed - totalWorkMs >= 60000
      ? summed - totalWorkMs
      : null;

  return (
    <div className="space-y-2">
      <p className={LABEL}>Sessions</p>
      {sessions.map((s, i) => {
        const open = !!s.punchIn && !s.punchOut;
        const autoExit = s.closeReason === "auto_geofence";
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

              {s.workMs != null && (
                <span className="ml-auto text-muted-foreground font-bold">{fmtHM(s.workMs)}</span>
              )}

              {autoExit &&
                (onAutoExitClick ? (
                  // Clickable, because on a multi-exit day the badge is the
                  // only thing that identifies WHICH close an admin means.
                  // A single day-level panel cannot answer "why did S1 close?"
                  // when S4 also closed itself.
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onAutoExitClick(i);
                    }}
                    title="Show why this session was closed automatically"
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0 text-[9px] font-black uppercase text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    Auto exit
                    <ArrowRight className="h-2.5 w-2.5" />
                  </button>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-destructive/25 bg-destructive/10 text-destructive text-[9px] font-black uppercase px-1.5 py-0"
                  >
                    Auto exit
                  </Badge>
                ))}
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

      {deducted !== null && (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-[11px] font-semibold space-y-0.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Sessions add up to</span>
            <span className="font-mono font-bold text-foreground/70">{fmtHM(summed)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UtensilsCrossed className="h-3 w-3 shrink-0 opacity-60" />
              Unpaid lunch
            </span>
            <span className="font-mono font-bold text-destructive">-{fmtHM(deducted)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border/40 pt-1 mt-1">
            <span className="font-black text-foreground/80">Credited</span>
            <span className="font-mono font-black text-primary">{fmtHM(totalWorkMs || 0)}</span>
          </div>
          <p className="text-[9px] font-normal text-muted-foreground/80 pt-0.5 leading-relaxed">
            Set by the shift's Lunch Break rule. "Calculate from punches" deducts only a break that
            was actually taken.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export function DayStatsRow({
  record,
  displayStatus,
}: {
  record: AttendanceRecord;
  displayStatus: string;
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
        <p className="text-[13px] font-black text-primary">{fmtHM(record.totalWorkMs)}</p>
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
        {/* statusClass/statusLabel, not a local ternary chain.
            This was the last copy of the chain that ended in
            `bg-destructive/10` for anything it did not recognise -- so
            `needs_review` rendered in the same red as Absent, telling an admin
            the employee did not turn up when in fact the day carries a real
            punch and is waiting on a human. Every other surface was migrated to
            the shared helper; this one was missed. */}
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] font-black uppercase capitalize border-transparent",
            displayStatus === "on-duty"
              ? "bg-blue-500/10 text-blue-600"
              : statusClass(record.status),
          )}
          title={record.status === "needs_review" ? NEEDS_REVIEW_HINT : undefined}
        >
          {displayStatus === "on-duty" ? "On Duty" : statusLabel(record.status)}
        </Badge>
        {record.isWFH && (
          <Badge
            variant="outline"
            title="Worked from home — branch distance not checked, exempt from auto punch-out."
            className="ml-1 border-transparent bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase"
          >
            WFH
          </Badge>
        )}
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
export function AutoPunchOutCard({
  record,
  onRevert,
  focusIndex,
  onFocusChange,
}: {
  record: AttendanceRecord;
  onRevert?: () => void;
  /** Index into `record.shifts` of the exit to open, set by the session badge. */
  focusIndex?: number | null;
  onFocusChange?: (index: number | null) => void;
}) {
  // Hooks must run unconditionally, so the early return lives below them.
  const [localOpen, setLocalOpen] = useState<number | null>(null);

  const sessions = record.shifts || [];

  // EVERY auto exit, each carrying its own index so the session list can point
  // at one. A day can hold several: the engine closes a session, the employee
  // punches back in, and it closes again. Rendering only the first (or only the
  // day-level fields) is what made a multi-exit day unexplainable.
  const exits = sessions
    .map((s, i) => ({ session: s, index: i }))
    .filter((e) => e.session.closeReason === "auto_geofence");

  // Legacy shape: a single-session day keeps its close on the root and has no
  // shifts[] entry to read, so fall back to the day-level fields.
  const items =
    exits.length === 0
      ? [
          {
            index: -1,
            at: record.punchOut ?? null,
            // `punchOutLocation` is typed `string | {lat,lng}`: older rows put
            // the raw coordinate in the location field. Rendering that object
            // directly prints "[object Object]", so split it by shape -- a
            // string is a place name, an object is a position.
            coords:
              record.punchOutCoordinates ??
              (typeof record.punchOutLocation === "object" ? record.punchOutLocation : null) ??
              null,
            distance: record.calculatedDistance ?? record.punchOutDistance ?? null,
            accuracy: record.punchOutAccuracy ?? null,
            fixAt: record.punchOutFixAt ?? null,
            location:
              typeof record.punchOutLocation === "string" ? record.punchOutLocation : null,
            reason: record.autoPunchOutReason ?? null,
          },
        ]
      : exits.map((e, n) => {
          // The LAST exit is the one the day-level fields describe: the engine
          // overwrites calculatedDistance / autoPunchOutReason / punchOutFixAt
          // on each close, so they end up holding the final decision. Reading
          // them for an EARLIER exit is what produced a banner showing S1's
          // time and coordinates beside S4's 731 m and S3's +/-19 m -- an
          // accuracy figure belonging to a MANUAL punch-out. Four values, three
          // different events, presented as one decision.
          //
          // So: a session's own fields, and the day-level fields only for the
          // exit they actually describe. A missing number renders as absent
          // rather than borrowing a neighbour's -- this panel exists to justify
          // a punch-out the employee did not make, and a plausible wrong number
          // is worse here than no number at all.
          const isLast = n === exits.length - 1;
          return {
            index: e.index,
            at: e.session.punchOut ?? null,
            coords: e.session.punchOutCoordinates ?? null,
            distance:
              e.session.punchOutDistance ?? (isLast ? record.calculatedDistance ?? null : null),
            accuracy: e.session.punchOutAccuracy ?? null,
            fixAt: isLast ? record.punchOutFixAt ?? null : null,
            location: e.session.punchOutLocation ?? null,
            reason: isLast ? record.autoPunchOutReason ?? null : null,
          };
        });

  if (!record.autoPunchOut) return null;

  // One exit needs no picking. Several start collapsed so the list reads as a
  // list, and the session badge opens the one the admin clicked.
  const openIndex = focusIndex !== undefined && focusIndex !== null ? focusIndex : localOpen;
  const setOpen = (i: number | null) => {
    setLocalOpen(i);
    onFocusChange?.(i);
  };
  const single = items.length === 1;

  const employeeId = record.employeeId?._id;
  const dateKey = record.date ? toISTDateKey(record.date) : undefined;

  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-warning-foreground">
          <AlertTriangle className="h-4 w-4" />
          Auto punch-out
        </span>
        {items.length > 1 && (
          <Badge
            variant="outline"
            className="border-warning/30 bg-warning/15 text-warning-foreground text-[9px] font-black uppercase px-1.5 py-0"
          >
            {items.length} exits this day
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const expanded = single || openIndex === item.index;
          const canMap =
            !!employeeId &&
            typeof item.coords?.lat === "number" &&
            typeof item.coords?.lng === "number";
          const outAt = item.at ? new Date(item.at) : null;
          const fixAt = item.fixAt ? new Date(item.fixAt) : null;
          // Only meaningful when the fix PRECEDES the close. A negative value
          // means the two belong to different events and must not be shown.
          const staleMin =
            fixAt && outAt && outAt.getTime() >= fixAt.getTime()
              ? Math.round((outAt.getTime() - fixAt.getTime()) / 60000)
              : null;

          return (
            <div
              key={item.index}
              id={item.index >= 0 ? `auto-exit-${item.index}` : undefined}
              className={cn(
                "rounded-xl border transition-colors",
                expanded
                  ? "border-warning/30 bg-background/60"
                  : "border-border/40 bg-background/30",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(expanded && !single ? null : item.index)}
                disabled={single}
                className={cn(
                  "w-full flex items-center gap-2 flex-wrap px-3 py-2 text-left",
                  !single && "hover:bg-warning/10 rounded-xl",
                )}
              >
                {item.index >= 0 && (
                  <span className="text-[11px] font-black text-foreground/70">
                    S{item.index + 1}
                  </span>
                )}
                <span className="text-[11px] font-bold text-warning-foreground">
                  {outAt ? fmtTime(item.at) : "—"}
                </span>
                {item.distance != null && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-warning-foreground">
                    <RouteIcon className="h-3.5 w-3.5" />
                    {Math.round(item.distance)} m from branch
                  </span>
                )}
                {item.accuracy != null && (
                  <span
                    title={
                      item.accuracy > 35
                        ? "Low-quality fix — the position was uncertain by this many metres"
                        : "GPS accuracy at the moment of the close"
                    }
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-bold",
                      item.accuracy > 35 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <Satellite className="h-3.5 w-3.5" />
                    {"±"}
                    {Math.round(item.accuracy)} m
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
                {!single && (
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground">
                    {expanded ? "Hide" : "Why"}
                  </span>
                )}
              </button>

              {expanded && (
                <div className="px-3 pb-3 space-y-2">
                  {item.location ? (
                    <p className="flex items-start gap-1.5 text-[11px] font-medium text-foreground/80">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item.location}</span>
                    </p>
                  ) : (
                    canMap && (
                      <p className="flex items-start gap-1.5 text-[11px] font-mono text-foreground/70">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          {item.coords!.lat!.toFixed(5)}, {item.coords!.lng!.toFixed(5)}
                        </span>
                      </p>
                    )
                  )}

                  {item.reason && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {item.reason}
                    </p>
                  )}

                  {canMap ? (
                    <Link
                      to="/tracking"
                      search={{
                        employeeId,
                        // toISTDateKey, not slice(0,10): the stored date is IST
                        // midnight, so its UTC date is always the previous day
                        // and the link pointed the map at the wrong one.
                        date: dateKey,
                        // THIS exit's coordinates, so a multi-exit day focuses
                        // the pin the admin actually clicked rather than
                        // whichever one happened to be first.
                        exitLat: item.coords!.lat,
                        exitLng: item.coords!.lng,
                        exitAt: item.at ? new Date(item.at).toISOString() : undefined,
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <RouteIcon className="h-3.5 w-3.5" /> Show on map {"—"} why this happened
                    </Link>
                  ) : (
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      No coordinates were stored for this close, so it cannot be shown on the map.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
          <Undo2 className="h-3.5 w-3.5" /> This was wrong {"—"} undo
        </button>
      )}
    </div>
  );
}

// ─── Shift requirement + why half day ────────────────────────────────────────

export function ShiftRequirementCard({
  shift,
  lunchMins,
  graceMins,
  workedMs,
}: {
  shift: ShiftLike | null | undefined;
  lunchMins: number;
  graceMins: number;
  workedMs: number;
}) {
  const required = requiredMinutes(shift, lunchMins, graceMins);
  const span = shiftSpanMinutes(shift);
  const workedMins = Math.round((workedMs || 0) / 60000);

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
              )}
            >
              {fmtHM(workedMs)}
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
}: {
  record: AttendanceRecord;
  sessions: AttendanceSession[];
  shift: ShiftLike | null | undefined;
  lunchMins: number;
  graceMins: number;
}) {
  if (record.status !== "half-day") return null;

  const required = requiredMinutes(shift, lunchMins, graceMins);
  const workedMins = Math.round((record.totalWorkMs || 0) / 60000);
  const reasons: string[] = [];

  if (required != null && workedMins < required) {
    reasons.push(
      `Worked ${fmtHM(record.totalWorkMs)} — ${required - workedMins} min short of the required ${fmtHM(required * 60000)}.`,
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
      `Hours met the requirement (${fmtHM(record.totalWorkMs)} ≥ ${fmtHM(required * 60000)}) — the half day came from a late arrival or early departure rule, or an admin correction.`,
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
