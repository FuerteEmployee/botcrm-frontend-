import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Trash2, Building2, Search, Users, Calendar, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { FormInput } from "@/components/shared/form-input";
import { OrgLoadError } from "@/components/branches/org-load-error";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDepartmentService, type Department as BackendDept } from "@/services/department-service";

import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/departments")({
  component: DepartmentsPage,
});

/** Mirrors the server (department_controller readDepartmentInput). */
const MAX_NAME_LENGTH = 100;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_COLOR = "#6366f1";

type DeptForm = { name: string; colorCode: string; trackingEnabled: boolean; autoPunchOutEnabled: boolean; isFieldStaff: boolean | null };

// A hint for NEW departments only: pre-set the Field staff switch when the name
// suggests field work (same words the server falls back to). What is saved is
// always the switch's explicit value.
const FIELD_WORDS = ["field", "sales", "marketing", "delivery", "driver", "technician", "site"];
const looksLikeFieldWork = (name: string) => FIELD_WORDS.some((w) => name.toLowerCase().includes(w));
type FormErrors = Partial<Record<"name" | "colorCode", string>>;

const EMPTY_FORM: DeptForm = { name: "", colorCode: DEFAULT_COLOR, trackingEnabled: false, autoPunchOutEnabled: false, isFieldStaff: null };

function validateDept(form: DeptForm): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter a department name.";
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  if (!HEX_COLOR.test(form.colorCode.trim())) errors.colorCode = "Use a hex colour like #6366F1, or pick one from the swatch.";
  return errors;
}

/** A colour the swatch and cards can actually paint; stored junk falls back. */
const safeColor = (c?: string) => (c && HEX_COLOR.test(c.trim()) ? c.trim() : DEFAULT_COLOR);

function DepartmentsPage() {
  const navigate = useNavigate();
  const [hasMounted, setHasMounted] = useState(false);
  const {
    departments: list, isLoading, error: loadError, refetch, isRefetching,
    createDepartment, updateDepartment, deleteDepartment, isCreating, isUpdating, isDeleting,
    usage,
  } = useDepartmentService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendDept | null>(null);
  const [form, setForm] = useState<DeptForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  // The id, not a copy of the row, so a refused delete (409) shows the
  // refetched count.
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("departments", "create");
  // At the plan's cap, Add is disabled with the reason on screen rather than
  // letting the admin fill in the whole form and then be refused.
  const atLimit = usage?.limit != null && usage.used >= usage.limit;
  const canEdit = can("departments", "edit");
  const canDelete = can("departments", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const query = search.trim().toLowerCase();
  const filtered = list.filter((d) => (d.name || "").toLowerCase().includes(query));

  const totalEmployees = list.reduce((s, d) => s + (d.employees || 0), 0);

  const setField = <K extends keyof DeptForm>(key: K, value: DeptForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in errors) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setOpen(true); };
  const openEdit = (d: BackendDept) => {
    setEditing(d);
    setForm({ name: (d.name || "").trim(), colorCode: safeColor(d.colorCode), trackingEnabled: !!d.trackingEnabled, autoPunchOutEnabled: !!d.autoPunchOutEnabled, isFieldStaff: d.isFieldStaff ?? null });
    setErrors({});
    setOpen(true);
  };

  const saving = isCreating || isUpdating;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = validateDept(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Field staff is always saved as an explicit choice. For a department not
    // set yet that pins what its name currently means, so a later rename can
    // no longer silently add or remove the auto punch-out exemption.
    const payload = { ...form, name: form.name.trim(), colorCode: form.colorCode.trim(), isFieldStaff: fieldStaffChecked };
    try {
      if (editing) {
        await updateDepartment({ id: editing._id, ...payload });
      } else {
        await createDepartment(payload);
      }
      setOpen(false);
    } catch (err) {
      // Error toasted by the hook; the dialog keeps what was typed.
    }
  };

  const remove = async () => {
    if (!deleteId || isDeleting) return;
    try {
      await deleteDepartment(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error toasted by the hook
    }
  };

  const showEmployees = (d: BackendDept) => navigate({ to: "/employees", search: { departmentId: d._id } });

  /** Location-policy chips; these switches were invisible outside the dialog. */
  const policyBadges = (d: BackendDept) => (
    <div className="flex flex-wrap gap-1.5">
      {d.trackingEnabled ? (
        <Badge variant="outline" className="text-[10px] font-bold border-primary/20 bg-primary/5 text-primary">Tracked on duty</Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">Not tracked</Badge>
      )}
      {d.trackingEnabled && d.autoPunchOutEnabled && (
        <Badge variant="outline" className="text-[10px] font-bold border-amber-500/25 bg-amber-500/10 text-amber-700">Auto punch-out</Badge>
      )}
      {d.fieldRole && (
        <Badge variant="outline" className="text-[10px] font-bold border-success/25 bg-success/10 text-success" title={d.isFieldStaff == null ? "Treated as field staff because of the department name" : "Marked as field staff"}>Field staff</Badge>
      )}
    </div>
  );

  const header = (
    <PageHeader
      title="Departments"
      description="Organise teams and manage department branding colors."
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
              label="Add Department"
              onClick={openAdd}
              disabled={atLimit}
              title={atLimit ? "Your plan's department limit is reached. Ask your provider to upgrade the plan to add more." : undefined}
            />
          </div>
        ) : null
      }
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Departments" description="Organise teams and manage department branding colors." />
        <SkeletonLoader type="stats" count={2} />
        <SkeletonLoader type="card" count={6} />
      </div>
    );
  }

  // A failed load is not an empty company.
  if (loadError && list.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <OrgLoadError what="departments" error={loadError} onRetry={() => void refetch()} retrying={isRefetching} />
      </div>
    );
  }

  const deleteTarget = deleteId ? list.find((d) => d._id === deleteId) ?? null : null;
  const deleteActive = deleteTarget?.activeEmployees ?? 0;
  const deleteTotal = deleteTarget?.employees ?? 0;
  // What the switch shows: the explicit choice, else the current name-based
  // behaviour (existing department) or the name hint (new department).
  const fieldStaffChecked = form.isFieldStaff ?? (editing ? !!editing.fieldRole : looksLikeFieldWork(form.name));

  return (
    <div className="space-y-6">
      {header}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard label="Total Departments" value={list.length} icon={Building2} accent="primary" delay={0} />
        <StatCard label="Total Employees" value={totalEmployees} icon={Users} accent="success" delay={0.05} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          <ViewToggle
            view={view}
            onViewChange={updateDefaultLayout}
          />
        </div>

        <FormInput
          placeholder="Search departments..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          containerClassName="w-full md:w-auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid View */}
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
            {filtered.map((d, i) => (
              <GridCard
                key={d._id}
                title={d.name}
                subtitle={`${d.employees || 0} Employees`}
                icon={<Building2 className="h-5 w-5 text-white" />}
                iconBgColor={safeColor(d.colorCode)}
                delay={Math.min(i, 12) * 0.04}
                onEdit={canEdit ? () => openEdit(d) : undefined}
                onDelete={canDelete ? () => setDeleteId(d._id) : undefined}
                metaLeft={{
                  icon: Users,
                  label: `${d.employees || 0} staff`,
                  onClick: () => showEmployees(d),
                }}
                metaRight={{ icon: Calendar, label: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "" }}
              >
                <div className="mb-3">{policyBadges(d)}</div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Color", "Department Name", "Location policy", "Employee Count", "Created", "Actions"]}
            >
              {filtered.map((d) => (
                <DataTableRow key={d._id}>
                  <DataTableCell isFirst>
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: safeColor(d.colorCode) }}
                    >
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <span className="text-[14px] font-medium max-w-[240px] truncate inline-block align-middle" title={d.name}>{d.name}</span>
                  </DataTableCell>
                  <DataTableCell>{policyBadges(d)}</DataTableCell>
                  <DataTableCell>
                    {/* min-h/min-w: the bare badge was a 22x22 px tap target. */}
                    <button
                      type="button"
                      onClick={() => showEmployees(d)}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center cursor-pointer"
                      aria-label={`Show the ${d.employees || 0} employees of ${d.name}`}
                    >
                      <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5 hover:bg-primary/15 hover:text-primary transition-colors">{d.employees || 0}</Badge>
                    </button>
                  </DataTableCell>
                  <DataTableCell className="text-[14px] text-muted-foreground whitespace-nowrap">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ') : "—"}
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Department"
                          className="h-10 w-10 sm:h-9 sm:w-9"
                          aria-label={`Edit ${d.name}`}
                          onClick={() => openEdit(d)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Department"
                          className="h-10 w-10 sm:h-9 sm:w-9"
                          aria-label={`Delete ${d.name}`}
                          onClick={() => setDeleteId(d._id)}
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
          <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          {list.length === 0 ? (
            <>
              <p className="text-[14px] text-muted-foreground">No departments yet</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">Add one to group employees and set their location policy together.</p>
            </>
          ) : (
            <>
              <p className="text-[14px] text-muted-foreground">No departments match “{search.trim()}”</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">Try a different name.</p>
            </>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-xl max-h-[90vh] flex flex-col">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80 shrink-0" />
          <div className="p-5 flex-1 flex flex-col min-h-0">
            <DialogHeader className="mb-4 shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Department" : "Add Department"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Manage your team structure and branding.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {/* noValidate: plain inline sentences instead of the browser's own bubble. */}
            <form noValidate onSubmit={submit} className="flex-1 flex flex-col min-h-0">
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="dept-name" className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Department Name</label>
                  <FormInput
                    id="dept-name"
                    placeholder="e.g. Engineering"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    maxLength={MAX_NAME_LENGTH}
                    error={errors.name}
                    aria-invalid={!!errors.name}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="dept-color" className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Theme Color</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <FormInput
                        id="dept-color"
                        label=""
                        className="h-10 pl-12 text-[13px] rounded-xl border-border/40 bg-muted/30 font-mono uppercase focus:bg-card transition-all shadow-sm"
                        value={form.colorCode}
                        onChange={(e) => setField("colorCode", e.target.value)}
                        placeholder="#000000"
                        maxLength={7}
                        error={errors.colorCode}
                        aria-invalid={!!errors.colorCode}
                        containerClassName="space-y-0"
                      />
                      <div
                        className="absolute left-3 top-[7px] h-6 w-6 rounded-lg border border-border/40 shadow-sm transition-transform active:scale-95 cursor-pointer overflow-hidden z-10"
                        style={{ backgroundColor: safeColor(form.colorCode) }}
                      >
                        {/* <input type=color> only accepts #rrggbb; anything
                            else made React warn and the picker open on black. */}
                        <input
                          type="color"
                          aria-label="Pick a colour"
                          className="absolute inset-0 opacity-0 cursor-pointer scale-150"
                          value={/^#[0-9a-f]{6}$/i.test(form.colorCode.trim()) ? form.colorCode.trim() : DEFAULT_COLOR}
                          onChange={(e) => setField("colorCode", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[11px] text-muted-foreground/60 italic">* Choose a unique color to distinguish this department in the main dashboard.</p>
              </div>

              {/* Location policy.
                  Two switches rather than one, because they are different
                  decisions: the first says "we know where these people are",
                  the second says "we may end their working day on the strength
                  of it". Every sensible rollout does the first for a while
                  before the second, and a single toggle would not allow that. */}
              <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/40">
                <div className="flex items-start justify-between gap-4 p-3.5">
                  <div className="space-y-0.5">
                    <label htmlFor="dept-tracking" className="text-[12px] font-bold cursor-pointer">Track location on duty</label>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Employees in this department send their location while punched in. Individually
                      enabled employees stay tracked whatever this is set to.
                    </p>
                  </div>
                  <Switch
                    id="dept-tracking"
                    checked={form.trackingEnabled}
                    onCheckedChange={(v) => setForm({ ...form, trackingEnabled: v, autoPunchOutEnabled: v ? form.autoPunchOutEnabled : false })}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 p-3.5">
                  <div className="space-y-0.5">
                    <label htmlFor="dept-autopunchout" className={cn("text-[12px] font-bold", form.trackingEnabled ? "cursor-pointer" : "text-muted-foreground")}>
                      Auto punch-out when they leave
                    </label>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {form.trackingEnabled
                        ? "Ends the day automatically once someone has demonstrably left their branch. The close time is the last moment they were inside, so nobody loses the walk. Leave this off until you have watched the tracking for a while."
                        : "Needs location tracking first — there is nothing to decide on without it."}
                    </p>
                  </div>
                  <Switch
                    id="dept-autopunchout"
                    disabled={!form.trackingEnabled}
                    checked={form.autoPunchOutEnabled}
                    onCheckedChange={(v) => setForm({ ...form, autoPunchOutEnabled: v })}
                  />
                </div>
              </div>

              {/* Field staff: an explicit switch. The engine used to decide this
                  purely from the NAME ("sales", "field", "delivery"...), so a
                  rename could silently add or remove the exemption. */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 p-3.5">
                <div className="space-y-0.5">
                  <label htmlFor="dept-fieldstaff" className="text-[12px] font-bold cursor-pointer">Field staff (work away from the office)</label>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Auto punch-out never ends the day for field staff, even when they leave the branch. Use it for sales,
                    delivery or site teams. To exempt one person instead, use "Exempt From Auto Punch-Out" on their form.
                  </p>
                </div>
                <Switch
                  id="dept-fieldstaff"
                  checked={fieldStaffChecked}
                  onCheckedChange={(v) => setForm({ ...form, isFieldStaff: v })}
                />
              </div>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-1 shrink-0">
                <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setOpen(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
                {/* disabled while saving: a double click used to POST twice. */}
                <ActionButton
                  type="submit"
                  variant="add"
                  showLabel
                  label={saving ? "Saving..." : editing ? "Update Dept" : "Create Department"}
                  icon={editing ? Check : Plus}
                  loading={saving}
                  disabled={saving}
                  className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-2xl border-destructive/20 shadow-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">
              {deleteActive > 0 ? `Move ${deleteActive === 1 ? "1 employee" : `${deleteActive} employees`} first` : `Delete ${deleteTarget?.name?.trim() || "department"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-relaxed">
              {deleteActive > 0 ? (
                <>
                  {deleteActive === 1 ? "1 active employee is" : `${deleteActive} active employees are`} still in this department.
                  Deleting it would drop the location policy it gives them, so move them to another department first.
                </>
              ) : (
                <>
                  This cannot be undone.
                  {deleteTotal > 0 && ` ${deleteTotal === 1 ? "1 former employee" : `${deleteTotal} former employees`} will be left without a department.`}
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
                onClick={() => { const d = deleteTarget; setDeleteId(null); if (d) showEmployees(d); }}
              >
                <Users className="h-4 w-4" /> Show these employees
              </Button>
            ) : (
              <ActionButton
                variant="destructive"
                showLabel
                label={isDeleting ? "Deleting..." : "Delete Department"}
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
