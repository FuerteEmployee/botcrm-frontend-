import {
  DEFAULT_ATTENDANCE_EXCEPTIONS,
  DEFAULT_SALARY_COMPONENTS,
  weeklyHolidaysFromWorkDays,
} from "@/lib/employee-defaults";

/*
 * Excel/CSV -> employee payloads for the bulk import on the Employees page.
 *
 * Pure: no React, no network, no xlsx. The dialog reads the sheet and hands
 * the rows in; every row comes back either ready (with the exact body the Add
 * Employee form would have sent), already in the company, or with the reasons
 * it cannot be used. The server still re-checks everything on save -- this
 * only exists so an admin sees every problem before anything is written,
 * instead of finding out row by row.
 *
 * Every field on the Add Employee form has a column. A blank optional cell
 * means "what the form would have started with", so a sheet with only the
 * required columns gives the same employees as typing them in one by one.
 */

export const MAX_IMPORT_ROWS = 500;

export interface ImportColumn {
  key: string;
  header: string;
  section: string;
  help: string;
  sample: string;
  required?: boolean;
  aliases?: string[];
}

// Salary component keys in the form's own order, with the form's own labels.
export const SALARY_COMPONENT_COLUMNS: { key: string; header: string }[] = [
  { key: "basic", header: "BASIC" },
  { key: "da", header: "DA" },
  { key: "hra", header: "HRA" },
  { key: "ca", header: "CONVEYANCE ALLOWANCE" },
  { key: "pf", header: "PF" },
  { key: "esic", header: "ESIC" },
  { key: "epf", header: "EPF" },
  { key: "tdsOnProfession", header: "TDS ON PROFESSION" },
  { key: "retention", header: "RETENTION" },
  { key: "pt", header: "PROFESSIONAL TAX" },
  { key: "adminCharge", header: "ADMIN CHARGE" },
  { key: "bonus", header: "BONUS" },
  { key: "tds", header: "TDS" },
];

const COMPONENT_HELP =
  "Blank = the default (or the salary template). Write 50% for a percentage, Rs 2000 or ₹2000 for a fixed amount, Off to switch it off. Add \"excl\" (e.g. 10% excl) to leave it out of the total.";

export const IMPORT_COLUMNS: ImportColumn[] = [
  // General Details
  { key: "name", header: "NAME", section: "General", required: true, sample: "Ravi Kumar", help: "Full name.", aliases: ["FULL NAME", "EMPLOYEE NAME"] },
  { key: "phone", header: "PHONE", section: "General", required: true, sample: "9876543210", help: "10-digit mobile number. This is their login, so it must be unique.", aliases: ["MOBILE", "PHONE NUMBER", "MOBILE NUMBER"] },
  { key: "email", header: "EMAIL", section: "General", sample: "ravi@example.com", help: "Optional.", aliases: ["EMAIL ADDRESS"] },
  { key: "gender", header: "GENDER", section: "General", sample: "Male", help: "Male or Female. Blank = Male, as on the form." },
  { key: "dob", header: "DATE OF BIRTH", section: "General", sample: "15-08-1995", help: "DD-MM-YYYY, YYYY-MM-DD or an Excel date.", aliases: ["DOB"] },

  // Employment Terms
  { key: "employmentType", header: "PAY TYPE", section: "Employment", sample: "Monthly", help: "Monthly, Daily or Hourly. Blank = Monthly.", aliases: ["EMPLOYMENT TYPE"] },
  { key: "salary", header: "SALARY", section: "Employment", required: true, sample: "25000", help: "Whole rupees: per month, per day or per hour, by pay type.", aliases: ["SALARY AMOUNT"] },
  { key: "joiningDate", header: "JOINING DATE", section: "Employment", sample: "01-10-2026", help: "Blank = today, as on the form." },
  { key: "deviceUserId", header: "BIOMETRIC ID", section: "Employment", sample: "", help: "The PIN they are enrolled under on the fingerprint/face machine. Must be unique.", aliases: ["BIOMETRIC DEVICE ID", "DEVICE ID"] },
  { key: "branch", header: "BRANCH", section: "Employment", sample: "", help: "Branch name exactly as in Branches. Can be blank if you have only one.", aliases: ["BRANCHES", "BRANCH LOCATION"] },
  { key: "department", header: "DEPARTMENT", section: "Employment", sample: "", help: "Department name exactly as in Departments. Can be blank if you have only one." },
  { key: "shift", header: "SHIFT", section: "Employment", sample: "", help: "Shift name. Several separated by commas; the first is used for attendance timing. Blank = your default shift.", aliases: ["SHIFTS"] },

  // Weekly holidays and attendance exceptions
  { key: "weeklyHolidays", header: "WEEKLY HOLIDAYS", section: "Attendance", sample: "Sunday", help: "Blank = your company's non-working days. e.g. \"Sunday\" or \"Sunday, Saturday (2,4)\" for the 2nd and 4th Saturday. \"None\" = no override, let the shift decide. Any day listed replaces the shift's and company's working days for this employee." },
  { key: "requireLocation", header: "REQUIRE LOCATION", section: "Attendance", sample: "", help: "Yes/No. Fill this or REMOTE PUNCH only to give this employee their own rules; blank = company rule." },
  { key: "remotePunch", header: "REMOTE PUNCH", section: "Attendance", sample: "", help: "Yes/No. Yes lets them punch from anywhere AND exempts them from auto punch-out. Blank = company rule." },
  { key: "geofenceExempt", header: "EXEMPT FROM AUTO PUNCH-OUT", section: "Attendance", sample: "", help: "Yes/No. For field staff. Blank = No." },

  // Personal Details
  { key: "bloodGroup", header: "BLOOD GROUP", section: "Personal", sample: "B+", help: "Optional." },
  { key: "education", header: "EDUCATION", section: "Personal", sample: "", help: "Optional." },
  { key: "aadhaarNo", header: "AADHAAR NO", section: "Personal", sample: "", help: "Optional. Format the column as Text in Excel.", aliases: ["AADHAAR NUMBER", "AADHAR NO", "AADHAR NUMBER"] },
  { key: "panNo", header: "PAN NO", section: "Personal", sample: "", help: "Optional.", aliases: ["PAN NUMBER", "PAN"] },
  { key: "experience", header: "EXPERIENCE", section: "Personal", sample: "", help: "Optional, e.g. 2 years.", aliases: ["TOTAL EXPERIENCE"] },

  // Contact Information
  { key: "address", header: "CURRENT ADDRESS", section: "Contact", sample: "", help: "Optional.", aliases: ["ADDRESS"] },
  { key: "residentialAddress", header: "RESIDENTIAL ADDRESS", section: "Contact", sample: "", help: "Optional (permanent address).", aliases: ["PERMANENT ADDRESS"] },
  { key: "residentialPhone", header: "RESIDENTIAL PHONE", section: "Contact", sample: "", help: "Optional." },
  { key: "contactPersonName", header: "EMERGENCY CONTACT NAME", section: "Contact", sample: "", help: "Optional.", aliases: ["CONTACT PERSON NAME"] },
  { key: "contactPersonMobile", header: "EMERGENCY CONTACT MOBILE", section: "Contact", sample: "", help: "Optional.", aliases: ["CONTACT PERSON MOBILE"] },

  // Bank Information
  { key: "accountNumber", header: "BANK ACCOUNT NO", section: "Bank", sample: "", help: "Optional. Format the column as Text in Excel, or long numbers get rounded.", aliases: ["ACCOUNT NUMBER", "BANK ACCOUNT NUMBER"] },
  { key: "bankName", header: "BANK NAME", section: "Bank", sample: "", help: "Optional." },
  { key: "ifsc", header: "IFSC", section: "Bank", sample: "", help: "Optional.", aliases: ["IFSC CODE"] },
  { key: "bankBranchName", header: "BANK BRANCH", section: "Bank", sample: "", help: "Optional." },
  { key: "nameAsPerBank", header: "NAME AS PER BANK", section: "Bank", sample: "", help: "Optional." },

  // Permissions
  { key: "leadDeletionPermission", header: "LEAD DELETION", section: "Permissions", sample: "", help: "Yes/No. Blank = No." },

  // Salary Configuration
  { key: "salaryTemplate", header: "SALARY TEMPLATE", section: "Salary", sample: "", help: "Name of a salary template from Settings. Applied first; the component columns below then override it." },
  ...SALARY_COMPONENT_COLUMNS.map((c) => ({ key: `comp:${c.key}`, header: c.header, section: "Salary", sample: "", help: COMPONENT_HELP })),
  { key: "tdsCategory", header: "TDS CATEGORY", section: "Salary", sample: "", help: "Optional, e.g. 92B." },
];

export interface ImportContext {
  branches: { _id: string; branchName: string }[];
  departments: { _id: string; name: string }[];
  shifts: { _id: string; name: string }[];
  /** Everyone already in the company, inactive included. */
  existing: { name: string; phone?: string; deviceUserId?: string | null }[];
  allowMultipleBranches: boolean;
  defaultShiftId?: string | null;
  workDays?: string[] | null;
  /** The company's own attendance rules, used when only one of the two exception columns is filled. */
  companyRequireLocation?: boolean;
  companyRemotePunch?: boolean;
  salaryTemplates?: { name: string; components: Record<string, unknown> }[];
  /** Today in India, YYYY-MM-DD. */
  today: string;
}

export type ImportRowStatus = "ready" | "exists" | "error";

export interface ImportRow {
  /** Row number as Excel shows it. */
  row: number;
  /** The cells as read, keyed by the file's own headers, for the "rows not added" download. */
  source: Record<string, unknown>;
  name: string;
  phone: string;
  branch: string;
  department: string;
  shift: string;
  salary: number | null;
  status: ImportRowStatus;
  problems: string[];
  payload: Record<string, unknown> | null;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; ignoredHeaders: string[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------- cells

export const normalizeHeader = (h: string) =>
  String(h).toUpperCase().replace(/[*.:]/g, "").replace(/[_\s]+/g, " ").trim();

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v).trim();
}

/** Excel stores at most 15 significant digits; a longer number typed into a General cell is already wrong. */
function isRoundedNumber(v: unknown) {
  return typeof v === "number" && Math.abs(v) >= 1e15;
}

const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date cell as YYYY-MM-DD. undefined = blank, null = not a date.
 * Text is read the Indian way round (DD-MM-YYYY); 05-10-2026 is 5 October.
 */
export function parseDateCell(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // A date cell comes back as local midnight, give or take a few seconds of
    // float error or a historic timezone offset; reading it at noon lands on
    // the intended day either way.
    const noon = new Date(v.getTime() + 12 * 3600 * 1000);
    return ymd(noon.getFullYear(), noon.getMonth() + 1, noon.getDate());
  }
  if (typeof v === "number") {
    // An Excel serial day number (1 = 1900-01-01) in a cell not formatted as a date.
    if (v < 1 || v > 73050) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  if (!s) return undefined;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s,-]+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return month < 0 ? null : ymd(+m[3], month + 1, +m[1]);
  }
  return null;
}

/** 10-digit mobile from "+91 98765 43210", "09876543210", 9876543210 ... or null. */
export function normalizePhone(v: unknown): string | null {
  let digits = cellText(v).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** true / false, undefined for blank, null for anything else. */
export function parseYesNo(v: unknown): boolean | null | undefined {
  const s = cellText(v).toLowerCase();
  if (!s) return undefined;
  if (["yes", "y", "true", "1", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "off"].includes(s)) return false;
  return null;
}

/** Whole rupees from "25,000", "Rs. 25000", "₹25000", 25000. */
function parseRupees(v: unknown): number | null | undefined {
  const s = cellText(v).replace(/^(rs\.?|inr|₹)\s*/i, "").replace(/[,\s₹]/g, "");
  if (!s) return undefined;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const WEEKDAYS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/**
 * "Sunday, Saturday (2,4)" -> [{ day: "Sunday", weeks: [] }, { day: "Saturday", weeks: [2, 4] }].
 * undefined = blank (use the company's), [] = "None".
 */
export function parseWeeklyHolidays(v: unknown): { day: string; weeks: number[] }[] | undefined | string {
  const s = cellText(v);
  if (!s) return undefined;
  if (/^(none|no|-)$/i.test(s)) return [];
  const out: { day: string; weeks: number[] }[] = [];
  const re = /([A-Za-z]+)\s*(?:\(([^)]*)\))?/g;
  const leftover = s.replace(re, "").replace(/[,;/&\s]|and/gi, "");
  if (leftover) return `Weekly holidays: could not read "${s}". Write days like "Sunday" or "Sunday, Saturday (2,4)".`;
  for (const m of s.matchAll(re)) {
    if (/^and$/i.test(m[1])) continue;
    const day = WEEKDAYS[m[1].slice(0, 3).toLowerCase()];
    if (!day) return `Weekly holidays: "${m[1]}" is not a day of the week.`;
    if (out.some((h) => h.day === day)) return `Weekly holidays: ${day} is listed twice.`;
    let weeks: number[] = [];
    if (m[2] !== undefined) {
      const parts = m[2].split(/[,\s&]+|and/i).filter(Boolean);
      if (parts.some((p) => !/^[1-5]$/.test(p))) return `Weekly holidays: the weeks for ${day} must be numbers from 1 to 5, e.g. Saturday (2,4).`;
      weeks = [...new Set(parts.map(Number))].sort((a, b) => a - b);
    }
    out.push({ day, weeks });
  }
  return out;
}

type ComponentPatch = { enabled: boolean; type?: "percentage" | "amount"; percentage?: number; amount?: number; includeInTotal?: boolean };

/** One salary component cell: "50%", "Rs 2000", "₹2000", "Off", "10% excl". */
export function parseComponentCell(v: unknown, label: string, salary: number): ComponentPatch | undefined | string {
  let s = cellText(v).toLowerCase();
  if (!s) return undefined;
  if (["off", "no", "0", "none", "disabled", "-"].includes(s)) return { enabled: false };
  let includeInTotal: boolean | undefined;
  if (/\b(excl|excluded|not in total)\b/.test(s)) {
    includeInTotal = false;
    s = s.replace(/\b(excl|excluded|not in total)\b/, "").trim();
  }
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (pct) {
    const n = Number(pct[1]);
    if (n > 100) return `${label}: a percentage cannot be more than 100%.`;
    return { enabled: true, type: "percentage", percentage: n, ...(includeInTotal === false ? { includeInTotal } : {}) };
  }
  const amt = /^(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)$/.exec(s);
  if (amt) {
    const n = Number(amt[1].replace(/,/g, ""));
    if (salary > 0 && n > salary) return `${label}: ₹${n} is more than the salary (₹${salary}).`;
    return { enabled: true, type: "amount", amount: n, ...(includeInTotal === false ? { includeInTotal } : {}) };
  }
  if (/^[\d,.]+$/.test(s)) return `${label}: write ${s}% for a percentage or Rs ${s} for a fixed amount.`;
  return `${label}: could not read "${cellText(v)}". Write 50%, Rs 2000 or Off.`;
}

// -------------------------------------------------------- references

function makeLookup<T extends { _id: string }>(items: T[], nameOf: (t: T) => string) {
  const byName = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeName(nameOf(item) || "");
    if (!key) continue;
    byName.set(key, [...(byName.get(key) || []), item]);
  }
  return (name: string) => byName.get(normalizeName(name)) || [];
}

/**
 * Resolve a branch/department/shift cell to ids. The whole cell is tried as
 * one name first, so a name that itself contains a comma still matches.
 */
function resolveRefs<T extends { _id: string }>(
  raw: string,
  find: (name: string) => T[],
  label: string,
  plural: string,
  allowMany: boolean,
): { ids: string[] } | { error: string } {
  const whole = find(raw);
  if (whole.length === 1) return { ids: [whole[0]._id] };
  if (whole.length > 1) return { error: `Two of your ${plural} are called "${raw}". Rename one, then try again.` };
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && !allowMany) {
    return { error: `Only one ${label} per employee is allowed (Settings › Branches turns on several). "${raw}" lists ${parts.length}.` };
  }
  const ids: string[] = [];
  for (const part of parts) {
    const found = find(part);
    if (found.length === 0) return { error: `There is no ${label} called "${part}". Check the spelling against your ${plural}.` };
    if (found.length > 1) return { error: `Two of your ${plural} are called "${part}". Rename one, then try again.` };
    if (!ids.includes(found[0]._id)) ids.push(found[0]._id);
  }
  return ids.length ? { ids } : { error: `Please enter the ${label}.` };
}

// -------------------------------------------------------------- parse

/**
 * @param rows      sheet_to_json(sheet, { defval: "" }) -- raw values, dates as Date.
 * @param formatted the same rows with { raw: false }, i.e. the text Excel shows.
 *                  Only used for the salary component columns, where a cell
 *                  formatted as a percentage holds 0.5 but shows "50%".
 */
export function parseEmployeeRows(
  rows: Record<string, unknown>[],
  formatted: Record<string, unknown>[] | null,
  ctx: ImportContext,
): ParseResult {
  if (!rows.length) return { ok: false, error: "The file is empty. Add at least one employee below the header row." };

  // Header text in the file -> column key.
  const headerToKey = new Map<string, string>();
  for (const col of IMPORT_COLUMNS) {
    headerToKey.set(col.header, col.key);
    for (const a of col.aliases || []) headerToKey.set(a, col.key);
  }
  const fileHeaders = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const keyToHeader = new Map<string, string>();
  const ignoredHeaders: string[] = [];
  for (const h of fileHeaders) {
    const key = headerToKey.get(normalizeHeader(h));
    if (!key || keyToHeader.has(key)) {
      if (!h.startsWith("__EMPTY")) ignoredHeaders.push(h);
    } else {
      keyToHeader.set(key, h);
    }
  }

  const missing = IMPORT_COLUMNS.filter((c) => c.required && !keyToHeader.has(c.key)).map((c) => c.header);
  if (missing.length) {
    return { ok: false, error: `These columns are missing: ${missing.join(", ")}. Download the template to see the column names.` };
  }

  const getRaw = (row: Record<string, unknown>, key: string) => {
    const h = keyToHeader.get(key);
    return h === undefined ? "" : row[h];
  };
  const get = (row: Record<string, unknown>, key: string) => cellText(getRaw(row, key));

  // Drop rows with nothing in them (a sheet often has stray formatting below the data).
  const used = rows
    .map((r, i) => ({ r, f: formatted?.[i] ?? null, i }))
    .filter(({ r }) => Object.values(r).some((v) => cellText(v) !== ""));
  if (!used.length) return { ok: false, error: "The file is empty. Add at least one employee below the header row." };
  if (used.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `This file has ${used.length} employees. Import at most ${MAX_IMPORT_ROWS} at a time; split the file and import each part.` };
  }

  const findBranch = makeLookup(ctx.branches, (b) => b.branchName);
  const findDept = makeLookup(ctx.departments, (d) => d.name);
  const findShift = makeLookup(ctx.shifts, (s) => s.name);
  const templates = new Map((ctx.salaryTemplates || []).map((t) => [normalizeName(t.name), t]));

  const existingByPhone = new Map<string, string>();
  const existingByDevice = new Map<string, string>();
  for (const e of ctx.existing) {
    if (e.phone) existingByPhone.set(String(e.phone).trim(), e.name);
    if (e.deviceUserId) existingByDevice.set(String(e.deviceUserId).trim(), e.name);
  }
  const seenPhone = new Map<string, number>();
  const seenDevice = new Map<string, number>();

  const companyHolidays = weeklyHolidaysFromWorkDays(ctx.workDays);
  const defaultShift = ctx.defaultShiftId && ctx.shifts.some((s) => s._id === ctx.defaultShiftId) ? ctx.defaultShiftId : null;

  const out: ImportRow[] = used.map(({ r, f, i }) => {
    // SheetJS records the real sheet row (0-based) on each object, so a blank
    // row in the middle does not shift every number after it.
    const rowNum = ((r as { __rowNum__?: number }).__rowNum__ ?? i + 1) + 1;
    const problems: string[] = [];

    // --- General
    const name = get(r, "name").replace(/\s+/g, " ");
    if (!name) problems.push("Please enter the employee's name.");

    const rawPhone = get(r, "phone");
    const phone = normalizePhone(getRaw(r, "phone"));
    if (!rawPhone) problems.push("Please enter the phone number.");
    else if (!phone) problems.push(`Phone "${rawPhone}" is not a 10-digit mobile number.`);

    const email = get(r, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`Email "${email}" is not a valid address.`);

    const genderText = get(r, "gender").toLowerCase();
    let gender = "male";
    if (genderText) {
      if (["m", "male"].includes(genderText)) gender = "male";
      else if (["f", "female"].includes(genderText)) gender = "female";
      else problems.push(`Gender "${get(r, "gender")}" should be Male or Female.`);
    }

    const dob = parseDateCell(getRaw(r, "dob"));
    if (dob === null) problems.push(`Date of birth "${get(r, "dob")}" is not a date. Use DD-MM-YYYY.`);
    else if (dob && dob > ctx.today) problems.push("Date of birth is in the future.");

    // --- Employment
    const payText = get(r, "employmentType").toLowerCase();
    let employmentType = "monthly";
    if (payText) {
      if (payText.startsWith("month")) employmentType = "monthly";
      else if (payText.startsWith("dai") || payText === "day" || payText === "per day") employmentType = "daily";
      else if (payText.startsWith("hour") || payText === "per hour") employmentType = "hourly";
      else problems.push(`Pay type "${get(r, "employmentType")}" should be Monthly, Daily or Hourly.`);
    }

    const salary = parseRupees(getRaw(r, "salary"));
    if (salary === undefined) problems.push("Please enter the salary.");
    else if (salary === null) problems.push(`Salary "${get(r, "salary")}" is not an amount.`);
    else if (!Number.isInteger(salary)) problems.push(`Salary ${salary} must be whole rupees.`);

    const joinParsed = parseDateCell(getRaw(r, "joiningDate"));
    if (joinParsed === null) problems.push(`Joining date "${get(r, "joiningDate")}" is not a date. Use DD-MM-YYYY.`);
    const joiningDate = joinParsed || ctx.today;

    // The text the sheet shows, not the parsed value: a CSV (or a number cell
    // formatted 0000) turns "0007" into the number 7, and the machine matches
    // PINs exactly, so that person's taps would never be credited.
    const shownDeviceId = f ? cellText(f[keyToHeader.get("deviceUserId") ?? ""]) : "";
    const deviceUserId = shownDeviceId || get(r, "deviceUserId");

    // Branch
    let branchIds: string[] = [];
    const branchText = get(r, "branch");
    if (branchText) {
      const res = resolveRefs(branchText, findBranch, "branch", "branches", ctx.allowMultipleBranches);
      if ("error" in res) problems.push(res.error);
      else branchIds = res.ids;
    } else if (ctx.branches.length === 1) {
      branchIds = [ctx.branches[0]._id];
    } else {
      problems.push(ctx.branches.length ? `Please enter the branch (you have ${ctx.branches.length}).` : "Your company has no branches yet. Add one in Branches first.");
    }

    // Department
    let departmentId = "";
    const deptText = get(r, "department");
    if (deptText) {
      const res = resolveRefs(deptText, findDept, "department", "departments", false);
      if ("error" in res) problems.push(res.error);
      else departmentId = res.ids[0];
    } else if (ctx.departments.length === 1) {
      departmentId = ctx.departments[0]._id;
    } else {
      problems.push(ctx.departments.length ? `Please enter the department (you have ${ctx.departments.length}).` : "Your company has no departments yet. Add one in Departments first.");
    }

    // Shift: blank falls back to the company's default shift, as the form does.
    let shiftIds: string[] = [];
    const shiftText = get(r, "shift");
    if (shiftText) {
      const res = resolveRefs(shiftText, findShift, "shift", "shifts", true);
      if ("error" in res) problems.push(res.error);
      else shiftIds = res.ids;
    } else if (defaultShift) {
      shiftIds = [defaultShift];
    } else if (ctx.shifts.length === 1) {
      shiftIds = [ctx.shifts[0]._id];
    } else {
      problems.push(ctx.shifts.length ? `Please enter the shift (you have ${ctx.shifts.length} and no default shift).` : "Your company has no shifts yet. Add one in Shifts first.");
    }

    // --- Weekly holidays
    const holidays = parseWeeklyHolidays(getRaw(r, "weeklyHolidays"));
    if (typeof holidays === "string") problems.push(holidays);
    const weeklyHolidays = Array.isArray(holidays) ? holidays : companyHolidays;

    // --- Attendance exceptions. Filling either column turns on this
    // employee's own rules; the one left blank keeps the company's value,
    // exactly what switching the override on in the form starts from.
    const requireLocation = parseYesNo(getRaw(r, "requireLocation"));
    const remotePunch = parseYesNo(getRaw(r, "remotePunch"));
    const geofenceExempt = parseYesNo(getRaw(r, "geofenceExempt"));
    const leadDeletion = parseYesNo(getRaw(r, "leadDeletionPermission"));
    for (const [value, key] of [[requireLocation, "requireLocation"], [remotePunch, "remotePunch"], [geofenceExempt, "geofenceExempt"], [leadDeletion, "leadDeletionPermission"]] as const) {
      if (value === null) {
        const header = IMPORT_COLUMNS.find((c) => c.key === key)!.header;
        problems.push(`${header}: "${get(r, key)}" should be Yes or No.`);
      }
    }
    const override = typeof requireLocation === "boolean" || typeof remotePunch === "boolean";
    const attendanceExceptions = override
      ? {
          overrideGlobal: true,
          requireLocation: typeof requireLocation === "boolean" ? requireLocation : !!ctx.companyRequireLocation,
          remotePunch: typeof remotePunch === "boolean" ? remotePunch : !!ctx.companyRemotePunch,
        }
      : { ...DEFAULT_ATTENDANCE_EXCEPTIONS };

    // --- Identity numbers Excel may already have damaged
    for (const [key, label] of [["aadhaarNo", "Aadhaar number"], ["accountNumber", "Bank account number"]] as const) {
      if (isRoundedNumber(getRaw(r, key))) {
        problems.push(`${label}: Excel has rounded this long number. Format the column as Text, type it again, and re-upload.`);
      }
    }

    // --- Salary configuration: defaults, then the template, then each column.
    const salaryComponents: Record<string, unknown> = structuredClone(DEFAULT_SALARY_COMPONENTS);
    const templateName = get(r, "salaryTemplate");
    if (templateName) {
      const template = templates.get(normalizeName(templateName));
      if (!template) {
        problems.push(
          ctx.salaryTemplates?.length
            ? `There is no salary template called "${templateName}".`
            : `There is no salary template called "${templateName}" (none are set up in Settings).`,
        );
      } else {
        Object.assign(salaryComponents, structuredClone(template.components));
      }
    }
    const salaryForCaps = typeof salary === "number" ? salary : 0;
    for (const comp of SALARY_COMPONENT_COLUMNS) {
      const key = `comp:${comp.key}`;
      // The text Excel shows, so a cell formatted as 50% reads "50%" and not 0.5.
      const shown = f ? f[keyToHeader.get(key) ?? ""] : undefined;
      const value = shown !== undefined && cellText(shown) !== "" ? shown : getRaw(r, key);
      const patch = parseComponentCell(value, comp.header, salaryForCaps);
      if (typeof patch === "string") problems.push(patch);
      else if (patch) salaryComponents[comp.key] = { ...(salaryComponents[comp.key] as object), ...patch };
    }
    const tdsCategory = get(r, "tdsCategory");
    if (tdsCategory) salaryComponents.tdsCategory = tdsCategory;

    // --- Duplicates: against the company, then earlier rows of this file.
    let status: ImportRowStatus = "ready";
    if (phone) {
      const existingName = existingByPhone.get(phone);
      if (existingName) {
        status = "exists";
        problems.unshift(`Already an employee: ${existingName}.`);
      } else if (seenPhone.has(phone)) {
        problems.push(`Same phone number as row ${seenPhone.get(phone)}.`);
      } else {
        seenPhone.set(phone, rowNum);
      }
    }
    if (deviceUserId && status !== "exists") {
      const holder = existingByDevice.get(deviceUserId);
      if (holder) problems.push(`Biometric ID ${deviceUserId} is already assigned to ${holder}.`);
      else if (seenDevice.has(deviceUserId)) problems.push(`Same biometric ID as row ${seenDevice.get(deviceUserId)}.`);
      else seenDevice.set(deviceUserId, rowNum);
    }
    if (status !== "exists" && problems.length) status = "error";

    const optional = (key: string) => {
      const v = get(r, key);
      return v ? { [key]: v } : {};
    };

    const payload =
      status === "ready"
        ? {
            name,
            phone,
            ...(email ? { email } : {}),
            gender,
            ...(dob ? { dob } : {}),
            employmentType,
            salary,
            joiningDate,
            ...(deviceUserId ? { deviceUserId } : {}),
            branchIds,
            branchId: branchIds[0],
            departmentId,
            shiftIds,
            shiftId: shiftIds[0],
            weeklyHolidays,
            attendanceExceptions,
            geofenceExempt: geofenceExempt === true,
            leadDeletionPermission: leadDeletion === true,
            ...optional("bloodGroup"),
            ...optional("education"),
            ...optional("aadhaarNo"),
            ...optional("panNo"),
            ...optional("experience"),
            ...optional("address"),
            ...optional("residentialAddress"),
            ...optional("residentialPhone"),
            ...optional("contactPersonName"),
            ...optional("contactPersonMobile"),
            bankDetails: {
              accountNumber: get(r, "accountNumber"),
              bankName: get(r, "bankName"),
              ifsc: get(r, "ifsc").toUpperCase(),
              branchName: get(r, "bankBranchName"),
              nameAsPerBank: get(r, "nameAsPerBank"),
            },
            salaryComponents,
          }
        : null;

    const nameOf = <T extends { _id: string }>(items: T[], ids: string[], label: (t: T) => string) =>
      ids.map((id) => items.find((x) => x._id === id)).filter(Boolean).map((x) => label(x as T)).join(", ");

    return {
      row: rowNum,
      source: r,
      name,
      phone: phone || rawPhone,
      branch: nameOf(ctx.branches, branchIds, (b) => b.branchName) || branchText,
      department: nameOf(ctx.departments, departmentId ? [departmentId] : [], (d) => d.name) || deptText,
      shift: nameOf(ctx.shifts, shiftIds, (s) => s.name) || shiftText,
      salary: typeof salary === "number" ? salary : null,
      status,
      problems,
      payload,
    };
  });

  return { ok: true, rows: out, ignoredHeaders };
}
