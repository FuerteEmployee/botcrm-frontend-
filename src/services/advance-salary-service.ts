import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage } from "./request-error";

export interface AdvanceSalaryRequest {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
    email?: string;
    profileImage?: string;
  } | null;
  branchId: {
    _id: string;
    name: string;
  };
  companyId: string;
  type: "advance-salary" | "loan";
  amount: number;
  approvedAmount?: number;
  reason: string;
  notes?: string;
  status: "pending" | "approved" | "rejected" | "repaid";
  // The admin's reason for a rejection (optional, up to 300 letters).
  adminRemark?: string;
  reviewedBy?: {
    _id: string;
    name: string;
  };
  reviewedAt?: string;
  repaidAt?: string;
  // Set by payroll when it recovers the advance: the 1st of the salary month
  // it was taken from. Absent when an admin marked it repaid by hand.
  deductedInMonth?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hard cap on one request, ₹1,00,00,000 (1 crore), set by the product owner.
 * It limits what an employee can ask for (NewRequestModal) and what an admin
 * can approve (advance-salary-page). The backend controller (advanceSalary.js)
 * enforces the same number on both; change them together.
 */
export const ADVANCE_MAX_AMOUNT = 10_000_000;

/** A request saved before the cap existed. It can only be rejected. */
export function isOverAdvanceCap(amount: number): boolean {
  return !(amount <= ADVANCE_MAX_AMOUNT);
}

/** Mirrors the backend's limit on the admin's rejection reason. */
export const ADVANCE_REMARK_MAX = 300;

/**
 * Money for a request row. A request saved before the cap can hold ₹1e55,
 * which in full is a 60-digit number that pushes the row off the screen.
 */
export function formatAdvanceAmount(amount: number): string {
  if (isOverAdvanceCap(amount)) return `Over ₹${ADVANCE_MAX_AMOUNT.toLocaleString("en-IN")}`;
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

/**
 * The sentence to show an employee when an advance-salary call fails.
 *
 * Most employees use the app on a budget phone and many do not read English
 * well, so this says what to do next, never what broke. The create endpoint's
 * 400s are already written that way (see backend advanceSalary.js), so those
 * are passed through; everything else is mapped here.
 */
export function advanceSalaryErrorMessage(error: unknown, action: "load" | "send"): string {
  const err = error as {
    response?: {
      status?: number;
      data?: {
        message?: string;
        subscriptionStatus?: string;
        requiredUpgrade?: boolean;
        featureDisabled?: boolean;
      };
    };
  } | null;
  const response = err?.response;
  // No response at all: offline, the connection dropped, or the timeout below.
  if (!response) return "No internet connection. Please check your internet and try again.";
  const { status, data } = response;
  if (status === 401) return "Please log in again.";
  // Plan / subscription / feature gates. Their raw text ("Please renew", "Please
  // upgrade", a module key) is addressed to the company, and an employee can
  // do nothing with it.
  if (
    status === 403 &&
    (data?.subscriptionStatus || data?.requiredUpgrade || data?.featureDisabled)
  ) {
    return "This is not available for your company right now. Please talk to your admin.";
  }
  if (!status || status >= 500) {
    return action === "load"
      ? "Could not load your requests. Please try again in a few minutes."
      : "Could not send your request. Please try again in a few minutes.";
  }
  return (
    data?.message ||
    (action === "load"
      ? "Could not load your requests. Please try again."
      : "Could not send your request. Please try again.")
  );
}

const NO_REQUESTS: AdvanceSalaryRequest[] = [];

export interface AdvanceSalarySummary {
  pending: number;
  approved: number;
  rejected: number;
  repaid: number;
}

// On-demand fetch (not a hook) — used by the payroll advance-deduction picker
// to look up a single employee's approved, not-yet-recovered requests.
export async function fetchApprovedAdvancesForEmployee(
  employeeId: string,
): Promise<AdvanceSalaryRequest[]> {
  const { data } = await apiClient.get("/advance-salary", {
    params: { employeeId, status: "approved" },
  });
  return data.data || [];
}

export function useAdvanceSalaryService(options: { pollWhilePending?: boolean } = {}) {
  const queryClient = useQueryClient();

  // GET list of requests
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery<AdvanceSalaryRequest[]>(
    {
      queryKey: ["advance-salary-requests"],
      queryFn: async () => {
        const { data } = await apiClient.get("/advance-salary");
        return data.data || [];
      },
      // The employee page opts in. While a request is still waiting, the answer
      // is the one thing the person is watching for, and focus refetching is off
      // app-wide (a Capacitor WebView gets no focus events anyway). One small GET
      // a minute, only while that page is open and visible, and only until
      // nothing is waiting.
      refetchInterval: options.pollWhilePending
        ? (query) => (query.state.data?.some((r) => r.status === "pending") ? 60_000 : false)
        : false,
    },
  );
  const requests = data ?? NO_REQUESTS;

  // POST create new request
  const createRequest = useMutation({
    mutationFn: async (payload: {
      type: "advance-salary" | "loan";
      amount: number;
      reason: string;
      notes?: string;
    }) => {
      // Bounded so a dead connection ends in a clear "no internet" message
      // instead of a spinner that never stops. If the server did save it, a
      // resend inside a minute is recognised as the same request (see the
      // duplicate check in the backend controller).
      const { data } = await apiClient.post("/advance-salary", payload, { timeout: 30_000 });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      toast.success(
        data?.duplicate
          ? data.message || "Your request was already sent."
          : "Request sent. You will see the answer on this page.",
      );
    },
    onError: (error: unknown) => {
      toast.error(advanceSalaryErrorMessage(error, "send"));
    },
  });

  // PATCH approve request (optionally for less than the requested amount)
  const approveRequest = useMutation({
    mutationFn: async ({ id, approvedAmount }: { id: string; approvedAmount?: number }) => {
      const { data } = await apiClient.patch(
        `/advance-salary/${id}/approve`,
        approvedAmount !== undefined ? { approvedAmount } : {},
      );
      return data;
    },
    onSuccess: () => {
      toast.success("Request approved.");
    },
    // The approve dialog shows the reason inline, where the admin is looking.
    // Refreshed on failure too: a 409 means someone else already decided it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  // PATCH reject request, with the admin's optional reason
  const rejectRequest = useMutation({
    mutationFn: async ({ id, adminRemark }: { id: string; adminRemark?: string }) => {
      const { data } = await apiClient.patch(
        `/advance-salary/${id}/reject`,
        adminRemark ? { adminRemark } : {},
      );
      return data;
    },
    onSuccess: () => {
      toast.success("Request rejected.");
    },
    // RejectReasonDialog shows the reason inline.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  // PATCH mark as repaid
  const markRepaid = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/advance-salary/${id}/repaid`);
      return data;
    },
    onSuccess: () => {
      toast.success("Marked as repaid.");
    },
    onError: (error) => {
      const message = requestErrorMessage(error, "Could not mark as repaid. Please try again.");
      if (message) toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
    },
  });

  return {
    // List
    requests,
    isLoading,
    isError,
    isFetching,
    // False until the first successful load. `requests` is [] both before that
    // and after a failed load, which is how a network error used to read as
    // "No requests found".
    hasLoaded: data !== undefined,
    error,
    refetch,

    // Mutations
    createRequest: createRequest.mutateAsync,
    approveRequest: approveRequest.mutateAsync,
    rejectRequest: rejectRequest.mutateAsync,
    markRepaid: markRepaid.mutateAsync,

    // Loading states
    isCreating: createRequest.isPending,
    isApproving: approveRequest.isPending,
    isRejecting: rejectRequest.isPending,
    isMarkingRepaid: markRepaid.isPending,
  };
}
