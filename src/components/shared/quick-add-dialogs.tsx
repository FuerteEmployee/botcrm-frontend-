import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormInput } from "@/components/shared/form-input";
import { ActionButton } from "@/components/shared/action-button";
import { Building2, Landmark, Clock, Crosshair, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { DAY_LABELS } from "@/lib/constants";
import { useBranchService } from "@/services/branch-service";
import { useDepartmentService } from "@/services/department-service";
import { useShiftService } from "@/services/shift-service";

// Mirrors the "Add Branch" / "Add Department" / "New Shift" dialogs on their
// own pages (branches.tsx / departments.tsx / shifts.tsx) so a page like
// Employee Create can offer the exact same look/behavior inline instead of
// redirecting away.

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function QuickAddBranchDialog({ open, onOpenChange, onCreated }: QuickAddDialogProps) {
  const { createBranch } = useBranchService();
  const [form, setForm] = useState({ branchName: "", branchLocation: "", city: "", latitude: 0, longitude: 0 });
  const [fetchingLoc, setFetchingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm({ branchName: "", branchLocation: "", city: "", latitude: 0, longitude: 0 });
  }, [open]);

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
          longitude: parseFloat(pos.coords.longitude.toFixed(2)),
        }));
        setFetchingLoc(false);
        toast.success("Location fetched and simplified");
      },
      () => {
        setFetchingLoc(false);
        toast.error("Failed to fetch location");
      }
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.branchName.trim() || !form.branchLocation.trim() || !form.city.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createBranch(form);
      onCreated(created._id);
      onOpenChange(false);
    } catch {
      // useBranchService already toasts the error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
        <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
        <div className="p-5">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">Add Branch</DialogTitle>
                <DialogDescription className="text-[12px] font-medium text-muted-foreground">Provide the branch's basic information.</DialogDescription>
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
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
              <ActionButton
                type="submit"
                variant="add"
                showLabel
                label={submitting ? "Saving..." : "Create Branch"}
                icon={Plus}
                disabled={submitting}
                className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
              />
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuickAddDepartmentDialog({ open, onOpenChange, onCreated }: QuickAddDialogProps) {
  const { createDepartment } = useDepartmentService();
  const [form, setForm] = useState({ name: "", colorCode: "#6366f1" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: "", colorCode: "#6366f1" });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Department name is required");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDepartment(form);
      onCreated(created._id);
      onOpenChange(false);
    } catch {
      // useDepartmentService already toasts the error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[28px] border-none shadow-2xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl">
        <div className="h-2 w-full bg-linear-to-r from-primary via-primary/50 to-primary/80" />
        <div className="p-5">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">Add Department</DialogTitle>
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
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 font-bold px-8 text-muted-foreground hover:bg-muted/50 text-[13px]">Discard</Button>
              <ActionButton
                type="submit"
                variant="add"
                showLabel
                label={submitting ? "Saving..." : "Create Department"}
                icon={Plus}
                disabled={submitting}
                className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
              />
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ALL_DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;

function to12h(time24: string) {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return { hour: String(hour), minute: String(m).padStart(2, "0"), period };
}

function to24h(hour: string, minute: string, period: string) {
  let h = parseInt(hour);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export function QuickAddShiftDialog({ open, onOpenChange, onCreated }: QuickAddDialogProps) {
  const { createShift } = useShiftService();
  const [globalWorkDays, setGlobalWorkDays] = useState<string[]>(["M", "T", "W", "Th", "F", "Sa"]);
  const [form, setForm] = useState({ name: "", startTime: "09:00", endTime: "18:00", workDays: globalWorkDays, is24Hours: false });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get("/settings").then(({ data }) => {
      if (data?.attendance?.workDays?.length) setGlobalWorkDays(data.attendance.workDays);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) setForm({ name: "", startTime: "09:00", endTime: "18:00", workDays: globalWorkDays, is24Hours: false });
  }, [open, globalWorkDays]);

  const toggleWorkDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day) ? prev.workDays.filter(d => d !== day) : [...prev.workDays, day],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Shift name required");
      return;
    }
    setSubmitting(true);
    try {
      const { is24Hours, ...payload } = form;
      const created = await createShift(payload);
      onCreated(created._id);
      onOpenChange(false);
    } catch {
      // useShiftService already toasts the error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <div className="h-10 w-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 text-primary grid place-items-center mb-2">
            <Clock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-[16px]">New Shift</DialogTitle>
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
                endTime: v ? "23:59" : "18:00",
              }))}
            />
          </div>

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
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg" disabled={submitting}>Cancel</Button>
            <ActionButton
              type="submit"
              variant="add"
              showLabel
              label={submitting ? "Saving..." : "Create Shift"}
              icon={Plus}
              disabled={submitting}
              className="rounded-lg px-5 shadow-md"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
