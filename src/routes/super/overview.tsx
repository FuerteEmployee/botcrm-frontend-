import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/services/superadmin-service";
import {
  TrendingUp,
  Clock,
  AlertCircle,
  Users,
  ArrowUp,
  Check,
  X,
  Play,
  Download,
  Plus,
  CalendarCheck,
  CalendarOff,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/super/overview")({
  component: OverviewPage,
});

const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  upgraded: { label: "Upgraded", color: "text-emerald-600", icon: ArrowUp },
  trial_started: { label: "Trial started", color: "text-blue-600", icon: Play },
  created: { label: "New customer", color: "text-blue-600", icon: Plus },
  renewed: { label: "Invoice paid", color: "text-emerald-600", icon: Check },
  expired: { label: "Subscription expired", color: "text-red-600", icon: X },
  downgraded: { label: "Downgraded", color: "text-amber-600", icon: ArrowUp },
  cancelled: { label: "Cancelled", color: "text-red-600", icon: X },
  reactivated: { label: "Reactivated", color: "text-emerald-600", icon: Check },
  paused: { label: "Paused", color: "text-amber-600", icon: Clock },
};

function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: getOverview,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const planDist = data?.planDistribution || [];
  const activity = data?.recentActivity || [];
  // Backend now excludes trials from per-plan counts, so the grand total used for
  // the distribution bars is (sum of plan counts) + trials. This avoids the old
  // double-count and keeps every bar on the same denominator.
  const planTotal = planDist.reduce((a: number, b: { count: number }) => a + b.count, 0);
  const totalTenants = planTotal + (stats.trials || 0);

  const handleExport = () => {
    downloadCSV(
      `recent-activity-${format(new Date(), "yyyy-MM-dd")}`,
      [
        { header: "Company", value: (r: any) => r.company },
        { header: "Phone", value: (r: any) => r.phone },
        { header: "Event", value: (r: any) => r.event },
        { header: "Plan", value: (r: any) => r.plan },
        { header: "Amount (INR)", value: (r: any) => r.amount || 0 },
        { header: "Employees", value: (r: any) => r.employeesUsed },
        { header: "Date", value: (r: any) => format(new Date(r.date), "yyyy-MM-dd") },
      ],
      activity
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Subscriptions Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "MMM yyyy")} · {stats.activeTenants || 0} active customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={activity.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Link to="/super/tenants">
            <Button size="sm" className="bg-primary hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New customer
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active customers"
            value={stats.activeTenants || 0}
            note={`+${stats.newThisMonth || 0} this month`}
            noteType="up"
            icon={<TrendingUp className="h-3 w-3" />}
          />
          <StatCard
            label="MRR"
            value={formatINR(stats.mrr || 0)}
            note="Monthly recurring"
            noteType="up"
            icon={<TrendingUp className="h-3 w-3" />}
          />
          <StatCard
            label="Trials active"
            value={stats.trials || 0}
            note={`${stats.expiringTrials || 0} expiring soon`}
            noteType="warn"
            icon={<Clock className="h-3 w-3" />}
          />
          <StatCard
            label="Failed payments"
            value={stats.failedPayments || 0}
            note="retry needed"
            noteType="danger"
            icon={<AlertCircle className="h-3 w-3" />}
          />
        </div>

        {/* Product KPIs */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Platform usage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total employees"
              value={stats.totalEmployees || 0}
              note="across all customers"
              noteType="up"
              icon={<Users className="h-3 w-3" />}
            />
            <StatCard
              label="Attendance today"
              value={stats.attendanceToday || 0}
              note="check-ins recorded"
              noteType="up"
              icon={<CalendarCheck className="h-3 w-3" />}
            />
            <StatCard
              label="Pending leaves"
              value={stats.pendingLeaves || 0}
              note="awaiting approval"
              noteType="warn"
              icon={<CalendarOff className="h-3 w-3" />}
            />
            <StatCard
              label="Open tickets"
              value={stats.openTickets || 0}
              note="support pending"
              noteType={stats.openTickets > 0 ? "danger" : "up"}
              icon={<MessageSquare className="h-3 w-3" />}
            />
          </div>
        </div>

        {/* Plan distribution */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Plan distribution</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {planDist.map((item: { plan: { _id: string; name: string; slug: string; color: string }; count: number; mrr: number }) => (
              <div
                key={item.plan._id}
                className="bg-card border rounded-xl p-4"
              >
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: item.plan.color }}
                    />
                    {item.plan.name}
                  </span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${totalTenants > 0 ? (item.count / totalTenants) * 100 : 0}%`,
                      background: item.plan.color,
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {formatINR(item.mrr)} MRR
                </p>
              </div>
            ))}

            {/* Trials card */}
            <div className="bg-card border rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Trials</span>
                <span className="font-semibold">{stats.trials || 0}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{
                    width: `${totalTenants > 0 ? ((stats.trials || 0) / totalTenants) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Converting
              </p>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Recent activity</h2>
          <div className="border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[28%]">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[20%]">Event</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[14%]">Plan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[14%]">Amount</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]">Employees</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]">When</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No recent activity yet
                    </td>
                  </tr>
                ) : (
                  activity.map((item: { company: string; phone: string; event: string; plan: string; planColor: string; amount: number; employeesUsed: number; date: string }, i: number) => {
                    const ev = EVENT_LABELS[item.event] || { label: item.event, color: "text-muted-foreground", icon: Clock };
                    const EvIcon = ev.icon;
                    return (
                      <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[13px]">{item.company}</div>
                          <div className="text-[10px] text-muted-foreground">{item.phone}</div>
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
                          {item.amount > 0 ? formatINR(item.amount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">{item.employeesUsed}</td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground">
                          {format(new Date(item.date), "MMM d")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  noteType,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  noteType: "up" | "warn" | "danger";
  icon: React.ReactNode;
}) {
  const noteColors = {
    up: "text-emerald-600",
    warn: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className={`text-[11px] mt-1 flex items-center gap-1 ${noteColors[noteType]}`}>
        {icon}
        {note}
      </p>
    </div>
  );
}
