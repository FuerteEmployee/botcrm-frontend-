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
  /** What the punch-out said before approval — normally the shift-end fallback. */
  originalPunchOut?: string | null;
  createdAt: string;

  /**
   * What the attendance row says RIGHT NOW, attached by the list endpoint so a
   * reviewer can see the claim beside the value it would replace. Not stored on
   * the request; a pending one is not even linked to an attendance row yet.
   * Once approved the live row holds the new time, so `originalPunchOut` is
   * what the old value survives as.
   */
  currentPunchIn?: string | null;
  currentPunchOut?: string | null;
  currentCloseReason?: string | null;
}

/** One recent day the system closed on the employee's behalf, awaiting their confirmation. */
export interface MissedPunchOut {
  attendanceId: string;
  date: string;
  dayKey: string;
  punchIn: string;
  systemPunchOut: string;
  shiftName: string | null;
  shiftEndTime: string | null;
}

export interface SubmitRegularizationPayload {
  /**
   * Admin-only. An employee submitting for themselves omits it — the server
   * takes the id from the token and ignores this field, and the client session
   * does not carry a user _id to send anyway.
   */
  employeeId?: string;
  date: string;
  requestedPunchIn?: string;
  requestedPunchOut?: string;
  requestedLunchInTime?: string;
  requestedLunchOutTime?: string;
  requestedStatus?: string;
  reason: string;
}

/**
 * The caller's own recent days auto-closed at shift end, still unconfirmed.
 *
 * Server-scoped to the token holder, so there is no employeeId argument and an
 * employee can only ever see their own. Returns [] for admins, who have no
 * attendance of their own to correct.
 */
export function useMissedPunchOuts(enabled = true) {
  const { data = [], isLoading } = useQuery<MissedPunchOut[]>({
    queryKey: ["missed-punch-outs"],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/missed-punch-outs");
      return data;
    },
    enabled,
    // Nothing here changes while the app is open — the rows are written by the
    // 04:00 job. Refetching on every window focus would be pure noise.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return { missedPunchOuts: data, isLoading };
}

/**
 * `enabled: false` skips the list fetch for callers that only need the
 * mutations — the employee prompt is mounted in the shell and would otherwise
 * fire a /regularizations request on every app open.
 */
export function useRegularizationService({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();

  const { data: regularizations = [], isLoading } = useQuery<Regularization[]>({
    queryKey: ["regularizations"],
    queryFn: async () => {
      const { data } = await apiClient.get("/regularizations");
      return data;
    },
    enabled,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["regularizations"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
    queryClient.invalidateQueries({ queryKey: ["absent-today"] });
    // Approval rewrites the punch-out, so the day stops being an unconfirmed
    // one and must drop out of the employee's prompt list.
    queryClient.invalidateQueries({ queryKey: ["missed-punch-outs"] });
    queryClient.invalidateQueries({ queryKey: ["user-history"] });
  };

  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitRegularizationPayload) => {
      const { data } = await apiClient.post("/regularizations", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regularizations"] });
      // Submitting does not change attendance, but it does answer the question
      // the prompt was asking, so the day should stop being offered.
      queryClient.invalidateQueries({ queryKey: ["missed-punch-outs"] });
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      toast.success("Correction request submitted for approval");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to submit request");
    },
  });

  const approveMutation = useMutation({
    // The optional times are approve-with-an-edit: an admin who knows the real
    // leaving time can correct the claim in place rather than rejecting it and
    // asking the employee to file again.
    mutationFn: async ({ id, adminRemark, requestedPunchIn, requestedPunchOut }: {
      id: string;
      adminRemark?: string;
      requestedPunchIn?: string;
      requestedPunchOut?: string;
    }) => {
      const { data } = await apiClient.patch(`/regularizations/${id}/approve`, {
        adminRemark,
        requestedPunchIn,
        requestedPunchOut,
      });
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
