import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast }     from "sonner";

export interface Project {
  _id: string;
  name: string;
  client: string;
  deadline: string;
  budget: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useProjectService() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await apiClient.get("/projects");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Project>) => {
      const { data } = await apiClient.post("/projects", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Create failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Project> & { id: string }) => {
      const { data } = await apiClient.put(`/projects/${id}`, rest);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/projects/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
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
