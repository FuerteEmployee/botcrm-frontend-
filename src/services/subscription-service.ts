import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Subscriptions are provisioned by the platform team, so renew/subscribe actions
// reach out to support rather than a self-serve checkout page.
export const SUPPORT_PHONES = ["+91 97240 00697", "+91 79904 86477"];

export function telHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export type SubscriptionStatus =
  | "active"
  | "trial"
  | "grace"
  | "paused"
  | "expired"
  | "cancelled"
  | "none";

export interface MySubscription {
  status: SubscriptionStatus;
  rawStatus?: SubscriptionStatus;
  planName: string | null;
  planSlug: string | null;
  billingCycle?: "monthly" | "annual";
  trialEndDate?: string | null;
  currentPeriodEnd?: string | null;
  graceEndDate?: string | null;
  daysRemaining: number | null;
  employeesUsed?: number;
  maxEmployees?: number | null;
}

export function useMySubscription() {
  return useQuery<MySubscription>({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/subscription");
      return data;
    },
    // Keep it reasonably fresh, but don't hammer the API.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
