import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Building2, Search, LayoutGrid, List, Users, Crown, Calendar, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { FormInput } from "@/components/shared/form-input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDepartmentService, type Department as BackendDept } from "@/services/department-service";

import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { departments: list, isLoading, createDepartment, updateDepartment, deleteDepartment } = useDepartmentService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendDept | null>(null);
  const [form, setForm] = useState({ name: "", colorCode: "#6366f1" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("departments", "create");
  const canEdit = can("departments", "edit");
  const canDelete = can("departments", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const filtered = list.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalEmployees = list.reduce((s, d) => s + (d.employees || 0), 0);

  const openAdd = () => { setEditing(null); setForm({ name: "", colorCode: "#6366f1" }); setOpen(true); };
  const openEdit = (d: BackendDept) => { setEditing(d); setForm({ name: d.name, colorCode: d.colorCode }); setOpen(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }

    try {
      if (editing) {
        await updateDepartment({ id: editing._id, ...form });
      } else {
        await createDepartment(form);
      }
      setOpen(false);
    } catch (err) {
      // Error handled by hook
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteDepartment(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Departments" description="Organise teams and manage department branding colors." />
        <SkeletonLoader type="stats" count={2} />
        <SkeletonLoader type="card" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Organise teams and manage department branding colors."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Department"
              onClick={openAdd}
            />
          ) : null
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid View */}
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
                iconBgColor={d.colorCode}
                delay={i * 0.04}
                onEdit={canEdit ? () => openEdit(d) : undefined}
                onDelete={canDelete ? () => setDeleteId(d._id) : undefined}
                metaLeft={{ icon: Users, label: `${d.employees || 0} staff` }}
                metaRight={{ icon: Calendar, label: new Date(d.createdAt).toLocaleDateString() }}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Color", "Department Name", "Employee Count", "Created", "Actions"]}
            >
              {filtered.map((d) => (
                <DataTableRow key={d._id}>
                  <DataTableCell isFirst>
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: d.colorCode }}
                    >
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <span className="text-[14px] font-medium">{d.name}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">{d.employees}</Badge>
                  </DataTableCell>
                  <DataTableCell className="text-[14px] text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ')}
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Department"
                          onClick={() => openEdit(d)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Department"
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

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] text-muted-foreground">No departments found</p>
          <p className="text-[12px] text-muted-foreground/60 mt-1">Try adjusting your search or add a new department.</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
          <div className="p-5">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Department" : "Add Department"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Manage your team structure and branding.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Department Name</label>
                  <FormInput
                    placeholder="e.g. Engineering"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Theme Color</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <FormInput
                        label=""
                        className="h-10 pl-12 text-[13px] rounded-xl border-border/40 bg-muted/30 font-mono uppercase focus:bg-white transition-all shadow-sm"
                        value={form.colorCode}
                        onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                        placeholder="#000000"
                        containerClassName="space-y-0"
                      />
                      <div
                        className="absolute left-3 top-[7px] h-6 w-6 rounded-lg border border-border/40 shadow-sm transition-transform active:scale-95 cursor-pointer overflow-hidden z-10"
                        style={{ backgroundColor: form.colorCode }}
                      >
                        <input
                          type="color"
                          className="absolute inset-0 opacity-0 cursor-pointer scale-150"
                          value={form.colorCode}
                          onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-2">
                <p className="text-[11px] text-muted-foreground/60 italic">* Choose a unique color to distinguish this department in the main dashboard.</p>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
                <ActionButton 
                  type="submit"
                  variant="add"
                  showLabel
                  label={editing ? "Update Dept" : "Create Department"}
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
        <AlertDialogContent className="rounded-2xl border-destructive/20 shadow-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">Delete department?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">This action cannot be undone. All employee associations will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label="Delete Department"
              onClick={remove}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
