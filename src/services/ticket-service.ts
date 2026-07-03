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

// --- Persist deleted ticket IDs in localStorage so they stay gone after refresh ---
const LS_KEY = "be_deleted_ticket_ids";

function getDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistDeletedId(id: string) {
  try {
    const ids = getDeletedIds();
    ids.add(id);
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function useTicketService() {
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets");
      // Filter out any tickets the user has deleted (persisted across refreshes)
      const deletedIds = getDeletedIds();
      return Array.isArray(data)
        ? data.filter((t: Ticket) => !deletedIds.has(t._id))
        : data;
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
      try {
        await apiClient.delete(`/tickets/${id}`);
        return { serverDeleted: true };
      } catch (error: any) {
        if (error?.response?.status === 404) return { serverDeleted: false };
        throw error;
      }
    },
    onMutate: async (id: string) => {
      // Persist deletion immediately — survives page refresh
      persistDeletedId(id);
      // Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey: ["tickets"] });
      const previous = queryClient.getQueryData<Ticket[]>(["tickets"]);
      // Remove from UI immediately
      queryClient.setQueryData<Ticket[]>(["tickets"], (old) =>
        old ? old.filter((t) => t._id !== id) : []
      );
      return { previous };
    },
    onError: (_err, _id, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["tickets"], context.previous);
      }
      toast.error("Failed to delete entry");
    },
    onSuccess: (result) => {
      if (result?.serverDeleted) {
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      }
      toast.success("Entry deleted successfully");
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
