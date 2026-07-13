import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { GridCard } from "@/components/shared/grid-card";
import { Check, X, Clock as ClockIcon, MessageSquare, Pencil, CalendarDays, Search, MapPin, MoreVertical, Download, Plus, ChevronLeft, ChevronRight, Users, UserCheck, UserX, Phone, ClipboardList, ShieldAlert, Layers } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceService, useAttendanceStats, useAbsentToday, type AttendanceRecord } from "@/services/attendance-service";
import { useRegularizationService } from "@/services/regularization-service";
import { useShiftService } from "@/services/shift-service";
import { useEmployeeService } from "@/services/employee-service";
import { useTicketService } from "@/services/ticket-service";
import { parseTicketReason } from "@/lib/leave-ticket-parser";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";

const attendanceSearchSchema = z.object({
  status: z.string().optional(),
});

export const Route = createFileRoute("/_app/attendance")({
  validateSearch: (search) => attendanceSearchSchema.parse(search),
  component: AttendancePage,
});

// ─── Pagination Component ───────────────────────────────────────────────────
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("…");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between gap-4 mt-4 px-1">
      <p className="text-[12px] text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{" "}
        <span className="font-semibold text-foreground">{totalItems}</span> records
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg border-border/50"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, idx) =>
          p === "…" ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-[12px]">…</span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? "default" : "outline"}
              size="icon"
              className={cn(
                "h-8 w-8 rounded-lg text-[12px] font-semibold",
                p === currentPage
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border/50 hover:bg-muted/60"
              )}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg border-border/50"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Today's Record Mini-Card ────────────────────────────────────────────────
function TodayRecordCard({ t, getDisplayStatus, canEdit, setModifyForm, setModifyOpen, setRemarkOpenId, setRemarkText }: {
  t: AttendanceRecord;
  getDisplayStatus: (t: AttendanceRecord) => string;
  canEdit: boolean;
  setModifyForm: any;
  setModifyOpen: any;
  setRemarkOpenId: any;
  setRemarkText: any;
}) {
  const status = getDisplayStatus(t);
  const statusStyle = status === "on-duty"
    ? "bg-blue-500/10 text-blue-600 border-blue-200"
    : t.status === "present"
    ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
    : t.status === "late"
    ? "bg-amber-500/10 text-amber-600 border-amber-200"
    : "bg-rose-500/10 text-rose-600 border-rose-200";

  const dotStyle = status === "on-duty"
    ? "bg-blue-500"
    : t.status === "present"
    ? "bg-emerald-500"
    : t.status === "late"
    ? "bg-amber-500"
    : "bg-rose-500";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative bg-card border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/40 via-primary to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-10 w-10 ring-2 ring-primary/10">
            {t.punchInPhoto ? (
              <img src={t.punchInPhoto} alt={t.employeeId?.name} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                {t.employeeId?.name?.split(" ").map((n: string) => n[0]).join("")}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <p className="text-[13px] font-bold text-foreground leading-tight">{t.employeeId?.name || "Unknown"}</p>
            <p className="text-[11px] text-muted-foreground">{t.employeeId?.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5 border capitalize rounded-full", statusStyle)}>
            <span className={cn("h-1.5 w-1.5 rounded-full mr-1 inline-block", dotStyle)} />
            {status === "on-duty" ? "On Duty" : t.status}
          </Badge>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-[13px]">
                <DropdownMenuItem onClick={() => {
                  setModifyForm({
                    id: t._id,
                    punchIn: t.punchIn ? new Date(t.punchIn).toISOString().slice(0, 16) : "",
                    punchOut: t.punchOut ? new Date(t.punchOut).toISOString().slice(0, 16) : "",
                    lunchInTime: t.lunchInTime ? new Date(t.lunchInTime).toISOString().slice(0, 16) : "",
                    lunchOutTime: t.lunchOutTime ? new Date(t.lunchOutTime).toISOString().slice(0, 16) : "",
                    status: t.status
                  });
                  setModifyOpen(true);
                }}>Edit Punch</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Punch In", value: t.punchIn },
          { label: "Punch Out", value: t.punchOut },
          { label: "Lunch In", value: t.lunchInTime },
          { label: "Lunch Out", value: t.lunchOutTime },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/40 rounded-lg px-2.5 py-2 border border-border/30">
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-[12px] font-mono font-bold text-foreground">
              {value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
            </p>
          </div>
        ))}
      </div>
      {t.punchInLocation && (
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <MapPin className="h-2.5 w-2.5 text-primary/40" />
          <span className="truncate">
            {typeof t.punchInLocation === "object"
              ? `${(t.punchInLocation as any).lat?.toFixed(4)}, ${(t.punchInLocation as any).lng?.toFixed(4)}`
              : t.punchInLocation}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Page Size Constants ─────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const CARD_PAGE_SIZE = 12;

function AttendancePage() {
  const { records: list, isLoading, updateAttendance, markAbsent } = useAttendanceService();
  const { status } = Route.useSearch();
  const [tab, setTab] = useState<string>(status || "all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [remarkOpenId, setRemarkOpenId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canEdit = can("attendance", "edit");
  const canCreate = can("attendance", "create");

  const { stats } = useAttendanceStats();
  const { absentees } = useAbsentToday();
  const { regularizations, submitRegularization, approveRegularization, rejectRegularization, isSubmitting } = useRegularizationService();
  const { shifts } = useShiftService();
  const { employees } = useEmployeeService({ limit: 200, status: "active" });
  const { tickets } = useTicketService();

  const { data: appSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await apiClient.get("/settings")).data,
  });
  const maxLunchMinutes = appSettings?.attendance?.maxLunch ?? 90;

  // Pagination states
  const [tablePage, setTablePage] = useState(1);
  const [cardPage, setCardPage] = useState(1);

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    if (status) {
      setTab(status);
    }
  }, [status]);

  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyForm, setModifyForm] = useState({
    id: "",
    punchIn: "",
    punchOut: "",
    lunchInTime: "",
    lunchOutTime: "",
    status: "present" as any
  });

  // Default date filter = today
  const todayStr = new Date().toISOString().split("T")[0];
  const [dateFilter, setDateFilter] = useState<string>(todayStr);

  // Punched in but not yet punched out — shown as "On Duty"
  const getDisplayStatus = (t: AttendanceRecord) => (t.punchIn && !t.punchOut ? "on-duty" : t.status);

  const todayList = list.filter((t) => t.date?.slice(0, 10) === todayStr);
  const counts = {
    all: todayList.length,
    present: todayList.filter((t) => t.status === "present" || t.status === "late" || t.status === "wfh").length,
    late: todayList.filter((t) => t.status === "late").length,
    absent: todayList.filter((t) => t.status === "absent").length,
  };

  // On Leave — approved Leave tickets (the real leave-request source of truth;
  // see leaves.tsx) whose date range covers today.
  const onLeaveCount = useMemo(() => {
    return tickets.filter((t) => {
      if (t.type !== "Leave" || t.status !== "approved") return false;
      const parsed = parseTicketReason(t.reason);
      if (!parsed.startDate || !parsed.endDate) return false;
      return parsed.startDate <= todayStr && todayStr <= parsed.endDate;
    }).length;
  }, [tickets, todayStr]);

  const pendingRegularizations = useMemo(
    () => regularizations.filter((r) => r.status === "pending"),
    [regularizations]
  );

  // All-days filtered records
  const filtered = useMemo(() => {
    return list.filter((t) => {
      const name = t.employeeId?.name || "";
      const displayStatus = getDisplayStatus(t);
      const matchesTab = tab === "all" || displayStatus === tab || t.status === tab;
      const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchesDate = !dateFilter || t.date?.slice(0, 10) === dateFilter;
      const matchesShift = shiftFilter === "all" || t.employeeId?.shiftId?._id === shiftFilter;
      return matchesTab && matchesSearch && matchesDate && matchesShift;
    });
  }, [list, tab, search, dateFilter, shiftFilter]);

  // Reset pages when filters change
  useEffect(() => { setTablePage(1); setCardPage(1); }, [filtered]);

  // Paginated slices
  const totalTablePages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedTable = filtered.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  const totalCardPages = Math.ceil(filtered.length / CARD_PAGE_SIZE);
  const paginatedCards = filtered.slice((cardPage - 1) * CARD_PAGE_SIZE, cardPage * CARD_PAGE_SIZE);

  const saveRemark = async () => {
    if (!remarkOpenId) return;
    try {
      await updateAttendance({ id: remarkOpenId, data: { remarks: remarkText } });
      setRemarkOpenId(null);
      setRemarkText("");
    } catch (err) { }
  };

  const isShowingToday = dateFilter === todayStr;

  // Absent Today / Pending Regularizations / Attendance Detail / Request Correction
  const [absentSheetOpen, setAbsentSheetOpen] = useState(false);
  const [regSheetOpen, setRegSheetOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    employeeId: "",
    date: todayStr,
    requestedPunchIn: "",
    requestedPunchOut: "",
    requestedLunchInTime: "",
    requestedLunchOutTime: "",
    reason: "",
  });

  const handleMarkAbsent = async (employeeId: string, date: string) => {
    try {
      await markAbsent({ employeeId, date: date.slice(0, 10) });
    } catch { }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionForm.employeeId || !correctionForm.date || !correctionForm.reason) {
      toast.error("Please select an employee, date, and reason.");
      return;
    }
    try {
      await submitRegularization({
        employeeId: correctionForm.employeeId,
        date: correctionForm.date,
        requestedPunchIn: correctionForm.requestedPunchIn || undefined,
        requestedPunchOut: correctionForm.requestedPunchOut || undefined,
        requestedLunchInTime: correctionForm.requestedLunchInTime || undefined,
        requestedLunchOutTime: correctionForm.requestedLunchOutTime || undefined,
        reason: correctionForm.reason,
      });
      setCorrectionOpen(false);
      setCorrectionForm({
        employeeId: "", date: todayStr, requestedPunchIn: "", requestedPunchOut: "",
        requestedLunchInTime: "", requestedLunchOutTime: "", reason: "",
      });
    } catch { }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance Reports" description="Monitor daily punch logs and modify login times." />
        <SkeletonLoader type="stats" count={5} />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Reports"
        description="Monitor daily punch logs and modify login times."
        actions={
          <div className="flex gap-2">
            <ActionButton
              variant="download"
              showLabel
              label="Export Logs"
            />
            {canCreate && (
              <ActionButton
                variant="add"
                showLabel
                label="Request Correction"
                icon={ClipboardList}
                onClick={() => setCorrectionOpen(true)}
              />
            )}
            {canEdit && (
              <ActionButton
                variant="edit"
                showLabel
                label="Modify Punch"
                onClick={() => setModifyOpen(true)}
              />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Present Today" value={stats?.presentToday ?? counts.present} icon={Check} accent="success" delay={0} />
        <StatCard label="Late Arrivals" value={stats?.lateArrivals ?? counts.late} icon={ClockIcon} accent="warning" delay={0.05} />
        <StatCard label="On Leave" value={onLeaveCount} icon={CalendarDays} accent="info" delay={0.1} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div onClick={() => setAbsentSheetOpen(true)} className="cursor-pointer">
          <StatCard label="Absent Today" value={stats?.absentToday ?? counts.absent} icon={UserX} accent="destructive" delay={0.25} />
        </div>
        <div onClick={() => setRegSheetOpen(true)} className="cursor-pointer">
          <StatCard label="Pending Regularizations" value={pendingRegularizations.length} icon={ClipboardList} accent="warning" delay={0.3} />
        </div>
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <Select value={tab} onValueChange={(v) => { setTab(v); setTablePage(1); setCardPage(1); }}>
            <SelectTrigger className="w-full md:w-[130px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
              <div className={cn("h-2 w-2 rounded-full", tab === 'present' ? "bg-success" : tab === 'late' ? "bg-warning" : tab === 'on-duty' ? "bg-blue-500" : "bg-primary")} />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All Logs</SelectItem>
              <SelectItem value="on-duty">On Duty</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="half-day">Half Day</SelectItem>
            </SelectContent>
          </Select>

          <Select value={shiftFilter} onValueChange={(v) => { setShiftFilter(v); setTablePage(1); setCardPage(1); }}>
            <SelectTrigger className="w-full md:w-[150px] h-10 border border-info/20 bg-info/5 text-info hover:bg-info/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
              <Layers className="h-3.5 w-3.5" />
              <SelectValue placeholder="Shift" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All Shifts</SelectItem>
              {shifts.map((s) => (
                <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <FormInput
              type="date"
              icon={CalendarDays}
              className="h-10 w-full md:w-[170px] shadow-none"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setTablePage(1); setCardPage(1); }}
            />
            {dateFilter && dateFilter !== todayStr && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setDateFilter(todayStr); setTablePage(1); setCardPage(1); }}
                className="h-10 px-3 rounded-xl text-[12px] text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                Today
              </Button>
            )}
            {dateFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setDateFilter(""); setTablePage(1); setCardPage(1); }}
                className="h-10 px-3 rounded-xl text-[12px] text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <FormInput
          placeholder="Search employee..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setTablePage(1); setCardPage(1); }}
        />
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-border/50 bg-muted/10">
                <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-[13px] text-muted-foreground">No logs found for the selected filters.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {paginatedCards.map((t) => (
              <GridCard
                key={t._id}
                title={t.employeeId?.name || "Unknown"}
                subtitle={new Date(t.date).toLocaleDateString()}
                icon={
                  t.punchInPhoto ? (
                    <img
                      src={t.punchInPhoto}
                      alt={t.employeeId?.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                      {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                    </div>
                  )
                }
                statusNode={
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-[10px] font-bold px-2 py-0 border-transparent rounded-full",
                      getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                        t.status === "present" ? "bg-success/10 text-success" :
                          t.status === "late" ? "bg-warning/15 text-warning-foreground" :
                            "bg-destructive/10 text-destructive"
                    )}
                  >{getDisplayStatus(t) === "on-duty" ? "On Duty" : t.status}</Badge>
                }
                actions={
                  canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailRecord(t)}>View Details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setModifyForm({
                          id: t._id,
                          punchIn: t.punchIn ? new Date(t.punchIn).toISOString().slice(0, 16) : "",
                          punchOut: t.punchOut ? new Date(t.punchOut).toISOString().slice(0, 16) : "",
                          lunchInTime: t.lunchInTime ? new Date(t.lunchInTime).toISOString().slice(0, 16) : "",
                          lunchOutTime: t.lunchOutTime ? new Date(t.lunchOutTime).toISOString().slice(0, 16) : "",
                          status: t.status
                        });
                        setModifyOpen(true);
                      }}>Edit Punch</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>
                      {t.status !== "absent" && (
                        <DropdownMenuItem className="text-destructive" onClick={() => handleMarkAbsent(t.employeeId._id, t.date)}>Mark Absent</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  ) : undefined
                }
              >
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.lunchInTime ? new Date(t.lunchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.lunchOutTime ? new Date(t.lunchOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.punchOut ? new Date(t.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground mb-1 line-clamp-1 italic px-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-primary/40" />
                  {t.punchInLocation && typeof t.punchInLocation === 'object'
                    ? `${t.punchInLocation.lat?.toFixed(4)}, ${t.punchInLocation.lng?.toFixed(4)}`
                    : (t.punchInLocation || "No location data")}
                </div>
              </GridCard>
            ))}
                </div>
                <Pagination
                  currentPage={cardPage}
                  totalPages={totalCardPages}
                  onPageChange={setCardPage}
                  totalItems={filtered.length}
                  pageSize={CARD_PAGE_SIZE}
                />
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <DataTable
              headers={["Employee", "Date", "Punch In", "Lunch In", "Lunch Out", "Punch Out", "Location", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
              emptyMessage={`No logs found.`}
              className="shadow-sm"
            >
              {paginatedTable.map((t) => (
                <DataTableRow key={t._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                        {t.punchInPhoto ? (
                          <img
                            src={t.punchInPhoto}
                            alt={t.employeeId?.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                            {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-[13px] text-foreground leading-tight">{t.employeeId?.name}</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5">{t.employeeId?.phone}</span>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">{new Date(t.date).toLocaleDateString()}</DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.lunchInTime ? new Date(t.lunchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.lunchOutTime ? new Date(t.lunchOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchOut ? new Date(t.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[12px] text-muted-foreground max-w-[150px] truncate italic">
                    {t.punchInLocation && typeof t.punchInLocation === 'object'
                      ? `${t.punchInLocation.lat?.toFixed(2)}, ${t.punchInLocation.lng?.toFixed(2)}`
                      : (t.punchInLocation || "N/A")}
                  </DataTableCell>
                  <DataTableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-bold px-2 py-0.5 border-transparent",
                        getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                          t.status === "present" ? "bg-success/10 text-success" :
                            t.status === "late" ? "bg-warning/15 text-warning-foreground" :
                              "bg-destructive/10 text-destructive"
                      )}
                    >{getDisplayStatus(t) === "on-duty" ? "On Duty" : t.status}</Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end items-center gap-1">
                      <ActionButton
                        variant="view"
                        tooltip="View Details"
                        onClick={() => setDetailRecord(t)}
                      />
                      {canEdit && (
                      <ActionButton
                        variant="edit"
                        tooltip="Edit Punch"
                        onClick={() => {
                          setModifyForm({
                            id: t._id,
                            punchIn: t.punchIn ? new Date(t.punchIn).toISOString().slice(0, 16) : "",
                            punchOut: t.punchOut ? new Date(t.punchOut).toISOString().slice(0, 16) : "",
                            lunchInTime: t.lunchInTime ? new Date(t.lunchInTime).toISOString().slice(0, 16) : "",
                            lunchOutTime: t.lunchOutTime ? new Date(t.lunchOutTime).toISOString().slice(0, 16) : "",
                            status: t.status
                          });
                          setModifyOpen(true);
                        }}
                      />
                      )}
                      {canEdit && (
                      <ActionButton
                        variant="more"
                        tooltip="Add Remark"
                        icon={MessageSquare}
                        onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}
                      />
                      )}
                      {canEdit && t.status !== "absent" && (
                      <ActionButton
                        variant="reject"
                        tooltip="Mark Absent"
                        icon={UserX}
                        onClick={() => handleMarkAbsent(t.employeeId._id, t.date)}
                      />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
            <Pagination
              currentPage={tablePage}
              totalPages={totalTablePages}
              onPageChange={setTablePage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remark Dialog */}
      <Dialog open={!!remarkOpenId} onOpenChange={(o) => { if (!o) { setRemarkOpenId(null); setRemarkText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add admin remark</DialogTitle>
            <DialogDescription className="text-[12px]">This note will be visible to the employee.</DialogDescription>
          </DialogHeader>
          <Textarea value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="Verified with team lead…" rows={4} className="text-[13px]" />
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRemarkOpenId(null); setRemarkText(""); }} className="rounded-xl">Cancel</Button>
            <ActionButton
              variant="add"
              showLabel
              label="Save"
              icon={Check}
              onClick={saveRemark}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Login Time Dialog */}
      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Modify Punch Time</DialogTitle>
            <DialogDescription className="text-[12px]">Adjust punch in / out and status for this record.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateAttendance({
                id: modifyForm.id,
                data: {
                  punchIn: modifyForm.punchIn,
                  punchOut: modifyForm.punchOut,
                  lunchInTime: modifyForm.lunchInTime,
                  lunchOutTime: modifyForm.lunchOutTime,
                  status: modifyForm.status
                }
              });
              setModifyOpen(false);
            }}
            className="space-y-3"
          >
            <FormInput
              label="Punch In"
              type="datetime-local"
              value={modifyForm.punchIn}
              onChange={(e) => setModifyForm({ ...modifyForm, punchIn: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Punch Out"
              type="datetime-local"
              value={modifyForm.punchOut}
              onChange={(e) => setModifyForm({ ...modifyForm, punchOut: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Lunch In"
              type="datetime-local"
              value={modifyForm.lunchInTime}
              onChange={(e) => setModifyForm({ ...modifyForm, lunchInTime: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Lunch Out"
              type="datetime-local"
              value={modifyForm.lunchOutTime}
              onChange={(e) => setModifyForm({ ...modifyForm, lunchOutTime: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormSelect
              label="Status"
              value={modifyForm.status}
              onValueChange={(v) => setModifyForm({ ...modifyForm, status: v })}
              options={[
                { label: "Present", value: "present" },
                { label: "Late", value: "late" },
                { label: "Half Day", value: "half-day" },
                { label: "Absent", value: "absent" },
              ]}
              containerClassName="space-y-1"
            />
             <DialogFooter className="gap-2 pt-1">
               <Button type="button" size="sm" variant="outline" onClick={() => setModifyOpen(false)} className="rounded-xl">Cancel</Button>
               <ActionButton
                 variant="add"
                 type="submit"
                 showLabel
                 label="Save Changes"
                 icon={Check}
               />
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Absent Today Sheet */}
      <Sheet open={absentSheetOpen} onOpenChange={setAbsentSheetOpen}>
        <SheetContent className="sm:max-w-md w-full p-0 border-l border-border/40">
          <div className="h-full flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b border-border/40">
              <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                <UserX className="h-5 w-5 text-destructive" /> Absent Today
              </SheetTitle>
              <SheetDescription className="text-sm font-medium">
                Active employees with no punch record for {new Date(todayStr).toLocaleDateString()}.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {absentees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <UserCheck className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[13px] text-muted-foreground">Everyone has punched in today.</p>
                </div>
              ) : (
                absentees.map((e) => (
                  <div key={e._id} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/10">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-2 ring-destructive/10">
                        <AvatarFallback className="bg-destructive/10 text-destructive text-[12px] font-bold">
                          {e.name?.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-[13px] font-bold text-foreground leading-tight">{e.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {e.shiftId?.name || "No Shift"}{e.branchId?.branchName ? ` • ${e.branchId.branchName}` : ""}
                        </p>
                      </div>
                    </div>
                    {e.phone && (
                      <a
                        href={`tel:${e.phone}`}
                        className="h-9 w-9 rounded-xl bg-primary/5 text-primary flex items-center justify-center hover:bg-primary/10 transition-colors shrink-0"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pending Regularizations Sheet */}
      <Sheet open={regSheetOpen} onOpenChange={setRegSheetOpen}>
        <SheetContent className="sm:max-w-lg w-full p-0 border-l border-border/40">
          <div className="h-full flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b border-border/40">
              <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-warning-foreground" /> Pending Regularizations
              </SheetTitle>
              <SheetDescription className="text-sm font-medium">
                Attendance correction requests awaiting your review.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {pendingRegularizations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Check className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[13px] text-muted-foreground">No pending correction requests.</p>
                </div>
              ) : (
                pendingRegularizations.map((r) => (
                  <Card key={r._id} className="p-4 bg-muted/10 border-border/40 rounded-2xl shadow-none space-y-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 ring-2 ring-primary/10">
                        <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                          {r.employeeId?.name?.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-[13px] font-bold text-foreground leading-tight">{r.employeeId?.name}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(r.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {r.requestedPunchIn && (
                        <div className="p-2 rounded-lg bg-white border border-border/30">
                          <span className="text-muted-foreground">Punch In: </span>
                          <span className="font-mono font-bold">{new Date(r.requestedPunchIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      )}
                      {r.requestedPunchOut && (
                        <div className="p-2 rounded-lg bg-white border border-border/30">
                          <span className="text-muted-foreground">Punch Out: </span>
                          <span className="font-mono font-bold">{new Date(r.requestedPunchOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground italic">"{r.reason}"</p>
                    {canEdit && (
                      <div className="flex gap-2 pt-1">
                        <ActionButton variant="approve" showLabel label="Approve" className="flex-1 h-9" onClick={() => approveRegularization({ id: r._id })} />
                        <ActionButton variant="reject" showLabel label="Reject" className="flex-1 h-9" onClick={() => rejectRegularization({ id: r._id })} />
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Request Correction Dialog */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="h-2 w-full bg-primary" />
          <div className="p-6">
            <DialogHeader className="mb-6">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <ClipboardList className="h-6 w-6" />
              </div>
              <DialogTitle className="text-xl font-black">Request Correction</DialogTitle>
              <DialogDescription className="font-medium text-xs">
                Submit an attendance correction for admin approval.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmitCorrection}>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Employee</label>
                <Select value={correctionForm.employeeId} onValueChange={(v) => setCorrectionForm({ ...correctionForm, employeeId: v })}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select employee..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {employees.map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormInput
                label="Date"
                type="date"
                value={correctionForm.date}
                onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
                className="h-11"
                containerClassName="space-y-1"
              />
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="Punch In"
                  type="datetime-local"
                  value={correctionForm.requestedPunchIn}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedPunchIn: e.target.value })}
                  className="h-11"
                  containerClassName="space-y-1"
                />
                <FormInput
                  label="Punch Out"
                  type="datetime-local"
                  value={correctionForm.requestedPunchOut}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedPunchOut: e.target.value })}
                  className="h-11"
                  containerClassName="space-y-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="Lunch In"
                  type="datetime-local"
                  value={correctionForm.requestedLunchInTime}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedLunchInTime: e.target.value })}
                  className="h-11"
                  containerClassName="space-y-1"
                />
                <FormInput
                  label="Lunch Out"
                  type="datetime-local"
                  value={correctionForm.requestedLunchOutTime}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedLunchOutTime: e.target.value })}
                  className="h-11"
                  containerClassName="space-y-1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Reason</label>
                <Textarea
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                  placeholder="e.g. Forgot to punch out, GPS was off..."
                  rows={3}
                  className="text-[13px]"
                />
              </div>
              <DialogFooter className="pt-2 gap-3">
                <Button type="button" variant="ghost" onClick={() => setCorrectionOpen(false)} className="rounded-xl h-11 flex-1 font-bold">Cancel</Button>
                <ActionButton
                  variant="add"
                  type="submit"
                  showLabel
                  label="Submit Request"
                  icon={Check}
                  disabled={isSubmitting}
                  className="flex-1 h-11"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Detail Sheet */}
      <Sheet open={!!detailRecord} onOpenChange={(o) => !o && setDetailRecord(null)}>
        <SheetContent className="sm:max-w-lg w-full p-0 border-l border-border/40">
          {detailRecord && (
            <div className="h-full flex flex-col">
              <SheetHeader className="p-6 pb-4 pr-12 border-b border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-[10px] font-black px-3 py-1 rounded-full border-transparent",
                      getDisplayStatus(detailRecord) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                        detailRecord.status === "present" ? "bg-success/10 text-success" :
                          detailRecord.status === "late" ? "bg-warning/15 text-warning-foreground" :
                            "bg-destructive/10 text-destructive"
                    )}
                  >
                    {getDisplayStatus(detailRecord) === "on-duty" ? "On Duty" : detailRecord.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-medium">{new Date(detailRecord.date).toLocaleDateString()}</span>
                </div>
                <SheetTitle className="text-xl font-black tracking-tight">{detailRecord.employeeId?.name}</SheetTitle>
                <SheetDescription className="text-sm font-medium">{detailRecord.employeeId?.phone}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Punch In</p>
                    <div className="h-28 rounded-xl overflow-hidden bg-muted/30 border border-border/40 flex items-center justify-center">
                      {detailRecord.punchInPhoto ? (
                        <img src={detailRecord.punchInPhoto} alt="Punch in selfie" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No photo</span>
                      )}
                    </div>
                    <p className="text-[13px] font-mono font-bold text-foreground">
                      {detailRecord.punchIn ? new Date(detailRecord.punchIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {detailRecord.punchInLocation && typeof detailRecord.punchInLocation === "object"
                          ? `${(detailRecord.punchInLocation as any).lat?.toFixed(4)}, ${(detailRecord.punchInLocation as any).lng?.toFixed(4)}`
                          : (detailRecord.punchInLocation || "No location data")}
                      </span>
                    </p>
                    {detailRecord.punchInDistance != null && detailRecord.punchInDistance > 150 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200 text-[9px] gap-1 py-0 px-1.5 font-bold">
                        <ShieldAlert className="h-3 w-3" /> Geo Violation ({detailRecord.punchInDistance}m)
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Punch Out</p>
                    <div className="h-28 rounded-xl overflow-hidden bg-muted/30 border border-border/40 flex items-center justify-center">
                      {detailRecord.punchOutPhoto ? (
                        <img src={detailRecord.punchOutPhoto} alt="Punch out selfie" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No photo</span>
                      )}
                    </div>
                    <p className="text-[13px] font-mono font-bold text-foreground">
                      {detailRecord.punchOut ? new Date(detailRecord.punchOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {detailRecord.punchOutLocation && typeof detailRecord.punchOutLocation === "object"
                          ? `${(detailRecord.punchOutLocation as any).lat?.toFixed(4)}, ${(detailRecord.punchOutLocation as any).lng?.toFixed(4)}`
                          : (detailRecord.punchOutLocation || "No location data")}
                      </span>
                    </p>
                    {detailRecord.punchOutDistance != null && detailRecord.punchOutDistance > 150 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200 text-[9px] gap-1 py-0 px-1.5 font-bold">
                        <ShieldAlert className="h-3 w-3" /> Geo Violation ({detailRecord.punchOutDistance}m)
                      </Badge>
                    )}
                  </div>
                </div>

                <Card className="p-4 bg-muted/20 border-border/40 rounded-2xl shadow-none space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Lunch Break</p>
                  <div className="flex items-center justify-between text-[13px] font-mono font-bold text-foreground">
                    <span>{detailRecord.lunchInTime ? new Date(detailRecord.lunchInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                    <span className="text-muted-foreground font-sans font-normal text-[11px]">to</span>
                    <span>{detailRecord.lunchOutTime ? new Date(detailRecord.lunchOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                  {detailRecord.lunchInTime && detailRecord.lunchOutTime && (() => {
                    const mins = Math.round((new Date(detailRecord.lunchOutTime).getTime() - new Date(detailRecord.lunchInTime).getTime()) / 60000);
                    return mins > maxLunchMinutes ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] gap-1 py-0 px-1.5 font-bold">
                        <ShieldAlert className="h-3 w-3" /> Lunch overrun ({mins}m over {maxLunchMinutes}m limit)
                      </Badge>
                    ) : null;
                  })()}
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Total Hours</span>
                    <div className="font-bold text-primary text-[13px]">
                      {detailRecord.punchIn && detailRecord.punchOut
                        ? `${((new Date(detailRecord.punchOut).getTime() - new Date(detailRecord.punchIn).getTime()) / 3600000).toFixed(2)}h`
                        : "—"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Remarks</span>
                    <div className="font-medium text-foreground/80 text-[13px]">{detailRecord.remarks || "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
