import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Admin-facing reads for app-install telemetry: which build each employee runs,
// what permissions they granted, the errors they were shown, and the real login
// history. Written by the app via POST /client/report and /client/error (see
// lib/client-telemetry.ts) — this module never writes.

export type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unavailable"
  | "unknown";

export interface ClientDevice {
  _id: string;
  employeeId: { _id: string; name?: string; phone?: string } | string;
  installId: string;
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  manufacturer: string | null;
  isNative: boolean;
  permissions: {
    location: PermissionState;
    coarseLocation: PermissionState;
    camera: PermissionState;
    notifications: PermissionState;
  };
  appOpenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ClientError {
  _id: string;
  employeeId: { _id: string; name?: string; phone?: string } | string;
  installId: string | null;
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  message: string;
  kind: "ui" | "network" | "unhandled";
  stack: string | null;
  route: string | null;
  requestUrl: string | null;
  statusCode: number | null;
  occurredAt: string;
  createdAt: string;
}

export interface LoginSession {
  _id: string;
  userId: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  action: "login" | "logout";
  ipAddress: string | null;
  userAgent: string | null;
  appName: string | null;
  installId: string | null;
  appVersion: string | null;
  createdAt: string;
}

/** Every reporting install for the tenant, or just one employee's. */
export function useClientDevices(employeeId?: string) {
  return useQuery<ClientDevice[]>({
    queryKey: ["client-devices", employeeId ?? "all"],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/devices", {
        params: employeeId ? { employeeId } : undefined,
      });
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useClientErrors(employeeId?: string, limit = 50) {
  return useQuery<ClientError[]>({
    queryKey: ["client-errors", employeeId ?? "all", limit],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/errors", {
        params: { ...(employeeId ? { employeeId } : {}), limit },
      });
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useLoginSessions(userId?: string, limit = 50) {
  return useQuery<LoginSession[]>({
    queryKey: ["login-sessions", userId ?? "all", limit],
    queryFn: async () => {
      const { data } = await apiClient.get("/client/sessions", {
        params: { ...(userId ? { userId } : {}), limit },
      });
      return data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Newest install per employee, keyed by employee id — for the employees list,
 * where an employee with a phone and a tablet should show one current build
 * rather than a row per device. Devices arrive sorted lastSeenAt desc, so the
 * first one seen per employee is the newest.
 */
export function latestDeviceByEmployee(devices: ClientDevice[] | undefined) {
  const map = new Map<string, ClientDevice>();
  for (const d of devices ?? []) {
    const id = typeof d.employeeId === "string" ? d.employeeId : d.employeeId?._id;
    if (id && !map.has(id)) map.set(id, d);
  }
  return map;
}

/** Human label for a permission state, for table cells and badges. */
export const PERMISSION_LABELS: Record<PermissionState, string> = {
  granted: "Granted",
  denied: "Denied",
  prompt: "Not asked yet",
  "prompt-with-rationale": "Needs rationale",
  unavailable: "Unavailable",
  unknown: "Unknown",
};
