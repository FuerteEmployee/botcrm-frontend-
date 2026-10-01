import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  clearDeviceUnresolved,
  getDevicePinMap,
  getDeviceCompanies,
  type Device,
  type DeviceCompany,
  type DeviceStatusFilter,
} from "@/services/superadmin-service";
import { requestErrorMessage } from "@/services/request-error";
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
  Pencil,
  Building2,
  Clock,
  Search,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const STATUS_STYLES: Record<string, { cls: string; label: string }> = {
  active: {
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    label: "Recording",
  },
  disabled: { cls: "bg-muted text-muted-foreground", label: "Paused" },
  unassigned: {
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    label: "Waiting for a company",
  },
};

const FILTERS: { value: DeviceStatusFilter; label: string }[] = [
  { value: "all", label: "All machines" },
  { value: "unassigned", label: "Waiting for a company" },
  { value: "active", label: "Recording" },
  { value: "disabled", label: "Paused" },
  { value: "offline", label: "Not reporting" },
];

const UNRESOLVED_REASONS: Record<string, string> = {
  unassigned_device: "arrived before the machine was given to a company",
  disabled_device: "the machine was paused",
  unknown_pin: "no employee has this Biometric Device ID",
  duplicate_pin: "two employees share this Biometric Device ID",
  sequence_complete: "an extra tap after the day's punches were already complete",
};

/** Above this the server treats a terminal's clock as wrong (DEVICE_SKEW_SUSPECT_MINUTES). */
const CLOCK_WARN_MINUTES = 45;
/** Same shape check the server applies (utils/device_registry.js isUsableSerial). */
const SERIAL_RE = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;

function relative(iso?: string | null) {
  if (!iso) return "never";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

function istWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "5h 30m" for a number of minutes; whole days past two days. */
function span(minutes: number) {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** A machine counts as online if it has checked in within the last 5 minutes (it polls ~30s). */
function isOnline(device: Device) {
  return !!device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000;
}

const companyOf = (d: Device) => d.adminId?.companyName || d.adminId?.name || "";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const errText = (err: unknown, fallback: string) => {
  const msg = requestErrorMessage(err, fallback);
  if (msg) toast.error(msg);
};

export function MachinesManager({
  lockedAdminId,
  lockedTenantName,
}: {
  /** When set, the list is scoped to one company and new machines go straight to them. */
  lockedAdminId?: string;
  lockedTenantName?: string;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [releasing, setReleasing] = useState<Device | null>(null);
  const [pausing, setPausing] = useState<Device | null>(null);
  const [assigning, setAssigning] = useState<Device | null>(null);
  const [editing, setEditing] = useState<Device | null>(null);
  const [pinMapFor, setPinMapFor] = useState<Device | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DeviceStatusFilter>("all");
  const q = useDebounced(search.trim());

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "devices", lockedAdminId || "all", status, q],
    queryFn: () =>
      getDevices({
        ...(lockedAdminId ? { adminId: lockedAdminId } : {}),
        ...(status !== "all" ? { status } : {}),
        ...(q ? { search: q } : {}),
      }),
    // Devices report in every ~30s; keep "last seen" reasonably fresh.
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin", "devices"] });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateDevice>[1];
      done: string;
    }) => updateDevice(id, payload),
    onSuccess: (_d, vars) => {
      toast.success(vars.done);
      invalidate();
      setPausing(null);
      setReleasing(null);
    },
    onError: (err) => errText(err, "Could not change the machine. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: (res: { message?: string }) => {
      toast.success(res?.message || "Machine removed");
      invalidate();
      setDeleting(null);
    },
    onError: (err) => errText(err, "Could not remove the machine. Try again."),
  });

  const clearMutation = useMutation({
    mutationFn: (id: string) => clearDeviceUnresolved(id),
    onSuccess: (device) => {
      toast.success("Warnings cleared");
      setPinMapFor((cur) =>
        cur && cur._id === device._id ? { ...cur, recentUnresolved: [] } : cur,
      );
      invalidate();
    },
    onError: (err) => errText(err, "Could not clear the warnings. Try again."),
  });

  const devices = Array.isArray(data?.devices) ? data!.devices : [];
  const unassignedCount = data?.unassignedCount ?? 0;
  const quietAfter = data?.offlineAfterMinutes ?? 120;
  const filtering = status !== "all" || !!q;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Each machine belongs to one company, by its serial number. Its punches can only ever be
        recorded for that company's employees.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9 text-[13px]"
            placeholder={
              lockedAdminId ? "Search serial or location" : "Search serial, location or company"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search machines"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as DeviceStatusFilter)}>
          <SelectTrigger className="h-10 text-[13px] sm:w-56" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.filter((f) => !(lockedAdminId && f.value === "unassigned")).map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-[13px]">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-10 text-[13px]" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add machine
        </Button>
      </div>

      {!lockedAdminId && unassignedCount > 0 && status !== "unassigned" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="text-[12px] text-amber-900 dark:text-amber-200">
            <strong>
              {unassignedCount} machine{unassignedCount === 1 ? " is" : "s are"} waiting for a
              company.
            </strong>{" "}
            They reported in on their own but belong to nobody yet, so their punches are not
            recorded.{" "}
            <button className="font-semibold underline" onClick={() => setStatus("unassigned")}>
              Show them
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium">Could not load the machines.</p>
          <Button
            variant="outline"
            className="mt-3 h-10"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Trying..." : "Try again"}
          </Button>
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <Fingerprint className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
          {filtering ? (
            <>
              <p className="text-sm font-medium">No machine matches</p>
              <Button
                variant="outline"
                className="mt-3 h-10"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Show all machines
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No machines yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
                Add the serial number from the machine's <em>Menu → System Info</em>, or point the
                machine at the server. It will then appear here on its own, ready to give to a
                company.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <MachineRow
              key={d._id}
              device={d}
              showCompany={!lockedAdminId}
              quietAfter={quietAfter}
              onPinMap={() => setPinMapFor(d)}
              onAssign={() => setAssigning(d)}
              onEdit={() => setEditing(d)}
              onRelease={() => setReleasing(d)}
              onRemove={() => setDeleting(d)}
              onPause={() => setPausing(d)}
              onResume={() =>
                updateMutation.mutate({
                  id: d._id,
                  payload: { status: "active" },
                  done: `${d.serialNumber} is recording again`,
                })
              }
              busy={updateMutation.isPending}
            />
          ))}
        </ul>
      )}

      {data && devices.length >= 500 && (
        <p className="text-[12px] text-muted-foreground">
          Showing the first 500. Search to narrow the list.
        </p>
      )}

      {showAdd && (
        <AddMachineDialog
          lockedAdminId={lockedAdminId}
          lockedTenantName={lockedTenantName}
          onClose={() => setShowAdd(false)}
          onSaved={invalidate}
        />
      )}

      {assigning && (
        <AssignDialog device={assigning} onClose={() => setAssigning(null)} onSaved={invalidate} />
      )}

      {editing && (
        <EditMachineDialog device={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}

      {pinMapFor && (
        <PinMapDialog
          device={pinMapFor}
          onClose={() => setPinMapFor(null)}
          onClearWarnings={() => clearMutation.mutate(pinMapFor._id)}
          clearing={clearMutation.isPending}
        />
      )}

      <AlertDialog open={!!pausing} onOpenChange={(open) => !open && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause {pausing?.serialNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              The machine keeps working for {pausing ? companyOf(pausing) || "the company" : ""}'s
              employees, but nothing they punch on it is recorded until you resume it. Their
              attendance will show them absent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={updateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pausing)
                  updateMutation.mutate({
                    id: pausing._id,
                    payload: { status: "disabled" },
                    done: `${pausing.serialNumber} paused. Punches on it are not recorded.`,
                  });
              }}
            >
              Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!releasing} onOpenChange={(open) => !open && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {releasing?.serialNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays on the list but belongs to no company, so nothing punched on it is recorded
              until you give it to a company again. Use this when{" "}
              {releasing ? companyOf(releasing) || "a company" : ""} returns the machine, or before
              moving it to another company. Attendance already recorded is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={updateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (releasing)
                  updateMutation.mutate({
                    id: releasing._id,
                    payload: { adminId: null },
                    done: `${releasing.serialNumber} released. It now waits for a company.`,
                  });
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
              This removes the machine from the list. Attendance already recorded from it is not
              changed. If the machine is still switched on and connected, it will come back here on
              its own the next time it checks in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-destructive hover:bg-destructive/90"
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

function RowButton({
  onClick,
  icon: Icon,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  icon: typeof Power;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      className={`h-10 px-3 text-[12px] ${danger ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="mr-1.5 h-4 w-4" />
      {children}
    </Button>
  );
}

function MachineRow({
  device: d,
  showCompany,
  quietAfter,
  onPinMap,
  onAssign,
  onEdit,
  onRelease,
  onRemove,
  onPause,
  onResume,
  busy,
}: {
  device: Device;
  showCompany: boolean;
  quietAfter: number;
  onPinMap: () => void;
  onAssign: () => void;
  onEdit: () => void;
  onRelease: () => void;
  onRemove: () => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const badge = STATUS_STYLES[d.status] || STATUS_STYLES.unassigned;
  const online = isOnline(d);
  const warnings = d.recentUnresolved?.length || 0;
  const quietMinutes = d.lastSeenAt
    ? (Date.now() - new Date(d.lastSeenAt).getTime()) / 60000
    : null;
  const quiet =
    d.status === "active" && !!d.adminId && (quietMinutes == null || quietMinutes > quietAfter);
  const skew = typeof d.clockSkewMinutes === "number" ? d.clockSkewMinutes : null;
  const clockWrong = skew != null && skew > CLOCK_WARN_MINUTES;
  const offset = Number(d.clockOffsetMinutes) || 0;

  return (
    <li className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-[14px] font-semibold">{d.serialNumber}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {[d.label, d.model].filter(Boolean).join(" · ") ||
              (d.autoDiscovered ? "Found automatically" : "No location set")}
          </p>
          {showCompany && (
            <p className="flex items-center gap-1.5 text-[13px]">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {d.adminId ? (
                <span className="min-w-0 truncate">
                  {companyOf(d)}
                  {d.adminId.phone ? (
                    <span className="text-muted-foreground"> · {d.adminId.phone}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">No company yet</span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span
              className="flex items-center gap-1.5"
              title={d.lastSeenAt ? istWhen(d.lastSeenAt) : undefined}
            >
              {online ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              Last contact {relative(d.lastSeenAt)}
            </span>
            <span>
              {d.punchCount || 0} punch{d.punchCount === 1 ? "" : "es"} recorded
              {d.lastPunchAt ? `, last ${relative(d.lastPunchAt)}` : ""}
            </span>
          </div>

          {quiet && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-300">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {d.lastSeenAt
                  ? `No contact for ${span(quietMinutes || 0)}.`
                  : "Has never contacted the server."}{" "}
                Punches on it are not reaching us.
                {d.offlineAlertedAt
                  ? ` The company was warned on ${istWhen(d.offlineAlertedAt)}${
                      (d.offlineAlertCount || 0) > 1
                        ? ` (${d.offlineAlertCount} warnings so far)`
                        : ""
                    }.`
                  : ""}
              </span>
            </p>
          )}
          {(clockWrong || offset !== 0) && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {offset !== 0
                  ? `Punch times from this machine are moved ${offset > 0 ? "forward" : "back"} by ${span(offset)} (set here). `
                  : ""}
                {clockWrong
                  ? `Its clock is about ${span(skew || 0)} off${
                      Math.abs((skew || 0) - 330) <= 3
                        ? ", exactly India's difference from GMT, so its time zone is probably still GMT"
                        : ""
                    }.`
                  : ""}
              </span>
            </p>
          )}
          {warnings > 0 && (
            <button
              onClick={onPinMap}
              className="flex min-h-10 items-center gap-1.5 text-[12px] font-medium text-destructive hover:underline"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {warnings} punch{warnings === 1 ? "" : "es"} not matched to anyone. See why
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-[420px] lg:justify-end">
          {!d.adminId && (
            <RowButton icon={Building2} onClick={onAssign}>
              Give to a company
            </RowButton>
          )}
          {d.adminId && (
            <RowButton icon={ListOrdered} onClick={onPinMap}>
              PIN list
            </RowButton>
          )}
          <RowButton icon={Pencil} onClick={onEdit}>
            Edit
          </RowButton>
          {d.adminId &&
            (d.status === "active" ? (
              <RowButton icon={Power} onClick={onPause} disabled={busy}>
                Pause
              </RowButton>
            ) : (
              <RowButton icon={Power} onClick={onResume} disabled={busy}>
                Resume
              </RowButton>
            ))}
          {d.adminId ? (
            <RowButton icon={Link2Off} onClick={onRelease}>
              Release
            </RowButton>
          ) : (
            <RowButton icon={Trash2} onClick={onRemove} danger>
              Remove
            </RowButton>
          )}
        </div>
      </div>
    </li>
  );
}

/** Searchable list of every company (GET /superadmin/devices/companies, not paged). */
function CompanyPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [filter, setFilter] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["superadmin", "device-companies"],
    queryFn: getDeviceCompanies,
    staleTime: 60_000,
  });
  const companies = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return companies;
    return companies.filter((c: DeviceCompany) =>
      [c.name, c.contact, c.phone].some((x) => x && x.toLowerCase().includes(f)),
    );
  }, [companies, filter]);
  const selected = companies.find((c) => c._id === value);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (isError)
    return (
      <div className="rounded-lg border px-3 py-4 text-center text-[12px]">
        Could not load the companies.{" "}
        <button className="font-semibold underline" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );

  return (
    <div className="space-y-2">
      <Input
        className="h-10 text-[13px]"
        placeholder={`Search ${companies.length} companies by name or phone`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Search companies"
      />
      <ul
        className="max-h-56 divide-y overflow-y-auto rounded-lg border"
        role="listbox"
        aria-label="Companies"
      >
        {shown.length === 0 ? (
          <li className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            No company matches.
          </li>
        ) : (
          shown.map((c) => (
            <li key={c._id}>
              <button
                type="button"
                role="option"
                aria-selected={c._id === value}
                onClick={() => onChange(c._id === value ? "" : c._id)}
                className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted ${
                  c._id === value ? "bg-primary/10 font-semibold" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{c.name}</span>
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {[c.contact, c.phone].filter(Boolean).join(" · ")}
                    {!c.isActive ? " · switched off" : ""}
                  </span>
                </span>
                {c._id === value && (
                  <span className="shrink-0 text-[11px] text-primary">Chosen</span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="text-[12px] text-muted-foreground">
        {selected
          ? `Chosen: ${selected.name}`
          : "No company chosen: the machine will wait on the list."}
      </p>
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
  const sn = serialNumber.trim().toUpperCase();
  const serialBad = sn !== "" && (!SERIAL_RE.test(sn) || sn === "UNKNOWN");

  const mutation = useMutation({
    mutationFn: () =>
      createDevice({
        serialNumber: sn,
        adminId: adminId || null,
        label: label.trim(),
        model: model.trim(),
      }),
    onSuccess: (saved) => {
      toast.success(
        saved.adminId
          ? `${sn} added and recording for ${saved.adminId.companyName || saved.adminId.name}`
          : `${sn} added. It waits for a company.`,
      );
      onSaved();
      onClose();
    },
    onError: (err) => errText(err, "Could not add the machine. Try again."),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Add machine{lockedTenantName ? ` for ${lockedTenantName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-sn" className="text-[13px]">
              Serial number
            </Label>
            <Input
              id="add-sn"
              autoFocus
              className="h-10 font-mono text-[13px]"
              placeholder="EUF7254400194"
              maxLength={40}
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              aria-invalid={serialBad}
            />
            <p
              className={`text-[12px] ${serialBad ? "text-destructive" : "text-muted-foreground"}`}
            >
              {serialBad
                ? "Use only the letters and digits of the serial (3 to 40 characters)."
                : "On the machine: Menu → System Info → Serial Number. Capitals don't matter."}
            </p>
          </div>

          {!lockedAdminId && (
            <div className="space-y-1.5">
              <Label className="text-[13px]">Company (optional)</Label>
              <CompanyPicker value={adminId} onChange={setAdminId} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-label" className="text-[13px]">
                Location
              </Label>
              <Input
                id="add-label"
                className="h-10 text-[13px]"
                placeholder="Reception"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-model" className="text-[13px]">
                Model
              </Label>
              <Input
                id="add-model"
                className="h-10 text-[13px]"
                maxLength={40}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10"
            disabled={!sn || serialBad || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Add machine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  device,
  onClose,
  onSaved,
}: {
  device: Device;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [adminId, setAdminId] = useState("");
  const mutation = useMutation({
    mutationFn: () => updateDevice(device._id, { adminId }),
    onSuccess: (saved) => {
      toast.success(
        `${device.serialNumber} now records for ${saved.adminId?.companyName || saved.adminId?.name || "the company"}`,
      );
      onSaved();
      onClose();
    },
    onError: (err) => errText(err, "Could not give the machine to that company. Try again."),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Give <span className="font-mono">{device.serialNumber}</span> to a company
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          From now on, punches on this machine are recorded for the chosen company's employees,
          matched by their Biometric Device ID. Punches it sent earlier are not added.
        </p>
        <CompanyPicker value={adminId} onChange={setAdminId} />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10"
            disabled={!adminId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Give to this company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMachineDialog({
  device,
  onClose,
  onSaved,
}: {
  device: Device;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(device.label || "");
  const [model, setModel] = useState(device.model || "");
  const [notes, setNotes] = useState(device.notes || "");
  const [offset, setOffset] = useState(String(Number(device.clockOffsetMinutes) || 0));
  const offsetNum = Number(offset);
  const offsetBad =
    offset.trim() === "" || !Number.isInteger(offsetNum) || Math.abs(offsetNum) > 840;

  const mutation = useMutation({
    mutationFn: () =>
      updateDevice(device._id, {
        label: label.trim(),
        model: model.trim(),
        notes: notes.trim(),
        ...(offsetNum !== (Number(device.clockOffsetMinutes) || 0)
          ? { clockOffsetMinutes: offsetNum }
          : {}),
      }),
    onSuccess: () => {
      toast.success(`${device.serialNumber} saved`);
      onSaved();
      onClose();
    },
    onError: (err) => errText(err, "Could not save the machine. Try again."),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Edit <span className="font-mono">{device.serialNumber}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ed-label" className="text-[13px]">
                Location
              </Label>
              <Input
                id="ed-label"
                className="h-10 text-[13px]"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Reception"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-model" className="text-[13px]">
                Model
              </Label>
              <Input
                id="ed-model"
                className="h-10 text-[13px]"
                maxLength={40}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-notes" className="text-[13px]">
              Notes for support
            </Label>
            <Input
              id="ed-notes"
              className="h-10 text-[13px]"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <Label htmlFor="ed-offset" className="text-[13px]">
              Clock correction (minutes)
            </Label>
            <Input
              id="ed-offset"
              className="h-10 text-[13px]"
              inputMode="numeric"
              value={offset}
              onChange={(e) => setOffset(e.target.value.replace(/[^\d-]/g, ""))}
              aria-invalid={offsetBad}
            />
            <p
              className={`text-[12px] ${offsetBad ? "text-destructive" : "text-muted-foreground"}`}
            >
              {offsetBad
                ? "Enter a whole number between -840 and 840. Use 0 for no correction."
                : "Added to every punch time from this machine. Leave at 0 unless its clock cannot be fixed on the machine itself: 330 moves a machine left on GMT to Indian time. It changes attendance and pay, and keeps applying after someone fixes the clock."}
            </p>
            {typeof device.clockSkewMinutes === "number" && (
              <p className="text-[12px] text-muted-foreground">
                Smallest clock gap seen in the last day: {span(device.clockSkewMinutes)}.
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-10"
            disabled={offsetBad || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Save"}
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
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["superadmin", "devices", device._id, "pin-map"],
    queryFn: () => getDevicePinMap(device._id),
  });

  const employees = Array.isArray(data?.employees) ? data!.employees : [];
  const mapped = employees.filter((e) => e.deviceUserId);
  const unmapped = employees.filter((e) => !e.deviceUserId);
  const warnings = device.recentUnresolved || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono">{device.serialNumber}</span>: who each PIN belongs to
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 max-h-[65vh] space-y-4 overflow-y-auto">
          {warnings.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Punches nobody received
                </span>
                <Button
                  variant="outline"
                  className="h-10 text-[12px]"
                  disabled={clearing}
                  onClick={onClearWarnings}
                >
                  {clearing ? "Clearing..." : "Clear"}
                </Button>
              </div>
              <p className="mb-2 text-[12px] text-muted-foreground">
                The machine accepted someone, but no attendance was recorded. Give that employee the
                matching Biometric Device ID to fix it.
              </p>
              <ul className="space-y-1">
                {warnings
                  .slice()
                  .reverse()
                  .map((w, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                      <span className="font-mono font-medium">PIN {w.pin}</span>
                      <span className="text-muted-foreground">
                        {UNRESOLVED_REASONS[w.reason || ""] || w.reason} · {relative(w.at)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {!device.adminId ? (
            <p className="text-[12px] text-muted-foreground">
              This machine has no company yet, so no PIN belongs to anyone.
            </p>
          ) : isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : isError ? (
            <p className="text-[12px]">
              Could not load the PIN list.{" "}
              <button className="font-semibold underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                  Has a Biometric Device ID: {mapped.length}
                </p>
                {mapped.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    No employee has a Biometric Device ID yet, so nothing punched on this machine is
                    recorded.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {mapped.map((e) => (
                      <li key={e._id} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-14 shrink-0 font-mono text-[12px] font-semibold tabular-nums">
                          {e.deviceUserId}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
                        {e.status === "inactive" && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            inactive
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {unmapped.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                    No Biometric Device ID: {unmapped.length}
                  </p>
                  <p className="mb-1.5 text-[12px] text-muted-foreground">
                    These employees can't punch on any machine. They can still use the app.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unmapped.map((e) => (
                      <span key={e._id} className="rounded-md bg-muted px-2 py-0.5 text-[12px]">
                        {e.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The per-company wrapper opened from the Customers table. */
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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4" />
            Biometric machines: {tenantName || "Company"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <MachinesManager lockedAdminId={adminId} lockedTenantName={tenantName} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
