import { useState } from "react";
import { ShieldAlert, ShieldCheck, CheckCircle2, XCircle, ChevronDown, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { requestErrorMessage } from "@/services/request-error";
import {
  useShadowReport,
  useGeofenceAudit,
  useGeofenceMode,
  REASON_LABEL,
  DECISION_LABEL,
  CRITERION_LABEL,
} from "@/services/geofence-service";

/** 12-hour IST clock time, whatever timezone the admin's computer is set to. */
const istTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    : "";

const metres = (m?: number | null) => (m == null ? null : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * What the automatic punch-out does for this company, whether it has earned
 * the right to act, and what it decided for the employee on the map.
 *
 * Read-mostly on purpose. The only switches are "back to test mode" (the safe
 * direction, always allowed) and "turn on" once every check has passed. There
 * is no way to force it on from here: that stays a deliberate API call.
 */
export function AutoPunchOutPanel({
  employeeId,
  employeeName,
  date,
  dateLabel,
}: {
  employeeId?: string;
  employeeName?: string;
  /** IST calendar day, YYYY-MM-DD. */
  date: string;
  /** How that day is written on the page ("today", "Sat, 26 Sep"). */
  dateLabel?: string;
}) {
  const { can } = usePermission();
  const canView = can("attendance", "view");
  const canEdit = can("attendance", "edit");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "arm" | "disarm">(null);
  const { report, isLoading, isError, error } = useShadowReport(30, canView);
  const audit = useGeofenceAudit({ employeeId, date, limit: 50 }, canView && open && !!employeeId);
  const { setMode } = useGeofenceMode();

  if (!canView) return null;

  const enforcing = report?.mode === "enforcing";
  const criteria = report ? Object.entries(report.criteria) : [];

  return (
    <Card className="border border-border/60 bg-card rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[56px] flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span
          className={cn(
            "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
            enforcing ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700",
          )}
        >
          {enforcing ? <ShieldAlert className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold">Automatic punch-out</span>
          <span className="block text-[12px] text-muted-foreground">
            {isLoading
              ? "Loading…"
              : isError
                ? "Could not load its status."
                : enforcing
                  ? "ON: punches people out when their phone shows they have left the branch."
                  : "Test mode: it only writes down what it would have done. Nobody's attendance is changed."}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 py-4 space-y-5">
          {isError && (
            <p className="text-[12px] text-destructive">
              {requestErrorMessage(error, "Could not load the automatic punch-out status. Try again.") ||
                "Could not load the automatic punch-out status."}
            </p>
          )}

          {report && (
            <>
              <div className="space-y-2">
                <p className="text-[13px] font-semibold">
                  Checks before it may act (last {report.windowDays} days)
                </p>
                <ul className="space-y-1.5">
                  {criteria.map(([key, c]) => (
                    <li key={key} className="flex items-start gap-2 text-[12px]">
                      {c.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-px" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-muted-foreground mt-px" />
                      )}
                      <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>
                        {(CRITERION_LABEL[key] || ((x) => `${key}: ${x.value} of ${x.required}`))(c)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-muted-foreground">
                  {report.totals.decisions} decisions in this period: {report.totals.wouldHaveClosed}{" "}
                  {enforcing ? "punch-outs" : "would have punched out"}, {report.totals.inside} inside the branch,{" "}
                  {report.totals.abstained + report.totals.suppressed} where it did nothing.
                </p>
                {enforcing && !report.readyToArm && (
                  <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    It is ON although not every check has passed. Consider switching back to test mode until they do.
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-3">
                  {enforcing ? (
                    <Button variant="outline" className="h-10 rounded-xl font-semibold" onClick={() => setConfirm("disarm")} disabled={setMode.isPending}>
                      <FlaskConical className="h-4 w-4 mr-2" /> Switch to test mode
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="h-10 rounded-xl font-semibold"
                        onClick={() => setConfirm("arm")}
                        disabled={!report.readyToArm || setMode.isPending}
                      >
                        <ShieldCheck className="h-4 w-4 mr-2" /> Turn on
                      </Button>
                      {!report.readyToArm && (
                        <span className="text-[12px] text-muted-foreground">Can be turned on once every check above is met.</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <p className="text-[13px] font-semibold">
              {employeeName ? `What it decided for ${employeeName} ${dateLabel ? dateLabel : `on ${date}`}` : "Decisions for one person"}
            </p>
            {!employeeId ? (
              <p className="text-[12px] text-muted-foreground">Choose an employee in the list to see each decision for the day shown.</p>
            ) : audit.isLoading ? (
              <p className="text-[12px] text-muted-foreground">Loading…</p>
            ) : audit.isError ? (
              <p className="text-[12px] text-destructive">
                {requestErrorMessage(audit.error, "Could not load the decisions. Try again.") || "Could not load the decisions."}
              </p>
            ) : audit.rows.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nothing recorded for this day. It only runs while someone is punched in with tracking on.</p>
            ) : (
              <ul className="divide-y divide-border/40 rounded-lg border border-border/50 max-h-72 overflow-y-auto">
                {audit.rows.map((r) => (
                  <li key={r._id} className="px-3 py-2 text-[12px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="tabular-nums font-semibold w-[68px] shrink-0">{istTime(r.createdAt)}</span>
                    <span className={cn("font-semibold", r.decision === "punched_out" ? "text-red-600" : "text-foreground")}>
                      {DECISION_LABEL[r.decision] || r.decision}
                    </span>
                    <span className="text-muted-foreground">{REASON_LABEL[r.reason] || r.reason}</span>
                    {r.distanceM != null && (
                      <span className="text-muted-foreground">
                        · {metres(r.distanceM)} from {r.branchId?.branchName || "the branch"}
                        {r.thresholdM != null ? ` (limit ${metres(r.thresholdM)})` : ""}
                      </span>
                    )}
                    {r.shadow && r.decision === "punched_out" && <span className="text-amber-700">· test only, nothing changed</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "arm" ? "Turn on automatic punch-out?" : "Switch to test mode?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "arm"
                ? "From now on, when an employee's phone shows they have left their branch, their day is closed for them. This changes attendance and pay. You can switch back to test mode at any time."
                : "Automatic punch-out will stop closing anyone's day. It keeps recording what it would have done, so you can check it later. Days it already closed stay as they are."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={setMode.isPending}
              onClick={(e) => {
                e.preventDefault();
                const body = confirm === "arm" ? { enabled: true, shadowMode: false } : { enabled: true, shadowMode: true };
                setMode.mutate(body, { onSettled: () => setConfirm(null) });
              }}
            >
              {confirm === "arm" ? "Turn on" : "Switch to test mode"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
