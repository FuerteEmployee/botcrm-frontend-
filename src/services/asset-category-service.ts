import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

export interface AssetCategory {
  _id: string;
  name: string;
  icon?: string;
  description?: string;
}

function toastError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
}

// The server seeds a starter list (Laptop, Mobile, ...) the first time a
// company's list is read, so the page never has to create them itself.
export function useAssetCategoryService() {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading, isError } = useQuery<AssetCategory[]>({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      const { data } = await apiClient.get("/asset-categories");
      return Array.isArray(data) ? data : [];
    },
    retry: retryUnlessUnavailable,
  });

  const createMutation = useMutation({
    mutationFn: async (newCategory: Omit<AssetCategory, "_id">) => {
      const { data } = await apiClient.post("/asset-categories", newCategory);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category added");
    },
    onError: (error: unknown) => toastError(error, "The category could not be saved. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AssetCategory> }) => {
      const { data: response } = await apiClient.put(`/asset-categories/${id}`, data);
      return response as AssetCategory & { movedDevices?: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      // A rename carries the devices along, so their list changes too.
      if (res?.movedDevices) queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(res?.movedDevices ? `Category renamed. ${res.movedDevices} device record${res.movedDevices === 1 ? "" : "s"} moved with it.` : "Category renamed");
    },
    onError: (error: unknown) => toastError(error, "The category could not be renamed. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/asset-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      toast.success("Category deleted");
    },
    onError: (error: unknown) => toastError(error, "The category could not be deleted. Please try again."),
  });

  return {
    categories,
    isLoading,
    isError,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
