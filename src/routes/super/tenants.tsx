import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getTenants,
  getTenant,
  updateTenant,
  createTenant,
  deactivateTenant,
  deleteTenant,
  updateFeatureToggles,
  getPlans,
} from "@/services/superadmin-service";
import { useState, useEffect, useMemo } from "react";
import {
  Settings,
  MoreHorizontal,
  Search,
  Plus,
  Power,
  Trash2,
  Eye,
  EyeOff,
  Fingerprint,
  ToggleLeft,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { MachinesDialog } from "@/components/pages/machines-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatINRFull } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/super/tenants")({
  component: TenantsPage,
});

// ─── Shared bits ─────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  active: {
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    label: "Active",
  },
  trial: { cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", label: "Trial" },
  grace: {
    cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    label: "Grace period",
  },
  paused: {
    cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    label: "Paused",
  },
  expired: { cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", label: "Expired" },
  cancelled: {
    cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    label: "Cancelled",
  },
};
const FILTERS = ["all", "active", "trial", "grace", "paused", "expired", "cancelled"] as const;
const FILTER_LABELS: Record<string, string> = {
  all: "All",
  active: "Active",
  trial: "Trial",
  grace: "Grace",
  paused: "Paused",
  expired: "Expired",
  cancelled: "Cancelled",
};
const SORTS: { value: string; label: string }[] = [
  { value: "recent", label: "Recently changed" },
  { value: "name", label: "Name (A–Z)" },
  { value: "renewal", label: "Renewal date" },
  { value: "employees", label: "Most employees" },
];
const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;
const IST_MS = 5.5 * 3_600_000;

const errMsg = (err: any, fallback: string) => err?.response?.data?.message || fallback;

/** "29 Oct 2026", always as the IST calendar day the backend stores. */
function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
/** YYYY-MM-DD of the IST day, for <input type="date">. */
function istKey(d: Date) {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}
/** End of the IST day, mirroring the backend's istEndOfDay. */
function istEndOfDay(d: Date) {
  const s = new Date(d.getTime() + IST_MS);
  s.setUTCHours(23, 59, 59, 999);
  return new Date(s.getTime() - IST_MS);
}
function relDays(d?: string | null) {
  if (!d) return null;
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / DAY_MS);
  if (days > 1) return { text: `in ${days} days`, late: false, soon: days <= 7 };
  if (days === 1) return { text: "tomorrow", late: false, soon: true };
  if (days === 0) return { text: "today", late: false, soon: true };
  return { text: `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`, late: true, soon: false };
}
function planLabel(p: any) {
  const seats = p.maxEmployees ? `${p.maxEmployees} employees` : "no employee limit";
  return `${p.name} — ${formatINRFull(p.price)}/mo · ${seats}`;
}
const deadlineLabel = (t: any) =>
  t.status === "trial" ? "Trial ends" : t.status === "grace" ? "Grace ends" : "Paid until";

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGES[status] || { cls: "bg-muted text-muted-foreground", label: status };
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
        b.cls,
      )}
    >
      {b.label}
    </span>
  );
}

function SeatBar({ t }: { t: any }) {
  const max = t.seatLimit;
  const used = t.employeesUsed || 0;
  const ratio = max ? (used / max) * 100 : 0;
  const color = ratio > 100 ? "bg-red-500" : ratio >= 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-xs tabular-nums whitespace-nowrap",
            max && used > max && "text-red-600 font-medium",
          )}
        >
          {used} of {max ?? "∞"}
        </span>
        {max ? (
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[40px]">
            <div
              className={cn("h-full rounded-full", color)}
              style={{ width: `${Math.min(ratio, 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      {used > 0 && t.activeEmployees !== used && (
        <div className="text-[11px] text-muted-foreground">{t.activeEmployees} active</div>
      )}
    </div>
  );
}

function DeadlineCell({ t }: { t: any }) {
  const rel = relDays(t.deadline);
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{deadlineLabel(t)}</div>
      <div className="text-xs whitespace-nowrap">{fmtDate(t.deadline)}</div>
      {rel && (t.status === "active" || t.status === "trial" || t.status === "grace") && (
        <div
          className={cn(
            "text-[11px]",
            rel.late
              ? "text-red-600"
              : rel.soon
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
          )}
        >
          {rel.text}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function TenantsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [managingId, setManagingId] = useState<string | null>(null);
  const [machinesFor, setMachinesFor] = useState<{ id: string; name: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deactivating, setDeactivating] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [togglingFeatures, setTogglingFeatures] = useState<{
    id: string;
    name: string;
    toggles: any;
  } | null>(null);

  // One request after typing stops, not one per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  useEffect(() => setPage(1), [filter, search, sort]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "tenants", "list", { filter, search, sort, page }],
    queryFn: () => getTenants({ status: filter, search, sort, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const { data: plans } = useQuery({ queryKey: ["superadmin", "plans"], queryFn: getPlans });

  const tenants: any[] = data?.tenants || [];
  const counts = data?.statusCounts || {};
  const totalPages = data?.totalPages || 1;

  // Stay on a real page when a delete empties the last one.
  useEffect(() => {
    if (data && page > totalPages) setPage(totalPages);
  }, [data, page, totalPages]);

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateTenant(id),
    onSuccess: () => {
      toast.success("Customer switched off");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      setDeactivating(null);
    },
    onError: (err: any) =>
      toast.error(errMsg(err, "Could not switch off this customer. Please try again.")),
  });

  const openActions = (t: any): RowActionHandlers => ({
    manage: () => setManagingId(t.adminId._id),
    toggles: () =>
      setTogglingFeatures({ id: t.adminId._id, name: t.adminId.name, toggles: t.featureToggles }),
    machines: () => setMachinesFor({ id: t.adminId._id, name: t.adminId.name }),
    deactivate: () => setDeactivating({ id: t.adminId._id, name: t.adminId.name }),
    remove: () => setDeleting({ id: t.adminId._id, name: t.adminId.name }),
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Companies using B.O.T, their plans and subscriptions
          </p>
        </div>
        <Button className="h-10 bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New customer
        </Button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {/* Status tabs: scroll sideways on a phone rather than wrap. */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div
            role="tablist"
            aria-label="Filter by status"
            className="inline-flex border rounded-lg p-0.5 bg-muted/30 whitespace-nowrap"
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-10 px-3 rounded-md text-xs font-medium transition-all",
                  filter === f
                    ? "bg-background text-foreground border shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABELS[f]} ({counts[f] ?? 0})
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone or email"
              aria-label="Search customers"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-10 text-sm sm:w-52" aria-label="Sort customers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-sm">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : isError ? (
          <div className="border rounded-xl bg-card px-4 py-10 text-center space-y-3">
            <AlertTriangle className="h-6 w-6 mx-auto text-amber-600" />
            <p className="text-sm font-medium">Could not load customers.</p>
            <p className="text-xs text-muted-foreground">
              {errMsg(error, "Check your connection and try again.")}
            </p>
            <Button variant="outline" className="h-10" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Try again
            </Button>
          </div>
        ) : tenants.length === 0 ? (
          <div className="border rounded-xl bg-card px-4 py-12 text-center">
            <p className="text-sm font-medium">No customers found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || filter !== "all"
                ? "Try a different search or status."
                : "Add your first customer with New customer."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div
              className={cn(
                "hidden md:block border rounded-xl overflow-x-auto bg-card",
                isFetching && "opacity-70",
              )}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground">
                      Company
                    </th>
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground">Plan</th>
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground w-[18%]">
                      Employees
                    </th>
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground">
                      Renewal
                    </th>
                    <th className="px-4 py-2.5 text-xs font-normal text-muted-foreground text-right">
                      MRR
                    </th>
                    <th className="px-4 py-2.5 w-14">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr
                      key={t._id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors align-top"
                    >
                      <td className="px-4 py-3 max-w-[260px]">
                        <CompanyCell t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <PlanCell t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3">
                        <SeatBar t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <DeadlineCell t={t} />
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-right whitespace-nowrap">
                        {t.mrr > 0 ? formatINRFull(t.mrr) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <RowActions t={t} actions={t.orphan ? null : openActions(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className={cn("md:hidden space-y-3", isFetching && "opacity-70")}>
              {tenants.map((t) => (
                <div key={t._id} className="border rounded-xl bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CompanyCell t={t} />
                    </div>
                    <RowActions t={t} actions={t.orphan ? null : openActions(t)} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Status</div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">Plan</div>
                      <PlanCell t={t} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">Employees</div>
                      <SeatBar t={t} />
                    </div>
                    <DeadlineCell t={t} />
                    <div>
                      <div className="text-[11px] text-muted-foreground">MRR</div>
                      <div className="text-xs font-medium">
                        {t.mrr > 0 ? formatINRFull(t.mrr) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  className="h-10"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {data?.total} customers
                </span>
                <Button
                  variant="outline"
                  className="h-10"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {managingId && (
        <ManageDialog
          tenantId={managingId}
          plans={plans || []}
          onClose={() => setManagingId(null)}
          queryClient={queryClient}
        />
      )}

      {machinesFor && (
        <MachinesDialog
          adminId={machinesFor.id}
          tenantName={machinesFor.name}
          onClose={() => setMachinesFor(null)}
        />
      )}

      {togglingFeatures && (
        <FeatureTogglesDialog
          adminId={togglingFeatures.id}
          tenantName={togglingFeatures.name}
          savedToggles={togglingFeatures.toggles || {}}
          onClose={() => setTogglingFeatures(null)}
          queryClient={queryClient}
        />
      )}

      {showCreate && (
        <CreateTenantDialog
          plans={plans || []}
          onClose={() => setShowCreate(false)}
          queryClient={queryClient}
        />
      )}

      {/* Switch off confirmation */}
      <AlertDialog open={!!deactivating} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch off {deactivating?.name || "this customer"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The company's admin and employees will no longer be able to use B.O.T, and the
              subscription is cancelled. No data is deleted. You can switch it back on later from
              Manage subscription.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-destructive hover:bg-destructive/90"
              disabled={deactivateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deactivating?.id) deactivateMutation.mutate(deactivating.id);
              }}
            >
              {deactivateMutation.isPending ? "Switching off..." : "Switch off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deleting && (
        <DeleteTenantDialog
          tenant={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ["superadmin"] });
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function CompanyCell({ t }: { t: any }) {
  if (t.orphan) {
    return (
      <div>
        <div className="font-medium text-[13px] text-muted-foreground">Deleted company</div>
        <div className="text-[11px] text-muted-foreground">
          Subscription record with no admin account
        </div>
      </div>
    );
  }
  const off = t.adminId?.isActive === false || t.adminId?.status === "inactive";
  return (
    <div className="min-w-0">
      <div className="font-medium text-[13px] break-words">{t.adminId?.name || "—"}</div>
      <div className="text-xs text-muted-foreground">{t.adminId?.phone || ""}</div>
      {off && (
        <span className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
          Switched off
        </span>
      )}
    </div>
  );
}

function PlanCell({ t }: { t: any }) {
  return (
    <span className="flex items-center gap-1.5 text-xs min-w-0">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: t.planId?.color || "#888" }}
      />
      <span className="truncate">{t.planId?.name || "—"}</span>
      {t.billingCycle === "annual" && (
        <span className="text-[11px] text-muted-foreground">(annual)</span>
      )}
    </span>
  );
}

type RowActionHandlers = Record<
  "manage" | "toggles" | "machines" | "deactivate" | "remove",
  () => void
>;

function RowActions({ t, actions }: { t: any; actions: RowActionHandlers | null }) {
  const name = t.adminId?.name || "this customer";
  const off = t.adminId?.isActive === false || t.adminId?.status === "inactive";
  if (!actions) {
    return (
      <span
        className="inline-flex h-10 w-10 items-center justify-center text-muted-foreground/50"
        title="No company to manage"
      >
        <MoreHorizontal className="h-4 w-4" />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted transition-colors"
          aria-label={`Actions for ${name}`}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuItem className="h-10" onClick={actions.manage}>
          <Settings className="h-4 w-4 mr-2" /> Manage subscription
        </DropdownMenuItem>
        <DropdownMenuItem className="h-10" onClick={actions.toggles}>
          <ToggleLeft className="h-4 w-4 mr-2" /> Feature toggles
        </DropdownMenuItem>
        <DropdownMenuItem className="h-10" onClick={actions.machines}>
          <Fingerprint className="h-4 w-4 mr-2" /> Biometric machines
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-10 text-destructive focus:text-destructive"
          disabled={off}
          onClick={actions.deactivate}
        >
          <Power className="h-4 w-4 mr-2" /> {off ? "Already switched off" : "Switch off customer"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-10 text-destructive focus:text-destructive"
          onClick={actions.remove}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Permanent delete ────────────────────────────────────────────────────────

function DeleteTenantDialog({
  tenant,
  onClose,
  onDeleted,
}: {
  tenant: { id: string; name: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === tenant.name.trim();
  const mutation = useMutation({
    mutationFn: () => deleteTenant(tenant.id),
    onSuccess: () => {
      toast.success(`${tenant.name} permanently deleted`);
      onDeleted();
    },
    onError: (err: any) =>
      toast.error(errMsg(err, "Could not delete this customer. Please try again.")),
  });
  return (
    <AlertDialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete {tenant.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This deletes the company and <strong>everything in it</strong>: its admin,
                sub-admins and employees, attendance, leaves, salaries, expenses, advances, tickets,
                leads, branches, shifts, settings and invoices. Its biometric machines are released
                to Unassigned.
              </p>
              <p className="font-medium text-destructive">This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete-name" className="text-xs">
            Type <span className="font-semibold">{tenant.name}</span> to confirm
          </Label>
          <Input
            id="confirm-delete-name"
            className="h-10 text-sm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10" disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-10 bg-destructive hover:bg-destructive/90"
            disabled={!matches || mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (matches) mutation.mutate();
            }}
          >
            {mutation.isPending ? "Deleting..." : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Manage subscription ─────────────────────────────────────────────────────

const MANAGE_STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active (paid)" },
  { value: "trial", label: "Free trial" },
  { value: "grace", label: "Grace period" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
];

function ManageDialog({
  tenantId,
  plans,
  onClose,
  queryClient,
}: {
  tenantId: string;
  plans: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const {
    data: tenant,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["superadmin", "tenant", tenantId],
    queryFn: () => getTenant(tenantId),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm pr-6">
            Manage — {tenant?.adminId?.name || "Customer"}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm">{errMsg(error, "Could not load this customer.")}</p>
            <Button variant="outline" className="h-10" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ManageForm tenant={tenant} plans={plans} onClose={onClose} queryClient={queryClient} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageForm({
  tenant,
  plans,
  onClose,
  queryClient,
}: {
  tenant: any;
  plans: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const tenantId = tenant.adminId._id;
  const initialTrialEnd =
    tenant.status === "trial" && tenant.trialEndDate ? istKey(new Date(tenant.trialEndDate)) : "";
  const [planId, setPlanId] = useState<string>(tenant.planId?._id || "");
  const [status, setStatus] = useState<string>(tenant.status || "active");
  const [billingCycle, setBillingCycle] = useState<string>(tenant.billingCycle || "monthly");
  const [banner, setBanner] = useState<string>(String(tenant.bannerThresholdDays ?? 7));
  const [trialEnd, setTrialEnd] = useState<string>(initialTrialEnd);
  const [botlensEmail, setBotlensEmail] = useState<string>(tenant.adminId?.botlensEmail || "");
  const [botlensPassword, setBotlensPassword] = useState<string>(
    tenant.adminId?.botlensPassword || "",
  );
  const [showPw, setShowPw] = useState(false);
  const [acceptOverSeats, setAcceptOverSeats] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [formError, setFormError] = useState("");

  const isOff =
    tenant.status === "cancelled" ||
    tenant.adminId?.isActive === false ||
    tenant.adminId?.status === "inactive";
  // Active plans, plus the current one even if it has since been switched off.
  const planOptions = useMemo(
    () => plans.filter((p: any) => p.isActive !== false || p._id === tenant.planId?._id),
    [plans, tenant.planId?._id],
  );
  const chosenPlan = planOptions.find((p: any) => p._id === planId);
  const used = tenant.employeesUsed || 0;
  const chosenLimit = chosenPlan?.maxEmployees ?? null;
  const planChanged = planId !== (tenant.planId?._id || "");
  const overSeats = planChanged && chosenLimit !== null && used > chosenLimit;

  const bannerNum = Number(banner);
  const bannerError =
    banner.trim() === "" || !Number.isInteger(bannerNum) || bannerNum < 0 || bannerNum > 365
      ? "Enter a whole number from 0 to 365."
      : "";
  const todayKey = istKey(new Date());
  const trialError =
    status !== "trial"
      ? ""
      : !trialEnd
        ? "Pick the date the trial should end."
        : trialEnd < todayKey
          ? "Pick today or a later date."
          : "";

  const periodDays = billingCycle === "annual" ? 365 : 30;
  // What "Renew now" will set: one period on max(now, paid end); a trial's end is not paid time.
  const renewPreview = useMemo(() => {
    const now = Date.now();
    const end = tenant.currentPeriodEnd ? new Date(tenant.currentPeriodEnd).getTime() : 0;
    const base = tenant.status === "trial" || end <= now ? now : end;
    return istEndOfDay(new Date(base + periodDays * DAY_MS));
  }, [tenant.currentPeriodEnd, tenant.status, periodDays]);

  const mutation = useMutation({
    mutationFn: (payload: any) => updateTenant(tenantId, payload),
    onSuccess: (data: any, variables: any) => {
      toast.success(
        variables?.renew
          ? `Renewed until ${fmtDate(data?.currentPeriodEnd)}`
          : data?.reactivated
            ? "Customer switched back on"
            : "Customer updated",
      );
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) => {
      const m = errMsg(err, "Could not save. Please try again.");
      setFormError(m);
      setConfirmRenew(false);
      toast.error(m);
    },
  });

  // Only what changed goes to the server, so saving a banner number can't
  // quietly rewrite anything else.
  const buildPayload = (renew: boolean) => {
    const p: Record<string, unknown> = {};
    if (planChanged) p.planId = planId;
    if (status !== tenant.status) p.status = status;
    if (billingCycle !== tenant.billingCycle) p.billingCycle = billingCycle;
    if (bannerNum !== (tenant.bannerThresholdDays ?? 7)) p.bannerThresholdDays = bannerNum;
    if (
      status === "trial" &&
      trialEnd &&
      (trialEnd !== initialTrialEnd || tenant.status !== "trial")
    )
      p.trialEndDate = trialEnd;
    if (botlensEmail.trim() !== (tenant.adminId?.botlensEmail || "")) p.email = botlensEmail.trim();
    if (botlensPassword && botlensPassword !== (tenant.adminId?.botlensPassword || ""))
      p.password = botlensPassword;
    if (overSeats) p.acceptOverSeats = true;
    if (renew) p.renew = true;
    return p;
  };
  const invalid = !!bannerError || !!trialError || (overSeats && !acceptOverSeats);
  const save = (renew: boolean) => {
    setFormError("");
    const payload = buildPayload(renew);
    if (!renew && Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(payload);
  };

  const rel = relDays(tenant.deadline);

  return (
    <div className="space-y-4">
      {isOff && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-3 text-xs text-amber-900 dark:text-amber-200">
          This company is switched off: nobody in it can use B.O.T. Choose Active or Free trial
          below and save to switch it back on.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border p-2">
          <div className="text-base font-semibold tabular-nums">{used}</div>
          <div className="text-[11px] text-muted-foreground">Employees</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="text-base font-semibold tabular-nums">{tenant.activeEmployees ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">Active</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="text-base font-semibold tabular-nums">{tenant.seatLimit ?? "∞"}</div>
          <div className="text-[11px] text-muted-foreground">Plan allows</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Plan</Label>
          <Select
            value={planId}
            onValueChange={(v) => {
              setPlanId(v);
              setAcceptOverSeats(false);
            }}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {planOptions.map((p: any) => (
                <SelectItem key={p._id} value={p._id} className="text-sm">
                  {planLabel(p)}
                  {p.isActive === false ? " (switched off)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {overSeats && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={acceptOverSeats}
                onChange={(e) => setAcceptOverSeats(e.target.checked)}
              />
              <span>
                This company has {used} employees but {chosenPlan?.name} allows {chosenLimit}.
                Nobody is removed, but they can't add employees until they are within the limit.
                Tick to confirm.
              </span>
            </label>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ...MANAGE_STATUSES,
                ...(tenant.status === "cancelled"
                  ? [{ value: "cancelled", label: "Cancelled (switched off)" }]
                  : []),
              ].map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-sm">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Billing cycle</Label>
          <Select value={billingCycle} onValueChange={setBillingCycle}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly" className="text-sm">
                Monthly
              </SelectItem>
              <SelectItem value="annual" className="text-sm">
                Annual
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {status === "trial" && (
          <div className="space-y-1.5">
            <Label htmlFor="trial-end" className="text-xs">
              Trial ends on
            </Label>
            <Input
              id="trial-end"
              type="date"
              className="h-10 text-sm"
              min={todayKey}
              value={trialEnd}
              onChange={(e) => setTrialEnd(e.target.value)}
            />
            {trialError ? (
              <p className="text-[11px] text-destructive">{trialError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Access runs to the end of that day.
              </p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="banner-days" className="text-xs">
            Show renewal banner (days before)
          </Label>
          <Input
            id="banner-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            className="h-10 text-sm"
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
          />
          {bannerError && <p className="text-[11px] text-destructive">{bannerError}</p>}
        </div>
      </div>

      <div className="pt-4 border-t space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-xs font-semibold">{deadlineLabel(tenant)}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tenant.deadline
                ? `${fmtDate(tenant.deadline)}${rel ? ` (${rel.text})` : ""}`
                : "No date set yet."}
            </p>
          </div>
          <Button
            variant="outline"
            className="h-10 shrink-0"
            disabled={mutation.isPending || status !== "active" || invalid}
            title={status !== "active" ? "Set the status to Active (paid) to renew" : undefined}
            onClick={() => setConfirmRenew(true)}
          >
            Renew now (+{periodDays} days)
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {status === "active"
            ? "Saving never adds paid time. Use Renew now after the customer pays."
            : "Renew now is for paid (Active) customers. For a trial, change the trial end date."}
        </p>
      </div>

      <details className="pt-3 border-t group">
        <summary className="text-xs font-semibold cursor-pointer select-none py-2">
          BOTLens login (camera kiosk, retired)
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              className="h-10 text-sm"
              placeholder="Not set"
              value={botlensEmail}
              onChange={(e) => setBotlensEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                className="h-10 text-sm pr-11"
                placeholder="Not set"
                value={botlensPassword}
                onChange={(e) => setBotlensPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-0 top-0 h-10 w-10 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </details>

      {formError && (
        <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-[13px] border border-destructive/20 font-medium">
          {formError}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" className="h-10" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="h-10 bg-primary hover:bg-primary/90"
          disabled={mutation.isPending || invalid}
          onClick={() => save(false)}
        >
          {mutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <AlertDialog
        open={confirmRenew}
        onOpenChange={(o) => !o && !mutation.isPending && setConfirmRenew(false)}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Renew {tenant.adminId?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Adds {periodDays} days of paid access on the {chosenPlan?.name || "current"} plan. The
              new end date will be <strong>{fmtDate(renewPreview)}</strong>. Any other changes in
              the form are saved too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10" disabled={mutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                save(true);
              }}
            >
              {mutation.isPending ? "Renewing..." : "Renew"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Create customer ─────────────────────────────────────────────────────────

function CreateTenantDialog({
  plans,
  onClose,
  queryClient,
}: {
  plans: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const activePlans = plans.filter((p: any) => p.isActive !== false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState(activePlans?.[0]?._id || "");
  const [status, setStatus] = useState<"trial" | "active">("trial");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [trialDays, setTrialDays] = useState<string>("14");
  const [banner, setBanner] = useState<string>("7");
  const [touched, setTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!planId && activePlans[0]?._id) setPlanId(activePlans[0]._id);
  }, [activePlans, planId]);

  // Same normalising the server does: spaces, dashes and a +91/0 prefix are fine.
  const digits = phone
    .replace(/[\s\-().]/g, "")
    .replace(/^\+?91(?=\d{10}$)/, "")
    .replace(/^0(?=\d{10}$)/, "");
  const errors = {
    name: name.trim().length < 2 ? "Enter the company name." : "",
    phone: !/^\d{10}$/.test(digits) ? "Enter a 10-digit mobile number." : "",
    email:
      email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Enter a valid email, or leave it blank."
        : "",
    plan: !planId ? "Choose a plan." : "",
    trialDays:
      status === "trial" &&
      !(Number.isInteger(Number(trialDays)) && Number(trialDays) >= 1 && Number(trialDays) <= 365)
        ? "1 to 365 days."
        : "",
    banner: !(
      banner.trim() !== "" &&
      Number.isInteger(Number(banner)) &&
      Number(banner) >= 0 &&
      Number(banner) <= 365
    )
      ? "0 to 365 days."
      : "",
  };
  const isValid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) =>
    touched && errors[k] ? <p className="text-[11px] text-destructive">{errors[k]}</p> : null;

  const mutation = useMutation({
    mutationFn: (data: any) => createTenant(data),
    onSuccess: () => {
      toast.success(`${name.trim()} added`);
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) => {
      const msg = errMsg(err, "Could not add this customer. Please try again.");
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">New customer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nc-name" className="text-xs">
              Company name
            </Label>
            <Input
              id="nc-name"
              className="h-10 text-sm"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {show("name")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-phone" className="text-xs">
              Admin's mobile number (login)
            </Label>
            <Input
              id="nc-phone"
              className="h-10 text-sm"
              inputMode="tel"
              placeholder="10 digits"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {show("phone")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-email" className="text-xs">
              Email (optional)
            </Label>
            <Input
              id="nc-email"
              type="email"
              className="h-10 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {show("email")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {activePlans.map((p: any) => (
                  <SelectItem key={p._id} value={p._id} className="text-sm">
                    {planLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {show("plan")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Start as</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "trial" | "active")}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial" className="text-sm">
                  Free trial
                </SelectItem>
                <SelectItem value="active" className="text-sm">
                  Active (paid, no trial)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Billing cycle</Label>
            <Select
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as "monthly" | "annual")}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly" className="text-sm">
                  Monthly
                </SelectItem>
                <SelectItem value="annual" className="text-sm">
                  Annual
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "trial" && (
            <div className="space-y-1.5">
              <Label htmlFor="nc-trial" className="text-xs">
                Trial length (days)
              </Label>
              <Input
                id="nc-trial"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className="h-10 text-sm"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
              {show("trialDays")}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="nc-banner" className="text-xs">
              Show renewal banner (days before)
            </Label>
            <Input
              id="nc-banner"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              className="h-10 text-sm"
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
            />
            {show("banner")}
          </div>
        </div>
        {errorMsg && (
          <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-[13px] border border-destructive/20 font-medium">
            {errorMsg}
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10 bg-primary hover:bg-primary/90"
            disabled={mutation.isPending}
            onClick={() => {
              setTouched(true);
              setErrorMsg("");
              if (!isValid) return;
              mutation.mutate({
                name: name.trim(),
                phone: digits,
                email: email.trim() || undefined,
                planId,
                status,
                billingCycle,
                trialDays: status === "trial" ? Number(trialDays) : undefined,
                bannerThresholdDays: Number(banner),
              });
            }}
          >
            {mutation.isPending ? "Adding..." : "Add customer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Feature toggles ─────────────────────────────────────────────────────────

// `defaultOn` mirrors FEATURE_TOGGLE_DEFAULTS in backend/src/utils/feature_toggles.js.
// The tenants API already returns the resolved set; this only covers a row
// fetched before that key existed.
const FEATURE_TOGGLE_DEFINITIONS: {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
  /** No working module behind it yet: the page is unlinked and its API is not
   *  mounted in backend app.js. Shown disabled and always saved as off. */
  comingSoon?: boolean;
}[] = [
  {
    key: "tracking",
    label: "Live Tracking",
    description: "Real-time GPS tracking of employees",
    defaultOn: true,
  },
  {
    key: "geofenceAutoPunchOut",
    label: "Geofence Auto Punch-Out",
    description: "Allows turning on automatic punch-out when staff leave the branch",
    defaultOn: true,
  },
  {
    key: "leads",
    label: "Lead Management",
    description: "Sales leads tracking and management",
    defaultOn: true,
  },
  {
    key: "expenses",
    label: "Expense Management",
    description: "Employee expense claims and reimbursements",
    defaultOn: true,
  },
  {
    key: "advanceSalary",
    label: "Advance Salary & Loan",
    description: "Advance salary requests and approvals",
    defaultOn: true,
  },
  {
    key: "announcements",
    label: "Notice Board",
    description: "Company-wide announcements",
    defaultOn: true,
  },
  {
    key: "biometricDevices",
    label: "Biometric Devices",
    description: "eSSL/ZKTeco biometric machines",
    defaultOn: true,
  },
  {
    key: "assets",
    label: "Assets Management",
    description: "Company asset tracking and allocation",
    defaultOn: true,
  },
  {
    key: "recruitment",
    label: "Recruitment",
    description: "Job postings and hiring pipeline",
    defaultOn: false,
    comingSoon: true,
  },
  {
    key: "training",
    label: "Training",
    description: "Employee training programs",
    defaultOn: false,
    comingSoon: true,
  },
  {
    key: "performance",
    label: "Performance Reviews",
    description: "Employee performance evaluations",
    defaultOn: false,
    comingSoon: true,
  },
  {
    key: "projects",
    label: "Projects",
    description: "Project tracking and management",
    defaultOn: false,
    comingSoon: true,
  },
  {
    key: "policies",
    label: "HR Policies",
    description: "Policy document management",
    defaultOn: false,
    comingSoon: true,
  },
];

function FeatureTogglesDialog({
  adminId,
  tenantName,
  savedToggles,
  onClose,
  queryClient,
}: {
  adminId: string;
  tenantName: string;
  savedToggles: Record<string, boolean>;
  onClose: () => void;
  queryClient: any;
}) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const f of FEATURE_TOGGLE_DEFINITIONS)
      out[f.key] = f.comingSoon ? false : (savedToggles[f.key] ?? f.defaultOn);
    return out;
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, boolean>) => updateFeatureToggles(adminId, data),
    onSuccess: () => {
      toast.success("Feature toggles saved");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) =>
      toast.error(errMsg(err, "Could not save the feature toggles. Please try again.")),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm pr-6">Feature toggles — {tenantName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          A feature switched off disappears from this company's admin panel. The employee app is not
          changed.
        </p>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-1">
          {FEATURE_TOGGLE_DEFINITIONS.map((f) => {
            const id = `ft-${f.key}`;
            return (
              // The whole row is the tap target, not just the small switch.
              <label
                key={f.key}
                htmlFor={id}
                className={cn(
                  "flex items-center justify-between min-h-[48px] py-2 px-3 rounded-lg transition-colors",
                  f.comingSoon
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:bg-muted/50 cursor-pointer",
                )}
              >
                <div className="min-w-0 pr-4">
                  <div className="text-[13px] font-medium flex flex-wrap items-center gap-2">
                    {f.label}
                    {f.comingSoon && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/60">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{f.description}</div>
                </div>
                <Switch
                  id={id}
                  data-qa-ignore
                  checked={f.comingSoon ? false : (toggles[f.key] ?? false)}
                  disabled={f.comingSoon}
                  onCheckedChange={(checked) =>
                    setToggles((prev) => ({ ...prev, [f.key]: checked }))
                  }
                />
              </label>
            );
          })}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10 bg-primary hover:bg-primary/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(toggles)}
          >
            {mutation.isPending ? "Saving..." : "Save toggles"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
