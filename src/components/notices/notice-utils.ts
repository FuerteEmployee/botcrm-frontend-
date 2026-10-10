import type { Announcement, AudienceMode, QuestionKind } from "@/services/announcement-service";

export const QUESTION_LABEL: Record<QuestionKind, string> = {
  none: "No question",
  yes_no: "Yes / No",
  single: "Pick one",
  multiple: "Pick several (checkboxes)",
  number: "A number",
};

/** Short badge text for a notice with a question. */
export const QUESTION_BADGE: Record<QuestionKind, string> = {
  none: "",
  yes_no: "Yes/No poll",
  single: "Poll",
  multiple: "Checklist",
  number: "Number",
};

export const AUDIENCE_LABEL: Record<AudienceMode, { one: string; many: string; all?: string }> = {
  all: { one: "Everyone", many: "Everyone" },
  branches: { one: "branch", many: "branches" },
  departments: { one: "department", many: "departments" },
  shifts: { one: "shift", many: "shifts" },
  employees: { one: "employee", many: "employees" },
};

export function audienceText(a: Pick<Announcement, "audience">): string {
  const mode = a.audience?.mode || "all";
  if (mode === "all") return "Everyone";
  const n = a.audience?.ids?.length;
  const l = AUDIENCE_LABEL[mode];
  if (typeof n !== "number") return `Chosen ${l.many}`;
  return `${n} ${n === 1 ? l.one : l.many}`;
}

/** "12 Oct, 6:00 pm" in IST. */
export function fmtWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/** The employee's own answer in words ("Yes", "Garba, Dandiya", "3 passes"). */
export function answerText(a: Announcement): string {
  const ans = a.myResponse?.answer;
  if (!ans || !a.question) return "";
  if (a.question.kind === "number") {
    return typeof ans.number === "number"
      ? `${ans.number}${a.question.unit ? ` ${a.question.unit}` : ""}`
      : "";
  }
  const options = a.question.options || [];
  return (ans.choices || []).map((i) => options[i] ?? `Choice ${i + 1}`).join(", ");
}

/** The id of a populated ref or a plain id. */
export const refId = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "object" && v !== null && "_id" in v) return String((v as { _id: unknown })._id);
  return String(v);
};

export interface AudiencePerson {
  _id: string;
  name?: string;
  phone?: string;
  status?: string;
  branchId?: unknown;
  branchIds?: unknown[];
  departmentId?: unknown;
  shiftId?: unknown;
  shiftIds?: unknown[];
}

/** Same rule as the server's inAudience(): who a notice reaches. */
export function personInAudience(mode: AudienceMode, ids: string[], u: AudiencePerson): boolean {
  if (mode === "all") return true;
  const set = new Set(ids);
  if (mode === "employees") return set.has(u._id);
  if (mode === "branches")
    return [u.branchId, ...(u.branchIds || [])].some((x) => x && set.has(refId(x)));
  if (mode === "departments") return !!u.departmentId && set.has(refId(u.departmentId));
  if (mode === "shifts")
    return [u.shiftId, ...(u.shiftIds || [])].some((x) => x && set.has(refId(x)));
  return false;
}
