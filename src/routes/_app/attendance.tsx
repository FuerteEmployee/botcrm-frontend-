import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { GridCard } from "@/components/shared/grid-card";
import { Check, X, Clock as ClockIcon, MessageSquare, Pencil, CalendarDays, Search, MapPin, MoreVertical, Download, Plus, ChevronLeft, ChevronRight, Users, UserCheck, UserX, Phone, ClipboardList, ShieldAlert, Layers, ScanFace, Fingerprint, Smartphone, ListChecks, ChevronDown, AlertCircle, Home } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { statusLabel, statusClass } from "@/lib/attendance-status";
import { useAttendanceService, useAttendanceStats, useAbsentToday, usePunchLog, type AttendanceRecord, type AttendanceSession, type PunchLogTap } from "@/services/attendance-service";
import { useGeofenceMode } from "@/services/geofence-service";
import {
  SessionTimeline,
  DayStatsRow,
  AutoPunchOutCard,
  ShiftRequirementCard,
  WhyHalfDay,
  GeofenceExitBanner,
  InsideFenceNote,
} from "@/components/attendance/day-detail-blocks";
import { useRegularizationService } from "@/services/regularization-service";
import { useShiftService } from "@/services/shift-service";
import { useBranchService } from "@/services/branch-service";
import { useEmployeeService } from "@/services/employee-service";
import { useTicketService } from "@/services/ticket-service";
import { parseTicketReason } from "@/lib/leave-ticket-parser";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn, toISTDateKey, toDatetimeLocalValue, formatTime12h } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";

const attendanceSearchSchema = z.object({
  status: z.string().optional(),
});

// Every raw tap the terminal reported for one employee on one day.
//
// The day's punch-in/punch-out are derived from the whole set, not decided tap
// by tap (see backend/src/utils/punch_reconcile.js) — so with more than four
// taps only the first and last carry a meaning, and this list is the only place
// the rest are visible. Rejected taps are shown too, greyed out with a reason:
// a debounced double-press is the usual answer to "I tapped and it didn't
// count", and hiding it would defeat the point of the list.
const TAP_LABELS: Record<string, string> = {
  "punch-in": "Punch in",
  "lunch-in": "Lunch break starts",
  "lunch-out": "Back from lunch",
  "punch-out": "Punch out",
};

function RawTapList({ taps, isLoading }: { taps: PunchLogTap[]; isLoading: boolean }) {
  const counted = taps.filter((t) => !t.discarded);

  return (
    <Card className="p-4 bg-muted/20 border-border/40 rounded-2xl shadow-none space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
        <Fingerprint className="h-3 w-3" /> Device Taps ({counted.length}
        {taps.length !== counted.length ? ` + ${taps.length - counted.length} ignored` : ""})
      </p>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading taps…</p>
      ) : taps.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No raw taps recorded for this day. Records created before tap logging was enabled only
          store the derived punch times.
        </p>
      ) : (
        <div className="space-y-1.5">
          {taps.map((t) => (
            <div
              key={t._id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 border text-[12px]",
                t.discarded
                  ? "bg-background/30 border-border/30 opacity-60"
                  : "bg-background/60 border-border/40",
              )}
            >
              <span className={cn("font-mono font-bold", t.discarded && "line-through")}>
                {formatTime12h(t.deviceTime)}
              </span>
              <span className="flex-1 text-right font-sans text-[10px] font-bold uppercase tracking-wider">
                {t.discarded ? (
                  <span className="text-muted-foreground">
                    {t.discardReason === "debounced" ? "Ignored — double tap" : `Ignored — ${t.discardReason}`}
                  </span>
                ) : t.derivedAction ? (
                  <span className="text-primary">{TAP_LABELS[t.derivedAction] ?? t.derivedAction}</span>
                ) : (
                  <span className="text-muted-foreground/60">Extra tap</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

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
/**
 * "Worked remotely" marker for one day.
 *
 * Driven by `isWFH` — the record's own flag — and NOT by `status`, because the
 * status badge loses the signal in both directions:
 *
 *   · While the day is open, getDisplayStatus() reports "On Duty", so a remote
 *     employee currently working is indistinguishable from one at their desk.
 *   · A remote day that falls short of the hours bar grades `half-day`, since
 *     determineHalfDayStatus tests hours before it ever considers WFH. The
 *     `wfh` status only survives on a remote day that made full hours.
 *
 * So the only reliable answer to "was this person in the office" is the flag,
 * and it matters: a WFH day is exempt from the branch fence and from auto
 * punch-out, and an admin reviewing a day with no distance on it needs to know
 * that was intended rather than a tracking failure.
 */
function WfhMark({ record, size = "sm" }: { record: { isWFH?: boolean }; size?: "sm" | "md" }) {
  if (!record?.isWFH) return null;
  return (
    <Badge
      variant="outline"
      title="Worked from home — branch distance not checked, and exempt from auto punch-out for this day."
      className={cn(
        "border-transparent bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold rounded-full inline-flex items-center gap-1",
        size === "md" ? "text-[10px] px-2.5 py-1" : "text-[9px] px-1.5 py-0"
      )}
    >
      <Home className={size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      WFH
    </Badge>
  );
}

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
          <WfhMark record={t} />
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
                    punchIn: t.punchIn ? toDatetimeLocalValue(t.punchIn) : "",
                    punchOut: t.punchOut ? toDatetimeLocalValue(t.punchOut) : "",
                    lunchInTime: t.lunchInTime ? toDatetimeLocalValue(t.lunchInTime) : "",
                    lunchOutTime: t.lunchOutTime ? toDatetimeLocalValue(t.lunchOutTime) : "",
                    status: t.status,
                    isWFH: !!t.isWFH,
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
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [remarkOpenId, setRemarkOpenId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);


  /**
   * Narrow screens drop COLUMNS, they do not change view.
   *
   * Cards were the obvious answer and the wrong one: this screen is read once a
   * day against every employee, so at 50 staff a card list is several thousand
   * pixels of scrolling to answer "who is missing". The table is the right
   * shape -- one scannable line each -- it just cannot carry eleven columns at
   * 360px.
   *
   * So below md the table keeps the five that get read at a glance (staff, in,
   * out, hours, status) and drops date, both lunch times, the selfies and the
   * location. None of those are lost: the date is the one already chosen in the
   * filter bar, and the rest are all in View Details, one tap away.
   */
  const isMobile = useIsMobile();

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
    status: "present" as any,
    // Tracked separately from `status` because they are separate facts: a
    // remote day short of the hours bar grades 'half-day' and is still remote.
    isWFH: false,
  });

  // Default date filter = today (IST — matches how the backend keys each
  // attendance record's `date`, regardless of the browser's own timezone)
  const todayStr = toISTDateKey(new Date());
  const [dateFilter, setDateFilter] = useState<string>(todayStr);

  // Punched in but not yet punched out — shown as "On Duty"
  const getDisplayStatus = (t: AttendanceRecord) => (t.punchIn && !t.punchOut ? "on-duty" : t.status);

  const isToday = (dateStr?: string) => !!dateStr && toISTDateKey(dateStr) === todayStr;

  // Shift name + hours, shown alongside Punch In/Out so admins can visually
  // check a punch against the shift it's being judged late/half-day against —
  // the status badge alone doesn't say what the cutoff actually was.
  const getShiftLabel = (t: AttendanceRecord) => {
    const shift = t.employeeId?.shiftId;
    if (!shift) return null;
    const hours = shift.startTime && shift.endTime ? `${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}` : null;
    return { name: shift.name, hours };
  };

  // Lens/biometric devices only send a generic punch-in/punch-out toggle —
  // they can't tell a lunch break from the real end of day, so today's
  // `punchOut` may just be the most recent lunch-out. Only trust it once the
  // day is over. Use "Session details" (below) to see every raw event for today
  // regardless.


  // Once the employee explicitly punches out via the app, punchOutIsProvisional
  // is cleared server-side even on a Lens-started day — so this shows their
  // real exit immediately instead of waiting for the day to pass.
  const getDisplayPunchOut = (t: AttendanceRecord) =>
    t.punchOutIsProvisional && isToday(t.date) ? null : t.punchOut;

  // lunchInTime/lunchOutTime are only ever written by the lunchIn/lunchOut
  // handlers, and a device reaches those two ways — an explicit `action:
  // 'lunch-in'` from the BOTLens camera, or a tap that a tenant's configured
  // Settings.attendance.punchSequence maps to that step. In the default toggle
  // mode a device never touches these fields at all. So a value being present
  // is itself proof it was a deliberate lunch event, not a guess from a raw
  // re-entry — which is why these are no longer hidden for device records (that
  // was silently dropping correctly-recorded lunch times for sequence tenants).
  const getDisplayLunchIn = (t: AttendanceRecord) => t.lunchInTime;

  const getDisplayLunchOut = (t: AttendanceRecord) => t.lunchOutTime;

  // Who ended the day: the employee, or us on their behalf?
  //
  // A punch-out the 04:00 job invented at shift end renders as an ordinary time
  // and reads exactly like one somebody actually tapped — which is how a day
  // nobody measured gets paid as a full day without anyone noticing. The detail
  // drawer has always labelled it; the list, where an admin actually scans for
  // problems, did not. Timestamp order, never array position: shifts[] is not
  // stored chronologically.
  const CLOSE_META: Record<string, { label: string; className: string }> = {
    shift_end: {
      label: "Auto · unverified",
      className: "border-warning/30 bg-warning/10 text-warning-foreground",
    },
    auto_geofence: {
      label: "Auto exit",
      className: "border-info/30 bg-info/10 text-info",
    },
    regularized: {
      label: "Corrected",
      className: "border-success/30 bg-success/10 text-success",
    },
  };

  const getCloseMeta = (t: AttendanceRecord) => {
    const closed = (t.shifts || []).filter((s) => s?.punchOut);
    if (!closed.length) return null;
    const final = [...closed].sort(
      (a, b) => +new Date(b.punchOut!) - +new Date(a.punchOut!),
    )[0];
    return final?.closeReason ? CLOSE_META[final.closeReason] ?? null : null;
  };

  const SOURCE_META: Record<string, { icon: typeof ScanFace; label: string }> = {
    lens: { icon: ScanFace, label: "Lens (camera)" },
    biometric: { icon: Fingerprint, label: "Biometric device" },
    app: { icon: Smartphone, label: "Phone app" },
  };
  const getSourceMeta = (t: AttendanceRecord) => SOURCE_META[t.source || "app"];

  const todayList = list.filter((t) => isToday(t.date));
  const counts = {
    all: todayList.length,
    present: todayList.filter((t) => ["present", "late", "wfh"].includes(t.status)).length,
    late: todayList.filter((t) => t.status === "late").length,
    halfDay: todayList.filter((t) => t.status === "half-day").length,
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
  const { branches } = useBranchService();

  // Net worked time. Prefers the server's lunch-deducted total; falls back to
  // punchOut - punchIn only when totalWorkMs is absent (older records).
  const workedHours = (t: AttendanceRecord) => {
    const ms = t.totalWorkMs ?? (t.punchIn && t.punchOut
      ? new Date(t.punchOut).getTime() - new Date(t.punchIn).getTime()
      : 0);
    if (!ms || ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  // Steps the selected day by n days. Clamped at today -- attendance cannot be
  // recorded in the future, so letting the arrow run forward only produces
  // empty pages that look like a fault.
  const shiftDay = (n: number) => {
    const base = dateFilter || todayStr;
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + n);
    const next = toISTDateKey(d);
    if (next > todayStr) return;
    setDateFilter(next);
    setTablePage(1);
    setCardPage(1);
  };

  // Exports exactly what is on screen -- every active filter applied -- so the
  // file matches what the person was looking at when they clicked.
  //
  // xlsx is imported dynamically on purpose: a static import pulls ~400KB into
  // the main chunk and pushes the bundle past the PWA precache limit, which
  // breaks the production build outright (see leads.tsx for the same note).
  const exportExcel = async () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export for the current filters.");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((t) => ({
        Staff: t.employeeId?.name || "Unknown",
        Phone: t.employeeId?.phone || "",
        Branch: t.employeeId?.branchId?.branchName || "",
        Shift: t.employeeId?.shiftId?.name || "",
        Date: toISTDateKey(t.date),
        "Punch In": t.punchIn ? formatTime12h(t.punchIn) : "",
        "Lunch In": getDisplayLunchIn(t) ? formatTime12h(getDisplayLunchIn(t)!) : "",
        "Lunch Out": getDisplayLunchOut(t) ? formatTime12h(getDisplayLunchOut(t)!) : "",
        "Punch Out": getDisplayPunchOut(t) ? formatTime12h(getDisplayPunchOut(t)!) : "",
        "Total Hrs": workedHours(t) || "",
        Status: getDisplayStatus(t) === "on-duty" ? "On Duty" : t.status,
        // Its own column rather than folded into Status, which cannot carry it:
        // a remote day reads "On Duty" while open and "half-day" if short.
        WFH: t.isWFH ? "Yes" : "",
        Source: t.source || "app",
        Remarks: t.remarks || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `attendance-${dateFilter || todayStr}.xlsx`);
      toast.success(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Could not generate the Excel file.");
    }
  };

  // Everything EXCEPT the status filter. Split out so the status chips can show
  // counts for the day and filters actually in view -- counting the whole list
  // would show numbers that do not match the rows below them.
  const scopeList = useMemo(() => {
    return list.filter((t) => {
      const name = t.employeeId?.name || "";
      const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchesDate = !dateFilter || (!!t.date && toISTDateKey(t.date) === dateFilter);
      const matchesShift = shiftFilter === "all" || t.employeeId?.shiftId?._id === shiftFilter;
      const matchesBranch = branchFilter === "all" || t.employeeId?.branchId?._id === branchFilter;
      return matchesSearch && matchesDate && matchesShift && matchesBranch;
    });
  }, [list, search, dateFilter, shiftFilter, branchFilter]);

  const matchesStatus = (t: AttendanceRecord, status: string) => {
    if (status === "all") return true;
    // WFH is a flag on the record, not a grade, and the two disagree often
    // enough to matter: an open remote day displays as "on-duty", and a remote
    // day short of the hours bar is stored as 'half-day'. Matching on status
    // alone hid both from this chip -- which is the one an admin clicks to ask
    // "who worked remotely today".
    if (status === "wfh") return !!t.isWFH;
    return getDisplayStatus(t) === status || t.status === status;
  };

  const filtered = useMemo(
    () => scopeList.filter((t) => matchesStatus(t, tab)),
    [scopeList, tab],
  );

  const STATUS_CHIPS = [
    { id: "all", label: "All" },
    { id: "on-duty", label: "On Duty" },
    { id: "present", label: "Full Day" },
    { id: "half-day", label: "Half Day" },
    { id: "late", label: "Late" },
    { id: "absent", label: "Absent" },
    { id: "wfh", label: "WFH" },
  ] as const;

  const chipCount = (status: string) =>
    status === "all" ? scopeList.length : scopeList.filter((t) => matchesStatus(t, status)).length;

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
  const [showAllSessions, setShowAllSessions] = useState(false);

  // Raw device taps for whichever detail sheet is open. Fetched at this level,
  // not inside the panel, so the button can key off taps actually existing.
  // The record's `source` is the wrong signal: it records which channel
  // CREATED the day, so a day opened on the app and later tapped on the
  // terminal reads as 'app' and hid the list for exactly the mixed case where
  // it matters most.
  const { taps: detailTaps, isLoading: detailTapsLoading } = usePunchLog(
    detailRecord?.employeeId?._id,
    detailRecord ? toISTDateKey(new Date(detailRecord.date)) : undefined,
    !!detailRecord,
  );
  // Everything the detail sheet derives from the open record. Declared here,
  // beside detailRecord, so the blocks below can never reference it earlier
  // than it exists.
  // Which session's auto punch-out is expanded in the detail sheet. Null means
  // none picked yet; a single-exit day ignores it and stays open.
  const [focusedExit, setFocusedExit] = useState<number | null>(null);

  const detail = useMemo(() => {
    if (!detailRecord) return null;

    // Session 1 is ALSO the root punchIn/punchOut, so reading both would
    // double-count. shifts[] is authoritative whenever it is populated.
    const sessions: AttendanceSession[] =
      detailRecord.shifts && detailRecord.shifts.length > 0
        ? detailRecord.shifts
        : detailRecord.punchIn
          ? [{ punchIn: detailRecord.punchIn, punchOut: detailRecord.punchOut, punchInSource: detailRecord.source }]
          : [];

    const shiftRef = detailRecord.employeeId?.shiftId;
    const shift = shiftRef
      ? shifts.find((sh) => sh._id === (typeof shiftRef === "string" ? shiftRef : shiftRef._id)) || shiftRef
      : null;

    return {
      sessions,
      shift,
      // Same two settings the server grades with (Settings.attendance).
      lunchMins: Number(appSettings?.attendance?.minLunch ?? 30),
      graceMins: Number(appSettings?.attendance?.lateGrace ?? 0),
    };
  }, [detailRecord, shifts, appSettings]);

  // Reverting an auto punch-out is confirmed rather than immediate: it changes
  // a stored day and, on reopen, puts somebody back on duty.
  const [revertTarget, setRevertTarget] = useState<AttendanceRecord | null>(null);
  const { revert } = useGeofenceMode();

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
      // toISTDateKey, NOT date.slice(0, 10).
      //
      // An attendance `date` is an IST-midnight instant, so the IST day of
      // 17 Sep is stored as "2026-09-16T18:30:00.000Z" — every row's UTC date
      // is one day behind the day it represents. Slicing the ISO string sent
      // the previous day, the server resolved that to a different row, and
      // "Mark Absent" therefore marked the WRONG DAY absent while creating a
      // fresh row for it and leaving the day the admin clicked untouched.
      await markAbsent({ employeeId, date: toISTDateKey(date) });
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
        <PageHeader title="Attendance Dashboard" description="Daily presence tracking and regularizations" />
        <SkeletonLoader type="stats" count={5} />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Dashboard"
        description="Daily presence tracking and regularizations"
        actions={
          <div className="flex gap-2">
            <ActionButton
              variant="download"
              showLabel
              label="Export Excel"
              onClick={exportExcel}
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

      {/* One row, not two. Six tall cards stacked 2x3 pushed the table itself
          below the fold -- the numbers are context, the rows are the point. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Present Today" value={stats?.presentToday ?? counts.present} icon={Check} accent="success" delay={0} />
        <StatCard label="Late Arrivals" value={stats?.lateArrivals ?? counts.late} icon={ClockIcon} accent="warning" delay={0.04} />
        <StatCard label="Half Day Today" value={stats?.halfDayToday ?? counts.halfDay} icon={ClockIcon} accent="warning" delay={0.08} />
        {/* Only takes a slot when there is something to act on. A day that
            could not be graded needs a human, and it used to appear in no card
            at all -- counted as Absent on the dashboard and nowhere here. */}
        {(stats?.needsReviewToday ?? 0) > 0 ? (
          <StatCard label="Needs Review" value={stats?.needsReviewToday ?? 0} icon={AlertCircle} accent="warning" delay={0.12} />
        ) : (
          <StatCard label="On Leave" value={onLeaveCount} icon={CalendarDays} accent="info" delay={0.12} />
        )}
        <div onClick={() => setAbsentSheetOpen(true)} className="cursor-pointer">
          <StatCard label="Absent Today" value={stats?.absentToday ?? counts.absent} icon={UserX} accent="destructive" delay={0.16} />
        </div>
        <div onClick={() => setRegSheetOpen(true)} className="cursor-pointer">
          <StatCard label="Pending Regularizations" value={pendingRegularizations.length} icon={ClipboardList} accent="warning" delay={0.2} />
        </div>
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────────── */}
      {/* Each chip carries its count for the day and filters currently in view,
          so the number always matches the rows below it. Given their own row
          because sharing one with the selects wrapped them onto four lines. */}
      <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_CHIPS.map((c) => {
            const n = chipCount(c.id);
            const active = tab === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setTab(c.id); setTablePage(1); setCardPage(1); }}
                className={cn(
                  "h-9 px-3.5 rounded-xl border text-[12.5px] font-semibold transition-all inline-flex items-center gap-1.5",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground",
                )}
              >
                {c.label}
                <span className={cn("text-[11px] font-bold tabular-nums", active ? "opacity-75" : "text-muted-foreground/60")}>
                  {n}
                </span>
              </button>
            );
          })}
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────────────── */}
      {/* Grid below md, flex from md up. Every control here is `w-full` on
          mobile, and in a flex-wrap row that means each one claims its own
          line -- five filters became five full-width rows above the data. Two
          per row keeps them reachable without scrolling past the whole bar. */}
      <div className="grid grid-cols-2 gap-2.5 py-1 md:flex md:flex-wrap md:items-center">
        <ViewToggle view={view} onViewChange={updateDefaultLayout} />

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

        <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setTablePage(1); setCardPage(1); }}>
          <SelectTrigger className="w-full md:w-[160px] h-10 border border-border/60 bg-muted/20 text-foreground hover:bg-muted/40 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
          <MapPin className="h-3.5 w-3.5" />
          <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/60">
          <SelectItem value="all">All Branches</SelectItem>
          {branches.map((b: any) => (
            <SelectItem key={b._id} value={b._id}>{b.branchName}</SelectItem>
          ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
          className="h-10 w-10 rounded-xl shrink-0"
          >
          <ChevronLeft className="h-4 w-4" />
          </Button>
          <FormInput
          type="date"
          icon={CalendarDays}
          max={todayStr}
          className="h-10 w-full md:w-[170px] shadow-none"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setTablePage(1); setCardPage(1); }}
          />
          <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => shiftDay(1)}
          disabled={!dateFilter || dateFilter >= todayStr}
          aria-label="Next day"
          className="h-10 w-10 rounded-xl shrink-0"
          >
          <ChevronRight className="h-4 w-4" />
          </Button>
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

        <FormInput
        placeholder="Search employee..."
        icon={Search}
        className="h-10 w-full col-span-2 md:col-span-1 md:w-[260px] shadow-none"
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
                subtitle={(() => {
                  const shift = getShiftLabel(t);
                  const dateStr = new Date(t.date).toLocaleDateString();
                  return shift ? `${dateStr} · ${shift.name}${shift.hours ? ` (${shift.hours})` : ""}` : `${dateStr} · No Shift`;
                })()}
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
                // Worked hours are a column in the table view but had no place
                // in the card. That was survivable while the card was opt-in;
                // it is not now that phones always get the card, because "how
                // long did they work" is the question this screen exists to
                // answer. Same helper as the table cell and the CSV export, so
                // the three cannot disagree.
                metaRight={{ icon: ClockIcon, label: workedHours(t) || "--:--" }}
                statusNode={
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-bold px-2 py-0 border-transparent rounded-full",
                        getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                          statusClass(t.status)
                      )}
                    >{getDisplayStatus(t) === "on-duty" ? "On Duty" : statusLabel(t.status)}</Badge>
                    <WfhMark record={t} />
                    {(() => {
                      const { icon: SourceIcon, label } = getSourceMeta(t);
                      return (
                        <span title={label} className="text-muted-foreground/60">
                          <SourceIcon className="h-3.5 w-3.5" />
                        </span>
                      );
                    })()}
                  </div>
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
                      <DropdownMenuItem onClick={() => { setDetailRecord(t); setShowAllSessions(false); }}>View Details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setModifyForm({
                          id: t._id,
                          punchIn: t.punchIn ? toDatetimeLocalValue(t.punchIn) : "",
                          punchOut: t.punchOut ? toDatetimeLocalValue(t.punchOut) : "",
                          lunchInTime: t.lunchInTime ? toDatetimeLocalValue(t.lunchInTime) : "",
                          lunchOutTime: t.lunchOutTime ? toDatetimeLocalValue(t.lunchOutTime) : "",
                          status: t.status,
                    isWFH: !!t.isWFH,
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
                      {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayLunchIn(t) ? new Date(getDisplayLunchIn(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayLunchOut(t) ? new Date(getDisplayLunchOut(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayPunchOut(t) ? new Date(getDisplayPunchOut(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
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
              headers={isMobile
                ? ["Staff", "In", "Out", "Hrs", "Status", ""]
                : ["Staff", "Date", "Punch In", "Lunch In", "Lunch Out", "Punch Out", "Selfie", "Total Hrs", "Location", "Status", "Actions"]}
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
                  {/* Date: already chosen in the filter bar above. */}
                  {!isMobile && (
                    <DataTableCell className="text-[13px] text-muted-foreground">{new Date(t.date).toLocaleDateString()}</DataTableCell>
                  )}
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                  </DataTableCell>
                  {!isMobile && (
                    <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                      {getDisplayLunchIn(t) ? new Date(getDisplayLunchIn(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    </DataTableCell>
                  )}
                  {!isMobile && (
                    <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                      {getDisplayLunchOut(t) ? new Date(getDisplayLunchOut(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    </DataTableCell>
                  )}
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {getDisplayPunchOut(t) ? new Date(getDisplayPunchOut(t)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : <span className="text-muted-foreground/40">--:--</span>}
                    {(() => {
                      const meta = getCloseMeta(t);
                      return meta ? (
                        <span
                          className={cn(
                            "mt-0.5 block w-fit rounded border px-1 py-px font-sans text-[8px] font-black uppercase tracking-wide",
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
                      ) : null;
                    })()}
                  </DataTableCell>
                  {/* Selfies: too wide for a phone row; both are in View Details. */}
                  {!isMobile && (
                      <DataTableCell>
                        <div className="flex items-center gap-1.5">
                          {([["IN", t.punchInPhoto], ["OUT", t.punchOutPhoto]] as const).map(([label, src]) => (
                            <div key={label} className="flex flex-col items-center gap-0.5">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</span>
                              {src ? (
                                <img
                                  src={src}
                                  alt={`${label} selfie`}
                                  loading="lazy"
                                  className="h-8 w-8 rounded-lg object-cover border border-border/50"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-lg bg-muted/40 border border-border/40 grid place-items-center text-muted-foreground/40 text-[11px]">
                                  –
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </DataTableCell>
                  )}
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {workedHours(t) ?? <span className="text-muted-foreground/40">—</span>}
                  </DataTableCell>
                  {!isMobile && (
                    <DataTableCell className="text-[12px] text-muted-foreground max-w-[150px] truncate italic">
                      {t.punchInLocation && typeof t.punchInLocation === 'object'
                        ? `${t.punchInLocation.lat?.toFixed(2)}, ${t.punchInLocation.lng?.toFixed(2)}`
                        : (t.punchInLocation || "N/A")}
                    </DataTableCell>
                  )}
                  <DataTableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] font-bold px-2 py-0.5 border-transparent",
                          getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                            statusClass(t.status)
                        )}
                      >{getDisplayStatus(t) === "on-duty" ? "On Duty" : statusLabel(t.status)}</Badge>
                    <WfhMark record={t} />
                      {(() => {
                        const { icon: SourceIcon, label } = getSourceMeta(t);
                        return (
                          <span title={label} className="text-muted-foreground/60">
                            <SourceIcon className="h-3.5 w-3.5" />
                          </span>
                        );
                      })()}
                    </div>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end items-center gap-1">
                      <ActionButton
                        variant="view"
                        tooltip="View Details"
                        onClick={() => { setDetailRecord(t); setShowAllSessions(false); }}
                      />
                      {canEdit && (
                      <ActionButton
                        variant="edit"
                        tooltip="Edit Punch"
                        onClick={() => {
                          setModifyForm({
                            id: t._id,
                            punchIn: t.punchIn ? toDatetimeLocalValue(t.punchIn) : "",
                            punchOut: t.punchOut ? toDatetimeLocalValue(t.punchOut) : "",
                            lunchInTime: t.lunchInTime ? toDatetimeLocalValue(t.lunchInTime) : "",
                            lunchOutTime: t.lunchOutTime ? toDatetimeLocalValue(t.lunchOutTime) : "",
                            status: t.status,
                    isWFH: !!t.isWFH,
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
                  status: modifyForm.status,
                  isWFH: modifyForm.isWFH
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
                { label: "WFH", value: "wfh" },
                { label: "Absent", value: "absent" },
                { label: "Needs review", value: "needs_review" },
              ]}
              containerClassName="space-y-1"
            />

            {/* Its own control, not folded into Status.
                A remote day that fell short of the hours bar is graded
                'half-day' and is still remote, so the two cannot share one
                field. Setting Status to "WFH" turns this on by itself
                (server-side too), but the reverse is not implied. */}
            <div className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              modifyForm.isWFH
                ? "border-indigo-400/50 bg-indigo-500/10"
                : "border-border/60 bg-muted/20"
            )}>
              <div className="space-y-0.5">
                <p className="text-[12px] font-bold flex items-center gap-1.5">
                  <Home className={cn("h-3.5 w-3.5", modifyForm.isWFH ? "text-indigo-500" : "text-muted-foreground")} />
                  Worked from home
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Marks the day remote. Branch distance is not checked and auto punch-out is skipped.
                </p>
              </div>
              <Switch
                checked={modifyForm.isWFH}
                onCheckedChange={(v) => setModifyForm({ ...modifyForm, isWFH: v })}
                className="scale-90"
              />
            </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      {/* Undo an auto punch-out. Two outcomes, because the two real situations
          differ: the engine was wrong (reopen), or it was right about the exit
          but wrong about the time (correct it via Modify Punch Time). */}
      <Dialog open={!!revertTarget} onOpenChange={(o) => !o && setRevertTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Undo this auto punch-out?</DialogTitle>
            <DialogDescription className="text-[12px]">
              {revertTarget?.employeeId?.name} was punched out automatically
              {revertTarget?.calculatedDistance != null && ` at ${revertTarget.calculatedDistance}m from their branch`}.
              Reopening puts them back on duty and clears the geo-fence verdict for the day.
            </DialogDescription>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            If they <span className="font-bold text-foreground">did</span> leave but at a different time, close this
            and use <span className="font-bold text-foreground">Modify Punch Time</span> instead — that keeps the
            day closed with the correct hours.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setRevertTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-xl font-bold"
              disabled={revert.isPending}
              onClick={async () => {
                if (!revertTarget?._id) return;
                await revert.mutateAsync({ attendanceId: revertTarget._id, mode: "reopen" });
                setRevertTarget(null);
                setDetailRecord(null);
              }}
            >
              {revert.isPending ? "Reopening…" : "Reopen session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailRecord} onOpenChange={(o) => !o && setDetailRecord(null)}>
        <SheetContent className="sm:max-w-lg w-full p-0 border-l border-border/40">
          {detailRecord && (
            <div className="h-full flex flex-col">
              <SheetHeader className="p-6 pb-4 pr-12 border-b border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-black px-3 py-1 rounded-full border-transparent",
                        getDisplayStatus(detailRecord) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                          statusClass(detailRecord.status)
                      )}
                    >
                      {getDisplayStatus(detailRecord) === "on-duty" ? "On Duty" : statusLabel(detailRecord.status)}
                    </Badge>
                    <WfhMark record={detailRecord} size="md" />
                    {(() => {
                      const { icon: SourceIcon, label } = getSourceMeta(detailRecord);
                      return (
                        <span title={label} className="text-muted-foreground/60">
                          <SourceIcon className="h-4 w-4" />
                        </span>
                      );
                    })()}
                    {detailTaps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSessions((v) => !v)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary/80 hover:text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 transition-colors"
                      >
                        <ListChecks className="h-3 w-3" />
                        Raw Taps
                        <ChevronDown className={`h-3 w-3 transition-transform ${showAllSessions ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
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
                      {getDisplayPunchOut(detailRecord) ? new Date(getDisplayPunchOut(detailRecord)!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
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
                    <span>{getDisplayLunchIn(detailRecord) ? new Date(getDisplayLunchIn(detailRecord)!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                    <span className="text-muted-foreground font-sans font-normal text-[11px]">to</span>
                    <span>{getDisplayLunchOut(detailRecord) ? new Date(getDisplayLunchOut(detailRecord)!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                  </div>
                  {getDisplayLunchIn(detailRecord) && getDisplayLunchOut(detailRecord) && (() => {
                    const mins = Math.round((new Date(getDisplayLunchOut(detailRecord)!).getTime() - new Date(getDisplayLunchIn(detailRecord)!).getTime()) / 60000);
                    return mins > maxLunchMinutes ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] gap-1 py-0 px-1.5 font-bold">
                        <ShieldAlert className="h-3 w-3" /> Lunch overrun ({mins}m over {maxLunchMinutes}m limit)
                      </Badge>
                    ) : null;
                  })()}
                </Card>

                {/* Every session, each END tagged with the channel that
                    reported it -- in on the phone, out on the machine. */}
                {detail && detail.sessions.length > 0 && (
                  <SessionTimeline
                    sessions={detail.sessions}
                    totalWorkMs={detailRecord.totalWorkMs}
                    onAutoExitClick={(i) => {
                      setFocusedExit(i);
                      // The card can sit below the fold on a long day, so
                      // opening it is not enough -- it has to be brought into
                      // view or the click looks like it did nothing.
                      requestAnimationFrame(() => {
                        document
                          .getElementById(`auto-exit-${i}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      });
                    }}
                  />
                )}

                {showAllSessions && detailTaps.length > 0 && (
                  <RawTapList taps={detailTaps} isLoading={detailTapsLoading} />
                )}

                {/* Worked hours come from the server's totalWorkMs, which is
                    already lunch-deducted and clamped to the shift. This used
                    to recompute punchOut - punchIn in the browser, so it
                    ignored the break and every session after the first, and
                    disagreed with the figure payroll actually pays. */}
                <DayStatsRow record={detailRecord} displayStatus={getDisplayStatus(detailRecord)} />

                <AutoPunchOutCard
                  record={detailRecord}
                  onRevert={() => setRevertTarget(detailRecord)}
                  focusIndex={focusedExit}
                  onFocusChange={setFocusedExit}
                />

                {detail && (
                  <>
                    <ShiftRequirementCard
                      shift={detail.shift}
                      lunchMins={detail.lunchMins}
                      graceMins={detail.graceMins}
                      workedMs={detailRecord.totalWorkMs || 0}
                    />
                    <WhyHalfDay
                      record={detailRecord}
                      sessions={detail.sessions}
                      shift={detail.shift}
                      lunchMins={detail.lunchMins}
                      graceMins={detail.graceMins}
                    />
                  </>
                )}

                <GeofenceExitBanner record={detailRecord} />
                <InsideFenceNote record={detailRecord} />

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Remarks</span>
                  <div className="font-medium text-foreground/80 text-[13px]">{detailRecord.remarks || "—"}</div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
