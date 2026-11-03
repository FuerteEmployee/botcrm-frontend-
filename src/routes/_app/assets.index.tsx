import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Plus, Monitor, Search, Smartphone, Laptop, Speaker, User, List, CheckCircle2, AlertCircle, IndianRupee, MousePointer2, Keyboard, Tablet, RotateCcw, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/shared/form-input";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { useAssetService, type Asset } from "@/services/asset-service";
import { ActionButton } from "@/components/shared/action-button";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { GridCard } from "@/components/shared/grid-card";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { formatINR, formatINRFull } from "@/lib/format";
import { toast } from "sonner";
import { AdminLoadError } from "@/components/festivals/admin-load-error";

export const Route = createFileRoute("/_app/assets/")({
  component: AssetsPage,
});

type ViewMode = "list" | "employee";
type StatusFilter = "all" | "out" | Asset["status"];

const DEVICE_ICONS: Record<string, any> = {
  Laptop, Mobile: Smartphone, Mouse: MousePointer2, Keyboard, Monitor, Headset: Speaker, Tablet,
};
const getDeviceIcon = (type: string) => DEVICE_ICONS[type] || Monitor;

const STATUS_LABEL: Record<Asset["status"], string> = { active: "With employee", damaged: "Damaged", returned: "Returned" };
const STATUS_CLASS: Record<Asset["status"], string> = {
  active: "bg-success/10 text-success border-success/20",
  returned: "bg-muted text-muted-foreground border-border",
  damaged: "bg-destructive/10 text-destructive border-destructive/20",
};

// "2026-09-20" as 20 Sep 2026, read as a calendar date (no timezone shift).
function formatDateKey(v?: string | null) {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  if (!m) return "—";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: Asset["status"] }) {
  return (
    <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", STATUS_CLASS[status])}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

function AssetsPage() {
  const navigate = useNavigate();
  const { assets, updateAsset, deleteAsset, isLoading, isError, error, refetch, isFetching, isUpdating, isDeleting } = useAssetService({ silent: true });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<ViewMode>(defaultLayout === "grid" ? "employee" : "list");
  const { can } = usePermission();
  const canCreate = can("assets", "create");
  const canEdit = can("assets", "edit");
  const canDelete = can("assets", "delete");

  useEffect(() => {
    setView(defaultLayout === "grid" ? "employee" : "list");
  }, [defaultLayout]);
  const [returnTarget, setReturnTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  const counts = useMemo(() => {
    const c = { all: assets.length, out: 0, active: 0, damaged: 0, returned: 0 };
    for (const a of assets) {
      c[a.status] = (c[a.status] || 0) + 1;
      if (a.status !== "returned") c.out++;
    }
    return c;
  }, [assets]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter((a) => {
      const matchesStatus = statusFilter === "all" || (statusFilter === "out" ? a.status !== "returned" : a.status === statusFilter);
      const matchesSearch = !needle || [a.employeeName, a.deviceName, a.deviceType, a.serialNumber, a.brand, a.model]
        .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [assets, search, statusFilter]);

  // Only devices still out with someone count as "with employees".
  const valueOut = assets.filter((a) => a.status !== "returned").reduce((sum, a) => sum + (a.amount || 0), 0);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, { employeeName: string; assets: Asset[] }> = {};
    filtered.forEach(a => {
      if (!groups[a.employeeId]) {
        groups[a.employeeId] = { employeeName: a.employeeName, assets: [] };
      }
      groups[a.employeeId].assets.push(a);
    });
    return Object.entries(groups)
      .map(([id, data]) => ({ employeeId: id, ...data }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filtered]);

  const markReturned = async () => {
    if (!returnTarget) return;
    try {
      await updateAsset({ id: returnTarget._id, data: { status: "returned" } });
      toast.success(`${returnTarget.deviceName} marked as returned by ${returnTarget.employeeName}`);
      setReturnTarget(null);
    } catch {
      // The service has said why.
    }
  };

  const removeRecord = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget._id);
      setDeleteTarget(null);
    } catch {
      // The service has said why.
    }
  };

  const rowActions = (asset: Asset) => (
    <div className="flex justify-end items-center gap-1">
      {canEdit && (
        <ActionButton
          variant="edit"
          tooltip="Edit"
          aria-label={`Edit ${asset.deviceName}`}
          className="h-10 w-10"
          onClick={() => navigate({ to: "/assets/allocate", search: { assetId: asset._id } })}
        />
      )}
      {canEdit && asset.status !== "returned" && (
        <ActionButton
          variant="revoke"
          tooltip="Mark returned"
          aria-label={`Mark ${asset.deviceName} returned`}
          className="h-10 w-10"
          onClick={() => setReturnTarget(asset)}
        />
      )}
      {canDelete && asset.status === "returned" && (
        <ActionButton
          variant="delete"
          tooltip="Delete record"
          aria-label={`Delete record of ${asset.deviceName}`}
          className="h-10 w-10"
          onClick={() => setDeleteTarget(asset)}
        />
      )}
    </div>
  );

  const emptyMessage = assets.length === 0
    ? (canCreate ? "No devices given out yet. Use Give Device to record one." : "No devices given out yet.")
    : "No devices match this search or filter.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Laptops, phones and other devices given to employees."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Give Device"
              onClick={() => navigate({ to: "/assets/allocate" })}
            />
          ) : null
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="With employees" value={counts.out} icon={Package} accent="primary" delay={0} />
        <StatCard label="Value with employees" value={formatINR(valueOut)} icon={IndianRupee} accent="info" delay={0.05} />
        <StatCard label="Damaged" value={counts.damaged} icon={AlertCircle} accent="destructive" delay={0.1} />
        <StatCard label="Returned" value={counts.returned} icon={CheckCircle2} accent="success" delay={0.15} />
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2">
          <ViewToggle
            view={view}
            onViewChange={(v: any) => updateDefaultLayout(v === 'employee' ? 'grid' : 'list')}
            options={[
              { value: "employee", label: "By employee", icon: User },
              { value: "list", label: "All devices", icon: List },
            ]}
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger aria-label="Filter by status" className="h-10 w-[180px] rounded-xl border-border/60 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All records ({counts.all})</SelectItem>
              <SelectItem value="out">Still with employee ({counts.out})</SelectItem>
              <SelectItem value="active">Working ({counts.active})</SelectItem>
              <SelectItem value="damaged">Damaged ({counts.damaged})</SelectItem>
              <SelectItem value="returned">Returned ({counts.returned})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FormInput
          placeholder="Search employee, device, serial..."
          icon={Search}
          className="h-10 w-full md:w-[320px] shadow-none bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <SkeletonLoader type="card" count={6} />
        ) : isError ? (
          <AdminLoadError what="the device list" error={error} onRetry={() => refetch()} retrying={isFetching} />
        ) : view === "employee" ? (
          <motion.div
            key="employee"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {groupedByEmployee.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-[13px] text-muted-foreground">{emptyMessage}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedByEmployee.map((group) => {
                  const held = group.assets.filter((a) => a.status !== "returned");
                  const heldValue = held.reduce((s, a) => s + (a.amount || 0), 0);
                  return (
                    <GridCard
                      key={group.employeeId}
                      title={group.employeeName}
                      subtitle={`${held.length} with them · ${formatINRFull(heldValue)}${group.assets.length > held.length ? ` · ${group.assets.length - held.length} returned` : ""}`}
                      icon={
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black uppercase">
                          {(group.employeeName || "?").charAt(0)}
                        </span>
                      }
                      statusNode={
                        canCreate ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Give ${group.employeeName} a device`}
                            title="Give another device"
                            onClick={() => navigate({ to: "/assets/allocate", search: { employeeId: group.employeeId } })}
                            className="h-10 w-10 p-0 rounded-full text-primary hover:bg-primary/10"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        ) : null
                      }
                    >
                      <div className="space-y-2 mt-2">
                        {group.assets.map(asset => {
                          const Icon = getDeviceIcon(asset.deviceType);
                          return (
                            <div key={asset._id} className={cn("flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/30 border border-transparent", asset.status === "returned" && "opacity-70")}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-8 w-8 shrink-0 rounded-lg bg-card border border-border/50 flex items-center justify-center text-primary/70">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-semibold truncate">{asset.deviceName}</div>
                                  <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
                                    <span className="font-mono">{asset.serialNumber}</span>
                                    <span>{formatINRFull(asset.amount)}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                    <StatusBadge status={asset.status} />
                                    <span>
                                      {asset.status === "returned" && asset.returnedAt
                                        ? `Back ${formatDateKey(asset.returnedAt)}`
                                        : `Given ${formatDateKey(asset.allocatedAt)}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {rowActions(asset)}
                            </div>
                          );
                        })}
                      </div>
                    </GridCard>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DataTable
              headers={["Employee", "Device", "Serial number", "Value", "Given on", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
              emptyMessage={emptyMessage}
            >
              {filtered.map((asset) => {
                const Icon = getDeviceIcon(asset.deviceType);
                return (
                  <DataTableRow key={asset._id}>
                    <DataTableCell isFirst className="font-medium text-[13px]">{asset.employeeName}</DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0 border border-primary/10">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold">{asset.deviceName}</div>
                          <div className="text-[12px] text-muted-foreground">{asset.deviceType}</div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="font-mono text-[12px] text-muted-foreground">{asset.serialNumber}</DataTableCell>
                    <DataTableCell className="font-bold text-foreground whitespace-nowrap">{formatINRFull(asset.amount)}</DataTableCell>
                    <DataTableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                      {formatDateKey(asset.allocatedAt)}
                      {asset.status === "returned" && asset.returnedAt && (
                        <div className="text-[11px]">Back {formatDateKey(asset.returnedAt)}</div>
                      )}
                    </DataTableCell>
                    <DataTableCell><StatusBadge status={asset.status} /></DataTableCell>
                    <DataTableCell isLast>{rowActions(asset)}</DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={!!returnTarget} onOpenChange={(o) => { if (!o && !isUpdating) setReturnTarget(null); }}>
        <AlertDialogContent className="rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 grid place-items-center mb-2">
              <RotateCcw className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">Mark as returned?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {returnTarget ? `${returnTarget.deviceName} (${returnTarget.serialNumber}) came back from ${returnTarget.employeeName} today. ` : ""}
              The record stays in their history, and the device can then be given to someone else.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl h-10" disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); markReturned(); }}
              disabled={isUpdating}
              className="rounded-xl h-10"
            >
              {isUpdating ? "Saving..." : "Mark returned"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !isDeleting) setDeleteTarget(null); }}
        onConfirm={removeRecord}
        isLoading={isDeleting}
        title="Delete this record?"
        description={deleteTarget ? `The record of ${deleteTarget.deviceName} given to ${deleteTarget.employeeName} will be removed from their history for good. Use this only for a record added by mistake.` : ""}
        confirmText="Delete"
      />
    </div>
  );
}
