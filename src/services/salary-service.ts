import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export type SalaryStatus = "paid" | "pending" | "final" | "review";

export interface SalaryLine {
  name: string;
  amount: number;
  /** false: shown on the slip but not part of the net (a deduction that is only listed, or an allowance paid on top). */
  included?: boolean;
}

export interface SalaryRecord {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
    departmentId?: { _id: string; name: string } | null;
    branchId?: { _id: string; branchName: string } | null;
  };
  baseSalary: number;
  bonus: number;
  deductions: number;
  totalSalary: number;
  grossSalary?: number;
  netSalary?: number;
  month: number;
  year: number;
  status: SalaryStatus;
  paidAt?: string | null;
  breakdown?: { earnings?: SalaryLine[]; deductions?: SalaryLine[] };
  workingDays?: number;
  // Engine audit fields (populated when payroll.enabled)
  payableDays?: number;
  totalDaysInWindow?: number;
  dailyRateBasis?: string;
  needsReview?: boolean;
  buckets?: {
    present?: number; wfh?: number; halfDay?: number; paidLeave?: number;
    weeklyOff?: number; holiday?: number; absent?: number; unpaidLeave?: number;
    needsReview?: number;
  };
  deductedAdvanceRequestIds?: string[];
  reimbursedExpenseIds?: string[];
  createdAt: string;
  remarks?: string;
  employmentType?: string;
}

export interface GenerateResult {
  message: string;
  count: number;
  needsReview: { employeeId: string; name: string; remarks?: string }[];
  errors: { employeeId: string; name: string; error: string }[];
  skipped?: { employeeId: string; name: string; reason: string }[];
}

const errorMessage = (error: any, fallback: string) => error?.response?.data?.message || fallback;

const namesList = (items: { name: string }[]) => {
  const names = items.map((i) => i.name);
  return names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", ");
};

export function useSalaryService(month?: number, year?: number) {
  const queryClient = useQueryClient();

  const { data: salaryRecords = [], isLoading, error, refetch } = useQuery<SalaryRecord[]>({
    queryKey: ["salaries", month, year],
    queryFn: async () => {
      if (!month || !year) return [];
      const { data } = await apiClient.get("/salary/report", {
        params: { month, year }
      });
      // A 200 that is not a list (a captive portal, a proxy error page)
      // must not crash the page.
      return Array.isArray(data) ? data : [];
    },
    enabled: !!month && !!year
  });

  const updateSalary = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SalaryStatus }) => {
      const { data } = await apiClient.put(`/salary/${id}`, { status });
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      toast.success(vars.status === "paid" ? "Salary marked as paid" : "Payment undone");
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, "Could not update this salary"));
    }
  });

  const generateSalaries = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const { data } = await apiClient.post("/salary/generate", { month, year });
      return data as GenerateResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      toast.success(data?.message || "Payroll generated");
      if (data?.needsReview?.length) {
        toast.warning(`Check attendance before paying: ${namesList(data.needsReview)}`, { duration: 8000 });
      }
      if (data?.errors?.length) {
        toast.error(`Could not work out: ${namesList(data.errors)}`, { duration: 8000 });
      }
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, "Could not generate payroll"));
    }
  });

  // Recompute a single employee's salary for a month, optionally recovering one
  // or more of their approved advance-salary/loan requests in this run.
  const generateSalaryForEmployee = useMutation({
    mutationFn: async (payload: { employeeId: string; month: number; year: number; advanceRequestIds?: string[]; expenseIds?: string[] }) => {
      const { data } = await apiClient.post("/salary/generate-one", payload);
      return data as SalaryRecord;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      if (data?.status === "review") toast.warning("Salary recalculated. Some attendance days still need checking.");
      else toast.success("Salary recalculated");
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, "Could not recalculate this salary"));
    }
  });

  const deleteSalary = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/salary/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Salary record deleted");
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, "Could not delete this salary record"));
    }
  });

  return {
    salaryRecords,
    isLoading,
    error,
    refetch,
    updateSalary: updateSalary.mutateAsync,
    deleteSalary: deleteSalary.mutateAsync,
    generateSalaries: generateSalaries.mutateAsync,
    generateSalaryForEmployee: generateSalaryForEmployee.mutateAsync,
    isUpdating: updateSalary.isPending,
    isDeleting: deleteSalary.isPending,
    isGenerating: generateSalaries.isPending,
    isGeneratingOne: generateSalaryForEmployee.isPending
  };
}
