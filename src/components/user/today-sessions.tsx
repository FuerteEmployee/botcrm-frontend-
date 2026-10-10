import { LogIn, LogOut, History, Smartphone, Fingerprint, ScanFace, UserCog, MapPinOff, CloudOff, UtensilsCrossed, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, closeTag, lateTag, type PunchTag } from "@/lib/punch-labels";

/**
 * Today's punch sessions on the employee's own home screen.
 *
 * An employee who steps out and comes back has several in/out pairs in one day,
 * and until now the home screen showed only the first punch-in and the last
 * punch-out — so a day of 09:00→13:00 and 14:00→18:00 read as one unbroken
 * 09:00→18:00 stretch. The hours were always calculated correctly from the
 * sessions; they just were not visible to the person whose pay depends on them.
 * Somebody who cannot see their own break recorded has no way to notice a
 * missing punch until payday, which is far too late to fix it.
 */

export interface AttendanceSession {
  punchIn?: string;
  punchOut?: string;
  /** Metres from the nearest assigned branch at each end. */
  punchInDistance?: number | null;
  punchOutDistance?: number | null;
  punchInSource?: string | null;
  punchOutSource?: string | null;
  /** Set when a machine tap was recorded offline and reached the server later. */
  punchInReceivedAt?: string | null;
  punchOutReceivedAt?: string | null;
  workMs?: number | null;
  /** How the session closed: 'manual' | 'auto_geofence' | 'shift_end' | ... */
  closeReason?: string | null;
}

export interface NumberedSession extends AttendanceSession {
  /** 1-based, assigned in TIME order — see buildSessions. */
  n: number;
}

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "--:--";

/** "0h 0m" — matched to how the rest of the app writes durations. */
function fmtDuration(from?: string, to?: string, workMs?: number | null): string {
  const ms = workMs ?? (from && to ? +new Date(to) - +new Date(from) : 0);
  if (!Number.isFinite(ms) || ms <= 0) return "0h 0m";
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/** Metres under a kilometre, otherwise one decimal of a kilometre. */
function fmtDistance(m?: number | null): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/**
 * Normalise an attendance document into numbered, time-ordered sessions.
 *
 * Two things this has to get right, both learned from the stored data:
 *
 *  · `shifts[]` is NOT in chronological order. Rows written by the end-of-day
 *    job, an admin correction or a seeded import land at the end of the array
 *    whatever time they represent — one real document has an 11:37 session
 *    sitting after a 15:30–18:00 one. Numbering by array index would label them
 *    in an order the employee did not live through, so sort first and number
 *    after.
 *  · When `shifts[]` is empty the root punch IS the only session. That fallback
 *    mirrors allSessions() in the backend's shift_status.js, and the two must
 *    agree or the screen disagrees with the payslip.
 */
export function buildSessions(log?: {
  punchIn?: string;
  punchOut?: string;
  punchInDistance?: number | null;
  punchOutDistance?: number | null;
  punchInSource?: string | null;
  punchOutSource?: string | null;
  shifts?: AttendanceSession[];
} | null): NumberedSession[] {
  if (!log) return [];

  const raw = (log.shifts ?? []).filter((s) => s && s.punchIn);
  const base: AttendanceSession[] = raw.length > 0
    ? raw
    : log.punchIn
      ? [{
          // The root carries the same per-end detail as a shifts[] entry, and
          // dropping it here is what would make a perfectly ordinary
          // single-session day report "Location not recorded".
          punchIn: log.punchIn,
          punchOut: log.punchOut,
          punchInDistance: log.punchInDistance,
          punchOutDistance: log.punchOutDistance,
          punchInSource: log.punchInSource,
          punchOutSource: log.punchOutSource,
        }]
      : [];

  return [...base]
    .sort((a, b) => +new Date(a.punchIn!) - +new Date(b.punchIn!))
    .map((s, i) => ({ ...s, n: i + 1 }));
}

// ── shared marks: the same ones the admin Sessions list shows ────────────────

const CHANNEL_ICON: Record<string, typeof Smartphone> = {
  app: Smartphone,
  biometric: Fingerprint,
  lens: ScanFace,
  admin: UserCog,
  system: MapPinOff,
};

/** Small icon for where one end of a session came from. */
function ChannelIcon({ channel, className }: { channel?: string | null; className?: string }) {
  const Icon = channel ? CHANNEL_ICON[channel] : undefined;
  if (!Icon || !channel) return null;
  return (
    <span title={CHANNEL_LABEL[channel]} aria-label={CHANNEL_LABEL[channel]} className="inline-flex shrink-0">
      <Icon className={cn("h-3.5 w-3.5", className)} />
    </span>
  );
}

const TAG_TONE: Record<PunchTag["tone"], { dark: string; light: string }> = {
  rose: { dark: "border-rose-300/40 bg-rose-400/15 text-rose-200", light: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" },
  amber: { dark: "border-amber-300/40 bg-amber-400/15 text-amber-200", light: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" },
  sky: { dark: "border-sky-300/40 bg-sky-400/15 text-sky-200", light: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300" },
  slate: { dark: "border-white/20 bg-white/10 text-white/80", light: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" },
};

/** A flag on a punch: "Auto exit", "Shift end", "Sent 23 min late", ... */
export function TagPill({ tag, dark = false }: { tag: PunchTag; dark?: boolean }) {
  const late = tag.label.startsWith("Sent ");
  return (
    <span
      title={tag.hint}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-bold leading-tight whitespace-nowrap",
        dark ? TAG_TONE[tag.tone].dark : TAG_TONE[tag.tone].light,
      )}
    >
      {late && <CloudOff className="h-3 w-3" />}
      {tag.label}
    </span>
  );
}

// ── compact strip, inside the dark status card ────────────────────────────────

/**
 * Shown only once there is more than one session. A single-session day already
 * has its times in the punch-in/punch-out grid above, and repeating them as
 * "Session 1" adds a row that says nothing.
 */
export function TodaySessions({ sessions, minSessions = 2 }: { sessions: NumberedSession[]; minSessions?: number }) {
  if (sessions.length < minSessions) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {sessions.map((s) => {
        const open = !!s.punchIn && !s.punchOut;
        // The same flags the admin's Sessions list shows for this session.
        const tags = [
          lateTag(s.punchIn, s.punchInReceivedAt),
          s.punchOut ? lateTag(s.punchOut, s.punchOutReceivedAt) : null,
          s.punchOut ? closeTag(s.closeReason) : null,
        ].filter((t): t is PunchTag => !!t);
        return (
          <div
            key={`${s.n}-${s.punchIn}`}
            className={cn(
              "rounded-[14px] border px-3 py-2 backdrop-blur-md space-y-1",
              open ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-black/15",
            )}
          >
            <div className="flex items-center gap-2">
              <LogIn className={cn("h-3.5 w-3.5 shrink-0", open ? "text-emerald-300" : "text-white/50")} />
              {/* "S1", as on the admin's Sessions list, so both read the same;
                  the full word left no room for the times at 360px. */}
              <span title={`Session ${s.n}`} className="text-[12.5px] font-bold text-white/90 shrink-0">S{s.n}</span>

              <span className="flex items-center gap-1.5 text-[12.5px] text-white/80 tabular-nums min-w-0 whitespace-nowrap">
                <span>{fmtTime(s.punchIn)}</span>
                <ChannelIcon channel={s.punchInSource} className="text-white/50" />
                <span className="text-white/30">&rarr;</span>
                {open ? (
                  <span className="font-bold text-emerald-300">Live</span>
                ) : (
                  <>
                    <span>{fmtTime(s.punchOut)}</span>
                    <ChannelIcon channel={s.punchOutSource} className="text-white/50" />
                  </>
                )}
              </span>

              <span className="ml-auto text-[12px] font-mono font-semibold text-white/70 shrink-0">
                {open ? "working" : fmtDuration(s.punchIn, s.punchOut, s.workMs)}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-5">
                {tags.map((t, i) => <TagPill key={i} tag={t} dark />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── chronological activity list ───────────────────────────────────────────────

interface ActivityRow {
  kind: "in" | "out" | "lunch-start" | "lunch-end";
  /** Lunch read from machine or camera taps (the server's derivedFields). */
  byMachine?: boolean;
  at: string;
  distance?: number | null;
  session: number;
  closeReason?: string | null;
  source?: string | null;
  receivedAt?: string | null;
  open?: boolean;
}

// Where a punch came from, when it was not this app.
const DEVICE_LABEL: Record<string, string> = {
  biometric: CHANNEL_LABEL.biometric,
  lens: CHANNEL_LABEL.lens,
  admin: CHANNEL_LABEL.admin,
  system: CHANNEL_LABEL.system,
};

/**
 * Every punch today as a flat timeline.
 *
 * Separate from the session strip because it answers a different question: the
 * strip says "how long was each stretch", this says "what exactly did the system
 * record, and where was I standing". The distance is the part that settles
 * arguments — an employee who insists they were at the branch and a record
 * saying 1.4km apart is a conversation that cannot happen without it.
 */
export function TodayActivity({
  sessions,
  branchName,
  totalWorkMs,
  lunch,
}: {
  sessions: NumberedSession[];
  branchName?: string;
  /** The day's credited hours from the server, to explain any lunch deduction. */
  totalWorkMs?: number | null;
  /** The day's lunch, so it is listed like every other punch (it used to be missing). */
  lunch?: { start?: string | null; end?: string | null; startByMachine?: boolean; endByMachine?: boolean };
}) {
  const rows: ActivityRow[] = [];
  if (lunch?.start) rows.push({ kind: "lunch-start", at: lunch.start, session: 0, byMachine: lunch.startByMachine });
  if (lunch?.end) rows.push({ kind: "lunch-end", at: lunch.end, session: 0, byMachine: lunch.endByMachine });
  for (const s of sessions) {
    if (s.punchIn) rows.push({ kind: "in", at: s.punchIn, distance: s.punchInDistance, session: s.n, source: s.punchInSource, receivedAt: s.punchInReceivedAt, open: !s.punchOut });
    if (s.punchOut) {
      rows.push({
        kind: "out", at: s.punchOut, distance: s.punchOutDistance, session: s.n,
        closeReason: s.closeReason, source: s.punchOutSource, receivedAt: s.punchOutReceivedAt,
      });
    }
  }
  if (rows.length === 0) return null;

  rows.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-[18px] border border-slate-100 dark:border-white/5 shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/5">
        <History className="h-3.5 w-3.5 text-[#8C2059] dark:text-pink-400" />
        <span className="text-[14px] font-bold text-slate-700 dark:text-slate-200">Today's punches</span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {rows.map((r, i) => {
          if (r.kind === "lunch-start" || r.kind === "lunch-end") {
            return (
              <div key={`${r.kind}-${r.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Coffee className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {r.kind === "lunch-start" ? "Lunch started" : "Back from lunch"}
                    <span className="text-slate-400 font-normal"> &mdash; </span>
                    <span className="tabular-nums">{fmtTime(r.at)}</span>
                  </p>
                  <p className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 truncate">
                    {r.byMachine ? (
                      <>
                        <Fingerprint className="h-3 w-3 text-slate-400" />
                        On machine or camera
                      </>
                    ) : (
                      <>
                        <ChannelIcon channel="app" className="h-3 w-3 text-slate-400" />
                        {CHANNEL_LABEL.app}
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          }
          const dist = fmtDistance(r.distance);
          // An auto punch-out was not something the employee did, and labelling
          // it identically to one they pressed is how "I never punched out"
          // turns into an argument nobody can settle.
          // A machine tap is the employee's own action, just not in this app.
          const device = r.source ? DEVICE_LABEL[r.source] : undefined;
          // The same flags the admin's Sessions list shows for this punch.
          const tags = [
            lateTag(r.at, r.receivedAt),
            r.kind === "out" ? closeTag(r.closeReason) : null,
          ].filter((t): t is PunchTag => !!t);

          return (
            <div key={`${r.kind}-${r.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                  r.kind === "in"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                )}
              >
                {r.kind === "in" ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {r.kind === "in" ? "Punched in" : "Punched out"}
                  <span className="text-slate-400 font-normal"> &mdash; </span>
                  <span className="tabular-nums">{fmtTime(r.at)}</span>
                  {r.open && <span className="ml-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Live</span>}
                </p>
                <p className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 truncate">
                  <ChannelIcon channel={r.source || "app"} className="h-3 w-3 text-slate-400" />
                  {device ?? (dist ? `${CHANNEL_LABEL.app} · ${dist} from ${branchName || "branch"}` : `${CHANNEL_LABEL.app} · location not recorded`)}
                </p>
                {tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.map((t, k) => <TagPill key={k} tag={t} />)}
                  </div>
                )}
                {r.receivedAt && (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-sky-700 dark:text-sky-300">
                    The machine was offline. It saved this punch and sent it at {fmtTime(r.receivedAt)}.
                  </p>
                )}
              </div>

              {/* "S1" means nothing to most people, and on a one-session
                  day there is nothing to tell apart. */}
              {sessions.length > 1 && (
                <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-full px-2 py-0.5">
                  S{r.session}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Same as the admin's Sessions panel: when the server credited less
          than the sessions add up to, the difference is the unpaid lunch, and
          saying so is what stops "the app shows 1h 16m but I was paid 17m". */}
      <LunchSummary sessions={sessions} totalWorkMs={totalWorkMs} />
    </div>
  );
}

function LunchSummary({ sessions, totalWorkMs }: { sessions: NumberedSession[]; totalWorkMs?: number | null }) {
  const summed = sessions.reduce((n, s) => n + (s.workMs || 0), 0);
  const deducted = typeof totalWorkMs === "number" && summed > 0 && summed - totalWorkMs >= 60000 ? summed - totalWorkMs : null;
  if (deducted === null || typeof totalWorkMs !== "number") return null;
  const hm = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return (
    <div className="border-t border-slate-100 dark:border-white/5 px-4 py-2.5 text-[12.5px] space-y-0.5">
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span>Sessions add up to</span>
        <span className="font-mono font-semibold">{hm(summed)}</span>
      </div>
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><UtensilsCrossed className="h-3 w-3" /> Unpaid lunch</span>
        <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">-{hm(deducted)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-1 mt-1 font-bold text-slate-700 dark:text-slate-200">
        <span>Counted for pay</span>
        <span className="font-mono">{hm(totalWorkMs)}</span>
      </div>
    </div>
  );
}
