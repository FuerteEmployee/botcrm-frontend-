import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface Leave {
  _id: string;
  employeeId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useLeaveService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<Leave[]>({
    queryKey: ["leaves"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leaves");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Leave>) => {
      const { data } = await apiClient.post("/leaves", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Leave> & { id: string }) => {
      const { data } = await apiClient.put(`/leaves/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/leaves/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave deleted");
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
