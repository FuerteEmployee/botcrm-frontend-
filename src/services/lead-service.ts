import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Lead {
  _id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: "new" | "contacted" | "qualified" | "lost" | "won";
  assignedTo: string;
  createdAt: string;
}

export function useLeadService() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data } = await apiClient.get("/leads");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newLead: Omit<Lead, "_id" | "createdAt">) => {
      const { data } = await apiClient.post("/leads", newLead);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead created successfully");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const { data: response } = await apiClient.put(`/leads/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated successfully");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deleted successfully");
    },
  });

  return {
    leads,
    isLoading,
    createLead: createMutation.mutateAsync,
    updateLead: updateMutation.mutateAsync,
    deleteLead: deleteMutation.mutateAsync,
  };
}
