import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getInvoices,
  createInvoice,
  updateInvoice,
  getTenants,
  type Invoice,
  type InvoiceInput,
  type InvoiceStatus,
} from "@/services/superadmin-service";
import {
  Download,
  Plus,
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
  Printer,
  Pencil,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { cn } from "@/lib/utils";
import { requestErrorMessage } from "@/services/request-error";

export const Route = createFileRoute("/super/billing")({
  component: BillingPage,
});

type ListStatus = "all" | "overdue" | InvoiceStatus;

const STATUS_TABS: { value: ListStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Waiting" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

const INV_BADGES: Record<string, { cls: string; label: string }> = {
  paid: {
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    label: "Paid",
  },
  pending: {
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    label: "Waiting",
  },
  overdue: { cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", label: "Overdue" },
  failed: { cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", label: "Failed" },
  refunded: {
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    label: "Refunded",
  },
};

const PAGE_SIZE = 20;

/** Exact rupees in Indian grouping, paise shown only when there are any. */
function rupees(n: number) {
  const v = Number(n) || 0;
  const frac = Math.round(v * 100) % 100 !== 0;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const companyOf = (inv: Invoice) =>
  inv.companyDeleted ? "Deleted company" : inv.adminId?.companyName || inv.adminId?.name || "—";
const badgeOf = (inv: Invoice) =>
  INV_BADGES[inv.overdue ? "overdue" : inv.status] || INV_BADGES.pending;
const day = (d?: string | null) => (d ? format(new Date(d), "d MMM yyyy") : "—");
/** The IST calendar day of an instant, as YYYY-MM-DD, for a date input. */
const istDay = (d?: string | null) =>
  d ? new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10) : "";
const currentPeriod = () => format(new Date(), "MMM yyyy");

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

function printInvoice(inv: Invoice) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) {
    toast.error(
      "Your browser blocked the print window. Allow pop-ups for this site and try again.",
    );
    return;
  }
  const row = (k: string, v: string) =>
    `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
  w.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111;margin:40px}h1{font-size:22px;margin:0 0 4px}
p{margin:0 0 24px;color:#555}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #ddd;font-size:14px}
th{width:40%;color:#555;font-weight:500}.amt{font-size:20px;font-weight:700}</style></head><body>
<h1>Invoice ${escapeHtml(inv.invoiceNumber)}</h1><p>B.O.T HRMS</p><table>
${row("Company", companyOf(inv))}${row("Phone", inv.adminId?.phone || "—")}${row("Plan", inv.planId?.name || "—")}
${row("Period", inv.period || "—")}${row("Raised on", day(inv.createdAt))}${row("Due by", day(inv.dueDate))}
${row("Status", badgeOf(inv).label)}${row("Paid on", day(inv.paidAt))}${inv.notes ? row("Notes", inv.notes) : ""}
<tr><th>Amount</th><td class="amt">${escapeHtml(rupees(inv.amount))}</td></tr></table>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

type Confirm = { inv: Invoice; to: InvoiceStatus; title: string; body: string; action: string };

function BillingPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ListStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const rangeBad = !!from && !!to && from > to;
  const params = {
    status,
    search: search || undefined,
    adminId: company?.id,
    from: rangeBad ? undefined : from || undefined,
    to: rangeBad ? undefined : to || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "invoices", params],
    queryFn: () => getInvoices(params),
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to: InvoiceStatus }) =>
      updateInvoice(id, { status: to }),
    onSuccess: (inv) => {
      toast.success(`${inv.invoiceNumber} is now ${badgeOf(inv).label.toLowerCase()}`);
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (e) => {
      const msg = requestErrorMessage(e, "Could not change the invoice. Please try again.");
      if (msg) toast.error(msg);
    },
  });

  const invoices = data?.invoices || [];
  const stats = data?.stats;
  const filtersOn = status !== "all" || !!search || !!company || !!from || !!to;

  const handleExport = () => {
    downloadCSV(
      `invoices-${format(new Date(), "yyyy-MM-dd")}`,
      [
        { header: "Invoice", value: (r: Invoice) => r.invoiceNumber },
        { header: "Company", value: (r: Invoice) => companyOf(r) },
        { header: "Phone", value: (r: Invoice) => r.adminId?.phone || "" },
        { header: "Plan", value: (r: Invoice) => r.planId?.name || "" },
        { header: "Amount (INR)", value: (r: Invoice) => r.amount || 0 },
        { header: "Period", value: (r: Invoice) => r.period || "" },
        { header: "Raised on", value: (r: Invoice) => istDay(r.createdAt) },
        { header: "Due by", value: (r: Invoice) => istDay(r.dueDate) },
        { header: "Status", value: (r: Invoice) => badgeOf(r).label },
        { header: "Paid on", value: (r: Invoice) => istDay(r.paidAt) },
      ],
      invoices,
    );
  };

  const ask = (inv: Invoice, to: InvoiceStatus) => {
    const n = `${inv.invoiceNumber} (${rupees(inv.amount)}, ${companyOf(inv)})`;
    const texts: Record<InvoiceStatus, Omit<Confirm, "inv" | "to">> = {
      paid: {
        title: "Mark as paid?",
        body: `${n} will be recorded as paid today.`,
        action: "Mark paid",
      },
      pending: {
        title: inv.status === "failed" ? "Try this payment again?" : "Mark as unpaid?",
        body:
          inv.status === "failed"
            ? `${n} goes back to waiting for payment.`
            : `${n} goes back to waiting for payment and its paid date is cleared.`,
        action: inv.status === "failed" ? "Try again" : "Mark unpaid",
      },
      failed: {
        title: "Mark payment as failed?",
        body: `${n} will show as a failed payment.`,
        action: "Mark failed",
      },
      refunded: {
        title: "Record a refund?",
        body: `${n} will be marked refunded. This can't be undone.`,
        action: "Mark refunded",
      },
    };
    setConfirm({ inv, to, ...texts[to] });
  };

  const actionsFor = (inv: Invoice) => {
    const list: { label: string; to?: InvoiceStatus; onClick?: () => void; danger?: boolean }[] = [
      { label: "View / print", onClick: () => setViewing(inv) },
    ];
    if (inv.companyDeleted) return list;
    if (inv.status === "pending" || inv.status === "failed")
      list.push({ label: "Mark paid", to: "paid" });
    if (inv.status === "failed") list.push({ label: "Try payment again", to: "pending" });
    if (inv.status === "pending") list.push({ label: "Mark failed", to: "failed", danger: true });
    if (inv.status === "paid") list.push({ label: "Mark unpaid", to: "pending" });
    if (inv.status === "paid") list.push({ label: "Mark refunded", to: "refunded", danger: true });
    if (inv.status === "pending" || inv.status === "failed")
      list.push({ label: "Edit", onClick: () => setEditing(inv) });
    return list;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Billing and invoices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invoices for every company, in rupees
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-10 flex-1 sm:flex-none"
            onClick={handleExport}
            disabled={invoices.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export page
          </Button>
          <Button
            className="h-10 flex-1 sm:flex-none bg-primary hover:bg-primary/90"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New invoice
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {isLoading || !stats ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <Stat
                label="Received this month"
                value={rupees(stats.collected)}
                note={`${stats.collectedCount} invoices paid`}
                tone="good"
              />
              <Stat
                label="Waiting for payment"
                value={rupees(stats.pending)}
                note={`${stats.pendingCount} invoices`}
                tone="warn"
              />
              <Stat
                label="Overdue"
                value={rupees(stats.overdue)}
                note={`${stats.overdueCount} past the due date`}
                tone={stats.overdueCount > 0 ? "bad" : "muted"}
              />
              <Stat
                label="Failed payments"
                value={String(stats.failed)}
                note={
                  stats.failed > 0 ? `${formatINR(stats.failedAmount)} to retry` : "none to retry"
                }
                tone={stats.failed > 0 ? "bad" : "muted"}
              />
            </>
          )}
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div
            className="flex gap-1.5 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Invoice status"
          >
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={status === t.value}
                onClick={() => {
                  setStatus(t.value);
                  setPage(1);
                }}
                className={cn(
                  "h-10 px-3 rounded-md text-xs font-medium whitespace-nowrap border transition-colors",
                  status === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search invoice number, company or phone"
                className="pl-9 h-10 text-sm"
                aria-label="Search invoices"
                maxLength={100}
              />
            </div>
            <label className="text-xs text-muted-foreground">
              Raised from
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="h-10 text-sm mt-1"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Raised to
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="h-10 text-sm mt-1"
              />
            </label>
            {filtersOn && (
              <Button
                variant="ghost"
                className="h-10 col-span-2 sm:col-span-1"
                onClick={() => {
                  setStatus("all");
                  setSearchInput("");
                  setCompany(null);
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          {rangeBad && (
            <p className="text-xs text-red-600">The start date must be before the end date.</p>
          )}
          {company && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-card pl-3 text-xs">
              Company: <strong className="font-medium">{company.name}</strong>
              <button
                className="h-10 w-10 inline-flex items-center justify-center"
                aria-label="Show all companies"
                onClick={() => {
                  setCompany(null);
                  setPage(1);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {/* Invoice list */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">Invoices</h2>
            {data && (
              <span className="text-xs text-muted-foreground">
                {data.total} {data.total === 1 ? "invoice" : "invoices"} ·{" "}
                {rupees(data.filteredAmount)}
              </span>
            )}
          </div>

          {isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : isError ? (
            <div className="border rounded-xl bg-card p-6 text-center space-y-3">
              <AlertCircle className="h-6 w-6 mx-auto text-red-600" />
              <p className="text-sm">
                {requestErrorMessage(error, "Could not load invoices. Please try again.") ||
                  "Could not load invoices."}
              </p>
              <Button variant="outline" className="h-10" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Try again
              </Button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="border rounded-xl bg-card px-4 py-12 text-center text-sm text-muted-foreground">
              {filtersOn
                ? "No invoices match these filters."
                : "No invoices yet. Use New invoice to raise the first one."}
            </div>
          ) : (
            <div className={cn(isFetching && "opacity-60 transition-opacity")}>
              {/* Phone: cards */}
              <ul className="sm:hidden space-y-2">
                {invoices.map((inv) => {
                  const badge = badgeOf(inv);
                  return (
                    <li key={inv._id} className="border rounded-xl bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-blue-600 dark:text-blue-400">
                            {inv.invoiceNumber}
                          </div>
                          <div className="font-medium text-sm truncate">{companyOf(inv)}</div>
                        </div>
                        <RowMenu actions={actionsFor(inv)} onStatus={(to) => ask(inv, to)} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-base font-semibold">{rupees(inv.amount)}</span>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {inv.period || "—"} · {inv.planId?.name || "No plan"} · due{" "}
                        {day(inv.dueDate)}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Tablet and up: table */}
              <div className="hidden sm:block border rounded-xl overflow-x-auto bg-card">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {[
                        "Invoice",
                        "Company",
                        "Plan",
                        "Amount",
                        "Period",
                        "Raised",
                        "Due by",
                        "Status",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const badge = badgeOf(inv);
                      return (
                        <tr
                          key={inv._id}
                          className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-2 text-xs font-mono">
                            <button
                              className="min-h-10 text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={() => setViewing(inv)}
                            >
                              {inv.invoiceNumber}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            {inv.companyDeleted || !inv.adminId ? (
                              <span className="text-[13px] text-muted-foreground">
                                Deleted company
                              </span>
                            ) : (
                              <button
                                className="min-h-10 text-left font-medium text-[13px] hover:underline"
                                title="Show only this company's invoices"
                                onClick={() => {
                                  setCompany({ id: inv.adminId!._id, name: companyOf(inv) });
                                  setPage(1);
                                }}
                              >
                                {companyOf(inv)}
                                <span className="block text-[11px] font-normal text-muted-foreground">
                                  {inv.adminId.phone}
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className="flex items-center gap-1.5 text-xs">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: inv.planId?.color || "#888" }}
                              />
                              {inv.planId?.name || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-medium text-xs whitespace-nowrap">
                            {rupees(inv.amount)}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {inv.period || "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {day(inv.createdAt)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2 text-xs whitespace-nowrap",
                              inv.overdue
                                ? "text-red-600 dark:text-red-400 font-medium"
                                : "text-muted-foreground",
                            )}
                          >
                            {day(inv.dueDate)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <RowMenu actions={actionsFor(inv)} onStatus={(to) => ask(inv, to)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">
                    Page {data.currentPage} of {data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-10 w-10 p-0"
                      aria-label="Previous page"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 w-10 p-0"
                      aria-label="Next page"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && <InvoiceDialog onClose={() => setShowCreate(false)} />}
      {editing && <InvoiceDialog invoice={editing} onClose={() => setEditing(null)} />}
      {viewing && <ViewDialog invoice={viewing} onClose={() => setViewing(null)} />}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => !open && !statusMutation.isPending && setConfirm(null)}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10" disabled={statusMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-10",
                (confirm?.to === "refunded" || confirm?.to === "failed") &&
                  "bg-destructive hover:bg-destructive/90",
              )}
              disabled={statusMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) statusMutation.mutate({ id: confirm.inv._id, to: confirm.to });
              }}
            >
              {statusMutation.isPending ? "Saving…" : confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowMenu({
  actions,
  onStatus,
}: {
  actions: { label: string; to?: InvoiceStatus; onClick?: () => void; danger?: boolean }[];
  onStatus: (to: InvoiceStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border hover:bg-muted transition-colors"
          aria-label="Invoice actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            className={cn("h-10", a.danger && "text-destructive focus:text-destructive")}
            onClick={() => (a.to ? onStatus(a.to) : a.onClick?.())}
          >
            {a.label === "View / print" ? (
              <Eye className="h-4 w-4 mr-2" />
            ) : a.label === "Edit" ? (
              <Pencil className="h-4 w-4 mr-2" />
            ) : null}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const tones = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="bg-card border rounded-xl p-3 sm:p-4 min-w-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold break-words">{value}</p>
      <p className={`text-[11px] mt-1 ${tones[tone]}`}>{note}</p>
    </div>
  );
}

function ViewDialog({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const badge = badgeOf(inv);
  const rows: [string, string][] = [
    ["Company", companyOf(inv)],
    ["Phone", inv.adminId?.phone || "—"],
    ["Plan", inv.planId?.name || "—"],
    ["Period", inv.period || "—"],
    ["Raised on", day(inv.createdAt)],
    ["Due by", day(inv.dueDate)],
    ["Paid on", day(inv.paidAt)],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{inv.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-semibold">{rupees(inv.amount)}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
          {inv.notes && (
            <div className="contents">
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap break-words">{inv.notes}</dd>
            </div>
          )}
        </dl>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Close
          </Button>
          <Button className="h-10" onClick={() => printInvoice(inv)}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ invoice, onClose }: { invoice?: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient();
  const editing = !!invoice;
  const [companySearch, setCompanySearch] = useState("");
  const [picked, setPicked] = useState<{
    id: string;
    name: string;
    phone?: string;
    plan?: string;
  } | null>(null);
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : "");
  const [period, setPeriod] = useState(invoice?.period || currentPeriod());
  const [dueDate, setDueDate] = useState(istDay(invoice?.dueDate));
  const [paidNow, setPaidNow] = useState(false);
  const [notes, setNotes] = useState(invoice?.notes || "");
  const [formError, setFormError] = useState("");

  const tenants = useQuery({
    queryKey: ["superadmin", "invoice-company-picker", companySearch],
    queryFn: () => getTenants({ search: companySearch || undefined, limit: 8, sort: "name" }),
    enabled: !editing && !picked,
    placeholderData: keepPreviousData,
  });
  const options: { id: string; name: string; phone?: string; plan?: string }[] = (
    tenants.data?.tenants || []
  )
    .filter((t: { orphan?: boolean; adminId?: unknown }) => !t.orphan && t.adminId)
    .map(
      (t: {
        adminId: { _id: string; name?: string; companyName?: string; phone?: string };
        planId?: { name?: string };
      }) => ({
        id: t.adminId._id,
        name: t.adminId.companyName || t.adminId.name || "Unnamed company",
        phone: t.adminId.phone,
        plan: t.planId?.name,
      }),
    );

  const mutation = useMutation({
    mutationFn: (payload: InvoiceInput & { adminId?: string }) =>
      editing
        ? updateInvoice(invoice!._id, payload)
        : createInvoice(payload as InvoiceInput & { adminId: string }),
    onSuccess: (inv) => {
      toast.success(
        editing
          ? `${inv.invoiceNumber} saved`
          : `${inv.invoiceNumber} raised for ${companyOf(inv)}`,
      );
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (e) =>
      setFormError(requestErrorMessage(e, "Could not save the invoice. Please try again.") || ""),
  });

  const submit = () => {
    setFormError("");
    if (!editing && !picked) return setFormError("Choose the company this invoice is for.");
    const n = Number(amount);
    if (
      !amount.trim() ||
      !Number.isFinite(n) ||
      n < 1 ||
      n > 12000000 ||
      Math.abs(n * 100 - Math.round(n * 100)) > 1e-6
    ) {
      return setFormError("Enter an amount from ₹1 to ₹1,20,00,000, with at most two decimals.");
    }
    if (!period.trim())
      return setFormError('Enter the period this invoice covers, for example "Sep 2026".');
    const payload: InvoiceInput & { adminId?: string } = {
      amount: n,
      period: period.trim(),
      dueDate: dueDate || null,
      notes: notes.trim(),
    };
    if (!editing) {
      payload.adminId = picked!.id;
      if (paidNow) payload.status = "paid";
    }
    mutation.mutate(payload);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${invoice!.invoiceNumber}` : "New invoice"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <span className="text-xs font-medium">Company</span>
            {editing ? (
              <p className="text-sm mt-1">{companyOf(invoice!)}</p>
            ) : picked ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md border p-2 pl-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{picked.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {picked.phone} · {picked.plan || "No plan"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  onClick={() => setPicked(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                <Input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Search company name or phone"
                  className="h-10 text-sm"
                  aria-label="Search companies"
                  maxLength={100}
                />
                <ul className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {tenants.isLoading ? (
                    <li className="p-3 text-xs text-muted-foreground">Loading companies…</li>
                  ) : options.length === 0 ? (
                    <li className="p-3 text-xs text-muted-foreground">No company matches.</li>
                  ) : (
                    options.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          className="w-full min-h-10 px-3 py-2 text-left hover:bg-muted"
                          onClick={() => {
                            setPicked(o);
                            setFormError("");
                          }}
                        >
                          <span className="block text-sm">{o.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {o.phone} · {o.plan || "No plan"}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
          <label className="block text-xs font-medium">
            Amount (₹)
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={12000000}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 text-sm mt-1"
              placeholder="e.g. 1200"
            />
          </label>
          <label className="block text-xs font-medium">
            Period
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              maxLength={40}
              className="h-10 text-sm mt-1"
            />
          </label>
          <label className="block text-xs font-medium">
            Due by (optional)
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 text-sm mt-1"
            />
          </label>
          <label className="block text-xs font-medium">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          </label>
          {!editing && (
            <label className="flex items-center gap-2 min-h-10 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={paidNow}
                onChange={(e) => setPaidNow(e.target.checked)}
              />
              Already paid (record it as paid today)
            </label>
          )}
          {formError && (
            <p className="text-xs text-red-600" role="alert">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-10" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : editing ? "Save" : "Raise invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
