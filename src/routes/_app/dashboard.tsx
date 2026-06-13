import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, UserCheck, UserX, Clock, Wallet, TrendingUp, BadgeDollarSign } from "lucide-react";
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
import { useDashboardService } from "@/services/dashboard-service";
import { attendanceTrend, salaryDistribution, departmentHeadcount } from "@/lib/mock-data"; // Trends still mock for now
import { cn } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";

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

function DashboardPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { summary, isLoading } = useDashboardService();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" description="Loading real-time metrics..." />
        <SkeletonLoader type="stats" count={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonLoader type="card" count={3} className="lg:col-span-3" />
        </div>
      </div>
    );
  }

  const { stats, recentEmployees, pendingTickets } = summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        description="Monitor your workforce performance and operational trends in real-time."
      />

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
          label="Present Today"
          value={stats.presentToday}
          icon={UserCheck}
          accent="success"
          delay={0.05}
          to="/attendance"
          search={{ status: "present" }}
        />
        <StatCard
          label="Absent Today"
          value={stats.absentToday}
          icon={UserX}
          accent="destructive"
          delay={0.1}
          to="/attendance"
          search={{ status: "absent" }}
        />
        <StatCard
          label="Half Day"
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
          to="/settings"
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

      {/* eslint-disable-next-line no-constant-binary-expression */}
      {false && (
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
