import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GridCard } from "@/components/shared/grid-card";
import {
  Search, Calendar, HeartPulse, User, Baby, Heart,
  Settings2, Type as TypeIcon, Hash, Wallet, Ban, CalendarClock, Info,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { FormInput } from "@/components/shared/form-input";
import { Badge } from "@/components/ui/badge";
import { useLeaveTypeService, useLeaveBalancePeriodSetting, type LeaveType as BackendLeaveType } from "@/services/leave-type-service";
import type { LeaveBalancePeriodType } from "@/services/leave-service";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { cn } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/shared/form-dialog";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { usePermission } from "@/hooks/use-permission";
import { AdminLoadError } from "@/components/leaves/admin-load-error";

export const Route = createFileRoute("/_app/leave-types")({
  component: LeaveTypesPage,
});

// Same limits the server enforces (leave_type_controller), checked here first
// so the admin sees the problem next to the field instead of in a toast.
const MAX_NAME_LENGTH = 60;
const MAX_CODE_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_DAYS = 365;

// Radix close buttons are 16px; on a phone that is too small to hit.
const BIG_CLOSE = "[&>button.absolute]:h-10 [&>button.absolute]:w-10 [&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute]:flex [&>button.absolute]:items-center [&>button.absolute]:justify-center [&>button.absolute]:rounded-full";

// When each type's "Total Days" starts again (Settings.leave.balancePeriod).
// Balances are computed on the server (GET /leaves/balances), so this choice
// changes the employee's Leaves page as soon as it is saved.
const BALANCE_PERIOD_OPTIONS: { value: LeaveBalancePeriodType; label: string; desc: string }[] = [
  { value: "lifetime", label: "Never", desc: "Total days cover the employee's whole time with the company. Every leave ever taken counts." },
  { value: "calendar_year", label: "Every 1 January", desc: "Total days are given again each calendar year (Jan to Dec)." },
  { value: "financial_year", label: "Every 1 April", desc: "Total days are given again each financial year (Apr to Mar)." },
];

const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** "12 days", "12 days a year", "12 days a financial year". */
function quotaLabel(days: number, period: LeaveBalancePeriodType) {
  if (period === "calendar_year") return `${dayWord(days)} a year`;
  if (period === "financial_year") return `${dayWord(days)} a financial year`;
  return dayWord(days);
}

type FormState = {
  leaveName: string;
  code: string;
  totalDays: string;
  description: string;
  iconStyle: string;
  colorCode: string;
  isPaid: boolean;
};
const EMPTY_FORM: FormState = { leaveName: "", code: "", totalDays: "", description: "", iconStyle: "Calendar", colorCode: "#3b82f6", isPaid: true };

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errs: Partial<Record<keyof FormState, string>> = {};
  const name = form.leaveName.trim();
  if (!name) errs.leaveName = "Please enter a name.";
  else if (name.length > MAX_NAME_LENGTH) errs.leaveName = `Please keep the name under ${MAX_NAME_LENGTH} letters.`;
  const code = form.code.trim();
  if (!code) errs.code = "Please enter a short code, like CL.";
  else if (code.length > MAX_CODE_LENGTH) errs.code = `Up to ${MAX_CODE_LENGTH} letters.`;
  const raw = form.totalDays.trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n)) errs.totalDays = "Enter a number of days (0 or more).";
  else if (n < 0) errs.totalDays = "Cannot be less than 0.";
  else if (n > MAX_DAYS) errs.totalDays = `Cannot be more than ${MAX_DAYS}.`;
  else if (Math.round(n * 2) !== n * 2) errs.totalDays = "Use whole or half days, like 12 or 7.5.";
  if (form.description.trim().length > MAX_DESCRIPTION_LENGTH) errs.description = `Please keep it under ${MAX_DESCRIPTION_LENGTH} letters.`;
  return errs;
}

/**
 * The balance-period choice. Saved explicitly rather than on tap: it changes
 * what "used" means for every employee at once, so a stray click should not.
 * Writing it needs Settings edit rights (that is the route it saves through),
 * which a sub-admin with only Leave Types rights may not have.
 */
function BalancePeriodCard() {
  const { can } = usePermission();
  const canChange = can("settings", "edit");
  const { balancePeriod, hasData, isError, saveBalancePeriod, isSaving } = useLeaveBalancePeriodSetting();
  const [choice, setChoice] = useState<LeaveBalancePeriodType | null>(null);
  const selected = choice ?? balancePeriod;
  const dirty = choice !== null && choice !== balancePeriod;

  const save = async () => {
    if (!choice) return;
    try {
      await saveBalancePeriod(choice);
      setChoice(null);
    } catch {
      // toast shown by the service; the choice stays so Save can be retried
    }
  };

  return (
    <Card data-balance-period-card className="p-5 border border-border/60 bg-white rounded-2xl shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <CalendarClock className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-foreground tracking-tight">When do leave balances start again?</h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Each leave type's Total Days can be used once in this period. Unused days do not carry over.
          </p>
        </div>
      </div>

      {isError && !hasData ? (
        <p className="text-[12px] text-destructive">Could not load this setting. Please reload the page.</p>
      ) : (
        <div role="radiogroup" aria-label="When leave balances start again" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {BALANCE_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected === opt.value}
              disabled={!canChange || !hasData || isSaving}
              onClick={() => setChoice(opt.value)}
              className={cn(
                "w-full min-h-[44px] text-left p-3.5 rounded-xl border-2 transition-all disabled:cursor-not-allowed",
                selected === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted bg-muted/10 hover:border-primary/30 disabled:hover:border-muted"
              )}
            >
              <div className="text-[13px] font-bold">{opt.label}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>
      )}

      {!canChange && hasData && (
        <p className="mt-3 text-[12px] text-muted-foreground">Only someone who can edit Settings can change this.</p>
      )}
      {dirty && (
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <p className="text-[12px] text-muted-foreground sm:mr-auto">Saving changes every employee's leave balance straight away.</p>
          <Button type="button" variant="ghost" onClick={() => setChoice(null)} disabled={isSaving} className="h-11 sm:h-10 rounded-xl font-bold">
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isSaving} className="h-11 sm:h-10 rounded-xl px-6 font-bold">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function LeaveTypesPage() {
  const ICON_MAP: Record<string, LucideIcon> = {
    Calendar,
    HeartPulse,
    User,
    Baby,
    Heart,
  };
  const [hasMounted, setHasMounted] = useState(false);
  const { leaveTypes: types, hasData, isLoading, isError, isFetching, refetch, createLeaveType, updateLeaveType, deleteLeaveType, isCreating, isUpdating, isDeleting } = useLeaveTypeService();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendLeaveType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackendLeaveType | null>(null);
  const { defaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const isMobile = useIsMobile();
  // Phones get the cards: the table only scrolls sideways at 360px, and the
  // view toggle's buttons are too small to tap.
  const effectiveView = isMobile ? "grid" : view;
  const { can } = usePermission();
  const { balancePeriod } = useLeaveBalancePeriodSetting();
  const canCreate = can("leave-types", "create");
  const canEdit = can("leave-types", "edit");
  const canDelete = can("leave-types", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [triedSave, setTriedSave] = useState(false);

  if (!hasMounted) return null;

  const needle = search.trim().toLowerCase();
  const filtered = types.filter(t =>
    (t.leaveName || "").toLowerCase().includes(needle) ||
    (t.code || "").toLowerCase().includes(needle)
  );

  const update = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    // Once Save has been tried, keep the messages in step with the typing.
    if (triedSave) setErrors(validate(next));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setTriedSave(false);
    setOpen(true);
  };

  const openEdit = (t: BackendLeaveType) => {
    setEditing(t);
    setForm({
      leaveName: t.leaveName,
      code: t.code,
      totalDays: String(t.totalDays ?? 0),
      description: t.description || "",
      iconStyle: t.iconStyle || "Calendar",
      colorCode: t.colorCode || "#3b82f6",
      isPaid: t.isPaid !== false,
    });
    setErrors({});
    setTriedSave(false);
    setOpen(true);
  };

  const handleSave = async () => {
    setTriedSave(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payload = {
      leaveName: form.leaveName.trim(),
      code: form.code.trim().toUpperCase(),
      totalDays: Number(form.totalDays),
      description: form.description.trim(),
      iconStyle: form.iconStyle,
      colorCode: form.colorCode,
      isPaid: form.isPaid,
    };
    try {
      if (editing) {
        await updateLeaveType({ id: editing._id, ...payload });
      } else {
        await createLeaveType(payload);
      }
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch {
      // Handled by service; the dialog stays open with what was typed
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLeaveType(deleteTarget._id);
      setDeleteTarget(null);
    } catch {
      // Handled by service (e.g. "used by 3 approved or waiting requests")
      setDeleteTarget(null);
    }
  };

  const showError = isError && !hasData;
  const showSkeleton = !showError && (isLoading || (types.length === 0 && isFetching && !hasData));

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Leave Types"
        description="Configure and manage different categories of employee leaves."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Leave Type"
              onClick={openCreate}
              className="h-11 sm:h-10"
            />
          ) : null
        }
      />

      <BalancePeriodCard />

      {showError ? (
        <AdminLoadError what="the leave types" onRetry={() => refetch()} retrying={isFetching} />
      ) : showSkeleton ? (
        <SkeletonLoader type="card" count={6} />
      ) : (
        <>
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 py-1">
            <div className="hidden md:flex items-center gap-3">
              <ViewToggle view={view} onViewChange={setView} />
            </div>

            <FormInput
              placeholder="Search by name or code..."
              aria-label="Search leave types"
              icon={Search}
              className="h-11 md:h-10 w-full md:w-[260px] shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <AnimatePresence mode="wait">
            {effectiveView === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5"
              >
                {filtered.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-4">
                      <Settings2 className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    {types.length > 0 ? (
                      <p className="text-[14px] font-bold text-foreground/60">No leave type matches "{search.trim()}"</p>
                    ) : (
                      <>
                        <p className="text-[14px] font-bold text-foreground/60">No leave types yet</p>
                        {canCreate && <p className="text-[12px] text-muted-foreground mt-1">Tap "Add Leave Type" to create the first one.</p>}
                      </>
                    )}
                  </div>
                )}
                {filtered.map((t, i) => {
                  const Icon = ICON_MAP[t.iconStyle] || Calendar;
                  return (
                    <GridCard
                      key={t._id}
                      title={t.leaveName}
                      subtitle={t.description}
                      delay={Math.min(i, 12) * 0.04}
                      icon={
                        <div
                          className="h-full w-full flex items-center justify-center"
                          style={{ backgroundColor: `${t.colorCode}15`, color: t.colorCode }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                      }
                      statusNode={
                        <Badge variant="outline" className="text-[11px] font-bold px-2 py-0 border-border/60 bg-muted/30 uppercase rounded-full">
                          {t.code}
                        </Badge>
                      }
                      actions={
                        (canEdit || canDelete) ? (
                          <div className="flex items-center gap-1.5">
                            {canEdit && <ActionButton variant="edit" tooltip="Edit" aria-label={`Edit ${t.leaveName}`} onClick={() => openEdit(t)} className="h-10 w-10" />}
                            {canDelete && <ActionButton variant="delete" tooltip="Delete" aria-label={`Delete ${t.leaveName}`} onClick={() => setDeleteTarget(t)} className="h-10 w-10" />}
                          </div>
                        ) : undefined
                      }
                      metaLeft={{ icon: Settings2, label: balancePeriod === "lifetime" ? `Max: ${dayWord(t.totalDays)}` : quotaLabel(t.totalDays, balancePeriod) }}
                      metaRight={{ icon: t.isPaid !== false ? Wallet : Ban, label: t.isPaid !== false ? (t.payWeight != null && t.payWeight < 1 ? `Paid ${Math.round(t.payWeight * 100)}%` : "Paid") : "Unpaid" }}
                    />
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DataTable
                  headers={["Icon", "Leave Name", "Code", "Days Allowed", "Pay", "Actions"]}
                  isEmpty={filtered.length === 0}
                  emptyMessage={types.length > 0 ? `No leave type matches "${search.trim()}".` : "No leave types yet. Click 'Add Leave Type' to create the first one."}
                >
                  {filtered.map((t) => {
                    const Icon = ICON_MAP[t.iconStyle] || Calendar;
                    return (
                      <DataTableRow key={t._id}>
                        <DataTableCell isFirst>
                          <div
                            className="h-8 w-8 rounded-lg grid place-items-center border"
                            style={{
                              backgroundColor: `${t.colorCode}15`,
                              borderColor: `${t.colorCode}30`,
                              color: t.colorCode
                            }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        </DataTableCell>
                        <DataTableCell className="font-medium text-[14px]">{t.leaveName}</DataTableCell>
                        <DataTableCell>
                          <Badge variant="outline" className="text-[11px] font-bold px-2 py-0.5 border-border/60 bg-muted/30 uppercase">{t.code}</Badge>
                        </DataTableCell>
                        <DataTableCell className="text-[14px] font-semibold text-primary">{quotaLabel(t.totalDays, balancePeriod)}</DataTableCell>
                        <DataTableCell>
                          <Badge variant="outline" className={cn(
                            "text-[11px] font-bold px-2 py-0.5 border-transparent gap-1",
                            t.isPaid !== false ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          )}>
                            {t.isPaid !== false ? <Wallet className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                            {t.isPaid !== false ? (t.payWeight != null && t.payWeight < 1 ? `Paid ${Math.round(t.payWeight * 100)}%` : "Paid") : "Unpaid"}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell isLast>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <ActionButton
                                variant="edit"
                                tooltip="Edit"
                                aria-label={`Edit ${t.leaveName}`}
                                onClick={() => openEdit(t)}
                              />
                            )}
                            {canDelete && (
                              <ActionButton
                                variant="delete"
                                tooltip="Delete"
                                aria-label={`Delete ${t.leaveName}`}
                                onClick={() => setDeleteTarget(t)}
                              />
                            )}
                          </div>
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTable>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Add/Edit Dialog */}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit Leave Type" : "Add Leave Type"}
        description="Set the name, how many days are allowed, and whether the leave is paid."
        onSubmit={handleSave}
        submitText={editing ? "Save" : "Create"}
        isLoading={isCreating || isUpdating}
        maxWidth={cn("max-w-[calc(100vw-1.5rem)] sm:max-w-[600px] p-5", BIG_CLOSE)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <FormInput
              label="Leave Name"
              icon={TypeIcon}
              value={form.leaveName}
              maxLength={MAX_NAME_LENGTH + 20}
              onChange={e => update({ leaveName: e.target.value })}
              placeholder="e.g. Annual Leave"
              containerClassName="space-y-1.5"
              className="h-11 text-[14px]"
              error={errors.leaveName}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Code"
                icon={Hash}
                value={form.code}
                maxLength={MAX_CODE_LENGTH + 5}
                onChange={e => update({ code: e.target.value })}
                placeholder="e.g. AL"
                className="uppercase h-11 text-[14px]"
                containerClassName="space-y-1.5 min-w-0"
                error={errors.code}
              />
              <FormInput
                label="Days Allowed"
                type="number"
                inputMode="decimal"
                min="0"
                max={MAX_DAYS}
                step="0.5"
                icon={Calendar}
                value={form.totalDays}
                placeholder="e.g. 12"
                onChange={e => update({ totalDays: e.target.value })}
                containerClassName="space-y-1.5 min-w-0"
                className="h-11 text-[14px]"
                error={errors.totalDays}
              />
            </div>
            <p className="text-[12px] text-muted-foreground -mt-2 ml-1">
              {balancePeriod === "calendar_year" ? "Given again every 1 January." : balancePeriod === "financial_year" ? "Given again every 1 April." : "For the employee's whole time with the company."}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="leave-type-icon" className="text-[12px] font-black uppercase tracking-wider text-muted-foreground ml-1">
                Icon & Color
              </Label>
              <div className="flex gap-2">
                <Select value={form.iconStyle} onValueChange={v => update({ iconStyle: v })}>
                  <SelectTrigger id="leave-type-icon" className="flex-1 h-11 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-[14px] font-medium">
                    <SelectValue placeholder="Select icon" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60 shadow-xl">
                    {Object.keys(ICON_MAP).map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center justify-center bg-muted/30 rounded-xl border border-border/40 shrink-0 h-11 w-11 cursor-pointer" aria-label="Colour">
                  <input
                    type="color"
                    value={form.colorCode}
                    onChange={(e) => update({ colorCode: e.target.value })}
                    className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer rounded-lg overflow-hidden"
                  />
                </label>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 min-h-[56px] bg-muted/20 rounded-xl border border-border/40 cursor-pointer">
              <span className="flex flex-col">
                <span className="text-[13px] font-bold">Paid Leave</span>
                <span className="text-[12px] text-muted-foreground">Approved leave of this type is paid in salary. Untick for unpaid leave.</span>
              </span>
              <Checkbox
                checked={form.isPaid}
                onCheckedChange={(checked) => update({ isPaid: !!checked })}
                className="h-6 w-6 rounded-md border-primary shrink-0"
              />
            </label>
            {editing && (
              <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground ml-1">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Changing Paid or Days Allowed also applies to leave already approved, the next time salary is calculated.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-[12px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              Description
            </Label>
            <Textarea
              id="desc"
              value={form.description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={e => update({ description: e.target.value })}
              placeholder="Who can take this leave, and when..."
              className="rounded-xl h-[calc(100%-25px)] min-h-[120px] md:min-h-[160px] text-[14px] bg-muted/30 border-border/40 focus:bg-white transition-all p-4 leading-relaxed resize-none"
            />
            {errors.description && <p className="text-[12px] text-destructive font-medium ml-1">{errors.description}</p>}
          </div>
        </div>
      </FormDialog>

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.leaveName || "this leave type"}"?`}
        description="This cannot be undone. A leave type that approved or waiting leave requests use cannot be deleted; edit it instead."
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
