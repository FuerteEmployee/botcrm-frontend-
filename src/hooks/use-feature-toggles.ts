import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "./use-auth";

// Default toggles — every feature enabled that is on by default for new tenants.
const DEFAULTS: Record<string, boolean> = {
  tracking: true,
  geofenceAutoPunchOut: true,
  leads: true,
  expenses: true,
  recruitment: false,
  training: false,
  performance: false,
  projects: false,
  assets: false,
  advanceSalary: true,
  announcements: true,
  policies: false,
  biometricDevices: true,
};

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

  const { data: toggles } = useQuery<Record<string, boolean>>({
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

  return { isFeatureEnabled, toggles: toggles || DEFAULTS };
}
