import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Search, Download, Wallet, Filter, CalendarDays, Loader2, Sparkles, Receipt, Info, ArrowUpRight, ArrowDownRight, Building2, MapPin } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormInput } from "@/components/shared/form-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/shared/stat-card";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { GridCard } from "@/components/shared/grid-card";
import { useSalaryService, type SalaryRecord } from "@/services/salary-service";
import { toast } from "sonner";
import { cn, formatTime12h } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { motion, AnimatePresence } from "framer-motion";
import { useDepartmentService } from "@/services/department-service";
import { useBranchService } from "@/services/branch-service";

export const Route = createFileRoute("/_app/salary")({
  component: SalaryPage,
});

function fmtINR(n: number) { return "₹" + (n || 0).toLocaleString("en-IN"); }

const MONTHS = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return {
    label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    m,
    y
  };
});

function SalaryPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(`${new Date().getMonth() + 1}-${new Date().getFullYear()}`);
  const [detailsRecord, setDetailsRecord] = useState<SalaryRecord | null>(null);
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("salary", "create");
  const canEdit = can("salary", "edit");

  const { departments } = useDepartmentService();
  const { branches } = useBranchService();

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [m, y] = selectedMonth.split("-").map(Number);
  const { salaryRecords: list, isLoading, updateSalary, generateSalaries, isGenerating } = useSalaryService(m, y);

  const filtered = useMemo(() => list.filter((s) => {
    const name = s.employeeId?.name || "";
    const okSearch = !search || name.toLowerCase().includes(search.toLowerCase());
    const okStatus = status === "all" || s.status === status;
    const okDept = deptFilter === "all" || (s.employeeId as any)?.departmentId?.name === deptFilter;
    const okBranch = branchFilter === "all" || (s.employeeId as any)?.branchId?.branchName === branchFilter;

    return okSearch && okStatus && okDept && okBranch;
  }), [search, status, deptFilter, branchFilter, list]);

  const total = filtered.reduce((s, r) => s + r.totalSalary, 0);
  const paid = filtered.filter((r) => r.status === "paid").reduce((s, r) => s + r.totalSalary, 0);
  const pending = filtered.filter((r) => r.status === "pending").reduce((s, r) => s + r.totalSalary, 0);

  const handlePay = async (id: string) => {
    try {
      await updateSalary({ id, status: "paid" });
    } catch (err) { }
  };

  const handleGenerate = async () => {
    try {
      await generateSalaries({ month: m, year: y });
    } catch (err) { }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Management"
        description="View and manage payroll for the organization."
        actions={
          <div className="flex gap-2">
            {canCreate && (
              <Button
                size="sm"
                className="h-9 text-[13px] bg-gradient-primary text-primary-foreground hover:shadow-md rounded-xl transition-all font-bold gap-2"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Payroll
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9 text-[13px] rounded-lg" onClick={() => toast.success("Exported as CSV")}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isLoading ? (
          <SkeletonLoader type="stats" count={3} className="col-span-3" />
        ) : (
          <>
            <StatCard label="Total Payroll" value={fmtINR(total)} icon={Wallet} accent="primary" />
            <StatCard label="Paid" value={fmtINR(paid)} icon={Wallet} accent="success" />
            <StatCard label="Pending" value={fmtINR(pending)} icon={Wallet} accent="warning" />
          </>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10 w-full md:w-[160px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <CalendarDays className="h-3.5 w-3.5" />
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                {MONTHS.map((item) => (
                  <SelectItem key={`${item.m}-${item.y}`} value={`${item.m}-${item.y}`}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 w-full md:w-[140px] border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-10 w-full md:w-[150px] border-border bg-white rounded-xl text-[13px] font-medium gap-2 px-3 shadow-none">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d._id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-10 w-full md:w-[150px] border-border bg-white rounded-xl text-[13px] font-medium gap-2 px-3 shadow-none">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b._id} value={b.branchName}>{b.branchName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <FormInput
          placeholder="Search employee..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <SkeletonLoader key="loading" type="table" count={10} />
        ) : view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((r, i) => (
              <GridCard
                key={r._id}
                title={r.employeeId?.name || "—"}
                subtitle={MONTHS.find(m => m.m === r.month)?.label || r.month}
                icon={<Wallet className="h-5 w-5 text-primary" />}
                delay={i * 0.04}
                statusNode={
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] font-bold px-2 py-0.5",
                      r.status === "paid" ? "border-success/40 text-success bg-success/8" : "border-warning/40 text-warning-foreground bg-warning/8"
                    )}
                  >{r.status.toUpperCase()}</Badge>
                }
              >
                <div className="space-y-3 mt-1">
                  <div className="flex justify-between items-center bg-muted/20 p-2 rounded-lg border border-border/40">
                    <span className="text-[11px] text-muted-foreground font-medium">Net Payable</span>
                    <span className="text-[16px] font-black text-primary">{fmtINR(r.totalSalary)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="p-2 rounded-lg bg-success/5 border border-success/10">
                      <p className="text-[9px] text-success font-bold uppercase tracking-tighter">Earnings</p>
                      <p className="text-[13px] font-bold">{fmtINR(r.baseSalary + (r.breakdown?.earnings || []).reduce((s: number, e: any) => s + (e.name !== "Basic Salary" ? e.amount : 0), 0))}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <p className="text-[9px] text-destructive font-bold uppercase tracking-tighter">Deductions</p>
                      <p className="text-[13px] font-bold">-{fmtINR(r.deductions)}</p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <ActionButton
                      variant="view"
                      showLabel
                      label="SLIP"
                      onClick={() => setDetailsRecord(r)}
                      className="flex-1 h-9"
                    />
                    {r.status === "pending" && canEdit && (
                      <ActionButton
                        variant="approve"
                        showLabel
                        label="PAY"
                        onClick={() => handlePay(r._id)}
                        className="flex-1 h-9 bg-emerald-500 text-white"
                      />
                    )}
                  </div>
                </div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DataTable
              className="shadow-sm"
              headers={[
                "Employee", "Month", "Days",
                <div key="base" className="text-right w-full">CTC</div>,
                <div key="bonus" className="text-right w-full">Allowance</div>,
                <div key="ded" className="text-right w-full">Deductions</div>,
                <div key="net" className="text-right w-full">Net Pay</div>,
                "Status",
                <div key="action" className="text-right w-full">Actions</div>
              ]}
              isEmpty={filtered.length === 0}
              emptyMessage="No payroll records found for this month."
            >
              {filtered.map((r) => (
                <DataTableRow key={r._id}>
                  <DataTableCell isFirst className="font-medium text-[13px]">{r.employeeId?.name || "—"}</DataTableCell>
                  <DataTableCell className="text-[12px] text-muted-foreground">{MONTHS.find(m => m.m === r.month)?.label || r.month}</DataTableCell>
                  <DataTableCell className="text-[12px] font-black">
                    {r.payableDays != null
                      ? `${r.payableDays}/${r.totalDaysInWindow ?? "—"}`
                      : (r.workingDays ? `${r.workingDays}/26` : "—")}
                    {r.needsReview && <span className="ml-1 text-amber-500 text-[10px]">⚠</span>}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-right font-mono text-muted-foreground">{fmtINR(r.baseSalary)}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right text-success font-medium">+{fmtINR((r.breakdown?.earnings || []).reduce((s: number, e: any) => s + (e.name !== "Basic Salary" ? e.amount : 0), 0))}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right text-destructive font-medium">-{fmtINR(r.deductions)}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right font-bold text-foreground">{fmtINR(r.totalSalary)}</DataTableCell>
                  <DataTableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5",
                        r.status === "paid" ? "border-success/40 text-success bg-success/8"
                          : r.status === "review" ? "border-amber-400/60 text-amber-600 bg-amber-50"
                          : "border-warning/40 text-warning-foreground bg-warning/8"
                      )}
                    >{r.status === "review" ? "REVIEW ⚠" : r.status.toUpperCase()}</Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end gap-1">
                      <ActionButton variant="view" tooltip="View Details" onClick={() => setDetailsRecord(r)} />
                      {r.status === "pending" && canEdit && (
                        <ActionButton variant="approve" tooltip="Pay Now" onClick={() => handlePay(r._id)} className="bg-emerald-500 text-white" />
                      )}
                      {r.status === "paid" && (
                        <ActionButton variant="history" tooltip="View Slip" onClick={() => setDetailsRecord(r)} />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breakdown Dialog */}
      <Dialog open={!!detailsRecord} onOpenChange={(o) => !o && setDetailsRecord(null)}>
        <DialogContent className="max-w-md rounded-2xl overflow-hidden p-0 border-none shadow-2xl">
          <div className="bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4">
            <DialogHeader>
              <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-primary/10 grid place-items-center mb-3">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-[18px] font-bold">{detailsRecord?.employeeId?.name}</DialogTitle>
              <DialogDescription className="text-[13px] font-medium text-muted-foreground">
                Salary Slip — {MONTHS.find(m => m.m === detailsRecord?.month)?.label}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 bg-white">
            {/* Earnings */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-success uppercase tracking-widest">
                <ArrowUpRight className="h-3.5 w-3.5" /> Earnings
              </div>
              <div className="space-y-2.5">
                {(detailsRecord?.breakdown?.earnings || []).map((e: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[13px]">
                    <span className="text-muted-foreground font-medium">{e.name}</span>
                    <span className="font-bold text-foreground">{fmtINR(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Deductions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-destructive uppercase tracking-widest">
                <ArrowDownRight className="h-3.5 w-3.5" /> Deductions
              </div>
              <div className="space-y-2.5">
                {(detailsRecord?.breakdown?.deductions || []).map((e: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[13px]">
                    <span className="text-muted-foreground font-medium">{e.name}</span>
                    <span className="font-bold text-destructive">-{fmtINR(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Footer */}
            <div className="mt-8 p-4 rounded-2xl bg-muted/30 border border-border/40 flex justify-between items-center">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Net Payable</p>
                <p className="text-[20px] font-black text-primary">{fmtINR(detailsRecord?.totalSalary || 0)}</p>
              </div>
              <Badge variant="outline" className={cn(
                "px-3 py-1 rounded-full text-[11px] font-bold",
                detailsRecord?.status === "paid" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning-foreground border-warning/20"
              )}>
                {detailsRecord?.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
