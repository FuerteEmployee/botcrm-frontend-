import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, UserCheck, UserX, Clock, Wallet, TrendingUp, BadgeDollarSign, CalendarRange, CalendarDays } from "lucide-react";
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
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardService } from "@/services/dashboard-service";
import { cn } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";

const MONTH_OPTIONS = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setDate(1); // avoid month-end overflow (e.g. day 31) before subtracting months
  d.setMonth(d.getMonth() - i);
  return { label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), m: d.getMonth() + 1, y: d.getFullYear() };
});

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const PIE_COLORS = [
  "oklch(0.38 0.17 335)",
  "oklch(0.55 0.22 335)",
  "oklch(0.65 0.16 155)",
  "oklch(0.78 0.16 75)",
  "oklch(0.62 0.18 240)",
];

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

interface RecentEmployee {
  _id: string;
  name: string;
  role: string;
  departmentId?: { name: string };
  status: string;
}

interface PendingTicketItem {
  _id: string;
  type: string;
  status: string;
  createdAt: string;
  employeeId?: { name: string };
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function DashboardPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(`${MONTH_OPTIONS[0].m}-${MONTH_OPTIONS[0].y}`);
  const [month, year] = selectedMonth.split("-").map(Number);

  // "Custom Date" is a separate mode from the month picker, not another
  // month option — it swaps the trigger for a single date input entirely.
  const [filterMode, setFilterMode] = useState<"month" | "date">("month");
  const [customDate, setCustomDate] = useState(todayISO);

  const isCustomDateValid = filterMode === "date" && !!customDate;

  // The month view always drives the charts (Attendance Performance, Budget
  // Allocation) — a single custom date doesn't attempt to redraw those, it
  // only overrides the stat-card numbers above them. So these are two
  // independent queries, not one that swaps its params.
  const { summary: monthSummary, isLoading: monthLoading } = useDashboardService({ month, year });
  const { summary: dateSummary, isLoading: dateLoading } = useDashboardService({
    startDate: customDate,
    endDate: customDate,
    enabled: isCustomDateValid,
  });

  const summary = monthSummary && (isCustomDateValid && dateSummary
    ? { ...monthSummary, stats: dateSummary.stats, isCustomRange: true, startDate: dateSummary.startDate, endDate: dateSummary.endDate }
    : monthSummary);
  const isLoading = monthLoading || (isCustomDateValid && dateLoading);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const filterControls = (
    <div className="flex items-center gap-2">
      {filterMode === "month" ? (
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[190px] h-10 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((mo) => (
              <SelectItem key={`${mo.m}-${mo.y}`} value={`${mo.m}-${mo.y}`}>{mo.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input
          type="date"
          value={customDate}
          max={todayISO()}
          onChange={(e) => setCustomDate(e.target.value)}
          className="h-10 rounded-md border border-input bg-transparent px-2.5 text-[13px] shadow-sm"
        />
      )}
      <button
        type="button"
        title={filterMode === "month" ? "Filter by a specific date" : "Back to month view"}
        onClick={() => setFilterMode(filterMode === "month" ? "date" : "month")}
        className={cn(
          "h-10 w-10 shrink-0 flex items-center justify-center rounded-md border transition-colors",
          filterMode === "date" ? "border-primary/40 bg-primary/10 text-primary" : "border-input text-muted-foreground hover:text-foreground"
        )}
      >
        {filterMode === "month" ? <CalendarRange className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
      </button>
    </div>
  );

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" description="Loading real-time metrics..." actions={filterControls} />
        <SkeletonLoader type="stats" count={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonLoader type="card" count={3} className="lg:col-span-3" />
        </div>
      </div>
    );
  }

  const { stats, recentEmployees, pendingTickets, attendanceTrend, salaryDistribution, departmentHeadcount, isCurrentMonth, isCustomRange } = summary;
  const hasTrendData = attendanceTrend.some(d => d.present > 0 || d.absent > 0);
  const hasSalaryData = salaryDistribution.length > 0;
  const hasHeadcountData = departmentHeadcount.length > 0;
  // The charts below always reflect the selected month, regardless of the
  // date filter — only these labels/description (and the stat cards) react
  // to a custom date, so dayLabel checks isCustomRange first.
  const dayLabel = isCustomRange ? "(Selected Date)" : isCurrentMonth ? "Today" : "(Month)";

  const description = isCurrentMonth
    ? "Monitor your workforce performance and operational trends in real-time."
    : `Showing data for ${MONTH_OPTIONS.find(m => m.m === month && m.y === year)?.label || `${month}/${year}`}.`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        description={description}
        actions={filterControls}
      />

      {isCustomRange && (
        <p className="text-[12px] text-muted-foreground -mt-3">
          Cards below reflect <span className="font-semibold text-foreground">{summary.startDate}</span> · charts still show {MONTH_OPTIONS.find(m => m.m === month && m.y === year)?.label || `${month}/${year}`}
        </p>
      )}

      {/* Stat cards — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Employees"
          value={stats.totalEmployees}
          icon={Users}
          accent="primary"
          delay={0.0}
          to="/employees"
        />
        <StatCard
          label={`Present ${dayLabel}`}
          value={stats.presentToday}
          icon={UserCheck}
          accent="success"
          delay={0.05}
          to="/attendance"
          search={{ status: "present" }}
        />
        <StatCard
          label={`Absent ${dayLabel}`}
          value={stats.absentToday}
          icon={UserX}
          accent="destructive"
          delay={0.1}
          to="/attendance"
          search={{ status: "absent" }}
        />
        <StatCard
          label={`Half Day ${dayLabel}`}
          value={stats.halfDayToday}
          icon={Clock}
          accent="warning"
          delay={0.15}
          to="/attendance"
          search={{ status: "half-day" }}
        />
      </div>

      {/* Stat cards — row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Monthly Salary"
          value={fmtINR(stats.totalSalary)}
          icon={Wallet}
          accent="primary"
          delay={0.18}
          to="/salary"
        />
        <StatCard
          label="Total Expense"
          value={fmtINR(stats.totalExpenses)}
          icon={BadgeDollarSign}
          accent="destructive"
          delay={0.21}
          to="/expenses"
        />
        <StatCard
          label="Total Leads"
          value={stats.totalLeads}
          icon={TrendingUp}
          accent="info"
          delay={0.24}
          to="/leads"
        />
      </div>

      {(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Attendance Performance */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="lg:col-span-2"
          >
            <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm h-full">
              <div className="flex items-center justify-between mb-4">
                <SectionTitle
                  title="Attendance Performance"
                  subtitle="Week-over-week attendance breakdown"
                />
                <div className="flex gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20 px-2 py-0.5"
                  >
                    Present
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[11px] font-medium bg-warning/5 text-warning-foreground border-warning/20 px-2 py-0.5"
                  >
                    Absent
                  </Badge>
                </div>
              </div>
              <div className="h-[260px] min-h-[260px]">
                {!hasTrendData ? (
                  <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                    No attendance recorded in the last 7 days
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceTrend} barGap={6} barCategoryGap="30%">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.93 0.01 320)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="oklch(0.55 0.03 320)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={8}
                    />
                    <YAxis
                      stroke="oklch(0.55 0.03 320)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dx={-6}
                    />
                    <Tooltip
                      cursor={{ fill: "oklch(0.38 0.17 335 / 0.04)" }}
                      contentStyle={{
                        background: "white",
                        border: "1px solid oklch(0.92 0.01 320)",
                        borderRadius: 8,
                        fontSize: 13,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Bar
                      dataKey="present"
                      fill="oklch(0.38 0.17 335)"
                      radius={[3, 3, 0, 0]}
                      barSize={24}
                    />
                    <Bar
                      dataKey="absent"
                      fill="oklch(0.78 0.16 75)"
                      radius={[3, 3, 0, 0]}
                      barSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Budget Allocation */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm h-full">
              <SectionTitle title="Budget Allocation" subtitle="By department" />
              <div className="h-[260px] min-h-[260px]">
                {!hasSalaryData ? (
                  <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                    No payroll generated for this month yet
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salaryDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={6}
                      cornerRadius={3}
                    >
                      {salaryDistribution.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "white",
                        border: "1px solid oklch(0.92 0.01 320)",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      formatter={(v) => fmtINR(Number(v))}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingTop: 12, fontSize: 12, fontWeight: 500 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Team Strength */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm h-full">
              <div className="flex items-center justify-between">
                <SectionTitle title="Team Strength" />
                <Badge variant="secondary" className="text-[11px] font-medium mb-4 px-2 py-0.5">
                  Live
                </Badge>
              </div>
              <div className="h-[220px] min-h-[220px]">
                {!hasHeadcountData ? (
                  <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                    No departments assigned yet
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={departmentHeadcount}>
                    <defs>
                      <linearGradient id="hc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.38 0.17 335)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="oklch(0.38 0.17 335)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.93 0.01 320)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      stroke="oklch(0.55 0.03 320)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="oklch(0.55 0.03 320)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "white",
                        border: "1px solid oklch(0.92 0.01 320)",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="oklch(0.38 0.17 335)"
                      strokeWidth={2}
                      fill="url(#hc)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Recent Acquisitions */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm h-full">
              <SectionTitle title="Recent Acquisitions" subtitle="Latest employee additions" />
              <ul className="space-y-2">
                {(recentEmployees as RecentEmployee[]).map((e) => (
                  <li
                    key={e._id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors group"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/8 text-primary text-[12px] font-semibold">
                        {e.name
                          .split(" ")
                          .map((s: string) => s[0])
                          .slice(0, 2)
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {e.name}
                      </div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {e.role} · {e.departmentId?.name}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[11px] font-medium px-1.5 py-0 border-transparent shrink-0",
                        e.status === "active"
                          ? "bg-success/8 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>

          {/* Pending Tickets */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm h-full">
              <SectionTitle
                title="Pending Tickets"
                subtitle="Attendance requests awaiting review"
              />
              <ul className="space-y-2">
                {(pendingTickets as PendingTicketItem[]).map((t) => (
                  <li
                    key={t._id}
                    className="rounded-lg border border-border/50 p-3.5 hover:border-primary/25 hover:bg-primary/1.5 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[14px] font-medium truncate group-hover:text-primary transition-colors">
                        {t.employeeId?.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] font-medium px-1.5 py-0 border-transparent shrink-0",
                          t.status === "approved"
                            ? "text-success bg-success/8"
                            : t.status === "rejected"
                              ? "text-destructive bg-destructive/8"
                              : "text-warning-foreground bg-warning/10",
                        )}
                      >
                        {t.status}
                      </Badge>
                    </div>
                    <div className="text-[12px] text-muted-foreground flex items-center justify-between">
                      <span>{t.type}</span>
                      <span className="opacity-60">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
