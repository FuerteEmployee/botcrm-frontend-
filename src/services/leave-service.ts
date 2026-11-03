import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toISTDateKey } from "@/lib/utils";
import { requestErrorMessage } from "@/services/request-error";
import { toast } from "sonner";

/**
 * Toast a failed leave call in words the person can act on.
 *
 * These used to toast `response.data.message || "Failed to …"`: a dropped
 * connection said nothing about what to do, and a server fault showed its raw
 * text (a Mongo error) verbatim. requestErrorMessage passes on only a 4xx's own
 * message, and returns null for a 401 or plan-gated 403 that another handler
 * has already announced, so the same tap never produces two toasts.
 */
function toastLeaveError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
}

/** Compact duration label: "Half Day", "1 Day", "3 Days". */
export function formatLeaveDuration(leave: Pick<Leave, 'duration' | 'dayPortion'>): string {
  if (leave.dayPortion && leave.dayPortion !== 'full') return 'Half Day';
  return `${leave.duration} Day${leave.duration > 1 ? 's' : ''}`;
}

/**
 * How a leave reads to a human: "10 Aug 2026 · Half day (first half)" rather
 * than "10/08/2026 to 10/08/2026 · 0.5 days".
 *
 * Defined once and used by both the admin list and the employee's own list, so
 * the two cannot drift into describing the same row differently.
 *
 * Read in IST, not the phone's own timezone. A 'YYYY-MM-DD' leave is stored at
 * UTC midnight and older rows at IST midnight (18:30 UTC the day before); both
 * are the right day in IST, but a phone left on a non-Indian timezone showed
 * one of them a day early.
 */
export function formatLeaveSpan(leave: Pick<Leave, 'startDate' | 'endDate' | 'duration' | 'dayPortion'>): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  if (leave.dayPortion && leave.dayPortion !== 'full') {
    const which = leave.dayPortion === 'first_half' ? 'first half' : 'second half';
    return `${fmt(leave.startDate)} · Half day (${which})`;
  }
  const sameDay = toISTDateKey(leave.startDate) === toISTDateKey(leave.endDate);
  if (sameDay) return `${fmt(leave.startDate)} · 1 day`;
  return `${fmt(leave.startDate)} → ${fmt(leave.endDate)} · ${leave.duration} days`;
}

/**
 * When leave quotas start again (Settings.leave.balancePeriod). "lifetime" is
 * the default and means they never do: every leave ever taken counts.
 */
export type LeaveBalancePeriodType = "lifetime" | "calendar_year" | "financial_year";

export interface LeaveBalancePeriod {
  type: LeaveBalancePeriodType;
  /** Inclusive IST day keys ('YYYY-MM-DD'); null for lifetime. */
  start: string | null;
  end: string | null;
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveName: string;
  code?: string;
  colorCode?: string;
  total: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface LeaveBalancesResponse {
  period: LeaveBalancePeriod;
  balances: LeaveBalance[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'YYYY-MM-DD' -> { y, m (1-12), d } without going through a timezone. */
function splitKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/**
 * The balance period in plain words, or null for lifetime (nothing to say).
 *
 *   calendar year  -> "This year (Jan–Dec 2026)", starts again "1 Jan 2027"
 *   financial year -> "This financial year (Apr 2026 – Mar 2027)", "1 Apr 2027"
 *
 * Built from the server's day keys rather than the phone's clock, so a phone
 * with a wrong date or timezone still shows the period the server counted.
 */
export function describeBalancePeriod(period?: LeaveBalancePeriod | null): { label: string; short: string; startsAgain: string } | null {
  if (!period || period.type === "lifetime" || !period.start || !period.end) return null;
  const s = splitKey(period.start);
  const e = splitKey(period.end);
  const next = e.m === 12 ? { m: 1, y: e.y + 1 } : { m: e.m + 1, y: e.y };
  const startsAgain = `1 ${MONTHS[next.m - 1]} ${next.y}`;
  if (period.type === "calendar_year") {
    return { label: `This year (Jan–Dec ${s.y})`, short: "this year", startsAgain };
  }
  return {
    label: `This financial year (${MONTHS[s.m - 1]} ${s.y} – ${MONTHS[e.m - 1]} ${e.y})`,
    short: "this financial year",
    startsAgain,
  };
}

/**
 * Used / waiting / left per leave type, computed by the server for the
 * tenant's balance period. An employee gets their own; a panel screen passes
 * the employee's id. One source for every screen that shows a balance, so the
 * employee's page and an admin's view cannot disagree.
 */
export function useLeaveBalances(employeeId?: string, options?: { enabled?: boolean }) {
  const { data, isLoading, isFetching, error, isError, refetch } = useQuery<LeaveBalancesResponse>({
    queryKey: ["leave-balances", employeeId ?? "me"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leaves/balances", { params: employeeId ? { employeeId } : undefined });
      return data;
    },
    enabled: options?.enabled ?? true,
  });
  return {
    period: data?.period ?? null,
    balances: data?.balances ?? [],
    hasData: data !== undefined,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  };
}

export interface Leave {
  _id: string;
  // null when the employee record no longer exists (populate finds nothing).
  employeeId: {
    _id: string;
    name: string;
    profileImage?: string;
    email?: string;
    phone?: string;
  };
  leaveTypeId: {
    _id: string;
    leaveName: string;
    code: string;
    colorCode?: string;
    iconStyle?: string;
  };
  startDate: string;
  endDate: string;
  // Business days (weekends/holidays excluded) — computed server-side, not
  // user-editable, so it always matches what payroll actually charges.
  duration: number;
  /**
   * Which part of the day is taken off. Absent on every row written before
   * half-days existed, so treat undefined as "full".
   */
  dayPortion?: 'full' | 'first_half' | 'second_half';
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Longest reason an admin may give when rejecting a leave (server enforces it too). */
export const MAX_REJECT_REASON_LENGTH = 300;

export function useLeaveService() {
  const queryClient = useQueryClient();

  // Backend auto-scopes: employees only ever see their own leave requests,
  // admins/subadmins see the whole tenant (optionally filtered).
  const { data, isLoading, isFetching, error, isError, refetch } = useQuery<Leave[]>({
    queryKey: ["leaves"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leaves");
      return data;
    },
  });
  const leaves = data ?? [];

  const createMutation = useMutation({
    mutationFn: async (payload: { employeeId?: string; leaveTypeId: string; startDate: string; endDate: string; reason: string; dayPortion?: 'full' | 'first_half' | 'second_half' }) => {
      const { data } = await apiClient.post("/leaves", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave request submitted");
    },
    onError: (error: unknown) => {
      toastLeaveError(error, "Could not send the leave request. Please try again.");
    },
  });

  const updateStatusMutation = useMutation({
    // `silent`: the caller reports the outcome itself. A bulk decision over
    // ten rows used to raise ten "Leave request approved" toasts plus a
    // summary that counted failures as successes.
    mutationFn: async ({ id, status, adminRemark }: { id: string; status: "pending" | "approved" | "rejected"; adminRemark?: string; silent?: boolean }) => {
      const { data } = await apiClient.put(`/leaves/${id}`, { status, adminRemark });
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      if (vars.silent) return;
      toast.success(vars.status === "rejected" ? "Leave request rejected" : vars.status === "approved" ? "Leave request approved" : "Leave request updated");
    },
    onError: (error: unknown, vars) => {
      // A refusal (409: already decided, 404: cancelled meanwhile) means the
      // list on screen is out of date, so refresh it either way.
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      if (vars?.silent) return;
      toastLeaveError(error, "Could not update the leave request. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/leaves/${id}`);
      return data as { message?: string } | undefined;
    },
    onSuccess: (data) => {
      // The server words it for the caller: "cancelled" for an employee taking
      // back their own request, "deleted" for an admin removing one.
      toast.success(data?.message || "Leave request deleted");
    },
    onError: (error: unknown) => {
      toastLeaveError(error, "Could not remove the leave request. Please try again.");
    },
    // Refetch on failure too: the usual reason an employee's cancel is refused
    // is that the admin decided it meanwhile, and the list should now say so.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
    },
  });

  return {
    leaves,
    // False until the first successful load, so a screen can tell "you have no
    // requests" apart from "the requests could not be loaded".
    hasData: data !== undefined,
    isLoading,
    isFetching,
    isError,
    refetch,
    error,
    createLeave: createMutation.mutateAsync,
    updateLeaveStatus: updateStatusMutation.mutateAsync,
    deleteLeave: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
