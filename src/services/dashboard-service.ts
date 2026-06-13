import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface DashboardSummary {
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
}

export function useDashboardService() {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const { data } = await apiClient.get("/dashboard/summary");
      return data;
    },
  });

  return {
    summary,
    isLoading,
  };
}
