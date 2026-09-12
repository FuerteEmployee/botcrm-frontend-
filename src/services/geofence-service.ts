import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

// Admin-facing view of the geofence engine: what it decided, whether it has
// earned the right to act, and how to undo it when it gets one wrong.

export type GeofenceDecision = "punched_out" | "abstained" | "inside" | "suppressed";

export interface GeofenceAuditRow {
  _id: string;
  employeeId?: { _id: string; name: string; phone?: string };
  branchId?: { _id: string; branchName: string };
  dayKey: string;
  decision: GeofenceDecision;
  reason: string;
  narrative?: string | null;
  radiusM?: number | null;
  thresholdM?: number | null;
  distanceM?: number | null;
  medoidLat?: number | null;
  medoidLng?: number | null;
  fixesInWindow: number;
  trustworthyFixes: number;
  distinctPositions: number;
  windowSpanMs: number;
  worstAccuracyM?: number | null;
  newestFixAgeMs?: number | null;
  shadow: boolean;
  closedAt?: string | null;
  createdAt: string;
}

export interface ShadowCriterion {
  value: number;
  required: number;
  ok: boolean;
  note?: string;
}

export interface ShadowReport {
  windowDays: number;
  // No engine-level "off" exists any more -- every tenant is always
  // evaluated so the promotion criteria stay answerable without first
  // blindly opting in. "shadow" covers the field default, not just an
  // explicit choice.
  mode: "shadow" | "enforcing";
  totals: {
    decisions: number;
    wouldHaveClosed: number;
    abstained: number;
    inside: number;
    suppressed: number;
  };
  byReason: Record<string, number>;
  criteria: Record<string, ShadowCriterion>;
  /** Every criterion met. The gate the server enforces reads the same numbers. */
  readyToArm: boolean;
  samples: Array<{
    employee?: string;
    dayKey: string;
    distanceM?: number | null;
    thresholdM?: number | null;
    fixes?: number;
    distinct?: number;
    fixAgeMs?: number | null;
    narrative?: string;
  }>;
}

/** Plain-English labels. The abstention reasons are the ones an admin must be
 *  able to read at a glance -- they are how a silently-broken engine is spotted. */
export const REASON_LABEL: Record<string, string> = {
  confirmed_exit: "Left the branch",
  within_fence: "Inside the fence",
  no_fixes: "No location received — tracking may have stopped",
  no_trustworthy_fix: "GPS too inaccurate to act on",
  too_few_fixes: "Not enough location readings",
  window_too_short: "Readings covered too little time",
  too_few_distinct_positions: "Same position repeated — one observation, not many",
  within_buffer: "Just outside the radius, inside the exit buffer",
  stale_fixes: "Newest reading too old to be current",
  grace_period: "Just punched in",
  role_exempt: "Works off-site — exempt",
  fence_disabled: "Geo-fence switched off",
  no_branch: "No branch with coordinates",
  on_lunch: "On a lunch break",
  not_punched_in: "Not punched in",
  already_closed: "Day already closed",
  shadow_mode: "Engine not enabled",
};

export function useGeofenceAudit(params: { employeeId?: string; date?: string; decision?: string } = {}, enabled = true) {
  const { data = [], isLoading } = useQuery<GeofenceAuditRow[]>({
    queryKey: ["geofence-audit", params],
    queryFn: async () => {
      const { data } = await apiClient.get("/geofence/audit", { params });
      return data;
    },
    enabled,
  });
  return { rows: data, isLoading };
}

export function useShadowReport(days = 14) {
  const { data, isLoading, refetch } = useQuery<ShadowReport>({
    queryKey: ["geofence-shadow-report", days],
    queryFn: async () => {
      const { data } = await apiClient.get("/geofence/shadow-report", { params: { days } });
      return data;
    },
  });
  return { report: data, isLoading, refetch };
}

export function useGeofenceMode() {
  const qc = useQueryClient();

  const setMode = useMutation({
    mutationFn: async (body: { enabled: boolean; shadowMode: boolean; acknowledgeRisk?: boolean }) => {
      const { data } = await apiClient.put("/geofence/mode", body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["geofence-shadow-report"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Auto punch-out setting saved");
    },
    onError: (error: any) => {
      const res = error.response?.data;
      // A 409 is the promotion gate refusing, and its `failures` array is the
      // whole value of the gate -- swallowing it into a generic error would
      // leave the admin with a switch that just does not work and no reason.
      if (error.response?.status === 409 && Array.isArray(res?.failures)) {
        toast.error("Not ready to enable yet", {
          description: res.failures.join(" · "),
          duration: 10000,
        });
        return;
      }
      toast.error(res?.message || "Failed to update the setting");
    },
  });

  const revert = useMutation({
    mutationFn: async ({ attendanceId, mode, punchOut, reason }: {
      attendanceId: string;
      mode: "reopen" | "correct";
      punchOut?: string;
      reason?: string;
    }) => {
      const { data } = await apiClient.post(`/geofence/revert/${attendanceId}`, { mode, punchOut, reason });
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["geofence-audit"] });
      toast.success(
        vars.mode === "reopen"
          ? "Session reopened — the employee is back on duty"
          : "Punch-out time corrected",
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to revert");
    },
  });

  return { setMode, revert };
}
