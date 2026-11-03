import { apiClient } from "@/lib/api-client";

const BASE = "/superadmin";

// ─── Overview ────────────────────────────────────────────────────────────────

export interface OverviewStats {
  totalTenants: number;
  activeTenants: number;
  grace: number;
  trials: number;
  expiringTrials: number;
  paused: number;
  expired: number;
  noPlan: number;
  mrr: number;
  arr: number;
  newThisMonth: number;
  churnedThisMonth: number;
  failedPayments: number;
  overdueInvoices: number;
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  unassignedEmployees: number;
  attendanceToday: number;
  pendingLeaves: number;
  openTickets: number;
  machinesTotal: number;
  machinesOnline: number;
  machineQuietMinutes: number;
  orphanSubscriptions: number;
}

export interface OverviewActivity {
  adminId: string;
  company: string;
  phone: string;
  event: string;
  plan: string;
  planColor: string;
  mrr: number;
  employees: number;
  status: string;
  date: string;
}

export interface Overview {
  stats: OverviewStats;
  planDistribution: {
    plan: { _id: string; name: string; slug: string; color: string; isActive: boolean };
    count: number;
    mrr: number;
  }[];
  orphans: { _id: string; status: string; plan: string | null; createdAt: string }[];
  recentActivity: OverviewActivity[];
  monthStart: string;
  generatedAt: string;
}

export async function getOverview() {
  const { data } = await apiClient.get(`${BASE}/overview`);
  return data as Overview;
}

export interface SystemAnalytics {
  featureAdoption: {
    key: string;
    label: string;
    type: string;
    enforced: boolean;
    adoptedCount: number;
    liveCompanies: number;
    adoptionPercent: number;
  }[];
  liveCompanies: number;
  tenantGrowth: { month: string; count: number; churned: number }[];
  topTenants: {
    adminId: string;
    name?: string;
    companyName?: string;
    employeeCount: number;
    activeEmployees: number;
    plan: string | null;
    planColor: string | null;
    status: string;
    mrr: number;
  }[];
}

export async function getSystemAnalytics() {
  const { data } = await apiClient.get(`${BASE}/analytics`);
  return data as SystemAnalytics;
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export async function getTenants(params?: {
  search?: string;
  status?: string;
  plan?: string;
  sort?: "recent" | "name" | "renewal" | "employees" | string;
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
    /** YYYY-MM-DD (IST day); only while the status is trial. */
    trialEndDate?: string;
    bannerThresholdDays?: number;
    note?: string;
    email?: string;
    password?: string;
    /** Extend by one billing period from max(now, current paid end). */
    renew?: boolean;
    /** Confirm a plan with fewer seats than the company has employees. */
    acceptOverSeats?: boolean;
  },
) {
  const { data } = await apiClient.put(`${BASE}/tenants/${id}`, payload);
  return data;
}

export async function deactivateTenant(id: string) {
  const { data } = await apiClient.delete(`${BASE}/tenants/${id}`);
  return data;
}

/** Permanently deletes the company and every row it owns; its machines are released. */
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

export type InvoiceStatus = "paid" | "pending" | "failed" | "refunded";

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  adminId: { _id: string; name?: string; phone?: string; companyName?: string } | null;
  planId: { _id: string; name: string; slug: string; color: string } | null;
  amount: number;
  currency: string;
  period?: string;
  status: InvoiceStatus;
  paidAt?: string | null;
  dueDate?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  companyDeleted: boolean;
}

export interface InvoiceList {
  invoices: Invoice[];
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  filteredAmount: number;
  stats: {
    collected: number;
    collectedCount: number;
    pending: number;
    pendingCount: number;
    overdue: number;
    overdueCount: number;
    failed: number;
    failedAmount: number;
  };
}

export async function getInvoices(params?: {
  status?: "all" | "overdue" | InvoiceStatus;
  adminId?: string;
  search?: string;
  /** YYYY-MM-DD, IST day the invoice was raised (inclusive). */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get(`${BASE}/invoices`, { params });
  return data as InvoiceList;
}

export interface InvoiceInput {
  amount?: number;
  period?: string;
  /** YYYY-MM-DD (IST day), or null to clear. */
  dueDate?: string | null;
  status?: InvoiceStatus;
  notes?: string;
}

export async function createInvoice(payload: InvoiceInput & { adminId: string }) {
  const { data } = await apiClient.post(`${BASE}/invoices`, payload);
  return data as Invoice;
}

export async function updateInvoice(id: string, payload: InvoiceInput) {
  const { data } = await apiClient.put(`${BASE}/invoices/${id}`, payload);
  return data as Invoice;
}

// ─── Alert Rules ─────────────────────────────────────────────────────────────

export interface AlertRuleRow {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  /** True only when some job actually reads this rule's switch. */
  wired: boolean;
  /** What the switch really does, in plain words (from the backend's code map). */
  effect: string;
  updatedAt?: string;
}

export async function getAlerts() {
  const { data } = await apiClient.get(`${BASE}/alerts`);
  return data as AlertRuleRow[];
}

/** Sets the rule to an explicit value, so a double click can't flip it back. */
export async function toggleAlert(slug: string, isEnabled: boolean) {
  const { data } = await apiClient.put(`${BASE}/alerts/${encodeURIComponent(slug)}`, { isEnabled });
  return data as AlertRuleRow;
}

// ─── Health check (jobs/health_check.js) ──────────────────────────────────────

export type HealthSeverity = "high" | "medium" | "low";

export interface HealthFinding {
  _id: string;
  adminId: string | null;
  employeeId: string | null;
  companyName: string | null;
  employeeName: string | null;
  employeePhone: string | null;
  kind: string;
  severity: HealthSeverity;
  dayKey: string | null;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  status: "open" | "resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
}

export interface HealthList {
  findings: HealthFinding[];
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  counts: { bySeverity: Partial<Record<HealthSeverity, number>>; byKind: Record<string, number> };
  lastRunAt: string | null;
}

export async function getHealthFindings(params: {
  status?: "open" | "resolved" | "all";
  severity?: HealthSeverity | "";
  kind?: string;
  page?: number;
  limit?: number;
}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== undefined));
  const { data } = await apiClient.get(`${BASE}/health`, { params: clean });
  return data as HealthList;
}

export async function updateHealthFinding(id: string, status: "open" | "resolved", note?: string) {
  const { data } = await apiClient.patch(`${BASE}/health/${encodeURIComponent(id)}`, { status, note });
  return data as HealthFinding;
}

export async function runHealthCheckNow() {
  const { data } = await apiClient.post(`${BASE}/health/run`, { deep: true });
  return data as { ok: boolean; summary: { found: number; created: number; updated: number; autoResolved: number; errors: number } };
}

// ─── Biometric machines (eSSL/ZKTeco terminals) ───────────────────────────────

export interface DeviceUnresolved {
  pin?: string;
  reason?: "unassigned_device" | "disabled_device" | "unknown_pin" | "duplicate_pin" | "sequence_complete";
  deviceTime?: string;
  at?: string;
}

export interface Device {
  _id: string;
  serialNumber: string;
  adminId?: { _id: string; name: string; phone: string; companyName?: string } | null;
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
  claimedAt?: string | null;
  claimedVia?: "admin" | "superadmin" | "migration" | null;
  /** When the offline warning was last sent (jobs/device_health.js). */
  offlineAlertedAt?: string | null;
  offlineAlertCount?: number;
  /** Smallest clock gap seen in the last day, in minutes (utils/device_clock.js). */
  clockSkewMinutes?: number | null;
  clockSkewAlertedAt?: string | null;
  /** Deliberate correction added to every punch time, in minutes. */
  clockOffsetMinutes?: number;
}

export type DeviceStatusFilter = "all" | "active" | "disabled" | "unassigned" | "offline";

export async function getDevices(params?: { adminId?: string; status?: DeviceStatusFilter; search?: string }) {
  const { data } = await apiClient.get(`${BASE}/devices`, { params });
  return data as { devices: Device[]; unassignedCount: number; total: number; offlineAfterMinutes?: number };
}

export interface DeviceCompany {
  _id: string;
  name: string;
  contact: string;
  phone: string;
  isActive: boolean;
}

/** Every company a machine can be assigned to (not paged, unlike getTenants). */
export async function getDeviceCompanies() {
  const { data } = await apiClient.get(`${BASE}/devices/companies`);
  return data as DeviceCompany[];
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
    clockOffsetMinutes?: number;
  },
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
    employees: {
      _id: string;
      name: string;
      phone: string;
      deviceUserId?: string | null;
      status: string;
    }[];
    unmapped: number;
  };
}

// ─── App releases (OTA web bundles + APKs) ────────────────────────────────────
// Mounted at /app, not /superadmin; the operator routes are super-admin only.

export interface PilotCompany {
  _id: string;
  name?: string;
  companyName?: string;
}

export interface ApkRelease {
  _id: string;
  versionName: string;
  versionCode: number;
  url: string;
  sizeBytes: number | null;
  mandatory: boolean;
  enabled: boolean;
  channel: "production" | "pilot";
  pilotAdminIds?: PilotCompany[];
  notes?: string;
  checksum?: string | null;
  createdAt: string;
}

export interface BundleRelease {
  _id: string;
  version: string;
  url: string;
  channel: "production" | "pilot";
  enabled: boolean;
  platform?: string;
  sizeBytes: number | null;
  notes?: string;
  createdAt: string;
  pilotAdminIds?: PilotCompany[];
}

/** GET /app/fleet: installed apps seen by the OTA update check-in. */
export interface FleetData {
  windowDays: number;
  total: number;
  latestBundle: string | null;
  onLatestBundle: number | null;
  byApk: { label: string; devices: number }[];
  byBundle: { label: string; devices: number }[];
  devices: { company: string; apk: string; bundle: string; android: string | null; lastSeenAt: string }[];
}

export async function getApkReleases() {
  const { data } = await apiClient.get("/app/apks");
  return data as ApkRelease[];
}

export async function updateApkRelease(id: string, patch: { enabled?: boolean; mandatory?: boolean }) {
  const { data } = await apiClient.put(`/app/apks/${id}`, patch);
  return data as ApkRelease;
}

export async function getBundleReleases() {
  const { data } = await apiClient.get("/app/releases");
  return data as BundleRelease[];
}

export async function updateBundleRelease(id: string, patch: { enabled?: boolean }) {
  const { data } = await apiClient.put(`/app/releases/${id}`, patch);
  return data as BundleRelease;
}

export async function getFleet() {
  const { data } = await apiClient.get("/app/fleet");
  return data as FleetData;
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

// ─── Feature Toggles ─────────────────────────────────────────────────────────

export async function updateFeatureToggles(
  adminId: string,
  featureToggles: Record<string, boolean>,
) {
  const { data } = await apiClient.put(`${BASE}/tenants/${adminId}/feature-toggles`, {
    featureToggles,
  });
  return data;
}
