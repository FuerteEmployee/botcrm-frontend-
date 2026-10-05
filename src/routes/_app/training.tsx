import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, BookOpen, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader }     from "@/components/shared/page-header";
import { ActionButton }   from "@/components/shared/action-button";
import { Button }         from "@/components/ui/button";
import { GridCard }       from "@/components/shared/grid-card";
import { FormInput }      from "@/components/shared/form-input";
import { ViewToggle }     from "@/components/shared/view-toggle";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings }  from "@/hooks/use-layout-settings";
import { usePermission }      from "@/hooks/use-permission";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTrainingService, type Training as BackendTraining } from "@/services/training-service";

export const Route = createFileRoute("/_app/training")({
  component: TrainingPage,
});

function TrainingPage() {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  const {
    items, isLoading,
    createItem, updateItem, deleteItem,
  } = useTrainingService();

  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState<BackendTraining | null>(null);
  const [form,     setForm]     = useState<Partial<BackendTraining>>({ title: "", trainer: "", startDate: "", status: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search,   setSearch]   = useState("");
  const { defaultLayout }       = useLayoutSettings();
  const [view, setView]         = useState<"grid" | "list">(defaultLayout);
  const { can }                 = usePermission();

  const canCreate = can("training", "create");
  const canEdit   = can("training", "edit");
  const canDelete = can("training", "delete");

  if (!hasMounted) return null;
  if (isLoading)   return <SkeletonLoader type="table" />;

  const filtered = (items as any[]).filter((r) =>
    (r.name ?? r.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", trainer: "", startDate: "", status: "" });
    setOpen(true);
  };
  const openEdit = (item: BackendTraining) => {
    setEditing(item);
    setForm(item);
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await updateItem({ ...form, id: editing._id } as any);
      else         await createItem(form as any);
      setOpen(false);
    } catch { /* toast shown in service */ }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteItem(deleteId); setDeleteId(null); } catch {}
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ── */}
      <PageHeader
        title="Training & Development"
        description="Manage all training & development records"
        actions={canCreate && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />Add New
          </Button>
        )}
      />

      {/* ── Search + View Toggle ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search training & development..."
            className="w-full pl-10 pr-4 h-9 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <ViewToggle view={view} onViewChange={setView} />
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <DataTable headers={["Training Title", "Trainer", "Start Date", "Status", "Actions"]}>
            {filtered.map((item: any) => (
              <DataTableRow key={item._id}>
                <DataTableCell>{(item as any).title}</DataTableCell>
                <DataTableCell>{(item as any).trainer}</DataTableCell>
                <DataTableCell>{(item as any).startDate}</DataTableCell>
                <DataTableCell>{(item as any).status}</DataTableCell>
                <DataTableCell>
                  <div className="flex gap-2">
                    {canEdit   && <ActionButton variant="edit" tooltip="Edit" onClick={() => openEdit(item)} />}
                    {canDelete && <ActionButton variant="delete" tooltip="Delete" onClick={() => setDeleteId(item._id)} />}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((item: any, i: number) => (
              <motion.div
                key={item._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <GridCard
                  title={String(item.name ?? item.title ?? item._id)}
                  subtitle={[item.trainer, item.startDate].filter((v) => v !== undefined && v !== null && v !== "").join(" · ")}
                  icon={<BookOpen className="h-5 w-5 text-primary" />}
                  onEdit={canEdit ? () => openEdit(item) : undefined}
                  onDelete={canDelete ? () => setDeleteId(item._id) : undefined}
                />
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Training & Development</DialogTitle>
            <DialogDescription>Fill in the details and save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormInput label="Training Title" value={form.title ?? ""} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            <FormInput label="Trainer" value={form.trainer ?? ""} onChange={(e) => setForm((p) => ({ ...p, trainer: e.target.value }))} />
            <FormInput label="Start Date" type="date" value={form.startDate ?? ""} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            <FormInput label="Status" value={form.status ?? ""} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save Changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
