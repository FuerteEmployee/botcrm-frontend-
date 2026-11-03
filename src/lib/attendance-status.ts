// How an attendance status is named and coloured, in one place.
//
// This logic was inline in four separate ternary chains, each ending in
// `"bg-destructive/10 text-destructive"` as the fallback — meaning ANY status
// the chain did not recognise rendered in the same red as Absent. That is the
// wrong default in a payroll product: a value the UI has not been taught about
// is an unknown, and showing an unknown as "absent" invents a fact about
// somebody's day that nobody asserted.
//
// The fallback here is deliberately neutral for that reason. Absent is red
// only when the record actually says absent.

export type AttendanceStatus =
  | "present"
  | "absent"
  | "half-day"
  | "late"
  | "wfh"
  | "needs_review";

/**
 * Human label. Only `needs_review` needs rewriting — the rest read correctly
 * once the surrounding element applies `capitalize`, and "Needs_review" is not
 * something to show an admin.
 */
export function statusLabel(status?: string | null): string {
  if (!status) return "—";
  if (status === "needs_review") return "Needs review";
  return status;
}

/**
 * Badge classes for a status.
 *
 * `needs_review` is intentionally neutral rather than red or amber: it is not
 * a worse grade than half-day, it is the absence of a grade. The day could not
 * be measured — a missing punch-out, a shift that could not be resolved — and
 * it is waiting on a person, not on the employee. Colouring it like a penalty
 * would tell an admin something untrue at a glance.
 */
export function statusClass(status?: string | null): string {
  switch (status) {
    case "present":
      return "bg-success/10 text-success";
    case "late":
    case "half-day":
      return "bg-warning/15 text-warning-foreground";
    case "wfh":
      return "bg-info/15 text-info";
    case "needs_review":
      return "bg-muted text-muted-foreground border border-border/60";
    case "absent":
      return "bg-destructive/10 text-destructive";
    default:
      // Unknown: neutral, never red. See the note at the top.
      return "bg-muted text-muted-foreground";
  }
}

/** Why a day is waiting on someone, for a tooltip next to the badge. */
export const NEEDS_REVIEW_HINT =
  "This day could not be measured automatically — usually a missing punch-out or an unresolved shift. It has not been graded and should not be paid from until someone checks it.";
