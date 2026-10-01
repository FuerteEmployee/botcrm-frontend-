import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useAdvanceSalaryService,
  advanceSalaryErrorMessage,
  type AdvanceSalaryRequest,
} from "@/services/advance-salary-service";
import { formatINR, formatINRFull } from "@/lib/format";
import { isNativeApp } from "@/lib/geolocation";
import { NewRequestModal } from "./NewRequestModal";

type Status = AdvanceSalaryRequest["status"];
type Filter = "all" | Status;

/**
 * One plain word, one colour and one icon per status, used everywhere a status
 * appears. The badges used to be purple for "Pending" and purple again for
 * "Approved" (a getStatusColor helper existed but was never called), so the
 * colour said nothing, and "Rejected"/"Repaid" are harder words than they
 * need to be for someone who does not read English well.
 */
const STATUS: Record<
  Status,
  { label: string; icon: LucideIcon; pill: string; tile: string; bar: string }
> = {
  pending: {
    label: "Waiting",
    icon: Clock,
    pill: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
    tile: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    bar: "bg-amber-400",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    pill: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
    tile: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    bar: "bg-emerald-500",
  },
  rejected: {
    label: "Not approved",
    icon: XCircle,
    pill: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
    tile: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
    bar: "bg-rose-500",
  },
  repaid: {
    label: "Paid back",
    icon: RotateCcw,
    pill: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300",
    tile: "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",
    bar: "bg-sky-500",
  },
};
const STATUS_ORDER: Status[] = ["pending", "approved", "rejected", "repaid"];

// A status this build does not know (the backend gaining e.g. "cancelled")
// gets a neutral grey look under its own name, never another status's colour.
function statusMeta(status: string) {
  return (
    STATUS[status as Status] ?? {
      label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown",
      icon: Clock,
      pill: "bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300",
      tile: "",
      bar: "bg-slate-400",
    }
  );
}

const TYPE_LABEL: Record<AdvanceSalaryRequest["type"], string> = {
  "advance-salary": "Advance Salary",
  loan: "Loan",
};

// Dates are shown in IST whatever the phone's own timezone says: the payroll
// month an advance was recovered in is an IST calendar month, and deductedInMonth
// is stored as midnight on the 1st in the server's zone, which in UTC reads as
// the last day of the previous month.
const IST = "Asia/Kolkata";
function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: IST,
      });
}
function formatMonth(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: IST });
}

/**
 * The money actually granted. A partial approval makes it less than what was
 * asked, and payroll recovers this figure — showing `amount` on an approved row
 * told the employee they were getting money they were not.
 */
function grantedAmount(r: AdvanceSalaryRequest): number {
  return r.status === "approved" || r.status === "repaid"
    ? (r.approvedAmount ?? r.amount)
    : r.amount;
}

/**
 * Tile totals are compact (₹950, ₹1.5k, ₹2.5L, ₹10Cr) so a half-width tile
 * never wraps at 360px. Past ₹10,000 Cr a total can only come from junk saved
 * before the ₹1 crore cap existed (a ₹1e26 request is in the database), so it
 * reads "₹10000Cr+" rather than a twenty-digit number.
 */
const TILE_MAX = 1e11;
function tileAmount(n: number): string {
  return n > TILE_MAX ? `${formatINR(TILE_MAX)}+` : formatINR(n);
}

/**
 * A row shows the exact figure in full Indian grouping and keeps it on one
 * line. Everything up to the ₹1 crore cap ("₹1,00,00,000") fits at full size;
 * older junk amounts step the font down instead of wrapping.
 */
function rowAmountSize(text: string): string {
  if (text.length <= 16) return "text-2xl";
  if (text.length <= 22) return "text-lg";
  if (text.length <= 28) return "text-sm";
  return "text-xs";
}

/** One short sentence under the status: what happened, and what to do if anything. */
function statusSentence(r: AdvanceSalaryRequest): string {
  const by = r.reviewedBy?.name ? ` by ${r.reviewedBy.name}` : "";
  const on = r.reviewedAt ? ` on ${formatDate(r.reviewedAt)}` : "";
  switch (r.status) {
    case "pending":
      return "Your admin has not decided yet.";
    case "approved":
      return `Approved${by}${on}. Not paid back yet.`;
    case "rejected":
      // With a reason, the reason is shown just below; without one, the
      // employee still needs to know where to find out.
      return r.adminRemark?.trim()
        ? `Not approved${by}${on}.`
        : `Not approved${by}${on}. Please talk to your admin to know why.`;
    case "repaid":
      if (r.deductedInMonth) return `Taken from your ${formatMonth(r.deductedInMonth)} salary.`;
      return r.repaidAt ? `Paid back on ${formatDate(r.repaidAt)}.` : "Paid back.";
    default:
      return "";
  }
}

function RequestCard({ request, index }: { request: AdvanceSalaryRequest; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = statusMeta(request.status);
  const granted = grantedAmount(request);
  const grantedText = formatINRFull(granted);
  const partial = granted !== request.amount;
  // Only offer "Show more" when the text is long enough to be clamped.
  const long = request.reason.length + (request.notes?.length ?? 0) > 140;

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="relative overflow-hidden rounded-[20px] border border-slate-100 bg-white/85 p-4 pl-5 shadow-sm dark:border-white/5 dark:bg-slate-900/50"
    >
      {/* Colour bar: the status can be read before a word of the card is. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[13px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
          {TYPE_LABEL[request.type] ?? "Request"}
        </span>
        <span className="text-[13px] text-slate-500 dark:text-slate-400">
          Asked on {formatDate(request.createdAt)}
        </span>
      </div>

      <p
        className={`mt-3 truncate font-bold leading-tight text-slate-900 dark:text-white ${rowAmountSize(grantedText)}`}
      >
        {grantedText}
      </p>
      {partial && (
        <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">
          You asked for {formatINRFull(request.amount)}
        </p>
      )}

      <div className="mt-3 flex flex-col items-start gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${meta.pill}`}
        >
          <meta.icon className="h-4 w-4" />
          {meta.label}
        </span>
        <p className="text-sm text-slate-700 dark:text-slate-300">{statusSentence(request)}</p>
        {request.status === "rejected" && request.adminRemark?.trim() && (
          // The admin's own words, in full: it is the answer the employee
          // was waiting for, so it is never clamped behind "Show more".
          <p className="w-full rounded-xl bg-rose-50 px-3 py-2 text-[15px] leading-snug text-rose-900 [overflow-wrap:anywhere] dark:bg-rose-500/10 dark:text-rose-200">
            <span className="font-bold">Reason:</span> {request.adminRemark.trim()}
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5">
        <div
          className={`${!expanded && long ? "line-clamp-3" : ""} space-y-1 text-sm [overflow-wrap:anywhere]`}
        >
          <p className="italic text-slate-600 dark:text-slate-400">“{request.reason}”</p>
          {request.notes && (
            <p className="text-slate-500 dark:text-slate-400">
              <span className="font-semibold">Note:</span> {request.notes}
            </p>
          )}
        </div>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="-ml-2 mt-1 h-10 rounded-lg px-2 text-sm font-semibold text-primary"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </motion.li>
  );
}

export function MyAdvanceSalary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [newRequestOpen, setNewRequestOpen] = useState(false);

  const {
    requests,
    isLoading,
    isError,
    isFetching,
    hasLoaded,
    error,
    refetch,
    createRequest,
    isCreating,
  } = useAdvanceSalaryService({ pollWhilePending: true });

  // Coming back to the app re-reads the list. The answer to a request usually
  // arrives while the app is in the background, and a Capacitor WebView gets
  // no window-focus event on resume (focus refetching is off app-wide anyway),
  // so a request approved an hour ago kept saying "Waiting" until a restart.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeAppListener: (() => void) | undefined;
    let disposed = false;
    if (isNativeApp()) {
      import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void refetch();
          }),
        )
        .then((h) => {
          if (disposed) void h.remove();
          else removeAppListener = () => void h.remove();
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [refetch]);

  // Computed from the list rather than /advance-salary/summary, so the tiles
  // and the rows below can never disagree.
  const summary = useMemo(() => {
    const totals: Record<Status, { amount: number; count: number }> = {
      pending: { amount: 0, count: 0 },
      approved: { amount: 0, count: 0 },
      rejected: { amount: 0, count: 0 },
      repaid: { amount: 0, count: 0 },
    };
    for (const req of requests) {
      const bucket = totals[req.status];
      if (!bucket) continue;
      bucket.amount += grantedAmount(req);
      bucket.count += 1;
    }
    return totals;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let filtered = requests;
    if (statusFilter !== "all") {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      // Matches what is on the card — "advance salary", a status word, the
      // amount as typed or as shown — not only the raw type key.
      const digits = query.replace(/[^\d]/g, "");
      filtered = filtered.filter((req) => {
        const haystack = [
          TYPE_LABEL[req.type],
          statusMeta(req.status).label,
          req.reason,
          req.notes ?? "",
          req.adminRemark ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(query)) return true;
        return (
          !!digits &&
          (String(req.amount).includes(digits) || String(grantedAmount(req)).includes(digits))
        );
      });
    }
    return filtered;
  }, [requests, statusFilter, searchQuery]);

  const showAll = () => {
    setStatusFilter("all");
    setSearchQuery("");
  };

  const handleCreate = async (payload: Parameters<typeof createRequest>[0]) => {
    await createRequest(payload);
    // A new request is always "Waiting". With another filter or a search
    // active it would be hidden, which reads as "it did not work".
    showAll();
  };

  const loadFailed = isError && !hasLoaded;
  // A search box only earns its place once the list is long enough to need one.
  const showSearch = requests.length > 5 || searchQuery !== "";

  return (
    <div className="w-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Requests</h1>
        <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">
          Ask for an advance on your salary or a loan, and see the answer here.
        </p>
        <Button
          onClick={() => setNewRequestOpen(true)}
          className="mt-4 h-12 w-full rounded-xl bg-gradient-primary text-base font-bold text-white shadow-md hover:opacity-95 sm:w-auto sm:px-6"
        >
          <Plus className="!size-5" />
          New Request
        </Button>
      </motion.div>

      {loadFailed ? (
        <div
          role="alert"
          className="rounded-[20px] border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-500/20 dark:bg-rose-500/10"
        >
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 dark:text-rose-400" />
          <p className="mt-2 text-base font-semibold text-rose-900 dark:text-rose-200">
            {advanceSalaryErrorMessage(error, "load")}
          </p>
          <Button
            onClick={() => void refetch()}
            disabled={isFetching}
            variant="outline"
            className="mt-4 h-11 w-full rounded-xl bg-white text-base font-semibold dark:bg-slate-900"
          >
            {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/* Totals. Each tile is also the filter for its status: one big
              coloured target per status is easier than a dropdown to read. */}
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {STATUS_ORDER.map((status) => {
              const meta = STATUS[status];
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  // The visible total is rounded (₹1.5k); a screen reader gets
                  // the exact figure.
                  aria-label={
                    hasLoaded
                      ? `${meta.label}: ${formatINRFull(summary[status].amount)}, ${summary[status].count} ${summary[status].count === 1 ? "request" : "requests"}`
                      : meta.label
                  }
                  disabled={!hasLoaded}
                  onClick={() => setStatusFilter(active ? "all" : status)}
                  className={`min-h-[76px] min-w-0 rounded-2xl border p-3 text-left transition-shadow ${meta.tile} ${
                    active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold">
                    <meta.icon className="h-4 w-4 shrink-0" />
                    {meta.label}
                  </span>
                  {/* Single line, always: compact total on the left, how many
                      requests on the right. */}
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-lg font-bold leading-tight">
                      {hasLoaded ? tileAmount(summary[status].amount) : "…"}
                    </span>
                    {hasLoaded && (
                      <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[12px] font-bold dark:bg-black/25">
                        {summary[status].count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {statusFilter !== "all" && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-1 dark:bg-slate-800/60">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Showing only: <span className="font-semibold">{STATUS[statusFilter].label}</span>
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="h-10 shrink-0 px-2 text-sm font-semibold text-primary"
              >
                Show all
              </button>
            </div>
          )}

          {showSearch && (
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search your requests"
                aria-label="Search your requests"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl border-slate-200 pl-10 text-base dark:border-slate-700"
              />
            </div>
          )}

          {isError && hasLoaded && (
            // A refresh failed but an earlier list is on screen: keep showing it.
            <div
              role="status"
              className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-1 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <span>Could not check for updates.</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="h-10 shrink-0 px-2 font-semibold"
              >
                Try again
              </button>
            </div>
          )}

          {/* Requests List */}
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <span className="sr-only">Loading your requests</span>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[150px] animate-pulse rounded-[20px] bg-slate-200/70 dark:bg-slate-800/50"
                />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-[20px] border border-slate-100 bg-white/85 p-6 text-center dark:border-white/5 dark:bg-slate-900/50">
              <Wallet className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                You have not asked for any money yet.
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Tap New Request to ask for an advance or a loan.
              </p>
              <Button
                onClick={() => setNewRequestOpen(true)}
                variant="outline"
                className="mt-4 h-11 w-full rounded-xl text-base font-semibold"
              >
                <Plus className="!size-5" />
                New Request
              </Button>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-[20px] border border-slate-100 bg-white/85 p-6 text-center dark:border-white/5 dark:bg-slate-900/50">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                No requests here.
              </p>
              <Button
                onClick={showAll}
                variant="outline"
                className="mt-4 h-11 w-full rounded-xl text-base font-semibold"
              >
                Show all requests
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredRequests.map((request, idx) => (
                <RequestCard key={request._id} request={request} index={idx} />
              ))}
            </ul>
          )}
        </>
      )}

      {/* New Request Modal */}
      <NewRequestModal
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        onSubmit={handleCreate}
        isLoading={isCreating}
      />
    </div>
  );
}
