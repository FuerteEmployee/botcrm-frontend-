import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  clearDeviceUnresolved,
  getDevicePinMap,
  getTenants,
  type Device,
} from "@/services/superadmin-service";
import {
  Fingerprint,
  Plus,
  Trash2,
  Power,
  Link2Off,
  AlertTriangle,
  ListOrdered,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", label: "Active" },
  disabled: { bg: "bg-muted", text: "text-muted-foreground", label: "Disabled" },
  unassigned: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", label: "Unassigned" },
};

const UNRESOLVED_REASONS: Record<string, string> = {
  unassigned_device: "arrived before the machine was assigned",
  disabled_device: "machine was disabled",
  unknown_pin: "no employee has this Biometric Device ID",
  duplicate_pin: "two employees share this Biometric Device ID",
  sequence_complete: "extra tap after the day's punch sequence was already complete",
};

function relative(iso?: string | null) {
  if (!iso) return "never";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

/** A machine counts as online if it has checked in within the last 5 minutes. */
function isOnline(device: Device) {
  if (!device.lastSeenAt) return false;
  return Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000;
}

export function MachinesManager({
  lockedAdminId,
  lockedTenantName,
}: {
  /** When set, the list is scoped to one customer and new machines go straight to them. */
  lockedAdminId?: string;
  lockedTenantName?: string;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [releasing, setReleasing] = useState<Device | null>(null);
  const [pinMapFor, setPinMapFor] = useState<Device | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "devices", lockedAdminId || "all"],
    queryFn: () => getDevices(lockedAdminId ? { adminId: lockedAdminId } : undefined),
    // Devices report in every ~30s; keep "last seen" reasonably fresh.
    refetchInterval: 30000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin", "devices"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateDevice>[1] }) =>
      updateDevice(id, payload),
    onSuccess: () => {
      toast.success("Machine updated");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to update machine"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: (res: any) => {
      toast.success(res?.message || "Machine removed");
      invalidate();
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to remove machine"),
  });

  const clearMutation = useMutation({
    mutationFn: (id: string) => clearDeviceUnresolved(id),
    onSuccess: () => {
      toast.success("Warnings cleared");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to clear warnings"),
  });

  const devices = data?.devices || [];
  const unassigned = devices.filter((d) => !d.adminId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted-foreground max-w-lg">
          Each machine is tied to one company by its serial number. Punches from it can only ever be
          recorded against that company's employees.
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add machine
        </Button>
      </div>

      {!lockedAdminId && unassigned.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-900 dark:text-amber-200">
            <strong>
              {unassigned.length} machine{unassigned.length === 1 ? "" : "s"} waiting to be assigned.
            </strong>{" "}
            These reported in on their own but belong to no customer yet, so their punches are being
            discarded. Assign each one to a company below.
          </div>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="border rounded-xl bg-card px-4 py-10 text-center">
          <Fingerprint className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">No machines yet</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
            Add the serial number from the device's <em>Menu → System Info</em>, or just point the
            machine at the API — it will appear here on its own, ready to assign.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto bg-card">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground">Serial / location</th>
                {!lockedAdminId && (
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground">Company</th>
                )}
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground">Last seen</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground">Punches</th>
                <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const badge = STATUS_STYLES[d.status] || STATUS_STYLES.unassigned;
                const online = isOnline(d);
                const warnings = d.recentUnresolved?.length || 0;

                return (
                  <tr key={d._id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-[12px] font-medium">{d.serialNumber}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {d.label || d.model || (d.autoDiscovered ? "Detected automatically" : "—")}
                      </div>
                    </td>

                    {!lockedAdminId && (
                      <td className="px-4 py-3">
                        {d.adminId ? (
                          <>
                            <div className="text-[12px]">{d.adminId.name}</div>
                            <div className="text-[10px] text-muted-foreground">{d.adminId.phone}</div>
                          </>
                        ) : (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400">Not assigned</span>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      {warnings > 0 && (
                        <button
                          onClick={() => setPinMapFor(d)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-destructive hover:underline"
                          title="Punches that could not be matched to an employee"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {warnings} unmatched
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        {online ? (
                          <Wifi className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-muted-foreground" />
                        )}
                        {relative(d.lastSeenAt)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-[11px] tabular-nums">
                      {d.punchCount || 0}
                      {d.lastPunchAt && (
                        <div className="text-[10px] text-muted-foreground">{relative(d.lastPunchAt)}</div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {d.adminId && (
                          <button
                            onClick={() => setPinMapFor(d)}
                            className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                            title="Who each PIN maps to"
                          >
                            <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {d.adminId && (
                          <button
                            onClick={() =>
                              updateMutation.mutate({
                                id: d._id,
                                payload: { status: d.status === "active" ? "disabled" : "active" },
                              })
                            }
                            className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                            title={d.status === "active" ? "Stop accepting punches" : "Start accepting punches"}
                          >
                            <Power
                              className={`h-3.5 w-3.5 ${
                                d.status === "active" ? "text-emerald-600" : "text-muted-foreground"
                              }`}
                            />
                          </button>
                        )}
                        {d.adminId && (
                          <button
                            onClick={() => setReleasing(d)}
                            className="p-1.5 rounded-md border hover:bg-muted transition-colors"
                            title="Release from this company"
                          >
                            <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleting(d)}
                          className="p-1.5 rounded-md border hover:bg-destructive/10 transition-colors"
                          title="Remove machine"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddMachineDialog
          lockedAdminId={lockedAdminId}
          lockedTenantName={lockedTenantName}
          onClose={() => setShowAdd(false)}
          onSaved={invalidate}
        />
      )}

      {pinMapFor && (
        <PinMapDialog
          device={pinMapFor}
          onClose={() => setPinMapFor(null)}
          onClearWarnings={() => clearMutation.mutate(pinMapFor._id)}
          clearing={clearMutation.isPending}
        />
      )}

      <AlertDialog open={!!releasing} onOpenChange={(open) => !open && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {releasing?.serialNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              The machine stays registered but belongs to no company, so it stops recording attendance
              until you assign it again. Use this when a customer returns a device or you need to move
              it to a different company. Existing attendance is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (releasing) {
                  updateMutation.mutate({ id: releasing._id, payload: { adminId: null } });
                  setReleasing(null);
                }
              }}
            >
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.serialNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This forgets the machine entirely. Attendance already recorded from it stays untouched.
              If the machine is still powered on and pointed at the API, it will reappear here as
              unassigned the next time it checks in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMutation.mutate(deleting._id);
              }}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMachineDialog({
  lockedAdminId,
  lockedTenantName,
  onClose,
  onSaved,
}: {
  lockedAdminId?: string;
  lockedTenantName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serialNumber, setSerialNumber] = useState("");
  const [adminId, setAdminId] = useState(lockedAdminId || "");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("eSSL MB20+ID");

  // Only needed when adding from the global Machines page.
  const { data: tenantData } = useQuery({
    queryKey: ["superadmin", "tenants", "all", ""],
    queryFn: () => getTenants({ status: "all" }),
    enabled: !lockedAdminId,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createDevice({
        serialNumber,
        adminId: adminId || null,
        label,
        model,
      }),
    onSuccess: () => {
      toast.success(`Machine ${serialNumber.trim().toUpperCase()} registered`);
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to register machine"),
  });

  const tenants = (tenantData?.tenants || []).filter((t: any) => t.adminId?._id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Add machine{lockedTenantName ? ` — ${lockedTenantName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Serial number</Label>
            <Input
              autoFocus
              className="h-8 text-xs font-mono"
              placeholder="EUF7254400194"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              On the device: <em>Menu → System Info → Serial Number</em>. Case doesn't matter.
            </p>
          </div>

          {!lockedAdminId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Company</Label>
              <Select value={adminId} onValueChange={setAdminId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Leave unassigned for now" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.adminId._id} value={t.adminId._id} className="text-xs">
                      {t.adminId.name} — {t.adminId.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Reception"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                className="h-8 text-xs"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!serialNumber.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Add machine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PinMapDialog({
  device,
  onClose,
  onClearWarnings,
  clearing,
}: {
  device: Device;
  onClose: () => void;
  onClearWarnings: () => void;
  clearing: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "devices", device._id, "pin-map"],
    queryFn: () => getDevicePinMap(device._id),
  });

  const employees = data?.employees || [];
  const mapped = employees.filter((e) => e.deviceUserId);
  const unmapped = employees.filter((e) => !e.deviceUserId);
  const warnings = device.recentUnresolved || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            <span className="font-mono">{device.serialNumber}</span> — who each PIN maps to
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (
          <div className="space-y-4 mt-1 max-h-[60vh] overflow-y-auto">
            {warnings.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Punches nobody received
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    disabled={clearing}
                    onClick={onClearWarnings}
                  >
                    {clearing ? "Clearing..." : "Clear"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Someone was accepted by the machine but no attendance was recorded. Give the
                  employee the matching Biometric Device ID to fix it.
                </p>
                <ul className="space-y-1">
                  {warnings.slice().reverse().map((w, i) => (
                    <li key={i} className="text-[11px] flex items-baseline gap-2">
                      <span className="font-mono font-medium">PIN {w.pin}</span>
                      <span className="text-muted-foreground">
                        {UNRESOLVED_REASONS[w.reason || ""] || w.reason} · {relative(w.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                Mapped — {mapped.length}
              </p>
              {mapped.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No employee has a Biometric Device ID yet, so every punch from this machine will be
                  discarded.
                </p>
              ) : (
                <ul className="divide-y border rounded-lg">
                  {mapped.map((e) => (
                    <li key={e._id} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-[11px] font-semibold w-12 shrink-0 tabular-nums">
                        {e.deviceUserId}
                      </span>
                      <span className="text-[12px] flex-1 min-w-0 truncate">{e.name}</span>
                      {e.status === "inactive" && (
                        <span className="text-[10px] text-muted-foreground shrink-0">inactive</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {unmapped.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  No Biometric Device ID — {unmapped.length}
                </p>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  These employees can't punch on any machine. They can still use the app.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unmapped.map((e) => (
                    <span key={e._id} className="text-[11px] px-2 py-0.5 rounded-md bg-muted">
                      {e.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The per-customer wrapper opened from the Customers table. */
export function MachinesDialog({
  adminId,
  tenantName,
  onClose,
}: {
  adminId: string;
  tenantName?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Fingerprint className="h-4 w-4" />
            Biometric machines — {tenantName || "Customer"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <MachinesManager lockedAdminId={adminId} lockedTenantName={tenantName} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
