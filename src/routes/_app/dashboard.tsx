import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Wallet,
  TrendingUp,
  Receipt,
  CalendarRange,
  CalendarDays,
  AlertTriangle,
  CalendarOff,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Ticket as TicketIcon,
  RefreshCw,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDashboardService,
  errorStatus,
  type DashboardSummary,
} from "@/services/dashboard-service";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/hooks/use-auth";
import { cn, toISTDateKey } from "@/lib/utils";
import { formatINR, formatINRFull } from "@/lib/format";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

// ─── Colours ────────────────────────────────────────────────────────────────
// Checked with the dataviz palette validator (lightness band, colour-blind
// separation). The four slice colours are in an order where no two
// neighbouring slices fail the colour-blind check; departments past the fourth
// fold into a grey "Other" rather than repeating a colour. The legend lists
// every slice with its amount, so no slice is told apart by colour alone.
const SERIES = [
  "oklch(0.48 0.19 335)",
  "oklch(0.72 0.15 70)",
  "oklch(0.56 0.16 250)",
  "oklch(0.62 0.15 160)",
];
const OTHER_COLOR = "oklch(0.72 0.01 320)";
const CAME_COLOR = "oklch(0.48 0.19 335)";
const ABSENT_COLOR = "oklch(0.70 0.16 60)";
const GRID = "var(--border)";
const AXIS = "oklch(0.50 0.03 320)";
// Theme variables, so the tooltip follows the admin panel's dark theme.
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

// ─── IST dates ──────────────────────────────────────────────────────────────
/**
 * Today, as an IST calendar day.
 *
 * This was `new Date().toISOString().slice(0, 10)`, which is the UTC date. IST
 * runs 5h30m ahead, so between midnight and 05:30 in India that returns
 * YESTERDAY -- the date picker defaulted to the wrong day, and because the same
 * value is the input's `max`, today could not even be selected.
 */
function todayISO() {
  return toISTDateKey(new Date());
}

/** "24 Sep 2026" for a YYYY-MM-DD key, without the browser's timezone moving it. */
function formatDayKey(key: string, withYear = true) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "24 Sep 2026" for a stored timestamp, as an IST date. */
function formatStamp(value?: string | null) {
  return value ? formatDayKey(toISTDateKey(value)) : "";
}

/** The current IST month and the 11 before it. */
function monthOptions(todayKey: string) {
  const [y, m] = todayKey.split("-").map(Number);
  return Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    return {
      label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
      m: d.getUTCMonth() + 1,
      y: d.getUTCFullYear(),
    };
  });
}

// ─── Small building blocks (dashboard only) ─────────────────────────────────
const ACCENTS = {
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
} as const;

/**
 * One number with its name and, optionally, one line of context.
 *
 * Its own card rather than the shared StatCard: that one sets its label at
 * 10px and half opacity on phones, which is too small and too faint to read,
 * and it has no line for context ("3 came late"), so a bare number had to
 * carry everything.
 */
function Stat({
  label,
  value,
  hint,
  icon: Icon,
  accent = "primary",
  to,
  search,
  title,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
  to?: string;
  search?: Record<string, string>;
  title?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "h-full min-h-[104px] rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm flex flex-col gap-2 transition-colors",
        to &&
          "hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-primary/40",
      )}
      title={title}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] sm:text-[13px] font-semibold leading-tight text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            ACCENTS[accent],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="text-[22px] sm:text-[26px] font-bold tracking-tight text-foreground tabular-nums leading-none">
        {value}
      </p>
      {hint ? (
        <p className="text-[12px] leading-snug text-muted-foreground mt-auto">{hint}</p>
      ) : null}
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("h-full", className)}
    >
      {to ? (
        <Link
          to={to}
          search={search as never}
          className="group block h-full rounded-xl focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "p-4 sm:p-5 border border-border/60 bg-card rounded-xl shadow-sm h-full flex flex-col",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </Card>
  );
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="shrink-0 inline-flex items-center gap-0.5 h-10 -my-2 px-2 -mr-2 rounded-lg text-[13px] font-semibold text-primary hover:bg-primary/5"
    >
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-[120px] flex items-center justify-center text-center text-[13px] text-muted-foreground px-4">
      {children}
    </div>
  );
}

/** Swipeable strip on phones (two and a bit cards show, so the cut edge says there are more), a grid from sm up. */
function StatRow({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:px-0 sm:overflow-visible sm:grid sm:grid-cols-2",
        count >= 4 ? "lg:grid-cols-4" : count === 3 ? "lg:grid-cols-3" : "",
      )}
    >
      {children}
    </div>
  );
}
const STAT_CELL = "shrink-0 w-[46%] snap-start sm:w-auto sm:shrink";

function LoadFailed({
  error,
  onRetry,
  retrying,
  what,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  what: string;
}) {
  const status = errorStatus(error);
  if (status === 403) {
    return (
      <Card
        role="status"
        className="p-6 sm:p-8 text-center border border-border/60 bg-card rounded-xl"
      >
        <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden />
        <p className="text-[15px] font-semibold text-foreground">
          You don't have access to the dashboard
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Ask your company admin to turn on the Dashboard permission for you.
        </p>
      </Card>
    );
  }
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return (
    <Card
      role="alert"
      className="p-6 sm:p-8 text-center border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 rounded-xl"
    >
      <p className="text-[15px] font-semibold text-red-900 dark:text-red-200">
        Could not load {what}
      </p>
      <p className="text-[13px] text-red-800/80 dark:text-red-200/80 mt-1">
        {status === 400 && message
          ? message
          : status === 0
            ? "Check your internet connection, then try again."
            : "Something went wrong on our side. Please try again."}
      </p>
      {status !== 400 && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 h-11 px-5 rounded-lg bg-red-600 text-white text-[14px] font-semibold inline-flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} aria-hidden />
          {retrying ? "Loading..." : "Try again"}
        </button>
      )}
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
function DashboardPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const todayKey = todayISO();
  const MONTH_OPTIONS = useMemo(() => monthOptions(todayKey), [todayKey]);
  const [selectedMonth, setSelectedMonth] = useState(`${MONTH_OPTIONS[0].m}-${MONTH_OPTIONS[0].y}`);
  const [month, year] = selectedMonth.split("-").map(Number);
  const monthLabel =
    MONTH_OPTIONS.find((mo) => mo.m === month && mo.y === year)?.label || `${month}/${year}`;

  // "Choose a date" is a separate mode from the month picker: the date only
  // changes the attendance cards; money, requests and charts stay on the month.
  const [filterMode, setFilterMode] = useState<"month" | "date">("month");
  const [customDate, setCustomDate] = useState(todayISO);
  const isCustomDateValid = filterMode === "date" && !!customDate;

  // A sub-admin without the Dashboard permission is sent elsewhere by the
  // layout; don't ask the server for numbers it will refuse meanwhile.
  // useAuth() has no session on the first render, and can() answers true for
  // "not a sub-admin" -- so wait for the session before deciding.
  const { session } = useAuth();
  const { can } = usePermission();
  const sessionReady = !!session;
  const canView = sessionReady && can("dashboard", "view");

  const monthQuery = useDashboardService({ month, year, enabled: canView });
  const dateQuery = useDashboardService({
    startDate: customDate,
    endDate: customDate,
    enabled: canView && isCustomDateValid,
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted || !sessionReady) return null;

  const filterControls = (
    <div className="flex items-center gap-2">
      {filterMode === "month" ? (
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px] h-10 text-[13px]" aria-label="Choose a month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((mo) => (
              <SelectItem key={`${mo.m}-${mo.y}`} value={`${mo.m}-${mo.y}`}>
                {mo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input
          type="date"
          value={customDate}
          max={todayKey}
          aria-label="Choose a date"
          onChange={(e) => setCustomDate(e.target.value)}
          className="h-10 w-[180px] rounded-md border border-input bg-transparent px-2.5 text-[13px] shadow-sm"
        />
      )}
      <button
        type="button"
        title={filterMode === "month" ? "See one date" : "Back to the month"}
        aria-label={filterMode === "month" ? "See one date" : "Back to the month"}
        onClick={() => setFilterMode(filterMode === "month" ? "date" : "month")}
        className={cn(
          "h-10 w-10 shrink-0 flex items-center justify-center rounded-md border transition-colors",
          filterMode === "date"
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-input text-muted-foreground hover:text-foreground",
        )}
      >
        {filterMode === "month" ? (
          <CalendarDays className="h-4 w-4" aria-hidden />
        ) : (
          <CalendarRange className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" />
        <LoadFailed
          error={{ response: { status: 403 } }}
          onRetry={() => undefined}
          retrying={false}
          what="the dashboard"
        />
      </div>
    );
  }

  const summary = monthQuery.summary;
  if (monthQuery.isLoading || (!summary && !monthQuery.isError)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" description="Loading..." actions={filterControls} />
        <SkeletonLoader type="stats" count={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonLoader type="card" count={3} className="lg:col-span-3" />
        </div>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" actions={filterControls} />
        <LoadFailed
          error={monthQuery.error}
          onRetry={() => monthQuery.refetch()}
          retrying={monthQuery.isFetching}
          what="the dashboard"
        />
      </div>
    );
  }

  const { visible, stats, pending } = summary;
  // The attendance cards follow the chosen date when there is one.
  const cards: DashboardSummary | undefined = isCustomDateValid ? dateQuery.summary : summary;
  const cardsLoading = isCustomDateValid && dateQuery.isLoading;
  const cardsFailed = isCustomDateValid && dateQuery.isError && !dateQuery.summary;

  const description = isCustomDateValid
    ? `Attendance for ${formatDayKey(customDate)}. Money, requests and charts are for ${monthLabel}.`
    : summary.isCurrentMonth
      ? visible.attendance
        ? "Today's attendance and the requests waiting for you."
        : "Your company at a glance."
      : `Showing ${monthLabel}.`;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Overview" description={description} actions={filterControls} />

      {visible.attendance && (
        <AttendanceCards
          cards={cards}
          loading={cardsLoading}
          failed={cardsFailed}
          error={dateQuery.error}
          onRetry={() => dateQuery.refetch()}
          retrying={dateQuery.isFetching}
          monthLabel={monthLabel}
        />
      )}

      {/* People and money for the selected month. */}
      <StatRow
        count={1 + (visible.salary ? 1 : 0) + (visible.expenses ? 1 : 0) + (visible.leads ? 1 : 0)}
      >
        <Stat
          className={STAT_CELL}
          label="Employees"
          value={stats.activeEmployees}
          hint={
            stats.inactiveEmployees > 0
              ? `Active now · ${stats.inactiveEmployees} inactive`
              : "All active"
          }
          icon={Users}
          accent="primary"
          to={visible.employees ? "/employees" : undefined}
        />
        {visible.salary && (
          <Stat
            className={STAT_CELL}
            label={`Salary · ${monthLabel.split(" ")[0]}`}
            value={formatINR(stats.totalSalary ?? 0)}
            title={formatINRFull(stats.totalSalary ?? 0)}
            hint={
              (stats.payslipCount ?? 0) > 0
                ? `${formatINRFull(stats.totalSalary ?? 0)} · ${stats.payslipCount} payslip${stats.payslipCount === 1 ? "" : "s"}`
                : "No payslips made yet"
            }
            icon={Wallet}
            accent="primary"
            to="/salary"
          />
        )}
        {visible.expenses && (
          <Stat
            className={STAT_CELL}
            label={`Approved expenses · ${monthLabel.split(" ")[0]}`}
            value={formatINR(stats.totalExpenses ?? 0)}
            title={formatINRFull(stats.totalExpenses ?? 0)}
            hint={
              (stats.expensesOverCapLeftOut ?? 0) > 0
                ? `${stats.expensesOverCapLeftOut} claim(s) over ₹1 crore left out`
                : (pending.expenses ?? 0) > 0
                  ? `${pending.expenses} claim${pending.expenses === 1 ? "" : "s"} waiting`
                  : "Nothing waiting"
            }
            icon={Receipt}
            accent="destructive"
            to="/expenses"
          />
        )}
        {visible.leads && (
          <Stat
            className={STAT_CELL}
            label="Leads"
            value={stats.totalLeads ?? 0}
            hint="All time"
            icon={TrendingUp}
            accent="info"
            to="/leads"
          />
        )}
      </StatRow>

      {/* Attendance chart and the waiting requests. */}
      <div className={cn("grid grid-cols-1 gap-4", visible.attendance && "lg:grid-cols-3")}>
        {visible.attendance && (
          <div className="lg:col-span-2">
            <TrendPanel summary={summary} monthLabel={monthLabel} />
          </div>
        )}
        <WaitingPanel summary={summary} />
      </div>

      <div className={cn("grid grid-cols-1 gap-4", visible.salary && "md:grid-cols-2")}>
        {visible.salary && <SalaryPanel summary={summary} monthLabel={monthLabel} />}
        <StaffPanel summary={summary} />
      </div>

      {(visible.employees || visible.tickets) && (
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            visible.employees && visible.tickets && "md:grid-cols-2",
          )}
        >
          {visible.employees && <NewestPanel summary={summary} />}
          {visible.tickets && <TicketsPanel summary={summary} />}
        </div>
      )}
    </div>
  );
}

// ─── Attendance cards ───────────────────────────────────────────────────────
function AttendanceCards({
  cards,
  loading,
  failed,
  error,
  onRetry,
  retrying,
  monthLabel,
}: {
  cards?: DashboardSummary;
  loading: boolean;
  failed: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  monthLabel: string;
}) {
  if (failed)
    return <LoadFailed error={error} onRetry={onRetry} retrying={retrying} what="that date" />;
  if (loading || !cards) return <SkeletonLoader type="stats" count={4} />;

  const s = cards.stats;
  const mode = cards.attendanceMode;
  const n = (v: number | null) => v ?? 0;
  // "Present today" / "Present" (one chosen date) / "Present days" (a month's total).
  const name = (base: string, total: string) =>
    mode === "today" ? `${base} today` : mode === "day" ? base : total;
  const showReview = n(s.needsReviewToday) > 0;

  // Where everyone else is, so the four cards can be read against the whole team.
  const staffCounted =
    n(s.presentToday) +
    n(s.halfDayToday) +
    n(s.needsReviewToday) +
    n(s.onLeaveToday) +
    n(s.weeklyOffToday) +
    n(s.holidayToday) +
    n(s.absentToday);
  const context: string[] = [];
  if (n(s.weeklyOffToday) > 0) context.push(`${s.weeklyOffToday} on weekly off`);
  if (n(s.holidayToday) > 0)
    context.push(`${s.holidayToday} on holiday${s.holidayName ? ` (${s.holidayName})` : ""}`);
  if (mode === "today" && n(s.onDutyNow) > 0) context.push(`${s.onDutyNow} at work right now`);
  if (mode === "today" && s.nightShiftCounted > 0)
    context.push(`${s.nightShiftCounted} night-shift staff counted from last night's shift`);

  return (
    <section aria-label="Attendance" className="space-y-2">
      <StatRow count={4}>
        <Stat
          className={STAT_CELL}
          label={name("Present", "Present days")}
          value={n(s.presentToday)}
          hint={
            mode !== "total" && n(s.lateToday) > 0
              ? `${s.lateToday} came late`
              : mode === "total"
                ? "Full days, late days and work from home"
                : "Includes work from home"
          }
          icon={UserCheck}
          accent="success"
          to="/attendance"
        />
        <Stat
          className={STAT_CELL}
          label={name("Absent", "Absent days")}
          value={n(s.absentToday)}
          hint="Expected at work, not on leave or a day off"
          icon={UserX}
          accent="destructive"
          to="/attendance"
        />
        <Stat
          className={STAT_CELL}
          label={name("On leave", "Leave days")}
          value={n(s.onLeaveToday)}
          hint="Approved leave"
          icon={CalendarOff}
          accent="info"
          to="/leaves"
        />
        {/* Takes the Half Day slot only when there is something to act on: a
            day with a real punch that could not be measured needs a person. */}
        {showReview ? (
          <Stat
            className={STAT_CELL}
            label={name("Needs review", "Days to review")}
            value={n(s.needsReviewToday)}
            hint="Punches that need checking"
            icon={AlertTriangle}
            accent="warning"
            to="/attendance"
            search={{ status: "needs_review" }}
          />
        ) : (
          <Stat
            className={STAT_CELL}
            label={name("Half day", "Half days")}
            value={n(s.halfDayToday)}
            hint="Worked less than a full day"
            icon={Clock}
            accent="warning"
            to="/attendance"
            search={{ status: "half-day" }}
          />
        )}
      </StatRow>
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        {mode === "total"
          ? `Totals for ${monthLabel}: each person counted once for every day.`
          : `${mode === "day" && cards.startDate ? `${formatDayKey(cards.startDate)}: ` : ""}${staffCounted} staff${context.length ? ` · ${context.join(" · ")}` : ""}${showReview && n(s.halfDayToday) > 0 ? ` · ${s.halfDayToday} half day` : ""}`}
      </p>
    </section>
  );
}

// ─── Panels ─────────────────────────────────────────────────────────────────
function TrendPanel({ summary, monthLabel }: { summary: DashboardSummary; monthLabel: string }) {
  const data = summary.attendanceTrend;
  const hasData = data.some((d) => d.present > 0 || d.absent > 0 || d.onLeave > 0);
  return (
    <Panel
      title="Attendance, last 7 days"
      subtitle={
        summary.isCurrentMonth
          ? "People who came to work, and people who were absent"
          : `The last 7 days of ${monthLabel}`
      }
      action={
        <div
          className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[12px] text-foreground"
          aria-hidden
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAME_COLOR }} />
            Came to work
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ABSENT_COLOR }} />
            Absent
          </span>
        </div>
      }
    >
      <div className="h-[200px] sm:h-[260px]">
        {!hasData ? (
          <Empty>No attendance recorded in these 7 days.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barGap={2}
              barCategoryGap="28%"
              margin={{ top: 4, right: 4, left: -18, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={AXIS}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={6}
                interval={0}
              />
              <YAxis
                stroke={AXIS}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "oklch(0.48 0.19 335 / 0.05)" }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as
                    | { date?: string; onLeave?: number }
                    | undefined;
                  return p?.date
                    ? `${formatDayKey(p.date, false)}${p.onLeave ? ` · ${p.onLeave} on leave` : ""}`
                    : "";
                }}
              />
              <Bar
                dataKey="present"
                name="Came to work"
                fill={CAME_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="absent"
                name="Absent"
                fill={ABSENT_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

const WAITING: {
  key: keyof DashboardSummary["pending"];
  vis: keyof DashboardSummary["visible"];
  label: string;
  to: string;
  icon: LucideIcon;
}[] = [
  { key: "leaves", vis: "leaves", label: "Leave requests", to: "/leaves", icon: CalendarOff },
  {
    key: "corrections",
    vis: "attendance",
    label: "Attendance corrections",
    to: "/attendance",
    icon: ClipboardCheck,
  },
  {
    key: "advances",
    vis: "advances",
    label: "Advance and loan requests",
    to: "/advance-salary",
    icon: Coins,
  },
  { key: "expenses", vis: "expenses", label: "Expense claims", to: "/expenses", icon: Receipt },
  { key: "tickets", vis: "tickets", label: "Helpdesk tickets", to: "/tickets", icon: TicketIcon },
];

function WaitingPanel({ summary }: { summary: DashboardSummary }) {
  const rows = WAITING.filter((w) => summary.visible[w.vis] && summary.pending[w.key] !== null);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, w) => sum + (summary.pending[w.key] ?? 0), 0);
  return (
    <Panel
      title="Waiting for you"
      subtitle={total > 0 ? "Requests that need a decision" : "Nothing needs a decision right now"}
    >
      <ul className="divide-y divide-border/50 -my-1">
        {rows.map((w) => {
          const count = summary.pending[w.key] ?? 0;
          return (
            <li key={w.key}>
              <Link
                to={w.to}
                className="flex items-center gap-3 min-h-[48px] py-1.5 -mx-2 px-2 rounded-lg hover:bg-muted/40"
              >
                <w.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 min-w-0 text-[14px] text-foreground">{w.label}</span>
                <span
                  className={cn(
                    "min-w-[28px] h-6 px-2 rounded-full text-[12px] font-bold tabular-nums inline-flex items-center justify-center",
                    count > 0
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SalaryPanel({ summary, monthLabel }: { summary: DashboardSummary; monthLabel: string }) {
  // Four named slices at most; the rest fold into "Other" so no colour repeats.
  const slices = useMemo(() => {
    const rows = summary.salaryDistribution.filter((r) => r.value > 0);
    if (rows.length <= SERIES.length) return rows.map((r, i) => ({ ...r, color: SERIES[i] }));
    const head = rows.slice(0, SERIES.length - 1).map((r, i) => ({ ...r, color: SERIES[i] }));
    const rest = rows.slice(SERIES.length - 1).reduce((sum, r) => sum + r.value, 0);
    return [...head, { name: "Other departments", value: rest, color: OTHER_COLOR }];
  }, [summary.salaryDistribution]);
  const total = slices.reduce((sum, r) => sum + r.value, 0);

  return (
    <Panel
      title="Salary by department"
      subtitle={`Payslips for ${monthLabel}`}
      action={<SeeAll to="/salary">Salary</SeeAll>}
    >
      {slices.length === 0 ? (
        <Empty>No payslips made for {monthLabel} yet.</Empty>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="h-[170px] w-[170px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={slices.length > 1 ? 3 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatINRFull(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-2">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-[13px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="flex-1 min-w-0 truncate text-foreground">{s.name}</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {formatINRFull(s.value)}
                </span>
                <span className="w-10 text-right tabular-nums text-muted-foreground">
                  {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function StaffPanel({ summary }: { summary: DashboardSummary }) {
  const data = summary.departmentHeadcount;
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <Panel title="Staff by department" subtitle="Active employees now">
      {data.length === 0 ? (
        <Empty>No active employees yet.</Empty>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                stroke={AXIS}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              {/* One line per name: the default tick wraps "No department" onto two. */}
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={108}
                tick={(props) => {
                  const { x, y, payload } = props as unknown as {
                    x: number;
                    y: number;
                    payload: { value: string };
                  };
                  const name = String(payload?.value ?? "");
                  return (
                    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={AXIS}>
                      <title>{name}</title>
                      {name.length > 14 ? `${name.slice(0, 13)}…` : name}
                    </text>
                  );
                }}
              />
              <Tooltip
                cursor={{ fill: "oklch(0.48 0.19 335 / 0.05)" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [`${v} staff`, "Active"]}
              />
              <Bar
                dataKey="value"
                name="Active staff"
                fill={CAME_COLOR}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                label={{ position: "right", fontSize: 12, fill: "var(--foreground)" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function NewestPanel({ summary }: { summary: DashboardSummary }) {
  const list = summary.recentEmployees;
  return (
    <Panel
      title="Newest employees"
      subtitle="Last added to the system"
      action={<SeeAll to="/employees">All</SeeAll>}
    >
      {list.length === 0 ? (
        <Empty>No employees added yet.</Empty>
      ) : (
        <ul className="space-y-1 -mx-2">
          {list.map((e) => (
            <li key={e._id}>
              <Link
                to="/employees/$employeeId"
                params={{ employeeId: e._id }}
                className="flex items-center gap-3 min-h-[52px] px-2 py-1.5 rounded-lg hover:bg-muted/40"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-semibold">
                    {initials(e.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-foreground truncate">{e.name}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {[
                      e.department || "No department",
                      e.joiningDate ? `Joined ${formatStamp(e.joiningDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {e.status !== "active" && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Inactive
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TicketsPanel({ summary }: { summary: DashboardSummary }) {
  const list = summary.pendingTickets;
  const count = summary.pending.tickets ?? list.length;
  return (
    <Panel
      title="Helpdesk tickets waiting"
      subtitle={
        count > list.length
          ? `Latest ${list.length} of ${count}`
          : "Questions and complaints from staff"
      }
      action={<SeeAll to="/tickets">All</SeeAll>}
    >
      {list.length === 0 ? (
        <Empty>No tickets waiting.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t._id}>
              <Link
                to="/tickets"
                className="block min-h-[48px] rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium truncate text-foreground">
                    {t.employeeName || "Former employee"}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {formatStamp(t.createdAt)}
                  </span>
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">{t.type}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
