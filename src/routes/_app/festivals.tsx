import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus, CalendarHeart, Pencil, Trash2, Search, Gift, Sparkles, MapPin,
  CalendarDays, PartyPopper, Filter, Loader2, LayoutDashboard, List,
  Table as TableIcon, Calendar, Clock, Check
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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFestivalService, type Festival as BackendFestival } from "@/services/festival-service";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/festivals")({
  component: FestivalsPage,
});

type FestivalType = "mandatory" | "optional" | "event";

const TYPE_CONFIG = {
  mandatory: {
    icon: CalendarHeart,
    color: "text-primary bg-primary/10",
    border: "border-primary/20",
    label: "Mandatory Holiday",
    gradient: "from-primary/20 to-primary/5",
    accent: "bg-primary"
  },
  optional: {
    icon: Sparkles,
    color: "text-amber-600 bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Optional Holiday",
    gradient: "from-amber-500/20 to-amber-500/5",
    accent: "bg-amber-500"
  },
  event: {
    icon: PartyPopper,
    color: "text-blue-600 bg-blue-500/10",
    border: "border-blue-500/30",
    label: "Company Event",
    gradient: "from-blue-500/20 to-blue-500/5",
    accent: "bg-blue-500"
  },
};

function FestivalsPage() {
  const { festivals: list, isLoading, isFetching, createFestival, updateFestival, deleteFestival, isCreating, isUpdating } = useFestivalService();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendFestival | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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

  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", type: "mandatory" as FestivalType, description: "" });
  const [poster, setPoster] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const getDayOfWeek = (dateString: string) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[new Date(dateString).getDay()];
  };

  if (!hasMounted) return null;

  const filtered = list
    .filter(f => filterType === "all" || f.type === filterType)
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || (f.description || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const upcomingCount = list.filter(f => new Date(f.startDate) >= new Date()).length;
  const mandatoryCount = list.filter(f => f.type === "mandatory").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast.error("Name, start date, and end date are required");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("startDate", form.startDate);
      formData.append("endDate", form.endDate);
      formData.append("type", form.type);
      formData.append("description", form.description);

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
    } catch (err) {
      // Error handled by hook
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteFestival(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error handled by hook
    }
  };

  if (isLoading || (list.length === 0 && isFetching)) {
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

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Festivals & Holidays"
        description="Manage the company's annual holiday calendar and upcoming events."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Holiday"
              onClick={() => {
                setEditing(null);
                setForm({ name: "", startDate: "", endDate: "", type: "mandatory", description: "" });
                setPoster(null);
                setPreview(null);
                setOpen(true);
              }}
              className="h-10 px-6 shadow-lg shadow-primary/20"
            />
          ) : null
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Holidays" value={list.length} icon={CalendarDays} accent="primary" delay={0} />
        <StatCard label="Mandatory" value={mandatoryCount} icon={CalendarHeart} accent="success" delay={0.05} />
        <StatCard label="Upcoming" value={upcomingCount} icon={Gift} accent="warning" delay={0.1} />
      </div>

      {/* Filters Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center justify-between gap-4 p-2 bg-white/50 backdrop-blur-md rounded-2xl border border-border/40 shadow-sm"
      >
        <div className="flex items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | FestivalType)}>
            <SelectTrigger className="h-11 w-full md:w-[200px] border-border/40 bg-white/80 hover:bg-white rounded-xl text-[13px] font-medium transition-all gap-2 px-4 shadow-sm focus:ring-primary/20">
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
            className="h-11 w-full pl-10 pr-4 bg-white/80 border-border/40 rounded-xl shadow-sm focus:ring-primary/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

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
              const start = new Date(festival.startDate);
              const end = new Date(festival.endDate);
              const month = start.toLocaleString('default', { month: 'short' });
              const day = start.getDate();
              const isPast = end < new Date(new Date().setHours(0, 0, 0, 0));
              const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

              return (
                <motion.div
                  key={festival._id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  whileHover={{ y: -5 }}
                >
                  <Card className={cn(
                    "relative overflow-hidden p-0 border border-border/60 bg-white/70 backdrop-blur-xl rounded-[24px] shadow-sm transition-all duration-500 group hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 h-full flex flex-col",
                    isPast && "opacity-70 grayscale-[0.5] hover:grayscale-0 hover:opacity-100"
                  )}>

                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-5">
                        <div className="flex gap-4">
                          {/* Date Block */}
                          <div className={cn(
                            "h-16 w-14 rounded-2xl flex flex-col items-center justify-center shrink-0 border border-border/40 shadow-sm transition-transform duration-500 group-hover:scale-105",
                            isPast ? "bg-muted/50" : "bg-linear-to-b from-white to-muted/20"
                          )}>
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary/60">{month}</span>
                            <span className="text-[22px] font-black text-foreground leading-tight">{day}</span>
                          </div>

                          {/* Small Poster Square */}
                          {festival.posterUrl && !brokenImages[festival._id] && (
                            <div className="h-16 w-16 rounded-2xl overflow-hidden border border-border/50 shrink-0 shadow-sm transition-transform duration-500 group-hover:scale-105">
                              <img
                                src={festival.posterUrl}
                                alt=""
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                onError={() => setBrokenImages(prev => ({ ...prev, [festival._id]: true }))}
                              />
                            </div>
                          )}

                          <div className="flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h3 className="text-[17px] font-bold text-foreground leading-tight group-hover:text-primary transition-colors duration-300">{festival.name}</h3>
                              {isPast ? (
                                <Badge variant="secondary" className="h-5 text-[9px] px-2 font-bold uppercase tracking-wider bg-muted/40 text-muted-foreground border-transparent">Past</Badge>
                              ) : (
                                <Badge className="h-5 text-[9px] px-2 font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Upcoming</Badge>
                              )}
                            </div>
                            <div className="text-[12px] text-muted-foreground/80 flex items-center gap-2">
                              <CalendarDays className="h-3.5 w-3.5 text-primary/60" />
                              <span className="font-medium">
                                {festival.startDate === festival.endDate ?
                                  getDayOfWeek(festival.startDate) :
                                  `${new Date(festival.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(festival.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {festival.description && (
                        <p className="text-[13.5px] text-muted-foreground/80 mb-6 line-clamp-2 leading-relaxed flex-1 italic font-medium border-l-2 border-primary/10 pl-3">
                          "{festival.description}"
                        </p>
                      )}

                      <div className="pt-4 border-t border-border/40 flex items-center justify-between mt-auto">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border-transparent shadow-sm", config.color)}>
                            <Icon className="h-3.5 w-3.5 mr-2" />
                            {config.label}
                          </Badge>
                          <div className="flex items-center gap-1.5 font-black text-primary/60 text-[10px] uppercase tracking-[0.15em] ml-1 mt-1">
                            <Clock className="h-3 w-3" /> {diffDays} {diffDays === 1 ? 'Day' : 'Days'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
                          {canEdit && (
                            <ActionButton
                              variant="edit"
                              tooltip="Edit Holiday"
                              onClick={() => {
                                setEditing(festival);
                                setForm({ name: festival.name, startDate: festival.startDate, endDate: festival.endDate, type: festival.type, description: festival.description || "" });
                                setPreview(festival.posterUrl || null);
                                setPoster(null);
                                setOpen(true);
                              }}
                            />
                          )}
                          {canDelete && (
                            <ActionButton
                              variant="delete"
                              tooltip="Delete Holiday"
                              onClick={() => setDeleteId(festival._id)}
                            />
                          )}
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
            <DataTable
              headers={["Holiday", "Dates & Duration", "Category", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
            >
              {filtered.map((f) => {
                const isPast = new Date(f.endDate) < new Date(new Date().setHours(0, 0, 0, 0));
                const config = TYPE_CONFIG[f.type as FestivalType] || TYPE_CONFIG.mandatory;
                const Icon = config.icon;
                const diffDays = Math.ceil(Math.abs(new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;

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
                        <div>
                          <div className="font-bold text-[14px] text-foreground">{f.name}</div>
                          <div className="text-[11px] text-muted-foreground font-medium line-clamp-1 max-w-[150px]">{f.description || "No description"}</div>
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-primary/60" />
                          {new Date(f.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - {new Date(f.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-[10px] font-bold text-primary/50 uppercase tracking-widest flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {diffDays} {diffDays === 1 ? 'Day' : 'Days'}
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border-transparent shadow-sm", config.color)}>
                        <Icon className="h-3 w-3 mr-2" />
                        {config.label}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell>
                      {isPast ? (
                        <Badge variant="secondary" className="h-6 text-[10px] px-2.5 font-bold uppercase bg-muted/40 text-muted-foreground border-transparent">Past</Badge>
                      ) : (
                        <Badge className="h-6 text-[10px] px-2.5 font-bold uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Upcoming</Badge>
                      )}
                    </DataTableCell>
                    <DataTableCell isLast>
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <ActionButton
                            variant="edit"
                            tooltip="Edit Holiday"
                            onClick={() => {
                              setEditing(f);
                              setForm({ name: f.name, startDate: f.startDate, endDate: f.endDate, type: f.type, description: f.description || "" });
                              setPreview(f.posterUrl || null);
                              setPoster(null);
                              setOpen(true);
                            }}
                          />
                        )}
                        {canDelete && (
                          <ActionButton
                            variant="delete"
                            tooltip="Delete Holiday"
                            onClick={() => setDeleteId(f._id)}
                          />
                        )}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-white/40 backdrop-blur-sm rounded-[32px] border border-dashed border-border/60"
        >
          <div className="h-20 w-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Gift className="h-10 w-10 text-primary/30" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No holidays found</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-[280px] mx-auto">Try adjusting your filters or search terms to find what you're looking for.</p>
          <Button
            variant="outline"
            onClick={() => { setSearch(""); setFilterType("all"); }}
            className="mt-6 rounded-xl"
          >
            Clear All Filters
          </Button>
        </motion.div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
          <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
          <div className="p-5">
            <DialogHeader className="mb-3">
              <div className="flex items-center gap-4 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                  <PartyPopper className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
                  <DialogDescription className="text-[12px] font-medium text-muted-foreground">Fill in the details to update the company calendar.</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Holiday Name</label>
                  <FormInput
                    placeholder="e.g. Diwali Festival"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Category Type</label>
                  <FormSelect
                    label="Category Type"
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as FestivalType })}
                    options={[
                      { label: "Mandatory Holiday", value: "mandatory" },
                      { label: "Optional Holiday", value: "optional" },
                      { label: "Company Event", value: "event" },
                    ]}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Start Date</label>
                  <FormInput
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate || e.target.value })}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">End Date</label>
                  <FormInput
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    min={form.startDate}
                    className="h-10 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Promotional Poster</label>
                  <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-xl border border-border/40 border-dashed min-h-[64px]">
                    {preview ? (
                      <div className="h-12 w-16 rounded-lg border border-white overflow-hidden shrink-0 relative group shadow-sm">
                        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => { setPreview(null); setPoster(null); }}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-[2px]"
                        >
                          <Trash2 className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-16 rounded-lg bg-white/50 border border-white flex flex-col items-center justify-center shrink-0 shadow-sm text-muted-foreground/40">
                        <Gift className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        id="poster-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setPoster(file);
                            setPreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <label
                        htmlFor="poster-upload"
                        className="inline-flex cursor-pointer py-1 px-3 rounded-lg bg-white border border-border/40 text-[10px] font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm uppercase tracking-tighter"
                      >
                        {preview ? "Change" : "Upload"}
                      </label>
                      <p className="text-[8px] text-muted-foreground mt-1 font-medium italic">Max 5MB</p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-7 space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground ml-1">Description</label>
                  <FormInput
                    placeholder="Tell us more about this holiday..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="h-16 rounded-xl bg-muted/30 border-border/40 focus:bg-white transition-all shadow-sm text-[13px] resize-none"
                    containerClassName="h-full"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t border-border/40 mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]"
                  disabled={isCreating || isUpdating}
                >
                  Discard
                </Button>
                <ActionButton
                  variant="add"
                  type="submit"
                  showLabel
                  label={editing ? "Update Holiday" : "Publish Holiday"}
                  icon={editing ? Check : Sparkles}
                  loading={isCreating || isUpdating}
                  className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
                />
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-[28px] border-none shadow-2xl p-8 bg-white/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="h-16 w-16 rounded-[20px] bg-destructive/10 text-destructive flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash2 className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl font-black text-center tracking-tight">Remove Holiday?</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-muted-foreground font-medium text-[15px] mt-2">
              Are you sure you want to delete this holiday? This action cannot be undone and it will be removed from all employee calendars.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-10 sm:justify-center gap-4">
            <AlertDialogCancel className="rounded-xl h-12 px-8 font-bold border-border/40 hover:bg-muted/50 transition-all">Keep it</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label="Yes, Delete"
              onClick={remove}
              className="h-12 px-8 font-bold shadow-lg shadow-destructive/20"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
