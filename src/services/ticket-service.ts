import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
}

export function useTicketService() {
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets");
      return data;
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ id, status, adminRemark }: { id: string; status: string; adminRemark?: string }) => {
      const { data } = await apiClient.put(`/tickets/${id}`, { status, adminRemark });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket updated successfully");
    },
    onError: (error: any) => {
      if (error?.response?.status === 404) {
        // Surface this distinctly rather than hiding the ticket — a 404 here on an
        // otherwise-visible ticket points at a backend route/contract mismatch,
        // not a genuinely deleted ticket. Hiding it would look like a fix while
        // actually discarding the admin's approve/reject action silently.
        toast.error("Update failed: the server couldn't find this ticket (404). This looks like a backend issue — the ticket has not been changed.");
        return;
      }
      toast.error(error.response?.data?.message || "Failed to update ticket");
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
      toast.success("Ticket deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete ticket");
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
    updateTicketStatus: updateTicketStatus.mutateAsync,
    isUpdating: updateTicketStatus.isPending,
    deleteTicket: deleteTicket.mutateAsync,
    isDeleting: deleteTicket.isPending,
    createTicket: createTicket.mutateAsync,
    isCreating: createTicket.isPending,
  };
}
