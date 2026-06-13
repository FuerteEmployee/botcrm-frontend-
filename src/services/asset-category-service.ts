import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface AssetCategory {
  _id: string;
  name: string;
  icon?: string;
  description?: string;
}

export function useAssetCategoryService() {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery<AssetCategory[]>({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      const { data } = await apiClient.get("/asset-categories");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newCategory: Omit<AssetCategory, "_id">) => {
      const { data } = await apiClient.post("/asset-categories", newCategory);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category added successfully");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AssetCategory> }) => {
      const { data: response } = await apiClient.put(`/asset-categories/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category updated successfully");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/asset-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category removed successfully");
    },
  });

  return {
    categories,
    isLoading,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
