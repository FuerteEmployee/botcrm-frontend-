import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getPlans, 
  createPlan, 
  updatePlan,
  getPlanFeatures,
  createPlanFeature,
  deletePlanFeature
} from "@/services/superadmin-service";
import { useState } from "react";
import { Check, X, Plus, Edit, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/super/plans")({
  component: PlansPage,
});

function PlansPage() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["superadmin", "plans"],
    queryFn: getPlans,
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePlan(id, data),
    onSuccess: () => {
      toast.success("Plan updated successfully");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update plan");
    }
  });

  const { data: features, isLoading: featuresLoading } = useQuery({
    queryKey: ["superadmin", "plan-features"],
    queryFn: getPlanFeatures,
  });

  if (plansLoading || featuresLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const activePlans = (plans || []).filter((p: any) => p.isActive !== false);
  const activeFeatures = (features || []).filter((f: any) => f.isActive !== false);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Plans & module gating</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activePlans.length} active plan tiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFeatures(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Manage features
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New plan
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Plan cards */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Plan tiers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePlans.map((plan: any) => (
              <div
                key={plan._id}
                className={`border rounded-xl p-5 bg-card relative ${plan.isFeatured ? "border-primary border-2" : ""}`}
              >
                {plan.isFeatured && (
                  <span className="absolute top-4 right-4 bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Popular
                  </span>
                )}
                <h3 className="font-medium text-sm">{plan.name}</h3>
                <p className="text-2xl font-semibold mt-2">
                  ₹{plan.price.toLocaleString("en-IN")}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </p>
                <div className="mt-4 space-y-1.5">
                  <PlanFeature ok label={`Up to ${plan.maxEmployees || "∞"} employees`} />
                  {activeFeatures.map((f: any) => {
                    const val = plan.modules?.[f.key];
                    const isEnabled = val === true || val === "full" || val === "basic";
                    return (
                      <PlanFeature key={f.key} ok={isEnabled} label={f.label} />
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 border-t text-[10px] text-muted-foreground">
                  🏢 {plan.tenantCount || 0} companies · {plan.trialDays} days trial
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={() => setEditingPlan(plan)}
                >
                  <Edit className="h-3 w-3 mr-1.5" />
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Module gating matrix */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Module gating matrix</h2>
          <div className="border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[30%]">Module / route</th>
                  {activePlans.map((p: any) => (
                    <th key={p._id} className="text-left px-4 py-2.5 text-xs font-normal text-muted-foreground w-[23%]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <MatrixRow module="Employee seat limit" plans={activePlans} render={(p: any) => {
                  return (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        defaultValue={p.maxEmployees ?? ""}
                        placeholder="Unlimited"
                        className="h-8 w-24 text-xs"
                        onBlur={(e) => {
                          const val = e.target.value === "" ? null : Number(e.target.value);
                          if (val !== p.maxEmployees) {
                            updatePlanMutation.mutate({
                              id: p._id,
                              data: { ...p, maxEmployees: val }
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value === "" ? null : Number((e.target as HTMLInputElement).value);
                            if (val !== p.maxEmployees) {
                              updatePlanMutation.mutate({
                                id: p._id,
                                data: { ...p, maxEmployees: val }
                              });
                            }
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  );
                }} />
                {activeFeatures.map((f: any) => (
                  <MatrixRow key={f.key} module={f.label} plans={activePlans} render={(p: any) => {
                    const val = p.modules?.[f.key];
                    if (f.type === "select") {
                      return (
                        <Select
                          value={val || f.options?.[0] || "none"}
                          onValueChange={(newVal) => {
                            const updatedModules = { ...p.modules, [f.key]: newVal };
                            updatePlanMutation.mutate({
                              id: p._id,
                              data: { ...p, modules: updatedModules }
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {f.options?.map((opt: string) => (
                              <SelectItem key={opt} value={opt} className="text-xs capitalize">
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    } else {
                      const isEnabled = val === true || val === "full" || val === "basic";
                      return (
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            const updatedModules = { ...p.modules, [f.key]: checked };
                            updatePlanMutation.mutate({
                              id: p._id,
                              data: { ...p, modules: updatedModules }
                            });
                          }}
                        />
                      );
                    }
                  }} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Plan Dialog */}
      {editingPlan && (
        <PlanDialog
          plan={editingPlan}
          features={activeFeatures}
          onClose={() => setEditingPlan(null)}
          queryClient={queryClient}
        />
      )}

      {/* Create Plan Dialog */}
      {showCreate && (
        <PlanDialog
          plan={null}
          features={activeFeatures}
          onClose={() => setShowCreate(false)}
          queryClient={queryClient}
        />
      )}

      {/* Manage Features Dialog */}
      {showFeatures && (
        <FeatureManagerDialog
          features={activeFeatures}
          onClose={() => setShowFeatures(false)}
          queryClient={queryClient}
        />
      )}
    </div>
  );
}

function PlanFeature({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {ok ? (
        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
      ) : (
        <X className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

function MatrixRow({
  module,
  plans,
  render,
}: {
  module: string;
  plans: any[];
  render: (plan: any) => React.ReactNode;
}) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2.5 text-xs">{module}</td>
      {plans.map((p: any) => (
        <td key={p._id} className="px-4 py-2.5">
          {render(p)}
        </td>
      ))}
    </tr>
  );
}

function PlanDialog({
  plan,
  features,
  onClose,
  queryClient,
}: {
  plan: any | null;
  features: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const isEdit = !!plan;
  
  // Initialize dynamic modules
  const initialModules: Record<string, any> = {};
  features.forEach(f => {
    initialModules[f.key] = plan?.modules?.[f.key] ?? (f.type === 'select' ? (f.options[0] || 'none') : false);
  });

  const [form, setForm] = useState({
    name: plan?.name || "",
    slug: plan?.slug || "",
    price: plan?.price || 0,
    annualPrice: plan?.annualPrice || 0,
    maxEmployees: plan?.maxEmployees || "",
    trialDays: plan?.trialDays || 14,
    color: plan?.color || "#1D9E75",
    isFeatured: plan?.isFeatured || false,
    modules: initialModules,
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? updatePlan(plan._id, data) : createPlan(data),
    onSuccess: () => {
      toast.success(isEdit ? "Plan updated" : "Plan created");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed");
    },
  });

  const updateField = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateModule = (key: string, value: any) =>
    setForm((prev) => ({
      ...prev,
      modules: { ...prev.modules, [key]: value },
    }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit ? `Edit — ${plan.name}` : "Create new plan"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-xs" value={form.name} onChange={(e) => updateField("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Slug</Label>
            <Input className="h-8 text-xs" value={form.slug} onChange={(e) => updateField("slug", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Monthly price (₹)</Label>
            <Input className="h-8 text-xs" type="number" value={form.price} onChange={(e) => updateField("price", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Annual price (₹)</Label>
            <Input className="h-8 text-xs" type="number" value={form.annualPrice} onChange={(e) => updateField("annualPrice", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max employees</Label>
            <Input className="h-8 text-xs" placeholder="∞ (leave empty)" value={form.maxEmployees} onChange={(e) => updateField("maxEmployees", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trial days</Label>
            <Input className="h-8 text-xs" type="number" value={form.trialDays} onChange={(e) => updateField("trialDays", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.color} onChange={(e) => updateField("color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
              <Input className="h-8 text-xs flex-1" value={form.color} onChange={(e) => updateField("color", e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch checked={form.isFeatured} onCheckedChange={(v) => updateField("isFeatured", v)} />
            <Label className="text-xs">Featured (Popular badge)</Label>
          </div>
        </div>

        {/* Module toggles */}
        {features.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <Label className="text-xs font-semibold mb-3 block">Module access</Label>
            <div className="space-y-2">
              {features.map((f) => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-xs">{f.label}</span>
                  {f.type === "select" ? (
                    <Select
                      value={form.modules[f.key] as string}
                      onValueChange={(v) => updateModule(f.key, v)}
                    >
                      <SelectTrigger className="h-7 w-24 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options?.map((opt: string) => (
                          <SelectItem key={opt} value={opt} className="text-xs capitalize">{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Switch
                      checked={!!form.modules[f.key]}
                      onCheckedChange={(v) => updateModule(f.key, v)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={mutation.isPending || !form.name || !form.slug}
            onClick={() => {
              const payload = {
                ...form,
                maxEmployees: form.maxEmployees === "" || form.maxEmployees === null ? null : Number(form.maxEmployees),
              };
              mutation.mutate(payload);
            }}
          >
            {mutation.isPending ? "Saving..." : isEdit ? "Save changes" : "Create plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureManagerDialog({
  features,
  onClose,
  queryClient
}: {
  features: any[];
  onClose: () => void;
  queryClient: any;
}) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("boolean");
  const [newOptions, setNewOptions] = useState("none,basic,full"); // default CSV

  const createMutation = useMutation({
    mutationFn: createPlanFeature,
    onSuccess: () => {
      toast.success("Feature created");
      setNewKey("");
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to create feature");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlanFeature,
    onSuccess: () => {
      toast.success("Feature deleted");
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
    },
    onError: (err: any) => {
      toast.error("Failed to delete");
    }
  });

  const handleCreate = () => {
    if (!newKey || !newLabel) return;
    const payload: any = {
      key: newKey,
      label: newLabel,
      type: newType,
    };
    if (newType === 'select') {
      payload.options = newOptions.split(",").map(o => o.trim()).filter(Boolean);
    }
    createMutation.mutate(payload);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Manage Features</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* List existing features */}
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {features.map(f => (
              <div key={f._id} className="flex items-center justify-between p-2 border rounded text-xs bg-muted/20">
                <div>
                  <div className="font-semibold">{f.label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{f.key} ({f.type})</div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this feature? Plans using it will retain data but it will be hidden from UI.")) {
                      deleteMutation.mutate(f._id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {features.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">No features defined.</div>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-3">Add new feature</h4>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px]">Feature Key (camelCase)</Label>
                <Input className="h-7 text-xs" placeholder="e.g. advancedReports" value={newKey} onChange={e => setNewKey(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Label (Display name)</Label>
                <Input className="h-7 text-xs" placeholder="e.g. Advanced Reports" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px]">Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boolean" className="text-xs">Boolean (Toggle)</SelectItem>
                      <SelectItem value="select" className="text-xs">Select (Tiers)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newType === 'select' && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px]">Options (comma separated)</Label>
                    <Input className="h-7 text-xs" placeholder="none,basic,full" value={newOptions} onChange={e => setNewOptions(e.target.value)} />
                  </div>
                )}
              </div>
              <Button 
                size="sm" 
                className="w-full h-7 text-xs" 
                onClick={handleCreate}
                disabled={!newKey || !newLabel || createMutation.isPending}
              >
                Add Feature
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
