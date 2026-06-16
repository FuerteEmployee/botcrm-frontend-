import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Phone, Users, CalendarClock, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import {
  useMySubscription,
  SUPPORT_PHONES,
  telHref,
  type SubscriptionStatus,
} from "@/services/subscription-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

const STATUS_META: Record<
  SubscriptionStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tone: string }
> = {
  active: { label: "Active", variant: "default", tone: "text-emerald-600" },
  trial: { label: "Trial", variant: "secondary", tone: "text-blue-600" },
  grace: { label: "Grace period", variant: "outline", tone: "text-amber-600" },
  paused: { label: "Paused", variant: "outline", tone: "text-amber-600" },
  expired: { label: "Expired", variant: "destructive", tone: "text-destructive" },
  cancelled: { label: "Cancelled", variant: "destructive", tone: "text-destructive" },
  none: { label: "No plan", variant: "outline", tone: "text-muted-foreground" },
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function BillingPage() {
  const { data: sub, isLoading } = useMySubscription();

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Plan & Billing" description="Your subscription, usage and renewal details." />
        <SkeletonLoader type="stats" />
      </div>
    );
  }

  if (!sub || sub.status === "none") {
    return (
      <div>
        <PageHeader title="Plan & Billing" description="Your subscription, usage and renewal details." />
        <Card className="p-8 text-center text-muted-foreground">
          No subscription is attached to this account. Contact support to set up a plan.
        </Card>
      </div>
    );
  }

  const meta = STATUS_META[sub.status] ?? STATUS_META.none;
  const isTrial = sub.status === "trial";
  const isBlocked = sub.status === "expired" || sub.status === "cancelled" || sub.status === "paused";
  const isGrace = sub.status === "grace";

  const deadlineLabel = isTrial ? "Trial ends" : isGrace ? "Grace ends" : "Renews on";
  const deadlineValue = isTrial
    ? sub.trialEndDate
    : isGrace
      ? sub.graceEndDate
      : sub.currentPeriodEnd;

  const seatsUsed = sub.employeesUsed ?? 0;
  const seatsMax = sub.maxEmployees;
  const seatPct = seatsMax ? Math.min(100, Math.round((seatsUsed / seatsMax) * 100)) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plan & Billing"
        description="Your subscription, usage and renewal details."
        actions={<Badge variant={meta.variant}>{meta.label}</Badge>}
      />

      {/* Status notice */}
      {(isBlocked || isGrace || (isTrial && (sub.daysRemaining ?? 0) <= 7)) && (
        <Card
          className={cn(
            "flex items-start gap-3 p-4",
            isBlocked
              ? "border-destructive/30 bg-destructive/5"
              : "border-amber-500/30 bg-amber-500/5",
          )}
        >
          {isBlocked ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {isBlocked
                ? sub.status === "paused"
                  ? "Your account is paused."
                  : "Your subscription is no longer active."
                : isGrace
                  ? "Your subscription has lapsed — renew to avoid losing access."
                  : `Your trial ends in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"}.`}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Call our team to subscribe or renew and keep your admin panel running without interruption.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {/* Plan */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Current plan</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{sub.planName || "—"}</p>
          <p className={cn("mt-1 text-sm font-medium capitalize", meta.tone)}>
            {meta.label}
            {sub.billingCycle ? ` · ${sub.billingCycle}` : ""}
          </p>
        </Card>

        {/* Renewal / deadline */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{deadlineLabel}</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{fmtDate(deadlineValue)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sub.daysRemaining != null && !isBlocked
              ? `${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"} remaining`
              : isBlocked
                ? "Access suspended"
                : "—"}
          </p>
        </Card>

        {/* Seats */}
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Employees</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {seatsUsed}
            <span className="text-base font-normal text-muted-foreground">
              {" "}/ {seatsMax ?? "∞"}
            </span>
          </p>
          {seatsMax ? (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", seatPct >= 100 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${seatPct}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Unlimited seats</p>
          )}
        </Card>
      </div>

      {/* Renew / subscribe */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">
                {isBlocked ? "Reactivate your subscription" : "Manage your subscription"}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Subscriptions are handled by our team. Call us to subscribe, renew, or change your plan.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {SUPPORT_PHONES.map((phone) => (
              <Button key={phone} asChild variant={isBlocked ? "default" : "outline"}>
                <a href={telHref(phone)}>
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
