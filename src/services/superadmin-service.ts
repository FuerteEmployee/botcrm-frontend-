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
    note?: string;
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
