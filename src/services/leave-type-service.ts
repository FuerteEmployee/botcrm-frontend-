import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage } from "@/services/request-error";
import type { LeaveBalancePeriodType } from "@/services/leave-service";

export interface LeaveType {
  _id: string;
  leaveName: string;
  code: string;
  totalDays: number;
  iconStyle: string;
  colorCode: string;
  description?: string;
  // Whether approved leave of this type is paid — routes to the paidLeave vs
  // unpaidLeave payroll bucket. payWeight optionally overrides the tenant's
  // bucket weight (0..1) for this type specifically; null = use bucket default.
  isPaid?: boolean;
  payWeight?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Toast a failed leave-type call. Server validation messages (a duplicate
 * name, a type still in use) are shown as they are -- they are written for the
 * admin -- while a network drop or server fault gets a sentence to act on
 * instead of raw error text, and a 401/plan-gated 403 that another handler
 * already announced gets nothing.
 */
function toastTypeError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
}

export function useLeaveTypeService() {
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, error, isError, refetch } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leave-types");
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true
  });
  const leaveTypes = data ?? [];

  const createMutation = useMutation({
    mutationFn: async (newLeaveType: Partial<LeaveType>) => {
      const { data } = await apiClient.post("/leave-types", newLeaveType);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      // A quota change moves every employee's balance.
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave type created");
    },
    onError: (error: unknown) => {
      toastTypeError(error, "Could not save the leave type. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<LeaveType> & { id: string }) => {
      const { data } = await apiClient.put(`/leave-types/${id}`, update);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      // A quota change moves every employee's balance.
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave type saved");
    },
    onError: (error: unknown) => {
      toastTypeError(error, "Could not save the leave type. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/leave-types/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      // A quota change moves every employee's balance.
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave type deleted");
    },
    onError: (error: unknown) => {
      toastTypeError(error, "Could not delete the leave type. Please try again.");
    },
  });

  return {
    leaveTypes,
    // False until the first successful load. An empty list after a failed
    // request is not "no leave types configured", and must not be shown as one.
    hasData: data !== undefined,
    isLoading,
    isFetching,
    isError,
    refetch,
    error,
    createLeaveType: createMutation.mutateAsync,
    updateLeaveType: updateMutation.mutateAsync,
    deleteLeaveType: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * The tenant's leave balance period (Settings.leave.balancePeriod) for the
 * admin screens that configure leave. Read from GET /settings, which is
 * panel-only; employees learn the period from GET /leaves/balances instead.
 *
 * Shares the ["settings"] cache entry other admin screens use, and saving
 * refreshes every balance on screen, because changing the period changes what
 * "used" means for everyone at once.
 */
export function useLeaveBalancePeriodSetting() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<{ leave?: { balancePeriod?: LeaveBalancePeriodType } }>({
    queryKey: ["settings"],
    queryFn: async () => (await apiClient.get("/settings")).data,
  });

  const mutation = useMutation({
    mutationFn: async (balancePeriod: LeaveBalancePeriodType) => {
      const { data } = await apiClient.put("/settings", { leave: { balancePeriod } });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave balance period saved");
    },
    onError: (error: unknown) => {
      const message = requestErrorMessage(error, "Could not save the leave balance period. Please try again.");
      if (message) toast.error(message);
    },
  });

  return {
    balancePeriod: (data?.leave?.balancePeriod ?? "lifetime") as LeaveBalancePeriodType,
    hasData: data !== undefined,
    isLoading,
    isError,
    refetch,
    saveBalancePeriod: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
