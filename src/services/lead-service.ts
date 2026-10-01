import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

export interface Lead {
  _id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: string;
  assignedTo: string;
  /** The employee behind assignedTo; unset on older leads. */
  assignedToId?: string | null;
  /** Who brought the lead in from the employee app (name only). */
  createdBy?: { _id: string; name: string } | string | null;
  createdAt: string;
  salesCalls?: number;
  botStatus?: string;
  value?: number;
  followUpDate?: string;
  notes?: string;
  address?: string;
  businessType?: string;
  requirement?: string;
  imageUrls?: string[];
  [key: string]: any;
}

// Shared by the admin page (which lists leads) and the employee Quick Actions
// (which only adds them), so both get the same feedback.
function createLeadOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (newLead: Omit<Lead, "_id" | "createdAt"> | FormData) => {
      const isFormData = newLead instanceof FormData;
      const { data } = await apiClient.post("/leads", newLead, isFormData ? {
        headers: { "Content-Type": "multipart/form-data" },
      } : undefined);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Lead saved");
    },
    // Callers swallow the rejection so the form stays open for a retry;
    // without this a failed lead ended with the spinner stopping and nothing
    // said at all.
    onError: (error: unknown) => {
      const message = requestErrorMessage(error, "The lead could not be saved. Please try again.");
      if (message) toast.error(message);
    },
  };
}

export function useLeadService() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, isError, error, refetch, isFetching } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leads");
      // A non-list reply (an HTML error page, a 204) must not crash the page.
      return Array.isArray(data) ? data : [];
    },
    retry: retryUnlessUnavailable,
  });

  const createMutation = useMutation(createLeadOptions(queryClient));

  // No success toast here: the page says what changed ("Stage changed to
  // Won"), and a bulk delete would otherwise raise one toast per lead.
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const { data: response } = await apiClient.put(`/leads/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: unknown) => {
      const message = requestErrorMessage(error, "The lead could not be updated. Please try again.");
      if (message) toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  return {
    leads,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    createLead: createMutation.mutateAsync,
    updateLead: updateMutation.mutateAsync,
    deleteLead: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

/**
 * Add-only, for a screen that creates leads but never lists them (the
 * employee Quick Actions). useLeadService() also runs GET /leads on mount,
 * which the employee page did on every visit just to draw an "Add Lead"
 * button -- and on a plan without the leads module, that GET is what raised
 * an "upgrade your plan" toast at an employee who can do nothing about it.
 */
export function useCreateLead() {
  const queryClient = useQueryClient();
  const createMutation = useMutation(createLeadOptions(queryClient));
  return { createLead: createMutation.mutateAsync, isCreating: createMutation.isPending };
}
