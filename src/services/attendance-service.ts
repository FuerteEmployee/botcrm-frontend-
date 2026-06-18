import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface AttendanceRecord {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
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
  status: 'present' | 'absent' | 'half-day' | 'late' | 'wfh';
  isWFH?: boolean;
  wasLate?: boolean;
  remarks?: string;
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

  return {
    records,
    isLoading,
    updateAttendance: updateAttendance.mutateAsync,
    isUpdating: updateAttendance.isPending,
    lunchIn: lunchIn.mutateAsync,
    lunchOut: lunchOut.mutateAsync,
  };
}
