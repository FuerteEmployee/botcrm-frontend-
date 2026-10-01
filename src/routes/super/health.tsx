import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, RotateCcw } from "lucide-react";
import {
  getHealthFindings,
  runHealthCheckNow,
  updateHealthFinding,
  type HealthFinding,
  type HealthSeverity,
} from "@/services/superadmin-service";
import { requestErrorMessage } from "@/services/request-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/shared/pagination";

export const Route = createFileRoute("/super/health")({
  component: HealthPage,
});

// Plain names for the kinds the backend reports (jobs/health_check.js).
const KIND_LABEL: Record<string, string> = {
  suspect_auto_punchout: "Wrong auto punch-out?",
  tracker_silent_on_duty: "Tracker silent on duty",
  duplicate_day: "Duplicate days",
  open_day_past: "Never punched out",
  needs_review_day: "Days to grade",
  bad_day_shape: "Impossible days",
  tracking_gaps: "Tracking gaps",
  tracker_failures: "Tracker failures",
  repeated_app_error: "Repeated app errors",
  gps_jumps: "GPS jumps",
  stale_device_report: "Old device report",
  tracking_blockers: "Settings blocking tracking",
  old_apk: "Old app version",
  stale_corrections: "Corrections waiting",
};

const SEVERITY_META: Record<HealthSeverity, { label: string; tile: string; pill: string }> = {
  high: {
    label: "Urgent",
    tile: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
    pill: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  },
  medium: {
    label: "Needs a look",
    tile: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  },
  low: {
    label: "For information",
    tile: "border-border bg-card text-foreground",
    pill: "bg-muted text-muted-foreground",
  },
};

const PAGE_SIZE = 25;

const fmtWhen = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/**
 * Super admin → Health. What the hourly health check found in real data: the
 * patterns behind the bugs real phones hit on staging (a wrong auto punch-out
 * at a desk, a tracker silent while punched in, duplicate days). Findings are
 * pointers for a person; nothing here changes attendance or pay.
 *
 * The chip counts come from the server under the same filter as the list, so a
 * chip's number is always the rows it shows.
 */
function HealthPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [severity, setSeverity] = useState<HealthSeverity | "">("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<HealthFinding | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "health", status, severity, kind, page],
    queryFn: () => getHealthFindings({ status, severity, kind, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin", "health"] });

  const runMutation = useMutation({
    mutationFn: runHealthCheckNow,
    onSuccess: (r) => {
      toast.success(`Check finished: ${r.summary.found} problem(s) found, ${r.summary.autoResolved} cleared by themselves.`);
      invalidate();
    },
    onError: (err) => {
      const msg = requestErrorMessage(err, "The check could not finish. Try again.");
      if (msg) toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, next, text }: { id: string; next: "open" | "resolved"; text?: string }) =>
      updateHealthFinding(id, next, text),
    onSuccess: (row) => {
      toast.success(row.status === "resolved" ? "Marked resolved" : "Opened again");
      setResolving(null);
      setNote("");
      invalidate();
    },
    onError: (err) => {
      const msg = requestErrorMessage(err, "Could not update this finding. Try again.");
      if (msg) toast.error(msg);
    },
  });

  const findings = data?.findings ?? [];
  const bySeverity = data?.counts.bySeverity ?? {};
  const byKind = data?.counts.byKind ?? {};
  const kindsShown = Object.keys(byKind).sort((a, b) => (byKind[b] ?? 0) - (byKind[a] ?? 0));
  const kindTotal = Object.values(byKind).reduce((a, b) => a + b, 0);

  const pickSeverity = (s: HealthSeverity) => { setSeverity((cur) => (cur === s ? "" : s)); setPage(1); };
  const pickKind = (k: string) => { setKind(k); setPage(1); };

  return (
    <div className="min-h-screen">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Health check</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Problems found in real data, checked every hour
            {data?.lastRunAt ? ` · last updated ${fmtWhen(data.lastRunAt)}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
          {runMutation.isPending ? "Checking…" : "Check now"}
        </Button>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {/* Severity tiles double as a filter; tap again to clear. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {(["high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSeverity(s)}
              aria-pressed={severity === s}
              className={`min-h-[72px] rounded-xl border px-3 py-2.5 text-left transition-shadow ${SEVERITY_META[s].tile} ${
                severity === s ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="text-2xl font-bold leading-none">{bySeverity[s] ?? 0}</div>
              <div className="mt-1 text-[12px] font-medium">{SEVERITY_META[s].label}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["open", "resolved"] as const).map((s) => (
            <Button
              key={s}
              variant={status === s ? "default" : "outline"}
              className="h-10"
              onClick={() => { setStatus(s); setPage(1); }}
            >
              {s === "open" ? "Open" : "Resolved"}
            </Button>
          ))}
        </div>

        {kindsShown.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of problem">
            <Chip active={kind === ""} onClick={() => pickKind("")} label="All" count={kindTotal} />
            {kindsShown.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => pickKind(k)} label={KIND_LABEL[k] || k} count={byKind[k] ?? 0} />
            ))}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : isError ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center">
            <p className="text-sm font-medium">Could not load the health check.</p>
            <Button variant="outline" className="mt-3 h-10" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Trying…" : "Try again"}
            </Button>
          </div>
        ) : findings.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {status === "open" ? "Nothing to look at. The last check found no open problems." : "No resolved findings yet."}
          </div>
        ) : (
          <>
            <ul className="space-y-2.5">
              {findings.map((f) => (
                <li key={f._id} className="rounded-xl border bg-card px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_META[f.severity].pill}`}>
                      {SEVERITY_META[f.severity].label}
                    </span>
                    <span className="text-[12px] font-medium text-muted-foreground">{KIND_LABEL[f.kind] || f.kind}</span>
                    {f.companyName && <span className="text-[12px] text-muted-foreground">· {f.companyName}</span>}
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold leading-snug">{f.title}</p>
                  {f.detail && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.detail}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-muted-foreground">
                      {f.employeeName ? `${f.employeeName}${f.employeePhone ? ` (${f.employeePhone})` : ""} · ` : ""}
                      first seen {fmtWhen(f.firstSeenAt)} · last seen {fmtWhen(f.lastSeenAt)}
                      {f.occurrences > 1 ? ` · seen in ${f.occurrences} checks` : ""}
                    </p>
                    {f.status === "open" ? (
                      <Button variant="outline" className="h-10 gap-1.5" onClick={() => { setResolving(f); setNote(""); }}>
                        <CheckCircle2 className="h-4 w-4" /> Mark resolved
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="h-10 gap-1.5"
                        onClick={() => updateMutation.mutate({ id: f._id, next: "open" })}
                        disabled={updateMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4" /> Open again
                      </Button>
                    )}
                  </div>
                  {f.status === "resolved" && (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Resolved {fmtWhen(f.resolvedAt)}
                      {f.resolvedBy === "auto" ? " automatically" : ""}
                      {f.note ? `: ${f.note}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              page={data?.currentPage ?? 1}
              totalPages={data?.totalPages ?? 1}
              onPageChange={setPage}
              totalRecords={data?.total ?? 0}
            />
          </>
        )}
      </div>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Mark this resolved?</DialogTitle>
            <DialogDescription className="text-[13px]">{resolving?.title}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="What was done (optional), e.g. corrected the punch-out, phone settings changed"
            className="min-h-[90px] text-[13px]"
          />
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setResolving(null)}>Cancel</Button>
            <Button
              className="h-10"
              disabled={updateMutation.isPending}
              onClick={() => resolving && updateMutation.mutate({ id: resolving._id, next: "resolved", text: note.trim() || undefined })}
            >
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
      }`}
    >
      {label}
      <span className={`text-[12px] ${active ? "opacity-90" : "text-muted-foreground"}`}>{count}</span>
    </button>
  );
}
