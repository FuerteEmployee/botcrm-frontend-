import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "@/services/request-error";

export interface Department {
  _id: string;
  name: string;
  colorCode: string;
  /** Every employee in it, active or not. */
  employees?: number;
  /** Active employees only -- the number that blocks a delete. */
  activeEmployees?: number;
  createdAt: string;
  /** Do employees in this department send background location while on duty? */
  trackingEnabled?: boolean;
  /** May the geofence engine actually close a day for this department? */
  autoPunchOutEnabled?: boolean;
  /**
   * The auto punch-out engine treats this department as field staff because
   * of its name (isFieldRole on the server), so it never ends their day.
   */
  fieldRole?: boolean;
  /** The admin's explicit choice; null/undefined = still decided by the name. */
  isFieldStaff?: boolean | null;
}

export function useDepartmentService() {
  const queryClient = useQueryClient();

  const { data: departments = [], isLoading, error, refetch, isRefetching } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await apiClient.get("/departments");
      return data;
    },
    // A plan-gated 403 can never succeed on retry, and each attempt raised
    // another "upgrade your plan" prompt.
    retry: retryUnlessUnavailable,
  });

  // Plan cap for the Add button ("N of M used"); limit null = no cap. Under
  // the ["departments"] key, so every change that refreshes the list refreshes it.
  const { data: usage } = useQuery<{ used: number; limit: number | null }>({
    queryKey: ["departments", "usage"],
    queryFn: async () => (await apiClient.get("/departments/usage")).data,
    retry: retryUnlessUnavailable,
  });

  // Employee rows embed their populated department, so a rename or delete
  // must refetch them too, not wait out the app-wide one-minute staleTime.
  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ["departments"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  };

  // See branch-service: the server's sentence for a 4xx, never a raw 5xx.
  const toastError = (error: unknown, fallback: string) => {
    const message = requestErrorMessage(error, fallback);
    if (message) toast.error(message);
  };

  const createMutation = useMutation({
    mutationFn: async (newDept: Partial<Department>) => {
      const { data } = await apiClient.post("/departments", newDept);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Department created successfully");
    },
    onError: (error) => toastError(error, "Could not create the department. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...update }: Partial<Department> & { id: string }) => {
      const { data } = await apiClient.put(`/departments/${id}`, update);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Department updated successfully");
    },
    onError: (error) => toastError(error, "Could not save the department. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/departments/${id}`);
      return data;
    },
    onSuccess: () => {
      refreshAfterChange();
      toast.success("Department deleted successfully");
    },
    onError: (error) => {
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["departments"] });
      }
      toastError(error, "Could not delete the department. Please try again.");
    },
  });

  return {
    departments,
    usage,
    isLoading,
    error,
    refetch,
    isRefetching,
    createDepartment: createMutation.mutateAsync,
    updateDepartment: updateMutation.mutateAsync,
    deleteDepartment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
