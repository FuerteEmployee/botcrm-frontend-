import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, Printer, Search } from "lucide-react";
import { PageHeader }  from "@/components/shared/page-header";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useSalaryService, type SalaryRecord } from "@/services/salary-service";
import { isNativeApp } from "@/lib/geolocation";
import { cn } from "@/lib/utils";
import {
  SalarySlipDialog, money, monthLabel, statusLabel, statusClass, printSlip,
} from "@/components/pages/salary-slip-dialog";

export const Route = createFileRoute("/_app/payslips")({
  component: PayslipsPage,
});

const MONTHS = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setDate(1); // setMonth on the 31st skips short months
  d.setMonth(d.getMonth() - i);
  return { label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), m: d.getMonth() + 1, y: d.getFullYear() };
});

function PayslipsPage() {
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(`${MONTHS[0].m}-${MONTHS[0].y}`);
  const [viewing, setViewing] = useState<SalaryRecord | null>(null);
  const [month, year] = selectedMonth.split("-").map(Number);
  const canPrint = !isNativeApp();

  const { salaryRecords, isLoading, error, refetch } = useSalaryService(month, year);

  const filtered = salaryRecords.filter((p) =>
    (p.employeeId?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const label = monthLabel(month, year);

  return (
    <div className="space-y-6">
      <PageHeader title="Payslips" description="View and print employee payslips for a month" />

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="relative w-full sm:max-w-sm sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee..."
            aria-label="Search employee"
            className="w-full pl-10 pr-4 h-10 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger aria-label="Month" className="w-full sm:w-[200px] h-10 rounded-xl text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((mo) => (
              <SelectItem key={`${mo.m}-${mo.y}`} value={`${mo.m}-${mo.y}`}>{mo.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonLoader type="table" count={8} />
      ) : error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
          <p className="text-[14px] font-semibold">Could not load payslips for {label}.</p>
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : (
        <DataTable
          headers={["Employee", "Month", <div key="net" className="text-right w-full">Net pay</div>, "Status", <div key="a" className="text-right w-full">Actions</div>]}
          isEmpty={filtered.length === 0}
          emptyMessage={search ? "No payslip matches that name." : `No payslips for ${label} yet. Generate payroll on the Salary page first.`}
        >
          {filtered.map((p) => (
            <DataTableRow key={p._id}>
              <DataTableCell isFirst className="font-medium text-[13px]">{p.employeeId?.name || "—"}</DataTableCell>
              <DataTableCell className="text-[13px] text-muted-foreground whitespace-nowrap">{monthLabel(p.month, p.year)}</DataTableCell>
              <DataTableCell className="text-[13px] text-right font-bold whitespace-nowrap">{money(p.totalSalary)}</DataTableCell>
              <DataTableCell>
                <Badge variant="outline" className={cn("text-[11px] font-bold whitespace-nowrap", statusClass(p.status))}>
                  {statusLabel(p.status)}
                </Badge>
              </DataTableCell>
              <DataTableCell isLast>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => setViewing(p)}>
                    <Eye className="h-4 w-4 mr-1.5" />View
                  </Button>
                  {canPrint && (
                    <Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => printSlip(p)} aria-label={`Print payslip for ${p.employeeId?.name || "employee"}`}>
                      <Printer className="h-4 w-4 mr-1.5" />Print
                    </Button>
                  )}
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      )}

      <SalarySlipDialog record={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
