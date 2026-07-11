import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Check,
  X,
  Calendar,
  UserPlus,
  FileText,
  History as HistoryIcon,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
  Mail,
  Bell,
  Save,
  Undo2,
  FileDown,
  CalendarDays,
  CheckCircle2,
  Clock,
  Plane,
  HeartPulse,
  Search,
  Layers,
  Trash2,
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
import { useTicketService, type Ticket } from "@/services/ticket-service";
import { useEmployeeService } from "@/services/employee-service";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { parseTicketReason } from "@/lib/leave-ticket-parser";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FormInput } from "@/components/shared/form-input";
import { ViewToggle } from "@/components/shared/view-toggle";
import { GridCard } from "@/components/shared/grid-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

type LeaveStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "partial"
  | "counter-offer"
  | "revoked"
  | "declined";
type LeaveType = string;

interface LeaveHistory {
  date: string;
  action: string;
  by: string;
  note?: string;
}

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  approvedDays?: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  balance?: {
    total: number;
    used: number;
    remaining: number;
  };
  history?: LeaveHistory[];
  hasOverlap?: boolean;
  isLongDuration?: boolean;
  lowBalance?: boolean;
  isHalfDay?: boolean;
  halfDayType?: "morning" | "afternoon";
}

function calcDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1;
  const diff =
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

function ticketToLeaveRequest(ticket: Ticket): LeaveRequest {
  const parsed = parseTicketReason(ticket.reason);
  const empId =
    parsed.onBehalfId ||
    (ticket.employeeId && typeof ticket.employeeId === "object"
      ? ticket.employeeId._id
      : (ticket.employeeId as string) || "Unknown");
  const empName =
    parsed.onBehalfName ||
    (ticket.employeeId && typeof ticket.employeeId === "object"
      ? ticket.employeeId.name
      : "Unknown");

  return {
    id: ticket._id,
    employeeId: empId,
    employeeName: empName,
    type: parsed.type,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    days: calcDays(parsed.startDate, parsed.endDate),
    reason: parsed.note,
    status: ticket.status as LeaveStatus,
    appliedOn: ticket.createdAt ? ticket.createdAt.split("T")[0] : "",
    isHalfDay: parsed.isHalfDay,
  };
}

function getLeaveIcon(type: LeaveType) {
  const norm = type.toLowerCase();
  if (norm.includes("sick")) {
    return <HeartPulse className="h-4 w-4" />;
  }
  if (norm.includes("annual") || norm.includes("vacation") || norm.includes("plane")) {
    return <Plane className="h-4 w-4" />;
  }
  return <CalendarDays className="h-4 w-4" />;
}

function LeavesPage() {
  const { tickets, updateTicketStatus, createTicket, deleteTicket, isCreating, isDeleting } =
    useTicketService();
  const { can } = usePermission();
  const canCreate = can("leaves", "create");
  const canEdit = can("leaves", "edit");
  const canDelete = can("leaves", "delete");
  const { employees: dbEmployees } = useEmployeeService({ limit: 100, status: "active" });
  const { leaveTypes: dbLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } = useLeaveTypeService();

  const mergedLeaveTypes = dbLeaveTypes;

  const leaves = useMemo(() => {
    return tickets
      .filter((t) => t.type === "Leave")
      .map((ticket) => {
        const req = ticketToLeaveRequest(ticket);
        
        // Find matching leave type in mergedLeaveTypes to get totalDays
        const leaveTypeName = req.type;
        const matchedType = mergedLeaveTypes.find(
          (t) =>
            t.leaveName.toLowerCase() === leaveTypeName.toLowerCase() ||
            t.code?.toLowerCase() === leaveTypeName.toLowerCase() ||
            t.leaveName.toLowerCase().startsWith(leaveTypeName.toLowerCase()) ||
            leaveTypeName.toLowerCase().startsWith(t.leaveName.toLowerCase())
        );
        
        const totalDays = matchedType ? matchedType.totalDays : 10;
        
        // Calculate used days for this employee & this leave type
        let used = 0;
        tickets.forEach((t) => {
          if (t.type !== "Leave") return;
          if (t.status !== "approved" && t.status !== "pending") return;
          
          const parsedT = parseTicketReason(t.reason);
          const tEmpId =
            parsedT.onBehalfId ||
            (t.employeeId && typeof t.employeeId === "object"
              ? t.employeeId._id
              : (t.employeeId as string) || "Unknown");
          
          if (tEmpId !== req.employeeId) return;
          
          const isSameType =
            parsedT.type.toLowerCase() === leaveTypeName.toLowerCase() ||
            parsedT.type.toLowerCase().includes(leaveTypeName.toLowerCase()) ||
            leaveTypeName.toLowerCase().includes(parsedT.type.toLowerCase());
          
          if (isSameType) {
            const tDays = calcDays(parsedT.startDate, parsedT.endDate);
            const actualDays = parsedT.isHalfDay ? tDays * 0.5 : tDays;
            used += actualDays;
          }
        });
        
        const remaining = Math.max(0, totalDays - used);
        
        req.balance = {
          total: totalDays,
          used: used,
          remaining: remaining,
        };
        
        req.lowBalance = remaining < 2;
        
        return req;
      });
  }, [tickets, mergedLeaveTypes]);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "partial" | "counter-offer"
  >("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const filtered = useMemo(() => {
    return leaves.filter((l) => {
      const matchesFilter = filter === "all" || l.status === filter;
      const matchesSearch = !search || l.employeeName.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeFilter === "all" ||
        l.type.toLowerCase() === typeFilter.toLowerCase() ||
        l.type.toLowerCase().includes(typeFilter.toLowerCase()) ||
        typeFilter.toLowerCase().includes(l.type.toLowerCase());

      return matchesFilter && matchesSearch && matchesType;
    });
  }, [leaves, filter, search, typeFilter]);

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((l) => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    const status = action === "approve" ? "approved" : "rejected";
    await Promise.all(selectedIds.map((id) => updateTicketStatus({ id, status }).catch(() => {})));
    toast.success(`Bulk ${action}d ${selectedIds.length} requests`);
    setSelectedIds([]);
  };

  const handleExport = (format: "csv" | "pdf") => {
    toast.info(`Exporting ${filtered.length} records as ${format.toUpperCase()}...`);
  };

  const [partialOpen, setPartialOpen] = useState(false);
  const [hrApplyOpen, setHrApplyOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [partialDays, setPartialDays] = useState([1]);
  const [adminNote, setAdminNote] = useState("");
  const [counterDates, setCounterDates] = useState({ start: "", end: "" });
  const [leaveTypeOpen, setLeaveTypeOpen] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState({ name: "", limit: 0, paid: true });
  const [editingType, setEditingType] = useState<string | null>(null);

  // States for HR Apply on Behalf form
  const [hrFormEmployeeId, setHrFormEmployeeId] = useState("");
  const [hrFormLeaveType, setHrFormLeaveType] = useState("");
  const [hrFormStartDate, setHrFormStartDate] = useState("");
  const [hrFormEndDate, setHrFormEndDate] = useState("");
  const [hrFormReason, setHrFormReason] = useState("");
  const [hrFormDuration, setHrFormDuration] = useState(1);

  useEffect(() => {
    if (hrFormStartDate && hrFormEndDate) {
      const days = calcDays(hrFormStartDate, hrFormEndDate);
      setHrFormDuration(days);
    }
  }, [hrFormStartDate, hrFormEndDate]);

  const handleCreateLeaveType = async () => {
    const code = newLeaveType.name.toLowerCase().replace(/\s+/g, "-");
    await createLeaveType({
      leaveName: newLeaveType.name,
      code: code,
      totalDays: newLeaveType.limit,
      colorCode: "#6366f1",
      iconStyle: "CalendarDays"
    });
    setNewLeaveType({ name: "", limit: 0, paid: true });
  };

  const handleUpdateLeaveType = async () => {
    if (!editingType) return;
    await updateLeaveType({
      id: editingType,
      leaveName: newLeaveType.name,
      totalDays: newLeaveType.limit,
      code: newLeaveType.name.toLowerCase().replace(/\s+/g, "-"),
      colorCode: "#6366f1",
      iconStyle: "CalendarDays"
    });
    setEditingType(null);
    setNewLeaveType({ name: "", limit: 0, paid: true });
  };

  const handleDeleteLeaveType = async (id: string) => {
    await deleteLeaveType(id);
  };

  const handleHrApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrFormEmployeeId || !hrFormLeaveType || !hrFormStartDate || !hrFormEndDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const selectedEmployee = dbEmployees.find((emp) => emp._id === hrFormEmployeeId);
    const empName = selectedEmployee ? selectedEmployee.name : "Unknown";

    const payload = {
      employeeId: hrFormEmployeeId,
      type: "Leave",
      reason: `Leave: ${hrFormLeaveType} | ${hrFormStartDate} to ${hrFormEndDate} | Note: ${hrFormReason} | Duration: full | OnBehalfName: ${empName} | OnBehalfId: ${hrFormEmployeeId}`,
    };
    try {
      await createTicket(payload);
      setHrApplyOpen(false);
      // Reset form
      setHrFormEmployeeId("");
      setHrFormLeaveType("");
      setHrFormStartDate("");
      setHrFormEndDate("");
      setHrFormReason("");
      setHrFormDuration(1);
    } catch (err) {
      // toast error is already shown by ticketService
    }
  };

  const handleStatus = async (id: string, status: LeaveStatus) => {
    await updateTicketStatus({ id, status }).catch(() => {});
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteTicket(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch {
      toast.error("Failed to delete entry");
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Leave Management"
          description="Review and manage employee time-off requests, vacations, and sick leaves."
          actions={
            <div className="flex gap-2">
              {canCreate && (
                <ActionButton
                  variant="add"
                  showLabel
                  label="Add Leave Type"
                  icon={Layers}
                  onClick={() => setLeaveTypeOpen(true)}
                  className="bg-white text-primary border-primary/20 hover:bg-primary/5 shadow-sm"
                />
              )}
              {canCreate && (
                <ActionButton
                  variant="add"
                  showLabel
                  label="New Request"
                  icon={UserPlus}
                  onClick={() => setHrApplyOpen(true)}
                />
              )}
              <div className="flex bg-muted/40 p-1 rounded-xl border border-border/40">
                <ActionButton
                  variant="download"
                  icon={FileText}
                  tooltip="Export CSV"
                  onClick={() => handleExport("csv")}
                  className="h-8 w-8"
                />
                <ActionButton
                  variant="download"
                  icon={FileDown}
                  tooltip="Export PDF"
                  onClick={() => handleExport("pdf")}
                  className="h-8 w-8"
                />
              </div>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Pending Requests"
            value={pendingCount}
            icon={Clock}
            accent="warning"
            delay={0}
          />
          <StatCard
            label="Approved Leaves"
            value={approvedCount}
            icon={CheckCircle2}
            accent="success"
            delay={0.05}
          />
          <StatCard
            label="Total Requests"
            value={leaves.length}
            icon={CalendarDays}
            accent="primary"
            delay={0.1}
          />
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <ViewToggle view={view} onViewChange={updateDefaultLayout} />

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={filter}
                onValueChange={(v) =>
                  setFilter(
                    v as "all" | "pending" | "approved" | "rejected" | "partial" | "counter-offer",
                  )
                }
              >
                <SelectTrigger className="w-full md:w-[150px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      filter === "approved"
                        ? "bg-success"
                        : filter === "pending"
                          ? "bg-warning"
                          : filter === "rejected"
                            ? "bg-destructive"
                            : filter === "partial"
                              ? "bg-info"
                              : filter === "counter-offer"
                                ? "bg-purple-500"
                                : "bg-primary",
                    )}
                  />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="partial">Partial Approval</SelectItem>
                  <SelectItem value="counter-offer">Counter-offer</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[150px] h-10 border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                  <Layers className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Leave Type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60">
                  <SelectItem value="all">All Types</SelectItem>
                  {mergedLeaveTypes.map((type) => (
                    <SelectItem key={type._id} value={type.leaveName}>
                      {type.leaveName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <FormInput
            placeholder="Search employees..."
            icon={Search}
            className="h-10 w-full md:w-[260px] shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
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
                <span className="text-[13px] font-black tracking-tight text-primary uppercase">
                  Selected
                </span>
              </div>

              <div className="h-6 w-px bg-border/60 mx-1" />

              <div className="flex items-center gap-1.5 p-1">
                {canEdit && (
                  <ActionButton
                    variant="approve"
                    showLabel
                    label="Approve All"
                    icon={Check}
                    onClick={() => handleBulkAction("approve")}
                    className="h-11 px-6 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-none text-[13px] font-black"
                  />
                )}
                {canEdit && (
                  <ActionButton
                    variant="reject"
                    showLabel
                    label="Reject All"
                    icon={X}
                    onClick={() => handleBulkAction("reject")}
                    className="h-11 px-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 border-none text-[13px] font-black"
                  />
                )}
                <Button
                  variant="ghost"
                  onClick={() => setSelectedIds([])}
                  className="h-11 px-6 rounded-full font-bold text-muted-foreground hover:bg-muted/50 transition-all active:scale-95 text-[13px]"
                >
                  <X className="h-4 w-4 mr-2" />
                  Deselect
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((leave, idx) => (
                <GridCard
                  key={leave.id}
                  title={leave.employeeName}
                  subtitle={`Applied ${leave.appliedOn}`}
                  delay={idx * 0.05}
                  icon={
                    <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                      {leave.employeeName
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                  }
                  statusNode={
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] font-bold px-2 py-0 border-transparent rounded-full",
                          leave.status === "approved"
                            ? "bg-success/10 text-success"
                            : leave.status === "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : leave.status === "partial"
                                ? "bg-info/10 text-info"
                                : leave.status === "counter-offer"
                                  ? "bg-purple-500/10 text-purple-600"
                                  : "bg-warning/15 text-warning-foreground",
                        )}
                      >
                        {leave.status}
                      </Badge>
                    </div>
                  }
                  metaLeft={{ icon: Layers, label: leave.type }}
                  metaRight={{ icon: Calendar, label: `${leave.days} Days` }}
                >
                  <div className="relative">
                    {/* Smart Warnings */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {leave.hasOverlap && (
                        <Badge
                          variant="outline"
                          className="bg-destructive/5 text-destructive border-destructive/20 text-[9px] gap-1 py-0 px-1.5 font-bold"
                        >
                          <AlertTriangle className="h-3 w-3" /> Team Overlap
                        </Badge>
                      )}
                      {leave.lowBalance && (
                        <Badge
                          variant="outline"
                          className="bg-warning/5 text-warning-foreground border-warning/20 text-[9px] gap-1 py-0 px-1.5 font-bold"
                        >
                          <AlertCircle className="h-3 w-3" /> Low Balance
                        </Badge>
                      )}
                      {leave.isLongDuration && (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/5 text-amber-600 border-amber-200 text-[9px] gap-1 py-0 px-1.5 font-bold"
                        >
                          <Info className="h-3 w-3" /> Long Stay
                        </Badge>
                      )}
                    </div>

                    <div className="text-[12px] text-muted-foreground/80 line-clamp-2 italic mt-1 mb-3">
                      "{leave.reason}"
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/40">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                        <Clock className="h-3 w-3" />
                        {leave.startDate} — {leave.endDate}
                      </div>
                      <div className="flex items-center gap-1">
                        {leave.status === "pending" && canEdit && (
                          <>
                            <ActionButton
                              variant="approve"
                              tooltip="Approve"
                              onClick={() => handleStatus(leave.id, "approved")}
                              className="h-7 w-7"
                            />
                            <ActionButton
                              variant="comment"
                              tooltip="Partial Approval"
                              icon={Undo2}
                              onClick={() => {
                                setSelectedLeave(leave);
                                setPartialOpen(true);
                                setPartialDays([Math.min(leave.days, 1)]);
                              }}
                              className="h-7 w-7"
                            />
                            <ActionButton
                              variant="reject"
                              tooltip="Reject"
                              onClick={() => handleStatus(leave.id, "rejected")}
                              className="h-7 w-7"
                            />
                          </>
                        )}
                        {canDelete && (
                          <ActionButton
                            variant="delete"
                            tooltip="Delete Entry"
                            icon={Trash2}
                            onClick={() => setDeleteConfirmId(leave.id)}
                            className="h-7 w-7"
                          />
                        )}
                        <ActionButton
                          variant="view"
                          tooltip="Details"
                          icon={ChevronRight}
                          onClick={() => {
                            setSelectedLeave(leave);
                            setDetailsOpen(true);
                          }}
                          className="h-7 w-7"
                        />
                      </div>
                    </div>
                  </div>
                </GridCard>
              ))}
            </div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DataTable
                headers={[
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.length === filtered.length}
                      onCheckedChange={toggleSelectAll}
                      className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary"
                    />
                    Employee
                  </div>,
                  "Type",
                  "Duration",
                  "Reason",
                  "Status",
                  "Actions",
                ]}
                isEmpty={filtered.length === 0}
                emptyMessage={`No ${filter !== "all" ? filter : ""} leave requests found.`}
                className="shadow-sm"
              >
                {filtered.map((leave, i) => (
                  <DataTableRow
                    key={leave.id}
                    className={cn(selectedIds.includes(leave.id) && "bg-primary/3")}
                  >
                    <DataTableCell isFirst>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedIds.includes(leave.id)}
                          onCheckedChange={() => toggleSelect(leave.id)}
                          className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary"
                        />
                        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                          <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                            {leave.employeeName
                              .split(" ")
                              .map((s) => s[0])
                              .slice(0, 2)
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-[13px] font-bold text-foreground leading-tight">
                            {leave.employeeName}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {leave.employeeEmail || "Applied " + leave.appliedOn}
                          </div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center text-primary/70">
                          {getLeaveIcon(leave.type)}
                        </div>
                        <span className="text-[12px] capitalize font-semibold text-foreground/80">
                          {leave.type}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-[13px] font-bold text-primary">
                            {leave.days} Day{leave.days > 1 ? "s" : ""}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-medium">
                            {leave.startDate} to {leave.endDate}
                          </div>
                        </div>
                        {/* Inline Warning Icons */}
                        <div className="flex flex-col gap-0.5">
                          {leave.hasOverlap && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>Team Overlap</TooltipContent>
                            </Tooltip>
                          )}
                          {leave.lowBalance && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-3 w-3 text-warning-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>Low Balance</TooltipContent>
                            </Tooltip>
                          )}
                          {leave.isLongDuration && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>Long Stay</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-[12px] text-muted-foreground max-w-[180px] truncate italic">
                      "{leave.reason}"
                    </DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] font-bold px-2.5 py-0.5 border-transparent rounded-full",
                          leave.status === "approved"
                            ? "bg-success/10 text-success"
                            : leave.status === "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : leave.status === "partial"
                                ? "bg-info/10 text-info"
                                : leave.status === "counter-offer"
                                  ? "bg-purple-500/10 text-purple-600"
                                  : "bg-warning/15 text-warning-foreground",
                        )}
                      >
                        {leave.status}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell isLast>
                      <div className="flex justify-end items-center gap-1">
                        {leave.status === "pending" ? (
                          canEdit && (
                          <>
                            <ActionButton
                              variant="approve"
                              tooltip="Approve"
                              onClick={() => handleStatus(leave.id, "approved")}
                            />
                            <ActionButton
                              variant="comment"
                              tooltip="Partial Approval"
                              icon={Undo2}
                              onClick={() => {
                                setSelectedLeave(leave);
                                setPartialOpen(true);
                                setPartialDays([Math.min(leave.days, 1)]);
                              }}
                            />
                            <ActionButton
                              variant="reject"
                              tooltip="Reject"
                              onClick={() => handleStatus(leave.id, "rejected")}
                            />
                          </>
                          )
                        ) : (
                          <>
                            {leave.status === "approved" && canEdit && (
                              <ActionButton
                                variant="revoke"
                                tooltip="Revoke Approval"
                                icon={Undo2}
                                onClick={() => handleStatus(leave.id, "revoked")}
                              />
                            )}
                            {leave.status === "rejected" && canEdit && (
                              <ActionButton
                                variant="reopen"
                                tooltip="Re-open Case"
                                icon={RotateCcw}
                                onClick={() => handleStatus(leave.id, "pending")}
                              />
                            )}
                          </>
                        )}
                        {canDelete && (
                          <ActionButton
                            variant="delete"
                            tooltip="Delete Entry"
                            icon={Trash2}
                            onClick={() => setDeleteConfirmId(leave.id)}
                          />
                        )}
                        <ActionButton
                          variant="view"
                          tooltip="View Full Details"
                          icon={ChevronRight}
                          onClick={() => {
                            setSelectedLeave(leave);
                            setDetailsOpen(true);
                          }}
                        />
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Side Details Drawer */}
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent className="sm:max-w-md w-full p-0 border-l border-border/40">
            {selectedLeave && (
              <div className="h-full flex flex-col">
                <SheetHeader className="p-6 pb-0">
                  <div className="flex items-center justify-between mb-4">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-black px-3 py-1 rounded-full border-transparent",
                        selectedLeave.status === "approved"
                          ? "bg-success/10 text-success"
                          : selectedLeave.status === "rejected"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/15 text-warning-foreground",
                      )}
                    >
                      {selectedLeave.status}
                    </Badge>
                    <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Applied {selectedLeave.appliedOn}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-14 w-14 ring-4 ring-primary/5">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-black">
                        {selectedLeave.employeeName
                          .split(" ")
                          .map((s) => s[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <SheetTitle className="text-xl font-black tracking-tight">
                        {selectedLeave.employeeName}
                      </SheetTitle>
                      <SheetDescription className="text-sm font-medium">
                        {selectedLeave.employeeEmail || "Employee ID: " + selectedLeave.employeeId}
                      </SheetDescription>
                    </div>
                  </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 space-y-8 pb-10">
                  {/* Leave Details Card */}
                  <Card className="p-4 bg-muted/20 border-border/40 rounded-2xl shadow-none">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Leave Type
                        </span>
                        <div className="flex items-center gap-2 font-bold text-foreground">
                          {getLeaveIcon(selectedLeave.type)}
                          <span className="capitalize">{selectedLeave.type}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Duration
                        </span>
                        <div className="font-bold text-primary flex items-center gap-1">
                          <Calendar className="h-4 w-4" /> {selectedLeave.days} Days
                        </div>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-border/40 mt-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Reason
                        </span>
                        <p className="text-[13px] text-foreground leading-relaxed mt-1 font-medium italic">
                          "{selectedLeave.reason}"
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* Balance Section */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5" /> Current Balance
                    </h4>
                    {selectedLeave.balance ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold">
                            {selectedLeave.type.toUpperCase()} LEAVE
                          </span>
                          <span className="font-black text-primary">
                            {selectedLeave.balance.remaining} / {selectedLeave.balance.total} Left
                          </span>
                        </div>
                        <Progress
                          value={
                            (selectedLeave.balance.remaining / selectedLeave.balance.total) * 100
                          }
                          className="h-2 rounded-full bg-muted shadow-inner"
                        />
                        <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                          <span>Used: {selectedLeave.balance.used} days</span>
                          <span>Total: {selectedLeave.balance.total} days</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-muted/30 border border-dashed text-center text-xs text-muted-foreground">
                        Balance information not available
                      </div>
                    )}
                  </div>

                  {/* History Timeline */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                      <HistoryIcon className="h-3.5 w-3.5" /> Request History
                    </h4>
                    <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                      {(
                        selectedLeave.history || [
                          {
                            date: selectedLeave.appliedOn,
                            action: "Request Applied",
                            by: selectedLeave.employeeName,
                          },
                        ]
                      ).map((item, i) => (
                        <div key={i} className="flex gap-4 relative pl-8">
                          <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm">
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[12.5px] font-bold text-foreground">
                                {item.action}
                              </span>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {item.date}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">By {item.by}</div>
                            {item.note && (
                              <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 text-[11px] italic">
                                "{item.note}"
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-6 border-t border-border/40 bg-white/50 backdrop-blur-md">
                  {selectedLeave.status === "pending" ? (
                    canEdit && (
                    <div className="grid grid-cols-2 gap-3">
                      <ActionButton
                        variant="approve"
                        showLabel
                        label="APPROVE"
                        onClick={() => {
                          handleStatus(selectedLeave.id, "approved");
                          setDetailsOpen(false);
                        }}
                        className="bg-emerald-500 text-white border-none h-12 shadow-lg shadow-emerald-500/20"
                      />
                      <ActionButton
                        variant="reject"
                        showLabel
                        label="REJECT"
                        onClick={() => {
                          handleStatus(selectedLeave.id, "rejected");
                          setDetailsOpen(false);
                        }}
                        className="bg-destructive text-white border-none h-12 shadow-lg shadow-destructive/20"
                      />
                      <ActionButton
                        variant="comment"
                        showLabel
                        label="Partial Approve"
                        icon={Undo2}
                        onClick={() => {
                          setPartialOpen(true);
                          setAdminNote("");
                        }}
                        className="flex-1 border-border/60 h-11"
                      />
                      <ActionButton
                        variant="history"
                        showLabel
                        label="Counter Offer"
                        icon={RotateCcw}
                        onClick={() => {
                          setCounterOpen(true);
                          setAdminNote("");
                          setCounterDates({
                            start: selectedLeave.startDate,
                            end: selectedLeave.endDate,
                          });
                        }}
                        className="flex-1 border-border/60 h-11"
                      />
                    </div>
                    )
                  ) : (
                    <div className="flex gap-3">
                      {selectedLeave.status === "approved" && canEdit && (
                        <ActionButton
                          variant="revoke"
                          showLabel
                          label="Revoke Approval"
                          icon={RotateCcw}
                          onClick={() => {
                            handleStatus(selectedLeave.id, "revoked");
                            setDetailsOpen(false);
                          }}
                          className="flex-1 h-12"
                        />
                      )}
                      {selectedLeave.status === "rejected" && canEdit && (
                        <ActionButton
                          variant="reopen"
                          showLabel
                          label="Re-open Case"
                          icon={Save}
                          onClick={() => {
                            handleStatus(selectedLeave.id, "pending");
                            setDetailsOpen(false);
                          }}
                          className="flex-1 h-12"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Partial Approval Dialog */}
        <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
          <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
            <div className="bg-info/10 p-6 flex items-center gap-4 border-b border-info/20">
              <div className="h-12 w-12 rounded-2xl bg-info text-white flex items-center justify-center shadow-lg">
                <Undo2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">
                  Partial Approval
                </DialogTitle>
                <DialogDescription className="text-info font-medium text-xs">
                  Approve a specific number of days
                </DialogDescription>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-foreground">Days to Approve</span>
                  <span className="text-xl font-black text-primary">{partialDays[0]} Days</span>
                </div>
                <Slider
                  value={partialDays}
                  max={selectedLeave?.days || 1}
                  min={0.5}
                  step={0.5}
                  onValueChange={setPartialDays}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                  <span>Min: 0.5 Day</span>
                  <span>Max: {selectedLeave?.days} Days</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                  Admin Remark (Optional)
                </label>
                <FormInput
                  placeholder="e.g. Approved 3 days due to project deadline..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                  <span className="text-muted-foreground">Notification Channel</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox defaultChecked className="h-3.5 w-3.5 rounded border-primary/30" />
                      <Mail className="h-3 w-3" />
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox defaultChecked className="h-3.5 w-3.5 rounded border-primary/30" />
                      <Bell className="h-3 w-3" />
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setPartialOpen(false)}
                  className="rounded-xl h-11 flex-1 font-bold"
                >
                  Cancel
                </Button>
                <ActionButton
                  variant="approve"
                  showLabel
                  label="CONFIRM PARTIAL"
                  onClick={() => {
                    if (selectedLeave) handleStatus(selectedLeave.id, "partial");
                    setPartialOpen(false);
                  }}
                  className="h-11 flex-1 bg-info text-white hover:bg-info/90 border-none shadow-lg shadow-info/20"
                />
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* HR Apply Dialog */}
        <Dialog open={hrApplyOpen} onOpenChange={setHrApplyOpen}>
          <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
            <div className="h-2 w-full bg-primary" />
            <div className="p-6">
              <DialogHeader className="mb-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <UserPlus className="h-6 w-6" />
                </div>
                <DialogTitle className="text-xl font-black">Apply on Behalf</DialogTitle>
                <DialogDescription className="font-medium text-xs">
                  HR Administrator creating a leave request for an employee
                </DialogDescription>
              </DialogHeader>

              <form
                className="space-y-5"
                onSubmit={handleHrApplySubmit}
              >
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                    Select Employee
                  </label>
                  <Select value={hrFormEmployeeId} onValueChange={setHrFormEmployeeId}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Search employee..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {dbEmployees.map((e) => (
                        <SelectItem key={e._id} value={e._id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                      Leave Type
                    </label>
                    <Select value={hrFormLeaveType} onValueChange={setHrFormLeaveType}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {mergedLeaveTypes.map((type) => (
                          <SelectItem key={type._id} value={type.leaveName}>
                            {type.leaveName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                      Duration
                    </label>
                    <FormInput
                      type="number"
                      placeholder="Days"
                      className="h-12 rounded-xl"
                      value={hrFormDuration}
                      onChange={(e) => setHrFormDuration(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                      Start Date
                    </label>
                    <FormInput
                      type="date"
                      className="h-12 rounded-xl"
                      value={hrFormStartDate}
                      onChange={(e) => setHrFormStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                      End Date
                    </label>
                    <FormInput
                      type="date"
                      className="h-12 rounded-xl"
                      value={hrFormEndDate}
                      onChange={(e) => setHrFormEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                    Reason / Note
                  </label>
                  <FormInput
                    placeholder="Official reason for application..."
                    className="h-12 rounded-xl"
                    value={hrFormReason}
                    onChange={(e) => setHrFormReason(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-4 gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setHrApplyOpen(false)}
                    className="rounded-xl h-12 flex-1 font-bold"
                  >
                    Discard
                  </Button>
                  <ActionButton
                    variant="add"
                    type="submit"
                    showLabel
                    label="SUBMIT REQUEST"
                    icon={Save}
                    disabled={isCreating}
                    className="flex-1 h-12 shadow-lg shadow-primary/20"
                  />
                </DialogFooter>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        {/* Counter-offer Dialog */}
        <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
          <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
            <div className="bg-purple-500/10 p-6 flex items-center gap-4 border-b border-purple-500/20">
              <div className="h-12 w-12 rounded-2xl bg-purple-500 text-white flex items-center justify-center shadow-lg">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">
                  Suggest Counter-offer
                </DialogTitle>
                <DialogDescription className="text-purple-600 font-medium text-xs">
                  Propose alternate dates to the employee
                </DialogDescription>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/40 mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Original Request
                </span>
                <div className="text-[13px] font-bold text-foreground mt-1">
                  {selectedLeave?.startDate} to {selectedLeave?.endDate} ({selectedLeave?.days}{" "}
                  Days)
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                    Suggested Start
                  </label>
                  <FormInput
                    type="date"
                    value={counterDates.start}
                    onChange={(e) => setCounterDates({ ...counterDates, start: e.target.value })}
                    className="h-12 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">
                    Suggested End
                  </label>
                  <FormInput
                    type="date"
                    value={counterDates.end}
                    onChange={(e) => setCounterDates({ ...counterDates, end: e.target.value })}
                    className="h-12 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                  Message to Employee
                </label>
                <FormInput
                  placeholder="e.g. Can you take leave a week earlier due to project launch?"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <DialogFooter className="gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setCounterOpen(false)}
                  className="rounded-xl h-11 flex-1 font-bold"
                >
                  Discard
                </Button>
                <ActionButton
                  variant="approve"
                  showLabel
                  label="SEND COUNTER"
                  icon={Save}
                  onClick={() => {
                    if (selectedLeave) handleStatus(selectedLeave.id, "counter-offer");
                    setCounterOpen(false);
                  }}
                  className="h-11 flex-1 bg-purple-600 text-white hover:bg-purple-700 border-none shadow-lg shadow-purple-500/20"
                />
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {/* Add Leave Type Dialog */}{" "}
      <Dialog open={leaveTypeOpen} onOpenChange={setLeaveTypeOpen}>
        <DialogContent className="max-w-2xl rounded-2xl p-0 border-none shadow-2xl bg-white/95 backdrop-blur-xl overflow-hidden">
          <div className="flex h-[550px]">
            {/* Form Side */}
            <div className="w-1/2 p-6 border-r border-border/40">
              <DialogHeader>
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center mb-2 shadow-inner">
                  <Layers className="h-5 w-5" />
                </div>
                <DialogTitle className="text-[18px] font-black tracking-tight">
                  {editingType ? "Edit Leave Type" : "Add New Leave Type"}
                </DialogTitle>
                <DialogDescription className="text-[13px] font-medium text-muted-foreground">
                  {editingType
                    ? "Update existing leave policy."
                    : "Define a new category of leave."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Type Name
                  </label>
                  <FormInput
                    placeholder="e.g. Marriage Leave"
                    value={newLeaveType.name}
                    onChange={(e) => setNewLeaveType({ ...newLeaveType, name: e.target.value })}
                    className="h-11 rounded-xl bg-muted/20 border-border/60 focus:bg-white transition-all shadow-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Annual Limit (Days)
                  </label>
                  <FormInput
                    type="number"
                    placeholder="0 for unlimited"
                    value={newLeaveType.limit}
                    onChange={(e) =>
                      setNewLeaveType({ ...newLeaveType, limit: parseInt(e.target.value) || 0 })
                    }
                    className="h-11 rounded-xl bg-muted/20 border-border/60 focus:bg-white transition-all shadow-sm"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-muted/20 rounded-xl border border-border/60">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold">Paid Leave</span>
                    <span className="text-[11px] text-muted-foreground">
                      Should this leave be paid?
                    </span>
                  </div>
                  <Checkbox
                    checked={newLeaveType.paid}
                    onCheckedChange={(checked) =>
                      setNewLeaveType({ ...newLeaveType, paid: !!checked })
                    }
                    className="h-5 w-5 rounded-md border-primary"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingType(null);
                      setNewLeaveType({ name: "", limit: 0, paid: true });
                    }}
                    className="rounded-xl h-11 flex-1 font-bold text-muted-foreground"
                  >
                    Clear
                  </Button>
                  <ActionButton
                    variant="add"
                    showLabel
                    label={editingType ? "Update" : "Create"}
                    icon={Check}
                    onClick={() => {
                      if (editingType) {
                        handleUpdateLeaveType();
                      } else {
                        handleCreateLeaveType();
                      }
                    }}
                    className="h-11 flex-[1.5] rounded-xl text-[14px] shadow-lg shadow-primary/10"
                  />
                </div>
              </div>
            </div>

            {/* List Side */}
            <div className="w-1/2 bg-muted/5 p-6 flex flex-col">
              <h3 className="text-[14px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                Existing Types
              </h3>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-border">
                {dbLeaveTypes.map((type) => (
                  <div
                    key={type._id}
                    className="group p-3 rounded-xl border border-border/40 bg-white hover:border-primary/30 transition-all shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-foreground">{type.leaveName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {type.totalDays || "∞"} days
                          </span>
                          <span className="h-1 w-1 rounded-full bg-border" />
                          <span className="text-[11px] font-bold text-success">
                            Paid
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {canEdit && (
                          <ActionButton
                            variant="edit"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingType(type._id);
                              setNewLeaveType({
                                name: type.leaveName,
                                limit: type.totalDays || 0,
                                paid: true,
                              });
                            }}
                          />
                        )}
                        {canDelete && (
                          <ActionButton
                            variant="delete"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDeleteLeaveType(type._id)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden">
          <div className="bg-destructive/10 p-6 flex items-center gap-4 border-b border-destructive/20">
            <div className="h-12 w-12 rounded-2xl bg-destructive text-white flex items-center justify-center shadow-lg">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight">Delete Entry?</DialogTitle>
              <DialogDescription className="text-destructive font-medium text-xs">
                This will permanently remove the record from the database.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter className="p-6 gap-3">
            <Button
              variant="ghost"
              onClick={() => setDeleteConfirmId(null)}
              disabled={isDeleting}
              className="rounded-xl h-11 flex-1 font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 h-11 bg-destructive text-white hover:bg-destructive/90 rounded-xl font-black shadow-lg shadow-destructive/20 disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
