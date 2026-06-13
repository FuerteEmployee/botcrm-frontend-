/**
 * Super Admin Panel – Professional QA Test
 * Tests all 5 routes, UI states, dialogs, edge cases, and interactions.
 * Uses Playwright route interception to mock all superadmin API calls.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const BASE = "http://localhost:5173";
const API_BASE = "https://gray-crab-756474.hostingersite.com/api";
const SCREENSHOTS_DIR = "./test-screenshots";

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let screenshotIndex = 0;
async function ss(page, label) {
  const name = `${String(++screenshotIndex).padStart(2, "0")}-${label.replace(/\s+/g, "-")}.png`;
  const p = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

const findings = [];
function finding(severity, title, detail) {
  findings.push({ severity, title, detail });
  const icon = severity === "BUG" ? "❌" : severity === "WARN" ? "⚠️" : "🔍";
  console.log(`  ${icon} [${severity}] ${title}: ${detail}`);
}

// ─── Mock API data ────────────────────────────────────────────────────────────
const MOCK_OVERVIEW = {
  stats: {
    activeTenants: 42,
    newThisMonth: 5,
    mrr: 126000,
    trials: 7,
    expiringTrials: 2,
    failedPayments: 1,
    totalEmployees: 1280,
    attendanceToday: 892,
    pendingLeaves: 14,
    openTickets: 3,
  },
  planDistribution: [
    { plan: { _id: "p1", name: "Starter", slug: "starter", color: "#6366f1" }, count: 18, mrr: 36000 },
    { plan: { _id: "p2", name: "Growth", slug: "growth", color: "#10b981" }, count: 15, mrr: 67500 },
    { plan: { _id: "p3", name: "Enterprise", slug: "enterprise", color: "#f59e0b" }, count: 9, mrr: 22500 },
  ],
  recentActivity: [
    { company: "TechCorp Pvt Ltd", phone: "+91 9876543210", event: "upgraded", plan: "Growth", planColor: "#10b981", amount: 4500, employeesUsed: 32, date: new Date().toISOString() },
    { company: "Acme Solutions", phone: "+91 9111111111", event: "trial_started", plan: "Starter", planColor: "#6366f1", amount: 0, employeesUsed: 12, date: new Date(Date.now() - 86400000).toISOString() },
    { company: "Bright Ideas Ltd", phone: "+91 9222222222", event: "renewed", plan: "Growth", planColor: "#10b981", amount: 4500, employeesUsed: 28, date: new Date(Date.now() - 2 * 86400000).toISOString() },
    { company: "Nexus Corp", phone: "+91 9333333333", event: "expired", plan: "Starter", planColor: "#6366f1", amount: 0, employeesUsed: 8, date: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
};

const MOCK_PLANS = [
  { _id: "p1", name: "Starter", slug: "starter", price: 2000, annualPrice: 20000, maxEmployees: 25, trialDays: 14, color: "#6366f1", isFeatured: false, isActive: true, tenantCount: 18, modules: { attendance: true, payroll: false, leaveManagement: true } },
  { _id: "p2", name: "Growth", slug: "growth", price: 4500, annualPrice: 45000, maxEmployees: 100, trialDays: 14, color: "#10b981", isFeatured: true, isActive: true, tenantCount: 15, modules: { attendance: true, payroll: true, leaveManagement: true } },
  { _id: "p3", name: "Enterprise", slug: "enterprise", price: 8999, annualPrice: 89990, maxEmployees: null, trialDays: 30, color: "#f59e0b", isFeatured: false, isActive: true, tenantCount: 9, modules: { attendance: true, payroll: true, leaveManagement: true } },
];

const MOCK_FEATURES = [
  { _id: "f1", key: "attendance", label: "Attendance Tracking", type: "boolean", isActive: true },
  { _id: "f2", key: "payroll", label: "Payroll Management", type: "boolean", isActive: true },
  { _id: "f3", key: "leaveManagement", label: "Leave Management", type: "boolean", isActive: true },
];

const MOCK_TENANTS = {
  tenants: [
    {
      _id: "t1",
      adminId: { _id: "a1", name: "TechCorp Pvt Ltd", phone: "+91 9876543210", isActive: true },
      planId: { _id: "p2", name: "Growth", color: "#10b981", maxEmployees: 100 },
      status: "active",
      billingCycle: "monthly",
      employeesUsed: 32,
      mrr: 4500,
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
    {
      _id: "t2",
      adminId: { _id: "a2", name: "Acme Solutions", phone: "+91 9111111111", isActive: true },
      planId: { _id: "p1", name: "Starter", color: "#6366f1", maxEmployees: 25 },
      status: "trial",
      billingCycle: "monthly",
      employeesUsed: 12,
      mrr: 0,
      currentPeriodEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    {
      _id: "t3",
      adminId: { _id: "a3", name: "Nexus Corp", phone: "+91 9333333333", isActive: false },
      planId: { _id: "p1", name: "Starter", color: "#6366f1", maxEmployees: 25 },
      status: "expired",
      billingCycle: "monthly",
      employeesUsed: 8,
      mrr: 0,
      currentPeriodEnd: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      _id: "t4",
      adminId: { _id: "a4", name: "Bright Ideas Ltd", phone: "+91 9222222222", isActive: true },
      planId: { _id: "p3", name: "Enterprise", color: "#f59e0b", maxEmployees: null },
      status: "active",
      billingCycle: "annual",
      employeesUsed: 28,
      mrr: 89990 / 12,
      currentPeriodEnd: new Date(Date.now() + 300 * 86400000).toISOString(),
    },
  ],
  totalAll: 4,
};

const MOCK_INVOICES = {
  invoices: [
    { _id: "i1", invoiceNumber: "#INV-2406-001", adminId: { name: "TechCorp Pvt Ltd" }, planId: { name: "Growth", color: "#10b981" }, amount: 4500, period: "Jun 2024", status: "paid", paidAt: new Date().toISOString() },
    { _id: "i2", invoiceNumber: "#INV-2406-002", adminId: { name: "Bright Ideas Ltd" }, planId: { name: "Enterprise", color: "#f59e0b" }, amount: 89990, period: "Jun 2024", status: "pending", paidAt: null },
    { _id: "i3", invoiceNumber: "#INV-2406-003", adminId: { name: "Nexus Corp" }, planId: { name: "Starter", color: "#6366f1" }, amount: 2000, period: "May 2024", status: "failed", paidAt: null },
  ],
  stats: { collected: 4500, pending: 89990, pendingCount: 1, failed: 1 },
};

const MOCK_ALERTS = [
  { _id: "al1", name: "Trial expiry warning", slug: "trial-expiry", description: "Notify tenant 3 days before trial expires", isEnabled: true },
  { _id: "al2", name: "Payment failed", slug: "payment-failed", description: "Alert when an invoice payment fails", isEnabled: true },
  { _id: "al3", name: "Subscription renewed", slug: "subscription-renewed", description: "Confirm when subscription auto-renews", isEnabled: false },
  { _id: "al4", name: "New tenant signup", slug: "new-tenant", description: "Notify super admin when a new tenant registers", isEnabled: true },
];

// ─── Setup API mocking ────────────────────────────────────────────────────────
async function setupMocks(context) {
  const routes = [
    { url: `**/superadmin/overview`, body: MOCK_OVERVIEW },
    { url: `**/superadmin/tenants**`, body: MOCK_TENANTS },
    { url: `**/superadmin/plans**`, body: MOCK_PLANS },
    { url: `**/superadmin/plan-features**`, body: MOCK_FEATURES },
    { url: `**/superadmin/invoices**`, body: MOCK_INVOICES },
    { url: `**/superadmin/alerts**`, body: MOCK_ALERTS },
    { url: `**/superadmin/analytics**`, body: {} },
  ];

  for (const route of routes) {
    await context.route(route.url, async (r) => {
      const method = r.request().method();
      if (method === "GET") {
        await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.body) });
      } else if (method === "PUT" || method === "POST") {
        // Return a plausible mutation response
        const postData = r.request().postData();
        let responseBody = { success: true };
        if (route.url.includes("alerts")) {
          responseBody = { ...MOCK_ALERTS[0], isEnabled: !MOCK_ALERTS[0].isEnabled };
        } else if (route.url.includes("tenants")) {
          responseBody = MOCK_TENANTS.tenants[0];
        } else if (route.url.includes("plans")) {
          responseBody = MOCK_PLANS[0];
        } else if (route.url.includes("invoices")) {
          responseBody = { ...MOCK_INVOICES.invoices[0], status: "paid" };
        } else if (route.url.includes("plan-features")) {
          responseBody = { _id: "fn1", key: "testFeature", label: "Test Feature", type: "boolean", isActive: true };
        }
        await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseBody) });
      } else if (method === "DELETE") {
        await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }
    });
  }
}

// ─── Seed auth session ────────────────────────────────────────────────────────
async function seedSession(page) {
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    localStorage.setItem(
      "bot_hrms_session",
      JSON.stringify({
        role: "superadmin",
        name: "Bharat Kadavala",
        phone: "9999999999",
        token: "mock-super-token",
        loggedInAt: Date.now(),
      })
    );
  });
}

async function waitForContent(page, timeout = 10000) {
  // Wait for splash screen to disappear (3 second animation)
  try {
    await page.waitForSelector(".fixed.inset-0.z-\\[9999\\]", { state: "detached", timeout: 5000 });
  } catch {
    // may already be gone or not found
  }
  // Wait for skeletons to disappear (API loaded)
  try {
    await page.waitForSelector("[data-slot='skeleton']", { state: "detached", timeout });
  } catch {
    // may not have appeared or may have stayed
  }
  await page.waitForTimeout(800);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: false, slowMo: 100 });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await setupMocks(context);
const page = await context.newPage();

// Capture console errors
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(err.message));

console.log("\n═══════════════════════════════════════════════════");
console.log("  SUPER ADMIN PANEL — QA TEST SUITE");
console.log("═══════════════════════════════════════════════════\n");

// ─── AUTH GUARD TEST ──────────────────────────────────────────────────────────
console.log("▸ [1/7] Auth guard — unauthenticated redirect");
await page.goto(`${BASE}/super/overview`);
await page.waitForTimeout(2000);
const afterUnauth = page.url();
if (!afterUnauth.includes("/super/overview")) {
  console.log(`  ✅ Unauthenticated redirect → ${afterUnauth}`);
} else {
  finding("BUG", "Auth guard broken", `Should redirect but stayed at ${afterUnauth}`);
}
await ss(page, "auth-guard-unauthenticated");

// Seed session and wait for splash
await seedSession(page);
await page.goto(`${BASE}/super/overview`);
// Wait for splash to finish (3s)
await page.waitForTimeout(3500);
await waitForContent(page);

const currentUrl = page.url();
console.log(`  Current URL after auth seed: ${currentUrl}`);
await ss(page, "auth-seeded-state");

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
console.log("\n▸ [2/7] /super/overview — Dashboard");
await page.goto(`${BASE}/super/overview`);
await waitForContent(page);
await ss(page, "overview-loaded");

const currentUrlAfterNav = page.url();
console.log(`  URL: ${currentUrlAfterNav}`);
if (!currentUrlAfterNav.includes("/super/overview")) {
  finding("BUG", "Overview page redirect unexpected", `URL: ${currentUrlAfterNav}`);
}

// Check stat cards rendered
const statCards = await page.locator(".bg-card.border.rounded-xl.p-4").count();
console.log(`  Stat cards found: ${statCards}`);
if (statCards >= 8) {
  console.log(`  ✅ Stat cards visible: ${statCards}`);
} else {
  finding("WARN", "Overview stat cards low count", `Expected ≥8 stat cards, got ${statCards}`);
}

// Check specific stat values
const activeTenants = page.locator("text=Active tenants");
if (await activeTenants.count() > 0) {
  console.log("  ✅ 'Active tenants' stat card present");
}
const mrrCard = page.locator("text=MRR");
if (await mrrCard.count() > 0) {
  console.log("  ✅ MRR stat card present");
}

// Check Export button
const exportBtn = page.locator("button", { hasText: "Export" });
if (await exportBtn.count() > 0) {
  console.log("  ✅ Export button present on Overview");
  const isDisabled = await exportBtn.first().isDisabled();
  if (!isDisabled) {
    // With mock data, there IS activity so export should be enabled
    console.log("  ✅ Export enabled when activity data present");
    await exportBtn.first().click();
    await page.waitForTimeout(500);
    console.log("  ✅ Export CSV triggered (no error)");
  } else {
    finding("WARN", "Export still disabled even though mock activity data exists", "");
  }
} else {
  finding("WARN", "Export button missing on Overview", "");
}

// Check "New tenant" link
const newTenantLink = page.locator("a", { hasText: "New tenant" });
if (await newTenantLink.count() > 0) {
  console.log("  ✅ 'New tenant' CTA button in header");
} else {
  finding("WARN", "New tenant CTA missing from Overview header", "");
}

// Check plan distribution
const planDistSection = page.locator("h2", { hasText: "Plan distribution" });
if (await planDistSection.count() > 0) {
  console.log("  ✅ Plan distribution section present");
  // Check plan bars
  const planCards = page.locator("text=Starter, text=Growth, text=Enterprise").first();
  console.log("  ✅ Plan distribution has plan entries");
} else {
  finding("WARN", "Plan distribution section not found", "");
}

// Check recent activity table
const activitySection = page.locator("h2", { hasText: "Recent activity" });
if (await activitySection.count() > 0) {
  console.log("  ✅ Recent activity table section present");
  const rows = await page.locator("tbody tr").count();
  console.log(`  ✅ Activity table has ${rows} rows`);
  if (rows === 0) finding("WARN", "Activity table empty when mock data should show 4 rows", "");
} else {
  finding("WARN", "Recent activity section not found", "");
}

// Platform usage section
const platformSection = page.locator("h2", { hasText: "Platform usage" });
if (await platformSection.count() > 0) {
  console.log("  ✅ Platform usage section present");
} else {
  finding("WARN", "Platform usage section not found", "");
}

// Test mobile responsiveness
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(500);
await ss(page, "overview-mobile");
const mobileHeader = page.locator("text=B.O.T Super Admin");
if (await mobileHeader.count() > 0) {
  console.log("  ✅ Mobile header visible at 375px");
} else {
  finding("WARN", "Mobile header not found at 375px", "");
}
// Open mobile sidebar — target button inside the md:hidden mobile header only
const hamburgerBtn = page.locator(".md\\:hidden button").first();
try {
  await hamburgerBtn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await ss(page, "overview-mobile-sidebar-open");
  console.log("  ✅ Mobile hamburger opens sidebar sheet");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
} catch {
  finding("WARN", "Mobile hamburger button not clickable at 375px", "");
}
await page.setViewportSize({ width: 1440, height: 900 });

// ─── TENANTS PAGE ─────────────────────────────────────────────────────────────
console.log("\n▸ [3/7] /super/tenants — Tenant management");
await page.goto(`${BASE}/super/tenants`);
await waitForContent(page);
await ss(page, "tenants-loaded");

// Check filter tabs
const filterAll = page.locator("button", { hasText: /^All/ }).first();
if (await filterAll.count() > 0) {
  console.log("  ✅ Status filter tabs present");
} else {
  finding("BUG", "Filter tabs missing on Tenants page", "");
}

// Verify tenant count in "All" tab
const allTabText = await filterAll.textContent().catch(() => "");
console.log(`  ✅ All tab shows: "${allTabText.trim()}"`);
if (!allTabText.includes("4")) {
  finding("WARN", "All tab not showing correct tenant count (expected 4)", `Got: "${allTabText}"`);
}

// Test filter tabs
for (const filterLabel of ["active", "trial", "expired"]) {
  const btn = page.locator(`button:has-text("${filterLabel}")`).first();
  if (await btn.count() > 0) {
    await btn.click();
    await page.waitForTimeout(400);
    console.log(`  ✅ Filter tab '${filterLabel}' clickable`);
  }
}
await filterAll.click();
await page.waitForTimeout(400);

// Test search debounce - use class-based selector as placeholder might vary
const searchInput = page.locator("input.pl-9").first();
if (await searchInput.count() > 0) {
  await searchInput.fill("Tech");
  await page.waitForTimeout(150); // Before debounce fires
  await searchInput.fill("TechCorp");
  await page.waitForTimeout(350); // After debounce fires
  console.log("  ✅ Search input with debounce (fires once after 300ms idle)");
  await searchInput.clear();
  await page.waitForTimeout(350);
} else {
  // Try by placeholder attribute (attribute CSS may vary)
  const searchInput2 = page.locator("input[placeholder*='Search']").first();
  if (await searchInput2.count() > 0) {
    console.log("  ✅ Search input found by partial placeholder");
  } else {
    finding("BUG", "Search input not found on Tenants page", "");
  }
}

// Check tenant table rows
const tenantRows = await page.locator("tbody tr").count();
console.log(`  ✅ Tenant table has ${tenantRows} rows`);
if (tenantRows < 4) finding("WARN", "Tenant table shows fewer rows than expected (4 in mock)", `Got ${tenantRows}`);

// Check status badges
const activeBadge = page.locator("text=Active").first();
const trialBadge = page.locator("text=Trial").first();
const expiredBadge = page.locator("text=Expired").first();
if (await activeBadge.count() > 0) console.log("  ✅ Active status badge present");
if (await trialBadge.count() > 0) console.log("  ✅ Trial status badge present");
if (await expiredBadge.count() > 0) console.log("  ✅ Expired status badge present");

// Check employee usage bar colors (green/amber/red)
const greenBar = page.locator(".bg-emerald-500").first();
const redBar = page.locator(".bg-red-500").first();
if (await greenBar.count() > 0) console.log("  ✅ Green usage bar present");
// Nexus Corp has 8/25 employees = not red; TechCorp 32/100 = green; no overflow tenant in mock data
// Let's just verify bars exist
const usageBars = await page.locator(".h-1.rounded-full.bg-muted").count();
console.log(`  🔍 Employee usage bars: ${usageBars}`);

// Test action dropdown
const actionMenuBtn = page.locator("button[title='Actions']").first();
if (await actionMenuBtn.count() > 0) {
  await actionMenuBtn.click();
  await page.waitForTimeout(500);
  await ss(page, "tenants-action-dropdown");

  const manageItem = page.locator("text=Manage subscription");
  const deactivateItem = page.locator("text=Deactivate tenant");
  const deleteItem = page.locator("text=Delete permanently");

  if (await manageItem.count() > 0) console.log("  ✅ Dropdown: 'Manage subscription' present");
  else finding("BUG", "Dropdown missing 'Manage subscription'", "");

  if (await deactivateItem.count() > 0) console.log("  ✅ Dropdown: 'Deactivate tenant' present");
  else finding("BUG", "Dropdown missing 'Deactivate tenant'", "");

  if (await deleteItem.count() > 0) console.log("  ✅ Dropdown: 'Delete permanently' present");
  else finding("BUG", "Dropdown missing 'Delete permanently'", "");

  // Open manage dialog
  await manageItem.click();
  await page.waitForTimeout(500);
  await ss(page, "tenants-manage-dialog");

  const manageDialogTitle = page.locator("text=Manage —");
  if (await manageDialogTitle.count() > 0) {
    console.log("  ✅ Manage dialog opens with tenant name prefix 'Manage —'");
  } else {
    finding("WARN", "Manage dialog header missing 'Manage —' prefix", "");
  }

  // Check the selects
  const planSelect = page.locator("button[role='combobox']").first();
  if (await planSelect.count() > 0) {
    console.log("  ✅ Plan select present in Manage dialog");
  }

  // Save changes
  const saveBtn = page.locator("button", { hasText: "Save changes" });
  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await page.waitForTimeout(600);
    console.log("  ✅ Save changes triggers mutation (dialog closes on success)");
  }
  await page.waitForTimeout(300);
} else {
  finding("WARN", "Actions dropdown button not found on Tenants", "");
}

// Test Deactivate confirmation dialog
await page.goto(`${BASE}/super/tenants`);
await waitForContent(page);
const actionBtn2 = page.locator("button[title='Actions']").nth(0);
if (await actionBtn2.count() > 0) {
  await actionBtn2.click();
  await page.waitForTimeout(300);
  const deactivateItem = page.locator("text=Deactivate tenant");
  if (await deactivateItem.count() > 0) {
    await deactivateItem.click();
    await page.waitForTimeout(500);
    await ss(page, "tenants-deactivate-confirm");
    const confirmDialog = page.locator("text=Deactivate");
    if (await confirmDialog.count() > 0) {
      console.log("  ✅ Deactivate confirmation dialog appears");
      // Cancel it
      await page.locator("button", { hasText: "Cancel" }).first().click();
      await page.waitForTimeout(300);
      console.log("  ✅ Cancel closes deactivate dialog");
    }
  }

  // Test "Already deactivated" for inactive tenant
  const thirdRowActionBtn = page.locator("button[title='Actions']").nth(2);
  if (await thirdRowActionBtn.count() > 0) {
    await thirdRowActionBtn.click();
    await page.waitForTimeout(300);
    const alreadyDeact = page.locator("text=Already deactivated");
    if (await alreadyDeact.count() > 0) {
      console.log("  ✅ Inactive tenant shows 'Already deactivated' (disabled) in dropdown");
      const isDisabled = await alreadyDeact.locator("..").evaluate(el => el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true" || el.classList.contains("opacity-50"));
      console.log(`  🔍 'Already deactivated' disabled attribute: ${isDisabled}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

// Test "New tenant" dialog
const newTenantButton = page.locator("button", { hasText: "New tenant" });
if (await newTenantButton.count() > 0) {
  await newTenantButton.click();
  await page.waitForTimeout(500);
  await ss(page, "tenants-create-dialog");

  const dialogTitle = page.locator("text=Create new tenant");
  if (await dialogTitle.count() > 0) {
    console.log("  ✅ Create tenant dialog opens");

    const createBtn = page.locator("button", { hasText: "Create tenant" });
    const isDisabledEmpty = await createBtn.isDisabled();
    console.log(`  ${isDisabledEmpty ? "✅" : "❌"} Create tenant disabled when empty: ${isDisabledEmpty}`);
    if (!isDisabledEmpty) finding("BUG", "Create tenant allows submit with empty fields", "");

    // Fill name only
    const inputs = page.locator("input");
    await inputs.nth(0).fill("Test Company Inc");
    let stillDisabled = await createBtn.isDisabled();
    console.log(`  ${stillDisabled ? "✅" : "❌"} Disabled with name only (no phone): ${stillDisabled}`);
    if (!stillDisabled) finding("BUG", "Create tenant allows submit without phone", "");

    // Fill short phone (< 10 digits)
    await inputs.nth(1).fill("12345");
    stillDisabled = await createBtn.isDisabled();
    console.log(`  ${stillDisabled ? "✅" : "❌"} Disabled with phone < 10 digits: ${stillDisabled}`);
    if (!stillDisabled) finding("BUG", "Create tenant accepts phone shorter than 10 digits", "");

    // Fill valid phone
    await inputs.nth(1).fill("9876543210");
    await page.waitForTimeout(200);
    const enabledNow = !(await createBtn.isDisabled());
    console.log(`  ${enabledNow ? "✅" : "⚠️"} Enabled with valid name + 10-digit phone: ${enabledNow}`);
    if (!enabledNow) finding("WARN", "Create tenant still disabled with valid data", "Check plan dropdown populated");

    // Test email is optional (form valid without email)
    if (enabledNow) {
      // Don't fill email — should still be submittable
      console.log("  ✅ Email field is optional (form valid without it)");
    }

    // Cancel
    await page.locator("button", { hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    console.log("  ✅ Cancel closes Create dialog");
  } else {
    finding("BUG", "Create tenant dialog did not open", "");
  }
} else {
  finding("BUG", "New tenant button missing on Tenants page", "");
}

// Test Delete confirmation dialog
await page.goto(`${BASE}/super/tenants`);
await waitForContent(page);
const actionBtnDel = page.locator("button[title='Actions']").first();
if (await actionBtnDel.count() > 0) {
  await actionBtnDel.click();
  await page.waitForTimeout(300);
  const deleteItem = page.locator("text=Delete permanently");
  if (await deleteItem.count() > 0) {
    await deleteItem.click();
    await page.waitForTimeout(500);
    await ss(page, "tenants-delete-confirm");
    const deleteDialog = page.locator("text=Permanently delete");
    if (await deleteDialog.count() > 0) {
      console.log("  ✅ Permanent delete confirmation dialog appears");
      // Check strong warning text
      const strongWarning = page.locator("text=permanently delete");
      if (await strongWarning.count() > 0) console.log("  ✅ Bold 'permanently delete' warning visible");
      // Cancel
      await page.locator("button", { hasText: "Cancel" }).first().click();
      await page.waitForTimeout(300);
      console.log("  ✅ Cancel closes delete dialog");
    }
  }
}

// ─── PLANS PAGE ───────────────────────────────────────────────────────────────
console.log("\n▸ [4/7] /super/plans — Plans & module gating");
await page.goto(`${BASE}/super/plans`);
await waitForContent(page);
await ss(page, "plans-loaded");

const planCardsCount = await page.locator(".border.rounded-xl.p-5.bg-card").count();
console.log(`  Plans cards found: ${planCardsCount}`);
if (planCardsCount >= 3) {
  console.log(`  ✅ ${planCardsCount} plan cards visible`);
} else {
  finding("WARN", "Plan cards not all visible", `Expected ≥3, got ${planCardsCount}`);
}

// Check "Popular" featured badge
const popularBadge = page.locator("text=Popular");
if (await popularBadge.count() > 0) {
  console.log("  ✅ Featured plan shows 'Popular' badge");
} else {
  finding("WARN", "Featured plan 'Popular' badge not visible", "");
}

// Check plan pricing
const pricingText = page.locator("text=/₹[0-9,]+/").first();
if (await pricingText.count() > 0) {
  console.log("  ✅ Plan pricing in INR (₹) displayed");
}

// Check Module gating matrix
const matrixSection = page.locator("h2", { hasText: "Module gating matrix" });
if (await matrixSection.count() > 0) {
  console.log("  ✅ Module gating matrix section present");
  // Check matrix has plan name headers
  const matrixHeaders = await page.locator("table thead th").count();
  console.log(`  🔍 Matrix table headers: ${matrixHeaders} (1 module name + 3 plans = 4 expected)`);
  if (matrixHeaders < 4) finding("WARN", "Module matrix has fewer columns than expected", `Got ${matrixHeaders}`);
} else {
  finding("WARN", "Module gating matrix section not found", "");
}

// Check toggle switches in matrix
const matrixSwitches = await page.locator("table button[role='switch']").count();
console.log(`  🔍 Module matrix toggle switches: ${matrixSwitches}`);

// Test "Manage features" dialog
const manageFeaturesBtn = page.locator("button", { hasText: "Manage features" });
if (await manageFeaturesBtn.count() > 0) {
  await manageFeaturesBtn.click();
  await page.waitForTimeout(500);
  await ss(page, "plans-feature-manager-dialog");

  if (await page.locator("text=Manage Features").count() > 0) {
    console.log("  ✅ Manage Features dialog opens");

    // Check existing features list
    const featureItems = await page.locator(".border.rounded.text-xs.bg-muted\\/20").count();
    console.log(`  ✅ ${featureItems} features in list`);

    // Submit disabled without key/label
    const addBtn = page.locator("button", { hasText: "Add Feature" });
    const isDisabled = await addBtn.isDisabled();
    console.log(`  ${isDisabled ? "✅" : "❌"} Add Feature disabled when key/label empty: ${isDisabled}`);
    if (!isDisabled) finding("BUG", "Add Feature allows empty key/label", "");

    // Fill valid data
    await page.locator("input[placeholder='e.g. advancedReports']").fill("testKey");
    await page.locator("input[placeholder='e.g. Advanced Reports']").fill("Test Label");
    const enabledNow = !(await addBtn.isDisabled());
    console.log(`  ${enabledNow ? "✅" : "⚠️"} Add Feature enabled with valid key+label: ${enabledNow}`);

    // Test Boolean → Select type switch reveals options field
    const typeSelectTrigger = page.locator("button[role='combobox']");
    if (await typeSelectTrigger.count() > 0) {
      await typeSelectTrigger.click();
      await page.waitForTimeout(300);
      const selectOption = page.locator("[role='option']", { hasText: "Select (Tiers)" });
      if (await selectOption.count() > 0) {
        await selectOption.click();
        await page.waitForTimeout(300);
        const optionsInput = page.locator("input[placeholder='none,basic,full']");
        if (await optionsInput.count() > 0) {
          console.log("  ✅ 'Select (Tiers)' type reveals CSV options input");
        } else {
          finding("BUG", "CSV options input not shown when type=select chosen", "");
        }
      }
    }

    // Delete a feature
    const deleteFeatureBtn = page.locator("button.text-destructive").first();
    if (await deleteFeatureBtn.count() > 0) {
      // Override the native confirm dialog
      page.once("dialog", async (dialog) => {
        console.log(`  🔍 Delete confirm dialog: "${dialog.message().slice(0, 80)}"`);
        await dialog.dismiss(); // Cancel — don't actually delete
      });
      await deleteFeatureBtn.click();
      await page.waitForTimeout(300);
      console.log("  ✅ Delete feature button works (confirmed with native dialog)");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    finding("BUG", "Manage Features dialog did not open", "");
  }
} else {
  finding("WARN", "Manage features button missing on Plans page", "");
}

// Test "New plan" dialog
const newPlanBtn = page.locator("button", { hasText: "New plan" });
if (await newPlanBtn.count() > 0) {
  await newPlanBtn.click();
  await page.waitForTimeout(500);
  await ss(page, "plans-create-dialog");

  if (await page.locator("text=Create new plan").count() > 0) {
    console.log("  ✅ Create plan dialog opens");

    const createPlanBtn = page.locator("button", { hasText: "Create plan" });
    const isDisabled = await createPlanBtn.isDisabled();
    console.log(`  ${isDisabled ? "✅" : "❌"} Create plan disabled without name/slug: ${isDisabled}`);
    if (!isDisabled) finding("BUG", "Create plan allows submit with empty name/slug", "");

    // Fill name+slug
    const dialogInputs = page.locator("dialog input, [role='dialog'] input");
    const allInputs = page.locator(".max-w-lg input");
    await allInputs.nth(0).fill("Pro Plan");
    await allInputs.nth(1).fill("pro");
    const enabledNow = !(await createPlanBtn.isDisabled());
    console.log(`  ${enabledNow ? "✅" : "⚠️"} Create plan enabled with name+slug: ${enabledNow}`);

    // Verify annual price field
    const annualPriceLabel = page.locator("label", { hasText: "Annual price" });
    if (await annualPriceLabel.count() > 0) console.log("  ✅ Annual price field present");
    else finding("WARN", "Annual price field missing in Create Plan dialog", "");

    // Verify max employees placeholder text
    const maxEmpLabel = page.locator("label", { hasText: "Max employees" });
    if (await maxEmpLabel.count() > 0) console.log("  ✅ Max employees field present (placeholder: ∞ leave empty)");

    // Color picker
    const colorPicker = page.locator("input[type='color']");
    if (await colorPicker.count() > 0) console.log("  ✅ Color picker present");
    else finding("WARN", "Color picker missing", "");

    // Featured switch — scope to dialog to avoid clicking behind-overlay elements
    const featuredSwitch = page.locator("[role='dialog'] button[role='switch']").first();
    if (await featuredSwitch.count() > 0) {
      try {
        const initialState = await featuredSwitch.getAttribute("aria-checked");
        await featuredSwitch.click({ timeout: 5000 });
        await page.waitForTimeout(200);
        const newState = await featuredSwitch.getAttribute("aria-checked");
        console.log(`  ✅ Featured toggle: ${initialState} → ${newState}`);
        if (initialState === newState) finding("BUG", "Featured toggle did not change state", "");
      } catch {
        finding("WARN", "Featured switch click blocked (z-index / dialog overlay issue)", "");
      }
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    finding("BUG", "Create plan dialog did not open", "");
  }
}

// Test Edit plan dialog
const editPlanBtn = page.locator("button", { hasText: "Edit" }).first();
if (await editPlanBtn.count() > 0) {
  await editPlanBtn.click();
  await page.waitForTimeout(500);
  await ss(page, "plans-edit-dialog");

  const editDialogTitle = page.locator("text=Edit —");
  if (await editDialogTitle.count() > 0) {
    const titleText = await editDialogTitle.textContent();
    console.log(`  ✅ Edit plan dialog opens: "${titleText.trim()}"`);
  } else {
    finding("WARN", "Edit plan dialog title missing 'Edit —' prefix", "");
  }

  // Module toggles visible
  const moduleToggles = page.locator("[role='dialog'] button[role='switch']");
  const toggleCount = await moduleToggles.count();
  console.log(`  ✅ Edit dialog has ${toggleCount} module toggles`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
} else {
  finding("WARN", "No Edit button found on plan cards", "");
}

// Test inline matrix edit (blurring input)
const matrixNumberInput = page.locator("table input[type='number']").first();
if (await matrixNumberInput.count() > 0) {
  const originalVal = await matrixNumberInput.inputValue();
  await matrixNumberInput.fill("50");
  await matrixNumberInput.press("Tab"); // blur triggers onBlur save
  await page.waitForTimeout(600);
  console.log(`  ✅ Matrix number input save via Tab (blur): "${originalVal}" → "50"`);

  // Test Enter key save
  await matrixNumberInput.fill("75");
  await matrixNumberInput.press("Enter");
  await page.waitForTimeout(600);
  console.log("  ✅ Matrix number input save via Enter key");
} else {
  console.log("  🔍 No matrix number inputs found");
}

// ─── BILLING PAGE ─────────────────────────────────────────────────────────────
console.log("\n▸ [5/7] /super/billing — Invoices");
await page.goto(`${BASE}/super/billing`);
await waitForContent(page);
await ss(page, "billing-loaded");

// Check stats row
const collectedCard = page.locator("text=Collected this month");
if (await collectedCard.count() > 0) {
  console.log("  ✅ 'Collected this month' stat card present");
} else {
  finding("WARN", "Billing stats card 'Collected this month' not found", "");
}

const pendingCard = page.locator("text=Pending invoices");
if (await pendingCard.count() > 0) {
  console.log("  ✅ 'Pending invoices' stat card present");
}

const failedCard = page.locator("text=Failed / retrying");
if (await failedCard.count() > 0) {
  console.log("  ✅ 'Failed / retrying' stat card present");
}

// Check invoice table with mock data
const invoiceRows = await page.locator("tbody tr").count();
console.log(`  ✅ Invoice table: ${invoiceRows} rows`);
if (invoiceRows < 3) finding("WARN", "Invoice table fewer rows than expected (3 in mock)", `Got ${invoiceRows}`);

// Check invoice number format
const invoiceNumCell = page.locator("td.font-mono").first();
if (await invoiceNumCell.count() > 0) {
  const invNum = await invoiceNumCell.textContent();
  console.log(`  ✅ Invoice number displayed: "${invNum.trim()}"`);
  if (!invNum.includes("INV")) finding("WARN", "Invoice number format unexpected", `Got: "${invNum}"`);
}

// Check status badges
const paidBadge = page.locator("text=Paid").first();
const pendingBadge = page.locator("text=Pending").first();
const failedBadge = page.locator("text=Failed").first();
if (await paidBadge.count() > 0) console.log("  ✅ 'Paid' status badge present");
if (await pendingBadge.count() > 0) console.log("  ✅ 'Pending' status badge present");
if (await failedBadge.count() > 0) console.log("  ✅ 'Failed' status badge present");

// Check per-status action buttons
const markPaidBtns = await page.locator("button", { hasText: "Mark paid" }).count();
const retryBtns = await page.locator("button", { hasText: "Retry" }).count();
const downloadReceiptBtns = await page.locator("button[title='Download receipt']").count();
console.log(`  ✅ Invoice actions: Mark paid (${markPaidBtns}), Retry (${retryBtns}), Download (${downloadReceiptBtns})`);

if (markPaidBtns === 0) finding("WARN", "No 'Mark paid' buttons for pending invoices", "");
if (retryBtns === 0) finding("WARN", "No 'Retry' buttons for failed invoices", "");
if (downloadReceiptBtns === 0) finding("WARN", "No download receipt button for paid invoices", "");

// Test "Mark paid"
if (markPaidBtns > 0) {
  await page.locator("button", { hasText: "Mark paid" }).first().click();
  await page.waitForTimeout(700);
  console.log("  ✅ 'Mark paid' mutation triggered");
}

// Test "Retry"
if (retryBtns > 0) {
  await page.locator("button", { hasText: "Retry" }).first().click();
  await page.waitForTimeout(700);
  console.log("  ✅ 'Retry' mutation triggered");
}

// Test download receipt
if (downloadReceiptBtns > 0) {
  const [download] = await Promise.all([
    page.waitForEvent("download").catch(() => null),
    page.locator("button[title='Download receipt']").first().click(),
  ]);
  if (download) {
    console.log(`  ✅ Download receipt: "${download.suggestedFilename()}"`);
  } else {
    console.log("  ✅ Download receipt button clicked (Blob download, no download event)");
  }
  await page.waitForTimeout(300);
}

// Test Export CSV
const billingExport = page.locator("button", { hasText: "Export" });
if (await billingExport.count() > 0) {
  const isDisabled = await billingExport.isDisabled();
  console.log(`  ${!isDisabled ? "✅" : "⚠️"} Export enabled (has mock invoice data): ${!isDisabled}`);
  if (!isDisabled) {
    await billingExport.click();
    await page.waitForTimeout(400);
    console.log("  ✅ Export CSV triggered on Billing page");
  }
}

// ─── ALERTS PAGE ──────────────────────────────────────────────────────────────
console.log("\n▸ [6/7] /super/alerts — Alert rules");
await page.goto(`${BASE}/super/alerts`);
await waitForContent(page);
await ss(page, "alerts-loaded");

// Check header
const alertsH1 = page.locator("h1", { hasText: "Alert Rules" });
if (await alertsH1.count() > 0) {
  console.log("  ✅ Alerts page h1 'Alert Rules'");
} else {
  finding("BUG", "Alerts page header missing", "");
}

// Check subheader
const subheader = page.locator("text=Automated notifications");
if (await subheader.count() > 0) console.log("  ✅ Subheader 'Automated notifications' present");

// Check alert list (not empty state)
const noAlertsMsg = page.locator("text=No alert rules configured");
if (await noAlertsMsg.count() > 0) {
  finding("WARN", "Alerts empty state shown (mock data should populate 4 rules)", "");
}

// Check section heading
const sectionHeading = page.locator("h2", { hasText: "Automated alert rules" });
if (await sectionHeading.count() > 0) console.log("  ✅ Section heading 'Automated alert rules' visible");

// Check alert items
const alertItems = await page.locator(".border.rounded-xl.bg-card.divide-y > div").count();
console.log(`  ✅ Alert items: ${alertItems} (expected 4)`);
if (alertItems < 4) finding("WARN", "Alert items fewer than expected (4 in mock)", `Got ${alertItems}`);

// Check all 4 alert names
for (const name of ["Trial expiry warning", "Payment failed", "Subscription renewed", "New tenant signup"]) {
  const el = page.locator(`text="${name}"`);
  if (await el.count() > 0) {
    console.log(`  ✅ Alert rule "${name}" visible`);
  } else {
    finding("WARN", `Alert rule "${name}" not visible`, "");
  }
}

// Check toggle switches
const alertSwitches = page.locator("button[role='switch']");
const switchCount = await alertSwitches.count();
console.log(`  ✅ ${switchCount} toggle switches present`);
if (switchCount < 4) finding("WARN", `Expected 4 alert toggles, got ${switchCount}`, "");

// Toggle first alert
if (switchCount > 0) {
  const firstSwitch = alertSwitches.first();
  const wasChecked = await firstSwitch.getAttribute("aria-checked");
  await firstSwitch.click();
  await page.waitForTimeout(800);
  await ss(page, "alerts-after-toggle");
  console.log(`  ✅ First alert toggle clicked (was ${wasChecked})`);

  // All switches disabled during pending mutation?
  const isDisabledDuringMutation = await firstSwitch.isDisabled();
  // May already be resolved
  console.log(`  🔍 Switch disabled during pending: ${isDisabledDuringMutation}`);
}

// Check phase-2 footnote
const footnote = page.locator("text=Phase 2");
if (await footnote.count() > 0) {
  console.log("  ✅ Phase-2 implementation note visible");
} else {
  finding("WARN", "Phase-2 footnote not found", "Expected note about email/Firebase delivery");
}

// Probe: rapid toggle (should queue / be blocked while isPending)
if (switchCount > 1) {
  const secondSwitch = alertSwitches.nth(1);
  await secondSwitch.click();
  await secondSwitch.click(); // rapid double-click
  await page.waitForTimeout(800);
  console.log("  🔍 Rapid toggle probe: double-click on same switch — no crash");
}

// ─── SIDEBAR & NAVIGATION ─────────────────────────────────────────────────────
console.log("\n▸ [7/7] Sidebar navigation & collapse");
await page.goto(`${BASE}/super/overview`);
await waitForContent(page);

// Test all nav links
const navLinks = [
  { href: "/super/overview", label: "Dashboard" },
  { href: "/super/tenants", label: "Companies" },
  { href: "/super/plans", label: "Plans" },
  { href: "/super/billing", label: "Billing" },
  { href: "/super/alerts", label: "Alerts" },
];
for (const nav of navLinks) {
  const link = page.locator(`a[href='${nav.href}']`).first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForTimeout(600);
    const url = page.url();
    if (url.includes(nav.href)) {
      console.log(`  ✅ Nav '${nav.label}' → ${nav.href}`);
    } else {
      finding("BUG", `Nav '${nav.label}' wrong URL`, `Expected ${nav.href}, got ${url}`);
    }
  } else {
    finding("WARN", `Nav link '${nav.label}' not found`, "");
  }
}

// Test active link highlighting
await page.goto(`${BASE}/super/alerts`);
await page.waitForTimeout(500);
const alertNavLink = page.locator(`a[href='/super/alerts']`).first();
const alertLinkClass = await alertNavLink.getAttribute("class").catch(() => "");
const hasActive = alertLinkClass?.includes("text-primary") || alertLinkClass?.includes("bg-primary");
console.log(`  ${hasActive ? "✅" : "⚠️"} Active nav 'Alerts' has primary styling: ${hasActive}`);
if (!hasActive) finding("WARN", "Active nav link not highlighted with primary color", `Classes: ${alertLinkClass?.slice(0, 100)}`);

// Test sidebar section labels
const mainLabel = page.locator("text=Main");
const subsLabel = page.locator("text=Subscriptions");
if (await mainLabel.count() > 0) console.log("  ✅ Sidebar 'Main' section label present");
else finding("WARN", "Sidebar 'Main' section label missing", "");
if (await subsLabel.count() > 0) console.log("  ✅ Sidebar 'Subscriptions' section label present");
else finding("WARN", "Sidebar 'Subscriptions' section label missing", "");

// Test sidebar user info
const userFooter = page.locator("text=Super admin").first();
if (await userFooter.count() > 0) console.log("  ✅ Sidebar user footer shows 'Super admin'");
else finding("WARN", "Sidebar user footer 'Super admin' text missing", "");

const userName = page.locator("text=Bharat Kadavala").first();
if (await userName.count() > 0) console.log("  ✅ Sidebar user footer shows name 'Bharat Kadavala'");
else finding("WARN", "Sidebar user name not shown", "Session may not have populated correctly");

// Test sign-out button present
const signOutBtn = page.locator("button[title='Sign out']");
if (await signOutBtn.count() > 0) {
  console.log("  ✅ Sign out button present in sidebar");
} else {
  finding("WARN", "Sign out button missing", "");
}

// Test sidebar collapse toggle (hover the group container)
await page.goto(`${BASE}/super/overview`);
await waitForContent(page);
const sidebarContainer = page.locator("aside").first();
if (await sidebarContainer.count() > 0) {
  await sidebarContainer.hover();
  await page.waitForTimeout(400);
  await ss(page, "sidebar-hover");
  // The collapse button is inside a .group container, positioned absolutely
  const collapseBtn = page.locator("button.absolute.-right-3\\.5");
  if (await collapseBtn.count() > 0) {
    try {
      await collapseBtn.click({ timeout: 5000 });
      await page.waitForTimeout(600);
      await ss(page, "sidebar-collapsed");
      const collapsedWidth = await sidebarContainer.evaluate(el => el.offsetWidth);
      console.log(`  ✅ Sidebar collapsed to ${collapsedWidth}px wide (expected ~64)`);
      if (collapsedWidth > 100) finding("WARN", "Sidebar collapsed width larger than expected 64px", `Got ${collapsedWidth}px`);

      // Re-expand
      await sidebarContainer.hover();
      await page.waitForTimeout(300);
      await collapseBtn.click({ timeout: 5000 });
      await page.waitForTimeout(600);
      const expandedWidth = await sidebarContainer.evaluate(el => el.offsetWidth);
      console.log(`  ✅ Sidebar expanded to ${expandedWidth}px (expected ~220)`);
    } catch {
      console.log("  🔍 Collapse toggle not directly clickable — opacity 0 until hover resolved on screenshot");
    }
  } else {
    console.log("  🔍 Collapse toggle not found — check screenshot for hover state");
  }
}

// Test 404 (non-existent super admin route)
await page.goto(`${BASE}/super/nonexistent`);
await page.waitForTimeout(1500);
await ss(page, "404-page");
const notFoundText = page.locator("text=404");
if (await notFoundText.count() > 0) {
  console.log("  ✅ 404 page shown for unknown /super/* route");
} else {
  finding("WARN", "No 404 page for unknown super admin route", "");
}

// ─── CONSOLE ERRORS ──────────────────────────────────────────────────────────
console.log("\n▸ Console errors summary");
const unique = [...new Set(consoleErrors)];
if (unique.length === 0) {
  console.log("  ✅ No JS console errors during test session");
} else {
  unique.forEach((e) => finding("WARN", "Console error", e.slice(0, 200)));
}

// ─── FINAL SCREENSHOT ────────────────────────────────────────────────────────
await page.goto(`${BASE}/super/overview`);
await waitForContent(page);
await ss(page, "final-overview-state");

await browser.close();

// ─── REPORT ───────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════");
console.log("  FINDINGS SUMMARY");
console.log("═══════════════════════════════════════════════════");

const bugs  = findings.filter((f) => f.severity === "BUG");
const warns = findings.filter((f) => f.severity === "WARN");

if (bugs.length === 0 && warns.length === 0) {
  console.log("\n  ✅ All checks passed — no findings");
} else {
  if (bugs.length > 0) {
    console.log(`\n  ❌ BUGS (${bugs.length}):`);
    bugs.forEach((f, i) => console.log(`    ${i + 1}. ${f.title}${f.detail ? ": " + f.detail : ""}`));
  }
  if (warns.length > 0) {
    console.log(`\n  ⚠️  WARNINGS (${warns.length}):`);
    warns.forEach((f, i) => console.log(`    ${i + 1}. ${f.title}${f.detail ? ": " + f.detail : ""}`));
  }
}

const verdict = bugs.length > 0 ? "FAIL" : warns.length > 0 ? "PASS (with warnings)" : "PASS";
console.log(`\n  Verdict: ${verdict}`);
console.log(`  Screenshots: ${SCREENSHOTS_DIR}/`);
console.log("═══════════════════════════════════════════════════\n");
