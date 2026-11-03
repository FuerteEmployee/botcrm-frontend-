import { AlertTriangle, Wallet } from "lucide-react";
import { useLeaveBalances, describeBalancePeriod } from "@/services/leave-service";
import { cn } from "@/lib/utils";

/** "half a day", "1 day", "7.5 days". */
function daysText(n: number) {
  if (n === 0.5) return "half a day";
  return `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * One employee's balance for one leave type, as the admin sees it while
 * deciding or applying on someone's behalf.
 *
 * Balances are advisory -- the server does not refuse a request that goes
 * over, and the admin decides -- which is exactly why the admin needs to see
 * them. The Leave Management page used to show none at all.
 *
 * `requestDays` is set when the request being looked at is itself still
 * waiting: its days are then already inside `pending`, so the note can say
 * whether approving THIS one exceeds the allowance, or only this one together
 * with the employee's other waiting requests.
 */
export function LeaveBalanceNote({
  employeeId,
  leaveTypeId,
  requestDays,
  className,
}: {
  employeeId?: string;
  leaveTypeId?: string;
  requestDays?: number;
  className?: string;
}) {
  const { balances, period, hasData, isLoading, isError } = useLeaveBalances(employeeId, {
    enabled: !!employeeId,
  });
  if (!employeeId || !leaveTypeId) return null;
  if (isLoading && !hasData) {
    return (
      <p className={cn("text-[12px] text-muted-foreground", className)}>Loading leave balance...</p>
    );
  }
  if (isError && !hasData) {
    return (
      <p className={cn("text-[12px] text-muted-foreground", className)}>
        Could not load the leave balance.
      </p>
    );
  }
  const b = balances.find((x) => x.leaveTypeId === leaveTypeId);
  if (!b) return null;

  const periodText = describeBalancePeriod(period);
  const round = (n: number) => Math.round(n * 100) / 100;
  const pendingRequest = typeof requestDays === "number";
  // Over on its own: approving just this request exceeds what is left.
  const leftIfApproved = pendingRequest ? round(b.total - b.used - (requestDays as number)) : 0;
  // Over only together with the other waiting requests.
  const leftIfAllApproved = round(b.total - b.used - b.pending);
  const overAlone = pendingRequest && leftIfApproved < 0;
  const overTogether = pendingRequest && !overAlone && leftIfAllApproved < 0;
  const over = overAlone || overTogether;

  return (
    <div
      data-leave-balance
      className={cn(
        "rounded-xl border p-3 text-[12px] leading-relaxed",
        over ? "border-warning/40 bg-warning/10" : "border-border/60 bg-muted/20",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 font-bold text-foreground">
        <Wallet className="h-3.5 w-3.5 text-primary" />
        {b.leaveName} balance{periodText ? ` (${periodText.short})` : ""}
      </div>
      <p className="mt-1 text-muted-foreground">
        {daysText(b.total)} allowed · {daysText(b.used)} taken · {daysText(b.pending)} waiting ·{" "}
        <span className="font-bold text-foreground">{daysText(b.remaining)} left</span>
      </p>
      {over && (
        <p className="mt-1.5 flex items-start gap-1.5 font-semibold text-warning-foreground">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {overAlone
            ? `Approving this goes ${daysText(-leftIfApproved)} over the allowance.`
            : `With the other waiting requests, this goes ${daysText(-leftIfAllApproved)} over the allowance.`}
        </p>
      )}
    </div>
  );
}
