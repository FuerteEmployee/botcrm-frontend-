import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface LeaveType {
  _id: string;
  leaveName: string;
  code: string;
  totalDays: number;
  iconStyle: string;
  colorCode: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useLeaveTypeService() {
  const queryClient = useQueryClient();

  const { data: leaveTypes = [], isLoading, isFetching, error } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leave-types");
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true
  });

  const createMutation = useMutation({
    mutationFn: async (newLeaveType: Partial<LeaveType>) => {
      const { data } = await apiClient.post("/leave-types", newLeaveType);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      toast.success("Leave type created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create leave type");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<LeaveType> & { id: string }) => {
      const { data } = await apiClient.put(`/leave-types/${id}`, update);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      toast.success("Leave type updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update leave type");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/leave-types/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      toast.success("Leave type deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete leave type");
    },
  });

  return {
    leaveTypes,
    isLoading,
    isFetching,
    error,
    createLeaveType: createMutation.mutateAsync,
    updateLeaveType: updateMutation.mutateAsync,
    deleteLeaveType: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
