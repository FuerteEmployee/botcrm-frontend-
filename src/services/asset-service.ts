import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
  unlockCredentials?: string;
  unlockType?: "password" | "pin" | "pattern";
}

export function useAssetService() {
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/assets");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newAsset: Omit<Asset, "_id">) => {
      const { data } = await apiClient.post("/assets", newAsset);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Device allocated successfully");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Asset> }) => {
      const { data: response } = await apiClient.put(`/assets/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Allocation updated successfully");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Allocation removed successfully");
    },
  });

  return {
    assets,
    isLoading,
    createAsset: createMutation.mutateAsync,
    updateAsset: updateMutation.mutateAsync,
    deleteAsset: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
