import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
  workDays?: string[];
  assigned?: number;
  createdAt: string;
  halfDayLatePunchInMin?: number;
  halfDayEarlyPunchOutMin?: number;
  lunch?: ShiftLunch;
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
