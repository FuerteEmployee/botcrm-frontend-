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
  deadline?: string | null;
  daysRemaining: number | null;
  bannerThresholdDays?: number;
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
    // This gates access and drives the renewal banner, so a tenant whose
    // plan/status was just changed by the super admin should see it reflected
    // within a minute of it happening — not only on their next window focus,
    // which could otherwise leave a stale banner/block on screen for up to
    // the old 5-minute staleTime.
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
