import { LogIn, LogOut, History } from "lucide-react";
import { cn } from "@/lib/utils";

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

// ── compact strip, inside the dark status card ────────────────────────────────

/**
 * Shown only once there is more than one session. A single-session day already
 * has its times in the punch-in/punch-out grid above, and repeating them as
 * "Session 1" adds a row that says nothing.
 */
export function TodaySessions({ sessions }: { sessions: NumberedSession[] }) {
  if (sessions.length < 2) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {sessions.map((s) => {
        const open = !!s.punchIn && !s.punchOut;
        return (
          <div
            key={`${s.n}-${s.punchIn}`}
            className={cn(
              "flex items-center gap-2.5 rounded-[14px] border px-3 py-2 backdrop-blur-md",
              open ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-black/15",
            )}
          >
            <LogIn className={cn("h-3.5 w-3.5 shrink-0", open ? "text-emerald-300" : "text-white/50")} />
            <span className="text-[12.5px] font-semibold text-white/90 shrink-0">Session {s.n}</span>

            <span className="flex items-center gap-1.5 text-[12.5px] text-white/80 tabular-nums min-w-0">
              <span className="truncate">{fmtTime(s.punchIn)}</span>
              <span className="text-white/30">&rarr;</span>
              <span className="truncate">{open ? "now" : fmtTime(s.punchOut)}</span>
            </span>

            <span className="ml-auto text-[12px] font-mono font-semibold text-white/70 shrink-0">
              {open ? "working" : fmtDuration(s.punchIn, s.punchOut, s.workMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── chronological activity list ───────────────────────────────────────────────

interface ActivityRow {
  kind: "in" | "out";
  at: string;
  distance?: number | null;
  session: number;
  closeReason?: string | null;
  source?: string | null;
}

// Where a punch came from, when it was not this app.
const DEVICE_LABEL: Record<string, string> = { biometric: "Fingerprint machine", lens: "Face camera" };

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
}: {
  sessions: NumberedSession[];
  branchName?: string;
}) {
  const rows: ActivityRow[] = [];
  for (const s of sessions) {
    if (s.punchIn) rows.push({ kind: "in", at: s.punchIn, distance: s.punchInDistance, session: s.n, source: s.punchInSource });
    if (s.punchOut) {
      rows.push({
        kind: "out", at: s.punchOut, distance: s.punchOutDistance, session: s.n,
        closeReason: s.closeReason, source: s.punchOutSource,
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
          const dist = fmtDistance(r.distance);
          // An auto punch-out was not something the employee did, and labelling
          // it identically to one they pressed is how "I never punched out"
          // turns into an argument nobody can settle.
          // A machine tap is the employee's own action, just not in this app.
          const device = r.source ? DEVICE_LABEL[r.source] : undefined;
          const auto = r.kind === "out" && !!r.closeReason && r.closeReason !== "manual" && r.closeReason !== "device";

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
                </p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                  {device ?? (dist ? `${dist} from ${branchName || "branch"}` : "Location not recorded")}
                  {auto && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      {" "}&middot; {r.closeReason === "auto_geofence" ? "auto: you left the area" : "closed by the system"}
                    </span>
                  )}
                </p>
              </div>

              {/* "S1" means nothing to most people, and on a one-session
                  day there is nothing to tell apart. */}
              {sessions.length > 1 && (
                <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-full px-2 py-0.5">
                  Session {r.session}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
