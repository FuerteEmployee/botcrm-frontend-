import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface Training {
  _id: string;
  title: string;
  trainer: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useTrainingService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<Training[]>({
    queryKey: ["training"],
    queryFn: async () => {
      const { data } = await apiClient.get("/training");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Training>) => {
      const { data } = await apiClient.post("/training", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training"] });
      toast.success("Training created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Training> & { id: string }) => {
      const { data } = await apiClient.put(`/training/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training"] });
      toast.success("Training updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/training/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training"] });
      toast.success("Training deleted");
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
