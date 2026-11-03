import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/**
 * Which sections this viewer may see. A section is off when the plan leaves
 * its module out, the super admin switched the feature off, or (sub-admins)
 * the matching page permission is off. Its figures are then null and its
 * lists empty -- the server leaves them out, the page hides them.
 */
export interface DashboardVisibility {
  attendance: boolean;
  leaves: boolean;
  employees: boolean;
  salary: boolean;
  expenses: boolean;
  leads: boolean;
  tickets: boolean;
  advances: boolean;
}

export interface DashboardSummary {
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isCustomRange?: boolean;
  startDate?: string;
  endDate?: string;
  /** Today as an IST date, YYYY-MM-DD. */
  today?: string;
  /** 'today' = right now; 'day' = one chosen date; 'total' = person-days summed over a period. */
  attendanceMode: "today" | "day" | "total";
  daysCounted?: number;
  visible: DashboardVisibility;
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    presentToday: number | null;
    lateToday: number | null;
    halfDayToday: number | null;
    /** Days with a real punch that could not be graded. NOT absence. */
    needsReviewToday: number | null;
    onLeaveToday: number | null;
    weeklyOffToday: number | null;
    holidayToday: number | null;
    absentToday: number | null;
    onDutyNow: number | null;
    holidayName: string | null;
    /** Night-shift staff counted from the shift that began yesterday. */
    nightShiftCounted: number;
    totalSalary: number | null;
    payslipCount: number | null;
    /** Approved + reimbursed claims in the period. */
    totalExpenses: number | null;
    approvedExpenseCount: number | null;
    expensesOverCapLeftOut: number | null;
    totalLeads: number | null;
  };
  pending: {
    leaves: number | null;
    corrections: number | null;
    tickets: number | null;
    advances: number | null;
    expenses: number | null;
  };
  recentEmployees: {
    _id: string;
    name: string;
    status: string;
    department: string | null;
    joiningDate: string | null;
    createdAt: string;
  }[];
  pendingTickets: {
    _id: string;
    type: string;
    status: string;
    createdAt: string;
    employeeName: string | null;
  }[];
  attendanceTrend: {
    date: string;
    day: string;
    label: string;
    present: number;
    absent: number;
    onLeave: number;
  }[];
  salaryDistribution: { name: string; value: number }[];
  departmentHeadcount: { name: string; value: number }[];
}

/** HTTP status of a failed request, or 0 when the server was never reached. */
export function errorStatus(error: unknown): number {
  return (error as { response?: { status?: number } })?.response?.status ?? 0;
}

export function useDashboardService(
  params: {
    month?: number;
    year?: number;
    startDate?: string;
    endDate?: string;
    enabled?: boolean;
  } = {},
) {
  const { month, year, startDate, endDate, enabled = true } = params;
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", month, year, startDate, endDate],
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get("/dashboard/summary", {
        params: { month, year, startDate, endDate },
      });
      return data;
    },
    // A refusal (403) or a bad date (400) will say the same thing again;
    // only a dropped connection or a server hiccup is worth one more try.
    retry: (failureCount, err) => {
      const status = errorStatus(err);
      return failureCount < 1 && (status === 0 || status >= 500);
    },
  });

  return {
    summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
}
