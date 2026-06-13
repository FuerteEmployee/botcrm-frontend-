import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Festival {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: "mandatory" | "optional" | "event";
  description: string;
  posterUrl?: string;
}

export function useFestivalService() {
  const queryClient = useQueryClient();

  const { data: festivals = [], isLoading, isFetching, error } = useQuery<Festival[]>({
    queryKey: ["festivals"],
    queryFn: async () => {
      const { data } = await apiClient.get("/festivals");
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await apiClient.post("/festivals", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Festival created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create festival");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const { data } = await apiClient.put(`/festivals/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Festival updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update festival");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/festivals/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Festival deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete festival");
    },
  });

  return {
    festivals,
    isLoading,
    isFetching,
    error,
    createFestival: createMutation.mutateAsync,
    updateFestival: updateMutation.mutateAsync,
    deleteFestival: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
