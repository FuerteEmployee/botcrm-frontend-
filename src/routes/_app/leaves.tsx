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
import { useLeaveService, type Leave } from "@/services/leave-service";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { useEmployeeService } from "@/services/employee-service";
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
import { Checkbox } from "@/components/ui/checkbox";
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

function getLeaveIcon(name: string) {
  const norm = (name || "").toLowerCase();
  if (norm.includes("sick")) return <HeartPulse className="h-4 w-4" />;
  if (norm.includes("annual") || norm.includes("vacation")) return <Plane className="h-4 w-4" />;
  return <CalendarDays className="h-4 w-4" />;
}

function statusBadgeClass(status: string) {
  return cn(
    "capitalize text-[10px] font-bold px-2.5 py-0.5 border-transparent rounded-full",
    status === "approved" ? "bg-success/10 text-success"
    : status === "rejected" ? "bg-destructive/10 text-destructive"
    : "bg-warning/15 text-warning-foreground"
  );
}

function LeavesPage() {
  const { leaves, updateLeaveStatus, deleteLeave, createLeave, isCreating, isDeleting } = useLeaveService();
  const { can } = usePermission();
  const canCreate = can("leaves", "create");
  const canEdit = can("leaves", "edit");
  const canDelete = can("leaves", "delete");
  const { employees: dbEmployees } = useEmployeeService({ limit: 100, status: "active" });
  const { leaveTypes } = useLeaveTypeService();

  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
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
      const matchesSearch = !search || l.employeeId?.name?.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || l.leaveTypeId?._id === typeFilter;
      return matchesFilter && matchesSearch && matchesType;
    });
  }, [leaves, filter, search, typeFilter]);

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map((l) => l._id));
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    const status = action === "approve" ? "approved" : "rejected";
    await Promise.all(selectedIds.map((id) => updateLeaveStatus({ id, status }).catch(() => {})));
    toast.success(`Bulk ${action}d ${selectedIds.length} requests`);
    setSelectedIds([]);
  };

  const handleStatus = async (id: string, status: "pending" | "approved" | "rejected") => {
    await updateLeaveStatus({ id, status }).catch(() => {});
    setDetailsOpen(false);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    await deleteLeave(deleteConfirmId).catch(() => {});
    setDeleteConfirmId(null);
  };

  // HR "apply on behalf" form
  const [hrApplyOpen, setHrApplyOpen] = useState(false);
  const [hrFormEmployeeId, setHrFormEmployeeId] = useState("");
  const [hrFormLeaveTypeId, setHrFormLeaveTypeId] = useState("");
  const [hrFormStartDate, setHrFormStartDate] = useState("");
  const [hrFormEndDate, setHrFormEndDate] = useState("");
  const [hrFormReason, setHrFormReason] = useState("");

  const handleHrApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrFormEmployeeId || !hrFormLeaveTypeId || !hrFormStartDate || !hrFormEndDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    try {
      await createLeave({
        employeeId: hrFormEmployeeId,
        leaveTypeId: hrFormLeaveTypeId,
        startDate: hrFormStartDate,
        endDate: hrFormEndDate,
        reason: hrFormReason,
      });
      setHrApplyOpen(false);
      setHrFormEmployeeId("");
      setHrFormLeaveTypeId("");
      setHrFormStartDate("");
      setHrFormEndDate("");
      setHrFormReason("");
    } catch {
      // toast already shown by the service
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description="Review and manage employee time-off requests, vacations, and sick leaves."
        actions={
          <div className="flex gap-2">
            <Link to="/leave-types">
              <ActionButton
                variant="add"
                showLabel
                label="Leave Types"
                icon={Settings2}
                className="bg-white text-primary border-primary/20 hover:bg-primary/5 shadow-sm"
              />
            </Link>
            {canCreate && (
              <ActionButton
                variant="add"
                showLabel
                label="New Request"
                icon={UserPlus}
                onClick={() => setHrApplyOpen(true)}
              />
            )}
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Pending Requests" value={pendingCount} icon={Clock} accent="warning" delay={0} />
        <StatCard label="Approved Leaves" value={approvedCount} icon={CheckCircle2} accent="success" delay={0.05} />
        <StatCard label="Total Requests" value={leaves.length} icon={CalendarDays} accent="primary" delay={0.1} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-full md:w-[150px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <div className={cn(
                  "h-2 w-2 rounded-full",
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
              <SelectTrigger className="w-full md:w-[150px] h-10 border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <Layers className="h-3.5 w-3.5" />
                <SelectValue placeholder="Leave Type" />
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
              <span className="text-[13px] font-black tracking-tight text-primary uppercase">Selected</span>
            </div>
            <div className="h-6 w-px bg-border/60 mx-1" />
            <div className="flex items-center gap-1.5 p-1">
              {canEdit && (
                <ActionButton variant="approve" showLabel label="Approve All" icon={Check} onClick={() => handleBulkAction("approve")} className="h-11 px-6 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-none text-[13px] font-black" />
              )}
              {canEdit && (
                <ActionButton variant="reject" showLabel label="Reject All" icon={X} onClick={() => handleBulkAction("reject")} className="h-11 px-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 border-none text-[13px] font-black" />
              )}
              <Button variant="ghost" onClick={() => setSelectedIds([])} className="h-11 px-6 rounded-full font-bold text-muted-foreground hover:bg-muted/50 transition-all active:scale-95 text-[13px]">
                <X className="h-4 w-4 mr-2" />Deselect
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
                key={leave._id}
                title={leave.employeeId?.name || "Unknown"}
                subtitle={`Applied ${new Date(leave.createdAt).toLocaleDateString()}`}
                delay={idx * 0.05}
                icon={
                  <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                    {(leave.employeeId?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                }
                statusNode={<Badge variant="outline" className={statusBadgeClass(leave.status)}>{leave.status}</Badge>}
                metaLeft={{ icon: Layers, label: leave.leaveTypeId?.leaveName || "Leave" }}
                metaRight={{ icon: Calendar, label: `${leave.duration} Day${leave.duration > 1 ? "s" : ""}` }}
              >
                <div className="relative">
                  <div className="text-[12px] text-muted-foreground/80 line-clamp-2 italic mt-1 mb-3">"{leave.reason}"</div>
                  <div className="flex items-center justify-between pt-3 border-t border-border/40">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                      <Clock className="h-3 w-3" />
                      {new Date(leave.startDate).toLocaleDateString()} — {new Date(leave.endDate).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      {leave.status === "pending" && canEdit && (
                        <>
                          <ActionButton variant="approve" tooltip="Approve" onClick={() => handleStatus(leave._id, "approved")} className="h-7 w-7" />
                          <ActionButton variant="reject" tooltip="Reject" onClick={() => handleStatus(leave._id, "rejected")} className="h-7 w-7" />
                        </>
                      )}
                      {canDelete && (
                        <ActionButton variant="delete" tooltip="Delete Entry" icon={Trash2} onClick={() => setDeleteConfirmId(leave._id)} className="h-7 w-7" />
                      )}
                      <ActionButton variant="view" tooltip="Details" icon={ChevronRight} onClick={() => { setSelectedLeave(leave); setDetailsOpen(true); }} className="h-7 w-7" />
                    </div>
                  </div>
                </div>
              </GridCard>
            ))}
          </div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={[
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedIds.length === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary" />
                  Employee
                </div>,
                "Type", "Duration", "Reason", "Status", "Actions",
              ]}
              isEmpty={filtered.length === 0}
              emptyMessage={`No ${filter !== "all" ? filter : ""} leave requests found.`}
              className="shadow-sm"
            >
              {filtered.map((leave) => (
                <DataTableRow key={leave._id} className={cn(selectedIds.includes(leave._id) && "bg-primary/3")}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={selectedIds.includes(leave._id)} onCheckedChange={() => toggleSelect(leave._id)} className="h-4 w-4 rounded-md border-primary/20 data-[state=checked]:bg-primary" />
                      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                        <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                          {(leave.employeeId?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-[13px] font-bold text-foreground leading-tight">{leave.employeeId?.name || "Unknown"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{leave.employeeId?.email || `Applied ${new Date(leave.createdAt).toLocaleDateString()}`}</div>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center text-primary/70">
                        {getLeaveIcon(leave.leaveTypeId?.leaveName || "")}
                      </div>
                      <span className="text-[12px] capitalize font-semibold text-foreground/80">{leave.leaveTypeId?.leaveName || "Leave"}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="text-[13px] font-bold text-primary">{leave.duration} Day{leave.duration > 1 ? "s" : ""}</div>
                    <div className="text-[11px] text-muted-foreground font-medium">
                      {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()}
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[12px] text-muted-foreground max-w-[180px] truncate italic">"{leave.reason}"</DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className={statusBadgeClass(leave.status)}>{leave.status}</Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end items-center gap-1">
                      {leave.status === "pending" && canEdit && (
                        <>
                          <ActionButton variant="approve" tooltip="Approve" onClick={() => handleStatus(leave._id, "approved")} />
                          <ActionButton variant="reject" tooltip="Reject" onClick={() => handleStatus(leave._id, "rejected")} />
                        </>
                      )}
                      {canDelete && (
                        <ActionButton variant="delete" tooltip="Delete Entry" icon={Trash2} onClick={() => setDeleteConfirmId(leave._id)} />
                      )}
                      <ActionButton variant="view" tooltip="View Full Details" icon={ChevronRight} onClick={() => { setSelectedLeave(leave); setDetailsOpen(true); }} />
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
                  <Badge variant="outline" className={statusBadgeClass(selectedLeave.status)}>{selectedLeave.status}</Badge>
                  <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Applied {new Date(selectedLeave.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <Avatar className="h-14 w-14 ring-4 ring-primary/5">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-black">
                      {(selectedLeave.employeeId?.name || "?").split(" ").map((s) => s[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-xl font-black tracking-tight">{selectedLeave.employeeId?.name || "Unknown"}</SheetTitle>
                    <SheetDescription className="text-sm font-medium">{selectedLeave.employeeId?.email || "No email on file"}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 space-y-8 pb-10">
                <Card className="p-4 bg-muted/20 border-border/40 rounded-2xl shadow-none">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Leave Type</span>
                      <div className="flex items-center gap-2 font-bold text-foreground">
                        {getLeaveIcon(selectedLeave.leaveTypeId?.leaveName || "")}
                        <span className="capitalize">{selectedLeave.leaveTypeId?.leaveName || "Leave"}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Duration</span>
                      <div className="font-bold text-primary flex items-center gap-1">
                        <Calendar className="h-4 w-4" /> {selectedLeave.duration} Days
                      </div>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-border/40 mt-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Reason</span>
                      <p className="text-[13px] text-foreground leading-relaxed mt-1 font-medium italic">"{selectedLeave.reason}"</p>
                    </div>
                  </div>
                </Card>

                <div className="space-y-4">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                    <HistoryIcon className="h-3.5 w-3.5" /> Request History
                  </h4>
                  <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                    <div className="flex gap-4 relative pl-8">
                      <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12.5px] font-bold text-foreground">Request Applied</span>
                          <span className="text-[10px] font-medium text-muted-foreground">{new Date(selectedLeave.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">By {selectedLeave.employeeId?.name || "Unknown"}</div>
                      </div>
                    </div>
                    {selectedLeave.status !== "pending" && (
                      <div className="flex gap-4 relative pl-8">
                        <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-white border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[12.5px] font-bold text-foreground capitalize">{selectedLeave.status}</span>
                          </div>
                          {selectedLeave.adminRemark && (
                            <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 text-[11px] italic">"{selectedLeave.adminRemark}"</div>
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
                    <ActionButton variant="approve" showLabel label="APPROVE" onClick={() => handleStatus(selectedLeave._id, "approved")} className="bg-emerald-500 text-white border-none h-12 shadow-lg shadow-emerald-500/20" />
                    <ActionButton variant="reject" showLabel label="REJECT" onClick={() => handleStatus(selectedLeave._id, "rejected")} className="bg-destructive text-white border-none h-12 shadow-lg shadow-destructive/20" />
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

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
                HR Administrator creating a leave request for an employee. Duration (business days) is calculated automatically.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-5" onSubmit={handleHrApplySubmit}>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Select Employee</label>
                <Select value={hrFormEmployeeId} onValueChange={setHrFormEmployeeId}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Search employee..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {dbEmployees.map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Leave Type</label>
                <Select value={hrFormLeaveTypeId} onValueChange={setHrFormLeaveTypeId}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {leaveTypes.map((type) => (
                      <SelectItem key={type._id} value={type._id}>{type.leaveName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Start Date</label>
                  <FormInput type="date" className="h-12 rounded-xl" value={hrFormStartDate} onChange={(e) => setHrFormStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">End Date</label>
                  <FormInput type="date" className="h-12 rounded-xl" value={hrFormEndDate} onChange={(e) => setHrFormEndDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Reason / Note</label>
                <FormInput placeholder="Official reason for application..." className="h-12 rounded-xl" value={hrFormReason} onChange={(e) => setHrFormReason(e.target.value)} />
              </div>

              <DialogFooter className="pt-4 gap-3">
                <Button type="button" variant="ghost" onClick={() => setHrApplyOpen(false)} className="rounded-xl h-12 flex-1 font-bold">Discard</Button>
                <ActionButton variant="add" type="submit" showLabel label="SUBMIT REQUEST" icon={Check} disabled={isCreating} className="flex-1 h-12 shadow-lg shadow-primary/20" />
              </DialogFooter>
            </form>
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
              <DialogDescription className="text-destructive font-medium text-xs">This will permanently remove the record from the database.</DialogDescription>
            </div>
          </div>
          <DialogFooter className="p-6 gap-3">
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting} className="rounded-xl h-11 flex-1 font-bold">Cancel</Button>
            <Button onClick={handleDelete} disabled={isDeleting} className="flex-1 h-11 bg-destructive text-white hover:bg-destructive/90 rounded-xl font-black shadow-lg shadow-destructive/20 disabled:opacity-60">
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
