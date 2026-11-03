import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanFeatures,
  createPlanFeature,
  updatePlanFeature,
  deletePlanFeature,
} from "@/services/superadmin-service";
import { useState } from "react";
import { Check, X, Plus, Edit, Settings2, Trash2, Building2, RotateCcw } from "lucide-react";
import { formatINRFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/super/plans")({
  component: PlansPage,
});

// ─── Types and module rules ──────────────────────────────────────────────────

type ModuleValue = boolean | string;

interface Plan {
  _id: string;
  name: string;
  slug: string;
  price: number;
  annualPrice?: number | null;
  maxEmployees?: number | null;
  trialDays?: number;
  color?: string;
  isFeatured?: boolean;
  isActive?: boolean;
  modules?: Record<string, ModuleValue>;
  tenantCount?: number;
}

interface Feature {
  _id: string;
  key: string;
  label: string;
  type: "boolean" | "select";
  options?: string[];
  order?: number;
  enforced?: boolean;
}

// Mirrors LEGACY_MODULE_KEYS in backend subscription.middleware.js: seeded
// plans store combined keys, and the server falls back to them when a plan
// has no value under the feature's own key.
const LEGACY_KEYS: Record<string, string> = {
  expenses: "expensesAssets",
  assets: "expensesAssets",
  leads: "crmLeads",
};

type Resolved = { value: ModuleValue | undefined; source: "set" | "legacy" | "unset" };

/** What the server will actually apply for this feature on this plan. */
function resolveModule(plan: Plan | null, key: string): Resolved {
  const modules = plan?.modules || {};
  if (modules[key] !== undefined) return { value: modules[key], source: "set" };
  const legacy = LEGACY_KEYS[key];
  if (legacy && modules[legacy] !== undefined) return { value: modules[legacy], source: "legacy" };
  return { value: undefined, source: "unset" };
}

/** checkModuleAccess refuses only false and 'none'; a missing value is allowed. */
const allows = (v: ModuleValue | undefined) => v !== false && v !== "none";

const errMessage = (err: unknown, fallback: string) => {
  const res = (err as { response?: { status?: number; data?: { message?: unknown } } })?.response;
  if (!res) return "Could not connect. Check your internet and try again.";
  const m = res.data?.message;
  return res.status && res.status < 500 && typeof m === "string" && m ? m : fallback;
};
const needsConfirm = (err: unknown) =>
  (err as { response?: { status?: number; data?: { needsConfirm?: boolean } } })?.response?.data?.needsConfirm === true;

const companies = (n: number) => (n === 1 ? "1 company" : `${n} companies`);
const seatsLabel = (max: number | null | undefined) =>
  max === null || max === undefined ? "Unlimited employees" : `Up to ${max.toLocaleString("en-IN")} employees`;

// ─── Page ────────────────────────────────────────────────────────────────────

type PendingChange = {
  plan: Plan;
  title: string;
  data: Record<string, unknown>;
  confirmText?: string;
};

function PlansPage() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [seatReset, setSeatReset] = useState(0);

  const plansQ = useQuery({ queryKey: ["superadmin", "plans"], queryFn: getPlans });
  const featuresQ = useQuery({ queryKey: ["superadmin", "plan-features"], queryFn: getPlanFeatures });

  const quickUpdate = useMutation({
    mutationFn: ({ plan, data }: { plan: Plan; data: Record<string, unknown> }) => updatePlan(plan._id, data),
    onSuccess: (_res, { plan }) => {
      toast.success(`${plan.name} updated`);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (err, vars) => {
      if (needsConfirm(err)) {
        setPending({ plan: vars.plan, title: `Lower the employee limit on ${vars.plan.name}?`, data: { ...vars.data, acceptOverSeats: true }, confirmText: errMessage(err, "") });
        return;
      }
      setPending(null);
      setSeatReset((n) => n + 1); // put the seat inputs back to the saved value
      toast.error(errMessage(err, "Could not update the plan. Please try again."));
    },
  });

  // A plan edit reaches every company on it at once, so a change to a plan
  // that has companies is confirmed first; an unused plan saves directly.
  const requestChange = (plan: Plan, title: string, data: Record<string, unknown>) => {
    if ((plan.tenantCount || 0) > 0) setPending({ plan, title, data });
    else quickUpdate.mutate({ plan, data });
  };

  const reactivate = useMutation({
    mutationFn: (plan: Plan) => updatePlan(plan._id, { isActive: true }),
    onSuccess: (_r, plan) => {
      toast.success(`${plan.name} is switched on again`);
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (err) => toast.error(errMessage(err, "Could not switch the plan on.")),
  });

  if (plansQ.isLoading || featuresQ.isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (plansQ.isError || featuresQ.isError || !Array.isArray(plansQ.data) || !Array.isArray(featuresQ.data)) {
    return (
      <div className="p-4 sm:p-6">
        <div className="border rounded-xl bg-card p-6 text-center space-y-3 max-w-md mx-auto">
          <p className="text-sm font-medium">Could not load the plans.</p>
          <p className="text-xs text-muted-foreground">{errMessage(plansQ.error || featuresQ.error, "Something went wrong on our side.")}</p>
          <Button variant="outline" className="h-10" onClick={() => { plansQ.refetch(); featuresQ.refetch(); }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const allPlans = plansQ.data as Plan[];
  const activePlans = allPlans.filter((p) => p.isActive !== false);
  const offPlans = allPlans.filter((p) => p.isActive === false);
  const activeFeatures = featuresQ.data as Feature[];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Plans</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activePlans.length === 1 ? "1 plan" : `${activePlans.length} plans`} on offer. A change applies to every company on the plan right away.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-10" onClick={() => setShowFeatures(true)}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Features
          </Button>
          <Button className="h-10 bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New plan
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {activePlans.length === 0 ? (
          <div className="border rounded-xl bg-card p-8 text-center space-y-3">
            <p className="text-sm font-medium">No plans yet</p>
            <p className="text-xs text-muted-foreground">Create a plan to choose what companies on it can use.</p>
            <Button className="h-10" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New plan
            </Button>
          </div>
        ) : (
          <>
            {/* Plan cards */}
            <section>
              <h2 className="text-sm font-semibold mb-3">What each plan includes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePlans.map((plan) => (
                  <PlanCard key={plan._id} plan={plan} features={activeFeatures} onEdit={() => setEditingPlan(plan)} />
                ))}
              </div>
            </section>

            {/* Quick-edit matrix */}
            <section>
              <h2 className="text-sm font-semibold">Quick edit</h2>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                "Not set" means the plan has no value for that feature, so companies on it can use it.
              </p>
              <div className="border rounded-xl overflow-x-auto bg-card">
                <table className="w-full text-sm" style={{ minWidth: `${200 + activePlans.length * 170}px` }}>
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/40 backdrop-blur w-[200px]">Feature</th>
                      {activePlans.map((p) => (
                        <th key={p._id} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                          {p.name}
                          <div className="font-normal text-[11px]">{companies(p.tenantCount || 0)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <MatrixRow label="Employee limit" plans={activePlans}>
                      {(p) => (
                        <SeatInput
                          key={`${p._id}-${p.maxEmployees ?? "none"}-${seatReset}`}
                          plan={p}
                          onCommit={(val) =>
                            requestChange(p, `Change the employee limit on ${p.name} to ${val === null ? "unlimited" : val.toLocaleString("en-IN")}?`, { maxEmployees: val })
                          }
                        />
                      )}
                    </MatrixRow>
                    {activeFeatures.map((f) => (
                      <MatrixRow key={f.key} label={f.label} plans={activePlans}>
                        {(p) => {
                          const r = resolveModule(p, f.key);
                          if (f.type === "select") {
                            return (
                              <div>
                                <Select
                                  value={r.source === "set" && typeof r.value === "string" ? r.value : ""}
                                  onValueChange={(v) => requestChange(p, `Set ${f.label} to "${v}" on ${p.name}?`, { modules: { [f.key]: v } })}
                                >
                                  <SelectTrigger className="h-10 w-36 text-xs" aria-label={`${f.label} on ${p.name}`}>
                                    <SelectValue placeholder="Not set (allowed)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {f.options?.map((opt) => (
                                      <SelectItem key={opt} value={opt} className="text-xs">
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {r.source === "set" && typeof r.value === "string" && !f.options?.includes(r.value) && (
                                  <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">Stored: "{r.value}"</div>
                                )}
                              </div>
                            );
                          }
                          const on = allows(r.value);
                          return (
                            <label className="inline-flex items-center gap-2 min-h-10 cursor-pointer">
                              <Switch
                                checked={on}
                                aria-label={`${f.label} on ${p.name}`}
                                onCheckedChange={(checked) =>
                                  requestChange(p, `${checked ? "Switch on" : "Switch off"} ${f.label} for ${p.name}?`, { modules: { [f.key]: checked } })
                                }
                              />
                              {r.source !== "set" && (
                                <span className="text-[11px] text-muted-foreground">{r.source === "legacy" ? "old setting" : "not set"}</span>
                              )}
                            </label>
                          );
                        }}
                      </MatrixRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {offPlans.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Switched off ({offPlans.length})</h2>
            <p className="text-xs text-muted-foreground -mt-2 mb-3">Not offered to new companies. Turn one back on to offer it again.</p>
            <div className="border rounded-xl bg-card divide-y">
              {offPlans.map((p) => (
                <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{formatINRFull(p.price)} a month</div>
                  </div>
                  <Button variant="outline" className="h-10" disabled={reactivate.isPending} onClick={() => reactivate.mutate(p)}>
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Turn back on
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {editingPlan && (
        <PlanDialog plan={editingPlan} features={activeFeatures} onClose={() => setEditingPlan(null)} queryClient={queryClient} />
      )}
      {showCreate && <PlanDialog plan={null} features={activeFeatures} onClose={() => setShowCreate(false)} queryClient={queryClient} />}
      {showFeatures && <FeatureManagerDialog features={activeFeatures} onClose={() => setShowFeatures(false)} queryClient={queryClient} />}

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !quickUpdate.isPending) { setPending(null); setSeatReset((n) => n + 1); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.confirmText ||
                `${companies(pending?.plan.tenantCount || 0)} ${(pending?.plan.tenantCount || 0) === 1 ? "is" : "are"} on this plan. The change applies to ${(pending?.plan.tenantCount || 0) === 1 ? "it" : "them"} right away.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10" disabled={quickUpdate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={quickUpdate.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pending) quickUpdate.mutate({ plan: pending.plan, data: pending.data });
              }}
            >
              {quickUpdate.isPending ? "Saving…" : pending?.confirmText ? "Save anyway" : "Change plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanCard({ plan, features, onEdit }: { plan: Plan; features: Feature[]; onEdit: () => void }) {
  const annual = plan.annualPrice ?? null;
  return (
    <div className={`border rounded-xl p-5 bg-card relative flex flex-col ${plan.isFeatured ? "border-primary border-2" : ""}`}>
      {plan.isFeatured && (
        <span className="absolute top-4 right-4 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">Popular</span>
      )}
      <div className="flex items-center gap-2 pr-20">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: plan.color || "#1D9E75" }} aria-hidden />
        <h3 className="font-medium text-sm truncate">{plan.name}</h3>
      </div>
      <p className="text-2xl font-semibold mt-2 break-words">
        {formatINRFull(plan.price)}
        <span className="text-xs font-normal text-muted-foreground"> a month</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {annual === null ? `${formatINRFull(plan.price * 12)} a year (12 × monthly)` : `${formatINRFull(annual)} a year`}
      </p>
      <div className="mt-4 space-y-1.5">
        <FeatureLine ok label={seatsLabel(plan.maxEmployees)} />
        {features.map((f) => {
          const r = resolveModule(plan, f.key);
          const ok = allows(r.value);
          const detail = f.type === "select" ? (r.source === "unset" ? "not set" : String(r.value)) : r.source === "unset" ? "not set" : "";
          return <FeatureLine key={f.key} ok={ok} label={f.label} detail={detail} />;
        })}
      </div>
      <div className="mt-auto">
        <div className="mt-4 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {companies(plan.tenantCount || 0)} · {plan.trialDays ?? 14}-day free trial
        </div>
        <Button variant="outline" className="w-full mt-3 h-10" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-1.5" />
          Edit {plan.name}
        </Button>
      </div>
    </div>
  );
}

function FeatureLine({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      {ok ? (
        <Check className="h-3.5 w-3.5 mt-px text-emerald-600 shrink-0" aria-label="Included" />
      ) : (
        <X className="h-3.5 w-3.5 mt-px text-muted-foreground/50 shrink-0" aria-label="Not included" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40"}>
        {label}
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </span>
    </div>
  );
}

function MatrixRow({ label, plans, children }: { label: string; plans: Plan[]; children: (plan: Plan) => React.ReactNode }) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2 text-xs sticky left-0 bg-card">{label}</td>
      {plans.map((p) => (
        <td key={p._id} className="px-4 py-2 align-top">
          {children(p)}
        </td>
      ))}
    </tr>
  );
}

/** Whole number 1..100000, or blank for unlimited. Returns undefined when invalid. */
function parseSeats(raw: string): number | null | undefined {
  const v = raw.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 1 && n <= 100000 ? n : undefined;
}

function SeatInput({ plan, onCommit }: { plan: Plan; onCommit: (val: number | null) => void }) {
  const saved = plan.maxEmployees ?? null;
  const [value, setValue] = useState(saved === null ? "" : String(saved));
  const [error, setError] = useState("");
  const commit = () => {
    const parsed = parseSeats(value);
    if (parsed === undefined) {
      setError("1 to 1,00,000, or blank");
      return;
    }
    setError("");
    if (parsed !== saved) onCommit(parsed);
  };
  return (
    <div>
      <Input
        inputMode="numeric"
        value={value}
        placeholder="Unlimited"
        aria-label={`Employee limit on ${plan.name}`}
        aria-invalid={!!error}
        className="h-10 w-28 text-sm"
        onChange={(e) => { setValue(e.target.value); setError(""); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
    </div>
  );
}

// ─── Create / edit a plan ────────────────────────────────────────────────────

function PlanDialog({ plan, features, onClose, queryClient }: { plan: Plan | null; features: Feature[]; onClose: () => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const isEdit = !!plan;
  const tenantCount = plan?.tenantCount || 0;

  // An existing plan shows what the server applies (its own value, the old
  // combined key, or "not set" = allowed). A new plan's selects start at the
  // smallest REAL allowance, not 'none': options[0] is 'none', and a plan saved
  // without touching them gave tenants no branches or shifts.
  const initialModules: Record<string, ModuleValue | undefined> = {};
  features.forEach((f) => {
    if (isEdit) {
      const r = resolveModule(plan, f.key);
      initialModules[f.key] = r.source === "set" ? r.value : f.type === "boolean" ? allows(r.value) : undefined;
    } else {
      const firstAllowance = (f.options || []).find((o) => o !== "none");
      initialModules[f.key] = f.type === "select" ? firstAllowance || f.options?.[0] || "none" : false;
    }
  });

  const [form, setForm] = useState({
    name: plan?.name || "",
    price: plan ? String(plan.price ?? 0) : "",
    annualPrice: plan?.annualPrice === null || plan?.annualPrice === undefined ? "" : String(plan.annualPrice),
    maxEmployees: plan?.maxEmployees === null || plan?.maxEmployees === undefined ? "" : String(plan.maxEmployees),
    trialDays: String(plan?.trialDays ?? 14),
    color: plan?.color || "#1D9E75",
    isFeatured: plan?.isFeatured || false,
  });
  const [modules, setModules] = useState(initialModules);
  // Only modules the super admin touched are sent on an edit: the server
  // merges them, so untouched and legacy values stay exactly as stored.
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [seatWarning, setSeatWarning] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin"] });

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => (isEdit ? updatePlan(plan!._id, data) : createPlan(data)),
    onSuccess: () => {
      toast.success(isEdit ? `${form.name.trim()} saved` : `${form.name.trim()} created`);
      invalidate();
      onClose();
    },
    onError: (err) => {
      if (needsConfirm(err)) {
        setSeatWarning(errMessage(err, ""));
        return;
      }
      setError(errMessage(err, "Could not save the plan. Please try again."));
    },
  });

  const switchOff = useMutation({
    mutationFn: () => deletePlan(plan!._id),
    onSuccess: () => {
      toast.success(`${plan!.name} is switched off`);
      invalidate();
      onClose();
    },
    onError: (err) => {
      setConfirmOff(false);
      setError(errMessage(err, "Could not switch the plan off."));
    },
  });

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
    if (key === "maxEmployees") setSeatWarning("");
  };
  const setModule = (key: string, value: ModuleValue) => {
    setModules((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const validate = (): Record<string, unknown> | string => {
    const name = form.name.trim();
    if (name.length < 2 || name.length > 60) return "Please enter a plan name (2 to 60 characters).";
    const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
    const price = whole(form.price);
    if (!(price >= 0 && price <= 1000000)) return "Monthly price must be a whole number of rupees from ₹0 to ₹10,00,000.";
    let annualPrice: number | null = null;
    if (form.annualPrice.trim() !== "") {
      annualPrice = whole(form.annualPrice);
      if (!(annualPrice >= 0 && annualPrice <= 12000000)) return "Annual price must be a whole number of rupees up to ₹1,20,00,000, or left blank.";
    }
    const seats = parseSeats(form.maxEmployees);
    if (seats === undefined) return "Employee limit must be a whole number from 1 to 1,00,000, or left blank for unlimited.";
    const trialDays = whole(form.trialDays);
    if (!(trialDays >= 1 && trialDays <= 365)) return "Trial length must be 1 to 365 days.";
    if (!/^#[0-9a-f]{6}$/i.test(form.color.trim())) return "Colour must be a hex code such as #1D9E75.";
    const sendModules: Record<string, ModuleValue> = {};
    for (const f of features) {
      const v = modules[f.key];
      if (isEdit && !dirty.has(f.key)) continue;
      if (v !== undefined) sendModules[f.key] = v;
    }
    return { name, price, annualPrice, maxEmployees: seats, trialDays, color: form.color.trim(), isFeatured: form.isFeatured, modules: sendModules };
  };

  const submit = (acceptOverSeats = false) => {
    const data = validate();
    if (typeof data === "string") {
      setError(data);
      return;
    }
    save.mutate(acceptOverSeats ? { ...data, acceptOverSeats: true } : data);
  };

  const monthlyNum = /^\d+$/.test(form.price.trim()) ? Number(form.price) : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{isEdit ? `Edit ${plan!.name}` : "New plan"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? tenantCount > 0
                ? `${companies(tenantCount)} ${tenantCount === 1 ? "is" : "are"} on this plan. Saving changes what ${tenantCount === 1 ? "it" : "they"} can use right away.`
                : "No company is on this plan yet."
              : "Choose the price, the employee limit and what companies on this plan can use."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          <Field label="Plan name" className="sm:col-span-2">
            <Input className="h-10" maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />
            {isEdit && <p className="text-[11px] text-muted-foreground">Short code: {plan!.slug}</p>}
          </Field>
          <Field label="Monthly price (₹)">
            <Input className="h-10" inputMode="numeric" placeholder="e.g. 999" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Annual price (₹)">
            <Input
              className="h-10"
              inputMode="numeric"
              placeholder={monthlyNum !== null ? `Blank = ${formatINRFull(monthlyNum * 12)}` : "Blank = 12 × monthly"}
              value={form.annualPrice}
              onChange={(e) => set("annualPrice", e.target.value)}
            />
          </Field>
          <Field label="Employee limit">
            <Input className="h-10" inputMode="numeric" placeholder="Blank = unlimited" value={form.maxEmployees} onChange={(e) => set("maxEmployees", e.target.value)} />
          </Field>
          <Field label="Free trial (days)">
            <Input className="h-10" inputMode="numeric" value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} />
          </Field>
          <Field label="Colour">
            <div className="flex gap-2 items-center">
              <input
                type="color"
                aria-label="Pick a colour"
                value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : "#1D9E75"}
                onChange={(e) => set("color", e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer shrink-0"
              />
              <Input className="h-10 flex-1" value={form.color} onChange={(e) => set("color", e.target.value)} />
            </div>
          </Field>
          <label className="flex items-center gap-2 min-h-10 sm:pt-5 cursor-pointer">
            <Switch checked={form.isFeatured} onCheckedChange={(v) => set("isFeatured", v)} />
            <span className="text-xs">Show a "Popular" badge</span>
          </label>
        </div>

        {features.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-semibold">What companies on this plan can use</p>
            <p className="text-[11px] text-muted-foreground mb-2">"Not set" means allowed.</p>
            <div className="divide-y">
              {features.map((f) => {
                const r = isEdit ? resolveModule(plan, f.key) : null;
                const hint = !isEdit || dirty.has(f.key) ? "" : r?.source === "legacy" ? "from the old combined setting" : r?.source === "unset" ? "not set" : "";
                return (
                  <div key={f.key} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <div className="text-xs">{f.label}</div>
                      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
                    </div>
                    {f.type === "select" ? (
                      <Select value={(modules[f.key] as string) ?? ""} onValueChange={(v) => setModule(f.key, v)}>
                        <SelectTrigger className="h-10 w-40 text-xs shrink-0" aria-label={f.label}>
                          <SelectValue placeholder="Not set (allowed)" />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options?.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <label className="inline-flex items-center min-h-10 min-w-10 justify-end cursor-pointer">
                        <Switch checked={!!modules[f.key]} aria-label={f.label} onCheckedChange={(v) => setModule(f.key, v)} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive mt-3" role="alert">{error}</p>}
        {seatWarning && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 space-y-2" role="alert">
            <p className="text-xs text-amber-900 dark:text-amber-200">{seatWarning}</p>
            <Button className="h-10" variant="outline" disabled={save.isPending} onClick={() => submit(true)}>
              Save anyway
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <div>
            {isEdit && (
              tenantCount > 0 ? (
                <p className="text-[11px] text-muted-foreground max-w-[14rem]">To switch this plan off, first move its {companies(tenantCount)} to another plan.</p>
              ) : (
                <Button variant="ghost" className="h-10 text-destructive hover:text-destructive" onClick={() => setConfirmOff(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Switch off plan
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" className="h-10" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button className="h-10 bg-primary hover:bg-primary/90" disabled={save.isPending} onClick={() => submit(false)}>
              {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create plan"}
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmOff} onOpenChange={(o) => { if (!switchOff.isPending) setConfirmOff(o); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch off {plan?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It will no longer be offered to new companies. Nothing is deleted, and you can turn it back on later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-10" disabled={switchOff.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={switchOff.isPending}
                onClick={(e) => { e.preventDefault(); switchOff.mutate(); }}
              >
                {switchOff.isPending ? "Switching off…" : "Switch off"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── Feature catalog ─────────────────────────────────────────────────────────

const splitOptions = (csv: string) => csv.split(",").map((o) => o.trim()).filter(Boolean);

function FeatureManagerDialog({ features, onClose, queryClient }: { features: Feature[]; onClose: () => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"boolean" | "select">("boolean");
  const [newOptions, setNewOptions] = useState("none, basic, full");
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState<Feature | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editError, setEditError] = useState("");
  const [deleting, setDeleting] = useState<Feature | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["superadmin"] });

  const createMutation = useMutation({
    mutationFn: createPlanFeature,
    onSuccess: () => {
      toast.success("Feature added");
      setNewKey("");
      setNewLabel("");
      setAddError("");
      invalidate();
    },
    onError: (err) => setAddError(errMessage(err, "Could not add the feature.")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updatePlanFeature(id, data),
    onSuccess: () => {
      toast.success("Feature saved");
      setEditing(null);
      invalidate();
    },
    onError: (err) => setEditError(errMessage(err, "Could not save the feature.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlanFeature(id),
    onSuccess: (res: { message?: string }) => {
      toast.success(res?.message || "Feature deleted");
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error(errMessage(err, "Could not delete the feature."));
    },
  });

  const handleCreate = () => {
    const key = newKey.trim();
    const label = newLabel.trim();
    if (!/^[a-z][a-zA-Z0-9]{1,39}$/.test(key)) {
      setAddError('The key must start with a small letter and use only letters and numbers (for example "advancedReports").');
      return;
    }
    if (label.length < 2 || label.length > 60) {
      setAddError("Please enter a name (2 to 60 characters).");
      return;
    }
    const payload: Record<string, unknown> = { key, label, type: newType };
    if (newType === "select") payload.options = splitOptions(newOptions);
    createMutation.mutate(payload);
  };

  const startEdit = (f: Feature) => {
    setEditing(f);
    setEditLabel(f.label);
    setEditOptions((f.options || []).join(", "));
    setEditError("");
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Features</DialogTitle>
          <DialogDescription className="text-xs">
            The list every plan chooses from. Features marked "Used by the app" decide what companies can open. Any other feature is only a line on the plan until the app is built to check it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-1">
          {features.map((f) =>
            editing?._id === f._id ? (
              <div key={f._id} className="p-3 border rounded-md space-y-2 bg-muted/20">
                <div className="text-[11px] text-muted-foreground font-mono">{f.key}</div>
                <Field label="Name">
                  <Input className="h-10" maxLength={60} value={editLabel} onChange={(e) => { setEditLabel(e.target.value); setEditError(""); }} />
                </Field>
                {f.type === "select" && (
                  <Field label="Choices (comma separated)">
                    <Input className="h-10" value={editOptions} onChange={(e) => { setEditOptions(e.target.value); setEditError(""); }} />
                  </Field>
                )}
                {editError && <p className="text-xs text-destructive" role="alert">{editError}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="h-10" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>
                    Cancel
                  </Button>
                  <Button
                    className="h-10"
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      const data: Record<string, unknown> = { label: editLabel.trim() };
                      if (f.type === "select") data.options = splitOptions(editOptions);
                      updateMutation.mutate({ id: f._id, data });
                    }}
                  >
                    {updateMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <div key={f._id} className="flex items-center justify-between gap-2 p-2 pl-3 border rounded-md bg-muted/20">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{f.key}</span> · {f.type === "select" ? (f.options || []).join(" / ") : "on / off"}
                  </div>
                  <div className={`text-[11px] ${f.enforced ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {f.enforced ? "Used by the app" : "Shown on plans only"}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Edit ${f.label}`} onClick={() => startEdit(f)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!f.enforced && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Delete ${f.label}`}
                      onClick={() => setDeleting(f)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ),
          )}
          {features.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No features yet.</div>}
        </div>

        <div className="border-t pt-4 mt-2">
          <h4 className="text-sm font-semibold mb-3">Add a feature</h4>
          <div className="space-y-3">
            <Field label="Name people see">
              <Input className="h-10" maxLength={60} placeholder="e.g. Advanced reports" value={newLabel} onChange={(e) => { setNewLabel(e.target.value); setAddError(""); }} />
            </Field>
            <Field label="Key (letters and numbers, starts small)">
              <Input className="h-10 font-mono" maxLength={40} placeholder="e.g. advancedReports" value={newKey} onChange={(e) => { setNewKey(e.target.value); setAddError(""); }} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={newType} onValueChange={(v) => setNewType(v as "boolean" | "select")}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">On / off</SelectItem>
                    <SelectItem value="select">Choice list</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {newType === "select" && (
                <Field label="Choices (comma separated)">
                  <Input className="h-10" placeholder="none, basic, full" value={newOptions} onChange={(e) => { setNewOptions(e.target.value); setAddError(""); }} />
                </Field>
              )}
            </div>
            {addError && <p className="text-xs text-destructive" role="alert">{addError}</p>}
            <Button className="w-full h-10" onClick={handleCreate} disabled={!newKey.trim() || !newLabel.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add feature"}
            </Button>
          </div>
        </div>

        <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setDeleting(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from every plan. Plans keep any value they stored for it, but it has no effect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-10" disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={(e) => { e.preventDefault(); if (deleting) deleteMutation.mutate(deleting._id); }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
