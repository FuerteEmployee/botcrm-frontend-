import axios from "axios";
import { toast } from "sonner";
import { getSession, clearSession } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://gray-crab-756474.hostingersite.com/api";
export const IMAGE_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

// How long the logout toast stays visible.
const LOGOUT_TOAST_DURATION_MS = 5000;
let isHandlingForcedLogout = false;

// Set by lib/client-telemetry at startup. Registered through a setter rather
// than imported directly, because client-telemetry imports apiClient from this
// module — a direct import back would be a cycle evaluated at module load.
type NetworkErrorReporter = (info: {
  message: string;
  requestUrl: string | null;
  statusCode: number | null;
}) => void;

let networkErrorReporter: NetworkErrorReporter | null = null;

export function setNetworkErrorReporter(fn: NetworkErrorReporter) {
  networkErrorReporter = fn;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to attach the token
apiClient.interceptors.request.use(
  (config) => {
    const session = getSession();
    if (session?.token) {
      config.headers.Authorization = `Bearer ${session.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 and 403 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadSession = !!getSession()?.token;
      clearSession();

      // Only react the first time — a single forced-logout event can trigger
      // several in-flight requests to all 401 at once.
      if (typeof window !== "undefined" && hadSession && !isHandlingForcedLogout) {
        isHandlingForcedLogout = true;
        window.setTimeout(() => { isHandlingForcedLogout = false; }, LOGOUT_TOAST_DURATION_MS);

        const code = error.response?.data?.code;
        const message: string = error.response?.data?.message || "";
        let toastMessage = "You were signed out.";
        let reason: "another_device" | "inactive" | null = null;

        if (code === "another_device") {
          reason = "another_device";
          toastMessage = "You were signed out because your account was logged in on another device.";
        } else if (code === "inactive" || code === "employee_inactive" || code === "account_inactive" || /inactive|deactivat/i.test(message)) {
          // Deactivated mid-session (e.g. admin flips the employee's status
          // while they hold a valid token) — the message may be a custom
          // per-employee reason the admin set.
          reason = "inactive";
          toastMessage = message || "Your account has been deactivated. Please contact your administrator.";
        }

        // No forced navigation/reload here — just clear the session and show
        // why. If the user is on a protected route, that route's own auth
        // guard sends them to /login (client-side, no hard refresh) the next
        // time it runs; we don't force it from here.
        if (reason) {
          window.localStorage.setItem("bot_logout_reason", reason);
          if (message) window.localStorage.setItem("bot_logout_message", message);
        }
        toast.error(toastMessage, { duration: LOGOUT_TOAST_DURATION_MS });
      }
    }

    // Handle subscription/module gating 403 errors
    if (error.response?.status === 403 && error.response?.data?.requiredUpgrade) {
      // Dispatch a custom event so UI components can show upgrade prompts
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("bot-upgrade-required", {
            detail: {
              message: error.response.data.message || "Please upgrade your plan to access this feature.",
            },
          })
        );
      }
    }

    // Record failed API calls so the team can see what employees actually hit.
    // Excluded: 401/403 (expected auth/gating outcomes, not defects) and the
    // telemetry endpoints themselves, which would loop.
    const status = error.response?.status ?? null;
    const url: string = error.config?.url || "";
    if (networkErrorReporter && !url.startsWith("/client/") && status !== 401 && status !== 403) {
      try {
        networkErrorReporter({
          message:
            error.response?.data?.message ||
            error.message ||
            `Request failed${status ? ` with ${status}` : ""}`,
          requestUrl: `${error.config?.method?.toUpperCase() || "GET"} ${url}`,
          statusCode: status,
        });
      } catch {
        /* reporting must never mask the original error */
      }
    }

    return Promise.reject(error);
  }
);

