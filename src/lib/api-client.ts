import axios from "axios";
import { getSession, clearSession } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://gray-crab-756474.hostingersite.com/api";
export const IMAGE_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

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
      clearSession();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        const code = error.response?.data?.code;
        const message: string = error.response?.data?.message || "";
        if (code === "another_device") {
          window.localStorage.setItem("bot_logout_reason", "another_device");
        } else if (code === "inactive" || code === "employee_inactive" || code === "account_inactive" || /inactive|deactivat/i.test(message)) {
          // No dedicated backend `code` for this yet (unlike "another_device") —
          // sniff the message as a fallback so a deactivated employee mid-session
          // still lands on a clear explanation instead of a silent redirect.
          window.localStorage.setItem("bot_logout_reason", "inactive");
        }
        window.location.href = "/login";
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

    return Promise.reject(error);
  }
);

