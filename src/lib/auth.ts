// Tiny client-side auth store (demo only). Persists in localStorage so refresh keeps the session.
// NOTE: This is a UI-only demo; real apps must validate sessions on the server.

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

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
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
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("bot-auth-change"));
}

