import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Megaphone, Pin, PinOff, Trash2, Search, Info, AlertTriangle, CalendarDays, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/shared/action-button";
import { FormInput } from "@/components/shared/form-input";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormSelect } from "@/components/shared/form-select";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useAnnouncementService, type Announcement, type AnnouncementInput,
  ANNOUNCEMENT_TITLE_MAX, ANNOUNCEMENT_CONTENT_MAX,
} from "@/services/announcement-service";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { usePermission } from "@/hooks/use-permission";
import { AdminLoadError } from "@/components/festivals/admin-load-error";

export const Route = createFileRoute("/_app/announcements")({
  component: AnnouncementsPage,
});

const TYPE_CONFIG = {
  general: { icon: Megaphone, color: "text-primary bg-primary/10", badge: "bg-primary/10 text-primary", label: "General" },
  urgent: { icon: AlertTriangle, color: "text-destructive bg-destructive/10", badge: "bg-destructive/10 text-destructive", label: "Urgent" },
  event: { icon: CalendarDays, color: "text-success bg-success/10", badge: "bg-success/10 text-success", label: "Event" },
  policy: { icon: Info, color: "text-info bg-info/10", badge: "bg-info/10 text-info", label: "Policy" },
};

const EMPTY_FORM: AnnouncementInput = { title: "", content: "", type: "general", pinned: false };

// The day it was posted, in IST and Indian order ("26 Sep 2026"). The stored
// `date` string is US-formatted ("Sep 26, 2026") and was shown as-is.
function postedOn(a: Announcement) {
  const d = a.createdAt ? new Date(a.createdAt) : null;
  if (!d || Number.isNaN(d.getTime())) return a.date || "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function AnnouncementsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const {
    announcements, isLoading, isError, error, refetch, isFetching,
    createAnnouncement, updateAnnouncement, deleteAnnouncement, togglePin,
    isSaving, isDeleting, pinningId,
  } = useAnnouncementService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
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

  const [form, setForm] = useState<AnnouncementInput>(EMPTY_FORM);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  const needle = search.trim().toLowerCase();
  const filtered = announcements
    .filter(a => filterType === "all" || a.type === filterType)
    .filter(a => !needle || (a.title || "").toLowerCase().includes(needle) || (a.content || "").toLowerCase().includes(needle));
  const hasFilters = !!needle || filterType !== "all";
  const loadFailed = isError && announcements.length === 0;

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  // Only the four editable fields. The whole stored document (author, date,
  // createdAt, adminId ...) used to be sent back on every save.
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, content: a.content, type: a.type, pinned: !!a.pinned });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const data: AnnouncementInput = { ...form, title: form.title.trim(), content: form.content.trim() };
    if (!data.title) {
      toast.error("Please enter a title for the notice.");
      return;
    }
    if (!data.content) {
      toast.error("Please write the message for the notice.");
      return;
    }

    try {
      if (editing) {
        await updateAnnouncement({ id: editing._id, data });
      } else {
        await createAnnouncement(data);
      }
      setOpen(false);
    } catch {
      // The service shows the reason; the dialog stays open to fix it.
    }
  };

  const remove = async () => {
    if (!deleting || isDeleting) return;
    try {
      await deleteAnnouncement(deleting._id);
      setDeleting(null);
    } catch {
      // The service shows the reason.
    }
  };

  const pin = (a: Announcement) => {
    if (pinningId) return;
    togglePin(a._id).catch(() => { /* the service shows the reason */ });
  };

  // 40px buttons (the shared GridCard ones are 36px).
  const rowActions = (a: Announcement) => (
    <div className="flex items-center gap-1.5">
      {canEdit && (
        <ActionButton
          variant="ghost"
          icon={a.pinned ? PinOff : Pin}
          tooltip={a.pinned ? "Unpin" : "Pin to top"}
          aria-label={a.pinned ? `Unpin ${a.title}` : `Pin ${a.title} to the top`}
          loading={pinningId === a._id}
          onClick={() => pin(a)}
          className="h-10 w-10 border border-amber-500/20 text-amber-700 bg-amber-500/5"
        />
      )}
      {canEdit && (
        <ActionButton variant="edit" tooltip="Edit notice" aria-label={`Edit ${a.title}`} onClick={() => openEdit(a)} className="h-10 w-10" />
      )}
      {canDelete && (
        <ActionButton variant="delete" tooltip="Delete notice" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)} className="h-10 w-10" />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notice Board"
        description="Broadcast important updates, events, and policies to the organization."
        actions={
          canCreate && !loadFailed ? (
            <ActionButton
              variant="add"
              showLabel
              label="Post Notice"
              onClick={openCreate}
            />
          ) : null
        }
      />

      {loadFailed ? (
        <AdminLoadError what="the notices" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : (
        <>
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
            <div className="flex flex-row items-center gap-3 w-full md:w-auto">
              <ViewToggle view={view} onViewChange={updateDefaultLayout} />

              <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | Announcement["type"])}>
                <SelectTrigger aria-label="Filter by type" className="h-11 w-full md:w-[180px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
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
              aria-label="Search notices"
              icon={Search}
              containerClassName="w-full md:w-auto"
              className="h-11 w-full md:w-[260px] shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <SkeletonLoader key="loading" type={view === "grid" ? "card" : "table"} count={6} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60 bg-white/40">
              <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              {announcements.length === 0 ? (
                <>
                  <p className="text-[15px] font-bold text-foreground">No notices yet</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Post a notice and every employee can read it in the app, under Announcements.</p>
                  {canCreate && <ActionButton variant="add" showLabel label="Post Notice" onClick={openCreate} className="mt-5 h-11" />}
                </>
              ) : (
                <>
                  <p className="text-[15px] font-bold text-foreground">No notices match</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Try another word, or show all categories.</p>
                  {hasFilters && (
                    <Button variant="outline" className="mt-5 h-11 rounded-xl" onClick={() => { setSearch(""); setFilterType("all"); }}>
                      Clear search and filters
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {view === "grid" ? (
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
                        subtitle={`${announcement.author} • ${postedOn(announcement)}`}
                        icon={<Icon className={cn("h-5 w-5", config.color.split(" ")[0])} />}
                        delay={Math.min(i, 12) * 0.05}
                        actions={rowActions(announcement)}
                      >
                        <div className="mt-2 text-[13px] text-muted-foreground line-clamp-3 leading-relaxed mb-1 whitespace-pre-line break-words">
                          {announcement.content}
                        </div>
                        <div className="mt-auto pt-3 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("text-[11px] font-bold uppercase px-2 py-0.5 border-transparent", config.badge)}>
                            {config.label}
                          </Badge>
                          {announcement.pinned && (
                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-200/50 text-[11px] font-bold px-2 py-0.5 rounded-md gap-1">
                              <Pin className="h-3 w-3" /> Pinned
                            </Badge>
                          )}
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
                  <DataTable headers={["Type", "Notice", "Posted By", "Date", "Actions"]}>
                    {filtered.map((a) => (
                      <DataTableRow key={a._id}>
                        <DataTableCell isFirst>
                          <Badge variant="outline" className={cn("text-[11px] font-bold uppercase px-2 py-0.5 rounded-full", TYPE_CONFIG[a.type]?.badge)}>
                            {TYPE_CONFIG[a.type]?.label || a.type}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell>
                          <div className="flex flex-col min-w-0 max-w-[420px]">
                            <div className="flex items-center gap-1.5">
                              {a.pinned && <Pin aria-label="Pinned" className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                              <span className="text-[14px] font-semibold break-words">{a.title}</span>
                            </div>
                            <p className="text-[12px] text-muted-foreground line-clamp-1 break-all">{a.content}</p>
                          </div>
                        </DataTableCell>
                        <DataTableCell className="text-[13px] font-medium">{a.author}</DataTableCell>
                        <DataTableCell className="text-[13px] text-muted-foreground whitespace-nowrap">{postedOn(a)}</DataTableCell>
                        <DataTableCell isLast>
                          <div className="flex justify-end">{rowActions(a)}</div>
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTable>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!isSaving) setOpen(o); }}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-xl max-h-[90vh] flex flex-col">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80 shrink-0" />
          <div className="p-5 flex-1 flex flex-col min-h-0">
            <DialogHeader className="mb-4 shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner shrink-0">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Notice" : "Post Notice"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Every employee in your company can read this in the app, under Announcements.</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={submit} noValidate className="flex-1 flex flex-col min-h-0">
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0 px-0.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="notice-title" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Title</label>
                    <FormInput
                      id="notice-title"
                      value={form.title}
                      maxLength={ANNOUNCEMENT_TITLE_MAX}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Office closed on Friday"
                      className="h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Category</label>
                    <FormSelect
                      label="Category"
                      value={form.type}
                      onValueChange={(v) => setForm({ ...form, type: v as Announcement["type"] })}
                      options={[
                        { label: "General Notice", value: "general" },
                        { label: "Urgent Alert", value: "urgent" },
                        { label: "Company Event", value: "event" },
                        { label: "Policy Update", value: "policy" },
                      ]}
                      className="h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="notice-content" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Message</label>
                  <Textarea
                    id="notice-content"
                    className="min-h-[140px] text-[13px] rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm resize-y p-4 leading-relaxed"
                    value={form.content}
                    maxLength={ANNOUNCEMENT_CONTENT_MAX}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="Write the full notice here..."
                  />
                  <p className="text-right text-[11px] text-muted-foreground">{form.content.length}/{ANNOUNCEMENT_CONTENT_MAX}</p>
                </div>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={form.pinned}
                  onClick={() => setForm({ ...form, pinned: !form.pinned })}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 -mx-2 hover:bg-muted/40 transition-colors text-left"
                >
                  <span className={cn(
                    "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                    form.pinned ? "bg-primary border-primary" : "border-border/80"
                  )}>
                    {form.pinned && <Pin className="h-3 w-3 text-white fill-white rotate-45" />}
                  </span>
                  <span className="text-[13px] font-bold text-muted-foreground">Pin to the top of the board</span>
                </button>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-2 shrink-0">
                <Button type="button" variant="ghost" disabled={isSaving} onClick={() => setOpen(false)} className="rounded-xl h-11 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Cancel</Button>
                <ActionButton
                  type="submit"
                  variant="add"
                  showLabel
                  label={isSaving ? "Saving..." : editing ? "Save Notice" : "Post Notice"}
                  loading={isSaving}
                  disabled={isSaving}
                  className="px-8 h-11 rounded-xl text-[14px] shadow-lg shadow-primary/20"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o && !isDeleting) setDeleting(null); }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px] break-words">Delete {deleting ? `"${deleting.title}"` : "this notice"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">Employees will no longer see it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl h-11 px-6 font-bold border-border/40 hover:bg-muted/50 transition-all text-[13px]">Keep Notice</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label={isDeleting ? "Deleting..." : "Delete Notice"}
              loading={isDeleting}
              disabled={isDeleting}
              onClick={remove}
              className="h-11 px-6 font-bold shadow-lg shadow-destructive/20"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
