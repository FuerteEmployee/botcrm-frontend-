import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Plus, Receipt, Search, IndianRupee, Tag, Info, Wallet, Calendar, Clock, UserCheck,
  CheckCircle2, Paperclip, Check, X, Pencil, Trash2, Eye, LayoutGrid, List, Loader2,
  RefreshCw, ExternalLink, FileText,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  useExpenseService, isOverExpenseCap, EXPENSE_MAX_AMOUNT, type Expense,
} from "@/services/expense-service";
import { useEmployeeService } from "@/services/employee-service";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import { formatINR, formatINRFull } from "@/lib/format";
import { EXPENSE_CATEGORIES as CATEGORIES } from "@/lib/expense-categories";
import { RejectReasonDialog, DIALOG_CLOSE_40 } from "@/components/pages/reject-reason-dialog";
import { MoneyStatTile } from "@/components/pages/money-stat-tile";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

type StatusFilter = "all" | Expense["status"];

// "Reimbursed" is the accounting word; what the admin needs to know is that
// a salary has already paid it (and it is therefore locked).
const STATUS_LABELS: Record<Expense["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Paid in salary",
};

const STATUS_BADGE: Record<Expense["status"], string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning-foreground border-warning/20",
  reimbursed: "bg-info/10 text-info border-info/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const PAGE_SIZE = 25;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Today's date in India, as YYYY-MM-DD, whatever the device's time zone. */
const istTodayKey = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
/** An instant's calendar day in India, as YYYY-MM-DD. */
const istKey = (value: string) => {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? "" : new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
};
function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
/** Payroll stores the 1st of the paying month as a server-local midnight. */
function salaryMonthLabel(value?: string) {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 2 * 24 * 3600e3);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** Full amount, or a short warning for a claim saved before the ₹1 crore limit. */
const money = (amount: number) => {
  if (isOverExpenseCap(amount)) return `Over ${formatINRFull(EXPENSE_MAX_AMOUNT)}`;
  const n = Number(amount) || 0;
  // ₹145.50, not ₹145.5; whole rupees stay whole.
  const paise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** A photo receipt can be shown inline; a PDF or Word file is opened instead. */
const isImageReceipt = (url: string) => /\/image\/upload\//.test(url) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);

/**
 * Why the list could not be loaded, when the answer is a refusal rather than
 * a network problem. "Try again" cannot fix a 403, and the server's own text
 * ("Access denied: no view permission for ...") is not written for people.
 */
function refusalText(error: unknown, what: string): string | null {
  const res = (error as { response?: { status?: number; data?: { featureDisabled?: boolean; requiredUpgrade?: boolean; subscriptionStatus?: string } } })?.response;
  if (res?.status !== 403) return null;
  if (res.data?.featureDisabled) return `${what} is switched off for your company. Contact support to turn it on.`;
  if (res.data?.requiredUpgrade) return `${what} is not included in your plan.`;
  if (res.data?.subscriptionStatus) return "Your company's plan is not active. Please renew it to continue.";
  return `You do not have permission to see ${what.toLowerCase()}. Ask your admin.`;
}

const blankForm = () => ({
  employeeId: "",
  category: "Tea/Coffee",
  amount: "",
  date: istTodayKey(),
  description: "",
  status: "pending" as Expense["status"],
});

function ExpensesPage() {
  const {
    expenses: list, hasLoaded, isLoading: isExpensesLoading, isError, error: loadError, isFetching, refetch,
    createExpense, updateExpense, deleteExpense, approveExpense, rejectExpense, approveExpenseGroup, rejectExpenseGroup,
    isCreating, isUpdating, isApproving, isApprovingGroup, isDeleting, isRejecting, isRejectingGroup,
  } = useExpenseService();
  // Needed only for the form's employee picker; the list does not wait for it.
  const { employees } = useEmployeeService();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { defaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("expenses", "create");
  const canEdit = can("expenses", "edit");
  const canDelete = can("expenses", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Expense | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Reject asks first, with an optional reason the employee will see.
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [form, setForm] = useState(blankForm);

  const confirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    const adminRemark = reason || undefined;
    if (rejectTarget.splitGroupId) {
      await rejectExpenseGroup({ splitGroupId: rejectTarget.splitGroupId, adminRemark });
    } else {
      await rejectExpense({ id: rejectTarget._id, adminRemark });
    }
    setDetailsTarget(null);
  };

  const approve = async (exp: Expense) => {
    try {
      if (exp.splitGroupId) await approveExpenseGroup(exp.splitGroupId);
      else await approveExpense(exp._id);
      setDetailsTarget(null);
    } catch {
      // The service has already shown the reason.
    }
  };
  const approvingNow = isApproving || isApprovingGroup;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (e.category || "").toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q) ||
        (e.employeeName || "").toLowerCase().includes(q)
      );
    });
  }, [list, searchQuery, statusFilter]);

  // How many claims each status choice will list under the current search, so
  // the filter says what it will show before it is picked.
  const statusCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const c: Record<string, number> = { all: 0, pending: 0, approved: 0, rejected: 0, reimbursed: 0 };
    for (const e of list) {
      if (q && !((e.category || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q) || (e.employeeName || "").toLowerCase().includes(q))) continue;
      c.all += 1;
      if (e.status in c) c[e.status] += 1;
    }
    return c;
  }, [list, searchQuery]);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, { employeeName: string; expenses: Expense[] }> = {};
    filtered.forEach((e) => {
      const key = e.employeeId || "admin";
      if (!groups[key]) groups[key] = { employeeName: e.employeeName, expenses: [] };
      groups[key].expenses.push(e);
    });
    return Object.entries(groups).map(([id, data]) => ({ employeeId: id, ...data }));
  }, [filtered]);

  // The same figures as the Dashboard: claims approved or paid, dated this
  // month (India time), leaving out any saved before the ₹1 crore limit.
  // "Total Portfolio" used to add up every claim ever, rejected ones and
  // ₹1e114 junk included, and showed "₹1e+108Cr".
  const stats = useMemo(() => {
    const month = istTodayKey().slice(0, 7);
    let approvedTotal = 0, approvedCount = 0, pendingCount = 0, pendingTotal = 0, overCap = 0;
    const people = new Set<string>();
    for (const e of list) {
      if (e.status === "pending") {
        pendingCount += 1;
        if (!isOverExpenseCap(e.amount)) pendingTotal += e.amount;
        people.add(e.employeeId || "admin");
      }
      if ((e.status === "approved" || e.status === "reimbursed") && istKey(e.date).slice(0, 7) === month) {
        if (isOverExpenseCap(e.amount)) overCap += 1;
        else { approvedTotal += e.amount; approvedCount += 1; }
      }
    }
    return { approvedTotal, approvedCount, pendingCount, pendingTotal, overCap, people: people.size };
  }, [list]);

  const openAdd = (employeeId = "") => {
    setEditing(null);
    setFormError(null);
    setForm({ ...blankForm(), employeeId });
    setOpen(true);
  };
  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setFormError(null);
    setForm({
      employeeId: exp.employeeId || "admin",
      category: exp.category,
      amount: String(exp.amount),
      date: istKey(exp.date) || istTodayKey(),
      description: exp.description || "",
      status: exp.status,
    });
    setDetailsTarget(null);
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amountText = form.amount.trim();
    // Same rules as the server, in the same words.
    if (!/^\d+(\.\d{1,2})?$/.test(amountText)) return setFormError("Please enter the amount in numbers only, like 250 or 250.50.");
    if (Number(amountText) < 1) return setFormError("The amount must be at least ₹1.");
    if (!form.employeeId) return setFormError("Please choose an employee, or General Office.");
    if (!form.date) return setFormError("Please choose the date of the expense.");

    const expenseData = {
      employeeId: form.employeeId === "admin" ? undefined : form.employeeId,
      category: form.category,
      amount: Number(amountText),
      date: form.date,
      description: form.description,
      status: form.status,
    };

    try {
      if (editing) {
        await updateExpense({ id: editing._id, data: expenseData });
      } else {
        await createExpense(expenseData as unknown as Omit<Expense, "_id">);
      }
      setOpen(false);
    } catch {
      // The service has already shown the error; the form stays open to retry.
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExpense(deleteTarget._id);
      setDeleteTarget(null);
      setDetailsTarget(null);
    } catch {
      // The service has already shown the error.
    }
  };

  const getCategoryIcon = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.icon || Tag;

  const statusBadge = (exp: Expense) => (
    <Badge variant="outline" className={cn("rounded px-1.5 py-0 text-[11px] font-bold", STATUS_BADGE[exp.status])}>
      {STATUS_LABELS[exp.status] || exp.status}
    </Badge>
  );

  /** Approve / reject / details / edit / delete for one claim. */
  const rowActions = (exp: Expense, opts: { labels?: boolean; inDetails?: boolean } = {}) => {
    const pending = exp.status === "pending";
    const locked = exp.status === "reimbursed";
    const overCap = isOverExpenseCap(exp.amount);
    const btn = opts.labels ? "h-10 rounded-lg px-3" : "h-10 w-10 rounded-lg p-0";
    return (
      <div className={cn("flex flex-wrap gap-1.5", !opts.labels && "justify-end")}>
        {!opts.inDetails && (
          <Button variant="outline" className={btn} onClick={() => setDetailsTarget(exp)} aria-label="Details" title="Details">
            <Eye className="h-4 w-4" />{opts.labels && "Details"}
          </Button>
        )}
        {pending && canEdit && !overCap && (
          <Button
            variant="outline"
            className={cn(btn, "border-emerald-200 text-emerald-700 hover:bg-emerald-50")}
            onClick={() => approve(exp)}
            disabled={approvingNow}
            aria-label={exp.splitGroupId ? "Approve all shares" : "Approve"}
            title={exp.splitGroupId ? "Approve all shares of this split expense" : "Approve"}
          >
            <Check className="h-4 w-4" />{opts.labels && (exp.splitGroupId ? "Approve all shares" : "Approve")}
          </Button>
        )}
        {pending && canEdit && (
          <Button
            variant="outline"
            className={cn(btn, "border-red-200 text-red-700 hover:bg-red-50")}
            onClick={() => setRejectTarget(exp)}
            aria-label={exp.splitGroupId ? "Reject all shares" : "Reject"}
            title={exp.splitGroupId ? "Reject all shares of this split expense" : "Reject"}
          >
            <X className="h-4 w-4" />{opts.labels && (exp.splitGroupId ? "Reject all shares" : "Reject")}
          </Button>
        )}
        {canEdit && !locked && (
          <Button variant="outline" className={cn(btn, "text-primary")} onClick={() => openEdit(exp)} aria-label="Edit" title="Edit">
            <Pencil className="h-4 w-4" />{opts.labels && "Edit"}
          </Button>
        )}
        {canDelete && !locked && (
          <Button variant="outline" className={cn(btn, "text-destructive")} onClick={() => setDeleteTarget(exp)} aria-label="Delete" title="Delete">
            <Trash2 className="h-4 w-4" />{opts.labels && "Delete"}
          </Button>
        )}
      </div>
    );
  };

  const header = (
    <PageHeader
      title="Expenses"
      description="Check and approve your team's expense claims. Approved claims are paid with salary."
      actions={canCreate ? (
        <Button className="h-10 rounded-xl" onClick={() => openAdd()}>
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      ) : null}
    />
  );

  if (isExpensesLoading) {
    return (
      <div className="space-y-6">
        {header}
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={6} />
      </div>
    );
  }

  const shown = filtered.slice(0, visibleCount);
  const emptyText = list.length === 0
    ? "No expenses yet. When an employee sends a claim from the app, it shows here."
    : "No expenses match this search or filter.";

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <MoneyStatTile
          label="Approved this month"
          value={formatINR(stats.approvedTotal)}
          subLabel={`${stats.approvedCount} ${stats.approvedCount === 1 ? "claim" : "claims"}, approved or paid${stats.overCap ? ` · ${stats.overCap} over ₹1 crore left out` : ""}`}
          icon={Wallet}
          accent="primary"
          className="col-span-2 sm:col-span-1"
        />
        <MoneyStatTile
          label="Waiting for approval"
          value={stats.pendingCount}
          subLabel={stats.pendingCount ? formatINRFull(stats.pendingTotal) : "Nothing waiting"}
          icon={Clock}
          accent="warning"
        />
        <MoneyStatTile
          label="People waiting"
          value={stats.people}
          subLabel="with a claim to check"
          icon={UserCheck}
          accent="info"
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          {/* Local toggle: the shared ViewToggle's buttons are 32px. */}
          <div className="flex rounded-xl border border-border/50 bg-muted/40 p-0.5" role="group" aria-label="Layout">
            {([["grid", LayoutGrid, "Cards"], ["list", List, "List"]] as const).map(([v, Icon, label]) => (
              <Button
                key={v}
                type="button"
                variant="ghost"
                className={cn("h-10 w-10 rounded-lg p-0", view === v ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
                onClick={() => setView(v)}
                aria-label={label}
                aria-pressed={view === v}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setVisibleCount(PAGE_SIZE); }}>
            <SelectTrigger className="h-10 w-[230px] rounded-lg" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses ({statusCounts.all})</SelectItem>
              <SelectItem value="pending">Waiting ({statusCounts.pending})</SelectItem>
              <SelectItem value="approved">Approved, not yet paid ({statusCounts.approved})</SelectItem>
              <SelectItem value="rejected">Rejected ({statusCounts.rejected})</SelectItem>
              <SelectItem value="reimbursed">Paid in salary ({statusCounts.reimbursed})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full md:w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, type or details"
            aria-label="Search expenses"
            className="h-10 rounded-lg pl-9"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
          />
        </div>
      </div>

      {isError && !hasLoaded ? (
        <Card className="space-y-3 p-8 text-center">
          {refusalText(loadError, "Expenses") ? (
            <p className="text-sm font-medium text-foreground">{refusalText(loadError, "Expenses")}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Could not load the expenses.</p>
              <p className="text-sm text-muted-foreground">Check your internet and try again.</p>
              <div>
                <Button variant="outline" className="h-10 rounded-lg" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Try again
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : view === "grid" ? (
        groupedByEmployee.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">{emptyText}</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groupedByEmployee.map((group) => {
              const groupTotal = group.expenses.reduce((s, e) => s + (isOverExpenseCap(e.amount) ? 0 : e.amount), 0);
              const waiting = group.expenses.filter((e) => e.status === "pending").length;
              return (
                <Card key={group.employeeId} className="flex flex-col gap-3 rounded-xl border-border/60 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-[16px] font-bold text-primary">
                      {group.employeeName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{group.employeeName}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {group.expenses.length} {group.expenses.length === 1 ? "claim" : "claims"}
                        {waiting ? ` · ${waiting} waiting` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-primary">{formatINR(groupTotal)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.expenses.slice(0, 4).map((exp) => {
                      const CatIcon = getCategoryIcon(exp.category);
                      return (
                        <button
                          key={exp._id}
                          type="button"
                          onClick={() => setDetailsTarget(exp)}
                          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-transparent bg-muted/30 px-2 py-1.5 text-left hover:border-primary/20"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <CatIcon className="h-4 w-4 shrink-0 text-primary/60" />
                            <span className="min-w-0 truncate text-[12px] font-medium">{exp.category}</span>
                            {exp.attachmentUrl && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Bill attached" />}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={cn("text-[12px] font-bold", isOverExpenseCap(exp.amount) && "text-rose-700")}>{money(exp.amount)}</span>
                            {statusBadge(exp)}
                          </span>
                        </button>
                      );
                    })}
                    {group.expenses.length > 4 && (
                      <p className="pt-1 text-center text-[12px] text-muted-foreground">+ {group.expenses.length - 4} more</p>
                    )}
                  </div>
                  <div className="mt-auto flex gap-2 border-t border-border/40 pt-3">
                    {canCreate && (
                      <Button variant="outline" className="h-10 flex-1 rounded-lg" onClick={() => openAdd(group.employeeId)}>
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-10 flex-1 rounded-lg"
                      onClick={() => { setSearchQuery(group.employeeId === "admin" ? "General Office" : group.employeeName); setView("list"); }}
                    >
                      <List className="h-4 w-4" /> See all
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {/* Phones: one card per claim, every action in reach. The table
              needs sideways scrolling at 360px and hid the buttons. */}
          <div className="space-y-2 md:hidden">
            {filtered.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">{emptyText}</Card>
            ) : shown.map((exp) => (
              <Card key={exp._id} className="space-y-2 rounded-xl border-border/60 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{exp.employeeName}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {exp.category} · {formatDate(exp.date)}
                      {exp.splitGroupId && exp.splitParticipantCount ? ` · split between ${exp.splitParticipantCount}` : ""}
                      {exp.attachmentUrl ? " · bill attached" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-[14px] font-bold", isOverExpenseCap(exp.amount) && "text-rose-700")}>{money(exp.amount)}</p>
                    {statusBadge(exp)}
                  </div>
                </div>
                {exp.status === "rejected" && exp.adminRemark && (
                  <p className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">Reason: {exp.adminRemark}</p>
                )}
                {rowActions(exp)}
              </Card>
            ))}
          </div>
          <div className="hidden md:block">
          <DataTable
            headers={["Employee", "Type", "Amount", "Date", "Status", "Actions"]}
            isEmpty={filtered.length === 0}
            emptyMessage={emptyText}
          >
            {shown.map((exp) => {
              const Icon = getCategoryIcon(exp.category);
              return (
                <DataTableRow key={exp._id}>
                  <DataTableCell isFirst className="text-[13px] font-semibold">
                    {exp.employeeName}
                    {exp.splitGroupId && exp.splitParticipantCount ? (
                      <span className="block text-[11px] font-normal text-muted-foreground">Split between {exp.splitParticipantCount}</span>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded border border-primary/10 bg-primary/5 text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[12px] font-medium">{exp.category}</span>
                      {exp.attachmentUrl && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Bill attached" />}
                    </div>
                  </DataTableCell>
                  <DataTableCell className={cn("whitespace-nowrap text-[12px] font-bold text-foreground", isOverExpenseCap(exp.amount) && "text-rose-700")}>
                    {money(exp.amount)}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap text-[12px] font-medium text-muted-foreground">{formatDate(exp.date)}</DataTableCell>
                  <DataTableCell>
                    {statusBadge(exp)}
                    {exp.status === "rejected" && exp.adminRemark && (
                      <p className="mt-1 line-clamp-2 max-w-[180px] text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]" title={exp.adminRemark}>
                        Reason: {exp.adminRemark}
                      </p>
                    )}
                  </DataTableCell>
                  <DataTableCell isLast>{rowActions(exp)}</DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTable>
          </div>
          {filtered.length > visibleCount && (
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" className="h-10 rounded-lg" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                Show more
              </Button>
              <p className="text-xs text-muted-foreground">Showing {visibleCount} of {filtered.length}</p>
            </div>
          )}
        </div>
      )}

      {/* Details: everything about one claim, including the bill */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => !o && setDetailsTarget(null)}>
        <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-md", DIALOG_CLOSE_40)}>
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{detailsTarget?.category || "Expense"}</DialogTitle>
            <DialogDescription>{detailsTarget?.employeeName}</DialogDescription>
          </DialogHeader>
          {detailsTarget && (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className={cn("font-semibold", isOverExpenseCap(detailsTarget.amount) && "text-rose-700")}>{money(detailsTarget.amount)}</dd>
                {detailsTarget.splitGroupId && detailsTarget.splitTotalAmount ? (
                  <>
                    <dt className="text-muted-foreground">Split</dt>
                    <dd>This is one share. {money(detailsTarget.splitTotalAmount)} was split between {detailsTarget.splitParticipantCount} people.</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Date spent</dt>
                <dd>{formatDate(detailsTarget.date)}</dd>
                {detailsTarget.createdAt && (
                  <>
                    <dt className="text-muted-foreground">Sent on</dt>
                    <dd>{formatDate(detailsTarget.createdAt)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold">
                  {STATUS_LABELS[detailsTarget.status]}
                  {detailsTarget.status === "reimbursed" && detailsTarget.reimbursedInMonth ? ` (${salaryMonthLabel(detailsTarget.reimbursedInMonth)} salary)` : ""}
                </dd>
                {detailsTarget.reviewedAt && (
                  <>
                    <dt className="text-muted-foreground">Decided on</dt>
                    <dd>{formatDate(detailsTarget.reviewedAt)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Details</dt>
                <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{detailsTarget.description || "—"}</dd>
                {detailsTarget.adminRemark && (
                  <>
                    <dt className="text-muted-foreground">Reject reason</dt>
                    <dd className="[overflow-wrap:anywhere]">{detailsTarget.adminRemark}</dd>
                  </>
                )}
              </dl>

              {detailsTarget.attachmentUrl ? (
                isImageReceipt(detailsTarget.attachmentUrl) ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Bill</p>
                    <a href={detailsTarget.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border">
                      <img src={detailsTarget.attachmentUrl} alt="Photo of the bill" className="max-h-72 w-full bg-muted object-contain" loading="lazy" />
                    </a>
                    <Button variant="outline" className="h-10 w-full rounded-lg" asChild>
                      <a href={detailsTarget.attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> Open full size
                      </a>
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" className="h-10 w-full rounded-lg" asChild>
                    <a href={detailsTarget.attachmentUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4" /> Open the bill ({/\.docx?(\?|$)/i.test(detailsTarget.attachmentUrl) ? "Word file" : "PDF"})
                    </a>
                  </Button>
                )
              ) : (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">No bill attached.</p>
              )}

              {detailsTarget.status === "pending" && isOverExpenseCap(detailsTarget.amount) && (
                <p className="text-[13px] font-medium text-rose-700">
                  This claim is over {formatINRFull(EXPENSE_MAX_AMOUNT)} and cannot be approved. Reject it instead.
                </p>
              )}
              {detailsTarget.status === "reimbursed" && (
                <p className="text-[13px] text-muted-foreground">Paid in a salary, so it can no longer be changed or deleted.</p>
              )}
              {rowActions(detailsTarget, { labels: true, inDetails: true })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / edit */}
      <Dialog open={open} onOpenChange={(o) => { if (!isCreating && !isUpdating) setOpen(o); }}>
        <DialogContent className={cn("flex max-h-[90vh] max-w-md flex-col rounded-xl", DIALOG_CLOSE_40)}>
          <DialogHeader className="shrink-0 pr-8 text-left">
            <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-primary/5 text-primary">
              <Receipt className="h-4.5 w-4.5" />
            </div>
            <DialogTitle className="text-[15px] font-bold">{editing ? "Edit expense" : "Add expense"}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {editing?.splitGroupId
                ? "This is one share of a split expense. The person cannot be changed, and Approve or Reject changes every share together."
                : "Money spent for the company. For office spending that is not an employee's claim, choose General Office."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="mt-1 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {editing?.splitGroupId ? (
                <p className="text-sm"><span className="font-semibold">Employee:</span> {editing.employeeName}</p>
              ) : (
              <FormSelect
                label="Employee"
                value={form.employeeId}
                onValueChange={(v) => setForm({ ...form, employeeId: v })}
                options={[
                  // Phone in the label, not as FormSelect's subLabel: that line
                  // is 10px, too small to read on a phone.
                  { label: "General Office (company spending)", value: "admin" },
                  ...employees.map((e) => ({ label: e.phone ? `${e.name} (${e.phone})` : e.name, value: e._id })),
                  // Keep a former employee's claim editable.
                  ...(editing?.employeeId && !employees.some((e) => e._id === editing.employeeId)
                    ? [{ label: editing.employeeName, value: editing.employeeId }]
                    : []),
                ]}
                containerClassName="space-y-1"
              />
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormInput
                  label="Amount (₹)"
                  type="text"
                  inputMode="decimal"
                  placeholder="For example 250"
                  icon={IndianRupee}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  className="h-10"
                />
                <FormInput
                  label="Date spent"
                  type="date"
                  icon={Calendar}
                  value={form.date}
                  max={istTodayKey()}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                  className="h-10"
                />
              </div>

              <FormSelect
                label="Type of expense"
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
                options={[
                  ...CATEGORIES,
                  // A claim sent with a type that is not in the list keeps it.
                  ...(form.category && !CATEGORIES.some((c) => c.value === form.category) ? [{ label: form.category, value: form.category }] : []),
                ]}
              />

              <FormInput
                label="Details"
                placeholder="For example: printer ink"
                icon={Info}
                value={form.description}
                maxLength={500}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="h-10"
              />

              {!editing?.splitGroupId && (
                <FormSelect
                  label="Status"
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as Expense["status"] })}
                  // "Paid in salary" is set only by payroll when a salary pays it.
                  options={[
                    { label: "Waiting", value: "pending" },
                    { label: "Approved", value: "approved" },
                    { label: "Rejected", value: "rejected" },
                  ]}
                />
              )}
              {formError && (
                <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>
              )}
            </div>

            <DialogFooter className="shrink-0 gap-2 pt-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isCreating || isUpdating} className="h-10 rounded-xl text-[13px] font-semibold">
                Cancel
              </Button>
              <Button type="submit" className="h-10 rounded-xl text-[13px] font-semibold" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editing ? "Save changes" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RejectReasonDialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title={rejectTarget?.splitGroupId ? "Reject all shares of this expense?" : "Reject this expense?"}
        description={
          rejectTarget ? (
            <>
              {rejectTarget.employeeName} · {rejectTarget.category} ·{" "}
              <span className="font-semibold text-foreground">{money(rejectTarget.amount)}</span>
              {rejectTarget.splitGroupId && rejectTarget.splitParticipantCount ? (
                <span className="mt-1 block">
                  This was split between {rejectTarget.splitParticipantCount} people. Every share is rejected together, with the same reason.
                </span>
              ) : null}
              {rejectTarget.description && (
                <span className="mt-1 block line-clamp-3 italic">“{rejectTarget.description}”</span>
              )}
            </>
          ) : null
        }
        onConfirm={confirmReject}
        isLoading={isRejecting || isRejectingGroup}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-xl border-destructive/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px] font-bold">Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] [overflow-wrap:anywhere]">
              {deleteTarget ? `${deleteTarget.employeeName} · ${deleteTarget.category} · ${money(deleteTarget.amount)}. ` : ""}
              It will be removed for good{deleteTarget?.employeeId ? ", and the employee will no longer see it" : ""}. To say no to a claim, use Reject instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl text-[13px]" disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" className="h-10 rounded-xl text-[13px] text-white" onClick={remove} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
