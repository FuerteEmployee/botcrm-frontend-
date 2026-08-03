import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Fingerprint,
  Wifi,
  WifiOff,
  AlertTriangle,
  BookOpen,
  Save,
  Search,
  Check,
  Pencil,
  ListOrdered,
  Users,
  HardDrive,
  Info,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import {
  getMyDevices,
  claimDevice,
  updateMyDevice,
  releaseMyDevice,
  clearMyDeviceUnresolved,
  setEmployeePin,
  type MyDevice,
} from "@/services/biometric-device-service";
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
import {
  PunchSequenceEditor,
  DEFAULT_PUNCH_SEQUENCE,
  validateSequence,
  type PunchSequenceConfig,
} from "@/components/pages/punch-sequence-editor";

export const Route = createFileRoute("/_app/biometric-devices")({
  component: BiometricDevicesPage,
});

const REASONS: Record<string, string> = {
  unassigned_device: "arrived before the machine was assigned to you",
  disabled_device: "the machine was switched off in settings",
  unknown_pin: "no employee has this Biometric Device ID",
  duplicate_pin: "two employees share this Biometric Device ID",
  sequence_complete: "an extra tap after the day's sequence was already complete",
};

function relative(iso?: string | null) {
  if (!iso) return "never";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

/** Online if the machine has checked in within the last 5 minutes (it polls ~30s). */
function isOnline(d: MyDevice) {
  return !!d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60 * 1000;
}

function BiometricDevicesPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canEdit = can("biometric-devices", "edit");

  const [showGuide, setShowGuide] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [releasing, setReleasing] = useState<MyDevice | null>(null);
  const [pinSearch, setPinSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: getMyDevices,
    refetchInterval: 30000,
  });

  // ── Punch sequence lives in Settings.attendance. The whole `attendance`
  // subdocument has to be sent back on save, because the API $sets the object
  // wholesale — posting only punchSequence would wipe every other rule.
  const [rawAttendance, setRawAttendance] = useState<Record<string, unknown> | null>(null);
  const [sequence, setSequence] = useState<PunchSequenceConfig>(DEFAULT_PUNCH_SEQUENCE);
  const [savingSeq, setSavingSeq] = useState(false);
  const [seqLoaded, setSeqLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await apiClient.get("/settings");
        const att = s?.attendance || {};
        setRawAttendance(att);
        setSequence({
          ...DEFAULT_PUNCH_SEQUENCE,
          ...(att.punchSequence || {}),
          steps: att.punchSequence?.steps?.length
            ? att.punchSequence.steps
            : DEFAULT_PUNCH_SEQUENCE.steps,
        });
      } catch {
        toast.error("Could not load punch rules");
      } finally {
        setSeqLoaded(true);
      }
    })();
  }, []);

  const sequenceError = sequence.enabled ? validateSequence(sequence.steps) : null;

  const saveSequence = async () => {
    if (sequenceError) {
      toast.error(sequenceError);
      return;
    }
    setSavingSeq(true);
    try {
      await apiClient.put("/settings", {
        attendance: { ...(rawAttendance || {}), punchSequence: sequence },
      });
      toast.success("Punch rules saved");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Could not save punch rules");
    } finally {
      setSavingSeq(false);
    }
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });

  const clearMutation = useMutation({
    mutationFn: (id: string) => clearMyDeviceUnresolved(id),
    onSuccess: () => {
      toast.success("Warnings cleared");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Could not clear warnings"),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => releaseMyDevice(id),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
      setReleasing(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Could not remove machine"),
  });

  const devices = data?.devices || [];
  const employees = data?.employees || [];

  // A PIN must identify exactly one person, so surface any clash loudly — the
  // machine sends nothing but the number.
  const duplicatePins = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => {
      if (e.deviceUserId) counts[e.deviceUserId] = (counts[e.deviceUserId] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter((p) => counts[p] > 1));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = pinSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.deviceUserId || "").includes(q)
    );
  }, [employees, pinSearch]);

  const totalUnmatched = devices.reduce((n, d) => n + (d.recentUnresolved?.length || 0), 0);

  if (isLoading || !seqLoaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Biometric Device" description="Loading machine setup..." />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Biometric Device"
        description="Your fingerprint machines, what each punch means, and who each ID belongs to."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowGuide(true)}
              className="h-10 px-5 rounded-xl font-bold"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Setup guide
            </Button>
            {can("biometric-devices", "create") && (
              <Button
                onClick={() => setShowAdd(true)}
                className="h-10 px-5 rounded-xl font-bold"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add machine
              </Button>
            )}
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Machines", value: devices.length, icon: HardDrive },
          { label: "Online now", value: devices.filter(isOnline).length, icon: Wifi },
          { label: "Employees with an ID", value: `${data?.mapped ?? 0}/${employees.length}`, icon: Users },
          { label: "Unmatched punches", value: totalUnmatched, icon: AlertTriangle },
        ].map((s) => (
          <Card key={s.label} className="border-none shadow-sm bg-white">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </p>
              </div>
              <p className="text-2xl font-black tracking-tight tabular-nums">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── MACHINES ── */}
      <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Fingerprint className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Your machines</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Add a machine using the serial number printed on it
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {devices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Fingerprint className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-bold">No machine registered yet</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
                Add your fingerprint machine using the serial number from its
                <em> Menu → System Info</em>. If it is already connected to the internet it may show
                up here on its own. The setup guide walks through the whole process.
              </p>
              {can("biometric-devices", "create") && (
                <Button onClick={() => setShowAdd(true)} className="mt-4 h-9 rounded-xl font-bold">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add machine
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {devices.map((d) => (
                <DeviceRow
                  key={d._id}
                  device={d}
                  canEdit={canEdit}
                  canDelete={can("biometric-devices", "delete")}
                  onClearWarnings={() => clearMutation.mutate(d._id)}
                  clearing={clearMutation.isPending}
                  onRelease={() => setReleasing(d)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── PUNCH RULES ── */}
      <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ListOrdered className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Punch in / out &amp; lunch rules</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                What each tap on the machine records
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              onClick={saveSequence}
              disabled={savingSeq || !!sequenceError}
              className="h-9 px-4 rounded-xl font-bold"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingSeq ? "Saving..." : "Save rules"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-6">
          <PunchSequenceEditor value={sequence} onChange={setSequence} />
        </CardContent>
      </Card>

      {/* ── PIN MAPPING ── */}
      <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/40 px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Who each ID belongs to</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  The number the machine assigned when you enrolled the person's finger or face
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name or ID..."
                value={pinSearch}
                onChange={(e) => setPinSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {duplicatePins.size > 0 && (
            <div className="flex items-start gap-2.5 bg-destructive/5 border-b border-destructive/30 px-6 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive">
                <strong>
                  ID {Array.from(duplicatePins).join(", ")} is used by more than one employee.
                </strong>{" "}
                The machine sends only the number, so punches for a shared ID can't be told apart and
                are refused. Give each person their own ID.
              </p>
            </div>
          )}
          {(data?.unmapped ?? 0) > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border-b border-amber-200 px-6 py-3">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900">
                <strong>{data?.unmapped} employee(s) have no Biometric Device ID.</strong> They can't
                use the machine — their punches will be discarded. They can still punch from the
                mobile app.
              </p>
            </div>
          )}
          <div className="divide-y divide-border/30">
            {filteredEmployees.length === 0 ? (
              <p className="px-6 py-10 text-center text-[12px] text-muted-foreground">
                No employees match "{pinSearch}"
              </p>
            ) : (
              filteredEmployees.map((e) => (
                <PinRow
                  key={e._id}
                  employee={e}
                  canEdit={canEdit}
                  isDuplicate={!!e.deviceUserId && duplicatePins.has(e.deviceUserId)}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["biometric-devices"] })}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {showGuide && <SetupGuideDialog onClose={() => setShowGuide(false)} />}

      {showAdd && (
        <AddMachineDialog onClose={() => setShowAdd(false)} onSaved={invalidate} />
      )}

      <AlertDialog open={!!releasing} onOpenChange={(open) => !open && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {releasing?.serialNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This machine will stop recording attendance for your company immediately. Attendance
              already recorded from it is kept and stays visible in your logs. You can add the same
              serial number again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={releaseMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (releasing) releaseMutation.mutate(releasing._id);
              }}
            >
              {releaseMutation.isPending ? "Removing..." : "Remove machine"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMachineDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serialNumber, setSerialNumber] = useState("");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("eSSL MB20+ID");

  const mutation = useMutation({
    mutationFn: () => claimDevice({ serialNumber, label, model }),
    onSuccess: () => {
      toast.success(`${serialNumber.trim().toUpperCase()} added`);
      onSaved();
      onClose();
    },
    onError: (e: any) =>
      // A 409 here means the serial belongs to another company; the API's message
      // explains what to do without revealing whose it is.
      toast.error(e?.response?.data?.message || "Could not add this machine", { duration: 8000 }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Fingerprint className="h-4 w-4" />
            Add a biometric machine
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Serial number</Label>
            <Input
              autoFocus
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="EUF7254400194"
              className="h-10 font-mono rounded-xl"
            />
            <p className="text-[10px] text-muted-foreground">
              On the machine: <em>Menu → System Info → Serial Number</em>. It's also printed on a
              sticker on the back. Capitals and lower case both work.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Location</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Reception"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Model</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-900">
              Check the serial belongs to <strong>your own machine</strong>. Every punch it sends will
              be recorded against your employees. A serial already registered to another company
              can't be added here.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose} className="h-10 rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!serialNumber.trim() || mutation.isPending}
            className="h-10 rounded-xl font-bold"
          >
            {mutation.isPending ? "Adding..." : "Add machine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeviceRow({
  device,
  canEdit,
  canDelete,
  onClearWarnings,
  clearing,
  onRelease,
}: {
  device: MyDevice;
  canEdit: boolean;
  canDelete: boolean;
  onClearWarnings: () => void;
  clearing: boolean;
  onRelease: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(device.label || "");
  const online = isOnline(device);
  const warnings = device.recentUnresolved || [];

  const mutation = useMutation({
    mutationFn: () => updateMyDevice(device._id, { label }),
    onSuccess: () => {
      toast.success("Machine renamed");
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Could not rename machine"),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      updateMyDevice(device._id, { status: device.status === "active" ? "disabled" : "active" }),
    onSuccess: () => {
      toast.success(
        device.status === "active"
          ? `${device.serialNumber} paused — punches will not be recorded`
          : `${device.serialNumber} is recording again`
      );
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Could not change machine"),
  });

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[13px] font-bold">{device.serialNumber}</span>
            <span
              className={cn(
                "inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold",
                device.status === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {device.status === "active" ? "Recording" : "Not recording"}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {online ? (
                <Wifi className="h-3 w-3 text-emerald-600" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {online ? "online" : `last seen ${relative(device.lastSeenAt)}`}
            </span>
          </div>

          {editing ? (
            <div className="flex items-center gap-2 mt-2">
              <Input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Reception — ground floor"
                className="h-8 text-xs w-56 rounded-lg"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setLabel(device.label || "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
              {device.label || device.model || "No location set"}
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  rename
                </button>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Punches recorded</p>
            <p className="text-lg font-black tabular-nums">{device.punchCount || 0}</p>
            {device.lastPunchAt && (
              <p className="text-[10px] text-muted-foreground">last {relative(device.lastPunchAt)}</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                onClick={() => statusMutation.mutate()}
                disabled={statusMutation.isPending}
                className="p-2 rounded-xl border border-border/60 hover:bg-muted transition-colors disabled:opacity-40"
                title={
                  device.status === "active"
                    ? "Pause — stop recording punches from this machine"
                    : "Resume recording punches"
                }
              >
                <Power
                  className={cn(
                    "h-3.5 w-3.5",
                    device.status === "active" ? "text-emerald-600" : "text-muted-foreground"
                  )}
                />
              </button>
            )}
            {canDelete && (
              <button
                onClick={onRelease}
                className="p-2 rounded-xl border border-border/60 hover:bg-destructive/10 transition-colors"
                title="Remove this machine from your company"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[11px] font-bold text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warnings.length} punch(es) nobody received
            </p>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px]"
                disabled={clearing}
                onClick={onClearWarnings}
              >
                {clearing ? "Clearing..." : "Clear"}
              </Button>
            )}
          </div>
          <ul className="space-y-0.5">
            {warnings
              .slice()
              .reverse()
              .slice(0, 6)
              .map((w, i) => (
                <li key={i} className="text-[11px] flex items-baseline gap-2">
                  <span className="font-mono font-bold">ID {w.pin}</span>
                  <span className="text-muted-foreground">
                    {REASONS[w.reason || ""] || w.reason} · {relative(w.at)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PinRow({
  employee,
  canEdit,
  isDuplicate,
  onSaved,
}: {
  employee: { _id: string; name: string; deviceUserId?: string | null; status: string };
  canEdit: boolean;
  isDuplicate: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(employee.deviceUserId || "");
  const [dirty, setDirty] = useState(false);

  const mutation = useMutation({
    mutationFn: () => setEmployeePin(employee._id, value.trim()),
    onSuccess: () => {
      toast.success(
        value.trim() ? `${employee.name} → ID ${value.trim()}` : `ID cleared for ${employee.name}`
      );
      setDirty(false);
      onSaved();
    },
    onError: (e: any) => {
      // The backend rejects a duplicate with a 409 naming who already holds it.
      toast.error(e?.response?.data?.message || "Could not save ID");
    },
  });

  return (
    <div className="px-6 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold truncate">{employee.name}</p>
        {employee.status === "inactive" && (
          <p className="text-[10px] text-muted-foreground">inactive</p>
        )}
      </div>

      {!employee.deviceUserId && !dirty && (
        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
          No ID
        </span>
      )}
      {isDuplicate && (
        <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full shrink-0">
          Duplicate
        </span>
      )}

      <Input
        value={value}
        disabled={!canEdit}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(e.target.value !== (employee.deviceUserId || ""));
        }}
        placeholder="—"
        className={cn(
          "h-8 w-24 text-xs text-center font-mono rounded-lg shrink-0",
          isDuplicate && "border-destructive"
        )}
      />

      {dirty && canEdit && (
        <Button
          size="sm"
          className="h-8 text-xs shrink-0"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "..." : <Check className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

function SetupGuideDialog({ onClose }: { onClose: () => void }) {
  const STEPS = [
    {
      title: "Get the machine on your network",
      body: "On the device: Menu → Comm → Ethernet. Turn DHCP ON, then reboot. If the screen shows 0.0.0.0 for IP, subnet or DNS, it has no address yet and cannot send anything — the network icon only means the cable is plugged in. Plug it into your router rather than a laptop so it stays online.",
    },
    {
      title: "Point it at B.O.T",
      body: "Menu → Comm → Cloud Server Settings. Server Mode: ADMS. Enable Domain Name: ON. Server Address: api.beontimeofficial.com. Enable Proxy: OFF. Then reboot — the machine only connects on startup, not when you save.",
    },
    {
      title: "Add the machine here",
      body: 'Read the serial number off the machine (Menu → System Info → Serial Number) and add it with the "Add machine" button above. Until a serial is registered to your company its punches are discarded. No port forwarding or firewall changes are needed — the machine only ever dials out. If the serial is already registered to another company, call support so it can be moved.',
    },
    {
      title: "Enrol each person on the machine",
      body: "Menu → User Mgt → New User. Capture the finger or face. Write down the User ID / PIN the machine gives them — the fingerprint itself never leaves the device, so that number is the only link back to a person.",
    },
    {
      title: "Enter that number here",
      body: 'Use "Who each ID belongs to" above, or the employee\'s profile → Employment Terms → Biometric Device ID. It must match the machine exactly. Each employee needs their own number — two people sharing one means punches can\'t be told apart and are refused.',
    },
    {
      title: "Choose what each tap means",
      body: 'In "Punch in / out & lunch rules" above, turn on the punch sequence if a working day has a lunch break: 1st tap = punch in, 2nd = lunch starts, 3rd = back from lunch, 4th = punch out. Leave it off and taps just alternate in / out.',
    },
    {
      title: "Test it",
      body: "Have someone punch, then open Attendance Logs — it should appear within about 30 seconds. If nothing arrives, check this page: the machine's \"last seen\" tells you whether it is reaching us at all, and unmatched punches tell you the ID isn't mapped to anyone.",
    },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Setting up your fingerprint machine
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 max-h-[65vh] overflow-y-auto pr-1 space-y-4">
          <p className="text-[12px] text-muted-foreground">
            Do these once per machine. Menu names vary slightly between eSSL and ZKTeco firmware, but
            the order is the same.
          </p>

          {STEPS.map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-black flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <div>
                <p className="text-[13px] font-bold">{s.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{s.body}</p>
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-muted/50 p-3.5">
            <p className="text-[11px] font-bold mb-1">Something not working?</p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
              <li>
                <strong>"Last seen: never"</strong> — the machine has never reached us. Check its IP
                and DNS, and that the Server Address has no typo.
              </li>
              <li>
                <strong>Punch accepted on the machine but missing here</strong> — the ID isn't
                assigned to anyone, or has a stray space. Check the unmatched list above.
              </li>
              <li>
                <strong>A short punch showed as half-day</strong> — two taps close together read as
                in-then-out. Turn on the punch sequence to stop that.
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2">
              Still stuck? Call B.O.T support on +91 97240 00697.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
