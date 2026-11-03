import type { Session } from "@/lib/auth";

/**
 * Admin-panel pages in sidebar order, by the permission key a sub-admin needs
 * (the route path without its leading "/", as app-sidebar derives it).
 */
export const PANEL_PAGE_ORDER = [
  "dashboard", "branches", "departments", "employees", "leaves", "attendance",
  "tickets", "salary", "advance-salary", "leads", "festivals", "announcements",
  "tracking", "leave-types", "shifts", "biometric-devices", "assets", "expenses",
  "settings",
] as const;

/**
 * Where a panel user lands after sign-in. An admin always gets the dashboard.
 * A sub-admin gets the first page they may view: sending one without the
 * dashboard right to /dashboard showed a "no access" toast on every login.
 */
export function panelHomeFor(session: Pick<Session, "role" | "permissions"> | null): string {
  if (!session || session.role !== "subadmin") return "/dashboard";
  const perms = session.permissions || {};
  const first = PANEL_PAGE_ORDER.find((key) => perms[key]?.view === true);
  return first ? `/${first}` : "/dashboard";
}
