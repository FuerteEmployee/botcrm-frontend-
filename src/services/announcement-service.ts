import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

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

/** The only fields the page sends. The server ignores anything else. */
export type AnnouncementInput = Pick<Announcement, "title" | "content" | "type" | "pinned">;

// Same limits as announcement_controller.js.
export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_CONTENT_MAX = 5000;

// A failed post used to fail silently: no mutation had an onError, so the
// dialog just stayed open. Now one toast, in words (never a raw 5xx text).
const toastError = (error: unknown, fallback: string) => {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
};

export function useAnnouncementService() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const { data: announcements = [], isLoading, isError, error, refetch, isFetching } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await apiClient.get("/announcements");
      return Array.isArray(data) ? data : [];
    },
    retry: retryUnlessUnavailable,
  });

  const createMutation = useMutation({
    mutationFn: async (input: AnnouncementInput) => {
      const { data } = await apiClient.post("/announcements", input);
      return data;
    },
    onSuccess: () => {
      refresh();
      toast.success("Notice posted");
    },
    onError: (e) => toastError(e, "Could not post the notice. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AnnouncementInput> }) => {
      const { data: response } = await apiClient.put(`/announcements/${id}`, data);
      return response;
    },
    onSuccess: () => {
      refresh();
      toast.success("Notice saved");
    },
    onError: (e) => toastError(e, "Could not save the notice. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/announcements/${id}`);
    },
    onSuccess: () => {
      refresh();
      toast.success("Notice deleted");
    },
    onError: (e) => toastError(e, "Could not delete the notice. Please try again."),
  });

  const togglePinMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/announcements/${id}/pin`);
      return data as Announcement;
    },
    onSuccess: (data) => {
      refresh();
      toast.success(data?.pinned ? "Pinned to the top" : "Unpinned");
    },
    onError: (e) => toastError(e, "Could not change the pin. Please try again."),
  });

  return {
    announcements,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    createAnnouncement: createMutation.mutateAsync,
    updateAnnouncement: updateMutation.mutateAsync,
    deleteAnnouncement: deleteMutation.mutateAsync,
    togglePin: togglePinMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    pinningId: togglePinMutation.isPending ? (togglePinMutation.variables as string | undefined) : undefined,
  };
}
