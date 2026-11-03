import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  CalendarHeart, Trash2, Search, Gift, Sparkles,
  CalendarDays, PartyPopper, Filter, Calendar, Clock, Check, AlertTriangle, Info,
} from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useFestivalService, type Festival as BackendFestival,
  FESTIVAL_NAME_MAX, FESTIVAL_DESCRIPTION_MAX, FESTIVAL_MAX_SPAN_DAYS, FESTIVAL_POSTER_MAX_BYTES, FESTIVAL_POSTER_TYPES,
  parseFestivalDay, todayFestivalKey, festivalSpanDays, formatFestivalRange,
} from "@/services/festival-service";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { AdminLoadError } from "@/components/festivals/admin-load-error";

export const Route = createFileRoute("/_app/festivals")({
  component: FestivalsPage,
});

type FestivalType = "mandatory" | "optional" | "event";

const TYPE_CONFIG = {
  mandatory: {
    icon: CalendarHeart,
    color: "text-primary bg-primary/10",
    label: "Mandatory Holiday",
  },
  optional: {
    icon: Sparkles,
    color: "text-amber-700 bg-amber-500/10",
    label: "Optional Holiday",
  },
  event: {
    icon: PartyPopper,
    color: "text-blue-700 bg-blue-500/10",
    label: "Company Event",
  },
};

const EMPTY_FORM = { name: "", startDate: "", endDate: "", type: "mandatory" as FestivalType, description: "" };

// What is wrong with the dates, in words, or null. The server refuses the
// same things (festival_controller.js), this just says so before a round trip.
function dateProblem(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return null;
  if (endDate < startDate) return "The end date cannot be before the start date.";
  const span = festivalSpanDays(startDate, endDate);
  if (span > FESTIVAL_MAX_SPAN_DAYS) {
    return `A holiday can be at most ${FESTIVAL_MAX_SPAN_DAYS} days long (this is ${span}). Add a longer break as separate holidays.`;
  }
  return null;
}

function FestivalsPage() {
  const {
    festivals: list, isLoading, isFetching, isError, error, refetch,
    createFestival, updateFestival, deleteFestival, isCreating, isUpdating, isDeleting,
  } = useFestivalService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendFestival | null>(null);
  const [deleting, setDeleting] = useState<BackendFestival | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | FestivalType>("all");
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const [hasMounted, setHasMounted] = useState(false);
  const { can } = usePermission();
  const canCreate = can("festivals", "create");
  const canEdit = can("festivals", "edit");
  const canDelete = can("festivals", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const [form, setForm] = useState(EMPTY_FORM);
  const [poster, setPoster] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  if (!hasMounted) return null;

  const todayKey = todayFestivalKey();
  const isOver = (f: BackendFestival) => (f.endDate || f.startDate) < todayKey;

  // What is still ahead first (soonest at the top), then what is over (most
  // recent first). In plain date order an admin in October scrolled past every
  // holiday since January -- and every earlier year -- to reach the next one.
  const needle = search.trim().toLowerCase();
  const filtered = list
    .filter((f) => filterType === "all" || f.type === filterType)
    .filter((f) => !needle || (f.name || "").toLowerCase().includes(needle) || (f.description || "").toLowerCase().includes(needle))
    .sort((a, b) => {
      const ao = isOver(a), bo = isOver(b);
      if (ao !== bo) return ao ? 1 : -1;
      return ao ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
    });
  const hasFilters = !!needle || filterType !== "all";

  // "Upcoming" includes a holiday that is on today or already running.
  const upcomingCount = list.filter((f) => !isOver(f)).length;
  const mandatoryCount = list.filter((f) => f.type === "mandatory").length;

  const formDateProblem = dateProblem(form.startDate, form.endDate);
  const formIsPast = !!form.startDate && form.startDate < todayKey;
  const saving = isCreating || isUpdating;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPoster(null);
    setPreview(null);
    setOpen(true);
  };
  const openEdit = (festival: BackendFestival) => {
    setEditing(festival);
    setForm({
      name: festival.name,
      startDate: festival.startDate,
      endDate: festival.endDate || festival.startDate,
      type: festival.type,
      description: festival.description || "",
    });
    setPreview(festival.posterUrl || null);
    setPoster(null);
    setOpen(true);
  };

  const pickPoster = (file: File | undefined) => {
    if (!file) return;
    if (!FESTIVAL_POSTER_TYPES.includes(file.type)) {
      toast.error("This picture type cannot be used. Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > FESTIVAL_POSTER_MAX_BYTES) {
      toast.error("This picture is too big. Please choose one smaller than 5 MB.");
      return;
    }
    setPoster(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name || !form.startDate || !form.endDate) {
      toast.error("Please enter the holiday name, start date and end date.");
      return;
    }
    if (name.length < 2) {
      toast.error("The holiday name is too short. Please enter at least 2 letters.");
      return;
    }
    if (formDateProblem) {
      toast.error(formDateProblem);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("startDate", form.startDate);
      formData.append("endDate", form.endDate);
      formData.append("type", form.type);
      formData.append("description", form.description.trim());

      if (poster) {
        formData.append("poster", poster);
      } else if (editing && editing.posterUrl && !preview) {
        formData.append("removePoster", "true");
      }

      if (editing) {
        await updateFestival({ id: editing._id, formData });
      } else {
        await createFestival(formData);
      }
      setOpen(false);
      setPoster(null);
      setPreview(null);
    } catch {
      // The service shows the reason; the dialog stays open to fix it.
    }
  };

  const remove = async () => {
    if (!deleting || isDeleting) return;
    try {
      await deleteFestival(deleting._id);
      setDeleting(null);
    } catch {
      // The service shows the reason.
    }
  };

  const editButton = (festival: BackendFestival) =>
    canEdit ? (
      <ActionButton
        variant="edit"
        tooltip="Edit holiday"
        aria-label={`Edit ${festival.name}`}
        className="h-10 w-10"
        onClick={() => openEdit(festival)}
      />
    ) : null;
  const deleteButton = (festival: BackendFestival) =>
    canDelete ? (
      <ActionButton
        variant="delete"
        tooltip="Delete holiday"
        aria-label={`Delete ${festival.name}`}
        className="h-10 w-10"
        onClick={() => setDeleting(festival)}
      />
    ) : null;

  if (isLoading || (list.length === 0 && isFetching && !isError)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Festivals & Holidays" description="Manage the company's annual holiday calendar and upcoming events." />
        <SkeletonLoader type="stats" count={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="h-[220px] rounded-2xl border-border/40 animate-pulse bg-muted/20" />
          ))}
        </div>
      </div>
    );
  }

  const loadFailed = isError && list.length === 0;

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Festivals & Holidays"
        description="Manage the company's annual holiday calendar and upcoming events."
        actions={
          canCreate && !loadFailed ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Holiday"
              onClick={openCreate}
              className="h-10 px-6 shadow-lg shadow-primary/20"
            />
          ) : null
        }
      />

      {loadFailed ? (
        <AdminLoadError what="the holiday list" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard label="Total Holidays" value={list.length} icon={CalendarDays} accent="primary" delay={0} />
            <StatCard label="Mandatory" value={mandatoryCount} icon={CalendarHeart} accent="success" delay={0.05} />
            <StatCard label="Upcoming" value={upcomingCount} icon={Gift} accent="warning" delay={0.1} />
          </div>

          {/* Filters Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row items-center justify-between gap-4 p-2 bg-card/50 backdrop-blur-md rounded-2xl border border-border/40 shadow-sm"
          >
            <div className="flex items-center gap-3 w-full md:w-auto">
              <ViewToggle view={view} onViewChange={updateDefaultLayout} />

              <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | FestivalType)}>
                <SelectTrigger aria-label="Filter by type" className="h-11 w-full md:w-[200px] border-border/40 bg-card/80 hover:bg-card rounded-xl text-[13px] font-medium transition-all gap-2 px-4 shadow-sm focus:ring-primary/20">
                  <Filter className="h-4 w-4 text-primary/70" />
                  <SelectValue placeholder="All Holiday Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60 shadow-xl">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="mandatory">Mandatory Holidays</SelectItem>
                  <SelectItem value="optional">Optional Holidays</SelectItem>
                  <SelectItem value="event">Company Events</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full md:w-[320px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <FormInput
                placeholder="Search holidays..."
                aria-label="Search holidays"
                className="h-11 w-full pl-10 pr-4 bg-card/80 border-border/40 rounded-xl shadow-sm focus:ring-primary/20 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </motion.div>

          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16 px-4 bg-white/40 backdrop-blur-sm rounded-[32px] border border-dashed border-border/60"
            >
              <div className="h-20 w-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <Gift className="h-10 w-10 text-primary/30" />
              </div>
              {list.length === 0 ? (
                <>
                  <h3 className="text-lg font-bold text-foreground">No holidays added yet</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[340px] mx-auto">
                    Add the days the office is closed. Employees see them in the app, and attendance and salary count them as paid days off.
                  </p>
                  {canCreate && (
                    <ActionButton variant="add" showLabel label="Add Holiday" onClick={openCreate} className="mt-6 h-11 px-6" />
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-foreground">No holidays match</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[300px] mx-auto">Try another word, or show all types.</p>
                  {hasFilters && (
                    <Button
                      variant="outline"
                      onClick={() => { setSearch(""); setFilterType("all"); }}
                      className="mt-6 h-11 rounded-xl"
                    >
                      Clear search and filters
                    </Button>
                  )}
                </>
              )}
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              {view === "grid" ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {filtered.map((festival, i) => {
                    const config = TYPE_CONFIG[festival.type as FestivalType] || TYPE_CONFIG.mandatory;
                    const Icon = config.icon;
                    const endKey = festival.endDate || festival.startDate;
                    const start = parseFestivalDay(festival.startDate);
                    const month = start.toLocaleString("en-IN", { month: "short" });
                    const day = start.getDate();
                    const isPast = isOver(festival);
                    const isToday = festival.startDate <= todayKey && todayKey <= endKey;
                    const diffDays = festivalSpanDays(festival.startDate, endKey);
                    const weekday = start.toLocaleDateString("en-IN", { weekday: "long" });

                    return (
                      <motion.div
                        key={festival._id}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.05 }}
                      >
                        <Card className={cn(
                          "relative overflow-hidden p-0 border border-border/60 bg-card/70 backdrop-blur-xl rounded-[24px] shadow-sm transition-all duration-500 group hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 h-full flex flex-col",
                          isPast && "opacity-75",
                          isToday && "border-emerald-300 ring-1 ring-emerald-200"
                        )}>

                          <div className="p-5 sm:p-6 flex flex-col flex-1">
                            <div className="flex gap-4 mb-5 min-w-0">
                              {/* Date Block */}
                              <div className={cn(
                                "h-16 w-14 rounded-2xl flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-sm",
                                isPast ? "bg-muted/50" : "bg-linear-to-b from-white to-muted/20"
                              )}>
                                <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary/70">{month}</span>
                                <span className="text-[22px] font-black text-foreground leading-tight">{day}</span>
                              </div>

                              {/* Small Poster Square */}
                              {festival.posterUrl && !brokenImages[festival._id] && (
                                <div className="h-16 w-16 rounded-2xl overflow-hidden border border-border/50 shrink-0 shadow-sm">
                                  <img
                                    src={festival.posterUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={() => setBrokenImages(prev => ({ ...prev, [festival._id]: true }))}
                                  />
                                </div>
                              )}

                              <div className="flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <h3 className="text-[17px] font-bold text-foreground leading-tight break-words min-w-0">{festival.name}</h3>
                                  {isToday ? (
                                    <Badge className="h-6 text-[11px] px-2 font-bold uppercase tracking-wide bg-emerald-600 text-white border-transparent">Today</Badge>
                                  ) : isPast ? (
                                    <Badge variant="secondary" className="h-6 text-[11px] px-2 font-bold uppercase tracking-wide bg-muted/60 text-muted-foreground border-transparent">Past</Badge>
                                  ) : (
                                    <Badge className="h-6 text-[11px] px-2 font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Upcoming</Badge>
                                  )}
                                </div>
                                <div className="text-[12px] text-muted-foreground flex items-center gap-2 flex-wrap">
                                  <CalendarDays className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                                  <span className="font-medium">
                                    {diffDays === 1 ? `${weekday}, ${formatFestivalRange(festival.startDate, endKey)}` : formatFestivalRange(festival.startDate, endKey)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {festival.description && (
                              <p className="text-[13.5px] text-muted-foreground mb-6 line-clamp-2 leading-relaxed flex-1 break-words border-l-2 border-primary/10 pl-3">
                                {festival.description}
                              </p>
                            )}

                            <div className="pt-4 border-t border-border/40 flex items-center justify-between gap-2 mt-auto">
                              <div className="flex flex-col gap-1 min-w-0">
                                <Badge variant="outline" className={cn("text-[11px] font-bold px-2.5 py-1 rounded-lg border-transparent shadow-sm w-fit", config.color)}>
                                  <Icon className="h-3.5 w-3.5 mr-2" />
                                  {config.label}
                                </Badge>
                                <div className="flex items-center gap-1.5 font-bold text-primary/70 text-[11px] uppercase tracking-wider ml-1 mt-1">
                                  <Clock className="h-3 w-3" /> {diffDays} {diffDays === 1 ? "Day" : "Days"}
                                </div>
                              </div>

                              {/* Always visible: hover-only buttons could not be found on a phone or tablet. */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {editButton(festival)}
                                {deleteButton(festival)}
                              </div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
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
                  <DataTable headers={["Holiday", "Dates & Duration", "Category", "Status", "Actions"]}>
                    {filtered.map((f) => {
                      const endKey = f.endDate || f.startDate;
                      const isPast = isOver(f);
                      const isToday = f.startDate <= todayKey && todayKey <= endKey;
                      const config = TYPE_CONFIG[f.type as FestivalType] || TYPE_CONFIG.mandatory;
                      const Icon = config.icon;
                      const diffDays = festivalSpanDays(f.startDate, endKey);

                      return (
                        <DataTableRow key={f._id} className={cn(isPast && "opacity-80")}>
                          <DataTableCell isFirst>
                            <div className="flex items-center gap-4">
                              {f.posterUrl && !brokenImages[f._id] ? (
                                <div className="h-10 w-10 rounded-xl border border-border/40 overflow-hidden shadow-sm shrink-0">
                                  <img src={f.posterUrl} alt="" className="h-full w-full object-cover" onError={() => setBrokenImages(p => ({ ...p, [f._id]: true }))} />
                                </div>
                              ) : (
                                <div className="h-10 w-10 rounded-xl bg-primary/5 border border-dashed border-primary/20 flex items-center justify-center text-primary/40 shrink-0">
                                  <Gift className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-[14px] text-foreground break-words max-w-[240px]">{f.name}</div>
                                <div className="text-[12px] text-muted-foreground font-medium line-clamp-1 max-w-[220px]">{f.description || "No description"}</div>
                              </div>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5 whitespace-nowrap">
                                <Calendar className="h-3.5 w-3.5 text-primary/60" />
                                {formatFestivalRange(f.startDate, endKey)}
                              </div>
                              <div className="text-[11px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {diffDays} {diffDays === 1 ? "Day" : "Days"}
                              </div>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <Badge variant="outline" className={cn("text-[11px] font-bold px-2.5 py-1 rounded-lg border-transparent shadow-sm whitespace-nowrap", config.color)}>
                              <Icon className="h-3 w-3 mr-2" />
                              {config.label}
                            </Badge>
                          </DataTableCell>
                          <DataTableCell>
                            {isToday ? (
                              <Badge className="h-6 text-[11px] px-2.5 font-bold uppercase bg-emerald-600 text-white border-transparent">Today</Badge>
                            ) : isPast ? (
                              <Badge variant="secondary" className="h-6 text-[11px] px-2.5 font-bold uppercase bg-muted/60 text-muted-foreground border-transparent">Past</Badge>
                            ) : (
                              <Badge className="h-6 text-[11px] px-2.5 font-bold uppercase bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Upcoming</Badge>
                            )}
                          </DataTableCell>
                          <DataTableCell isLast>
                            <div className="flex items-center justify-end gap-1.5">
                              {editButton(f)}
                              {deleteButton(f)}
                            </div>
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-card/95 backdrop-blur-xl max-h-[90vh] flex flex-col">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80 shrink-0" />
          <div className="p-5 flex-1 flex flex-col min-h-0">
            <DialogHeader className="mb-3 shrink-0">
              <div className="flex items-center gap-4 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner shrink-0">
                  <PartyPopper className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Employees see this in the app. Attendance and salary count it as a day off.</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={submit} noValidate className="flex-1 flex flex-col min-h-0">
              <div className="space-y-4 flex-1 overflow-y-auto min-h-0 px-0.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="festival-name" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Holiday Name</label>
                    <FormInput
                      id="festival-name"
                      placeholder="e.g. Diwali"
                      value={form.name}
                      maxLength={FESTIVAL_NAME_MAX}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Holiday Type</label>
                    <FormSelect
                      label="Holiday Type"
                      value={form.type}
                      onValueChange={(v) => setForm({ ...form, type: v as FestivalType })}
                      options={[
                        { label: "Mandatory Holiday", value: "mandatory" },
                        { label: "Optional Holiday", value: "optional" },
                        { label: "Company Event", value: "event" },
                      ]}
                      className="h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                    />
                  </div>
                </div>
                {/* Honest about today's rules: payroll and attendance read every
                    type the same way (payroll_engine buildFestivalSet). */}
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground -mt-1 ml-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                  All three types currently count as a paid day off for every employee, in attendance and in salary.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="festival-start" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Start Date</label>
                    <FormInput
                      id="festival-start"
                      type="date"
                      value={form.startDate}
                      min="2000-01-01"
                      max="2100-12-31"
                      onChange={(e) => {
                        const startDate = e.target.value;
                        // Keep a one-day holiday one day: move the end along
                        // unless a longer range was already chosen.
                        const endDate = !form.endDate || form.endDate < startDate || form.endDate === form.startDate ? startDate : form.endDate;
                        setForm({ ...form, startDate, endDate });
                      }}
                      className="h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="festival-end" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">End Date</label>
                    <FormInput
                      id="festival-end"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      min={form.startDate || "2000-01-01"}
                      max="2100-12-31"
                      aria-invalid={!!formDateProblem}
                      className={cn("h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px]", formDateProblem && "border-destructive")}
                    />
                  </div>
                </div>
                {form.startDate && form.endDate && !formDateProblem && (
                  <p className="text-[12px] text-muted-foreground ml-1 -mt-1">
                    {formatFestivalRange(form.startDate, form.endDate)} · {festivalSpanDays(form.startDate, form.endDate)} {festivalSpanDays(form.startDate, form.endDate) === 1 ? "day" : "days"}
                  </p>
                )}
                {formDateProblem && (
                  <p role="alert" className="text-[12px] font-semibold text-destructive ml-1 -mt-1">{formDateProblem}</p>
                )}
                {formIsPast && !formDateProblem && (
                  <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>This date has already passed. Adding or changing a past holiday changes attendance and pay for that month.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-5 space-y-1.5">
                    <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Poster (optional)</span>
                    <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-xl border border-border/40 border-dashed min-h-[64px]">
                      {preview ? (
                        <div className="h-12 w-16 rounded-lg border border-white overflow-hidden shrink-0 shadow-sm">
                          <img src={preview} alt="Poster preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-12 w-16 rounded-lg bg-card/50 border border-white flex flex-col items-center justify-center shrink-0 shadow-sm text-muted-foreground/40">
                          <Gift className="h-4 w-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <input
                          id="poster-upload"
                          type="file"
                          accept={FESTIVAL_POSTER_TYPES.join(",")}
                          className="sr-only"
                          onChange={(e) => {
                            pickPoster(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <label
                            htmlFor="poster-upload"
                            className="inline-flex h-10 items-center cursor-pointer px-3 rounded-lg bg-card border border-border/40 text-[12px] font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                          >
                            {preview ? "Change" : "Upload"}
                          </label>
                          {preview && (
                            <button
                              type="button"
                              onClick={() => { setPreview(null); setPoster(null); }}
                              className="inline-flex h-10 items-center gap-1 px-3 rounded-lg bg-card border border-border/40 text-[12px] font-bold text-destructive hover:bg-destructive/5 transition-all shadow-sm"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 font-medium">JPG, PNG or WebP, up to 5 MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-7 space-y-1.5">
                    <label htmlFor="festival-description" className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1">Description (optional)</label>
                    <Textarea
                      id="festival-description"
                      placeholder="A short note for employees"
                      value={form.description}
                      maxLength={FESTIVAL_DESCRIPTION_MAX}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="min-h-[64px] rounded-xl bg-muted/30 border-border/40 focus:bg-card transition-all shadow-sm text-[13px] resize-none"
                    />
                    <p className="text-right text-[11px] text-muted-foreground">{form.description.length}/{FESTIVAL_DESCRIPTION_MAX}</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="rounded-xl h-11 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]"
                  disabled={saving}
                >
                  Cancel
                </Button>
                <ActionButton
                  variant="add"
                  type="submit"
                  showLabel
                  label={saving ? "Saving..." : editing ? "Save Holiday" : "Add Holiday"}
                  icon={editing ? Check : Sparkles}
                  loading={saving}
                  disabled={saving || !!formDateProblem}
                  className="px-10 h-11 rounded-xl text-[14px] shadow-lg shadow-primary/20"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o && !isDeleting) setDeleting(null); }}>
        <AlertDialogContent className="rounded-[28px] border-none shadow-2xl p-6 sm:p-8 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="h-16 w-16 rounded-[20px] bg-destructive/10 text-destructive flex items-center justify-center mb-4 shadow-inner mx-auto">
              <Trash2 className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl font-black text-center tracking-tight break-words">
              Delete {deleting ? `"${deleting.name}"` : "this holiday"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-muted-foreground font-medium text-[15px] mt-2">
              {deleting ? `${formatFestivalRange(deleting.startDate, deleting.endDate || deleting.startDate)}. ` : ""}
              It will be removed from every employee's calendar, and those days will be counted like any other day.
              {deleting && isOver(deleting) ? " This holiday is in the past, so pay for that month can change." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 sm:justify-center gap-3">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl h-12 px-8 font-bold border-border/40 hover:bg-muted/50 transition-all">Keep it</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label={isDeleting ? "Deleting..." : "Yes, Delete"}
              loading={isDeleting}
              disabled={isDeleting}
              onClick={remove}
              className="h-12 px-8 font-bold shadow-lg shadow-destructive/20"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
