import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Search } from "lucide-react";
import { PageHeader }  from "@/components/shared/page-header";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSalaryService } from "@/services/salary-service";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payslips")({
  component: PayslipsPage,
});

const MONTHS = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return { label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), m: d.getMonth() + 1, y: d.getFullYear() };
});

function PayslipsPage() {
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(`${MONTHS[0].m}-${MONTHS[0].y}`);
  const [month, year] = selectedMonth.split("-").map(Number);

  const { salaryRecords, isLoading } = useSalaryService(month, year);

  const filtered = salaryRecords.filter((p) =>
    (p.employeeId?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Payslips" description="View employee payslips for a given month" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee..."
            className="w-full pl-10 pr-4 h-9 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px] h-9 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((mo) => (
              <SelectItem key={`${mo.m}-${mo.y}`} value={`${mo.m}-${mo.y}`}>{mo.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        headers={["Employee", "Month", "Year", "Net Salary", "Status", "Actions"]}
        isEmpty={!isLoading && filtered.length === 0}
        emptyMessage="No payslips generated for this month yet."
      >
        {filtered.map((p) => (
          <DataTableRow key={p._id}>
            <DataTableCell>{p.employeeId?.name}</DataTableCell>
            <DataTableCell>{p.month}</DataTableCell>
            <DataTableCell>{p.year}</DataTableCell>
            <DataTableCell>₹{(p.netSalary ?? p.totalSalary ?? 0).toLocaleString()}</DataTableCell>
            <DataTableCell>
              <Badge variant={p.status === "final" ? "default" : "secondary"}>
                {p.status ?? "pending"}
              </Badge>
            </DataTableCell>
            <DataTableCell>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.info("PDF export is coming soon — this hasn't been built yet.")}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />PDF
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
    </div>
  );
}
