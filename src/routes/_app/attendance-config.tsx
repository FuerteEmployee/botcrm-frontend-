import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { 
  Clock, 
  Utensils, 
  Calendar, 
  Zap, 
  RotateCcw, 
  Bell, 
  Monitor, 
  Save, 
  Trash2,
  Check,
  Info,
  MapPin,
  Smartphone,
  Mail,
  MessageSquare
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/attendance-config")({
  component: AttendanceConfigPage,
});

interface AttendanceSettings {
  punchIn: string;
  punchOut: string;
  earliestIn: string;
  latestOut: string;
  autoPunchOut: boolean;
  requireLocation: boolean;
  remotePunch: boolean;
  allowMultiplePunches: boolean;
  
  lunchIn: string;
  lunchOut: string;
  minLunch: number;
  maxLunch: number;
  
  workDays: string[];
  reqHours: number;
  reqMins: number;
  halfDayHours: number;
  
  lateGrace: number;
  earlyGrace: number;
  lunchGrace: number;
  halfDayRules: {
    method: 'timeBased' | 'durationBased' | 'both';
    bothLogic: 'or' | 'and';
    cutoffTime: string;
    minHours: number;
    deductLunch: boolean;
  };
  otThreshold: number;
  weeklyOT: number;
  otMultiplier: number;
  
  roundingInterval: number;
  roundingDirection: string;
  roundingAppliedTo: string[];
  
  notifications: {
    punchInReminder: boolean;
    punchInReminderMins: number;
    lunchReminder: boolean;
    lunchReminderMins: number;
    lunchReturnReminder: boolean;
    lunchReturnReminderMins: number;
    punchOutReminder: boolean;
    punchOutReminderMins: number;
    missedPunchAlert: boolean;
    channels: string[];
  };
  
  display: {
    timeFormat: string;
    timezone: string;
    weekStart: string;
    dateFormat: string;
  };
}

const DEFAULT_SETTINGS: AttendanceSettings = {
  punchIn: '09:00',
  punchOut: '18:00',
  earliestIn: '07:30',
  latestOut: '22:00',
  autoPunchOut: true,
  requireLocation: false,
  remotePunch: true,
  allowMultiplePunches: false,
  
  lunchIn: '13:00',
  lunchOut: '14:00',
  minLunch: 30,
  maxLunch: 90,
  
  workDays: ['M', 'T', 'W', 'Th', 'F'],
  reqHours: 8,
  reqMins: 0,
  halfDayHours: 4,
  
  lateGrace: 10,
  earlyGrace: 5,
  lunchGrace: 5,
  halfDayRules: {
    method: 'durationBased',
    bothLogic: 'or',
    cutoffTime: '09:35',
    minHours: 8,
    deductLunch: true,
  },
  otThreshold: 9,
  weeklyOT: 45,
  otMultiplier: 1.5,
  
  roundingInterval: 15,
  roundingDirection: 'nearest',
  roundingAppliedTo: ['Punch In', 'Punch Out'],
  
  notifications: {
    punchInReminder: true,
    punchInReminderMins: 15,
    lunchReminder: true,
    lunchReminderMins: 5,
    lunchReturnReminder: true,
    lunchReturnReminderMins: 10,
    punchOutReminder: true,
    punchOutReminderMins: 10,
    missedPunchAlert: true,
    channels: ['Push', 'SMS']
  },
  
  display: {
    timeFormat: '24h',
    timezone: 'UTC+05:30',
    weekStart: 'Monday',
    dateFormat: 'YYYY-MM-DD'
  }
};

function AttendanceConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [activeSection, setActiveSection] = useState('punch');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await apiClient.get("/settings");
        if (data.attendance) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.attendance,
            notifications: { ...DEFAULT_SETTINGS.notifications, ...data.attendance.notifications },
            display: { ...DEFAULT_SETTINGS.display, ...data.attendance.display },
            halfDayRules: { ...DEFAULT_SETTINGS.halfDayRules, ...(data.attendance.halfDayRules || {}) },
          });
        }
      } catch (error) {
        console.error("Failed to fetch settings", error);
        toast.error("Could not load settings");
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.put("/settings", { attendance: settings });
      toast.success("Configuration saved successfully");
    } catch (error) {
      console.error("Failed to save settings", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    
    const pIn = parseTime(settings.punchIn);
    const pOut = parseTime(settings.punchOut);
    const lIn = parseTime(settings.lunchIn);
    const lOut = parseTime(settings.lunchOut);
    
    const lunchDur = Math.max(0, lOut - lIn);
    const rawWork = pOut - pIn;
    const netWork = Math.max(0, rawWork - lunchDur);
    
    const workHours = Math.floor(netWork / 60);
    const workMins = netWork % 60;
    
    const lunchHours = Math.floor(lunchDur / 60);
    const lunchMins = lunchDur % 60;
    
    const weeklyHours = Math.round((netWork / 60) * settings.workDays.length);
    
    return {
      dailyWork: `${workHours}h ${workMins}m`,
      lunchDur: `${lunchHours}h ${lunchMins}m`,
      workDays: settings.workDays.length,
      weeklyHours: `${weeklyHours}h`
    };
  }, [settings]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance Configuration" description="Loading workspace policies..." />
        <SkeletonLoader type="stats" count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <SkeletonLoader type="card" count={1} className="h-[400px]" />
          <SkeletonLoader type="card" count={1} className="lg:col-span-3 h-[600px]" />
        </div>
      </div>
    );
  }

  const SECTIONS = [
    { id: 'punch', label: 'Punch In / Out', icon: Clock },
    { id: 'lunch', label: 'Lunch Break', icon: Utensils },
    { id: 'schedule', label: 'Work Schedule', icon: Calendar },
    { id: 'grace', label: 'Grace & Overtime', icon: Zap },
    { id: 'rounding', label: 'Time Rounding', icon: RotateCcw },
    { id: 'notify', label: 'Notifications', icon: Bell },
    { id: 'display', label: 'Display & Format', icon: Monitor },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader 
        title="Attendance Configuration" 
        description="Define work hours, breaks, and time policies for your organization."
        actions={
          <Button 
            onClick={saveSettings} 
            disabled={saving}
            className="bg-gradient-primary text-white shadow-lg hover:shadow-xl transition-all h-10 px-6 rounded-xl font-bold"
          >
            {saving ? <RotateCcw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Daily Work Hours', value: summary.dailyWork, color: 'primary' },
          { label: 'Lunch Duration', value: summary.lunchDur, color: 'amber' },
          { label: 'Work Days / Week', value: summary.workDays, color: 'emerald' },
          { label: 'Weekly Hours', value: summary.weeklyHours, color: 'violet' },
        ].map((item, i) => (
          <Card key={i} className="border-none shadow-sm bg-white overflow-hidden group">
            <div className="p-4 relative">
              <div className={cn(
                "absolute top-0 right-0 h-24 w-24 -mr-8 -mt-8 rounded-full opacity-5 group-hover:opacity-10 transition-opacity",
                `bg-${item.color}-500`
              )} />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{item.label}</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Local Sidebar */}
        <Card className="lg:sticky lg:top-24 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
          <div className="p-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id);
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-bold transition-all",
                  activeSection === s.id 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <s.icon className={cn("h-4 w-4", activeSection === s.id ? "text-primary" : "text-muted-foreground/60")} />
                {s.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Content Sections */}
        <div className="lg:col-span-3 space-y-6">
          {/* PUNCH IN / OUT */}
          <section id="punch" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Punch In / Out</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Default start and end times for the work day</p>
                  </div>
                </div>
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">Required</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Punch In Time" 
                    hint="Standard shift start time"
                    control={
                      <Input 
                        type="time" 
                        value={settings.punchIn} 
                        onChange={(e) => setSettings({...settings, punchIn: e.target.value})}
                        className="w-32 h-10 font-bold border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/5" 
                      />
                    }
                  />
                  <ConfigRow 
                    label="Punch Out Time" 
                    hint="Standard shift end time"
                    control={
                      <Input 
                        type="time" 
                        value={settings.punchOut} 
                        onChange={(e) => setSettings({...settings, punchOut: e.target.value})}
                        className="w-32 h-10 font-bold border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/5" 
                      />
                    }
                  />
                  <ConfigRow 
                    label="Earliest Allowed Punch In" 
                    hint="Employees cannot punch in before this time"
                    control={
                      <Input 
                        type="time" 
                        value={settings.earliestIn} 
                        onChange={(e) => setSettings({...settings, earliestIn: e.target.value})}
                        className="w-32 h-10 font-bold border-border/60 rounded-xl focus:border-primary/40 focus:ring-primary/5" 
                      />
                    }
                  />
                  <ConfigRow 
                    label="Auto Punch Out" 
                    hint="Automatically punch out at the latest allowed time"
                    control={<Switch checked={settings.autoPunchOut} onCheckedChange={(v) => setSettings({...settings, autoPunchOut: v})} />}
                  />
                  <ConfigRow 
                    label="Require GPS Location" 
                    hint="Location verification required for all punch actions"
                    control={<Switch checked={settings.requireLocation} onCheckedChange={(v) => setSettings({...settings, requireLocation: v})} />}
                  />
                  <ConfigRow 
                    label="Allow Multiple Punches" 
                    hint="Allow employees to punch in and out multiple times in a single day (multiple shifts)"
                    control={<Switch checked={settings.allowMultiplePunches} onCheckedChange={(v) => setSettings({...settings, allowMultiplePunches: v})} />}
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* LUNCH BREAK */}
          <section id="lunch" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Utensils className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Lunch Break</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Configure meal break windows and durations</p>
                  </div>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">Optional</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Lunch Window" 
                    hint="Start and end of the lunch period"
                    control={
                      <div className="flex items-center gap-3">
                        <Input type="time" value={settings.lunchIn} onChange={(e) => setSettings({...settings, lunchIn: e.target.value})} className="w-32 h-10 font-bold border-border/60 rounded-xl" />
                        <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest">To</span>
                        <Input type="time" value={settings.lunchOut} onChange={(e) => setSettings({...settings, lunchOut: e.target.value})} className="w-32 h-10 font-bold border-border/60 rounded-xl" />
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Break Duration" 
                    hint="Shortest and longest permitted periods"
                    control={
                      <div className="w-[260px] space-y-4 pt-2">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                            <span>Min: {settings.minLunch}m</span>
                            <span>Max: {settings.maxLunch}m</span>
                          </div>
                          <Slider 
                            defaultValue={[settings.minLunch, settings.maxLunch]} 
                            max={120} 
                            min={15} 
                            step={5}
                            onValueChange={([min, max]) => setSettings({...settings, minLunch: min, maxLunch: max})}
                          />
                        </div>
                      </div>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* WORK SCHEDULE */}
          <section id="schedule" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Work Schedule</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Working days and weekly targets</p>
                  </div>
                </div>
                <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-none rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">Required</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Working Days" 
                    hint="Standard operating days per week"
                    control={
                      <div className="flex gap-1.5">
                        {['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'].map((day) => (
                          <button
                            key={day}
                            onClick={() => {
                              const newDays = settings.workDays.includes(day)
                                ? settings.workDays.filter(d => d !== day)
                                : [...settings.workDays, day];
                              setSettings({...settings, workDays: newDays});
                            }}
                            className={cn(
                              "h-9 w-9 rounded-full text-[11px] font-black transition-all border flex items-center justify-center",
                              settings.workDays.includes(day)
                                ? "bg-primary border-primary text-white shadow-md scale-110"
                                : "bg-background border-border/60 text-muted-foreground hover:border-primary/40"
                            )}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Daily Target Hours" 
                    hint="Required productive hours excluding breaks"
                    control={
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number" 
                          value={settings.reqHours} 
                          onChange={(e) => setSettings({...settings, reqHours: Number(e.target.value)})} 
                          className="w-16 h-10 font-bold border-border/60 rounded-xl text-center" 
                        />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">h</span>
                        <Input 
                          type="number" 
                          value={settings.reqMins} 
                          onChange={(e) => setSettings({...settings, reqMins: Number(e.target.value)})} 
                          className="w-16 h-10 font-bold border-border/60 rounded-xl text-center" 
                        />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">m</span>
                      </div>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* HALF-DAY RULES */}
          <section id="halfday" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Half-Day Rules</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Configure when a day is marked as half day at punch-out</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">

                {/* Method selector */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Detection method</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([
                      { value: 'durationBased', label: 'Duration Only', desc: 'Half day if net hours worked < minimum threshold' },
                      { value: 'timeBased',     label: 'Cutoff Time Only', desc: 'Half day if punch-in is after the set cutoff time' },
                      { value: 'both',          label: 'Both Methods', desc: 'Apply both rules — configure combination logic below' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSettings({ ...settings, halfDayRules: { ...settings.halfDayRules, method: opt.value } })}
                        className={cn(
                          "text-left p-4 rounded-xl border-2 transition-all",
                          settings.halfDayRules.method === opt.value
                            ? "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-border/40 bg-muted/10 hover:border-amber-300"
                        )}
                      >
                        <div className="text-[13px] font-bold">{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Combination logic (only when 'both') */}
                {settings.halfDayRules.method === 'both' && (
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Combination logic</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'or',  label: 'Either fails → half day', desc: 'Stricter: late arrival OR short hours triggers it' },
                        { value: 'and', label: 'Both fail → half day',    desc: 'Lenient: must be late AND work short hours' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSettings({ ...settings, halfDayRules: { ...settings.halfDayRules, bothLogic: opt.value } })}
                          className={cn(
                            "text-left p-4 rounded-xl border-2 transition-all",
                            settings.halfDayRules.bothLogic === opt.value
                              ? "border-amber-500 bg-amber-50 text-amber-700"
                              : "border-border/40 bg-muted/10 hover:border-amber-300"
                          )}
                        >
                          <div className="text-[13px] font-bold">{opt.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Cutoff time (time-based or both) */}
                  {(settings.halfDayRules.method === 'timeBased' || settings.halfDayRules.method === 'both') && (
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Late-arrival cutoff
                      </Label>
                      <Input
                        type="time"
                        value={settings.halfDayRules.cutoffTime}
                        onChange={(e) => setSettings({ ...settings, halfDayRules: { ...settings.halfDayRules, cutoffTime: e.target.value } })}
                        className="h-10 rounded-xl border-border/60 text-[13px] font-bold"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Punch-in strictly after this time counts as late. Exactly at {settings.halfDayRules.cutoffTime} is still on time.
                      </p>
                    </div>
                  )}

                  {/* Min hours (duration-based or both) */}
                  {(settings.halfDayRules.method === 'durationBased' || settings.halfDayRules.method === 'both') && (
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Minimum hours for full day
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1} max={12} step={0.5}
                          value={settings.halfDayRules.minHours}
                          onChange={(e) => setSettings({ ...settings, halfDayRules: { ...settings.halfDayRules, minHours: parseFloat(e.target.value) || 0 } })}
                          className="w-24 h-10 rounded-xl border-border/60 text-[13px] font-bold text-center"
                        />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">hours</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Net worked time below this = half day. Currently: {settings.halfDayRules.minHours}h required.
                      </p>
                    </div>
                  )}
                </div>

                {/* Lunch deduction toggle (duration-based or both) */}
                {(settings.halfDayRules.method === 'durationBased' || settings.halfDayRules.method === 'both') && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40">
                    <div>
                      <div className="text-[13px] font-bold">Deduct lunch break from hours</div>
                      <div className="text-[11px] text-muted-foreground">
                        {settings.halfDayRules.deductLunch
                          ? `Net hours = (punch-out − punch-in) − lunch break. If lunch wasn't recorded, no deduction.`
                          : `Gross hours = punch-out − punch-in (lunch not subtracted).`}
                      </div>
                    </div>
                    <Switch
                      checked={settings.halfDayRules.deductLunch}
                      onCheckedChange={(v) => setSettings({ ...settings, halfDayRules: { ...settings.halfDayRules, deductLunch: v } })}
                    />
                  </div>
                )}

                {/* Live preview */}
                <div className="rounded-xl bg-muted/10 border border-border/30 p-4 text-[11px] text-muted-foreground space-y-1">
                  <p className="font-bold text-foreground text-[12px] mb-2">Current rule summary</p>
                  {settings.halfDayRules.method === 'durationBased' && (
                    <p>Half day if net {settings.halfDayRules.deductLunch ? '(post-lunch)' : '(gross)'} hours worked &lt; <strong>{settings.halfDayRules.minHours}h</strong></p>
                  )}
                  {settings.halfDayRules.method === 'timeBased' && (
                    <p>Half day if punch-in is after <strong>{settings.halfDayRules.cutoffTime}</strong> (strictly)</p>
                  )}
                  {settings.halfDayRules.method === 'both' && (
                    <>
                      <p>Half day if punch-in after <strong>{settings.halfDayRules.cutoffTime}</strong> <strong>{settings.halfDayRules.bothLogic === 'or' ? 'OR' : 'AND'}</strong> net hours &lt; <strong>{settings.halfDayRules.minHours}h</strong></p>
                      <p className="opacity-70">{settings.halfDayRules.bothLogic === 'or' ? 'Stricter: either condition alone triggers half day.' : 'Lenient: both conditions must be true.'}</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* GRACE & OVERTIME */}
          <section id="grace" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Grace & Overtime</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Lateness tolerance and overtime rules</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Late Arrival Grace" 
                    hint="Tolerance window after shift start"
                    control={
                      <div className="w-[200px] flex items-center gap-4">
                        <Slider value={[settings.lateGrace]} max={60} onValueChange={([v]) => setSettings({...settings, lateGrace: v})} />
                        <span className="text-[13px] font-bold w-10 text-right">{settings.lateGrace}m</span>
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Overtime Threshold" 
                    hint="Hours after which OT rate applies"
                    control={
                      <div className="w-[200px] flex items-center gap-4">
                        <Slider value={[settings.otThreshold]} min={6} max={12} step={0.5} onValueChange={([v]) => setSettings({...settings, otThreshold: v})} />
                        <span className="text-[13px] font-bold w-10 text-right">{settings.otThreshold}h</span>
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Overtime Multiplier" 
                    hint="Pay rate for overtime hours"
                    control={
                      <div className="flex gap-2">
                        {[1.25, 1.5, 1.75, 2].map((m) => (
                          <button
                            key={m}
                            onClick={() => setSettings({...settings, otMultiplier: m})}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border",
                              settings.otMultiplier === m
                                ? "bg-primary border-primary text-white shadow-sm"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5"
                            )}
                          >
                            {m}x
                          </button>
                        ))}
                      </div>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>
          
          {/* TIME ROUNDING */}
          <section id="rounding" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Time Rounding</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Standardize punch times for payroll calculation</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Rounding Interval" 
                    hint="Block size for time rounding"
                    control={
                      <Select 
                        value={settings.roundingInterval.toString()} 
                        onValueChange={(v) => setSettings({...settings, roundingInterval: Number(v)})}
                      >
                        <SelectTrigger className="w-32 h-10 font-bold border-border/60 rounded-xl">
                          <SelectValue placeholder="Interval" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 5, 10, 15, 30, 60].map(m => (
                            <SelectItem key={m} value={m.toString()}>{m} mins</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                  <ConfigRow 
                    label="Rounding Direction" 
                    hint="How to snap time to the interval"
                    control={
                      <div className="flex gap-2">
                        {[
                          { id: 'up', label: 'Up' },
                          { id: 'down', label: 'Down' },
                          { id: 'nearest', label: 'Nearest' }
                        ].map((d) => (
                          <button
                            key={d.id}
                            onClick={() => setSettings({...settings, roundingDirection: d.id})}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[11px] font-bold transition-all border",
                              settings.roundingDirection === d.id
                                ? "bg-primary border-primary text-white shadow-sm"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5"
                            )}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Apply Rounding To" 
                    hint="Specific actions that will be rounded"
                    control={
                      <div className="flex flex-wrap gap-2 justify-end max-w-[300px]">
                        {['Punch In', 'Punch Out', 'Lunch In', 'Lunch Out'].map((item) => (
                          <button
                            key={item}
                            onClick={() => {
                              const newApplied = settings.roundingAppliedTo.includes(item)
                                ? settings.roundingAppliedTo.filter(i => i !== item)
                                : [...settings.roundingAppliedTo, item];
                              setSettings({...settings, roundingAppliedTo: newApplied});
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all border",
                              settings.roundingAppliedTo.includes(item)
                                ? "bg-primary/10 border-primary/30 text-primary shadow-sm"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5"
                            )}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* NOTIFICATIONS */}
          <section id="notify" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Notifications & Reminders</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Alerts for time-related events</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Punch In Reminder" 
                    hint="Sent before shift start"
                    control={
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Input type="number" value={settings.notifications.punchInReminderMins} onChange={(e) => setSettings({...settings, notifications: {...settings.notifications, punchInReminderMins: Number(e.target.value)}})} className="w-16 h-9 font-bold rounded-lg text-center" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">min before</span>
                        </div>
                        <Switch checked={settings.notifications.punchInReminder} onCheckedChange={(v) => setSettings({...settings, notifications: {...settings.notifications, punchInReminder: v}})} />
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Lunch Reminder" 
                    hint="Sent before lunch break starts"
                    control={
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Input type="number" value={settings.notifications.lunchReminderMins} onChange={(e) => setSettings({...settings, notifications: {...settings.notifications, lunchReminderMins: Number(e.target.value)}})} className="w-16 h-9 font-bold rounded-lg text-center" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">min before</span>
                        </div>
                        <Switch checked={settings.notifications.lunchReminder} onCheckedChange={(v) => setSettings({...settings, notifications: {...settings.notifications, lunchReminder: v}})} />
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Lunch Return Reminder" 
                    hint="Sent before lunch break ends"
                    control={
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Input type="number" value={settings.notifications.lunchReturnReminderMins} onChange={(e) => setSettings({...settings, notifications: {...settings.notifications, lunchReturnReminderMins: Number(e.target.value)}})} className="w-16 h-9 font-bold rounded-lg text-center" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">min before</span>
                        </div>
                        <Switch checked={settings.notifications.lunchReturnReminder} onCheckedChange={(v) => setSettings({...settings, notifications: {...settings.notifications, lunchReturnReminder: v}})} />
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Punch Out Reminder" 
                    hint="Sent before shift ends"
                    control={
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Input type="number" value={settings.notifications.punchOutReminderMins} onChange={(e) => setSettings({...settings, notifications: {...settings.notifications, punchOutReminderMins: Number(e.target.value)}})} className="w-16 h-9 font-bold rounded-lg text-center" />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">min before</span>
                        </div>
                        <Switch checked={settings.notifications.punchOutReminder} onCheckedChange={(v) => setSettings({...settings, notifications: {...settings.notifications, punchOutReminder: v}})} />
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Missed Punch Alert" 
                    hint="Notify when shift starts without punch-in"
                    control={<Switch checked={settings.notifications.missedPunchAlert} onCheckedChange={(v) => setSettings({...settings, notifications: {...settings.notifications, missedPunchAlert: v}})} />}
                  />
                  <ConfigRow 
                    label="Notify via" 
                    hint="Primary communication channels"
                    control={
                      <div className="flex gap-2">
                        {[
                          { id: 'Push', icon: Smartphone },
                          { id: 'SMS', icon: MessageSquare },
                          { id: 'Email', icon: Mail }
                        ].map((ch) => (
                          <button
                            key={ch.id}
                            onClick={() => {
                              const newChs = settings.notifications.channels.includes(ch.id)
                                ? settings.notifications.channels.filter(c => c !== ch.id)
                                : [...settings.notifications.channels, ch.id];
                              setSettings({...settings, notifications: {...settings.notifications, channels: newChs}});
                            }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border",
                              settings.notifications.channels.includes(ch.id)
                                ? "bg-primary border-primary text-white shadow-sm"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5"
                            )}
                          >
                            <ch.icon className="h-3.5 w-3.5" />
                            {ch.id}
                          </button>
                        ))}
                      </div>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* DISPLAY & FORMAT */}
          <section id="display" className="scroll-mt-24">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-6 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">Display & Format</CardTitle>
                    <p className="text-[11px] text-muted-foreground font-medium">Regional settings and time representation</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30">
                  <ConfigRow 
                    label="Time Format" 
                    hint="How hours and minutes are displayed"
                    control={
                      <div className="flex gap-2">
                        {['12h', '24h'].map((f) => (
                          <button
                            key={f}
                            onClick={() => setSettings({...settings, display: {...settings.display, timeFormat: f}})}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[11px] font-bold transition-all border",
                              settings.display.timeFormat === f
                                ? "bg-primary border-primary text-white shadow-sm"
                                : "bg-background border-border/60 text-muted-foreground hover:bg-primary/5"
                            )}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <ConfigRow 
                    label="Timezone" 
                    hint="Primary timezone for all logs"
                    control={
                      <Select 
                        value={settings.display.timezone} 
                        onValueChange={(v) => setSettings({...settings, display: {...settings.display, timezone: v}})}
                      >
                        <SelectTrigger className="w-48 h-10 font-bold border-border/60 rounded-xl">
                          <SelectValue placeholder="Select Timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {['UTC+05:30', 'UTC+00:00', 'UTC-05:00', 'UTC+01:00'].map(tz => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                  <ConfigRow 
                    label="Week Starts On" 
                    hint="Default first day of the week"
                    control={
                      <Select 
                        value={settings.display.weekStart} 
                        onValueChange={(v) => setSettings({...settings, display: {...settings.display, weekStart: v}})}
                      >
                        <SelectTrigger className="w-36 h-10 font-bold border-border/60 rounded-xl">
                          <SelectValue placeholder="Select Day" />
                        </SelectTrigger>
                        <SelectContent>
                          {['Monday', 'Sunday'].map(day => (
                            <SelectItem key={day} value={day}>{day}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ 
  label, 
  hint, 
  control 
}: { 
  label: string; 
  hint: string; 
  control: React.ReactNode 
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/30">
      <div className="space-y-0.5">
        <h4 className="text-[13.5px] font-bold text-foreground">{label}</h4>
        <p className="text-[11.5px] text-muted-foreground font-medium leading-relaxed max-w-sm">{hint}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
