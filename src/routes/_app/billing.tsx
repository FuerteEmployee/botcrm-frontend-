import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Phone, Users, CalendarClock, CheckCircle2, AlertTriangle, Clock, Receipt } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import {
  useMySubscription,
  useMyInvoices,
  SUPPORT_PHONES,
  telHref,
  type MySubscription,
  type MyInvoice,
  type SubscriptionStatus,
} from "@/services/subscription-service";
import { useAuth } from "@/hooks/use-auth";
import { NoAccessNotice, PanelLoadError } from "@/components/settings/panel-notices";
import { requestErrorMessage } from "@/services/request-error";
import { formatINRFull } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

const STATUS_META: Record<
  SubscriptionStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; tone: string }
> = {
  active: { label: "Active", variant: "default", tone: "text-emerald-600" },
  trial: { label: "Free trial", variant: "secondary", tone: "text-blue-600" },
  grace: { label: "Overdue", variant: "outline", tone: "text-amber-600" },
  paused: { label: "Paused", variant: "outline", tone: "text-amber-600" },
  expired: { label: "Ended", variant: "destructive", tone: "text-destructive" },
  cancelled: { label: "Cancelled", variant: "destructive", tone: "text-destructive" },
  none: { label: "No plan", variant: "outline", tone: "text-muted-foreground" },
};

const INVOICE_STATUS: Record<MyInvoice["status"], { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  pending: { label: "Due", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  failed: { label: "Payment failed", cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
  refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground" },
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function daysText(days: number) {
  if (days <= 0) return "Ends today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/** Headline and follow-up line for the notice at the top, in plain words. */
function noticeCopy(sub: MySubscription): { title: string; body: string; blocked: boolean } | null {
  const trialEnded = sub.status === "expired" && sub.rawStatus === "trial";
  switch (sub.status) {
    case "expired":
      return {
        blocked: true,
        title: trialEnded ? "Your free trial has ended." : "Your plan has ended.",
        body: "Your staff cannot use the app and this panel is locked until you renew. Your data is kept safe. Call us to renew.",
      };
    case "cancelled":
      return {
        blocked: true,
        title: "Your plan was cancelled.",
        body: "Your staff cannot use the app and this panel is locked. Your data is kept safe. Call us to start again.",
      };
    case "paused":
      return {
        blocked: true,
        title: "Your account is paused.",
        body: "Your staff cannot use the app and this panel is locked until it is switched back on. Call us to restart it.",
      };
    case "grace":
      return {
        blocked: false,
        title: "Your payment is overdue.",
        body: `Everything still works for now${sub.graceEndDate ? `, until ${fmtDate(sub.graceEndDate)}` : ""}. Call us to renew before access stops.`,
      };
    case "trial":
      if ((sub.daysRemaining ?? 0) > 7) return null;
      return {
        blocked: false,
        title: (sub.daysRemaining ?? 0) <= 0
          ? "Your free trial ends today."
          : `Your free trial ends in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"}.`,
        body: "Call us to choose a plan so your staff can keep using the app without a break.",
      };
    default:
      return null;
  }
}

/** Which date the middle card shows, and what it is called. */
function deadlineCard(sub: MySubscription) {
  const trialEnded = sub.status === "expired" && sub.rawStatus === "trial";
  switch (sub.status) {
    case "trial":
      return { label: "Trial ends", date: sub.trialEndDate, sub: sub.daysRemaining != null ? daysText(sub.daysRemaining) : "—" };
    case "grace":
      return { label: "Pay by", date: sub.graceEndDate || sub.currentPeriodEnd, sub: sub.daysRemaining != null ? daysText(sub.daysRemaining) : "—" };
    case "active":
      return { label: "Paid until", date: sub.currentPeriodEnd, sub: sub.daysRemaining != null ? daysText(sub.daysRemaining) : "—" };
    case "expired":
      return { label: "Ended on", date: trialEnded ? sub.trialEndDate : sub.currentPeriodEnd, sub: "Access is locked" };
    case "cancelled":
      return { label: "Paid until", date: sub.currentPeriodEnd, sub: "Access is locked" };
    case "paused":
      return { label: "Paid until", date: sub.currentPeriodEnd, sub: "Access is locked" };
    default:
      return { label: "Paid until", date: null, sub: "—" };
  }
}

function CallButtons({ primary }: { primary: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {SUPPORT_PHONES.map((phone) => (
        <Button key={phone} asChild variant={primary ? "default" : "outline"} className="h-10">
          <a href={telHref(phone)}>
            <Phone className="h-4 w-4" />
            {phone}
          </a>
        </Button>
      ))}
    </div>
  );
}

function BillingPage() {
  const { session } = useAuth();
  const isOwner = session?.role === "admin";
  const { data: sub, isLoading, isError, error, refetch, isFetching } = useMySubscription();
  const invoicesQuery = useMyInvoices(isOwner && !!sub && sub.status !== "none");

  const header = <PageHeader title="Plan & Billing" description="Your plan, how many staff it covers, and when it is paid until." />;

  // Owner-only, like the sidebar entry. A sub-admin who types the address is
  // told so, rather than shown half a page.
  if (session && !isOwner) {
    return (
      <div>
        {header}
        <NoAccessNotice
          title="Only the account owner can see Plan & Billing"
          message="Ask your company admin if you need to know about the plan or a payment."
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        {header}
        <SkeletonLoader type="stats" />
      </div>
    );
  }

  if (isError || !sub) {
    return (
      <div>
        {header}
        <PanelLoadError
          what="your plan"
          message={requestErrorMessage(error, "Something went wrong on our side. Please try again in a minute.")}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </div>
    );
  }

  if (sub.status === "none") {
    return (
      <div className="space-y-5">
        {header}
        <Card className="p-6 sm:p-8">
          <p className="text-base font-semibold text-foreground">No plan is set up for this account yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Call us and we will set one up for you.</p>
          <div className="mt-4">
            <CallButtons primary />
          </div>
        </Card>
      </div>
    );
  }

  const meta = STATUS_META[sub.status] ?? STATUS_META.none;
  const notice = noticeCopy(sub);
  const isBlocked = notice?.blocked === true;
  const deadline = deadlineCard(sub);

  const seatsUsed = sub.employeesUsed ?? 0;
  const seatsMax = sub.maxEmployees ?? null;
  const seatPct = seatsMax ? Math.min(100, Math.round((seatsUsed / seatsMax) * 100)) : 0;
  const atCap = seatsMax != null && seatsUsed >= seatsMax;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plan & Billing"
        description="Your plan, how many staff it covers, and when it is paid until."
        actions={<Badge variant={meta.variant}>{meta.label}</Badge>}
      />

      {notice && (
        <Card
          role={isBlocked ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 p-4",
            isBlocked ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5",
          )}
        >
          {isBlocked ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">{notice.title}</p>
            <p className="mt-0.5 text-muted-foreground">{notice.body}</p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Current plan</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{sub.planName || "—"}</p>
          <p className={cn("mt-1 text-sm font-medium", meta.tone)}>
            {meta.label}
            {sub.billingCycle ? ` · ${sub.billingCycle === "annual" ? "Yearly" : "Monthly"}` : ""}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{deadline.label}</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">{fmtDate(deadline.date)}</p>
          <p className={cn("mt-1 text-sm", isBlocked ? "text-destructive font-medium" : "text-muted-foreground")}>{deadline.sub}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Employees</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {seatsMax != null ? (
              <>
                {seatsUsed}
                <span className="text-base font-normal text-muted-foreground"> of {seatsMax} used</span>
              </>
            ) : (
              <>
                {seatsUsed}
                <span className="text-base font-normal text-muted-foreground"> employee{seatsUsed === 1 ? "" : "s"}</span>
              </>
            )}
          </p>
          {seatsMax != null ? (
            <>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={seatsMax}
                aria-valuenow={seatsUsed}
                aria-label="Employees used on your plan"
              >
                <div
                  className={cn("h-full rounded-full", atCap ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
              <p className={cn("mt-1.5 text-sm", atCap ? "text-destructive font-medium" : "text-muted-foreground")}>
                {atCap
                  ? "Your plan is full. Call us to add more employees."
                  : `${seatsMax - seatsUsed} more can be added. Inactive employees count too.`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No limit on your plan</p>
          )}
        </Card>
      </div>

      <InvoicesCard query={invoicesQuery} />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">
                {isBlocked ? "Switch your account back on" : "Renew or change your plan"}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Plans are set up by our team. Call us to renew, add more employees or change your plan.
              </p>
            </div>
          </div>
          <CallButtons primary={isBlocked} />
        </div>
      </Card>
    </div>
  );
}

function InvoicesCard({ query }: { query: ReturnType<typeof useMyInvoices> }) {
  const { data: invoices, isLoading, isError, error, refetch, isFetching } = query;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Receipt className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Invoices</span>
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading invoices...</p>
      ) : isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">
            {requestErrorMessage(error, "Could not load invoices. Please try again.")}
          </p>
          <Button variant="outline" className="h-10" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No invoices yet. When we bill you, each invoice will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {invoices.map((inv) => {
            const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.pending;
            return (
              <li key={inv._id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {inv.period || fmtDate(inv.createdAt)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{inv.invoiceNumber}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === "paid" && inv.paidAt
                      ? `Paid on ${fmtDate(inv.paidAt)}`
                      : inv.dueDate
                        ? `Due by ${fmtDate(inv.dueDate)}`
                        : `Issued ${fmtDate(inv.createdAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {inv.currency && inv.currency !== "INR" ? `${inv.currency} ${inv.amount.toLocaleString("en-IN")}` : formatINRFull(inv.amount)}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
