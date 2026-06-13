import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Department {
  _id: string;
  name: string;
  colorCode: string;
  employees?: number;
  createdAt: string;
}

export function useDepartmentService() {
  const queryClient = useQueryClient();

  const { data: departments = [], isLoading, error } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await apiClient.get("/departments");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newDept: Partial<Department>) => {
      const { data } = await apiClient.post("/departments", newDept);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create department");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Department> & { id: string }) => {
      const { data } = await apiClient.put(`/departments/${id}`, update);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update department");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/departments/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete department");
    },
  });

  return {
    departments,
    isLoading,
    error,
    createDepartment: createMutation.mutateAsync,
    updateDepartment: updateMutation.mutateAsync,
    deleteDepartment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
