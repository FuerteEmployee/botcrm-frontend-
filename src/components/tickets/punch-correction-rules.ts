/**
 * Client copy of the "Forgot to punch in / out" rules, used ONLY to explain a
 * refusal before the employee presses Send. The server
 * (backend/src/utils/punch_correction.js) is the authority and re-checks
 * everything; if the two ever disagree, the server's message is what the
 * employee sees.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What GET /tickets/correction-context returns for one day. */
export interface CorrectionContext {
  date: string;
  today: string;
  earliest: string;
  windowDays: number;
  now: string;
  outOfWindow: string | null;
  hasAttendance: boolean;
  punchIn: string | null;
  punchOut: string | null;
  lastSessionPunchIn: string | null;
  lunchOutTime: string | null;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
    overnight: boolean;
    start: string;
    end: string;
  } | null;
  pendingPunchIn: boolean;
  pendingPunchOut: boolean;
}

export type CorrectionField = "punchIn" | "punchOut";

/** "9:30 AM" in IST for an instant. */
export function fmt12(iso: string | number | Date | null | undefined) {
  if (iso === null || iso === undefined) return "";
  const s = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const h = s.getUTCHours();
  const m = s.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "HH:mm" (24h) from a 12-hour pick, or null while incomplete. */
export function to24(hour: string, minute: string, ampm: "AM" | "PM"): string | null {
  if (!hour || minute === "") return null;
  const h12 = Number(hour);
  const m = Number(minute);
  if (!(h12 >= 1 && h12 <= 12) || !(m >= 0 && m <= 59)) return null;
  const h = (h12 % 12) + (ampm === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Split "HH:mm" (24h) into a 12-hour pick. */
export function from24(
  hhmm: string | null | undefined,
): { hour: string; minute: string; ampm: "AM" | "PM" } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const h = Number(m[1]);
  return { hour: String(h % 12 || 12), minute: m[2], ampm: h >= 12 ? "PM" : "AM" };
}

/** "HH:mm" in IST for an instant. */
export function istHHMM(iso: string | null | undefined) {
  return iso ? new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(11, 16) : "";
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * The instant a "HH:mm" picked for `dayKey` means. A night shift's times
 * before the middle of the off-duty gap belong to the next morning, exactly as
 * the server resolves them.
 */
export function correctionInstant(
  dayKey: string,
  hhmm: string,
  shift: CorrectionContext["shift"],
): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!d) return null;
  const min = toMinutes(hhmm);
  let t = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) - IST_OFFSET_MS + min * 60 * 1000;
  if (shift?.overnight) {
    const startMin = toMinutes(shift.startTime);
    const endMin = toMinutes(shift.endTime);
    if (min < endMin + (startMin - endMin) / 2) t += DAY_MS;
  }
  return t;
}

/** Why the server would refuse this pick, in the words it uses — or null. */
export function correctionProblem(
  field: CorrectionField,
  requested: number | null,
  ctx: CorrectionContext,
  now: number = Date.now(),
): string | null {
  if (ctx.outOfWindow) return ctx.outOfWindow;
  if (!ctx.hasAttendance)
    return "There is no attendance on this day. Please ask your admin to add it.";
  if (field === "punchIn" && ctx.pendingPunchIn) {
    return "You already asked to change your punch-in for this day. Please wait for your admin to answer.";
  }
  if (field === "punchOut" && ctx.pendingPunchOut) {
    return "You already asked to change your punch-out for this day. Please wait for your admin to answer.";
  }
  if (!ctx.punchIn) {
    return field === "punchIn"
      ? "There is no punch-in on this day to correct. Please ask your admin to add it."
      : "There is no punch-in on this day, so a punch-out cannot be added. Please ask your admin.";
  }
  if (requested === null) return null; // nothing picked yet: no complaint
  if (requested > now + 60 * 1000)
    return "That time has not come yet. Please pick a time that has already passed.";

  const recIn = +new Date(ctx.punchIn);
  if (field === "punchIn") {
    if (requested >= recIn) return `Please pick a time before your punch-in (${fmt12(recIn)}).`;
    if (ctx.shift && requested < +new Date(ctx.shift.start)) {
      return `Your shift starts at ${fmt12(ctx.shift.start)}. You cannot ask for a punch-in before that.`;
    }
    return null;
  }

  const after = ctx.lastSessionPunchIn ? +new Date(ctx.lastSessionPunchIn) : recIn;
  if (requested <= after) return `Please pick a time after you punched in (${fmt12(after)}).`;
  if (ctx.lunchOutTime) {
    const back = +new Date(ctx.lunchOutTime);
    if (back > after && requested <= back)
      return `Please pick a time after your lunch break ended (${fmt12(back)}).`;
  }
  if (ctx.shift && requested > +new Date(ctx.shift.end)) {
    return `Your shift ends at ${fmt12(ctx.shift.end)}. You cannot ask for a punch-out after that.`;
  }
  if (ctx.punchOut && Math.abs(+new Date(ctx.punchOut) - requested) < 60 * 1000) {
    return `Your punch-out is already ${fmt12(ctx.punchOut)}.`;
  }
  return null;
}
