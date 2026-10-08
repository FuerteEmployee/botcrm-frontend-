// The words used for a punch's origin and its flags, shared by the admin
// Attendance screens and the employee app so both say exactly the same thing
// about the same punch ("Shift end", "Sent 23 min late", ...). When an employee
// and an admin talk about a day, they must be reading the same labels.

/** Where a punch came from. */
export const CHANNEL_LABEL: Record<string, string> = {
  app: "Phone app",
  biometric: "Fingerprint machine",
  lens: "Face camera",
  system: "Automatic",
  admin: "Set by admin",
};

export interface PunchTag {
  label: string;
  /** One sentence explaining the label, for a tooltip or a second line. */
  hint: string;
  tone: "rose" | "amber" | "sky" | "slate";
}

const fmt = (v: string) =>
  new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

/** How a session was closed, when it was not a plain punch-out. */
export function closeTag(reason?: string | null): PunchTag | null {
  switch (reason) {
    case "auto_geofence":
      return { label: "Auto exit", hint: "Closed automatically: the phone showed you had left the work area.", tone: "rose" };
    case "shift_end":
      return { label: "Shift end", hint: "No punch-out was recorded, so the day was closed at shift end.", tone: "amber" };
    case "admin":
      return { label: "Set by admin", hint: "This time was entered or changed by your admin.", tone: "slate" };
    case "regularized":
      return { label: "Corrected", hint: "Changed after a correction request was approved.", tone: "sky" };
    default:
      return null;
  }
}

/** A machine punch recorded while the machine was offline and sent later. */
export function lateTag(at?: string | null, receivedAt?: string | null): PunchTag | null {
  if (!at || !receivedAt) return null;
  const mins = Math.max(1, Math.round((+new Date(receivedAt) - +new Date(at)) / 60000));
  const late = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  return {
    label: `Sent ${late} late`,
    hint: `Recorded on the machine at ${fmt(at)} while it was offline. It reached the server at ${fmt(receivedAt)}, ${late} later.`,
    tone: "sky",
  };
}
