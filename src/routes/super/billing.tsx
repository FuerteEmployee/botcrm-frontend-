import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvoices, updateInvoice } from "@/services/superadmin-service";
import { Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatINR, formatINRFull } from "@/lib/format";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/super/billing")({
  component: BillingPage,
});

const INV_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Paid" },
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pending" },
  failed: { bg: "bg-red-50", text: "text-red-700", label: "Failed" },
  refunded: { bg: "bg-blue-50", text: "text-blue-700", label: "Refunded" },
};

function downloadInvoiceReceipt(inv: any) {
  const lines = [
    `Invoice: ${inv.invoiceNumber || "—"}`,
    `Company: ${inv.adminId?.name || "—"}`,
    `Plan: ${inv.planId?.name || "—"}`,
    `Period: ${inv.period || "—"}`,
    `Amount: ₹${(inv.amount || 0).toLocaleString("en-IN")}`,
    `Status: ${inv.status || "—"}`,
    `Paid at: ${inv.paidAt ? new Date(inv.paidAt).toLocaleString("en-IN") : "—"}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(inv.invoiceNumber || "invoice").replace(/[#]/g, "")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BillingPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "invoices"],
    queryFn: () => getInvoices(),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => updateInvoice(id, { status: "paid" }),
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => updateInvoice(id, { status: "pending" }),
    onSuccess: () => {
      toast.success("Invoice set to retry");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const invoices = data?.invoices || [];
  const stats = data?.stats || {};

  const handleExport = () => {
    downloadCSV(
      `invoices-${format(new Date(), "yyyy-MM-dd")}`,
      [
        { header: "Invoice", value: (r: any) => r.invoiceNumber },
        { header: "Company", value: (r: any) => r.adminId?.name },
        { header: "Plan", value: (r: any) => r.planId?.name },
        { header: "Amount (INR)", value: (r: any) => r.amount || 0 },
        { header: "Period", value: (r: any) => r.period },
        { header: "Status", value: (r: any) => r.status },
      ],
      invoices
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Billing & Invoices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            INR payments
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={invoices.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Collected this month</p>
            <p className="text-2xl font-semibold">{formatINR(stats.collected || 0)}</p>
            <p className="text-[11px] text-emerald-600 mt-1">On track</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Pending invoices</p>
            <p className="text-2xl font-semibold">{formatINR(stats.pending || 0)}</p>
            <p className="text-[11px] text-amber-600 mt-1">{stats.pendingCount || 0} invoices due</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Failed / retrying</p>
            <p className="text-2xl font-semibold">{stats.failed || 0}</p>
            <p className="text-[11px] text-red-600 mt-1">Retry needed</p>
          </div>
        </div>

        {/* Invoice table */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Invoices</h2>
          <div className="border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[13%]">Invoice</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[26%]">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[11%]">Plan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]">Amount</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[13%]">Period</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[13%]">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[12%]"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No invoices yet
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv: any) => {
                    const badge = INV_BADGES[inv.status] || INV_BADGES.pending;
                    return (
                      <tr key={inv._id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-[11px] text-blue-600 font-mono">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[13px]">{inv.adminId?.name || "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-xs">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: inv.planId?.color || "#888" }}
                            />
                            {inv.planId?.name || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-xs">
                          {formatINRFull(inv.amount || 0)}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground">
                          {inv.period || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inv.status === "paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              title="Download receipt"
                              onClick={() => downloadInvoiceReceipt(inv)}
                            >
                              <FileDown className="h-3 w-3" />
                            </Button>
                          )}
                          {inv.status === "failed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] px-2 text-amber-700"
                              onClick={() => retryMutation.mutate(inv._id)}
                              disabled={retryMutation.isPending}
                            >
                              Retry
                            </Button>
                          )}
                          {inv.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              onClick={() => markPaidMutation.mutate(inv._id)}
                              disabled={markPaidMutation.isPending}
                            >
                              Mark paid
                            </Button>
                          )}
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
