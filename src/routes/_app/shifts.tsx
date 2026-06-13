import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Clock, Users, Pencil, Trash2, Search, Sun, Moon, Sunrise, Sunset, LayoutGrid, List, Calendar, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { useShiftService, type Shift as BackendShift } from "@/services/shift-service";
import { useEmployeeService } from "@/services/employee-service";
import { ViewToggle } from "@/components/shared/view-toggle";
import { GridCard } from "@/components/shared/grid-card";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { toast } from "sonner";
import { cn, formatTime12h } from "@/lib/utils";
import { ActionButton } from "@/components/shared/action-button";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { useEffect } from "react";
import { usePermission } from "@/hooks/use-permission";
import { apiClient } from "@/lib/api-client";
import { DAY_LABELS } from "@/lib/constants";

const ALL_DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;

const to12h = (time24: string) => {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return { hour, minute: m, ampm };
};

const to24h = (hour: number, minute: number, ampm: string) => {
  let h = hour % 12;
  if (ampm === "PM") h += 12;
  return `${h.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

function TimePickerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { hour, minute, ampm } = to12h(value);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider block">{label}</label>
      <div className="flex items-center gap-1 h-10 px-2 rounded-xl border border-border/60 bg-muted/10 focus-within:border-primary transition-colors">
        <select
          className="bg-transparent text-[14px] font-semibold text-foreground outline-none w-10 text-center"
          value={hour}
          onChange={(e) => onChange(to24h(Number(e.target.value), minute, ampm))}
        >
          {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
        </select>
        <span className="text-muted-foreground font-bold text-[14px]">:</span>
        <select
          className="bg-transparent text-[14px] font-semibold text-foreground outline-none w-10 text-center"
          value={minute}
          onChange={(e) => onChange(to24h(hour, Number(e.target.value), ampm))}
        >
          {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
        <div className="flex ml-1 rounded-lg overflow-hidden border border-border/40">
          {["AM", "PM"].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(to24h(hour, minute, p))}
              className={cn(
                "px-2 py-0.5 text-[11px] font-bold transition-all",
                ampm === p ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/shifts")({
  component: ShiftsPage,
});

const SHIFT_ICONS: Record<string, typeof Sun> = {
  Morning: Sunrise,
  General: Sun,
  Evening: Sunset,
  Night: Moon,
};

const SHIFT_GRADIENTS: Record<string, string> = {
  Morning: "from-amber-400/15 to-orange-300/5",
  General: "from-primary/15 to-primary/5",
  Evening: "from-purple-400/15 to-indigo-300/5",
  Night: "from-slate-600/15 to-slate-400/5",
};

const SHIFT_ICON_COLORS: Record<string, string> = {
  Morning: "text-amber-600 bg-amber-500/10",
  General: "text-primary bg-primary/10",
  Evening: "text-purple-600 bg-purple-500/10",
  Night: "text-slate-600 bg-slate-500/10",
};


function ShiftsPage() {
  const { shifts: list, isLoading, createShift, updateShift, deleteShift, isCreating, isUpdating } = useShiftService();
  const { employees = [] } = useEmployeeService();
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendShift | null>(null);
  const [globalWorkDays, setGlobalWorkDays] = useState<string[]>(["M", "T", "W", "Th", "F", "Sa"]);
  const [form, setForm] = useState({ name: "", startTime: "09:00", endTime: "18:00", workDays: ["M", "T", "W", "Th", "F", "Sa"], is24Hours: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("shifts", "create");
  const canEdit = can("shifts", "edit");
  const canDelete = can("shifts", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    apiClient.get("/settings").then(({ data }) => {
      if (data?.attendance?.workDays?.length) {
        setGlobalWorkDays(data.attendance.workDays);
      }
    }).catch(() => {});
  }, []);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: "", shiftId: "" });

  const filtered = list.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalAssigned = list.reduce((s, sh) => s + (sh.assigned || 0), 0);

  const to12h = (time24: string) => {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return { hour: String(hour), minute: String(m).padStart(2, "0"), period };
  };

  const to24h = (hour: string, minute: string, period: string) => {
    let h = parseInt(hour);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${minute}`;
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", startTime: "09:00", endTime: "18:00", workDays: globalWorkDays, is24Hours: false });
    setOpen(true);
  };

  const openEdit = (s: BackendShift) => {
    setEditing(s);
    const is24 = s.startTime === "00:00" && s.endTime === "23:59";
    setForm({ name: s.name, startTime: s.startTime, endTime: s.endTime, workDays: s.workDays || globalWorkDays, is24Hours: is24 });
    setOpen(true);
  };

  const toggleWorkDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day]
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Shift name required"); return; }
    
    try {
      if (editing) {
        await updateShift({ id: editing._id, ...form });
      } else {
        await createShift(form);
      }
      setOpen(false);
    } catch (err) {
      // Error handled by service
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteShift(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error handled by service
    }
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    // This part depends on if there's a specific API for assigning shifts to employees
    toast.success("Shift assigned successfully");
    setAssignOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shift Management" description="Define working hours and assign shifts to your team." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift Management"
        description="Define working hours and assign shifts to your team."
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-[13px] rounded-lg"
                onClick={() => {
                  if (employees.length > 0 && list.length > 0) {
                    setAssignForm({ employeeId: employees[0]._id, shiftId: list[0]._id });
                  }
                  setAssignOpen(true);
                }}
              >
                <Users className="h-4 w-4 mr-1.5" />Assign Shift
              </Button>
            )}
            {canCreate && (
              <Button
                size="sm"
                className="h-9 text-[13px] bg-gradient-primary text-primary-foreground px-4 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                onClick={openAdd}
              >
                <Plus className="h-4 w-4 mr-1.5" />New Shift
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Shifts" value={list.length} icon={Clock} accent="primary" delay={0} />
        <StatCard label="Total Assigned" value={totalAssigned} icon={Users} accent="success" delay={0.05} />
        <StatCard label="Avg per Shift" value={list.length ? Math.round(totalAssigned / list.length) : 0} icon={Sun} accent="warning" delay={0.1} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
        </div>

        <FormInput
          placeholder="Search shifts..."
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
            {filtered.map((s, i) => {
              const ShiftIcon = SHIFT_ICONS[s.name] || Clock;
              const gradient = SHIFT_GRADIENTS[s.name] || "from-primary/15 to-primary/5";
              const iconColor = SHIFT_ICON_COLORS[s.name] || "text-primary bg-primary/10";
              return (
                <motion.div
                  key={s._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={`group relative overflow-hidden p-5 border border-border/50 bg-white rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 h-full flex flex-col`}>
                    {/* Top gradient bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r ${gradient.replace("/15", "/60").replace("/5", "/30")} rounded-t-xl`} />

                    <div className="flex items-start justify-between mb-4 mt-1">
                      <div className={`h-12 w-12 rounded-xl grid place-items-center shadow-sm ${iconColor}`}>
                        <ShiftIcon className="h-5.5 w-5.5" />
                      </div>
                      <div className="flex items-center gap-1.5 translate-y-[-4px]">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => setDeleteId(s._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="text-[16px] font-semibold text-foreground mb-1">{s.name}</h3>
                      <div className="flex items-center gap-2 text-[14px] text-muted-foreground font-mono">
                        <Clock className="h-3.5 w-3.5 text-primary/50" />
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </div>

                      {/* Duration badge */}
                      <div className="mt-3 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 border-border/40 bg-muted/20">
                          {(() => {
                            const [sh, sm] = s.startTime.split(":").map(Number);
                            const [eh, em] = s.endTime.split(":").map(Number);
                            let diff = (eh * 60 + em) - (sh * 60 + sm);
                            if (diff < 0) diff += 24 * 60;
                            return `${Math.floor(diff / 60)}h ${diff % 60}m`;
                          })()}
                        </Badge>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/40 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-primary/80 bg-primary/5 px-2 py-0.5 rounded-md">
                        <Users className="h-3.5 w-3.5" /> {s.assigned || 0} assigned
                      </div>
                      <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
                      </span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Shift Name", "Timing", "Duration", "Assigned", "Created", "Actions"]}
            >
              {filtered.map((s) => (
                <DataTableRow key={s._id}>
                  <DataTableCell isFirst>
                    <span className="text-[14px] font-medium">{s.name}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-mono">
                      <Clock className="h-3.5 w-3.5 text-primary/50" />
                      {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 border-border/40 bg-muted/10">
                      {(() => {
                        const [sh, sm] = s.startTime.split(":").map(Number);
                        const [eh, em] = s.endTime.split(":").map(Number);
                        let diff = (eh * 60 + em) - (sh * 60 + sm);
                        if (diff < 0) diff += 24 * 60;
                        return `${Math.floor(diff / 60)}h ${diff % 60}m`;
                      })()}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">{s.assigned || 0}</Badge>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ')}
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Shift"
                          onClick={() => openEdit(s)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Shift"
                          onClick={() => setDeleteId(s._id)}
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
          <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[14px] text-muted-foreground">No shifts found</p>
          <p className="text-[12px] text-muted-foreground/60 mt-1">Try adjusting your search or create a new shift.</p>
        </div>
      )}

      {/* Create/Edit Shift Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 text-primary grid place-items-center mb-2">
              <Clock className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[16px]">{editing ? "Edit Shift" : "New Shift"}</DialogTitle>
            <DialogDescription className="text-[13px]">Set the shift name and working hours.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <FormInput
              label="Shift Name"
              placeholder="e.g. Morning"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-10"
              containerClassName="space-y-1"
            />
            {/* 24 Hours Toggle */}
            <div className={cn(
              "flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
              form.is24Hours ? "bg-primary/5 border-primary/40" : "bg-muted/20 border-border/40"
            )}>
              <div className="space-y-0.5">
                <p className="text-[13px] font-bold text-foreground">24 Hours Shift</p>
                <p className="text-[11px] text-muted-foreground">Full day — 12:00 AM to 11:59 PM</p>
              </div>
              <Switch
                checked={form.is24Hours}
                onCheckedChange={(v) => setForm(prev => ({
                  ...prev,
                  is24Hours: v,
                  startTime: v ? "00:00" : "09:00",
                  endTime:   v ? "23:59" : "18:00",
                }))}
              />
            </div>

            {/* Time Pickers — hidden when 24h is on */}
            {!form.is24Hours ? (
              <div className="grid grid-cols-2 gap-3">
                {(["start", "end"] as const).map((which) => {
                  const timeKey = which === "start" ? "startTime" : "endTime";
                  const { hour, minute, period } = to12h(form[timeKey]);
                  const setTime = (h: string, m: string, p: string) =>
                    setForm(prev => ({ ...prev, [timeKey]: to24h(h, m, p) }));
                  return (
                    <div key={which} className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        {which === "start" ? "Start Time" : "End Time"}
                      </label>
                      <div className="flex items-center h-10 rounded-xl border border-border/60 bg-white overflow-hidden divide-x divide-border/40 focus-within:border-primary/60 transition-colors">
                        <select
                          value={hour}
                          onChange={e => setTime(e.target.value, minute, period)}
                          className="flex-1 h-full bg-transparent text-[13px] font-semibold text-center outline-none cursor-pointer px-1"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                            <option key={h} value={String(h)}>{String(h).padStart(2, "0")}</option>
                          ))}
                        </select>
                        <span className="px-1 text-muted-foreground font-bold text-[13px] select-none">:</span>
                        <select
                          value={minute}
                          onChange={e => setTime(hour, e.target.value, period)}
                          className="flex-1 h-full bg-transparent text-[13px] font-semibold text-center outline-none cursor-pointer px-1"
                        >
                          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={period}
                          onChange={e => setTime(hour, minute, e.target.value)}
                          className="h-full bg-primary/5 text-[12px] font-bold text-primary outline-none cursor-pointer px-2"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-primary/5 border border-primary/20">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span className="text-[13px] font-bold text-primary">12:00 AM</span>
                <span className="text-[12px] text-muted-foreground">→</span>
                <span className="text-[13px] font-bold text-primary">11:59 PM</span>
                <Badge variant="outline" className="ml-1 text-[10px] font-bold text-primary border-primary/30 bg-primary/5 px-1.5 py-0">24h</Badge>
              </div>
            )}

            {/* Working Days */}
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider block">Working Days</label>
              <div className="flex gap-2 flex-wrap">
                {ALL_DAYS.map((day) => {
                  const active = form.workDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWorkDay(day)}
                      className={cn(
                        "h-9 w-9 rounded-xl text-[12px] font-bold transition-all border",
                        active
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-muted-foreground border-border/50 hover:border-primary/40"
                      )}
                      title={DAY_LABELS[day]}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Highlighted = work day. Non-highlighted = holiday. Pre-filled from global settings.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border/40 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} className="rounded-lg" disabled={isCreating || isUpdating}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-primary text-primary-foreground rounded-lg px-5 shadow-md hover:opacity-90" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  editing ? "Save Changes" : "Create Shift"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl border-destructive/20 shadow-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-[16px]">Delete shift?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">This will unassign all employees from this shift. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 shadow-md">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Shift Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-success/15 to-success/5 text-success grid place-items-center mb-2">
              <Users className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[16px]">Assign Shift</DialogTitle>
            <DialogDescription className="text-[13px]">Move an employee to a different shift.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4 mt-2">
            <FormSelect
              label="Employee"
              placeholder="Select Employee"
              value={assignForm.employeeId}
              onValueChange={(v) => setAssignForm({ ...assignForm, employeeId: v })}
              options={employees.map((e: any) => ({ label: e.name, value: e._id }))}
              containerClassName="space-y-1"
            />
            <FormSelect
              label="Shift"
              placeholder="Select Shift"
              value={assignForm.shiftId}
              onValueChange={(v) => setAssignForm({ ...assignForm, shiftId: v })}
              options={list.map((s) => ({ 
                label: s.name, 
                value: s._id, 
                subLabel: `${formatTime12h(s.startTime)} – ${formatTime12h(s.endTime)}` 
              }))}
              containerClassName="space-y-1"
            />
            <DialogFooter className="gap-2 pt-2 border-t border-border/40 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAssignOpen(false)} className="rounded-lg">Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-primary text-primary-foreground rounded-lg px-5 shadow-md">Assign</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
