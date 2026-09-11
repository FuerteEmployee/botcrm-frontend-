import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface AttendanceRecord {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
    shiftId?: { _id: string; name: string; startTime: string; endTime: string };
    branchId?: { _id: string; branchName: string; city: string };
  };
  date: string;
  punchIn?: string;
  punchOut?: string;
  punchInLocation?: string | { lat: number; lng: number };
  punchOutLocation?: string | { lat: number; lng: number };
  lunchInTime?: string;
  lunchOutTime?: string;
  lunchInLocation?: string | { lat: number; lng: number };
  lunchOutLocation?: string | { lat: number; lng: number };
  punchInPhoto?: string;
  punchOutPhoto?: string;
  punchInDistance?: number | null;
  punchOutDistance?: number | null;
  lunchInDistance?: number | null;
  lunchOutDistance?: number | null;
  // Net worked milliseconds, already lunch-deducted server-side. Preferred
  // over recomputing from punchIn/punchOut, which ignores the break and
  // multi-shift days.
  totalWorkMs?: number;
  status: 'present' | 'absent' | 'half-day' | 'late' | 'wfh';
  source?: 'app' | 'lens' | 'biometric';
  // True while `punchOut` was set by a device (Lens/biometric) tap and never
  // finalized by an explicit app punch-out — it may just be a lunch-out.
  punchOutIsProvisional?: boolean;
  isWFH?: boolean;
  wasLate?: boolean;
  remarks?: string;
  shifts?: { punchIn?: string; punchOut?: string }[];
}

export interface AttendanceStats {
  date: string;
  presentToday: number;
  halfDayToday: number;
  lateArrivals: number;
  missingPunch: number;
  absentToday: number;
  pendingRegularizations: number;
}

export interface AbsentEmployee {
  _id: string;
  name: string;
  phone: string;
  shiftId?: { _id: string; name: string };
  branchId?: { _id: string; branchName: string };
}

export function useAttendanceService(startDate?: string, endDate?: string, employeeId?: string) {
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", startDate, endDate, employeeId],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/reports", {
        params: { startDate, endDate, employeeId }
      });
      return data;
    }
  });

  const updateAttendance = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AttendanceRecord> }) => {
      const { data: response } = await apiClient.put(`/attendance/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Attendance updated successfully");
    }
  });

  const lunchIn = useMutation({
    mutationFn: async (data: { employeeId: string; location?: string }) => {
      const { data: response } = await apiClient.post("/attendance/lunch-in", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Lunch break started");
    }
  });

  const lunchOut = useMutation({
    mutationFn: async (data: { employeeId: string; location?: string }) => {
      const { data: response } = await apiClient.post("/attendance/lunch-out", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Lunch break ended");
    }
  });

  const markAbsent = useMutation({
    mutationFn: async (data: { employeeId: string; date: string }) => {
      const { data: response } = await apiClient.put("/attendance/mark-absent", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      queryClient.invalidateQueries({ queryKey: ["absent-today"] });
      toast.success("Marked absent");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to mark absent");
    }
  });

  return {
    records,
    isLoading,
    updateAttendance: updateAttendance.mutateAsync,
    isUpdating: updateAttendance.isPending,
    lunchIn: lunchIn.mutateAsync,
    lunchOut: lunchOut.mutateAsync,
    markAbsent: markAbsent.mutateAsync,
  };
}

export function useAttendanceStats(date?: string) {
  const { data: stats, isLoading } = useQuery<AttendanceStats>({
    queryKey: ["attendance-stats", date],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/stats", { params: { date } });
      return data;
    },
  });

  return { stats, isLoading };
}

export function useAbsentToday() {
  const { data: absentees = [], isLoading } = useQuery<AbsentEmployee[]>({
    queryKey: ["absent-today"],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/absent-today");
      return data;
    },
  });

  return { absentees, isLoading };
}

// One raw device tap, exactly as the terminal reported it. `derivedAction` is
// what the current day-reconciliation decided the tap meant — null for taps
// that are only listed (see backend/src/utils/punch_reconcile.js: lunch is
// inferred only when a day has exactly four taps).
export interface PunchLogTap {
  _id: string;
  deviceTime: string;
  receivedAt: string;
  serialNumber: string | null;
  pin: string | null;
  source: "biometric" | "lens" | "app";
  discarded: boolean;
  discardReason: "debounced" | "sequence_complete" | "handler_rejected" | null;
  derivedAction: "punch-in" | "lunch-in" | "lunch-out" | "punch-out" | null;
}

/**
 * Every tap for one employee on one day, including rejected ones — a debounced
 * double-press is usually the answer to "I tapped and it didn't count", so
 * hiding those would remove the reason the list exists.
 *
 * `enabled` is false until the panel is actually expanded; there is no point
 * fetching a tap list nobody has opened.
 */
export function usePunchLog(employeeId?: string, date?: string, enabled = true) {
  const { data, isLoading } = useQuery<{ dayKey: string; taps: PunchLogTap[] }>({
    queryKey: ["punch-log", employeeId, date],
    queryFn: async () => {
      const { data } = await apiClient.get("/attendance/punch-log", {
        params: { employeeId, date },
      });
      return data;
    },
    enabled: enabled && !!employeeId && !!date,
  });

  return { taps: data?.taps ?? [], dayKey: data?.dayKey, isLoading };
}
