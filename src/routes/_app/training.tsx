import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, BookOpen, Search } from "lucide-react";
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
  if (isLoading)   return <SkeletonLoader />;

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
        action={canCreate && (
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
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <DataTable columns={["Training Title", "Trainer", "Start Date", "Status", "Actions"]}>
            {filtered.map((item: any) => (
              <DataTableRow key={item._id}>
                <DataTableCell>{(item as any).title}</DataTableCell>
                <DataTableCell>{(item as any).trainer}</DataTableCell>
                <DataTableCell>{(item as any).startDate}</DataTableCell>
                <DataTableCell>{(item as any).status}</DataTableCell>
                <DataTableCell>
                  <div className="flex gap-2">
                    {canEdit   && <ActionButton icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(item)} label="Edit" />}
                    {canDelete && <ActionButton icon={<Trash2  className="h-3.5 w-3.5" />} onClick={() => setDeleteId(item._id)} label="Delete" variant="destructive" />}
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
                <GridCard>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">
                        {item.name ?? item.title ?? item._id}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{(item as any).trainer}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(item as any).startDate}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canEdit   && <ActionButton icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(item)} label="Edit" />}
                      {canDelete && <ActionButton icon={<Trash2  className="h-3.5 w-3.5" />} onClick={() => setDeleteId(item._id)} label="Delete" variant="destructive" />}
                    </div>
                  </div>
                </GridCard>
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
            <FormInput label="Training Title" value={(form as any).title ?? ""} onChange={(v) => setForm((p) => ({ ...p, title: v }))} />
            <FormInput label="Trainer" value={(form as any).trainer ?? ""} onChange={(v) => setForm((p) => ({ ...p, trainer: v }))} />
            <FormInput label="Start Date" value={(form as any).startDate ?? ""} onChange={(v) => setForm((p) => ({ ...p, startDate: v }))} />
            <FormInput label="Status" value={(form as any).status ?? ""} onChange={(v) => setForm((p) => ({ ...p, status: v }))} />
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
