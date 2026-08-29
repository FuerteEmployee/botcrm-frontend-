import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface DashboardSummary {
  month: number;
  year: number;
  isCurrentMonth: boolean;
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

export function useDashboardService(month?: number, year?: number) {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", month, year],
    queryFn: async () => {
      const { data } = await apiClient.get("/dashboard/summary", { params: { month, year } });
      return data;
    },
  });

  return {
    summary,
    isLoading,
  };
}
