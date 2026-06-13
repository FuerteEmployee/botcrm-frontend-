import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Branch {
  _id: string;
  branchName: string;
  branchLocation: string;
  city: string;
  latitude: number;
  longitude: number;
  employees?: number;
  createdAt: string;
}

export function useBranchService() {
  const queryClient = useQueryClient();

  const { data: branches = [], isLoading, error } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await apiClient.get("/branches");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newBranch: Partial<Branch>) => {
      const { data } = await apiClient.post("/branches", newBranch);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create branch");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Branch> & { id: string }) => {
      const { data } = await apiClient.put(`/branches/${id}`, update);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update branch");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/branches/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete branch");
    },
  });

  return {
    branches,
    isLoading,
    error,
    createBranch: createMutation.mutateAsync,
    updateBranch: updateMutation.mutateAsync,
    deleteBranch: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
