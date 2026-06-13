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
        if (error.response?.data?.code === "another_device") {
          window.localStorage.setItem("bot_logout_reason", "another_device");
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

