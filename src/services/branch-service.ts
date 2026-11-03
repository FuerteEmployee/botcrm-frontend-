import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "@/services/request-error";

export interface Branch {
  _id: string;
  branchName: string;
  branchLocation: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Metres. null/0/absent = the company default (Settings -> officeRadius). */
  radius?: number | null;
  /**
   * Per-branch fence switch. Undefined on branches created before the flag
   * existed, and those were always fenced -- so absent must read as ON
   * everywhere, never as off.
   */
  geoFenceEnabled?: boolean;
  /** Every employee assigned (primary or one of several), active or not. */
  employees?: number;
  /** Active employees only -- the number that blocks a delete. */
  activeEmployees?: number;
  createdAt: string;
}

export function useBranchService() {
  const queryClient = useQueryClient();

  const { data: branches = [], isLoading, error, refetch, isRefetching } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await apiClient.get("/branches");
      return data;
    },
    // A plan-gated 403 can never succeed on retry, and each attempt raised
    // another "upgrade your plan" prompt.
    retry: retryUnlessUnavailable,
  });

  // Plan cap for the Add button ("N of M used"); limit null = no cap. Under
  // the ["branches"] key, so every change that refreshes the list refreshes it.
  const { data: usage } = useQuery<{ used: number; limit: number | null }>({
    queryKey: ["branches", "usage"],
    queryFn: async () => (await apiClient.get("/branches/usage")).data,
    retry: retryUnlessUnavailable,
  });

  // Employee rows embed the branch they point at (populated name, and the
  // server re-points employees when a branch is deleted), so the employee
  // list must refetch too or it shows a renamed/deleted branch for up to a
  // minute (the app-wide staleTime).
  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ["branches"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  };

  // requestErrorMessage: the server's own sentence for a 4xx ("A branch called
  // ... already exists"), a plain retry line for a 5xx (never the raw
  // exception text), a connection line when offline, and silence for a 401
  // or plan-upgrade 403 that another part of the app already announced.
  const toastError = (error: unknown, fallback: string) => {
    const message = requestErrorMessage(error, fallback);
    if (message) toast.error(message);
  };

  const createMutation = useMutation({
    mutationFn: async (newBranch: Partial<Branch>) => {
      const { data } = await apiClient.post("/branches", newBranch);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Branch created successfully");
    },
    onError: (error) => toastError(error, "Could not create the branch. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Branch> & { id: string }) => {
      const { data } = await apiClient.put(`/branches/${id}`, update);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Branch updated successfully");
    },
    onError: (error) => toastError(error, "Could not save the branch. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/branches/${id}`);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Branch deleted successfully");
    },
    onError: (error) => {
      // Refused because people still work there: the list's counts are
      // stale, so refetch them for the dialog to show the real number.
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["branches"] });
      }
      toastError(error, "Could not delete the branch. Please try again.");
    },
  });

  return {
    branches,
    usage,
    isLoading,
    error,
    refetch,
    isRefetching,
    createBranch: createMutation.mutateAsync,
    updateBranch: updateMutation.mutateAsync,
    deleteBranch: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
