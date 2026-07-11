import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Regularization {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
  };
  attendanceId?: string | null;
  date: string;
  requestedPunchIn?: string | null;
  requestedPunchOut?: string | null;
  requestedLunchInTime?: string | null;
  requestedLunchOutTime?: string | null;
  requestedStatus?: "present" | "absent" | "half-day" | "late" | "wfh" | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface SubmitRegularizationPayload {
  employeeId: string;
  date: string;
  requestedPunchIn?: string;
  requestedPunchOut?: string;
  requestedLunchInTime?: string;
  requestedLunchOutTime?: string;
  requestedStatus?: string;
  reason: string;
}

export function useRegularizationService() {
  const queryClient = useQueryClient();

  const { data: regularizations = [], isLoading } = useQuery<Regularization[]>({
    queryKey: ["regularizations"],
    queryFn: async () => {
      const { data } = await apiClient.get("/regularizations");
      return data;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["regularizations"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
    queryClient.invalidateQueries({ queryKey: ["absent-today"] });
  };

  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitRegularizationPayload) => {
      const { data } = await apiClient.post("/regularizations", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regularizations"] });
      toast.success("Correction request submitted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to submit request");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, adminRemark }: { id: string; adminRemark?: string }) => {
      const { data } = await apiClient.patch(`/regularizations/${id}/approve`, { adminRemark });
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Correction approved");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to approve request");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, adminRemark }: { id: string; adminRemark?: string }) => {
      const { data } = await apiClient.patch(`/regularizations/${id}/reject`, { adminRemark });
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Correction rejected");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to reject request");
    },
  });

  return {
    regularizations,
    isLoading,
    submitRegularization: submitMutation.mutateAsync,
    approveRegularization: approveMutation.mutateAsync,
    rejectRegularization: rejectMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
  };
}
