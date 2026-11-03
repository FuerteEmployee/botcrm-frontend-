import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

export type QuestionKind = "none" | "yes_no" | "single" | "multiple" | "number";
export type AudienceMode = "all" | "branches" | "departments" | "shifts" | "employees";

export interface AnnouncementQuestion {
  kind: QuestionKind;
  prompt?: string;
  options?: string[];
  min?: number | null;
  max?: number | null;
  unit?: string;
  allowChange?: boolean;
}

export interface AnnouncementAnswer {
  choices?: number[];
  number?: number;
}

/** The signed-in employee's own read marks and answer (employees only). */
export interface MyNoticeResponse {
  seenAt: string | null;
  readAt: string | null;
  answeredAt: string | null;
  answer: AnnouncementAnswer | null;
}

export interface Announcement {
  _id: string;
  title: string;
  content: string;
  type: "general" | "urgent" | "event" | "policy";
  date: string;
  author: string;
  pinned: boolean;
  createdAt: string;
  display?: { popup?: boolean; markAsRead?: boolean };
  question?: AnnouncementQuestion;
  closesAt?: string | null;
  /** `ids` is only sent to the admin panel. */
  audience?: { mode: AudienceMode; ids?: string[] };
  isOpen?: boolean;
  /** Admin panel: progress over the active employees it is for. */
  stats?: { audience: number; seen: number; read: number; answered: number };
  /** Employees: their own response, and whether the app should pop it up. */
  myResponse?: MyNoticeResponse | null;
  pending?: boolean;
}

/** The only fields the page sends. The server ignores anything else. */
export interface AnnouncementInput {
  title: string;
  content: string;
  type: Announcement["type"];
  pinned: boolean;
  display: { popup: boolean; markAsRead: boolean };
  question: AnnouncementQuestion;
  closesAt: string | null;
  audience: { mode: AudienceMode; ids: string[] };
}

export const hasQuestion = (a: Pick<Announcement, "question">) => !!a.question && a.question.kind !== "none";

export interface NoticeResults {
  announcement: Announcement;
  totals: { audience: number; seen: number; read: number; answered: number; notAnswered: number };
  options: { index: number; label: string; count: number; people: { employeeId: string; name: string }[] }[];
  number: { answered: number; total: number; average: number | null; min: number | null; max: number | null; unit: string } | null;
  people: {
    employeeId: string;
    name: string;
    phone: string;
    branch: string;
    department: string;
    inAudience: boolean;
    seenAt: string | null;
    readAt: string | null;
    answeredAt: string | null;
    answer: { choices: number[]; labels: string[]; number: number | null } | null;
  }[];
}

// Same limits as announcement_controller.js.
export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_CONTENT_MAX = 5000;

// A failed post used to fail silently: no mutation had an onError, so the
// dialog just stayed open. Now one toast, in words (never a raw 5xx text).
const toastError = (error: unknown, fallback: string) => {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
};

/**
 * The notices behind the header bell, newest first. A separate cache entry
 * from the Notice Board page (which sorts pinned first), but under the same
 * ["announcements"] prefix, so posting or deleting a notice refreshes both.
 *
 * Read quietly: on a plan without the notice board this answers
 * `unavailable` instead of raising the upgrade prompt from a page the admin
 * did not open.
 */
export function useNoticeFeed(enabled = true) {
  const { data, isLoading, error } = useQuery<Announcement[]>({
    queryKey: ["announcements", "feed"],
    queryFn: async () => {
      const { data } = await apiClient.get("/announcements", { quietUpgrade: true });
      const list: Announcement[] = Array.isArray(data) ? data : [];
      return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
    enabled,
    retry: retryUnlessUnavailable,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return {
    notices: data ?? [],
    isLoading,
    // 403: the plan has no notice board, or the super admin switched it off.
    unavailable: status === 403,
    failed: !!error && status !== 403,
  };
}

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

/** Admin panel: who read it, who answered what, who has not yet. */
export function useNoticeResults(id: string | null) {
  return useQuery<NoticeResults>({
    queryKey: ["announcements", "results", id],
    queryFn: async () => (await apiClient.get(`/announcements/${id}/results`)).data,
    enabled: !!id,
    retry: retryUnlessUnavailable,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Employees: mark read, answer, and mark seen. Every one refreshes the
 * ["announcements"] queries so the board, the bell and the popup agree.
 */
export function useNoticeActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const read = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/announcements/${id}/read`)).data,
    onSuccess: refresh,
    onError: (e) => toastError(e, "Could not mark it as read. Please try again."),
  });

  const respond = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: AnnouncementAnswer }) =>
      (await apiClient.post(`/announcements/${id}/respond`, answer)).data,
    onSuccess: () => {
      refresh();
      toast.success("Answer sent");
    },
    onError: (e) => {
      refresh();
      toastError(e, "Could not send your answer. Please try again.");
    },
  });

  // Silent: a failed "seen" only means the popup may show once more.
  const seen = useMutation({
    mutationFn: async (ids: string[]) => (await apiClient.post("/announcements/seen", { ids })).data,
    onSuccess: refresh,
  });

  return {
    markRead: read.mutateAsync,
    respond: respond.mutateAsync,
    markSeen: seen.mutate,
    isMarkingRead: read.isPending,
    isResponding: respond.isPending,
  };
}
