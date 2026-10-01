import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "@/services/request-error";

/**
 * How much of the day is unpaid break.
 *
 * `inherit` keeps the tenant-wide Settings > Attendance > minLunch rule, which
 * deducts the configured minimum whether or not a break was punched. The other
 * modes are per-shift overrides; `from_punches` is the only one that cannot
 * dock a break nobody took.
 */
export type LunchMode = "inherit" | "none" | "fixed_window" | "fixed_duration" | "from_punches";

export interface ShiftLunch {
  mode?: LunchMode;
  /** fixed_window, "HH:mm" */
  startTime?: string | null;
  endTime?: string | null;
  /** fixed_duration */
  durationMins?: number | null;
  /** from_punches: floor applied only when a break WAS punched, and a cap. */
  minMins?: number | null;
  maxMins?: number | null;
}

export interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays?: string[] | null;
  createdAt: string;
  halfDayLatePunchInMin?: number;
  halfDayEarlyPunchOutMin?: number;
  lunch?: ShiftLunch;
  /** Every employee on it (primary or one of several), active or not. */
  employees?: number;
  /** Active employees only -- the number that blocks a delete. */
  activeEmployees?: number;
}

export function useShiftService() {
  const queryClient = useQueryClient();

  const { data: shifts = [], isLoading, error, refetch, isRefetching } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data } = await apiClient.get("/shifts");
      return Array.isArray(data) ? data : [];
    },
    // A plan-gated 403 can never succeed on retry, and each attempt raised
    // another "upgrade your plan" prompt.
    retry: retryUnlessUnavailable,
  });

  // Plan cap for the New Shift button ("N of M used"); limit null = no cap.
  // Under the ["shifts"] key, so every change that refreshes the list
  // refreshes it too.
  const { data: usage } = useQuery<{ used: number; limit: number | null }>({
    queryKey: ["shifts", "usage"],
    queryFn: async () => (await apiClient.get("/shifts/usage")).data,
    retry: retryUnlessUnavailable,
  });

  // Employee and attendance rows embed the shift they point at (populated
  // name and times), so a rename or a new time has to refetch them too, or the
  // Employees and Attendance pages show the old shift for up to a minute (the
  // app-wide staleTime).
  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
  };

  // requestErrorMessage: the server's own sentence for a 4xx ("A shift called
  // ... already exists"), a plain retry line for a 5xx (never the raw exception
  // text), a connection line when offline, and silence for a 401 or
  // plan-upgrade 403 that another part of the app already announced.
  const toastError = (error: unknown, fallback: string) => {
    const message = requestErrorMessage(error, fallback);
    if (message) toast.error(message);
  };

  const createMutation = useMutation({
    mutationFn: async (newShift: Partial<Shift>) => {
      const { data } = await apiClient.post("/shifts", newShift);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift created successfully");
    },
    onError: (error) => {
      // Refused at the plan cap: the "N of M used" line is stale.
      if ((error as { response?: { data?: { limitReached?: boolean } } })?.response?.data?.limitReached) {
        queryClient.invalidateQueries({ queryKey: ["shifts"] });
      }
      toastError(error, "Could not create the shift. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Shift> & { id: string }) => {
      const { data } = await apiClient.put(`/shifts/${id}`, update);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Shift updated successfully");
    },
    onError: (error) => toastError(error, "Could not save the shift. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/shifts/${id}`);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Shift deleted successfully");
    },
    onError: (error) => {
      // Refused because people still work it, or it is the default: the
      // list's counts are stale, so refetch them for the dialog.
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["shifts"] });
      }
      toastError(error, "Could not delete the shift. Please try again.");
    },
  });

  return {
    shifts,
    usage,
    isLoading,
    error,
    refetch,
    isRefetching,
    createShift: createMutation.mutateAsync,
    updateShift: updateMutation.mutateAsync,
    deleteShift: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
