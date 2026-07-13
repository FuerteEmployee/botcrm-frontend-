import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface PerformanceReview {
  _id: string;
  employeeId: string;
  period: string;
  rating: number;
  comments: string;
  status: string;
  reviewedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export function usePerformanceReviewService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<PerformanceReview[]>({
    queryKey: ["performance"],
    queryFn: async () => {
      const { data } = await apiClient.get("/performance");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<PerformanceReview>) => {
      const { data } = await apiClient.post("/performance", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance"] });
      toast.success("PerformanceReview created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<PerformanceReview> & { id: string }) => {
      const { data } = await apiClient.put(`/performance/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance"] });
      toast.success("PerformanceReview updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/performance/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance"] });
      toast.success("PerformanceReview deleted");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Delete failed"),
  });

  return {
    items,
    isLoading,
    error,
    createItem:  createMutation.mutateAsync,
    updateItem:  updateMutation.mutateAsync,
    deleteItem:  deleteMutation.mutateAsync,
    isCreating:  createMutation.isPending,
    isUpdating:  updateMutation.isPending,
    isDeleting:  deleteMutation.isPending,
  };
}
