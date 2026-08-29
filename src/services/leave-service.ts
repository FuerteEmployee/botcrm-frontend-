import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Leave {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    profileImage?: string;
    email?: string;
    phone?: string;
  };
  leaveTypeId: {
    _id: string;
    leaveName: string;
    code: string;
    colorCode?: string;
    iconStyle?: string;
  };
  startDate: string;
  endDate: string;
  // Business days (weekends/holidays excluded) — computed server-side, not
  // user-editable, so it always matches what payroll actually charges.
  duration: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
  createdAt: string;
  updatedAt?: string;
}

export function useLeaveService() {
  const queryClient = useQueryClient();

  // Backend auto-scopes: employees only ever see their own leave requests,
  // admins/subadmins see the whole tenant (optionally filtered).
  const { data: leaves = [], isLoading, error } = useQuery<Leave[]>({
    queryKey: ["leaves"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leaves");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { employeeId?: string; leaveTypeId: string; startDate: string; endDate: string; reason: string }) => {
      const { data } = await apiClient.post("/leaves", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave request submitted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to submit leave request");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminRemark }: { id: string; status: "pending" | "approved" | "rejected"; adminRemark?: string }) => {
      const { data } = await apiClient.put(`/leaves/${id}`, { status, adminRemark });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave request updated");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update leave request");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/leaves/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave request deleted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete leave request");
    },
  });

  return {
    leaves,
    isLoading,
    error,
    createLeave: createMutation.mutateAsync,
    updateLeaveStatus: updateStatusMutation.mutateAsync,
    deleteLeave: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
