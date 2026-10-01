import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Search, Download, Wallet, Filter, CalendarDays, Loader2, Sparkles, Receipt, Building2, MapPin, HandCoins, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormInput } from "@/components/shared/form-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/shared/stat-card";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { GridCard } from "@/components/shared/grid-card";
import { useSalaryService, type SalaryRecord } from "@/services/salary-service";
import { fetchApprovedAdvancesForEmployee, type AdvanceSalaryRequest } from "@/services/advance-salary-service";
import { fetchApprovedExpensesForEmployee, type Expense } from "@/services/expense-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { isNativeApp } from "@/lib/geolocation";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { motion, AnimatePresence } from "framer-motion";
import { useDepartmentService } from "@/services/department-service";
import { useBranchService } from "@/services/branch-service";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SalarySlipDialog, money, monthLabel, statusLabel, statusClass, salaryBasis, earnedOf,
} from "@/components/pages/salary-slip-dialog";

export const Route = createFileRoute("/_app/salary")({
  component: SalaryPage,
});


const MONTHS = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setDate(1); // setMonth on the 31st skips short months (31 Oct - 1 month = 1 Oct)
  d.setMonth(d.getMonth() - i);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return {
    label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    m,
    y
  };
});

const canPay = (r: SalaryRecord) => r.status === "pending" || r.status === "final";
const notPaid = (r: SalaryRecord) => r.status !== "paid";

function daysCell(r: SalaryRecord): string {
  if (r.employmentType === "daily" || r.employmentType === "hourly") return "—";
  if (r.payableDays != null) return `${r.payableDays}/${r.totalDaysInWindow ?? "—"}`;
  return "—";
}

function SalaryPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(`${MONTHS[0].m}-${MONTHS[0].y}`);
  const [detailsRecord, setDetailsRecord] = useState<SalaryRecord | null>(null);
  const [advanceModalRecord, setAdvanceModalRecord] = useState<SalaryRecord | null>(null);
  const [advanceOptions, setAdvanceOptions] = useState<AdvanceSalaryRequest[]>([]);
  const [isLoadingAdvances, setIsLoadingAdvances] = useState(false);
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<Set<string>>(new Set());
  const [expenseModalRecord, setExpenseModalRecord] = useState<SalaryRecord | null>(null);
  const [expenseOptions, setExpenseOptions] = useState<Expense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [payRecord, setPayRecord] = useState<SalaryRecord | null>(null);
  const [undoRecord, setUndoRecord] = useState<SalaryRecord | null>(null);
  const [recalcId, setRecalcId] = useState<string | null>(null);
  const { can } = usePermission();
  const canCreate = can("salary", "create");
  const canEdit = can("salary", "edit");
  const canDelete = can("salary", "delete");

  const { departments } = useDepartmentService();
  const { branches } = useBranchService();

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [m, y] = selectedMonth.split("-").map(Number);
  const {
    salaryRecords: list, isLoading, error, refetch, updateSalary, isUpdating, deleteSalary, isDeleting,
    generateSalaries, isGenerating, generateSalaryForEmployee, isGeneratingOne,
  } = useSalaryService(m, y);

  const filtered = useMemo(() => list.filter((s) => {
    const name = s.employeeId?.name || "";
    const okSearch = !search || name.toLowerCase().includes(search.toLowerCase());
    const okStatus = status === "all" || s.status === status;
    const okDept = deptFilter === "all" || s.employeeId?.departmentId?.name === deptFilter;
    const okBranch = branchFilter === "all" || s.employeeId?.branchId?.branchName === branchFilter;

    return okSearch && okStatus && okDept && okBranch;
  }), [search, status, deptFilter, branchFilter, list]);

  // "Not paid yet" is everything that isn't paid -- pending (month still
  // running), final (month over) and needs review -- so the three cards add up.
  const total = filtered.reduce((s, r) => s + (r.totalSalary || 0), 0);
  const paid = filtered.filter((r) => r.status === "paid").reduce((s, r) => s + (r.totalSalary || 0), 0);
  const unpaid = total - paid;
  const reviewCount = filtered.filter((r) => r.status === "review").length;

  const confirmPay = async () => {
    if (!payRecord) return;
    try {
      await updateSalary({ id: payRecord._id, status: "paid" });
      setPayRecord(null);
    } catch { /* toast shown by the service */ }
  };

  const confirmUndo = async () => {
    if (!undoRecord) return;
    try {
      // Back to what generation would call it: final for a completed month,
      // pending for the running one.
      const now = new Date();
      const running = undoRecord.year === now.getFullYear() && undoRecord.month === now.getMonth() + 1;
      await updateSalary({ id: undoRecord._id, status: running ? "pending" : "final" });
      setUndoRecord(null);
      setDetailsRecord(null);
    } catch { /* toast shown by the service */ }
  };

  const recalc = async (r: SalaryRecord) => {
    setRecalcId(r._id);
    try {
      await generateSalaryForEmployee({ employeeId: r.employeeId._id, month: r.month, year: r.year });
    } catch { /* toast shown by the service */ } finally {
      setRecalcId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteSalary(deleteId);
      setDeleteId(null);
    } catch { /* toast shown by the service */ }
  };

  const handleExport = () => {
    if (isNativeApp()) {
      toast.info("Export works in the web browser. Open the admin panel on a computer to download it.");
      return;
    }
    if (filtered.length === 0) {
      toast.info("There is nothing to export for this month.");
      return;
    }
    downloadCSV(`salary-${y}-${String(m).padStart(2, "0")}`, [
      { header: "Employee", value: (r) => r.employeeId?.name },
      { header: "Phone", value: (r) => r.employeeId?.phone },
      { header: "Month", value: (r) => monthLabel(r.month, r.year) },
      { header: "Pay type", value: (r) => r.employmentType || "monthly" },
      { header: "Salary", value: (r) => r.baseSalary },
      { header: "Days paid", value: (r) => (r.payableDays != null ? `${r.payableDays} of ${r.totalDaysInWindow ?? ""}` : "") },
      { header: "Earned", value: (r) => Math.round(earnedOf(r) * 100) / 100 },
      { header: "Deductions", value: (r) => r.deductions },
      { header: "Net pay", value: (r) => r.totalSalary },
      { header: "Status", value: (r) => statusLabel(r.status) },
    ], filtered);
    toast.success(`Exported ${filtered.length} salar${filtered.length === 1 ? "y" : "ies"}`);
  };

  // Regeneration rewrites every active employee's record for the selected
  // month, so the admin is told which month and how many paid payslips are in
  // it before it runs. Counted from `list` (the whole month) rather than
  // `filtered`, because generation ignores the on-screen filters entirely.
  const paidCount = list.filter((r) => r.status === "paid").length;
  const selectedMonthLabel = MONTHS.find((item) => `${item.m}-${item.y}` === selectedMonth)?.label
    ?? selectedMonth;

  const handleGenerate = async () => {
    try {
      await generateSalaries({ month: m, year: y });
      setGenerateOpen(false);
    } catch { /* toast shown by the service */ }
  };

  const openAdvanceModal = async (record: SalaryRecord) => {
    setAdvanceModalRecord(record);
    setSelectedAdvanceIds(new Set());
    setIsLoadingAdvances(true);
    try {
      const advances = await fetchApprovedAdvancesForEmployee(record.employeeId._id);
      setAdvanceOptions(Array.isArray(advances) ? advances : []);
    } catch (err) {
      setAdvanceOptions([]);
    } finally {
      setIsLoadingAdvances(false);
    }
  };

  const toggleAdvanceSelected = (id: string) => {
    setSelectedAdvanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmAdvanceDeduction = async () => {
    if (!advanceModalRecord) return;
    try {
      await generateSalaryForEmployee({
        employeeId: advanceModalRecord.employeeId._id,
        month: advanceModalRecord.month,
        year: advanceModalRecord.year,
        advanceRequestIds: Array.from(selectedAdvanceIds),
      });
      setAdvanceModalRecord(null);
    } catch { /* toast shown by the service */ }
  };

  const openExpenseModal = async (record: SalaryRecord) => {
    setExpenseModalRecord(record);
    setSelectedExpenseIds(new Set());
    setIsLoadingExpenses(true);
    try {
      const expenses = await fetchApprovedExpensesForEmployee(record.employeeId._id);
      setExpenseOptions(Array.isArray(expenses) ? expenses : []);
    } catch (err) {
      setExpenseOptions([]);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  const toggleExpenseSelected = (id: string) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmExpenseReimbursement = async () => {
    if (!expenseModalRecord) return;
    try {
      await generateSalaryForEmployee({
        employeeId: expenseModalRecord.employeeId._id,
        month: expenseModalRecord.month,
        year: expenseModalRecord.year,
        expenseIds: Array.from(selectedExpenseIds),
      });
      setExpenseModalRecord(null);
    } catch { /* toast shown by the service */ }
  };

  // Row actions, shared by the grid cards and the table rows.
  const rowActions = (r: SalaryRecord, size: string) => (
    <>
      {notPaid(r) && canEdit && (
        <ActionButton variant="comment" icon={HandCoins} tooltip="Deduct an advance" aria-label="Deduct an advance" onClick={() => openAdvanceModal(r)} className={size} />
      )}
      {notPaid(r) && canEdit && (
        <ActionButton variant="comment" icon={Receipt} tooltip="Add an expense claim" aria-label="Add an expense claim" onClick={() => openExpenseModal(r)} className={size} />
      )}
      {canCreate && (
        <ActionButton
          variant="refresh"
          icon={RefreshCw}
          tooltip="Recalculate"
          aria-label="Recalculate"
          loading={recalcId === r._id}
          disabled={isGeneratingOne}
          onClick={() => recalc(r)}
          className={size}
        />
      )}
      {canDelete && notPaid(r) && (
        <ActionButton variant="delete" tooltip="Delete" aria-label="Delete" onClick={() => setDeleteId(r._id)} className={size} />
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Management"
        description="Work out, check and pay salaries for each month."
        actions={
          <div className="flex gap-2">
            {canCreate && (
              <Button
                size="sm"
                className="h-10 text-[13px] bg-gradient-primary text-primary-foreground hover:shadow-md rounded-xl transition-all font-bold gap-2"
                onClick={() => setGenerateOpen(true)}
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
            <Button size="sm" variant="outline" className="h-10 text-[13px] rounded-xl" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {isLoading ? (
          <SkeletonLoader type="stats" count={3} className="col-span-2 sm:col-span-3" />
        ) : (
          <>
            <StatCard label="Total Payroll" value={formatINR(total)} icon={Wallet} accent="primary" className="col-span-2 sm:col-span-1" />
            <StatCard label="Paid" value={formatINR(paid)} icon={CheckCircle2} accent="success" />
            <StatCard label="Not paid yet" value={formatINR(unpaid)} icon={Wallet} accent="warning" />
          </>
        )}
      </div>

      {reviewCount > 0 && !isLoading && (
        <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {reviewCount} salar{reviewCount === 1 ? "y needs" : "ies need"} checking: some attendance days could not be
            worked out automatically. Correct them on the Attendance page, then press Recalculate.
          </p>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2 w-full md:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger aria-label="Month" className="col-span-2 md:col-auto h-10 w-full md:w-[170px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
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
              <SelectTrigger aria-label="Status" className="h-10 w-full md:w-[150px] border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="review">Needs review</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger aria-label="Department" className="h-10 w-full md:w-[160px] border-border bg-white rounded-xl text-[13px] font-medium gap-2 px-3 shadow-none">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All departments</SelectItem>
                {(departments || []).map(d => <SelectItem key={d._id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger aria-label="Branch" className="col-span-2 md:col-auto h-10 w-full md:w-[160px] border-border bg-white rounded-xl text-[13px] font-medium gap-2 px-3 shadow-none">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All branches</SelectItem>
                {(branches || []).map(b => <SelectItem key={b._id} value={b.branchName}>{b.branchName}</SelectItem>)}
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
        ) : error ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-[14px] font-semibold text-foreground">Could not load salaries for {selectedMonthLabel}.</p>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => refetch()}>Try again</Button>
          </motion.div>
        ) : view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-[13px] text-muted-foreground">
                No salaries for {selectedMonthLabel} yet.{canCreate ? " Press Generate Payroll to work them out." : ""}
              </p>
            )}
            {filtered.map((r, i) => (
              <GridCard
                key={r._id}
                title={r.employeeId?.name || "—"}
                subtitle={monthLabel(r.month, r.year)}
                icon={<Wallet className="h-5 w-5 text-primary" />}
                delay={i * 0.04}
                statusNode={
                  <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5", statusClass(r.status))}>
                    {statusLabel(r.status)}
                  </Badge>
                }
              >
                <div className="space-y-3 mt-1">
                  <div className="flex justify-between items-center gap-2 bg-muted/20 p-2 rounded-lg border border-border/40">
                    <span className="text-[11px] text-muted-foreground font-medium shrink-0">Net pay</span>
                    <span className="text-[16px] font-black text-primary truncate min-w-0">{money(r.totalSalary)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="p-2 rounded-lg bg-success/5 border border-success/10 min-w-0">
                      <p className="text-[11px] text-success font-bold uppercase tracking-tight">Earned</p>
                      <p className="text-[13px] font-bold truncate">{money(earnedOf(r))}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/10 min-w-0">
                      <p className="text-[11px] text-destructive font-bold uppercase tracking-tight">Deductions</p>
                      <p className="text-[13px] font-bold truncate">-{money(r.deductions)}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Salary {salaryBasis(r)}{r.payableDays != null && r.employmentType !== "daily" && r.employmentType !== "hourly" ? ` · ${r.payableDays} of ${r.totalDaysInWindow ?? "—"} days paid` : ""}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                    <ActionButton
                      variant="view"
                      showLabel
                      label="Slip"
                      onClick={() => setDetailsRecord(r)}
                      className="flex-1 h-10"
                    />
                    {canPay(r) && canEdit && (
                      <ActionButton
                        variant="approve"
                        showLabel
                        label="Pay"
                        onClick={() => setPayRecord(r)}
                        className="flex-1 h-10 bg-emerald-500 text-white"
                      />
                    )}
                    <div className="flex gap-2">{rowActions(r, "h-10 w-10")}</div>
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
                "Employee", "Days paid",
                <div key="base" className="text-right w-full">Salary</div>,
                <div key="earned" className="text-right w-full">Earned</div>,
                <div key="ded" className="text-right w-full">Deductions</div>,
                <div key="net" className="text-right w-full">Net pay</div>,
                "Status",
                <div key="action" className="text-right w-full">Actions</div>
              ]}
              isEmpty={filtered.length === 0}
              emptyMessage={`No salaries for ${selectedMonthLabel} yet.${canCreate ? " Press Generate Payroll to work them out." : ""}`}
            >
              {filtered.map((r) => (
                <DataTableRow key={r._id}>
                  <DataTableCell isFirst className="font-medium text-[13px]">{r.employeeId?.name || "—"}</DataTableCell>
                  <DataTableCell className="text-[12px] font-black whitespace-nowrap">
                    {daysCell(r)}
                    {r.status === "review" && <AlertTriangle className="inline ml-1 h-3.5 w-3.5 text-amber-500" aria-label="Needs checking" />}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-right font-mono text-muted-foreground whitespace-nowrap">{salaryBasis(r)}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right text-success font-medium whitespace-nowrap">{money(earnedOf(r))}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right text-destructive font-medium whitespace-nowrap">-{money(r.deductions)}</DataTableCell>
                  <DataTableCell className="text-[13px] text-right font-bold text-foreground whitespace-nowrap">{money(r.totalSalary)}</DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5 whitespace-nowrap", statusClass(r.status))}>
                      {statusLabel(r.status)}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end gap-1">
                      <ActionButton variant="view" tooltip="View slip" aria-label="View slip" onClick={() => setDetailsRecord(r)} className="h-10 w-10" />
                      {canPay(r) && canEdit && (
                        <ActionButton variant="approve" tooltip="Mark as paid" aria-label="Mark as paid" onClick={() => setPayRecord(r)} className="h-10 w-10 bg-emerald-500 text-white" />
                      )}
                      {rowActions(r, "h-10 w-10")}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      <SalarySlipDialog
        record={detailsRecord}
        onClose={() => setDetailsRecord(null)}
        onUndoPayment={canEdit ? (r) => setUndoRecord(r) : undefined}
      />

      {/* Mark as paid confirmation */}
      <AlertDialog open={!!payRecord} onOpenChange={(o) => !o && setPayRecord(null)}>
        <AlertDialogContent className="rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[18px] font-black tracking-tight">Mark this salary as paid?</AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] text-muted-foreground">
              {payRecord?.employeeId?.name} — {monthLabel(payRecord?.month, payRecord?.year)}: <b className="text-foreground">{money(payRecord?.totalSalary)}</b>.
              {payRecord?.status === "pending" && " This month is not over yet, so the amount may still change."}
              {" "}A paid payslip can't be deleted unless you undo the payment first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl h-10">Cancel</AlertDialogCancel>
            <ActionButton variant="approve" showLabel label="Mark as paid" loading={isUpdating} disabled={isUpdating} onClick={confirmPay} className="bg-emerald-500 text-white" />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Undo payment confirmation */}
      <AlertDialog open={!!undoRecord} onOpenChange={(o) => !o && setUndoRecord(null)}>
        <AlertDialogContent className="rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[18px] font-black tracking-tight">Undo this payment?</AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] text-muted-foreground">
              Use this only if {undoRecord?.employeeId?.name}'s {monthLabel(undoRecord?.month, undoRecord?.year)} salary
              was marked paid by mistake. The payment date will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl h-10">Keep as paid</AlertDialogCancel>
            <ActionButton variant="revoke" showLabel label="Undo payment" loading={isUpdating} disabled={isUpdating} onClick={confirmUndo} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advance Salary Deduction Dialog */}
      <Dialog open={!!advanceModalRecord} onOpenChange={(o) => !o && setAdvanceModalRecord(null)}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-black tracking-tight">
              Deduct an advance
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              {advanceModalRecord?.employeeId?.name} — {monthLabel(advanceModalRecord?.month, advanceModalRecord?.year)}.
              Choose the approved advances or loans to take back from this month's salary.
            </DialogDescription>
          </DialogHeader>

          {isLoadingAdvances ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : advanceOptions.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              This employee has no approved advances or loans waiting to be taken back.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {advanceOptions.map((req) => (
                <label
                  key={req._id}
                  className="flex items-center justify-between gap-3 p-3 min-h-[48px] rounded-xl border border-border/60 cursor-pointer hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selectedAdvanceIds.has(req._id)}
                      onCheckedChange={() => toggleAdvanceSelected(req._id)}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold truncate">
                        {req.type === "loan" ? "Loan" : "Advance salary"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{req.reason}</p>
                    </div>
                  </div>
                  <span className="text-[13px] font-black text-foreground shrink-0">
                    {money(req.approvedAmount ?? req.amount)}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-1 pt-2 border-t border-border/40">
            <span className="text-[12px] font-bold text-muted-foreground">Total selected</span>
            <span className="text-[15px] font-black text-primary">
              {money(advanceOptions
                .filter((req) => selectedAdvanceIds.has(req._id))
                .reduce((s, req) => s + (req.approvedAmount ?? req.amount), 0))}
            </span>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              className="rounded-xl h-10"
              onClick={() => setAdvanceModalRecord(null)}
              disabled={isGeneratingOne}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl h-10 bg-gradient-primary text-primary-foreground"
              onClick={confirmAdvanceDeduction}
              disabled={isGeneratingOne || selectedAdvanceIds.size === 0}
            >
              {isGeneratingOne ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Deduct and recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Reimbursement Dialog */}
      <Dialog open={!!expenseModalRecord} onOpenChange={(o) => !o && setExpenseModalRecord(null)}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-black tracking-tight">
              Add an expense claim
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              {expenseModalRecord?.employeeId?.name} — {monthLabel(expenseModalRecord?.month, expenseModalRecord?.year)}.
              Choose the approved expense claims to pay with this month's salary.
            </DialogDescription>
          </DialogHeader>

          {isLoadingExpenses ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : expenseOptions.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              This employee has no approved expense claims waiting to be paid.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {expenseOptions.map((exp) => (
                <label
                  key={exp._id}
                  className="flex items-center justify-between gap-3 p-3 min-h-[48px] rounded-xl border border-border/60 cursor-pointer hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selectedExpenseIds.has(exp._id)}
                      onCheckedChange={() => toggleExpenseSelected(exp._id)}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold truncate">{exp.category}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{exp.description || "—"}</p>
                    </div>
                  </div>
                  <span className="text-[13px] font-black text-foreground shrink-0">
                    {money(exp.amount)}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-1 pt-2 border-t border-border/40">
            <span className="text-[12px] font-bold text-muted-foreground">Total selected</span>
            <span className="text-[15px] font-black text-primary">
              {money(expenseOptions
                .filter((exp) => selectedExpenseIds.has(exp._id))
                .reduce((s, exp) => s + exp.amount, 0))}
            </span>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              className="rounded-xl h-10"
              onClick={() => setExpenseModalRecord(null)}
              disabled={isGeneratingOne}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl h-10 bg-gradient-primary text-primary-foreground"
              onClick={confirmExpenseReimbursement}
              disabled={isGeneratingOne || selectedExpenseIds.size === 0}
            >
              {isGeneratingOne ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Add and recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete this salary record?"
        description="The record is removed. Any advance or expense claim it included goes back to the waiting list, so a later payroll can pick it up."
        confirmText="Delete"
        isLoading={isDeleting}
      />

      {/* Generate Payroll confirmation.
          This used to fire straight from the button. It rewrites the record of
          EVERY active employee for the selected month, ignoring the filters on
          screen, so it names the month and the number of paid payslips it is
          about to recompute rather than leaving the admin to infer both. */}
      <AlertDialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <AlertDialogContent className="rounded-2xl border-primary/20 shadow-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-2">
              <Sparkles className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-[18px] font-black tracking-tight">
              Generate payroll for {selectedMonthLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] text-muted-foreground">
              This works out {selectedMonthLabel} again for every active employee and replaces the
              existing figures for that month, including any amount changed by hand.
              {paidCount > 0 && (
                <span className="mt-2 block font-semibold text-foreground">
                  {paidCount} payslip{paidCount === 1 ? " is" : "s are"} already marked paid.
                  {paidCount === 1 ? " It keeps" : " They keep"} the paid status and payment date —
                  only the calculated amounts are refreshed.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl h-10 border-border/60">Cancel</AlertDialogCancel>
            <ActionButton
              variant="add"
              icon={Sparkles}
              showLabel
              label="Generate payroll"
              loading={isGenerating}
              onClick={handleGenerate}
              disabled={isGenerating}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
