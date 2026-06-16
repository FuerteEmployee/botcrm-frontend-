import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, MapPin, Search, LayoutGrid, List, Users, Globe, Filter, Crosshair, Loader2, Check, Network } from "lucide-react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api-client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBranchService, type Branch as BackendBranch } from "@/services/branch-service";

import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { Calendar } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { branches: list, isLoading, createBranch, updateBranch, deleteBranch } = useBranchService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendBranch | null>(null);
  const [form, setForm] = useState({
    branchName: "",
    branchLocation: "",
    city: "",
    latitude: 0,
    longitude: 0
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("branches", "create");
  const canEdit = can("branches", "edit");
  const canDelete = can("branches", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);
  const [fetchingLoc, setFetchingLoc] = useState(false);

  // Multi-branch feature toggle (persisted in Settings)
  const [allowMultipleBranches, setAllowMultipleBranches] = useState(false);
  const [savingMulti, setSavingMulti] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get("/settings")
      .then(({ data }) => {
        if (active) setAllowMultipleBranches(!!data?.branchSettings?.allowMultipleBranches);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const toggleMultipleBranches = async (checked: boolean) => {
    setSavingMulti(true);
    setAllowMultipleBranches(checked); // optimistic
    try {
      await apiClient.put("/settings", { branchSettings: { allowMultipleBranches: checked } });
      toast.success(checked ? "Employees can now be assigned to multiple branches" : "Multi-branch assignment disabled");
    } catch (err) {
      setAllowMultipleBranches(!checked); // revert
      toast.error("Failed to update setting");
    } finally {
      setSavingMulti(false);
    }
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setFetchingLoc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          latitude: parseFloat(pos.coords.latitude.toFixed(2)),
          longitude: parseFloat(pos.coords.longitude.toFixed(2))
        }));
        setFetchingLoc(false);
        toast.success("Location fetched and simplified");
      },
      (err) => {
        setFetchingLoc(false);
        toast.error("Failed to fetch location: " + err.message);
      }
    );
  };

  const filtered = list.filter((b) => {
    const matchSearch = b.branchName.toLowerCase().includes(search.toLowerCase()) ||
      b.branchLocation.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const guessCity = (b: BackendBranch): string => {
    if (b.city) return b.city;
    const name = b.branchName.replace(/\b(branch|office|hq|headquarters|hub|center|centre)\b/gi, "").trim();
    if (name && !/\d/.test(name)) return name;
    const parts = b.branchLocation.split(",").map(p => p.trim()).filter(p => p && !/^\d/.test(p) && p.length < 30);
    return parts[0] || "";
  };

  const totalEmployees = list.reduce((s, b) => s + (b.employees || 0), 0);
  const uniqueCities = new Set(list.map((b) => guessCity(b).toLowerCase().trim())).size;

  const openAdd = () => {
    setEditing(null);
    setForm({
      branchName: "",
      branchLocation: "",
      city: "",
      latitude: 0,
      longitude: 0
    });
    setOpen(true);
  };

  const openEdit = (b: BackendBranch) => {
    setEditing(b);
    setForm({
      branchName: b.branchName,
      branchLocation: b.branchLocation,
      city: guessCity(b),
      latitude: b.latitude,
      longitude: b.longitude
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.branchName.trim()) { toast.error("Branch name is required"); return; }

    // Validation: Require at least a reasonable value
    if (form.latitude === 0 || form.longitude === 0) {
      toast.error("Please provide valid coordinates");
      return;
    }

    try {
      if (editing) {
        await updateBranch({ id: editing._id, ...form });
      } else {
        await createBranch(form);
      }
      setOpen(false);
    } catch (err) {
      // Error handled by hook
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteBranch(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branches" description="All office locations in one place." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="All office locations in one place."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Branch"
              onClick={openAdd}
            />
          ) : null
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Branches" value={list.length} icon={MapPin} accent="primary" delay={0} />
        <StatCard label="Total Staff" value={totalEmployees} icon={Users} accent="success" delay={0.05} />
        <StatCard label="Cities Covered" value={uniqueCities} icon={Globe} accent="info" delay={0.1} />
      </div>

      {/* Multi-branch feature toggle */}
      <Card className="p-4 sm:p-5 border border-border/60 bg-white rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-foreground">Multiple branches per employee</p>
              <p className="text-[12px] text-muted-foreground mt-0.5 max-w-xl">
                Turn this on if some employees work across more than one branch. When enabled, you can assign multiple branches to an employee on their profile.
              </p>
            </div>
          </div>
          <Switch
            checked={allowMultipleBranches}
            onCheckedChange={toggleMultipleBranches}
            disabled={savingMulti || !canEdit}
          />
        </div>
      </Card>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
        </div>

        <FormInput
          placeholder="Search branches..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid / List View */}
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
                delay={i * 0.04}
                onEdit={canEdit ? () => openEdit(b) : undefined}
                onDelete={canDelete ? () => setDeleteId(b._id) : undefined}
                metaLeft={{ icon: Users, label: `${b.employees} staff` }}
                metaRight={{ icon: Calendar, label: new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }}
              >
                <div className="mt-3 p-3 rounded-xl bg-muted/20 border border-border/40">
                  <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
                    <span className="text-muted-foreground">Coordinates</span>
                    <span className="text-foreground">{b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/20 w-[40%]" />
                  </div>
                </div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Branch", "Location", "Coordinates", "Staff", "Created At", "Actions"]}
            >
              {filtered.map((b) => (
                <DataTableRow key={b._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-accent/15 text-accent-foreground grid place-items-center shrink-0">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span className="text-[14px] font-medium">{b.branchName}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[14px] text-muted-foreground max-w-[200px] truncate">{b.branchLocation}</DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">
                    {b.latitude.toFixed(2)}, {b.longitude.toFixed(2)}
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className="text-[11px] font-medium bg-primary/5 text-primary border-primary/20">
                      {b.employees || 0} Staff
                    </Badge>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Branch"
                          onClick={() => openEdit(b)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Branch"
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

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] text-muted-foreground">No branches found</p>
          <p className="text-[12px] text-muted-foreground/60 mt-1">Try adjusting your filters or add a new branch.</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
          <div className="p-5">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Branch" : "Add Branch"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Provide the branch's basic information and manager.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Branch Name</label>
                  <FormInput
                    placeholder="e.g. Gurugram"
                    value={form.branchName}
                    onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                    required
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">City</label>
                  <FormInput
                    placeholder="e.g. Rajkot"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    required
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Branch Location (Full Address)</label>
                <FormInput
                  placeholder="e.g. Sector 47, Gurugram"
                  value={form.branchLocation}
                  onChange={(e) => setForm({ ...form, branchLocation: e.target.value })}
                  required
                  className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                />
              </div>
              
              <div className="space-y-1.5 bg-muted/20 p-4 rounded-2xl border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Geographic Coordinates</label>
                  <ActionButton
                    variant="refresh"
                    icon={Crosshair}
                    showLabel
                    label={fetchingLoc ? "Fetching..." : "Auto-detect"}
                    className="h-7 text-[10px] bg-primary/10 text-primary hover:bg-primary hover:text-white border-none gap-1.5 px-3 rounded-lg"
                    onClick={fetchLocation}
                    loading={fetchingLoc}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground/60 ml-1">Latitude</label>
                    <FormInput
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) || 0 })}
                      className="h-9 text-[13px] rounded-xl bg-white/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-muted-foreground/60 ml-1">Longitude</label>
                    <FormInput
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) || 0 })}
                      className="h-9 text-[13px] rounded-xl bg-white/50"
                    />
                  </div>
                </div>
              </div>
              
              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
                <ActionButton 
                  type="submit"
                  variant="add"
                  showLabel
                  label={editing ? "Save Changes" : "Create Branch"}
                  icon={editing ? Check : Plus}
                  className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">Delete branch?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label="Delete Branch"
              onClick={remove}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
