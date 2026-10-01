import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import type { Regularization } from "@/services/regularization-service";

/** "Forgot to punch in / out" — a ticket that is also an attendance correction. */
export const CORRECTION_TICKET_TYPES = ["ForgotPunchIn", "ForgotPunchOut"] as const;
export type CorrectionTicketType = (typeof CORRECTION_TICKET_TYPES)[number];
export const isCorrectionTicket = (type: string): type is CorrectionTicketType =>
  (CORRECTION_TICKET_TYPES as readonly string[]).includes(type);

/** One set of words for ticket types, shared by the admin and employee pages. */
export const TICKET_TYPE_LABELS: Record<string, string> = {
  ForgotPunchIn: "Forgot to punch in",
  ForgotPunchOut: "Forgot to punch out",
  Correction: "Punch correction (old)",
  Query: "Question for HR",
  Complaint: "Complaint",
  Leave: "Leave",
};

export interface TicketCorrection {
  field: "punchIn" | "punchOut" | null;
  /** IST midnight of the attendance day (the shift's day, for a night shift). */
  date: string | null;
  requestedTime: string | null;
  /** What the day said when the employee asked. */
  recordedTime: string | null;
  /** What was applied on approval — may differ if the admin edited it. */
  appliedTime: string | null;
}

export interface Ticket {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    phone: string;
  };
  type: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
  createdAt: string;
  /** Set on a punch-correction ticket: the linked Regularization's id. */
  regularizationId?: string | null;
  correction?: TicketCorrection | null;
  /**
   * The linked correction as it stands now, attached by the list endpoint.
   * For a reviewer it also carries `currentPunchIn/Out` from the live day.
   */
  regularization?: (Omit<Regularization, "employeeId"> & { employeeId: string }) | null;
}

export function useTicketService() {
  const queryClient = useQueryClient();

  const { data: rawTickets, isLoading, isError, error, refetch, isFetching } = useQuery<Ticket[]>({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets");
      return data;
    },
  });
  // A 200 that is not a list (proxy error page) must not crash the page.
  const tickets: Ticket[] = Array.isArray(rawTickets) ? rawTickets : [];

  const updateTicketStatus = useMutation({
    mutationFn: async ({ id, status, adminRemark }: { id: string; status: string; adminRemark?: string }) => {
      const { data } = await apiClient.put(`/tickets/${id}`, { status, adminRemark });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      // A punch-correction ticket is decided through its correction, which
      // rewrites the day — every view of that day and the Corrections queue.
      queryClient.invalidateQueries({ queryKey: ["regularizations"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
      toast.success("Ticket updated");
    },
    onError: (error: any) => {
      if (error?.response?.status === 404) {
        // Deleted meanwhile (another admin), or never this company's.
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        toast.error("This ticket no longer exists. The list has been refreshed.");
        return;
      }
      toast.error(error.response?.data?.message || "Could not update the ticket");
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/tickets/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      toast.success("Ticket deleted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Could not delete the ticket");
    },
  });

  const createTicket = useMutation({
    mutationFn: async (payload: { employeeId: string; type: string; reason: string }) => {
      const { data } = await apiClient.post("/tickets", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create ticket");
    },
  });

  return {
    tickets,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    updateTicketStatus: updateTicketStatus.mutateAsync,
    isUpdating: updateTicketStatus.isPending,
    deleteTicket: deleteTicket.mutateAsync,
    isDeleting: deleteTicket.isPending,
    createTicket: createTicket.mutateAsync,
    isCreating: createTicket.isPending,
  };
}
