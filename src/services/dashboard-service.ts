import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface DashboardSummary {
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isCustomRange?: boolean;
  startDate?: string;
  endDate?: string;
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    absentToday: number;
    halfDayToday: number;
    totalSalary: number;
    totalExpenses: number;
    totalLeads: number;
  };
  recentEmployees: any[];
  pendingTickets: any[];
  attendanceTrend: { day: string; present: number; absent: number }[];
  salaryDistribution: { name: string; value: number }[];
  departmentHeadcount: { name: string; value: number }[];
}

export function useDashboardService(params: { month?: number; year?: number; startDate?: string; endDate?: string; enabled?: boolean } = {}) {
  const { month, year, startDate, endDate, enabled = true } = params;
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", month, year, startDate, endDate],
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get("/dashboard/summary", { params: { month, year, startDate, endDate } });
      return data;
    },
  });

  return {
    summary,
    isLoading,
  };
}
