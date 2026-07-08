import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
}

export interface Coworker {
  _id: string;
  name: string;
}

export function useExpenseService() {
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await apiClient.get("/expenses");
      return data;
    },
  });

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
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Expense> }) => {
      const { data: response } = await apiClient.put(`/expenses/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated successfully");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted successfully");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/expenses/${id}/approve`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense approved");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to approve expense");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/expenses/${id}/reject`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense rejected");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to reject expense");
    },
  });

  return {
    expenses,
    isLoading,
    createExpense: createMutation.mutateAsync,
    updateExpense: updateMutation.mutateAsync,
    deleteExpense: deleteMutation.mutateAsync,
    approveExpense: approveMutation.mutateAsync,
    rejectExpense: rejectMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
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
