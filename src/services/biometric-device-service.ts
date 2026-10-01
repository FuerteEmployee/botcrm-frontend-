import { apiClient } from "@/lib/api-client";

// Company admins manage their own biometric machines: register a serial, rename,
// pause, detach. Taking over a serial already registered to another company is
// refused by the API (409) — that would divert their attendance — and moving a
// claimed machine between companies stays a support operation.

export interface MyDeviceUnresolved {
  pin?: string;
  reason?: string;
  deviceTime?: string;
  at?: string;
}

export interface MyDevice {
  _id: string;
  serialNumber: string;
  label?: string;
  model?: string;
  status: "unassigned" | "active" | "disabled";
  lastSeenAt?: string | null;
  lastPunchAt?: string | null;
  punchCount?: number;
  recentUnresolved?: MyDeviceUnresolved[];
  notes?: string;
  createdAt?: string;
  /** Smallest gap (minutes) between the machine's clock and ours over the last day. */
  clockSkewMinutes?: number | null;
  /** A correction support set by hand, in minutes. 0 = none. */
  clockOffsetMinutes?: number;
  /** When the tenant was last told this machine went quiet. */
  offlineAlertedAt?: string | null;
}

export interface DevicePinEmployee {
  _id: string;
  name: string;
  phone?: string;
  deviceUserId?: string | null;
  status: string;
  profileImage?: string | null;
}

export async function getMyDevices() {
  const { data } = await apiClient.get("/devices");
  return data as {
    devices: MyDevice[];
    employees: DevicePinEmployee[];
    mapped: number;
    unmapped: number;
  };
}

/** Register a machine to my company. Also claims an already-detected serial. */
export async function claimDevice(payload: {
  serialNumber: string;
  label?: string;
  model?: string;
}) {
  const { data } = await apiClient.post("/devices", payload);
  return data as MyDevice;
}

export async function updateMyDevice(
  id: string,
  payload: { label?: string; notes?: string; status?: "active" | "disabled" }
) {
  const { data } = await apiClient.put(`/devices/${id}`, payload);
  return data as MyDevice;
}

/** Detach from my company. The record survives as unassigned, not deleted. */
export async function releaseMyDevice(id: string) {
  const { data } = await apiClient.delete(`/devices/${id}`);
  return data as { message: string };
}

export async function clearMyDeviceUnresolved(id: string) {
  const { data } = await apiClient.post(`/devices/${id}/clear-unresolved`);
  return data as MyDevice;
}

/**
 * Assign or clear an employee's on-device PIN. Rejects duplicates with a 409.
 *
 * Its own endpoint under /devices (not the Employees edit), so it follows the
 * Biometric Device permission this page is gated on.
 */
export async function setEmployeePin(employeeId: string, deviceUserId: string) {
  const { data } = await apiClient.put(`/devices/pins/${employeeId}`, { deviceUserId });
  return data as { _id: string; name: string; deviceUserId: string | null };
}
