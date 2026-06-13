import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays?: string[];
  assigned?: number;
  createdAt: string;
}

export function useShiftService() {
  const queryClient = useQueryClient();

  const { data: shifts = [], isLoading, error } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data } = await apiClient.get("/shifts");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newShift: Partial<Shift>) => {
      const { data } = await apiClient.post("/shifts", newShift);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create shift");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Shift> & { id: string }) => {
      const { data } = await apiClient.put(`/shifts/${id}`, update);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update shift");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/shifts/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete shift");
    },
  });

  return {
    shifts,
    isLoading,
    error,
    createShift: createMutation.mutateAsync,
    updateShift: updateMutation.mutateAsync,
    deleteShift: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
