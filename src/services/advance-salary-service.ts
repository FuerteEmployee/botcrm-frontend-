import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface AdvanceSalaryRequest {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
    email?: string;
    profileImage?: string;
  } | null;
  branchId: {
    _id: string;
    name: string;
  };
  companyId: string;
  type: "advance-salary" | "loan";
  amount: number;
  approvedAmount?: number;
  reason: string;
  notes?: string;
  status: "pending" | "approved" | "rejected" | "repaid";
  reviewedBy?: {
    _id: string;
    name: string;
  };
  reviewedAt?: string;
  repaidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceSalarySummary {
  pending: number;
  approved: number;
  rejected: number;
  repaid: number;
}

// On-demand fetch (not a hook) — used by the payroll advance-deduction picker
// to look up a single employee's approved, not-yet-recovered requests.
export async function fetchApprovedAdvancesForEmployee(employeeId: string): Promise<AdvanceSalaryRequest[]> {
  const { data } = await apiClient.get("/advance-salary", {
    params: { employeeId, status: "approved" },
  });
  return data.data || [];
}

export function useAdvanceSalaryService() {
  const queryClient = useQueryClient();

  // GET list of requests
  const { data: requests = [], isLoading, error, refetch } = useQuery<AdvanceSalaryRequest[]>({
    queryKey: ["advance-salary-requests"],
    queryFn: async () => {
      const { data } = await apiClient.get("/advance-salary");
      return data.data || [];
    }
  });

  // POST create new request
  const createRequest = useMutation({
    mutationFn: async (payload: {
      type: "advance-salary" | "loan";
      amount: number;
      reason: string;
      notes?: string;
    }) => {
      const { data } = await apiClient.post("/advance-salary", payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      toast.success(data.message || "Request submitted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to submit request");
    }
  });

  // PATCH approve request (optionally for less than the requested amount)
  const approveRequest = useMutation({
    mutationFn: async ({ id, approvedAmount }: { id: string; approvedAmount?: number }) => {
      const { data } = await apiClient.patch(
        `/advance-salary/${id}/approve`,
        approvedAmount !== undefined ? { approvedAmount } : {}
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      toast.success(data.message || "Request approved");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to approve request");
    }
  });

  // PATCH reject request
  const rejectRequest = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/advance-salary/${id}/reject`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      toast.success(data.message || "Request rejected");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to reject request");
    }
  });

  // PATCH mark as repaid
  const markRepaid = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/advance-salary/${id}/repaid`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-salary-requests"] });
      toast.success(data.message || "Marked as repaid");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to mark as repaid");
    }
  });

  return {
    // List
    requests,
    isLoading,
    error,
    refetch,
    
    // Mutations
    createRequest: createRequest.mutateAsync,
    approveRequest: approveRequest.mutateAsync,
    rejectRequest: rejectRequest.mutateAsync,
    markRepaid: markRepaid.mutateAsync,
    
    // Loading states
    isCreating: createRequest.isPending,
    isApproving: approveRequest.isPending,
    isRejecting: rejectRequest.isPending,
    isMarkingRepaid: markRepaid.isPending
  };
}
