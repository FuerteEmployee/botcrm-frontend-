import { apiClient } from "@/lib/api-client";

const BASE = "/superadmin";

// ─── Overview ────────────────────────────────────────────────────────────────

export async function getOverview() {
  const { data } = await apiClient.get(`${BASE}/overview`);
  return data;
}

export async function getSystemAnalytics() {
  const { data } = await apiClient.get(`${BASE}/analytics`);
  return data;
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export async function getTenants(params?: {
  search?: string;
  status?: string;
  plan?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get(`${BASE}/tenants`, { params });
  return data;
}

export async function getTenant(id: string) {
  const { data } = await apiClient.get(`${BASE}/tenants/${id}`);
  return data;
}

export async function createTenant(payload: {
  name: string;
  phone: string;
  email?: string;
  planId: string;
  billingCycle?: string;
  status?: "trial" | "active";
  trialDays?: number;
  bannerThresholdDays?: number;
}) {
  const { data } = await apiClient.post(`${BASE}/tenants`, payload);
  return data;
}

export async function updateTenant(
  id: string,
  payload: {
    planId?: string;
    status?: string;
    billingCycle?: string;
    trialEndDate?: string;
    bannerThresholdDays?: number;
    note?: string;
    email?: string;
    password?: string;
  }
) {
  const { data } = await apiClient.put(`${BASE}/tenants/${id}`, payload);
  return data;
}

export async function deactivateTenant(id: string) {
  const { data } = await apiClient.delete(`${BASE}/tenants/${id}`);
  return data;
}

export async function deleteTenant(id: string) {
  const { data } = await apiClient.delete(`${BASE}/tenants/${id}/permanent`);
  return data;
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export async function getPlans() {
  const { data } = await apiClient.get(`${BASE}/plans`);
  return data;
}

export async function createPlan(payload: Record<string, unknown>) {
  const { data } = await apiClient.post(`${BASE}/plans`, payload);
  return data;
}

export async function updatePlan(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.put(`${BASE}/plans/${id}`, payload);
  return data;
}

export async function deletePlan(id: string) {
  const { data } = await apiClient.delete(`${BASE}/plans/${id}`);
  return data;
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export async function getInvoices(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get(`${BASE}/invoices`, { params });
  return data;
}

export async function createInvoice(payload: Record<string, unknown>) {
  const { data } = await apiClient.post(`${BASE}/invoices`, payload);
  return data;
}

export async function updateInvoice(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.put(`${BASE}/invoices/${id}`, payload);
  return data;
}

// ─── Alert Rules ─────────────────────────────────────────────────────────────

export async function getAlerts() {
  const { data } = await apiClient.get(`${BASE}/alerts`);
  return data;
}

export async function toggleAlert(slug: string) {
  const { data } = await apiClient.put(`${BASE}/alerts/${slug}`);
  return data;
}

// ─── Biometric machines (eSSL/ZKTeco terminals) ───────────────────────────────

export interface DeviceUnresolved {
  pin?: string;
  reason?: "unassigned_device" | "disabled_device" | "unknown_pin" | "duplicate_pin";
  deviceTime?: string;
  at?: string;
}

export interface Device {
  _id: string;
  serialNumber: string;
  adminId?: { _id: string; name: string; phone: string } | null;
  label?: string;
  model?: string;
  status: "unassigned" | "active" | "disabled";
  autoDiscovered?: boolean;
  lastSeenAt?: string | null;
  lastPunchAt?: string | null;
  punchCount?: number;
  recentUnresolved?: DeviceUnresolved[];
  notes?: string;
  createdAt?: string;
}

export async function getDevices(params?: {
  adminId?: string;
  status?: string;
  search?: string;
}) {
  const { data } = await apiClient.get(`${BASE}/devices`, { params });
  return data as { devices: Device[]; unassignedCount: number; total: number };
}

export async function createDevice(payload: {
  serialNumber: string;
  adminId?: string | null;
  label?: string;
  model?: string;
  notes?: string;
}) {
  const { data } = await apiClient.post(`${BASE}/devices`, payload);
  return data as Device;
}

export async function updateDevice(
  id: string,
  payload: {
    adminId?: string | null;
    label?: string;
    model?: string;
    status?: "active" | "disabled";
    notes?: string;
  }
) {
  const { data } = await apiClient.put(`${BASE}/devices/${id}`, payload);
  return data as Device;
}

export async function deleteDevice(id: string) {
  const { data } = await apiClient.delete(`${BASE}/devices/${id}`);
  return data;
}

export async function clearDeviceUnresolved(id: string) {
  const { data } = await apiClient.post(`${BASE}/devices/${id}/clear-unresolved`);
  return data as Device;
}

export async function getDevicePinMap(id: string) {
  const { data } = await apiClient.get(`${BASE}/devices/${id}/pin-map`);
  return data as {
    device: Device;
    employees: { _id: string; name: string; phone: string; deviceUserId?: string | null; status: string }[];
    unmapped: number;
  };
}

// ─── Plan Features ───────────────────────────────────────────────────────────

export async function getPlanFeatures() {
  const { data } = await apiClient.get(`${BASE}/plan-features`);
  return data;
}

export async function createPlanFeature(payload: Record<string, unknown>) {
  const { data } = await apiClient.post(`${BASE}/plan-features`, payload);
  return data;
}

export async function updatePlanFeature(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.put(`${BASE}/plan-features/${id}`, payload);
  return data;
}

export async function deletePlanFeature(id: string) {
  const { data } = await apiClient.delete(`${BASE}/plan-features/${id}`);
  return data;
}
