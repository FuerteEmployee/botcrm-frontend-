import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plus, Megaphone, BellRing, Pin, Pencil, Trash2, Search, Info, AlertTriangle, CalendarDays, Filter, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/shared/action-button";
import { FormInput } from "@/components/shared/form-input";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormSelect } from "@/components/shared/form-select";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAnnouncementService, type Announcement } from "@/services/announcement-service";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/announcements")({
  component: AnnouncementsPage,
});

const TYPE_CONFIG = {
  general: { icon: Megaphone, color: "text-primary bg-primary/10", border: "border-primary/20", badge: "bg-primary/10 text-primary" },
  urgent: { icon: AlertTriangle, color: "text-destructive bg-destructive/10", border: "border-destructive/30", badge: "bg-destructive/10 text-destructive" },
  event: { icon: CalendarDays, color: "text-success bg-success/10", border: "border-success/30", badge: "bg-success/10 text-success" },
  policy: { icon: Info, color: "text-info bg-info/10", border: "border-info/30", badge: "bg-info/10 text-info" },
};

function AnnouncementsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { announcements, isLoading, createAnnouncement, updateAnnouncement, deleteAnnouncement, togglePin } = useAnnouncementService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | Announcement["type"]>("all");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("announcements", "create");
  const canEdit = can("announcements", "edit");
  const canDelete = can("announcements", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [form, setForm] = useState({ title: "", content: "", type: "general" as Announcement["type"], pinned: false });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const filtered = announcements
    .filter(a => filterType === "all" || a.type === filterType)
    .filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    try {
      if (editing) {
        await updateAnnouncement({ id: editing._id, data: form });
      } else {
        await createAnnouncement(form);
      }
      setOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    await deleteAnnouncement(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notice Board"
        description="Broadcast important updates, events, and policies to the organization."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Post Announcement"
              onClick={() => { setEditing(null); setForm({ title: "", content: "", type: "general", pinned: false }); setOpen(true); }}
            />
          ) : null
        }
      />

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
          
          <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | any)}>
            <SelectTrigger className="h-10 w-full md:w-[180px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
              <Filter className="h-3.5 w-3.5" />
              <SelectValue placeholder="Filter by Category" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="policy">Policy</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FormInput
          placeholder="Search notices..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <SkeletonLoader key="loading" type={view === "grid" ? "card" : "table"} count={6} />
        ) : view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((announcement, i) => {
              const config = TYPE_CONFIG[announcement.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.general;
              const Icon = config.icon;

              return (
                <GridCard
                  key={announcement._id}
                  title={announcement.title}
                  subtitle={`${announcement.author} • ${announcement.date || new Date(announcement.createdAt).toLocaleDateString()}`}
                  icon={<Icon className={cn("h-5 w-5", config.color.split(" ")[0])} />}
                  delay={i * 0.05}
                  onEdit={canEdit ? () => { setEditing(announcement); setForm(announcement); setOpen(true); } : undefined}
                  onDelete={canDelete ? () => setDeleteId(announcement._id) : undefined}
                  statusNode={
                    announcement.pinned && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-200/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md gap-1">
                        <Pin className="h-2.5 w-2.5 fill-amber-600/20" /> PINNED
                      </Badge>
                    )
                  }
                >
                  <div className="mt-2 text-[13px] text-muted-foreground line-clamp-3 leading-relaxed mb-1">
                    {announcement.content}
                  </div>
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase px-2 py-0.5 border-transparent", config.badge)}>
                      {announcement.type}
                    </Badge>
                  </div>
                </GridCard>
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
              headers={["Type", "Announcement Details", "Posted By", "Date", "Actions"]}
            >
              {filtered.map((a) => (
                <DataTableRow key={a._id}>
                  <DataTableCell isFirst>
                    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", TYPE_CONFIG[a.type]?.badge)}>
                      {a.type}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        {a.pinned && <Pin className="h-3 w-3 text-primary fill-primary/20 rotate-45" />}
                        <span className="text-[14px] font-semibold">{a.title}</span>
                      </div>
                      <p className="text-[12px] text-muted-foreground line-clamp-1">{a.content}</p>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-medium">{a.author}</DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">{a.date}</DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Announcement"
                          onClick={() => { setEditing(a); setForm(a); setOpen(true); }}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Announcement"
                          onClick={() => setDeleteId(a._id)}
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
        <div className="text-center py-16">
          <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">No announcements found</p>
          <p className="text-[12px] text-muted-foreground/60 mt-1">Adjust your search or create a new post.</p>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
          <div className="p-5">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Announcement" : "Post Announcement"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">This will be visible to all employees on their dashboard.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Announcement Title</label>
                  <FormInput
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Annual Company Offsite"
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Category Type</label>
                  <FormSelect
                    label="Category Type"
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as any })}
                    options={[
                      { label: "General Notice", value: "general" },
                      { label: "Urgent Alert", value: "urgent" },
                      { label: "Company Event", value: "event" },
                      { label: "Policy Update", value: "policy" },
                    ]}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Message Details</label>
                <Textarea
                  className="min-h-[120px] text-[13px] rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm resize-none p-4 leading-relaxed"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Write the full announcement here..."
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => setForm({ ...form, pinned: !form.pinned })}>
                  <div className={cn(
                    "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                    form.pinned ? "bg-primary border-primary" : "border-border/60"
                  )}>
                    {form.pinned && <Pin className="h-3 w-3 text-white fill-white rotate-45" />}
                  </div>
                  <span className="text-[12px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Pin to top of the board</span>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
                <ActionButton 
                  type="submit" 
                  variant="add" 
                  showLabel 
                  label={editing ? "Update Post" : "Publish Announcement"}
                  className="px-8 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
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
            <AlertDialogTitle className="text-[16px]">Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">This will permanently remove the notice from the board. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-xl h-10 px-6 font-bold border-border/40 hover:bg-muted/50 transition-all text-[13px]">Keep Post</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label="Delete Post"
              onClick={remove}
              className="h-10 px-6 font-bold shadow-lg shadow-destructive/20"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
