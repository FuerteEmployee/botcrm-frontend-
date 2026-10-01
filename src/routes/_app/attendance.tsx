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
import { useAttendanceService, useAttendanceStats, useAbsentToday, usePunchLog, type AttendanceRecord, type AttendanceEdit, type AttendanceSession, type PunchLogTap } from "@/services/attendance-service";
import { CorrectionReviewDialog } from "@/components/attendance/attendance-corrections-panel";
import type { Regularization } from "@/services/regularization-service";
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
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn, toISTDateKey, formatTime12h } from "@/lib/utils";
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

// ─── IST display helpers ─────────────────────────────────────────────────────
//
// Every attendance day is an IST day (the server keys `date` to IST midnight),
// so its times are read in IST too -- not in the admin's browser timezone.
//
// These replace two different mistakes. `formatTime12h` expects "HH:mm", and
// was being handed ISO timestamps for the raw tap list and the Excel export:
// "2026-09-25T04:01:00.000Z".split(":") reads the hour as NaN, which falls back
// to 12, so every tap and every exported punch came out as "12:0x AM" (09:31
// read "12:01 AM"). And `toLocaleTimeString([])` / `toLocaleDateString()` use
// the browser's zone, so an admin outside IST saw every time shifted and every
// date one day early.
const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "09:31 AM" for a real instant, in IST. "" when there is none. */
function fmtClock(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: true });
}

/** "25 Sep 2026" for a real instant (or a YYYY-MM-DD key), in IST. */
function fmtDay(value?: string | null): string {
  if (!value) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { timeZone: IST_TZ, day: "numeric", month: "short", year: "numeric" });
}

/** A datetime-local value ("YYYY-MM-DDTHH:mm") as IST wall clock -- how the server parses it. */
function toISTInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** The instant an IST wall-clock "YYYY-MM-DDTHH:mm" names. */
function istInputToMs(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST_OFFSET_MS;
}

/** YYYY-MM-DD `n` days from `key`, by calendar (no timezone involved). */
function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

const isOvernight = (shift?: { startTime?: string; endTime?: string } | null) =>
  !!shift?.startTime && !!shift?.endTime && shift.endTime <= shift.startTime;

type EditTimes = { punchIn: string; punchOut: string; lunchInTime: string; lunchOutTime: string };

/**
 * The edit dialog's rules, mirrored from the server (updateAttendance) so the
 * admin is told before a round trip. The server enforces the same ones: the
 * day and "not in the future" apply to the times being CHANGED, the ordering
 * rules to the day as it would be saved.
 */
function editProblem(f: EditTimes, orig: EditTimes, dayKey: string, overnight: boolean): string | null {
  const labels: Record<string, string> = { punchIn: "Punch in", punchOut: "Punch out", lunchInTime: "Lunch in", lunchOutTime: "Lunch out" };
  const nextDay = addDaysKey(dayKey, 1);
  for (const k of ["punchIn", "punchOut", "lunchInTime", "lunchOutTime"] as const) {
    const v = f[k];
    if (!v || v === orig[k]) continue;
    const day = v.slice(0, 10);
    const endField = k === "punchOut" || k === "lunchOutTime";
    if (day !== dayKey && !(endField && overnight && day === nextDay)) {
      return `${labels[k]} must be on ${fmtDay(dayKey)} — the day you are editing.`;
    }
    if (istInputToMs(v) > Date.now() + 60_000) return `${labels[k]} cannot be in the future.`;
  }
  if (f.punchOut && !f.punchIn) return "A punch out needs a punch in.";
  if (f.punchIn && f.punchOut && f.punchOut <= f.punchIn) return "Punch out must be after punch in.";
  if (f.lunchOutTime && !f.lunchInTime) return "A lunch end needs a lunch start.";
  if (f.lunchInTime && f.lunchOutTime && f.lunchOutTime <= f.lunchInTime) return "Lunch end must be after lunch start.";
  if ((f.lunchInTime || f.lunchOutTime) && !f.punchIn) return "Lunch needs a punch in on the same day.";
  return null;
}

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
                {fmtClock(t.deviceTime)}
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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-4 px-1">
      <p className="text-[12px] text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{" "}
        <span className="font-semibold text-foreground">{totalItems}</span> records
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg border-border/50"
          aria-label="Previous page"
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
                "h-10 w-10 sm:h-8 sm:w-8 rounded-lg text-[12px] font-semibold",
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
          className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg border-border/50"
          aria-label="Next page"
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

// ─── Page Size Constants ─────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const CARD_PAGE_SIZE = 12;

// With no day picked, the list covers this many days back from today. The page
// used to fetch every attendance row the tenant has ever had (342 rows / 785 KB
// on the test tenant, and growing every day) and filter by date in the browser.
const RECENT_DAYS = 31;

function AttendancePage() {
  // Default date filter = today (IST — matches how the backend keys each
  // attendance record's `date`, regardless of the browser's own timezone)
  const todayStr = toISTDateKey(new Date());
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const rangeStart = dateFilter || addDaysKey(todayStr, -(RECENT_DAYS - 1));
  const rangeEnd = dateFilter || todayStr;
  const {
    records: list, isLoading, isError: listFailed, isFetching, refetch: refetchList,
    updateAttendance, isUpdating, markAbsent,
  } = useAttendanceService(rangeStart, rangeEnd, undefined, { keepPrevious: true });
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

  // The cards, the absent rows and the Absent sheet describe ONE day: the day
  // picked in the filter bar, or today while the last 31 days are listed. They
  // used to be today's whatever day the list showed, so picking 29 Sep showed
  // 29 Sep's rows under today's numbers.
  const statsDate = dateFilter && dateFilter !== todayStr ? dateFilter : undefined;
  const { stats } = useAttendanceStats(statsDate);
  const { absentees } = useAbsentToday(statsDate);
  const dayWord = statsDate ? `on ${fmtDay(statsDate)}` : "Today";
  const { regularizations, submitRegularization, approveRegularization, rejectRegularization, isSubmitting } = useRegularizationService();
  const { shifts } = useShiftService();
  // Every active employee: the correction picker used to stop at the first 200.
  const { employees } = useEmployeeService({ status: "active" });

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
    name: "",
    dayKey: "",
    overnight: false,
    punchIn: "",
    punchOut: "",
    lunchInTime: "",
    lunchOutTime: "",
    // "auto" = grade the day from the times, exactly as a real punch-out would.
    // The select used to be prefilled with the CURRENT status and always sent,
    // so correcting a late arrival kept the day graded late.
    status: "auto" as string,
    // Tracked separately from `status` because they are separate facts: a
    // remote day short of the hours bar grades 'half-day' and is still remote.
    isWFH: false,
    orig: { punchIn: "", punchOut: "", lunchInTime: "", lunchOutTime: "" } as EditTimes,
  });
  const [modifyError, setModifyError] = useState<string | null>(null);

  // One place that opens the editor, for the table, the cards and the sheet.
  const openEdit = (t: AttendanceRecord) => {
    const orig: EditTimes = {
      punchIn: toISTInput(t.punchIn),
      punchOut: toISTInput(t.punchOut),
      lunchInTime: toISTInput(t.lunchInTime),
      lunchOutTime: toISTInput(t.lunchOutTime),
    };
    setModifyForm({
      id: t._id,
      name: t.employeeId?.name || "Employee",
      dayKey: toISTDateKey(t.date),
      overnight: isOvernight(t.employeeId?.shiftId),
      // IST wall clock, which is how the server reads a bare datetime-local.
      punchIn: toISTInput(t.punchIn),
      punchOut: toISTInput(t.punchOut),
      lunchInTime: toISTInput(t.lunchInTime),
      lunchOutTime: toISTInput(t.lunchOutTime),
      status: "auto",
      isWFH: !!t.isWFH,
      orig,
    });
    setModifyError(null);
    setModifyOpen(true);
  };

  const isToday = (dateStr?: string) => !!dateStr && toISTDateKey(dateStr) === todayStr;

  // Punched in but not yet punched out — shown as "On Duty". A device punch-out
  // today is provisional (it may be a lunch exit), and the list already hides
  // its time for that reason; the status has to agree, or the row read
  // "Half Day" with no punch-out beside it while the person was still at work.
  const getDisplayStatus = (t: AttendanceRecord) =>
    t.punchIn && (!t.punchOut || (t.punchOutIsProvisional && isToday(t.date))) ? "on-duty" : t.status;

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
    absent: todayList.filter((t) => t.status === "absent").length + absentees.length,
  };

  // On Leave comes from the server's day classification (approved Leave
  // records covering today). It used to count approved "Leave" TICKETS, which
  // leaves stopped being -- so it read 0 whoever was on leave.
  const onLeaveCount = stats?.onLeaveToday ?? 0;

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

  // A row made from today's absentee list, not a stored attendance record. It
  // has no id the server knows, so it gets no edit/remark/detail actions.
  const isVirtualAbsent = (t: AttendanceRecord) => (t as { virtualAbsent?: boolean }).virtualAbsent === true;

  // Ticks once a minute so "hours so far" moves while the page is open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Hours worked so far for someone still on duty today: every session, the
  // open one up to now, less any punched lunch inside them. The stored
  // totalWorkMs only counts closed sessions, so an open day showed "—". A
  // shift's fixed lunch deduction is applied by the server when the day closes,
  // so the final figure can be lower than this.
  const liveWorkedHours = (t: AttendanceRecord) => {
    const sessions = (t.shifts?.length ? t.shifts : [{ punchIn: t.punchIn, punchOut: undefined }] as unknown as AttendanceSession[])
      .filter((s) => s?.punchIn);
    const lunchStart = t.lunchInTime ? +new Date(t.lunchInTime) : null;
    const lunchEnd = t.lunchOutTime ? +new Date(t.lunchOutTime) : nowMs;
    const lunchWithin = (from: number, to: number) =>
      lunchStart === null ? 0 : Math.max(0, Math.min(to, lunchEnd) - Math.max(from, lunchStart));
    const ms = sessions.reduce((total, s) => {
      const from = +new Date(s.punchIn!);
      const to = s.punchOut ? +new Date(s.punchOut) : nowMs;
      return total + Math.max(0, to - from - lunchWithin(from, to));
    }, 0);
    if (ms <= 0) return null;
    return `${Math.floor(ms / 3600000)}:${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}`;
  };

  // What the Hours cell shows: a running figure while on duty today, otherwise
  // the stored total.
  const hoursFor = (t: AttendanceRecord): { text: string; live: boolean } | null => {
    if (isVirtualAbsent(t)) return null;
    if (getDisplayStatus(t) === "on-duty" && isToday(t.date)) {
      const live = liveWorkedHours(t);
      return live ? { text: live, live: true } : null;
    }
    const total = workedHours(t);
    return total ? { text: total, live: false } : null;
  };

  // How late the day started, against the shift's start time (IST). Shown on
  // the row itself: "Late" used to exist only as a chip count, so every late
  // arrival's row read plain "On Duty".
  const lateMinutes = (t: AttendanceRecord): number | null => {
    if (!t.punchIn || !(t.status === "late" || t.wasLate)) return null;
    const start = t.employeeId?.shiftId?.startTime;
    const [h, m] = String(start || "").split(":").map(Number);
    if (!Number.isFinite(h)) return null;
    const ist = new Date(+new Date(t.punchIn) + 5.5 * 3600_000);
    let diff = ist.getUTCHours() * 60 + ist.getUTCMinutes() - (h * 60 + (Number.isFinite(m) ? m : 0));
    if (diff < -720) diff += 1440; // a night shift's punch after midnight
    return diff > 0 ? diff : null;
  };
  const lateLabel = (t: AttendanceRecord) => {
    const n = lateMinutes(t);
    if (n === null) return null;
    return n < 60 ? `Late ${n} min` : `Late ${Math.floor(n / 60)}h ${n % 60}m`;
  };

  // Steps the selected day by n days. Clamped at today -- attendance cannot be
  // recorded in the future, so letting the arrow run forward only produces
  // empty pages that look like a fault.
  const shiftDay = (n: number) => {
    const base = dateFilter || todayStr;
    const next = addDaysKey(base, n);
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
        "Punch In": fmtClock(t.punchIn),
        "Lunch In": fmtClock(getDisplayLunchIn(t)),
        "Lunch Out": fmtClock(getDisplayLunchOut(t)),
        "Punch Out": fmtClock(getDisplayPunchOut(t)),
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
      XLSX.writeFile(wb, dateFilter ? `attendance-${dateFilter}.xlsx` : `attendance-${rangeStart}-to-${rangeEnd}.xlsx`);
      toast.success(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Could not generate the Excel file.");
    }
  };

  // Today's absentees as rows. Someone who never punched has no attendance
  // record, so the list (and its Absent chip) only ever held people who came in:
  // the card said "Absent Today 22" while the chip below it said "Absent 0" and
  // the absent people could not be found on the page at all. The names come from
  // the server's day classification -- the same one behind the card -- so the
  // chip and the card agree, and leave, weekly offs and holidays are already
  // excluded. For the one day picked (or today); not in the 31-day range view.
  const listWithAbsent = useMemo(() => {
    if (!dateFilter || absentees.length === 0) return list;
    const inList = new Set(list.filter((t) => !!t.date && toISTDateKey(t.date) === dateFilter).map((t) => t.employeeId?._id));
    const rows = absentees
      .filter((e) => !inList.has(e._id))
      .map((e) => ({
        _id: `absent-${e._id}`,
        employeeId: { _id: e._id, name: e.name, phone: e.phone, shiftId: e.shiftId, branchId: e.branchId },
        date: `${dateFilter}T00:00:00+05:30`,
        status: "absent",
        virtualAbsent: true,
      }) as unknown as AttendanceRecord);
    return [...list, ...rows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, absentees, dateFilter, todayStr]);

  // Everything EXCEPT the status filter. Split out so the status chips can show
  // counts for the day and filters actually in view -- counting the whole list
  // would show numbers that do not match the rows below them.
  const scopeList = useMemo(() => {
    return listWithAbsent.filter((t) => {
      const name = t.employeeId?.name || "";
      const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchesDate = !dateFilter || (!!t.date && toISTDateKey(t.date) === dateFilter);
      const matchesShift = shiftFilter === "all" || t.employeeId?.shiftId?._id === shiftFilter;
      const matchesBranch = branchFilter === "all" || t.employeeId?.branchId?._id === branchFilter;
      return matchesSearch && matchesDate && matchesShift && matchesBranch;
    });
  }, [listWithAbsent, search, dateFilter, shiftFilter, branchFilter]);

  const matchesStatus = (t: AttendanceRecord, status: string) => {
    if (status === "all") return true;
    // WFH is a flag on the record, not a grade, and the two disagree often
    // enough to matter: an open remote day displays as "on-duty", and a remote
    // day short of the hours bar is stored as 'half-day'. Matching on status
    // alone hid both from this chip -- which is the one an admin clicks to ask
    // "who worked remotely today".
    if (status === "wfh") return !!t.isWFH;
    // Late is an observation about the ARRIVAL. Punch-out re-grades a late day
    // to present/half-day and keeps the fact in `wasLate`, so matching the
    // status alone dropped every late arrival from this chip once they went home.
    if (status === "late") return t.status === "late" || !!t.wasLate;
    // Full Day / Half Day / Absent are verdicts on a finished day. Matching the
    // stored status too counted everyone still at work (stored 'present' at
    // punch-in) as a Full Day.
    return getDisplayStatus(t) === status;
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
    // Only rendered when there is one: a day nobody could grade needs a person.
    { id: "needs_review", label: "Needs review" },
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
    } catch {
      // The service toasts the reason; keep the dialog and the text.
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = editProblem(modifyForm, modifyForm.orig, modifyForm.dayKey, modifyForm.overnight);
    if (problem) {
      setModifyError(problem);
      return;
    }
    setModifyError(null);
    try {
      await updateAttendance({
        id: modifyForm.id,
        data: {
          // "" clears a time; the server re-grades from whatever is left.
          punchIn: modifyForm.punchIn,
          punchOut: modifyForm.punchOut,
          lunchInTime: modifyForm.lunchInTime,
          lunchOutTime: modifyForm.lunchOutTime,
          status: modifyForm.status as AttendanceEdit["status"],
          isWFH: modifyForm.isWFH,
        },
      });
      setModifyOpen(false);
    } catch (err) {
      // The server's own reason, kept beside the fields as well as in the toast.
      const res = (err as { response?: { status?: number; data?: { message?: unknown } } })?.response;
      if (typeof res?.data?.message === "string" && (res.status ?? 500) < 500) setModifyError(res.data.message);
    }
  };

  // Absent Today / Pending Regularizations / Attendance Detail / Request Correction
  const [absentSheetOpen, setAbsentSheetOpen] = useState(false);
  const [regSheetOpen, setRegSheetOpen] = useState(false);
  const [detailSnap, setDetailRecord] = useState<AttendanceRecord | null>(null);
  // Read through to the list, so the open sheet shows the saved values after
  // an edit instead of the snapshot taken when it was opened.
  const detailRecord = detailSnap ? (list.find((r) => r._id === detailSnap._id) ?? detailSnap) : null;
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [absentTarget, setAbsentTarget] = useState<{ employeeId: string; name: string; date: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Regularization | null>(null);

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
  // Times are "HH:mm" on the chosen date. They were four datetime-local inputs
  // beside a separate Date field, so a time could be picked on a different day
  // from the one being corrected -- which approval then refused.
  const emptyCorrection = {
    employeeId: "",
    date: todayStr,
    requestedPunchIn: "",
    requestedPunchOut: "",
    requestedLunchInTime: "",
    requestedLunchOutTime: "",
    reason: "",
  };
  const [correctionForm, setCorrectionForm] = useState(emptyCorrection);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

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
    } catch {
      // The service toasts the reason.
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = correctionForm;
    if (!f.employeeId || !f.date || !f.reason.trim()) {
      setCorrectionError("Please select an employee, date, and reason.");
      return;
    }
    if (!f.requestedPunchIn && !f.requestedPunchOut && !f.requestedLunchInTime && !f.requestedLunchOutTime) {
      setCorrectionError("Enter at least one corrected time.");
      return;
    }
    if (f.requestedPunchIn && f.requestedPunchOut && f.requestedPunchOut <= f.requestedPunchIn) {
      setCorrectionError("Punch out must be after punch in.");
      return;
    }
    if (f.requestedLunchInTime && f.requestedLunchOutTime && f.requestedLunchOutTime <= f.requestedLunchInTime) {
      setCorrectionError("Lunch out must be after lunch in.");
      return;
    }
    const at = (hhmm: string) => (hhmm ? `${f.date}T${hhmm}` : undefined);
    if ([f.requestedPunchIn, f.requestedPunchOut, f.requestedLunchInTime, f.requestedLunchOutTime]
      .some((v) => v && istInputToMs(`${f.date}T${v}`) > Date.now() + 60_000)) {
      setCorrectionError("A corrected time cannot be in the future.");
      return;
    }
    setCorrectionError(null);
    try {
      await submitRegularization({
        employeeId: f.employeeId,
        date: f.date,
        requestedPunchIn: at(f.requestedPunchIn),
        requestedPunchOut: at(f.requestedPunchOut),
        requestedLunchInTime: at(f.requestedLunchInTime),
        requestedLunchOutTime: at(f.requestedLunchOutTime),
        reason: f.reason.trim(),
      });
      setCorrectionOpen(false);
      setCorrectionForm(emptyCorrection);
    } catch { /* the service toasts the reason; keep what was typed */ }
  };

  if (isLoading && list.length === 0) {
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
            {/* No row-less "Modify Punch" here: the dialog edits ONE day, and
                opened from the header it had no row -- it PUT to /attendance/
                (a 404, silently) or re-opened whichever row was edited last.
                Edit is on each row and in the day's detail sheet. */}
          </div>
        }
      />

      {/* One row, not two. Six tall cards stacked 2x3 pushed the table itself
          below the fold -- the numbers are context, the rows are the point. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label={`Present ${dayWord}`} value={stats?.presentToday ?? counts.present} icon={Check} accent="success" delay={0} />
        <StatCard label="Late Arrivals" value={stats?.lateArrivals ?? counts.late} icon={ClockIcon} accent="warning" delay={0.04} />
        <StatCard label={`Half Day ${dayWord}`} value={stats?.halfDayToday ?? counts.halfDay} icon={ClockIcon} accent="warning" delay={0.08} />
        {/* Only takes a slot when there is something to act on. A day that
            could not be graded needs a human, and it used to appear in no card
            at all -- counted as Absent on the dashboard and nowhere here. */}
        {(stats?.needsReviewToday ?? 0) > 0 ? (
          <StatCard label="Needs Review" value={stats?.needsReviewToday ?? 0} icon={AlertCircle} accent="warning" delay={0.12} />
        ) : (
          <StatCard label="On Leave" value={onLeaveCount} icon={CalendarDays} accent="info" delay={0.12} />
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label="Show who is absent today"
          onClick={() => setAbsentSheetOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbsentSheetOpen(true); } }}
          className="cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <StatCard label={`Absent ${dayWord}`} value={stats?.absentToday ?? counts.absent} icon={UserX} accent="destructive" delay={0.16} />
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Show pending correction requests"
          onClick={() => setRegSheetOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRegSheetOpen(true); } }}
          className="cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
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
            if (c.id === "needs_review" && n === 0 && !active) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setTab(c.id); setTablePage(1); setCardPage(1); }}
                className={cn(
                  "h-10 sm:h-9 px-3.5 rounded-xl border text-[12.5px] font-semibold transition-all inline-flex items-center gap-1.5",
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

        {/* A full row below md. In one half of the two-column grid the date
            input, the arrows and the Today / 31-days buttons did not fit, and
            the next-day arrow and the range button were pushed off-screen. */}
        <div className="col-span-2 md:col-span-1 flex items-center gap-2 min-w-0">
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
          aria-label="Day"
          containerClassName="flex-1 min-w-0 md:flex-none"
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
        </div>

        <FormInput
        placeholder="Search employee..."
        icon={Search}
        aria-label="Search employee"
        // The grid item is FormInput's container, so the span goes there. On
        // the input itself it did nothing and the search box was half width.
        containerClassName="col-span-2 md:col-span-1"
        className="h-10 w-full md:w-[260px] shadow-none"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setTablePage(1); setCardPage(1); }}
        />
      </div>

      {!dateFilter && (
        <p className="text-[12px] text-muted-foreground -mt-2">
          Showing the last {RECENT_DAYS} days ({fmtDay(rangeStart)} – {fmtDay(rangeEnd)}). Pick a date to see one day.
        </p>
      )}

      {listFailed && list.length === 0 ? (
        // A failed load used to fall through to "No logs found", which tells
        // the admin nobody came in -- the opposite of what is known.
        <div className="flex flex-col items-center justify-center gap-3 py-14 rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 text-center">
          <AlertCircle className="h-7 w-7 text-destructive/70" />
          <p className="text-[13px] text-foreground">Could not load attendance.</p>
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => refetchList()} disabled={isFetching}>
            {isFetching ? "Loading…" : "Try again"}
          </Button>
        </div>
      ) : (
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
                  const dateStr = fmtDay(t.date);
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
                metaRight={{ icon: ClockIcon, label: (() => { const h = hoursFor(t); return h ? (h.live ? `${h.text} so far` : h.text) : "--:--"; })() }}
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
                    {lateLabel(t) && (
                      <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 border-transparent rounded-full bg-warning/15 text-warning-foreground whitespace-nowrap">
                        {lateLabel(t)}
                      </Badge>
                    )}
                    <WfhMark record={t} />
                    {!isVirtualAbsent(t) && (() => {
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
                  canEdit && !isVirtualAbsent(t) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-10 w-10 sm:h-8 sm:w-8 p-0" aria-label={`Actions for ${t.employeeId?.name || "this day"}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setDetailRecord(t); setShowAllSessions(false); }}>View Details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(t)}>Edit Punch</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>
                      {t.status !== "absent" && (
                        <DropdownMenuItem className="text-destructive" onClick={() => setAbsentTarget({ employeeId: t.employeeId._id, name: t.employeeId?.name || "this employee", date: t.date })}>Mark Absent</DropdownMenuItem>
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
                      {t.punchIn ? fmtClock(t.punchIn) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayLunchIn(t) ? fmtClock(getDisplayLunchIn(t)) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayLunchOut(t) ? fmtClock(getDisplayLunchOut(t)) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {getDisplayPunchOut(t) ? fmtClock(getDisplayPunchOut(t)) : <span className="text-muted-foreground/40">--:--</span>}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground mb-1 line-clamp-1 italic px-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-primary/40" />
                  {t.punchInLocation && typeof t.punchInLocation === 'object'
                    ? `${t.punchInLocation.lat?.toFixed(4)}, ${t.punchInLocation.lng?.toFixed(4)}`
                    : (t.punchInLocation || (isVirtualAbsent(t) ? "Not punched in today" : "No location data"))}
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
                // The Date column only earns its width when a range is shown;
                // with one day picked it repeated the filter on every row and,
                // wrapped to three lines, pushed Actions off the edge at 1280px.
                : ["Staff", ...(dateFilter ? [] : ["Date"]), "Punch In", "Lunch In", "Lunch Out", "Punch Out", "Selfie", "Total Hrs", "Location", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
              emptyMessage={`No logs found.`}
              className="shadow-sm"
            >
              {paginatedTable.map((t) => (
                <DataTableRow key={t._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      {/* Avatar and phone only from sm up: at 360px they took a
                          third of the row and pushed Hours and Status off-screen. */}
                      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5 hidden sm:flex">
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
                        <span className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">{t.employeeId?.phone}</span>
                      </div>
                    </div>
                  </DataTableCell>
                  {/* Date: shown only for a range; one picked day is in the filter bar. */}
                  {!isMobile && !dateFilter && (
                    <DataTableCell className="text-[13px] text-muted-foreground whitespace-nowrap">{fmtDay(t.date)}</DataTableCell>
                  )}
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchIn ? fmtClock(t.punchIn) : <span className="text-muted-foreground/40">--:--</span>}
                  </DataTableCell>
                  {!isMobile && (
                    <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                      {getDisplayLunchIn(t) ? fmtClock(getDisplayLunchIn(t)) : <span className="text-muted-foreground/40">--:--</span>}
                    </DataTableCell>
                  )}
                  {!isMobile && (
                    <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                      {getDisplayLunchOut(t) ? fmtClock(getDisplayLunchOut(t)) : <span className="text-muted-foreground/40">--:--</span>}
                    </DataTableCell>
                  )}
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {getDisplayPunchOut(t) ? fmtClock(getDisplayPunchOut(t)) : <span className="text-muted-foreground/40">--:--</span>}
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
                    {(() => {
                      const h = hoursFor(t);
                      if (!h) return <span className="text-muted-foreground/40">—</span>;
                      return h.live ? (
                        <span title="Hours so far today, not yet final">
                          {h.text}
                          <span className="block font-sans text-[10px] font-semibold text-muted-foreground">so far</span>
                        </span>
                      ) : h.text;
                    })()}
                  </DataTableCell>
                  {!isMobile && (
                    <DataTableCell className="text-[12px] text-muted-foreground max-w-[150px] truncate italic">
                      {t.punchInLocation && typeof t.punchInLocation === 'object'
                        ? `${t.punchInLocation.lat?.toFixed(2)}, ${t.punchInLocation.lng?.toFixed(2)}`
                        : (t.punchInLocation || (isVirtualAbsent(t) ? "—" : "N/A"))}
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
                      {lateLabel(t) && (
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 border-transparent bg-warning/15 text-warning-foreground whitespace-nowrap">
                          {lateLabel(t)}
                        </Badge>
                      )}
                    <WfhMark record={t} />
                      {!isVirtualAbsent(t) && (() => {
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
                    {isVirtualAbsent(t) ? (
                      <span className="block text-right text-[12px] text-muted-foreground/60">Not punched in</span>
                    ) : isMobile ? (
                      // One 40px menu instead of four buttons, which on a phone
                      // were wider than the rest of the row put together.
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-10 w-10 p-0" aria-label={`Actions for ${t.employeeId?.name || "this day"}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="min-h-10" onClick={() => { setDetailRecord(t); setShowAllSessions(false); }}>View Details</DropdownMenuItem>
                          {canEdit && <DropdownMenuItem className="min-h-10" onClick={() => openEdit(t)}>Edit Punch</DropdownMenuItem>}
                          {canEdit && <DropdownMenuItem className="min-h-10" onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>}
                          {canEdit && t.status !== "absent" && (
                            <DropdownMenuItem className="min-h-10 text-destructive" onClick={() => setAbsentTarget({ employeeId: t.employeeId._id, name: t.employeeId?.name || "this employee", date: t.date })}>Mark Absent</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                    <div className="flex justify-end items-center gap-1">
                      <ActionButton
                        variant="view"
                        tooltip="View Details"
                        aria-label={`View ${t.employeeId?.name || "day"} details`}
                        className="h-9 w-9"
                        onClick={() => { setDetailRecord(t); setShowAllSessions(false); }}
                      />
                      {canEdit && (
                      <ActionButton
                        variant="edit"
                        tooltip="Edit Punch"
                        aria-label={`Edit ${t.employeeId?.name || "day"} punch times`}
                        className="hidden 2xl:inline-flex h-9 w-9"
                        onClick={() => openEdit(t)}
                      />
                      )}
                      {canEdit && (
                      <ActionButton
                        variant="more"
                        tooltip="Add Remark"
                        aria-label={`Add a remark for ${t.employeeId?.name || "this day"}`}
                        className="hidden 2xl:inline-flex h-9 w-9"
                        icon={MessageSquare}
                        onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}
                      />
                      )}
                      {canEdit && t.status !== "absent" && (
                      <ActionButton
                        variant="reject"
                        tooltip="Mark Absent"
                        aria-label={`Mark ${t.employeeId?.name || "employee"} absent`}
                        className="hidden 2xl:inline-flex h-9 w-9"
                        icon={UserX}
                        onClick={() => setAbsentTarget({ employeeId: t.employeeId._id, name: t.employeeId?.name || "this employee", date: t.date })}
                      />
                      )}
                      {/* Below 2xl the secondary actions share one menu: four
                          buttons overflowed the table by 126px at 1280px. */}
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-9 w-9 p-0 2xl:hidden" aria-label={`More actions for ${t.employeeId?.name || "this day"}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(t)}>Edit Punch</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>
                            {t.status !== "absent" && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setAbsentTarget({ employeeId: t.employeeId._id, name: t.employeeId?.name || "this employee", date: t.date })}>Mark Absent</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    )}
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
      )}

      {/* Remark Dialog */}
      <Dialog open={!!remarkOpenId} onOpenChange={(o) => { if (!o) { setRemarkOpenId(null); setRemarkText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add admin remark</DialogTitle>
            <DialogDescription className="text-[12px]">This note will be visible to the employee.</DialogDescription>
          </DialogHeader>
          <Textarea value={remarkText} maxLength={1000} onChange={(e) => setRemarkText(e.target.value)} placeholder="Verified with team lead…" rows={4} className="text-[13px]" />
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

      {/* Modify Punch Time -- one day of one employee */}
      <Dialog open={modifyOpen} onOpenChange={(o) => { if (!isUpdating) setModifyOpen(o); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Modify Punch Time</DialogTitle>
            <DialogDescription className="text-[12px]">
              <span className="font-semibold text-foreground">{modifyForm.name}</span>
              {modifyForm.dayKey ? ` · ${fmtDay(modifyForm.dayKey)}` : ""}. Clear a time to remove it. Hours and status are
              recalculated from the times unless you choose a status.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-3" noValidate>
            {([
              ["punchIn", "Punch In"],
              ["punchOut", "Punch Out"],
              ["lunchInTime", "Lunch In"],
              ["lunchOutTime", "Lunch Out"],
            ] as const).map(([key, label]) => (
              <FormInput
                key={key}
                label={label}
                type="datetime-local"
                value={modifyForm[key]}
                min={modifyForm.dayKey ? `${modifyForm.dayKey}T00:00` : undefined}
                max={modifyForm.dayKey ? `${(modifyForm.overnight && (key === "punchOut" || key === "lunchOutTime")) ? addDaysKey(modifyForm.dayKey, 1) : modifyForm.dayKey}T23:59` : undefined}
                onChange={(e) => { setModifyForm({ ...modifyForm, [key]: e.target.value }); setModifyError(null); }}
                className="h-10"
                containerClassName="space-y-1"
              />
            ))}
            <FormSelect
              label="Status"
              value={modifyForm.status}
              onValueChange={(v) => setModifyForm({ ...modifyForm, status: v })}
              options={[
                { label: "Auto — from the times", value: "auto" },
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
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Marks the day remote. Branch distance is not checked and auto punch-out is skipped.
                </p>
              </div>
              <Switch
                checked={modifyForm.isWFH}
                onCheckedChange={(v) => setModifyForm({ ...modifyForm, isWFH: v })}
                aria-label="Worked from home"
              />
            </div>

            {modifyError && (
              <p role="alert" className="text-[12px] font-medium text-destructive">{modifyError}</p>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setModifyOpen(false)} disabled={isUpdating} className="h-10 rounded-xl">Cancel</Button>
              <ActionButton
                variant="add"
                type="submit"
                showLabel
                label={isUpdating ? "Saving…" : "Save Changes"}
                icon={Check}
                disabled={isUpdating}
                className="h-10"
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark absent is destructive -- it removes the day's punches and
          sessions -- so it asks first. It used to fire on a single tap of an
          icon next to Edit. */}
      <Dialog open={!!absentTarget} onOpenChange={(o) => !o && setAbsentTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Mark {absentTarget?.name} absent?</DialogTitle>
            <DialogDescription className="text-[12px]">
              {absentTarget && fmtDay(absentTarget.date)}. This removes the day's punch times and sessions, and the day is
              paid as absent. Use Edit Punch instead if only a time is wrong.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => setAbsentTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              className="h-10 rounded-xl font-bold"
              onClick={async () => {
                if (!absentTarget) return;
                const target = absentTarget;
                setAbsentTarget(null);
                await handleMarkAbsent(target.employeeId, target.date);
              }}
            >
              Mark absent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absent Today Sheet */}
      <Sheet open={absentSheetOpen} onOpenChange={setAbsentSheetOpen}>
        <SheetContent className="sm:max-w-md w-full p-0 border-l border-border/40">
          <div className="h-full flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b border-border/40">
              <SheetTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                <UserX className="h-5 w-5 text-destructive" /> Absent {dayWord}
              </SheetTitle>
              <SheetDescription className="text-sm font-medium">
                Expected at work on {fmtDay(todayStr)} and not punched in. People on approved leave, on their weekly off
                or on a holiday are not counted here.
              </SheetDescription>
              {stats && ((stats.onLeaveToday ?? 0) + (stats.weeklyOffToday ?? 0) + (stats.holidayToday ?? 0)) > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {[
                    stats.onLeaveToday ? `${stats.onLeaveToday} on leave` : null,
                    stats.weeklyOffToday ? `${stats.weeklyOffToday} on weekly off` : null,
                    stats.holidayToday ? `${stats.holidayToday} on holiday${stats.holidayName ? ` (${stats.holidayName})` : ""}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {absentees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <UserCheck className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[13px] text-muted-foreground">Nobody expected today is missing.</p>
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
                        aria-label={`Call ${e.name}`}
                        className="h-10 w-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center hover:bg-primary/10 transition-colors shrink-0"
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
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground leading-tight truncate">{r.employeeId?.name}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
                      </div>
                    </div>
                    {/* The claim beside what the record says now: approving a
                        time without seeing what it replaces is not a review. */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {([
                        ["Punch in", r.requestedPunchIn, r.currentPunchIn],
                        ["Punch out", r.requestedPunchOut, r.currentPunchOut],
                      ] as const).filter(([, claimed]) => !!claimed).map(([label, claimed, current]) => (
                        <div key={label} className="p-2 rounded-lg bg-background border border-border/30">
                          <span className="text-muted-foreground">{label}: </span>
                          <span className="font-mono font-bold">{fmtClock(claimed)}</span>
                          <span className="block text-[10px] text-muted-foreground">was {fmtClock(current) || "—"}</span>
                        </div>
                      ))}
                      {(r.requestedLunchInTime || r.requestedLunchOutTime) && (
                        <div className="p-2 rounded-lg bg-background border border-border/30 col-span-2">
                          <span className="text-muted-foreground">Lunch: </span>
                          <span className="font-mono font-bold">{fmtClock(r.requestedLunchInTime) || "—"} – {fmtClock(r.requestedLunchOutTime) || "—"}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground italic break-words">"{r.reason}"</p>
                    {canEdit && (
                      <ActionButton variant="edit" showLabel label="Review" icon={ClipboardList} className="w-full h-10" onClick={() => setReviewTarget(r)} />
                    )}
                  </Card>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Approve (optionally with an edited time) or reject with a reason the
          employee is shown. The sheet used to approve or reject on one tap,
          with no reason and no view of what the request would overwrite. */}
      <CorrectionReviewDialog request={reviewTarget} onClose={() => setReviewTarget(null)} />

      {/* Request Correction Dialog */}
      <Dialog open={correctionOpen} onOpenChange={(o) => { setCorrectionOpen(o); if (!o) { setCorrectionForm(emptyCorrection); setCorrectionError(null); } }}>
        <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="h-2 w-full bg-primary shrink-0" />
          <div className="p-6 flex-1 flex flex-col min-h-0">
            <DialogHeader className="mb-6 shrink-0">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <ClipboardList className="h-6 w-6" />
              </div>
              <DialogTitle className="text-xl font-black">Request Correction</DialogTitle>
              <DialogDescription className="font-medium text-xs">
                Submit an attendance correction for admin approval.
              </DialogDescription>
            </DialogHeader>
            <form className="flex-1 flex flex-col min-h-0" onSubmit={handleSubmitCorrection}>
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
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
                  max={todayStr}
                  value={correctionForm.date}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
                  className="h-11"
                  containerClassName="space-y-1"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormInput
                    label="Punch In"
                    type="time"
                    value={correctionForm.requestedPunchIn}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requestedPunchIn: e.target.value })}
                    className="h-11"
                    containerClassName="space-y-1"
                  />
                  <FormInput
                    label="Punch Out"
                    type="time"
                    value={correctionForm.requestedPunchOut}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requestedPunchOut: e.target.value })}
                    className="h-11"
                    containerClassName="space-y-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormInput
                    label="Lunch In"
                    type="time"
                    value={correctionForm.requestedLunchInTime}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, requestedLunchInTime: e.target.value })}
                    className="h-11"
                    containerClassName="space-y-1"
                  />
                  <FormInput
                    label="Lunch Out"
                    type="time"
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
                    maxLength={500}
                    className="text-[13px]"
                  />
                </div>
                {correctionError && <p role="alert" className="text-[12px] font-medium text-destructive">{correctionError}</p>}
              </div>
              <DialogFooter className="pt-2 gap-3 shrink-0">
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
            and use <span className="font-bold text-foreground">Edit punch times</span> instead — that keeps the
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
                  <span className="text-[11px] text-muted-foreground font-medium">{fmtDay(detailRecord.date)}</span>
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
                      {detailRecord.punchIn ? fmtClock(detailRecord.punchIn) : "—"}
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
                      {getDisplayPunchOut(detailRecord) ? fmtClock(getDisplayPunchOut(detailRecord)) : "—"}
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
                    <span>{getDisplayLunchIn(detailRecord) ? fmtClock(getDisplayLunchIn(detailRecord)) : "—"}</span>
                    <span className="text-muted-foreground font-sans font-normal text-[11px]">to</span>
                    <span>{getDisplayLunchOut(detailRecord) ? fmtClock(getDisplayLunchOut(detailRecord)) : "—"}</span>
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
                      grading={detailRecord.grading}
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
                  <div className="font-medium text-foreground/80 text-[13px] break-words">{detailRecord.remarks || "—"}</div>
                </div>

                {canEdit && (
                  <Button type="button" variant="outline" className="w-full h-10 rounded-xl" onClick={() => openEdit(detailRecord)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit punch times
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
