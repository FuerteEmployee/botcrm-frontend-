import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface JobPosting {
  _id: string;
  title: string;
  department: string;
  openings: number;
  location: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useJobPostingService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<JobPosting[]>({
    queryKey: ["recruitment"],
    queryFn: async () => {
      const { data } = await apiClient.get("/recruitment");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<JobPosting>) => {
      const { data } = await apiClient.post("/recruitment", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("JobPosting created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<JobPosting> & { id: string }) => {
      const { data } = await apiClient.put(`/recruitment/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("JobPosting updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/recruitment/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      toast.success("JobPosting deleted");
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
