import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Trash2, MapPin, Search, Users, Globe, Crosshair, Check, Network, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { GeofenceMapPreview } from "@/components/branches/geofence-map-preview";
import { OrgLoadError } from "@/components/branches/org-load-error";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormInput } from "@/components/shared/form-input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBranchService, type Branch as BackendBranch } from "@/services/branch-service";
import { requestErrorMessage } from "@/services/request-error";
import { acquirePosition, openLocationSettings, getIOSUnblockInstructions, isNativeApp } from "@/lib/geolocation";

import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { Calendar } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

/**
 * Radius presets, in metres.
 *
 * Nothing below 100 m: that is roughly the error a phone reports indoors or on
 * a wifi-derived fix, so a tighter fence rejects people who are genuinely at
 * their desk. Custom still allows it, deliberately visible as a choice.
 */
const RADIUS_PRESETS = [
  { value: 100, label: "100 m" },
  { value: 250, label: "250 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
];

/** Mirrors MAX_RADIUS_M / MIN_RADIUS_M in backend branch_controller.js. */
const MAX_RADIUS_M = 100000;
const MIN_RADIUS_M = 50;
const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 300;

const formatRadius = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`);

/** A stored coordinate for display; older or API-created branches can lack one. */
const formatCoord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(4) : null);

/**
 * Text, not numbers, while the admin is typing. A number field bound to
 * `parseFloat(value) || 0` turned an emptied box straight back into "0", so a
 * coordinate could not be cleared and retyped, and "missing" was
 * indistinguishable from a real 0 at validation time.
 */
type BranchForm = {
  branchName: string;
  branchLocation: string;
  city: string;
  latitude: string;
  longitude: string;
  /** "" = use the company default radius. */
  radius: string;
  geoFenceEnabled: boolean;
};
type FormErrors = Partial<Record<keyof BranchForm, string>>;

const EMPTY_FORM: BranchForm = {
  branchName: "",
  branchLocation: "",
  city: "",
  latitude: "",
  longitude: "",
  radius: "",
  geoFenceEnabled: true,
};

const parseNum = (s: string) => (s.trim() === "" ? NaN : Number(s.trim()));

/**
 * The same rules the server enforces (branch_controller readBranchInput),
 * checked here first so the admin sees them beside the field, not as a toast.
 */
function validateBranch(form: BranchForm): FormErrors {
  const errors: FormErrors = {};
  const name = form.branchName.trim();
  if (!name) errors.branchName = "Enter a branch name.";
  else if (name.length > MAX_NAME_LENGTH) errors.branchName = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  if (!form.city.trim()) errors.city = "Enter the city.";
  else if (form.city.trim().length > MAX_NAME_LENGTH) errors.city = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  const address = form.branchLocation.trim();
  if (!address) errors.branchLocation = "Enter the branch address.";
  else if (address.length > MAX_ADDRESS_LENGTH) errors.branchLocation = `Keep it under ${MAX_ADDRESS_LENGTH} characters.`;

  const lat = parseNum(form.latitude);
  const lng = parseNum(form.longitude);
  if (form.latitude.trim() === "") errors.latitude = "Enter the latitude, or use Auto-detect.";
  else if (!Number.isFinite(lat)) errors.latitude = "Must be a number, like 22.3039.";
  else if (lat < -90 || lat > 90) errors.latitude = "Must be between -90 and 90.";
  if (form.longitude.trim() === "") errors.longitude = "Enter the longitude, or use Auto-detect.";
  else if (!Number.isFinite(lng)) errors.longitude = "Must be a number, like 70.8022.";
  else if (lng < -180 || lng > 180) errors.longitude = "Must be between -180 and 180.";
  // 0,0 is in the Atlantic: what an untouched form sends, never an office.
  if (!errors.latitude && !errors.longitude && lat === 0 && lng === 0) {
    errors.latitude = "0, 0 is not a real office location. Use Auto-detect at the branch, or copy it from Google Maps.";
  }

  if (form.radius.trim() !== "") {
    const r = parseNum(form.radius);
    if (!Number.isFinite(r) || r < 0) errors.radius = "Enter the radius in metres, like 150.";
    else if (r > 0 && r < MIN_RADIUS_M) errors.radius = `At least ${MIN_RADIUS_M} m. Phone location is often 20–50 m off indoors, so a smaller fence refuses people inside the office.`;
    else if (r > MAX_RADIUS_M) errors.radius = `At most ${formatRadius(MAX_RADIUS_M)}. To accept punches from anywhere, switch Geo-Fence off instead.`;
  }
  return errors;
}

function BranchesPage() {
  const navigate = useNavigate();
  const [hasMounted, setHasMounted] = useState(false);
  const {
    branches: list, isLoading, error: loadError, refetch, isRefetching,
    createBranch, updateBranch, deleteBranch, isCreating, isUpdating, isDeleting,
    usage,
  } = useBranchService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendBranch | null>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [customRadius, setCustomRadius] = useState(false);
  // The id, not a copy of the row: when the server refuses a delete (409,
  // people still assigned) the list refetches, and the dialog must show the
  // fresh count rather than the snapshot taken at click time.
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("branches", "create");
  // At the plan's cap, Add is disabled with the reason on screen rather than
  // letting the admin fill in the whole form and then be refused.
  const atLimit = usage?.limit != null && usage.used >= usage.limit;
  const canEdit = can("branches", "edit");
  const canDelete = can("branches", "delete");
  // The multi-branch switch writes Settings (PUT /settings), which the server
  // guards with the SETTINGS edit right -- a sub-admin allowed to edit
  // branches but not settings was shown a live switch that always failed.
  const canEditSettings = can("settings", "edit");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);
  const [fetchingLoc, setFetchingLoc] = useState(false);

  // Multi-branch feature toggle (persisted in Settings)
  const [allowMultipleBranches, setAllowMultipleBranches] = useState(false);
  const [savingMulti, setSavingMulti] = useState(false);
  // Company-wide location rules, which decide what a branch fence actually
  // does: with requireLocation off nothing is enforced at all, and a branch
  // with no radius of its own uses officeRadius rather than a fixed 3 km.
  const [companyRules, setCompanyRules] = useState<{ requireLocation: boolean; officeRadius: number } | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.get("/settings")
      .then(({ data }) => {
        if (!active) return;
        setAllowMultipleBranches(!!data?.branchSettings?.allowMultipleBranches);
        setCompanyRules({
          // Schema default is true; only an explicit false switches it off.
          requireLocation: data?.attendance?.requireLocation !== false,
          officeRadius: Number(data?.attendance?.officeRadius) > 0 ? Number(data.attendance.officeRadius) : 3000,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const defaultRadius = companyRules?.officeRadius || 3000;

  const toggleMultipleBranches = async (checked: boolean) => {
    setSavingMulti(true);
    setAllowMultipleBranches(checked); // optimistic
    try {
      await apiClient.put("/settings", { branchSettings: { allowMultipleBranches: checked } });
      toast.success(checked ? "Employees can now be assigned to multiple branches" : "Multi-branch assignment disabled");
    } catch (err) {
      setAllowMultipleBranches(!checked); // revert
      const message = requestErrorMessage(err, "Could not save this setting. Please try again.");
      if (message) toast.error(message);
    } finally {
      setSavingMulti(false);
    }
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const fetchLocation = async () => {
    setFetchingLoc(true);
    const res = await acquirePosition({ silent: false });
    setFetchingLoc(false);
    if (res.ok) {
      setForm((prev) => ({
        ...prev,
        latitude: res.coords.lat.toFixed(6),
        longitude: res.coords.lng.toFixed(6),
      }));
      setErrors((prev) => ({ ...prev, latitude: undefined, longitude: undefined }));
      toast.success("High-precision location fetched");
    } else {
      if (res.reason === "denied") {
        toast.error("Location Permission Denied", {
          description: isNativeApp()
            ? "Allow location access for this app in Settings, then try auto-detect again."
            : getIOSUnblockInstructions(),
          duration: 10000,
          action: isNativeApp()
            ? { label: "Open Settings", onClick: () => { void openLocationSettings("denied"); } }
            : undefined,
        });
      } else {
        toast.error("Failed to fetch location: " + res.message);
      }
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = list.filter((b) =>
    (b.branchName || "").toLowerCase().includes(query) ||
    (b.branchLocation || "").toLowerCase().includes(query) ||
    (b.city || "").toLowerCase().includes(query),
  );

  const guessCity = (b: BackendBranch): string => {
    if (b.city) return b.city;
    const name = (b.branchName || "").replace(/\b(branch|office|hq|headquarters|hub|center|centre)\b/gi, "").trim();
    if (name && !/\d/.test(name)) return name;
    const parts = (b.branchLocation || "").split(",").map(p => p.trim()).filter(p => p && !/^\d/.test(p) && p.length < 30);
    return parts[0] || "";
  };

  const totalEmployees = list.reduce((s, b) => s + (b.employees || 0), 0);
  const uniqueCities = new Set(list.map((b) => guessCity(b).toLowerCase().trim())).size;

  const setField = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setCustomRadius(false);
    setOpen(true);
  };

  const openEdit = (b: BackendBranch) => {
    setEditing(b);
    const radius = b.radius && b.radius > 0 ? String(b.radius) : "";
    setForm({
      branchName: (b.branchName || "").trim(),
      branchLocation: (b.branchLocation || "").trim(),
      city: guessCity(b),
      latitude: typeof b.latitude === "number" ? String(b.latitude) : "",
      longitude: typeof b.longitude === "number" ? String(b.longitude) : "",
      radius,
      // Existing branches predate the flag and read back undefined; they were
      // always fenced, so absent must mean on.
      geoFenceEnabled: b.geoFenceEnabled !== false,
    });
    setErrors({});
    setCustomRadius(radius !== "" && !RADIUS_PRESETS.some((p) => String(p.value) === radius));
    setOpen(true);
  };

  const saving = isCreating || isUpdating;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = validateBranch(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // The dialog scrolls; the first problem may be out of sight.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#branch-form [aria-invalid=true]")?.focus());
      return;
    }

    const radius = form.radius.trim() === "" ? null : Math.round(Number(form.radius));
    const payload = {
      branchName: form.branchName.trim(),
      branchLocation: form.branchLocation.trim(),
      city: form.city.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      // 0 and blank both mean "company default" to the punch check.
      radius: radius && radius > 0 ? radius : null,
      geoFenceEnabled: form.geoFenceEnabled,
    };

    try {
      if (editing) {
        await updateBranch({ id: editing._id, ...payload });
      } else {
        await createBranch(payload);
      }
      setOpen(false);
    } catch (err) {
      // Error toasted by the hook; the dialog stays open with what was typed.
    }
  };

  const remove = async () => {
    if (!deleteId || isDeleting) return;
    try {
      await deleteBranch(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error toasted by the hook
    }
  };

  const showEmployees = (b: BackendBranch) => navigate({ to: "/employees", search: { branchId: b._id } });

  /** One short line describing what the fence does for this branch. */
  const fenceLabel = (b: BackendBranch) => {
    if (b.geoFenceEnabled === false) return "Fence off";
    const r = b.radius && b.radius > 0 ? b.radius : defaultRadius;
    return `Fence ${formatRadius(r)}${b.radius && b.radius > 0 ? "" : " (default)"}`;
  };

  const header = (
    <PageHeader
      title="Branches"
      description="All office locations in one place."
      actions={
        // Hidden only while the error panel replaces the list: a failed
        // background refetch keeps the cached rows on screen, and Add with them.
        canCreate && !(loadError && list.length === 0) ? (
          <div className="flex items-center gap-3">
            {usage?.limit != null && (
              <span className={`text-xs font-semibold ${atLimit ? "text-amber-600" : "text-muted-foreground"}`}>
                {usage.used} of {usage.limit} used on your plan
              </span>
            )}
            <ActionButton
              variant="add"
              showLabel
              label="Add Branch"
              onClick={openAdd}
              disabled={atLimit}
              title={atLimit ? "Your plan's branch limit is reached. Ask your provider to upgrade the plan to add more." : undefined}
            />
          </div>
        ) : null
      }
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branches" description="All office locations in one place." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={8} />
      </div>
    );
  }

  // A failed load must not render as an empty company ("No branches found",
  // 0 staff) with an Add button inviting the admin to recreate everything.
  if (loadError && list.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <OrgLoadError what="branches" error={loadError} onRetry={() => void refetch()} retrying={isRefetching} />
      </div>
    );
  }

  const radiusValue = parseNum(form.radius);
  const effectiveRadius = Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : defaultRadius;
  const usingDefaultRadius = form.radius.trim() === "" || !(radiusValue > 0);
  const previewLat = parseNum(form.latitude);
  const previewLng = parseNum(form.longitude);
  const deleteTarget = deleteId ? list.find((b) => b._id === deleteId) ?? null : null;
  const deleteActive = deleteTarget?.activeEmployees ?? 0;
  const deleteTotal = deleteTarget?.employees ?? 0;

  return (
    <div className="space-y-6">
      {header}

      {/* Summary Stats */}
      {/* Three across on every width. Stacked they ran to about 390px before
          the branch list even started; in one row that is roughly 120px. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Total Branches" value={list.length} icon={MapPin} accent="primary" delay={0} />
        <StatCard label="Total Staff" value={totalEmployees} icon={Users} accent="success" delay={0.05} />
        <StatCard label="Cities Covered" value={uniqueCities} icon={Globe} accent="info" delay={0.1} />
      </div>

      {/* Multi-branch feature toggle */}
      <Card className="p-4 sm:p-5 border border-border/60 bg-card rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Network className="h-5 w-5" />
            </div>
            <div>
              {/* A label, so the text is part of the tap target -- the
                  switch alone is 36x20 px on a phone. */}
              <label htmlFor="multi-branch-switch" className="text-[14px] font-bold text-foreground cursor-pointer">
                Multiple branches per employee
              </label>
              <p className="text-[12px] text-muted-foreground mt-0.5 max-w-xl">
                Turn this on if some employees work across more than one branch. When enabled, you can assign multiple branches to an employee on their profile.
              </p>
              {!canEditSettings && (
                <p className="text-[11px] text-muted-foreground/80 mt-1">Changing this needs the Settings edit permission.</p>
              )}
            </div>
          </div>
          <Switch
            id="multi-branch-switch"
            checked={allowMultipleBranches}
            onCheckedChange={toggleMultipleBranches}
            disabled={savingMulti || !canEditSettings}
          />
        </div>
      </Card>

      {/* Company-wide location check off: every fence below is inert. Said
          here because the branch cards and dialog otherwise promise a fence
          that nothing enforces. */}
      {companyRules && !companyRules.requireLocation && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-[13px] leading-relaxed text-foreground">
            <span className="font-bold">Location check is off for the whole company.</span>{" "}
            No punch is refused for being away from a branch until it is switched on in Settings → Attendance.
          </p>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
        </div>

        <FormInput
          placeholder="Search branches..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          containerClassName="w-full md:w-auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid / List View */}
      {filtered.length > 0 && (
      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((b, i) => (
              <GridCard
                key={b._id}
                title={b.branchName}
                subtitle={b.branchLocation}
                icon={<MapPin className="h-5 w-5 text-primary" />}
                delay={Math.min(i, 12) * 0.04}
                onEdit={canEdit ? () => openEdit(b) : undefined}
                onDelete={canDelete ? () => setDeleteId(b._id) : undefined}
                metaLeft={{ icon: Users, label: `${b.employees || 0} staff`, onClick: () => showEmployees(b) }}
                metaRight={{ icon: Calendar, label: b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "" }}
              >
                {/* What the fence does here. This used to be a decorative
                    40%-full bar that meant nothing; the radius and whether
                    the fence is on are what an admin actually checks. */}
                <div className="mt-3 p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium">
                    <span className="text-muted-foreground">Coordinates</span>
                    <span className="text-foreground">
                      {formatCoord(b.latitude) && formatCoord(b.longitude) ? `${formatCoord(b.latitude)}, ${formatCoord(b.longitude)}` : "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium">
                    <span className="text-muted-foreground">Geo-fence</span>
                    <span className={cn("inline-flex items-center gap-1 font-bold", b.geoFenceEnabled === false ? "text-muted-foreground" : "text-success")}>
                      {b.geoFenceEnabled === false ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      {fenceLabel(b)}
                    </span>
                  </div>
                </div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Branch", "Location", "Coordinates & fence", "Staff", "Created At", "Actions"]}
            >
              {filtered.map((b) => (
                <DataTableRow key={b._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-accent/15 text-accent-foreground grid place-items-center shrink-0">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span className="text-[14px] font-medium max-w-[220px] truncate" title={b.branchName}>{b.branchName}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[14px] text-muted-foreground max-w-[200px] truncate" title={b.branchLocation}>{b.branchLocation}</DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground whitespace-nowrap">
                    <div>{formatCoord(b.latitude) && formatCoord(b.longitude) ? `${formatCoord(b.latitude)}, ${formatCoord(b.longitude)}` : "Not set"}</div>
                    <div className={cn("text-[11px] font-bold", b.geoFenceEnabled === false ? "text-muted-foreground/70" : "text-success")}>{fenceLabel(b)}</div>
                  </DataTableCell>
                  <DataTableCell>
                    <button
                      type="button"
                      onClick={() => showEmployees(b)}
                      className="min-h-10 inline-flex items-center cursor-pointer"
                      aria-label={`Show the ${b.employees || 0} employees of ${b.branchName}`}
                    >
                      <Badge variant="outline" className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20 hover:bg-primary/15 transition-colors">
                        {b.employees || 0} Staff
                      </Badge>
                    </button>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "—"}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Branch"
                          className="h-10 w-10 sm:h-9 sm:w-9"
                          aria-label={`Edit ${b.branchName}`}
                          onClick={() => openEdit(b)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Branch"
                          className="h-10 w-10 sm:h-9 sm:w-9"
                          aria-label={`Delete ${b.branchName}`}
                          onClick={() => setDeleteId(b._id)}
                        />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          {list.length === 0 ? (
            <>
              <p className="text-[14px] text-muted-foreground">No branches yet</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">
                Add your first office. Employees are assigned to a branch, and punch-in is checked against its location.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] text-muted-foreground">No branches match “{search.trim()}”</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">Try a different name, address or city.</p>
            </>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        {/* max-h + flex-col so the form scrolls internally instead of
            overflowing the viewport -- this dialog grew past a single
            screen's height once the geo-fence toggle, radius presets and map
            preview were added, and with no cap it was being cropped top and
            bottom with nothing scrollable. The gradient bar and header stay
            fixed; only the middle fills the remaining height and scrolls;
            the footer stays pinned so Discard/Save are always reachable. */}
        <DialogContent className="max-w-2xl max-h-[85vh] rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-xl flex flex-col">
          <div className="h-2 w-full shrink-0 bg-linear-to-r from-primary via-primary/50 to-primary/80" />
          <div className="p-5 pb-0 shrink-0">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Branch" : "Add Branch"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Name, address, and where staff may punch in.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          {/* Scrollable middle. id lets the footer's submit button (now
              outside the <form> so it can stay pinned) still trigger this
              form via the HTML `form` attribute. noValidate: the browser's
              own "Please fill in this field" bubble appeared on whichever
              field it liked, in the browser's language; the checks below
              put a plain sentence under every field that needs one. */}
          <form id="branch-form" noValidate onSubmit={submit} className="flex-1 min-h-0 overflow-y-auto px-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="branch-name" className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Branch Name</label>
                  <FormInput
                    id="branch-name"
                    placeholder="e.g. Gurugram"
                    value={form.branchName}
                    onChange={(e) => setField("branchName", e.target.value)}
                    maxLength={MAX_NAME_LENGTH}
                    error={errors.branchName}
                    aria-invalid={!!errors.branchName}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="branch-city" className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">City</label>
                  <FormInput
                    id="branch-city"
                    placeholder="e.g. Rajkot"
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    maxLength={MAX_NAME_LENGTH}
                    error={errors.city}
                    aria-invalid={!!errors.city}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="branch-address" className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Branch Location (Full Address)</label>
                <FormInput
                  id="branch-address"
                  placeholder="e.g. Sector 47, Gurugram"
                  value={form.branchLocation}
                  onChange={(e) => setField("branchLocation", e.target.value)}
                  maxLength={MAX_ADDRESS_LENGTH}
                  error={errors.branchLocation}
                  aria-invalid={!!errors.branchLocation}
                  className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                />
              </div>

              {/* Geo-fence switch. Per branch, because "one fenced office and
                  one warehouse whose staff roam" is not expressible with a
                  single tenant-wide toggle. Turning it off here only ever
                  narrows enforcement -- the tenant-level requireLocation still
                  has to be on for any fence to apply at all. */}
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center">
                    <ShieldCheck className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="branch-geofence" className="text-[13px] font-black tracking-tight cursor-pointer">Geo-Fence Attendance</label>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {form.geoFenceEnabled
                        ? "Employees must be inside the radius to punch in."
                        : "Punches from anywhere are accepted for this branch."}
                    </p>
                  </div>
                </div>
                <Switch
                  id="branch-geofence"
                  checked={form.geoFenceEnabled}
                  onCheckedChange={(v) => setField("geoFenceEnabled", v)}
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-4 rounded-2xl border border-border/40">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Geographic Coordinates</span>
                  <ActionButton
                    variant="refresh"
                    icon={Crosshair}
                    showLabel
                    label={fetchingLoc ? "Fetching..." : "Auto-detect"}
                    className="h-10 sm:h-8 text-[11px] bg-primary/10 text-primary hover:bg-primary hover:text-white border-none gap-1.5 px-3 rounded-lg"
                    onClick={fetchLocation}
                    loading={fetchingLoc}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="branch-lat" className="text-[10px] font-bold uppercase text-muted-foreground/70 ml-1">Latitude</label>
                    <FormInput
                      id="branch-lat"
                      inputMode="decimal"
                      placeholder="22.3039"
                      value={form.latitude}
                      onChange={(e) => setField("latitude", e.target.value)}
                      error={errors.latitude}
                      aria-invalid={!!errors.latitude}
                      className="h-10 text-[13px] rounded-xl bg-card/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="branch-lng" className="text-[10px] font-bold uppercase text-muted-foreground/70 ml-1">Longitude</label>
                    <FormInput
                      id="branch-lng"
                      inputMode="decimal"
                      placeholder="70.8022"
                      value={form.longitude}
                      onChange={(e) => setField("longitude", e.target.value)}
                      error={errors.longitude}
                      aria-invalid={!!errors.longitude}
                      className="h-10 text-[13px] rounded-xl bg-card/50"
                    />
                  </div>
                </div>

                {/* Preset radii. A free number box makes every admin invent a
                    value, and the ones they invent (50 m, 25 m) sit inside the
                    GPS error, so honest punches get refused. "Company default"
                    is its own chip: an unset radius used to show as "Custom"
                    selected over an empty box. */}
                <div className="space-y-1.5 pt-3">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground/70 ml-1">Allowed Radius</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const chip = (active: boolean) => cn(
                        "h-10 sm:h-8 rounded-full px-3.5 text-[11px] font-black transition-colors border",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25"
                          : "bg-card/60 text-muted-foreground border-border/50 hover:bg-muted",
                      );
                      const isPreset = RADIUS_PRESETS.some((r) => String(r.value) === form.radius.trim());
                      return (
                        <>
                          <button
                            type="button"
                            aria-pressed={!customRadius && usingDefaultRadius}
                            onClick={() => { setCustomRadius(false); setField("radius", ""); }}
                            className={chip(!customRadius && usingDefaultRadius)}
                          >
                            Default · {formatRadius(defaultRadius)}
                          </button>
                          {RADIUS_PRESETS.map((preset) => {
                            const active = !customRadius && form.radius.trim() === String(preset.value);
                            return (
                              <button
                                key={preset.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => { setCustomRadius(false); setField("radius", String(preset.value)); }}
                                className={chip(active)}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            aria-pressed={customRadius || (!usingDefaultRadius && !isPreset)}
                            onClick={() => setCustomRadius(true)}
                            className={chip(customRadius || (!usingDefaultRadius && !isPreset))}
                          >
                            Custom
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  {(customRadius || errors.radius) && (
                    <FormInput
                      id="branch-radius"
                      inputMode="numeric"
                      placeholder={`Radius in metres (blank = company default, ${formatRadius(defaultRadius)})`}
                      value={form.radius}
                      onChange={(e) => setField("radius", e.target.value)}
                      error={errors.radius}
                      aria-invalid={!!errors.radius}
                      aria-label="Radius in metres"
                      className="h-10 text-[13px] rounded-xl bg-card/50 mt-1.5"
                    />
                  )}

                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2 mt-2",
                      form.geoFenceEnabled
                        ? "border-success/25 bg-success/10"
                        : "border-border/50 bg-muted/40",
                    )}
                  >
                    <ShieldCheck
                      className={cn(
                        "h-3.5 w-3.5 mt-0.5 shrink-0",
                        form.geoFenceEnabled ? "text-success" : "text-muted-foreground/50",
                      )}
                    />
                    <p className="text-[11px] font-semibold leading-relaxed">
                      {form.geoFenceEnabled ? (
                        <>
                          Employees must be within{" "}
                          <span className="font-black">{formatRadius(effectiveRadius)}</span> of this
                          branch to punch in{usingDefaultRadius ? " (the company default radius)" : ""}.
                          {companyRules && !companyRules.requireLocation && (
                            <span className="block text-amber-700 mt-1">
                              Not enforced yet: the company-wide location check is off in Settings → Attendance.
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Geo-fencing is off for this branch — the radius is still recorded, and distances
                          are still measured for reporting, but no punch is refused.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <GeofenceMapPreview
                lat={Number.isFinite(previewLat) ? previewLat : 0}
                lng={Number.isFinite(previewLng) ? previewLng : 0}
                radius={effectiveRadius}
                enabled={form.geoFenceEnabled}
              />
              {/* Bottom padding so the last field/map isn't flush against the
                  scroll edge, now that the footer lives outside this pane. */}
              <div className="h-2" />
          </form>
          <DialogFooter className="shrink-0 gap-2 p-5 pt-4 border-t border-border/40">
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setOpen(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
            {/* disabled + loading while the request is in flight: a double
                click used to POST twice and create the branch twice. */}
            <ActionButton
              type="submit"
              form="branch-form"
              variant="add"
              showLabel
              label={saving ? "Saving..." : editing ? "Save Changes" : "Create Branch"}
              icon={editing ? Check : Plus}
              loading={saving}
              disabled={saving}
              className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">
              {deleteActive > 0 ? `Move ${deleteActive === 1 ? "1 employee" : `${deleteActive} employees`} first` : `Delete ${deleteTarget?.branchName?.trim() || "branch"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-relaxed">
              {deleteActive > 0 ? (
                <>
                  {deleteActive === 1 ? "1 active employee is" : `${deleteActive} active employees are`} still assigned to this branch.
                  An employee with no branch cannot punch in while the location check is on, so move them to another branch before deleting this one.
                </>
              ) : (
                <>
                  This cannot be undone.
                  {deleteTotal > 0 && ` ${deleteTotal === 1 ? "1 former employee" : `${deleteTotal} former employees`} will be unassigned from it.`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={isDeleting}>{deleteActive > 0 ? "Close" : "Cancel"}</AlertDialogCancel>
            {deleteActive > 0 ? (
              <Button
                type="button"
                className="rounded-xl h-10 font-bold"
                onClick={() => { const b = deleteTarget; setDeleteId(null); if (b) showEmployees(b); }}
              >
                <Users className="h-4 w-4" /> Show these employees
              </Button>
            ) : (
              <ActionButton
                variant="destructive"
                showLabel
                label={isDeleting ? "Deleting..." : "Delete Branch"}
                loading={isDeleting}
                disabled={isDeleting}
                onClick={remove}
              />
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
