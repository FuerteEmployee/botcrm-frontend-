import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

// One toast per failed action, in words: the server's own 4xx message
// ("The end date cannot be before the start date."), never a raw 5xx text.
const toastError = (error: unknown, fallback: string) => {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
};

export interface Festival {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: "mandatory" | "optional" | "event";
  description: string;
  posterUrl?: string;
}

export function useFestivalService() {
  const queryClient = useQueryClient();

  const { data: festivals = [], isLoading, isFetching, isError, error, refetch } = useQuery<Festival[]>({
    queryKey: ["festivals"],
    queryFn: async () => {
      const { data } = await apiClient.get("/festivals");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessUnavailable,
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await apiClient.post("/festivals", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Holiday added");
    },
    onError: (error: unknown) => {
      toastError(error, "Could not add the holiday. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const { data } = await apiClient.put(`/festivals/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Holiday saved");
    },
    onError: (error: unknown) => {
      toastError(error, "Could not save the holiday. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete(`/festivals/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["festivals"] });
      toast.success("Holiday deleted");
    },
    onError: (error: unknown) => {
      toastError(error, "Could not delete the holiday. Please try again.");
    },
  });

  return {
    festivals,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    createFestival: createMutation.mutateAsync,
    updateFestival: updateMutation.mutateAsync,
    deleteFestival: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Same limits as festival_controller.js, so the form refuses what the server would.
export const FESTIVAL_NAME_MAX = 100;
export const FESTIVAL_DESCRIPTION_MAX = 500;
export const FESTIVAL_MAX_SPAN_DAYS = 31;
export const FESTIVAL_POSTER_MAX_BYTES = 5 * 1024 * 1024;
export const FESTIVAL_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A festival's "YYYY-MM-DD" as a local calendar day. `new Date("2026-10-02")`
 * is UTC midnight -- a different instant from the local midnight it is
 * compared against, and the previous day anywhere west of UTC.
 */
export function parseFestivalDay(value: string): Date {
  const [y, m, d] = (value || "").slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Today as "YYYY-MM-DD" in India (IST), string-comparable with festival dates, whatever the device's timezone. */
export function todayFestivalKey(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Days in an inclusive range of two "YYYY-MM-DD" keys (1 for a one-day holiday). */
export function festivalSpanDays(startKey: string, endKey: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(endKey) - toUtc(startKey)) / 86400000) + 1;
}

/** "2 Oct 2026" (Indian order), or "2 Oct" without the year. */
export function formatFestivalDay(key: string, withYear = true): string {
  return parseFestivalDay(key).toLocaleDateString("en-IN", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}

/** "2 Oct 2026" or "30 Nov – 2 Dec 2026" (year on both ends when it differs). */
export function formatFestivalRange(startKey: string, endKey: string): string {
  const end = endKey || startKey;
  if (end === startKey) return formatFestivalDay(startKey);
  const sameYear = startKey.slice(0, 4) === end.slice(0, 4);
  return `${formatFestivalDay(startKey, !sameYear)} – ${formatFestivalDay(end)}`;
}
