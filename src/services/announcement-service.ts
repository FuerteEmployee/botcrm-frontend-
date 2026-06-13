import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Announcement {
  _id: string;
  title: string;
  content: string;
  type: "general" | "urgent" | "event" | "policy";
  date: string;
  author: string;
  pinned: boolean;
  createdAt: string;
}

export function useAnnouncementService() {
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await apiClient.get("/announcements");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newAnnouncement: Omit<Announcement, "_id" | "date" | "author" | "createdAt">) => {
      const { data } = await apiClient.post("/announcements", newAnnouncement);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement posted");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Announcement> }) => {
      const { data: response } = await apiClient.put(`/announcements/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement deleted");
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/announcements/${id}/pin`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Pin status updated");
    },
  });

  return {
    announcements,
    isLoading,
    createAnnouncement: createMutation.mutateAsync,
    updateAnnouncement: updateMutation.mutateAsync,
    deleteAnnouncement: deleteMutation.mutateAsync,
    togglePin: togglePinMutation.mutateAsync,
  };
}
