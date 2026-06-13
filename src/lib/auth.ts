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
  token: string;
  loggedInAt: number;
  companyName?: string;
  companyLogo?: string;
  address?: string;
  email?: string;
  permissions?: Record<string, PagePermission>;
}

export interface AccessLog {
  id: string;
  name: string;
  role: string;
  phone: string;
  action: "login" | "logout";
  timestamp: number;
  ipAddress: string;
  userAgent: string;
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

export function getAccessLogs(): AccessLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("bot_hrms_access_logs");
    if (raw) {
      return JSON.parse(raw) as AccessLog[];
    }
    
    // Seed with realistic logs if empty
    const now = Date.now();
    const seedLogs: AccessLog[] = [
      {
        id: "log-1",
        name: "Dummy Admin",
        role: "Super Admin",
        phone: "+91 8888888888",
        action: "login",
        timestamp: now - 1000 * 60 * 12, // 12 minutes ago
        ipAddress: "103.88.22.14",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      {
        id: "log-2",
        name: "Jane Smith",
        role: "HR Manager",
        phone: "+91 9999999999",
        action: "logout",
        timestamp: now - 1000 * 60 * 60 * 2.5, // 2.5 hours ago
        ipAddress: "157.44.192.105",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      {
        id: "log-3",
        name: "Jane Smith",
        role: "HR Manager",
        phone: "+91 9999999999",
        action: "login",
        timestamp: now - 1000 * 60 * 60 * 4, // 4 hours ago
        ipAddress: "157.44.192.105",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      {
        id: "log-4",
        name: "Dummy Admin",
        role: "Super Admin",
        phone: "+91 8888888888",
        action: "logout",
        timestamp: now - 1000 * 60 * 60 * 24, // 1 day ago
        ipAddress: "49.36.88.212",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      {
        id: "log-5",
        name: "Dummy Admin",
        role: "Super Admin",
        phone: "+91 8888888888",
        action: "login",
        timestamp: now - 1000 * 60 * 60 * 25, // 25 hours ago
        ipAddress: "49.36.88.212",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    ];
    window.localStorage.setItem("bot_hrms_access_logs", JSON.stringify(seedLogs));
    return seedLogs;
  } catch {
    return [];
  }
}

export function setSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  
  // Try to read IP if stored in temp storage by login flow, else generate a random realistic IP
  let ipAddress = "";
  const tempIp = window.localStorage.getItem("bot_temp_ip");
  if (tempIp) {
    ipAddress = tempIp;
    window.localStorage.removeItem("bot_temp_ip");
  } else {
    const randomIPs = ["103.88.22.14", "157.44.192.105", "49.36.88.212", "106.201.32.90"];
    ipAddress = randomIPs[Math.floor(Math.random() * randomIPs.length)];
  }

  const logs = getAccessLogs();
  const newLog: AccessLog = {
    id: Math.random().toString(36).substring(2, 9),
    name: session.name || "Unknown Admin",
    role: session.role === "superadmin" ? "Platform Admin" : (session.role === "admin" ? "Company Admin" : "Employee"),
    phone: session.phone || "",
    action: "login",
    timestamp: session.loggedInAt || Date.now(),
    ipAddress,
    userAgent: navigator.userAgent
  };
  
  // Avoid duplicate login logs for same session timestamp
  const isDuplicate = logs.some(l => l.action === "login" && l.timestamp === newLog.timestamp);
  if (!isDuplicate) {
    logs.unshift(newLog);
    if (logs.length > 50) logs.pop();
    window.localStorage.setItem("bot_hrms_access_logs", JSON.stringify(logs));
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
  const session = getSession();
  if (session) {
    const randomIPs = ["103.88.22.14", "157.44.192.105", "49.36.88.212", "106.201.32.90"];
    const ipAddress = randomIPs[Math.floor(Math.random() * randomIPs.length)];

    const logs = getAccessLogs();
    const newLog: AccessLog = {
      id: Math.random().toString(36).substring(2, 9),
      name: session.name || "Unknown Admin",
      role: session.role === "superadmin" ? "Platform Admin" : (session.role === "admin" ? "Company Admin" : "Employee"),
      phone: session.phone || "",
      action: "logout",
      timestamp: Date.now(),
      ipAddress,
      userAgent: navigator.userAgent
    };
    logs.unshift(newLog);
    if (logs.length > 50) logs.pop();
    window.localStorage.setItem("bot_hrms_access_logs", JSON.stringify(logs));
  }

  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("bot-auth-change"));
}

