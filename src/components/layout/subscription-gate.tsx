import { type ReactNode, useState, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Lock, Clock, Phone } from "lucide-react";
import { useMySubscription, SUPPORT_PHONES, telHref } from "@/services/subscription-service";
import { useAuth } from "@/hooks/use-auth";
import { clearSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Statuses that completely block access to the admin panel.
const BLOCKING = new Set(["expired", "cancelled", "paused"]);

// Blocked tenants may still open these pages (e.g. to review their plan / renew).
const ALLOWED_WHEN_BLOCKED = ["/billing"];

function blockedCopy(status: string, planName: string | null) {
  switch (status) {
    case "paused":
      return {
        title: "Your account is paused",
        message:
          "Access to the admin panel has been temporarily paused. Please contact support to reactivate your account.",
      };
    case "cancelled":
      return {
        title: "Your subscription was cancelled",
        message:
          "Your subscription is no longer active, so the admin panel can't be opened. Subscribe again to continue using BOT.",
      };
    case "expired":
    default:
      return {
        title: "Your free trial has expired",
        message: planName
          ? `Your ${planName} trial has ended. Subscribe to continue using the admin panel without interruption.`
          : "Your free trial has ended. Subscribe to continue using the admin panel without interruption.",
      };
  }
}

/**
 * Wraps the admin panel content and enforces the tenant's subscription state:
 *  - active / none  → renders children untouched
 *  - trial / grace  → renders children with a warning banner about days remaining
 *  - expired / cancelled / paused → blocks access with a full-bleed notice
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: sub, isLoading } = useMySubscription();

  const isTenant = session?.role === "admin" || session?.role === "subadmin";

  // Don't gate non-tenant roles, and don't flash a blocker before data loads.
  if (!isTenant || isLoading || !sub) return <>{children}</>;

  const { status, planName, daysRemaining } = sub;

  // ── Hard block ────────────────────────────────────────────────────────────
  const onAllowedPage = ALLOWED_WHEN_BLOCKED.some((p) => pathname.startsWith(p));
  if (BLOCKING.has(status) && !onAllowedPage) {
    const { title, message } = blockedCopy(status, planName);
    const ctaLabel =
      status === "paused" ? "Call support to reactivate" : "Call to subscribe";

    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>

          <div className="mt-6 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ctaLabel}
            </p>
            {SUPPORT_PHONES.map((phone) => (
              <Button key={phone} asChild className="w-full">
                <a href={telHref(phone)}>
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              </Button>
            ))}
            <Button
              variant="outline"
              className="mt-1 w-full"
              onClick={() => navigate({ to: "/billing" })}
            >
              View plan &amp; billing
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                clearSession();
                navigate({ to: "/login" });
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Soft warning (trial / active renewal / grace) ───────────────────────────
  const isGrace = status === "grace";
  const isActive = status === "active";
  const isTrial = status === "trial";
  const days = daysRemaining ?? 0;
  // Super-admin-configured per-tenant threshold: the trial/renewal banner stays
  // hidden until the tenant is within this many days of the deadline. Grace
  // (already lapsed) always shows regardless of the threshold.
  const threshold = sub.bannerThresholdDays ?? 7;
  const showBanner = isGrace || ((isTrial || isActive) && days <= threshold);
  if (!showBanner) return <>{children}</>;

  const urgent = isGrace || days <= 1;
  const deadline = sub.deadline ?? sub.trialEndDate ?? sub.currentPeriodEnd ?? null;

  let prefix: string;
  let suffix: string;
  if (isGrace) {
    prefix = "Your subscription has lapsed — ";
    suffix = " left to renew before access is suspended.";
  } else if (isActive) {
    prefix = "Your subscription expires in ";
    suffix = ". Renew to continue without interruption.";
  } else {
    prefix = "Your free trial ends in ";
    suffix = ". Subscribe anytime to continue without interruption.";
  }

  return (
    <div>
      <SubscriptionBanner urgent={urgent} prefix={prefix} suffix={suffix} deadline={deadline} />
      {children}
    </div>
  );
}

// Live "Xd HH:MM:SS" countdown that re-renders once per second. Kept as its own
// component so the per-second re-render is isolated to the countdown text.
function Countdown({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!deadline) return <span className="font-semibold">soon</span>;

  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  const label = d > 0 ? `${d} ${d === 1 ? "day" : "days"} ${clock}` : clock;

  return <span className="font-semibold tabular-nums">{label}</span>;
}

function SubscriptionBanner({
  urgent,
  prefix,
  suffix,
  deadline,
}: {
  urgent: boolean;
  prefix: string;
  suffix: string;
  deadline: string | null;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        urgent
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      <div className="flex items-center gap-2.5">
        {urgent ? (
          <AlertTriangle className="h-5 w-5 shrink-0" />
        ) : (
          <Clock className="h-5 w-5 shrink-0" />
        )}
        <p className="text-sm font-medium">
          {prefix}
          <Countdown deadline={deadline} />
          {suffix}
        </p>
      </div>
      <Button
        asChild
        size="sm"
        variant={urgent ? "destructive" : "default"}
        className="shrink-0 self-start sm:self-auto"
      >
        <a href={telHref(SUPPORT_PHONES[0])}>
          <Phone className="h-4 w-4" />
          Call to subscribe
        </a>
      </Button>
    </div>
  );
}
