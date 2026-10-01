import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "./use-auth";

// Mirror of FEATURE_TOGGLE_DEFAULTS in backend/src/utils/feature_toggles.js —
// change both. Every feature that already shipped defaults ON: a tenant with
// nothing stored must keep what it had.
const DEFAULTS: Record<string, boolean> = {
  tracking: true,
  geofenceAutoPunchOut: true,
  leads: true,
  expenses: true,
  advanceSalary: true,
  announcements: true,
  biometricDevices: true,
  assets: true,
  recruitment: false,
  training: false,
  performance: false,
  projects: false,
  policies: false,
};

/**
 * Admin-panel route prefix → the toggle that gates it. Used by the layout
 * guard so a disabled page cannot be reached by typing its URL; the sidebar
 * carries the same keys on its NAV entries.
 */
export const FEATURE_ROUTES: { prefix: string; key: string }[] = [
  { prefix: "/tracking", key: "tracking" },
  { prefix: "/leads", key: "leads" },
  { prefix: "/expenses", key: "expenses" },
  { prefix: "/advance-salary", key: "advanceSalary" },
  { prefix: "/announcements", key: "announcements" },
  { prefix: "/biometric-devices", key: "biometricDevices" },
  { prefix: "/assets", key: "assets" },
];

export function featureKeyForPath(pathname: string): string | null {
  const hit = FEATURE_ROUTES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return hit ? hit.key : null;
}

async function fetchFeatureToggles(): Promise<Record<string, boolean>> {
  const { data } = await apiClient.get("/settings/feature-toggles");
  return data;
}

/**
 * Returns per-tenant feature toggles set by the super admin.
 *
 * Usage:
 *   const { isFeatureEnabled } = useFeatureToggles();
 *   if (isFeatureEnabled("tracking")) { ... }
 *
 * Only fetches for admin/subadmin roles — superadmins see everything,
 * employees don't need module gating.
 */
export function useFeatureToggles() {
  const { session } = useAuth();
  const role = session?.role;
  const shouldFetch = role === "admin" || role === "subadmin";

  const { data: toggles, isSuccess } = useQuery<Record<string, boolean>>({
    queryKey: ["feature-toggles"],
    queryFn: fetchFeatureToggles,
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000, // 5 minutes — these change rarely
    gcTime: 30 * 60 * 1000,
  });

  const isFeatureEnabled = (key: string): boolean => {
    // Superadmins always see everything
    if (role === "superadmin") return true;
    // If we haven't fetched yet, fall back to defaults
    const source = toggles || DEFAULTS;
    // Absent key = enabled (backward compatibility for new features)
    return source[key] !== false;
  };

  // `isLoaded` is true only once the server's answer is in, so a guard can
  // wait for it instead of acting on the defaults.
  return { isFeatureEnabled, toggles: toggles || DEFAULTS, isLoaded: isSuccess };
}
