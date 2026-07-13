import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Search, FileText } from "lucide-react";
import { PageHeader }  from "@/components/shared/page-header";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { useQuery }    from "@tanstack/react-query";
import { apiClient }   from "@/lib/api-client";

export const Route = createFileRoute("/_app/payslips")({
  component: PayslipsPage,
});

function PayslipsPage() {
  const [search, setSearch] = useState("");

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["payslips"],
    queryFn: async () => {
      const { data } = await apiClient.get("/salary");
      return data;
    },
  });

  const filtered = (payslips as any[]).filter((p) =>
    (p.employeeName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Payslips" description="Download and view employee payslips" />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee..."
          className="w-full pl-10 pr-4 h-9 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <DataTable columns={["Employee", "Month", "Year", "Net Salary", "Status", "Actions"]}>
        {filtered.map((p: any) => (
          <DataTableRow key={p._id}>
            <DataTableCell>{p.employeeName}</DataTableCell>
            <DataTableCell>{p.month}</DataTableCell>
            <DataTableCell>{p.year}</DataTableCell>
            <DataTableCell>₹{p.netSalary?.toLocaleString()}</DataTableCell>
            <DataTableCell>
              <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                {p.status ?? "pending"}
              </Badge>
            </DataTableCell>
            <DataTableCell>
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5 mr-1.5" />PDF
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
    </div>
  );
}
