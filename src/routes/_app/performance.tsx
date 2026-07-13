import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Star, Search } from "lucide-react";
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
import { usePerformanceReviewService, type PerformanceReview as BackendPerformanceReview } from "@/services/performance-service";

export const Route = createFileRoute("/_app/performance")({
  component: PerformanceReviewPage,
});

function PerformanceReviewPage() {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  const {
    items, isLoading,
    createItem, updateItem, deleteItem,
  } = usePerformanceReviewService();

  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState<BackendPerformanceReview | null>(null);
  const [form,     setForm]     = useState<Partial<BackendPerformanceReview>>({ period: "", rating: "", comments: "", status: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search,   setSearch]   = useState("");
  const { defaultLayout }       = useLayoutSettings();
  const [view, setView]         = useState<"grid" | "list">(defaultLayout);
  const { can }                 = usePermission();

  const canCreate = can("performance", "create");
  const canEdit   = can("performance", "edit");
  const canDelete = can("performance", "delete");

  if (!hasMounted) return null;
  if (isLoading)   return <SkeletonLoader />;

  const filtered = (items as any[]).filter((r) =>
    (r.name ?? r.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ period: "", rating: "", comments: "", status: "" });
    setOpen(true);
  };
  const openEdit = (item: BackendPerformanceReview) => {
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
        title="Performance Reviews"
        description="Manage all performance reviews records"
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
            placeholder="Search performance reviews..."
            className="w-full pl-10 pr-4 h-9 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <DataTable columns={["Review Period", "Rating (1-5)", "Comments", "Status", "Actions"]}>
            {filtered.map((item: any) => (
              <DataTableRow key={item._id}>
                <DataTableCell>{(item as any).period}</DataTableCell>
                <DataTableCell>{(item as any).rating}</DataTableCell>
                <DataTableCell>{(item as any).comments}</DataTableCell>
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
                      <p className="text-xs text-muted-foreground mt-0.5">{(item as any).period}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(item as any).rating}</p>
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
            <DialogTitle>{editing ? "Edit" : "Add"} Performance Reviews</DialogTitle>
            <DialogDescription>Fill in the details and save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormInput label="Review Period" value={(form as any).period ?? ""} onChange={(v) => setForm((p) => ({ ...p, period: v }))} />
            <FormInput label="Rating (1-5)" value={(form as any).rating ?? ""} onChange={(v) => setForm((p) => ({ ...p, rating: v }))} />
            <FormInput label="Comments" value={(form as any).comments ?? ""} onChange={(v) => setForm((p) => ({ ...p, comments: v }))} />
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
