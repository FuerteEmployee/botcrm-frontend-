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

/** Assign or clear an employee's on-device PIN. Rejects duplicates with a 409. */
export async function setEmployeePin(employeeId: string, deviceUserId: string) {
  const { data } = await apiClient.put(`/users/employees/${employeeId}`, { deviceUserId });
  return data;
}
