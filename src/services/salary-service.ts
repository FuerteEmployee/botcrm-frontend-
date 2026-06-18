import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface SalaryRecord {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
  };
  baseSalary: number;
  bonus: number;
  deductions: number;
  totalSalary: number;
  grossSalary?: number;
  netSalary?: number;
  month: number;
  year: number;
  status: "paid" | "pending" | "final" | "review";
  breakdown?: any;
  workingDays?: number;
  // Engine audit fields (populated when payroll.enabled)
  payableDays?: number;
  totalDaysInWindow?: number;
  dailyRateBasis?: string;
  needsReview?: boolean;
  buckets?: {
    present?: number; wfh?: number; halfDay?: number; paidLeave?: number;
    weeklyOff?: number; holiday?: number; absent?: number; unpaidLeave?: number;
  };
  createdAt: string;
  remarks?: string;
  employmentType?: string;
}

export function useSalaryService(month?: number, year?: number) {
  const queryClient = useQueryClient();

  const { data: salaryRecords = [], isLoading, error } = useQuery<SalaryRecord[]>({
    queryKey: ["salaries", month, year],
    queryFn: async () => {
      if (!month || !year) return [];
      const { data } = await apiClient.get("/salary/report", {
        params: { month, year }
      });
      return data;
    },
    enabled: !!month && !!year
  });

  const updateSalary = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "paid" | "pending" | "final" | "review" }) => {
      const { data } = await apiClient.put(`/salary/${id}`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      toast.success("Salary status updated");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update salary");
    }
  });

  const addSalary = useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await apiClient.post("/salary", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      toast.success("Salary record added");
    }
  });

  const generateSalaries = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const { data } = await apiClient.post("/salary/generate", { month, year });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      toast.success(data.message || "Salaries generated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to generate salaries");
    }
  });

  return {
    salaryRecords,
    isLoading,
    error,
    updateSalary: updateSalary.mutateAsync,
    addSalary: addSalary.mutateAsync,
    generateSalaries: generateSalaries.mutateAsync,
    isUpdating: updateSalary.isPending,
    isAdding: addSalary.isPending,
    isGenerating: generateSalaries.isPending
  };
}

