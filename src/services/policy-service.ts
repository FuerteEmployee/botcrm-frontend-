import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface HrPolicy {
  _id: string;
  title: string;
  category: string;
  content: string;
  effectiveDate: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function useHrPolicyService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<HrPolicy[]>({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data } = await apiClient.get("/policies");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<HrPolicy>) => {
      const { data } = await apiClient.post("/policies", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("HrPolicy created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<HrPolicy> & { id: string }) => {
      const { data } = await apiClient.put(`/policies/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("HrPolicy updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/policies/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("HrPolicy deleted");
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
