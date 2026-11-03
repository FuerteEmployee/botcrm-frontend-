import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

export interface Expense {
  _id: string;
  employeeId?: string;
  employeeName: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "reimbursed";
  attachmentUrl?: string;
  splitGroupId?: string;
  splitTotalAmount?: number;
  splitParticipantCount?: number;
  // The admin's reason for a rejection (optional, up to 300 letters).
  adminRemark?: string;
  reviewedAt?: string;
  // The 1st of the salary month that paid this claim (set by payroll).
  reimbursedInMonth?: string;
  createdAt?: string;
}

/** Mirrors the backend's limit on the admin's rejection reason. */
export const EXPENSE_REMARK_MAX = 300;

/** Same ₹1,00,00,000 limit as the claim form and the backend. */
export const EXPENSE_MAX_AMOUNT = 10_000_000;

/** A claim saved before the limit existed (e.g. ₹1e114). It can only be rejected. */
export function isOverExpenseCap(amount: number): boolean {
  return !(amount <= EXPENSE_MAX_AMOUNT);
}

export interface Coworker {
  _id: string;
  name: string;
}

// Money in full, Indian grouping: ₹1,25,000 -- never "₹1.3L" or "₹1.6k",
// which someone checking their own claim cannot turn back into rupees.
// Two decimals at most: a split share is stored unrounded (1000 / 3).
export function rupees(amount: number) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// "Reimbursed" is the accounting word; the employee's question is "was I paid?"
export const EXPENSE_STATUS_LABELS: Record<Expense["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Paid",
};

const NO_EXPENSES: Expense[] = [];

export function useExpenseService() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await apiClient.get("/expenses");
      return data;
    },
    retry: retryUnlessUnavailable,
  });
  // Guarded: anything but a list (an HTML error page, a gate's JSON) must not
  // reach .filter()/.reduce() in the pages and blank the screen.
  const expenses = Array.isArray(data) ? data : NO_EXPENSES;

  const createMutation = useMutation({
    mutationFn: async (newExpense: Omit<Expense, "_id"> | FormData) => {
      const isFormData = newExpense instanceof FormData;
      const { data } = await apiClient.post("/expenses", newExpense, isFormData ? {
        headers: { "Content-Type": "multipart/form-data" },
      } : undefined);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added successfully");
    },
    // Every caller swallows the rejection (the forms stay open for a retry),
    // so without this a failed claim -- offline, a refused amount, a server
    // error -- ended with the spinner stopping and nothing said at all.
    onError: (error) => {
      const message = requestErrorMessage(error, "Your expense could not be saved. Please try again.");
      if (message) toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Expense> }) => {
      const { data: response } = await apiClient.put(`/expenses/${id}`, data);
      return response;
    },
    onSuccess: () => {
      toast.success("Expense saved.");
    },
    // The admin form stays open on failure; say why rather than nothing.
    onError: (error) => {
      const message = requestErrorMessage(error, "The expense could not be updated. Please try again.");
      if (message) toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/expenses/${id}`);
    },
    onSuccess: () => {
      toast.success("Expense deleted.");
    },
    onError: (error) => {
      const message = requestErrorMessage(error, "The expense could not be deleted. Please try again.");
      if (message) toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/expenses/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      toast.success("Expense approved.");
    },
    onError: (error) => {
      const message = requestErrorMessage(error, "Could not approve this expense. Please try again.");
      if (message) toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  // Reject, with the admin's optional reason (shown to the employee).
  const rejectMutation = useMutation({
    mutationFn: async ({ id, adminRemark }: { id: string; adminRemark?: string }) => {
      const { data } = await apiClient.patch(`/expenses/${id}/reject`, adminRemark ? { adminRemark } : {});
      return data;
    },
    onSuccess: () => {
      toast.success("Expense rejected.");
    },
    // RejectReasonDialog shows the reason inline.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const approveGroupMutation = useMutation({
    mutationFn: async (splitGroupId: string) => {
      const { data } = await apiClient.patch(`/expenses/group/${splitGroupId}/approve`);
      return data;
    },
    onSuccess: () => {
      toast.success("All shares of the split expense approved.");
    },
    onError: (error) => {
      const message = requestErrorMessage(error, "Could not approve this split expense. Please try again.");
      if (message) toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const rejectGroupMutation = useMutation({
    mutationFn: async ({ splitGroupId, adminRemark }: { splitGroupId: string; adminRemark?: string }) => {
      const { data } = await apiClient.patch(
        `/expenses/group/${splitGroupId}/reject`,
        adminRemark ? { adminRemark } : {},
      );
      return data;
    },
    onSuccess: () => {
      toast.success("All shares of the split expense rejected.");
    },
    // RejectReasonDialog shows the reason inline.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  return {
    expenses,
    // False until the first successful load, so a failed load is not shown
    // as "no expenses".
    hasLoaded: Array.isArray(data),
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    createExpense: createMutation.mutateAsync,
    updateExpense: updateMutation.mutateAsync,
    deleteExpense: deleteMutation.mutateAsync,
    approveExpense: approveMutation.mutateAsync,
    rejectExpense: rejectMutation.mutateAsync,
    approveExpenseGroup: approveGroupMutation.mutateAsync,
    rejectExpenseGroup: rejectGroupMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isApproving: approveMutation.isPending,
    isApprovingGroup: approveGroupMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRejecting: rejectMutation.isPending,
    isRejectingGroup: rejectGroupMutation.isPending,
  };
}

// On-demand fetch (not a hook) — used by the payroll reimbursement picker to
// look up a single employee's approved, not-yet-reimbursed expenses.
export async function fetchApprovedExpensesForEmployee(employeeId: string): Promise<Expense[]> {
  const { data } = await apiClient.get("/expenses", {
    params: { employeeId, status: "approved" },
  });
  return data || [];
}

export function useCoworkers() {
  const { data: coworkers = [], isLoading } = useQuery<Coworker[]>({
    queryKey: ["coworkers"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/coworkers");
      return data;
    },
  });

  return { coworkers, isLoading };
}
