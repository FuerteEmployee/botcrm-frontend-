import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { requestErrorMessage, retryUnlessUnavailable } from "./request-error";

export interface Asset {
  _id: string;
  employeeId: string;
  employeeName: string;
  deviceName: string;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber: string;
  amount: number;
  allocatedAt: string;
  status: "active" | "returned" | "damaged";
  /** YYYY-MM-DD the device came back; set by the server. */
  returnedAt?: string | null;
  unlockCredentials?: string;
  unlockType?: "password" | "pin" | "pattern";
  patternSize?: 3 | 4;
  createdAt?: string;
}

/** What the page may send: the server sets the names, dates and company. */
export type AssetInput = Partial<Pick<Asset,
  "employeeId" | "deviceType" | "brand" | "model" | "serialNumber" | "amount" | "allocatedAt" |
  "status" | "unlockCredentials" | "unlockType" | "patternSize">>;

// requestErrorMessage: the server's own sentence for a 4xx ("Serial number
// ... is already given to ..."), a plain fallback for a 5xx, silence for a
// 401 or plan-upgrade 403 that the app already announced.
function toastError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error, fallback);
  if (message) toast.error(message);
}

export function useAssetService(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading, isError, error, refetch, isFetching } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/assets");
      return Array.isArray(data) ? data : [];
    },
    retry: retryUnlessUnavailable,
  });

  const createMutation = useMutation({
    mutationFn: async (newAsset: AssetInput) => {
      const { data } = await apiClient.post("/assets", newAsset);
      return data as Asset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error: unknown) => toastError(error, "The device could not be saved. Please try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AssetInput }) => {
      const { data: response } = await apiClient.put(`/assets/${id}`, data);
      return response as Asset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      if (!options.silent) toast.success("Device record saved");
    },
    onError: (error: unknown) => toastError(error, "The device could not be updated. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Device record deleted");
    },
    onError: (error: unknown) => toastError(error, "The device record could not be deleted. Please try again."),
  });

  return {
    assets,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    createAsset: createMutation.mutateAsync,
    updateAsset: updateMutation.mutateAsync,
    deleteAsset: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
