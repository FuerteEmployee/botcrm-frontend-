import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Check,
  X,
  Calendar,
  UserPlus,
  History as HistoryIcon,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Plane,
  HeartPulse,
  Search,
  Layers,
  Trash2,
  Settings2,
  Inbox,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLeaveService, formatLeaveSpan, formatLeaveDuration, MAX_REJECT_REASON_LENGTH, type Leave } from "@/services/leave-service";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { useEmployeeService } from "@/services/employee-service";
import { requestErrorMessage } from "@/services/request-error";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FormInput } from "@/components/shared/form-input";
import { ViewToggle } from "@/components/shared/view-toggle";
import { GridCard } from "@/components/shared/grid-card";
import { Pagination } from "@/components/shared/pagination";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { AdminLoadError } from "@/components/leaves/admin-load-error";
import { LeaveBalanceNote } from "@/components/leaves/leave-balance-note";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/leaves")({
  component: LeavesPage,
});

const PAGE_SIZE = 24;
const MAX_REASON_LENGTH = 1000;
// Radix close buttons are 16-28px; on a phone that is too small to hit.
const BIG_CLOSE = "[&>button.absolute]:h-10 [&>button.absolute]:w-10 [&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:rounded-full";

function getLeaveIcon(name: string) {
  const norm = (name || "").toLowerCase();
  if (norm.includes("sick")) return <HeartPulse className="h-4 w-4" />;
  if (norm.includes("annual") || norm.includes("vacation")) return <Plane className="h-4 w-4" />;
  return <CalendarDays className="h-4 w-4" />;
}

const STATUS_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

function statusBadgeClass(status: string) {
  return cn(
    "text-[11px] font-bold px-2.5 py-0.5 border-transparent rounded-full",
    status === "approved" ? "bg-success/10 text-success"
    : status === "rejected" ? "bg-destructive/10 text-destructive"
    : "bg-warning/15 text-warning-foreground"
  );
}

/** "26 Sep 2026", read in IST so a phone on another timezone shows the same day. */
function fmtDay(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const initials = (name?: string) =>
  (name || "?").split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";

function LeavesPage() {
  const { leaves, hasData, isLoading, isError, isFetching, refetch, updateLeaveStatus, deleteLeave, createLeave, isCreating, isDeleting } = useLeaveService();
  const { can } = usePermission();
  const canCreate = can("leaves", "create");
  const canEdit = can("leaves", "edit");
  const canDelete = can("leaves", "delete");
  const canSeeTypes = can("leave-types", "view");
  // The whole active roster. This picker was capped at 100, and the test
  // tenant alone has 103 employees, so some people could never be chosen.
  const { employees: dbEmployees } = useEmployeeService({ status: "active" });
  const { leaveTypes } = useLeaveTypeService();
  const isMobile = useIsMobile();

  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  // A seven-column table on a 360px phone only scrolls sideways; phones get
  // the cards, and the toggle (whose buttons are too small to tap) is hidden.
  const effectiveView = isMobile ? "grid" : view;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leaves.filter((l) => {
      const matchesFilter = filter === "all" || l.status === filter;
      const matchesSearch = !needle || l.employeeId?.name?.toLowerCase().includes(needle);
      const matchesType = typeFilter === "all" || l.leaveTypeId?._id === typeFilter;
      return matchesFilter && matchesSearch && matchesType;
    });
  }, [leaves, filter, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [filter, search, typeFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);

  // Only a waiting request can be decided, so only those can be selected.
  // Selecting every row used to let "Approve All" turn rejected leave into
  // approved (and paid) leave.
  const selectable = (l: Leave) => canEdit && l.status === "pending";
  const selectableOnPage = pageRows.filter(selectable).map((l) => l._id);
  // Drop a selection that is no longer waiting (decided elsewhere, or gone).
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => leaves.some((l) => l._id === id && l.status === "pending"));
      return next.length === prev.length ? prev : next;
    });
  }, [leaves]);
  // Keep the drawer's copy in step with the list after a refresh.
  useEffect(() => {
    if (!selectedLeave) return;
    const fresh = leaves.find((l) => l._id === selectedLeave._id);
    if (fresh && fresh !== selectedLeave) setSelectedLeave(fresh);
  }, [leaves, selectedLeave]);

  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => selectedIds.includes(id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => allOnPageSelected
      ? prev.filter((id) => !selectableOnPage.includes(id))
      : Array.from(new Set([...prev, ...selectableOnPage])));
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /**
   * Decide several requests and report ONE outcome. Each call is silent, so a
   * refusal (already decided, cancelled meanwhile) is counted rather than
   * toasted per row, and the summary no longer claims rows that failed.
   */
  const decideMany = async (ids: string[], status: "approved" | "rejected", adminRemark?: string) => {
    setBusyIds((prev) => [...prev, ...ids]);
    try {
      const results = await Promise.all(
        ids.map((id) => updateLeaveStatus({ id, status, adminRemark, silent: true }).then(() => null, (e: unknown) => e ?? new Error("failed")))
      );
      const failures = results.filter((r) => r !== null);
      const done = ids.length - failures.length;
      const verb = status === "approved" ? "Approved" : "Rejected";
      if (failures.length === 0) {
        toast.success(`${verb} ${done} leave request${done === 1 ? "" : "s"}`);
      } else {
        const why = requestErrorMessage(failures[0], "Please try again.") || "Please try again.";
        if (ids.length === 1) toast.error(why);
        else toast.error(`${verb} ${done} of ${ids.length}. ${failures.length} could not be ${status}: ${why}`);
      }
      return done;
    } finally {
      setBusyIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  // Rejecting always goes through a confirmation with an optional reason,
  // which the employee then reads on their Leaves page. One dialog serves a
  // single request and a bulk selection (the same reason goes to each).
  const [rejectTarget, setRejectTarget] = useState<{ ids: string[]; leave?: Leave } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const openReject = (ids: string[], leave?: Leave) => {
    setRejectReason("");
    setRejectTarget({ ids, leave });
  };

  const confirmReject = async () => {
    if (!rejectTarget || isRejecting) return;
    const adminRemark = rejectReason.trim();
    const bulk = rejectTarget.ids.length > 1;
    setIsRejecting(true);
    try {
      const done = await decideMany(rejectTarget.ids, "rejected", adminRemark);
      if (bulk) setSelectedIds([]);
      // A single failure keeps the dialog open so the typed reason is not
      // lost; the toast has already said why it failed.
      if (bulk || done > 0) {
        setRejectTarget(null);
        setDetailsOpen(false);
      }
    } finally {
      setIsRejecting(false);
    }
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    const ids = selectedIds.filter((id) => leaves.some((l) => l._id === id && l.status === "pending"));
    if (!ids.length) return;
    if (action === "reject") {
      openReject(ids);
      return;
    }
    await decideMany(ids, "approved");
    setSelectedIds([]);
  };

  const handleStatus = async (id: string, status: "approved" | "rejected") => {
    if (busyIds.includes(id)) return;
    if (status === "rejected") {
      openReject([id], leaves.find((l) => l._id === id));
      return;
    }
    const done = await decideMany([id], "approved");
    if (done) setDetailsOpen(false);
  };

  const [deleteTarget, setDeleteTarget] = useState<Leave | null>(null);
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLeave(deleteTarget._id);
      if (selectedLeave?._id === deleteTarget._id) setDetailsOpen(false);
    } catch {
      // toast shown by the service
    }
    setDeleteTarget(null);
  };

  // HR "apply on behalf" form
  const [hrApplyOpen, setHrApplyOpen] = useState(false);
  const [hrFormEmployeeId, setHrFormEmployeeId] = useState("");
  const [hrFormLeaveTypeId, setHrFormLeaveTypeId] = useState("");
  const [hrFormStartDate, setHrFormStartDate] = useState("");
  const [hrFormEndDate, setHrFormEndDate] = useState("");
  // Half day / one day / date range. Only a range uses hrFormEndDate; the other
  // two are a single date, and the server refuses a half day whose start and
  // end differ.
  const [hrFormMode, setHrFormMode] = useState<"half" | "single" | "range">("single");
  const [hrFormHalfPortion, setHrFormHalfPortion] = useState<"first_half" | "second_half">("first_half");
  const [hrFormReason, setHrFormReason] = useState("");
  const [hrErrors, setHrErrors] = useState<Record<string, string>>({});

  const openHrApply = () => {
    setHrFormEmployeeId("");
    setHrFormLeaveTypeId("");
    setHrFormStartDate("");
    setHrFormEndDate("");
    setHrFormMode("single");
    setHrFormHalfPortion("first_half");
    setHrFormReason("");
    setHrErrors({});
    setHrApplyOpen(true);
  };

  const handleHrApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!hrFormEmployeeId) errs.employee = "Please choose an employee.";
    if (!hrFormLeaveTypeId) errs.type = "Please choose a leave type.";
    if (!hrFormStartDate) errs.start = hrFormMode === "range" ? "Please pick the first day." : "Please pick a date.";
    if (hrFormMode === "range") {
      if (!hrFormEndDate) errs.end = "Please pick the last day.";
      else if (hrFormStartDate && hrFormEndDate < hrFormStartDate) errs.end = "The last day cannot be before the first day.";
    }
    if (!hrFormReason.trim()) errs.reason = "Please write a short reason.";
    setHrErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await createLeave({
        employeeId: hrFormEmployeeId,
        leaveTypeId: hrFormLeaveTypeId,
        startDate: hrFormStartDate,
        endDate: hrFormMode === "range" ? hrFormEndDate : hrFormStartDate,
        reason: hrFormReason.trim(),
        dayPortion: hrFormMode === "half" ? hrFormHalfPortion : "full",
      });
      setHrApplyOpen(false);
    } catch {
      // toast already shown by the service; the form keeps what was typed
    }
  };

  const fieldError = (key: string) =>
    hrErrors[key] ? <p role="alert" className="text-[12px] font-medium text-destructive ml-1">{hrErrors[key]}</p> : null;

  const openDetails = (leave: Leave) => { setSelectedLeave(leave); setDetailsOpen(true); };

  const emptyMessage = search.trim()
    ? `No leave requests match "${search.trim()}".`
    : filter !== "all" || typeFilter !== "all"
      ? "No leave requests match these filters."
      : "No leave requests yet.";

  const showSkeleton = isLoading && !hasData;
  const showError = isError && !hasData;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description="Review and manage employee time-off requests, vacations, and sick leaves."
        actions={
          <div className="flex flex-wrap gap-2">
            {canSeeTypes && (
              <ActionButton
                asChild
                variant="add"
                showLabel
                label="Leave Types"
                icon={Settings2}
                className="bg-white text-primary border border-primary/20 hover:bg-primary/5 shadow-sm h-11 sm:h-10"
              >
                <Link to="/leave-types" />
              </ActionButton>
            )}
            {canCreate && (
              <ActionButton
                variant="add"
                showLabel
                label="New Request"
                icon={UserPlus}
                onClick={openHrApply}
                className="h-11 sm:h-10"
              />
            )}
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Pending Requests" value={pendingCount} icon={Clock} accent="warning" delay={0} />
        <StatCard label="Approved Leaves" value={approvedCount} icon={CheckCircle2} accent="success" delay={0.05} />
        <StatCard label="Total Requests" value={leaves.length} icon={CalendarDays} accent="primary" delay={0.1} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="hidden md:block">
            <ViewToggle view={view} onViewChange={updateDefaultLayout} />
          </div>
          <div className="grid grid-cols-2 md:flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger aria-label="Filter by status" className="w-full md:w-[150px] h-11 md:h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <div className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  filter === "approved" ? "bg-success" : filter === "pending" ? "bg-warning" : filter === "rejected" ? "bg-destructive" : "bg-primary"
                )} />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger aria-label="Filter by leave type" className="w-full md:w-[170px] h-11 md:h-10 border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none min-w-0">
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate"><SelectValue placeholder="Leave Type" /></span>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Types</SelectItem>
                {leaveTypes.map((type) => (
                  <SelectItem key={type._id} value={type._id}>{type.leaveName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <FormInput
          placeholder="Search by employee name..."
          aria-label="Search by employee name"
          icon={Search}
          className="h-11 md:h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Floating Bulk Action Bar (the selection lives in the table view) */}
      <AnimatePresence>
        {selectedIds.length > 0 && effectiveView === "list" && (
          <motion.div
            initial={{ y: 50, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 50, opacity: 0, x: "-50%" }}
            className="fixed bottom-8 left-1/2 z-50 bg-white/90 backdrop-blur-xl px-2 py-2 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-2 border border-white/40 ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 rounded-full border border-primary/10 ml-1">
              <span className="bg-gradient-primary text-white h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-black shadow-lg shadow-primary/20">
                {selectedIds.length}
              </span>
              <span className="text-[13px] font-black tracking-tight text-primary uppercase">Selected</span>
            </div>
            <div className="h-6 w-px bg-border/60 mx-1" />
            <div className="flex items-center gap-1.5 p-1">
              <ActionButton variant="approve" showLabel label="Approve All" icon={Check} disabled={busyIds.length > 0} onClick={() => handleBulkAction("approve")} className="h-11 px-6 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-none text-[13px] font-black" />
              <ActionButton variant="reject" showLabel label="Reject All" icon={X} disabled={busyIds.length > 0} onClick={() => handleBulkAction("reject")} className="h-11 px-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 border-none text-[13px] font-black" />
              <Button variant="ghost" onClick={() => setSelectedIds([])} className="h-11 px-6 rounded-full font-bold text-muted-foreground hover:bg-muted/50 transition-all active:scale-95 text-[13px]">
                <X className="h-4 w-4 mr-2" />Deselect
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showError ? (
        <AdminLoadError what="the leave requests" onRetry={() => refetch()} retrying={isFetching} />
      ) : showSkeleton ? (
        <SkeletonLoader type={effectiveView === "grid" ? "card" : "table"} count={6} />
      ) : (
        <AnimatePresence mode="wait">
          {effectiveView === "grid" ? (
            filtered.length === 0 ? (
              <div key="empty" className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/60">
                <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-[14px] font-bold text-foreground/70">{emptyMessage}</p>
              </div>
            ) : (
              <div key="grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageRows.map((leave, idx) => (
                  <GridCard
                    key={leave._id}
                    title={leave.employeeId?.name || "Unknown employee"}
                    subtitle={`Applied ${fmtDay(leave.createdAt)}`}
                    delay={Math.min(idx, 12) * 0.03}
                    icon={
                      <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                        {initials(leave.employeeId?.name)}
                      </div>
                    }
                    statusNode={<Badge variant="outline" className={statusBadgeClass(leave.status)}>{STATUS_LABEL[leave.status] || leave.status}</Badge>}
                    metaLeft={{ icon: Layers, label: leave.leaveTypeId?.leaveName || "Leave type deleted" }}
                    metaRight={{ icon: Calendar, label: formatLeaveDuration(leave) }}
                  >
                    <div className="relative">
                      <div className="text-[12px] text-muted-foreground/80 line-clamp-2 italic mt-1 mb-2 break-words [overflow-wrap:anywhere]">"{leave.reason}"</div>
                      <div className="flex items-center gap-2 text-[12px] text-foreground/80 font-semibold mb-3">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">{formatLeaveSpan(leave)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-border/40">
                        {leave.status === "pending" && canEdit && (
                          <>
                            <ActionButton variant="approve" tooltip="Approve" aria-label="Approve" disabled={busyIds.includes(leave._id)} onClick={() => handleStatus(leave._id, "approved")} className="h-10 w-10" />
                            <ActionButton variant="reject" tooltip="Reject" aria-label="Reject" disabled={busyIds.includes(leave._id)} onClick={() => handleStatus(leave._id, "rejected")} className="h-10 w-10" />
                          </>
                        )}
                        {canDelete && (
                          <ActionButton variant="delete" tooltip="Delete" aria-label="Delete" icon={Trash2} onClick={() => setDeleteTarget(leave)} className="h-10 w-10" />
                        )}
                        <ActionButton variant="view" tooltip="Details" aria-label="Details" icon={ChevronRight} onClick={() => openDetails(leave)} className="h-10 w-10" />
                      </div>
                    </div>
                  </GridCard>
                ))}
              </div>
            )
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DataTable
                headers={[
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <Checkbox
                        aria-label="Select all waiting requests on this page"
                        checked={allOnPageSelected}
                        disabled={selectableOnPage.length === 0}
                        onCheckedChange={toggleSelectAll}
                        className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary"
                      />
                    )}
                    Employee
                  </div>,
                  "Type", "Duration", "Reason", "Status", "Actions",
                ]}
                isEmpty={filtered.length === 0}
                emptyMessage={emptyMessage}
                className="shadow-sm"
              >
                {pageRows.map((leave) => (
                  <DataTableRow key={leave._id} className={cn(selectedIds.includes(leave._id) && "bg-primary/3")}>
                    <DataTableCell isFirst>
                      <div className="flex items-center gap-3">
                        {canEdit && (
                          selectable(leave) ? (
                            <Checkbox
                              aria-label={`Select ${leave.employeeId?.name || "request"}`}
                              checked={selectedIds.includes(leave._id)}
                              onCheckedChange={() => toggleSelect(leave._id)}
                              className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary"
                            />
                          ) : (
                            <span className="h-4 w-4 shrink-0" aria-hidden />
                          )
                        )}
                        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                          <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                            {initials(leave.employeeId?.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-[13px] font-bold text-foreground leading-tight">{leave.employeeId?.name || "Unknown employee"}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Applied {fmtDay(leave.createdAt)}</div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center text-primary/70">
                          {getLeaveIcon(leave.leaveTypeId?.leaveName || "")}
                        </div>
                        <span className="text-[12px] font-semibold text-foreground/80">{leave.leaveTypeId?.leaveName || "Leave type deleted"}</span>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="text-[13px] font-bold text-primary">{formatLeaveDuration(leave)}</div>
                      <div className="text-[11px] text-muted-foreground font-medium">
                        {formatLeaveSpan(leave)}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-[12px] text-muted-foreground max-w-[180px] truncate italic">"{leave.reason}"</DataTableCell>
                    <DataTableCell>
                      <Badge variant="outline" className={statusBadgeClass(leave.status)}>{STATUS_LABEL[leave.status] || leave.status}</Badge>
                    </DataTableCell>
                    <DataTableCell isLast>
                      <div className="flex justify-end items-center gap-1">
                        {leave.status === "pending" && canEdit && (
                          <>
                            <ActionButton variant="approve" tooltip="Approve" aria-label="Approve" disabled={busyIds.includes(leave._id)} onClick={() => handleStatus(leave._id, "approved")} />
                            <ActionButton variant="reject" tooltip="Reject" aria-label="Reject" disabled={busyIds.includes(leave._id)} onClick={() => handleStatus(leave._id, "rejected")} />
                          </>
                        )}
                        {canDelete && (
                          <ActionButton variant="delete" tooltip="Delete" aria-label="Delete" icon={Trash2} onClick={() => setDeleteTarget(leave)} />
                        )}
                        <ActionButton variant="view" tooltip="View full details" aria-label="Details" icon={ChevronRight} onClick={() => openDetails(leave)} />
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {!showError && !showSkeleton && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalRecords={filtered.length} />
      )}

      {/* Right Side Details Drawer */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className={cn("sm:max-w-md w-full p-0 border-l border-border/40", BIG_CLOSE)}>
          {selectedLeave && (
            <div className="h-full flex flex-col">
              <SheetHeader className="p-6 pb-0 text-left">
                <div className="flex items-center justify-between gap-3 mb-4 pr-10">
                  <Badge variant="outline" className={statusBadgeClass(selectedLeave.status)}>{STATUS_LABEL[selectedLeave.status] || selectedLeave.status}</Badge>
                  <div className="text-[12px] text-muted-foreground font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Applied {fmtDay(selectedLeave.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-6 min-w-0">
                  <Avatar className="h-14 w-14 ring-4 ring-primary/5 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-black">
                      {initials(selectedLeave.employeeId?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="text-xl font-black tracking-tight break-words">{selectedLeave.employeeId?.name || "Unknown employee"}</SheetTitle>
                    <SheetDescription className="text-sm font-medium break-all">{selectedLeave.employeeId?.phone || selectedLeave.employeeId?.email || ""}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-10">
                <Card className="p-4 bg-muted/20 border-border/40 rounded-2xl shadow-none">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">Leave Type</span>
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        {getLeaveIcon(selectedLeave.leaveTypeId?.leaveName || "")}
                        <span className="break-words">{selectedLeave.leaveTypeId?.leaveName || "Leave type deleted"}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">Duration</span>
                      <div className="font-bold text-primary flex items-center gap-1">
                        <Calendar className="h-4 w-4" /> {formatLeaveDuration(selectedLeave)}
                      </div>
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">Dates</span>
                      <div data-leave-dates className="font-bold text-foreground text-[14px]">{formatLeaveSpan(selectedLeave)}</div>
                    </div>
                    <div className="sm:col-span-2 pt-2 border-t border-border/40 mt-2">
                      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">Reason</span>
                      <p className="text-[13px] text-foreground leading-relaxed mt-1 font-medium italic break-words [overflow-wrap:anywhere]">"{selectedLeave.reason}"</p>
                    </div>
                  </div>
                </Card>

                <LeaveBalanceNote
                  employeeId={selectedLeave.employeeId?._id}
                  leaveTypeId={selectedLeave.leaveTypeId?._id}
                  requestDays={selectedLeave.status === "pending" ? selectedLeave.duration : undefined}
                />

                <div className="space-y-4">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 flex items-center gap-2">
                    <HistoryIcon className="h-3.5 w-3.5" /> Request History
                  </h4>
                  <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                    <div className="flex gap-4 relative pl-8">
                      <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5 gap-2">
                          <span className="text-[13px] font-bold text-foreground">Request Applied</span>
                          <span className="text-[12px] font-medium text-muted-foreground">{fmtDay(selectedLeave.createdAt)}</span>
                        </div>
                        <div className="text-[12px] text-muted-foreground">By {selectedLeave.employeeId?.name || "Unknown employee"}</div>
                      </div>
                    </div>
                    {selectedLeave.status !== "pending" && (
                      <div className="flex gap-4 relative pl-8">
                        <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5 gap-2">
                            <span className="text-[13px] font-bold text-foreground">{STATUS_LABEL[selectedLeave.status] || selectedLeave.status}</span>
                            {selectedLeave.updatedAt && <span className="text-[12px] font-medium text-muted-foreground">{fmtDay(selectedLeave.updatedAt)}</span>}
                          </div>
                          {selectedLeave.adminRemark && (
                            <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 text-[12px] break-words [overflow-wrap:anywhere]">
                              {selectedLeave.status === "rejected" && <span className="font-bold not-italic">Reason: </span>}
                              <span className="italic">"{selectedLeave.adminRemark}"</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedLeave.status === "pending" && canEdit && (
                <div className="p-6 border-t border-border/40 bg-white/50 backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-3">
                    <ActionButton variant="approve" showLabel label="Approve" disabled={busyIds.includes(selectedLeave._id)} onClick={() => handleStatus(selectedLeave._id, "approved")} className="bg-emerald-500 text-white border-none h-12 shadow-lg shadow-emerald-500/20" />
                    <ActionButton variant="reject" showLabel label="Reject" disabled={busyIds.includes(selectedLeave._id)} onClick={() => handleStatus(selectedLeave._id, "rejected")} className="bg-destructive text-white border-none h-12 shadow-lg shadow-destructive/20" />
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* HR Apply Dialog */}
      <Dialog open={hrApplyOpen} onOpenChange={setHrApplyOpen}>
        <DialogContent className={cn("max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col", BIG_CLOSE)}>
          <div className="h-2 w-full bg-primary shrink-0" />
          <div className="p-5 sm:p-6 flex-1 flex flex-col min-h-0">
            <DialogHeader className="mb-5 shrink-0 text-left pr-8">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <UserPlus className="h-6 w-6" />
              </div>
              <DialogTitle className="text-xl font-black">Apply on Behalf</DialogTitle>
              <DialogDescription className="font-medium text-[13px]">
                Add a leave request for an employee. Weekly offs and holidays are not counted.
              </DialogDescription>
            </DialogHeader>

            <form className="flex-1 flex flex-col min-h-0" onSubmit={handleHrApplySubmit} noValidate>
              <div className="space-y-5 flex-1 overflow-y-auto min-h-0 px-0.5">
              <div className="space-y-2">
                <label className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Employee</label>
                <Select value={hrFormEmployeeId} onValueChange={(v) => { setHrFormEmployeeId(v); setHrErrors((p) => ({ ...p, employee: "" })); }}>
                  <SelectTrigger aria-label="Employee" className="h-12 rounded-xl">
                    <SelectValue placeholder="Choose an employee" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-[50vh]">
                    {dbEmployees.map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("employee")}
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Leave Type</label>
                <Select value={hrFormLeaveTypeId} onValueChange={(v) => { setHrFormLeaveTypeId(v); setHrErrors((p) => ({ ...p, type: "" })); }}>
                  <SelectTrigger aria-label="Leave type" className="h-12 rounded-xl">
                    <SelectValue placeholder="Choose a leave type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {leaveTypes.map((type) => (
                      <SelectItem key={type._id} value={type._id}>{type.leaveName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("type")}
                <LeaveBalanceNote employeeId={hrFormEmployeeId || undefined} leaveTypeId={hrFormLeaveTypeId || undefined} />
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Duration</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted">
                  {([
                    { key: "half", label: "Half Day" },
                    { key: "single", label: "One Day" },
                    { key: "range", label: "Date Range" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={hrFormMode === opt.key}
                      onClick={() => setHrFormMode(opt.key)}
                      className={cn(
                        "h-10 rounded-lg text-[13px] font-bold transition-all",
                        hrFormMode === opt.key
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {hrFormMode === "half" && (
                <div className="space-y-2">
                  <label className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Which Half</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted">
                    {([
                      { key: "first_half", label: "First Half" },
                      { key: "second_half", label: "Second Half" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        aria-pressed={hrFormHalfPortion === opt.key}
                        onClick={() => setHrFormHalfPortion(opt.key)}
                        className={cn(
                          "h-10 rounded-lg text-[13px] font-bold transition-all",
                          hrFormHalfPortion === opt.key
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={cn("gap-3", hrFormMode === "range" ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-1")}>
                <div className="space-y-2 min-w-0">
                  <label htmlFor="hr-start" className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">
                    {hrFormMode === "range" ? "First Day" : "Date"}
                  </label>
                  <FormInput
                    id="hr-start"
                    type="date"
                    className="h-12 rounded-xl"
                    value={hrFormStartDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHrFormStartDate(v);
                      if (hrFormEndDate && v && hrFormEndDate < v) setHrFormEndDate(v);
                      setHrErrors((p) => ({ ...p, start: "" }));
                    }}
                  />
                  {fieldError("start")}
                </div>
                {hrFormMode === "range" && (
                  <div className="space-y-2 min-w-0">
                    <label htmlFor="hr-end" className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Last Day</label>
                    <FormInput
                      id="hr-end"
                      type="date"
                      min={hrFormStartDate || undefined}
                      className="h-12 rounded-xl"
                      value={hrFormEndDate}
                      onChange={(e) => { setHrFormEndDate(e.target.value); setHrErrors((p) => ({ ...p, end: "" })); }}
                    />
                    {fieldError("end")}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="hr-reason" className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Reason</label>
                <FormInput
                  id="hr-reason"
                  placeholder="Example: Family function"
                  className="h-12 rounded-xl"
                  maxLength={MAX_REASON_LENGTH}
                  value={hrFormReason}
                  onChange={(e) => { setHrFormReason(e.target.value); setHrErrors((p) => ({ ...p, reason: "" })); }}
                />
                {fieldError("reason")}
              </div>
              </div>

              <DialogFooter className="pt-4 gap-3 shrink-0 flex-row">
                <Button type="button" variant="ghost" onClick={() => setHrApplyOpen(false)} className="rounded-xl h-12 flex-1 font-bold">Cancel</Button>
                <ActionButton variant="add" type="submit" showLabel label={isCreating ? "Sending..." : "Submit"} icon={Check} disabled={isCreating} className="flex-1 h-12 shadow-lg shadow-primary/20" />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation, with an optional reason the employee will see.
          A Radix Dialog rather than CenterModal: it can open on top of the
          details drawer, which blocks pointer events outside its own layers. */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v && !isRejecting) setRejectTarget(null); }}>
        <DialogContent className={cn("max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl p-0 overflow-hidden gap-0", BIG_CLOSE)}>
          <div className="p-6 pb-4 space-y-4">
            <DialogHeader className="text-left pr-8 space-y-1.5">
              <DialogTitle className="text-lg font-black tracking-tight">
                {rejectTarget && rejectTarget.ids.length > 1
                  ? `Reject ${rejectTarget.ids.length} leave requests?`
                  : "Reject this leave request?"}
              </DialogTitle>
              <DialogDescription className="text-[13px] font-medium">
                {rejectTarget?.leave
                  ? `${rejectTarget.leave.employeeId?.name || "Employee"} · ${rejectTarget.leave.leaveTypeId?.leaveName || "Leave"}: ${formatLeaveSpan(rejectTarget.leave)}`
                  : "The same reason will be sent with every selected request."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason" className="text-[12px] font-bold">Reason (optional)</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                maxLength={MAX_REJECT_REASON_LENGTH}
                onChange={(e) => setRejectReason(e.target.value.slice(0, MAX_REJECT_REASON_LENGTH))}
                placeholder="Example: Too many people are already on leave that week."
                className="min-h-[96px] rounded-xl text-[14px]"
              />
              <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                <span>The employee will see this reason.</span>
                <span className="shrink-0 tabular-nums">{rejectReason.length}/{MAX_REJECT_REASON_LENGTH}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 flex-row gap-3 sm:gap-3">
            <Button type="button" variant="ghost" onClick={() => setRejectTarget(null)} disabled={isRejecting} className="rounded-xl h-11 flex-1 font-bold">
              Cancel
            </Button>
            <Button type="button" onClick={confirmReject} disabled={isRejecting} className="flex-1 h-11 bg-destructive text-white hover:bg-destructive/90 rounded-xl font-black shadow-lg shadow-destructive/20 disabled:opacity-60">
              {isRejecting ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v && !isDeleting) setDeleteTarget(null); }}>
        <DialogContent className={cn("max-w-[calc(100vw-1.5rem)] sm:max-w-sm rounded-2xl p-0 overflow-hidden", BIG_CLOSE)}>
          <div className="bg-destructive/10 p-6 pr-12 flex items-center gap-4 border-b border-destructive/20">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-destructive text-white flex items-center justify-center shadow-lg">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight">Delete this leave request?</DialogTitle>
              <DialogDescription className="text-foreground/80 font-medium text-[13px] mt-1">
                {deleteTarget?.status === "approved"
                  ? "It is removed for good, and the employee's salary for those days is recalculated without it."
                  : "It is removed for good. Use this only for a request added by mistake."}
              </DialogDescription>
            </div>
          </div>
          <DialogFooter className="p-6 gap-3 flex-row">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="rounded-xl h-11 flex-1 font-bold">Cancel</Button>
            <Button onClick={handleDelete} disabled={isDeleting} className="flex-1 h-11 bg-destructive text-white hover:bg-destructive/90 rounded-xl font-black shadow-lg shadow-destructive/20 disabled:opacity-60">
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
