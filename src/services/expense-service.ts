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
  status: "pending" | "approved" | "rejected";
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
    mutationFn: async (newExpense: Omit<Expense, "_id">) => {
      const { data } = await apiClient.post("/expenses", newExpense);
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

  return {
    expenses,
    isLoading,
    createExpense: createMutation.mutateAsync,
    updateExpense: updateMutation.mutateAsync,
    deleteExpense: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
