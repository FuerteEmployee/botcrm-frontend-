// Client-side session cache. Persists in localStorage so a refresh keeps the
// session. Not an authority: `protect` revalidates the JWT on every request.

const KEY = "bot_hrms_session";

export interface PagePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface Session {
  phone: string;
  name: string;
  role: "superadmin" | "admin" | "employee" | "subadmin";
  // Tenant id: the admin's own id, or the parent admin's for a subadmin or
  // employee. Used to target staged OTA rollouts at specific companies.
  adminId?: string;
  token: string;
  loggedInAt: number;
  companyName?: string;
  companyLogo?: string;
  address?: string;
  email?: string;
  permissions?: Record<string, PagePermission>;
}

const ROLES: ReadonlyArray<Session["role"]> = ["superadmin", "admin", "employee", "subadmin"];

// A stored value without a token or a known role is treated as no session.
// Returning it anyway sent "/" to /user (no role -> employee shell), which sent
// it back to "/" (not an employee) -- a redirect loop instead of the login page.
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.token !== "string" || !parsed.token) return null;
    if (!ROLES.includes(parsed.role as Session["role"])) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the session then lasts until reload */
  }
  window.dispatchEvent(new Event("bot-auth-change"));
}

// Merge fresh fields (e.g. server-authoritative role) into the stored session
// without creating a new access-log entry. Used to reconcile a stale cached
// session against the backend on app load.
export function patchSession(patch: Partial<Session>) {
  if (typeof window === "undefined") return;
  const current = getSession();
  if (!current) return;
  const next = { ...current, ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("bot-auth-change"));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: nothing to remove */
  }
  window.dispatchEvent(new Event("bot-auth-change"));
}

