import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTenants, updateTenant, createTenant, deactivateTenant, deleteTenant } from "@/services/superadmin-service";
import { getPlans } from "@/services/superadmin-service";
import { useState, useEffect } from "react";
import { Settings, MoreHorizontal, Search, Plus, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatINRFull } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/super/tenants")({
  component: TenantsPage,
});

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Active" },
  trial: { bg: "bg-blue-50", text: "text-blue-700", label: "Trial" },
  expired: { bg: "bg-red-50", text: "text-red-700", label: "Expired" },
  grace: { bg: "bg-amber-50", text: "text-amber-700", label: "Grace" },
  paused: { bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelled" },
};

function TenantsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [managingId, setManagingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateTenant(id),
    onSuccess: () => {
      toast.success("Customer deactivated");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      setDeactivating(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to deactivate customer");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTenant(id),
    onSuccess: () => {
      toast.success("Customer permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      setDeleting(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to delete customer");
    },
  });

  // Debounce search so we fire one request after the user stops typing,
  // not one per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "tenants", filter, search],
    queryFn: () => getTenants({ status: filter, search }),
  });

  const { data: plans } = useQuery({
    queryKey: ["superadmin", "plans"],
    queryFn: getPlans,
  });

  const tenants = data?.tenants || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage company subscriptions
          </p>
        </div>
        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New customer
        </Button>
      </div>

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex border rounded-lg p-0.5 bg-muted/30">
            {["all", "active", "trial", "expired"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                  filter === f
                    ? "bg-background text-foreground border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `All (${data?.totalAll ?? 0})` : f}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>
        </div>

        {/* Tenant table */}
        <div className="border rounded-xl overflow-x-auto bg-card">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[24%]">Company</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[11%]">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[11%]">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[20%]">Employees used</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[14%]">Renewal</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[9%]">MRR</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[11%]"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No customers found
                  </td>
                </tr>
              ) : (
                tenants.map((t: any) => {
                  const badge = STATUS_BADGES[t.status] || STATUS_BADGES.active;
                  const maxEmp = t.planId?.maxEmployees;
                  const used = t.employeesUsed || 0;
                  // Raw ratio drives the color; the bar width is the clamped value.
                  const ratio = maxEmp ? (used / maxEmp) * 100 : 0;
                  const usagePercent = Math.min(ratio, 100);
                  const usageColor =
                    ratio >= 100 ? "bg-red-500" : ratio > 90 ? "bg-amber-500" : "bg-emerald-500";

                  return (
                    <tr key={t._id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[13px]">{t.adminId?.name || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{t.adminId?.phone || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: t.planId?.color || "#888" }}
                          />
                          {t.planId?.name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] min-w-[36px]">
                            {used}/{maxEmp ? maxEmp : "∞"}
                          </span>
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${usageColor} transition-all`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        {t.currentPeriodEnd
                          ? format(new Date(t.currentPeriodEnd), "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-xs">
                        {t.mrr > 0 ? formatINRFull(t.mrr) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                                title="Actions"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setManagingId(t.adminId?._id)}>
                                <Settings className="h-3.5 w-3.5 mr-2" />
                                Manage subscription
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={t.adminId?.isActive === false}
                                onClick={() => setDeactivating({ id: t.adminId?._id, name: t.adminId?.name })}
                              >
                                <Power className="h-3.5 w-3.5 mr-2" />
                                {t.adminId?.isActive === false ? "Already deactivated" : "Deactivate customer"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting({ id: t.adminId?._id, name: t.adminId?.name })}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage Drawer Dialog */}
      {managingId && (
        <ManageDialog
          tenantId={managingId}
          tenants={tenants}
          plans={plans || []}
          onClose={() => setManagingId(null)}
          queryClient={queryClient}
        />
      )}

      {/* Create Tenant Dialog */}
      {showCreate && (
        <CreateTenantDialog
          plans={plans || []}
          onClose={() => setShowCreate(false)}
          queryClient={queryClient}
        />
      )}

      {/* Deactivate confirmation */}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivating?.name || "customer"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels the subscription and blocks the company's admin from signing in.
              You can reactivate them later from the Manage dialog. This won't delete any data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deactivateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deactivating) deactivateMutation.mutate(deactivating.id);
              }}
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleting?.name || "customer"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete</strong> the company, all employees, subscriptions, and invoices.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMutation.mutate(deleting.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManageDialog({
  tenantId,
  tenants,
  plans,
  onClose,
  queryClient,
}: {
  tenantId: string;
  tenants: any[];
  plans: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const tenant = tenants.find((t: any) => t.adminId?._id === tenantId);
  const [planId, setPlanId] = useState(tenant?.planId?._id || "");
  const [status, setStatus] = useState(tenant?.status || "active");
  const [billingCycle, setBillingCycle] = useState(tenant?.billingCycle || "monthly");
  const [bannerThresholdDays, setBannerThresholdDays] = useState<string>(
    String(tenant?.bannerThresholdDays ?? 7),
  );

  const mutation = useMutation({
    mutationFn: (data: any) => updateTenant(tenantId, data),
    onSuccess: () => {
      toast.success("Customer updated successfully");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update");
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Manage — {tenant?.adminId?.name || "Customer"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.filter((p: any) => p.isActive !== false).map((p: any) => (
                  <SelectItem key={p._id} value={p._id} className="text-xs">
                    {p.name} — ₹{p.price}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Billing cycle</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                <SelectItem value="annual" className="text-xs">Annual (2 months free)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "trial", "paused", "grace", "expired"].map((s) => (
                  <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Show banner when (days left)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              className="h-8 text-xs"
              value={bannerThresholdDays}
              onChange={(e) => setBannerThresholdDays(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The tenant's trial/renewal countdown banner stays hidden until this many days before expiry.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                planId,
                status,
                billingCycle,
                bannerThresholdDays: Number(bannerThresholdDays),
              })
            }
          >
            {mutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateTenantDialog({
  plans,
  onClose,
  queryClient,
}: {
  plans: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState(plans?.[0]?._id || "");
  const [bannerThresholdDays, setBannerThresholdDays] = useState<string>("7");
  const [errorMsg, setErrorMsg] = useState("");

  // Require name + plan, and a phone with at least 10 digits.
  const phoneDigits = phone.replace(/\D/g, "");
  const isValid = name.trim() && phoneDigits.length >= 10 && planId;

  const mutation = useMutation({
    mutationFn: (data: any) => createTenant(data),
    onSuccess: () => {
      toast.success("Customer created successfully");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "Failed to create customer";
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Create new customer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input className="h-8 text-xs" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input className="h-8 text-xs" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.filter((p: any) => p.isActive !== false).map((p: any) => (
                  <SelectItem key={p._id} value={p._id} className="text-xs">
                    {p.name} — ₹{p.price}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Show banner when (days left)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              className="h-8 text-xs"
              value={bannerThresholdDays}
              onChange={(e) => setBannerThresholdDays(e.target.value)}
            />
          </div>
        </div>
        {errorMsg && (
          <div className="mt-3 p-2.5 rounded-md bg-destructive/10 text-destructive text-[13px] border border-destructive/20 font-medium">
            {errorMsg}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={mutation.isPending || !isValid}
            onClick={() => {
              setErrorMsg("");
              mutation.mutate({
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim() || undefined,
                planId,
                bannerThresholdDays: Number(bannerThresholdDays),
              });
            }}
          >
            {mutation.isPending ? "Creating..." : "Create customer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
