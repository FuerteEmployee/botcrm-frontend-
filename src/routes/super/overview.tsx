import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getOverview,
  getSystemAnalytics,
  type OverviewActivity,
  type OverviewStats,
  type SystemAnalytics,
} from "@/services/superadmin-service";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  AlertTriangle,
  Users,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Play,
  Download,
  Plus,
  CalendarCheck,
  CalendarOff,
  MessageSquare,
  Fingerprint,
  RefreshCw,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatINR, formatINRFull } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { requestErrorMessage } from "@/services/request-error";

export const Route = createFileRoute("/super/overview")({
  component: OverviewPage,
});

const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  created: { label: "New customer", color: "text-blue-600 dark:text-blue-400", icon: Plus },
  trial_started: { label: "Trial started", color: "text-blue-600 dark:text-blue-400", icon: Play },
  upgraded: {
    label: "Plan upgraded",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: ArrowUp,
  },
  downgraded: {
    label: "Plan downgraded",
    color: "text-amber-600 dark:text-amber-400",
    icon: ArrowDown,
  },
  // A renewal extends the paid period; it does not create or pay an invoice.
  renewed: { label: "Renewed", color: "text-emerald-600 dark:text-emerald-400", icon: Check },
  reactivated: {
    label: "Switched back on",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: Check,
  },
  grace: { label: "Payment overdue", color: "text-amber-600 dark:text-amber-400", icon: Clock },
  paused: { label: "Paused", color: "text-amber-600 dark:text-amber-400", icon: Pause },
  expired: { label: "Plan ended", color: "text-red-600 dark:text-red-400", icon: X },
  cancelled: { label: "Cancelled", color: "text-red-600 dark:text-red-400", icon: X },
};

const STATUS_PARTS: {
  key: keyof Pick<
    OverviewStats,
    "activeTenants" | "grace" | "trials" | "paused" | "expired" | "noPlan"
  >;
  label: string;
  bar: string;
}[] = [
  { key: "activeTenants", label: "Paying", bar: "bg-emerald-500" },
  { key: "grace", label: "Payment overdue", bar: "bg-amber-400" },
  { key: "trials", label: "On trial", bar: "bg-blue-500" },
  { key: "paused", label: "Paused", bar: "bg-slate-400" },
  { key: "expired", label: "Ended", bar: "bg-red-400" },
  { key: "noPlan", label: "No plan", bar: "bg-zinc-300 dark:bg-zinc-600" },
];

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM");
};

function OverviewPage() {
  const overview = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: getOverview,
    retry: 1,
  });
  const analytics = useQuery({
    queryKey: ["superadmin", "analytics"],
    queryFn: getSystemAnalytics,
    retry: 1,
  });

  if (overview.isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="border rounded-xl bg-card p-6 text-center space-y-3">
          <AlertCircle className="h-6 w-6 mx-auto text-red-600" />
          <p className="text-sm">
            {requestErrorMessage(
              overview.error,
              "Could not load the overview. Please try again.",
            ) || "Could not load the overview."}
          </p>
          <Button variant="outline" className="h-10" onClick={() => overview.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  const { stats, planDistribution: planDist, recentActivity: activity } = overview.data;
  const generatedAt = new Date(overview.data.generatedAt);

  const handleExport = () => {
    downloadCSV(
      `recent-activity-${format(new Date(), "yyyy-MM-dd")}`,
      [
        { header: "Company", value: (r: OverviewActivity) => r.company },
        { header: "Phone", value: (r: OverviewActivity) => r.phone },
        {
          header: "Event",
          value: (r: OverviewActivity) => EVENT_LABELS[r.event]?.label || r.event,
        },
        { header: "Plan", value: (r: OverviewActivity) => r.plan },
        { header: "MRR now (INR)", value: (r: OverviewActivity) => r.mrr || 0 },
        { header: "Employees", value: (r: OverviewActivity) => r.employees },
        {
          header: "Date",
          value: (r: OverviewActivity) => format(new Date(r.date), "yyyy-MM-dd HH:mm"),
        },
      ],
      activity,
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-b bg-card">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(generatedAt, "d MMM yyyy, h:mm a")} · {stats.totalTenants} companies
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-10 flex-1 sm:flex-none"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
            aria-label="Refresh figures"
          >
            <RefreshCw
              className={`h-4 w-4 sm:mr-1.5 ${overview.isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-1 sm:flex-none"
            onClick={handleExport}
            disabled={activity.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
          <Button asChild className="h-10 flex-1 sm:flex-none bg-primary hover:bg-primary/90">
            <Link to="/super/tenants">
              <Plus className="h-4 w-4 mr-1.5" />
              New customer
            </Link>
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {stats.orphanSubscriptions > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {stats.orphanSubscriptions}{" "}
              {stats.orphanSubscriptions === 1 ? "subscription belongs" : "subscriptions belong"} to
              a company that no longer exists.{" "}
              {stats.orphanSubscriptions === 1 ? "It is" : "They are"} left out of every figure on
              this page.
            </p>
          </div>
        )}

        {/* Money and customers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Monthly revenue (MRR)"
            value={formatINRFull(stats.mrr)}
            note={`${formatINR(stats.arr)} a year`}
            noteType="up"
            icon={<TrendingUp className="h-3 w-3" />}
            title="Sum of each paying company's current plan price. Annual plans count as one twelfth of the annual price."
          />
          <StatCard
            label="Paying customers"
            value={stats.activeTenants}
            note={`${stats.newThisMonth} new this month`}
            noteType="up"
            icon={<TrendingUp className="h-3 w-3" />}
          />
          <StatCard
            label="On trial"
            value={stats.trials}
            note={`${stats.expiringTrials} ending within 7 days`}
            noteType={stats.expiringTrials > 0 ? "warn" : "muted"}
            icon={<Clock className="h-3 w-3" />}
          />
          <StatCard
            label="Plans ended this month"
            value={stats.churnedThisMonth}
            note={`${stats.expired} ended in total`}
            noteType={stats.churnedThisMonth > 0 ? "danger" : "muted"}
            icon={<TrendingDown className="h-3 w-3" />}
          />
        </div>

        {/* Company status breakdown */}
        <section className="bg-card border rounded-xl p-4" aria-labelledby="status-heading">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="status-heading" className="text-sm font-semibold">
              Companies by status
            </h2>
            <span className="text-xs text-muted-foreground">{stats.totalTenants} in total</span>
          </div>
          <div
            className="flex h-2.5 rounded-full overflow-hidden bg-muted gap-[2px]"
            role="img"
            aria-label="Companies by status"
          >
            {STATUS_PARTS.map((p) =>
              stats[p.key] > 0 ? (
                <div
                  key={p.key}
                  className={`${p.bar} h-full first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${(stats[p.key] / Math.max(1, stats.totalTenants)) * 100}%` }}
                  title={`${p.label}: ${stats[p.key]}`}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {STATUS_PARTS.map((p) => (
              <li key={p.key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${p.bar}`} aria-hidden />
                <span className="text-muted-foreground">{p.label}</span>
                <span className="font-semibold ml-auto sm:ml-1">{stats[p.key]}</span>
              </li>
            ))}
          </ul>
          {(stats.failedPayments > 0 || stats.overdueInvoices > 0) && (
            <Link
              to="/super/billing"
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {stats.overdueInvoices} overdue and {stats.failedPayments} failed invoices. Open
              Billing
            </Link>
          )}
        </section>

        {/* Product usage */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Platform usage</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              label="Employees"
              value={stats.totalEmployees}
              note={`${stats.activeEmployees} active · ${stats.inactiveEmployees} switched off`}
              noteType="muted"
              icon={<Users className="h-3 w-3" />}
            />
            <StatCard
              label="Attendance today"
              value={stats.attendanceToday}
              note="days recorded today"
              noteType="muted"
              icon={<CalendarCheck className="h-3 w-3" />}
            />
            <StatCard
              label="Leave requests"
              value={stats.pendingLeaves}
              note="waiting for a decision"
              noteType={stats.pendingLeaves > 0 ? "warn" : "muted"}
              icon={<CalendarOff className="h-3 w-3" />}
            />
            <StatCard
              label="Open tickets"
              value={stats.openTickets}
              note="raised by employees"
              noteType={stats.openTickets > 0 ? "warn" : "muted"}
              icon={<MessageSquare className="h-3 w-3" />}
            />
            <StatCard
              label="Machines online"
              value={`${stats.machinesOnline} of ${stats.machinesTotal}`}
              note={`heard from in the last ${Math.round(stats.machineQuietMinutes / 60)} h`}
              noteType={stats.machinesTotal > stats.machinesOnline ? "danger" : "muted"}
              icon={<Fingerprint className="h-3 w-3" />}
            />
          </div>
          {stats.unassignedEmployees > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {stats.unassignedEmployees} more employee records belong to no company and are not
              counted.
            </p>
          )}
        </div>

        {/* Plan distribution */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Paying customers by plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {planDist.map((item) => (
              <div key={item.plan._id} className="bg-card border rounded-xl p-4">
                <div className="flex justify-between gap-2 text-sm mb-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full inline-block shrink-0"
                      style={{ background: item.plan.color }}
                    />
                    <span className="truncate">{item.plan.name}</span>
                    {!item.plan.isActive && (
                      <span className="text-[11px] text-muted-foreground">(switched off)</span>
                    )}
                  </span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${stats.activeTenants + stats.grace > 0 ? (item.count / (stats.activeTenants + stats.grace)) * 100 : 0}%`,
                      background: item.plan.color,
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {formatINRFull(item.mrr)} a month
                </p>
              </div>
            ))}
          </div>
        </div>

        <AnalyticsSection query={analytics} />

        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Recent activity</h2>
          {activity.length === 0 ? (
            <div className="border rounded-xl bg-card px-4 py-8 text-center text-muted-foreground text-sm">
              No activity yet
            </div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="sm:hidden space-y-2">
                {activity.map((item, i) => {
                  const ev = EVENT_LABELS[item.event] || {
                    label: item.event,
                    color: "text-muted-foreground",
                    icon: Clock,
                  };
                  const EvIcon = ev.icon;
                  return (
                    <li key={i} className="border rounded-xl bg-card p-3">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-sm truncate">{item.company}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {format(new Date(item.date), "d MMM")}
                        </span>
                      </div>
                      <div className={`mt-1 flex items-center gap-1 text-xs ${ev.color}`}>
                        <EvIcon className="h-3 w-3" /> {ev.label} ·{" "}
                        <span className="text-muted-foreground">{item.plan}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {item.employees} employees ·{" "}
                        {item.mrr > 0 ? `${formatINRFull(item.mrr)} a month` : "not paying now"}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {/* Tablet and up: table */}
              <div className="hidden sm:block border rounded-xl overflow-x-auto bg-card">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[28%]">
                        Company
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[20%]">
                        Event
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[14%]">
                        Plan
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[14%]">
                        MRR now
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]">
                        Employees
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((item, i) => {
                      const ev = EVENT_LABELS[item.event] || {
                        label: item.event,
                        color: "text-muted-foreground",
                        icon: Clock,
                      };
                      const EvIcon = ev.icon;
                      return (
                        <tr
                          key={i}
                          className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-[13px]">{item.company}</div>
                            <div className="text-[11px] text-muted-foreground">{item.phone}</div>
                          </td>
                          <td className={`px-4 py-3 text-xs ${ev.color}`}>
                            <span className="flex items-center gap-1">
                              <EvIcon className="h-3 w-3" />
                              {ev.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-xs">
                              <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={{ background: item.planColor }}
                              />
                              {item.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-xs">
                            {item.mrr > 0 ? formatINRFull(item.mrr) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">{item.employees}</td>
                          <td className="px-4 py-3 text-[11px] text-muted-foreground">
                            {format(new Date(item.date), "d MMM yyyy")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsSection({
  query,
}: {
  query: { data?: SystemAnalytics; isLoading: boolean; isError: boolean; refetch: () => unknown };
}) {
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="border rounded-xl bg-card p-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Could not load the growth and module figures.</span>
        <Button variant="outline" className="h-10" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const { tenantGrowth, featureAdoption, liveCompanies } = query.data;
  const maxJoined = Math.max(1, ...tenantGrowth.map((g) => g.count));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="bg-card border rounded-xl p-4" aria-labelledby="growth-heading">
        <h2 id="growth-heading" className="text-sm font-semibold">
          New companies
        </h2>
        <p className="text-[11px] text-muted-foreground mb-4">
          Signed up each month (India time), last 6 months
        </p>
        <div className="flex items-end gap-2 h-36 border-b" role="list">
          {tenantGrowth.map((g) => (
            <div
              key={g.month}
              role="listitem"
              className="flex-1 h-full flex flex-col justify-end items-center gap-1"
              title={`${monthLabel(g.month)}: ${g.count} new, ${g.churned} ended`}
              aria-label={`${monthLabel(g.month)}: ${g.count} new companies, ${g.churned} plans ended`}
            >
              <span className="text-xs font-semibold">{g.count}</span>
              <div
                className="w-full max-w-10 bg-primary rounded-t"
                style={{
                  height: `${(g.count / maxJoined) * 100}%`,
                  minHeight: g.count > 0 ? 4 : 0,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-1.5">
          {tenantGrowth.map((g) => (
            <div key={g.month} className="flex-1 text-center">
              <div className="text-[11px] text-muted-foreground">{monthLabel(g.month)}</div>
              <div
                className={`text-[11px] ${g.churned > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
              >
                {g.churned} ended
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-card border rounded-xl p-4" aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="text-sm font-semibold">
          Modules available
        </h2>
        <p className="text-[11px] text-muted-foreground mb-3">
          Share of the {liveCompanies} companies using the product (paying or on trial) whose plan
          includes it
        </p>
        {featureAdoption.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules in the plan catalog.</p>
        ) : (
          <ul className="space-y-2">
            {featureAdoption.map((f) => (
              <li
                key={f.key}
                className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"
              >
                <span className="truncate" title={f.label}>
                  {f.label}
                </span>
                <div
                  className="h-2 rounded-full bg-muted overflow-hidden"
                  title={`${f.adoptedCount} of ${f.liveCompanies}`}
                >
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${f.adoptionPercent}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground w-16 text-right">
                  {f.adoptedCount} of {f.liveCompanies}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  noteType,
  icon,
  title,
}: {
  label: string;
  value: string | number;
  note: string;
  noteType: "up" | "warn" | "danger" | "muted";
  icon: React.ReactNode;
  title?: string;
}) {
  const noteColors = {
    up: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className="bg-card border rounded-xl p-3 sm:p-4 min-w-0" title={title}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold break-words">{value}</p>
      <p className={`text-[11px] mt-1 flex items-center gap-1 ${noteColors[noteType]}`}>
        {icon}
        {note}
      </p>
    </div>
  );
}
