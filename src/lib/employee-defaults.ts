import { DAY_LABELS } from "@/lib/constants";

// What a new employee starts with when the admin does not set it. Shared by the
// Add Employee form and the Excel import, so an imported employee is paid and
// graded exactly like one typed in by hand.

export const DEFAULT_SALARY_COMPONENTS = {
  tds: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  tdsCategory: "",
  basic: { enabled: true, percentage: 50, amount: 0, type: 'percentage', includeInTotal: true },
  da: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  hra: { enabled: true, percentage: 40, amount: 0, type: 'percentage', includeInTotal: true },
  ca: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  pf: { enabled: false, percentage: 12, amount: 0, type: 'percentage', includeInTotal: true },
  esic: { enabled: false, percentage: 0.75, amount: 0, type: 'percentage', includeInTotal: true },
  epf: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  tdsOnProfession: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  retention: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  pt: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  adminCharge: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
  bonus: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
};

export const DEFAULT_ATTENDANCE_EXCEPTIONS = {
  overrideGlobal: false,
  requireLocation: false,
  remotePunch: true,
};

/**
 * The company's weekly holidays as an employee's `weeklyHolidays`: every day
 * that is NOT one of Settings.attendance.workDays (keys "M", "T", ... "Su"),
 * every week of the month.
 */
export function weeklyHolidaysFromWorkDays(workDays: string[] | undefined | null) {
  if (!workDays?.length) return [];
  return Object.entries(DAY_LABELS)
    .filter(([key]) => !workDays.includes(key))
    .map(([, day]) => ({ day, weeks: [] as number[] }));
}
