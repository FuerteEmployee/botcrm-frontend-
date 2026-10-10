import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppVersionCard } from "@/components/shared/app-update";
import { useState, useEffect, useMemo } from "react";
import { LogOut, Bell, Lock, Building2, Palette, AlertCircle, Mail, Phone, MapPin, Camera, User, LayoutGrid, List, CheckCircle2, ShieldCheck, Globe, Trash2, Edit2, Loader2, Clock, CalendarDays, Plus, X, GitBranch, Receipt, Search, LogIn, Copy, Check, Banknote, Smartphone, Utensils, Timer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { setSession } from "@/lib/auth";
import { logoutAndClear } from "@/lib/logout";
import { useLoginSessions, type LoginSession } from "@/services/client-service";
import { toast } from "sonner";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { cn, formatTime12h } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { ActionButton } from "@/components/shared/action-button";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { useShiftService } from "@/services/shift-service";
import { useBranchService } from "@/services/branch-service";
import { SettingsGuide, settingsGuideLines } from "@/components/settings/settings-guide";
import { OwnLocationRulesNote } from "@/components/settings/location-rule-notes";
import { usePermission } from "@/hooks/use-permission";
import { useFeatureToggles } from "@/hooks/use-feature-toggles";
import { formatINRFull } from "@/lib/format";
import { requestErrorMessage } from "@/services/request-error";
import { NoAccessNotice, PanelLoadError } from "@/components/settings/panel-notices";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SectionHeader({ icon: Icon, label, description }: { icon: any; label: string; description?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shadow-inner">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-[15px] font-bold text-foreground tracking-tight">{label}</h3>
      </div>
      {description && <p className="text-[12px] text-muted-foreground ml-12">{description}</p>}
    </div>
  );
}

function NumField({ label, hint, value, onChange, min = 0, max, step = 1, suffix }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-bold uppercase tracking-wide">{label}</Label>
      <div className="relative">
        <Input
          type="number" min={min} max={max} step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={cn("h-10 rounded-xl text-[13px]", suffix && "pr-12")}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

const formatKey = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').toUpperCase();
};

const getTemplateColor = (name: string) => {
  const colors = [
    'bg-blue-500 text-blue-500',
    'bg-purple-500 text-purple-500',
    'bg-emerald-500 text-emerald-500',
    'bg-amber-500 text-amber-500',
    'bg-rose-500 text-rose-500',
    'bg-indigo-500 text-indigo-500',
    'bg-cyan-500 text-cyan-500'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

function SettingsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const { shifts } = useShiftService();
  const { branches: branchList, isLoading: branchesLoading } = useBranchService();
  const { can } = usePermission();
  const { isFeatureEnabled } = useFeatureToggles();
  const canView = can("settings", "view");
  const canEdit = can("settings", "edit");
  // Every Settings write is one PUT /settings, which the server gates on the
  // EDIT right alone -- so "create" or "delete" without "edit" could only ever
  // fail. Pay-template buttons therefore also need edit.
  const canCreate = canEdit && can("settings", "create");
  const canDelete = canEdit && can("settings", "delete");

  const tabs = [
    { id: "general", label: "Company", icon: Building2 },
    { id: "branches", label: "Branches", icon: GitBranch },
    { id: "attendance", label: "Attendance", icon: Clock },
    { id: "payroll", label: "Payroll", icon: Banknote },
    { id: "salary_templates", label: "Pay Templates", icon: Receipt },
    { id: "preferences", label: "Preferences", icon: Bell },
    { id: "security", label: "Security", icon: Lock },
    { id: "about", label: "About", icon: Smartphone },
  ] as const;

  const [activeTab, setActiveTab] = useState<"general" | "branches" | "attendance" | "payroll" | "salary_templates" | "preferences" | "security" | "about">("general");
  const [loading, setLoading] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [notif, setNotif] = useState({ email: true, push: true, weekly: false });
  const [accessLogsOpen, setAccessLogsOpen] = useState(false);
  const { data: sessions, isLoading: isLogsLoading, isError: sessionsError } = useLoginSessions(undefined, 100);
  const [logsFilter, setLogsFilter] = useState<"all" | "login" | "logout">("all");
  const [logsSearch, setLogsSearch] = useState("");
  const [attendance, setAttendance] = useState({
    defaultShiftId: "",
    workDays: ["M", "T", "W", "Th", "F"],
    requireLocation: false,
    remotePunch: true,
    reqHours: 8,
    halfDayHours: 4,
    autoPunchOut: true,
    allowMultiplePunches: false,
    lunchIn: "13:00",
    lunchOut: "14:00",
    minLunch: 30,
    maxLunch: 90,
    lunchGrace: 5,
    lateGrace: 15,
    earlyGrace: 5,
    otThreshold: 9,
    otMultiplier: 1.5,
    weeklyOT: 45,
    blockPunchInAfterShiftEnd: true,
    punchInGraceAfterShiftEndMins: 0,
    correctionWindowDays: 7,
    lunchMinGapSeconds: 60,
    workMinGapSeconds: 60,
    punchDebounceSeconds: 120,
    trackingMode: "on_duty" as "on_duty" | "always",
    officeRadius: 3000,
    roundingInterval: 0,
    roundingDirection: "nearest" as "nearest" | "up" | "down",
    roundingAppliedTo: ["Punch In", "Punch Out"] as string[],
    halfDayRules: {
      method: "durationBased" as "durationBased" | "timeBased" | "both",
      bothLogic: "or" as "or" | "and",
      cutoffTime: "09:35",
      minHours: 8,
      deductLunch: true,
    },
  });
  const [payroll, setPayroll] = useState({
    enabled: false,
    dailyRateBasis: "fixed30" as "fixed30" | "fixed26" | "calendar" | "workingDay",
    sandwichRuleEnabled: true,
    rounding: { mode: "nearest" as "none" | "nearest" | "floor" | "ceil", precision: 0 },
    bucketWeights: {
      present: 1, wfh: 1, halfDay: 0.5, paidLeave: 1,
      weeklyOff: 1, holiday: 1, absent: 0, unpaidLeave: 0,
    },
  });
  const [salaryTemplates, setSalaryTemplates] = useState<{name: string; components: any}[]>([]);
  const [company, setCompany] = useState({
    name: "",
    logo: "",
    address: "",
    email: "",
    phone: "",
  });

  // Any failed load, not only a 404. The forms below start from defaults, so
  // showing them after a failed load meant one click on Save wrote those
  // defaults over the company's real rules.
  const [fetchError, setFetchError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Settings.employeeSelfService.allowSensitiveEdits -- may employees change
  // their own name, bank, PAN and Aadhaar in the app? Off unless turned on.
  const [allowSensitiveEdits, setAllowSensitiveEdits] = useState(false);
  const [savingSelfService, setSavingSelfService] = useState(false);
  const [logoPending, setLogoPending] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const fetchSettings = async () => {
      setIsProfileLoading(true);
      setFetchError(null);
      try {
        const { data } = await apiClient.get("/settings");
        
        const logoUrl = data.companyLogo
          ? (data.companyLogo.startsWith("http") ? data.companyLogo : `${IMAGE_BASE_URL}${data.companyLogo.startsWith("/") ? "" : "/"}${data.companyLogo}`)
          : `https://api.dicebear.com/7.x/initials/svg?seed=${data.companyName || "BOT"}`;

        setCompany({
          name: data.companyName || "",
          logo: logoUrl,
          address: data.address || "",
          email: data.email || "",
          phone: data.phone || "",
        });

        if (data.notifications) {
          setNotif(data.notifications);
        }

        if (data.attendance) {
          setAttendance({
            defaultShiftId: data.attendance.defaultShiftId || "",
            workDays: data.attendance.workDays || ["M", "T", "W", "Th", "F"],
            requireLocation: data.attendance.requireLocation ?? true,
            remotePunch: data.attendance.remotePunch ?? true,
            reqHours: data.attendance.reqHours ?? 8,
            halfDayHours: data.attendance.halfDayHours ?? 4,
            autoPunchOut: data.attendance.autoPunchOut ?? true,
            allowMultiplePunches: data.attendance.allowMultiplePunches ?? false,
            lunchIn: data.attendance.lunchIn || "13:00",
            lunchOut: data.attendance.lunchOut || "14:00",
            minLunch: data.attendance.minLunch ?? 30,
            maxLunch: data.attendance.maxLunch ?? 90,
            lunchGrace: data.attendance.lunchGrace ?? 5,
            lateGrace: data.attendance.lateGrace ?? 15,
            earlyGrace: data.attendance.earlyGrace ?? 5,
            otThreshold: data.attendance.otThreshold ?? 9,
            otMultiplier: data.attendance.otMultiplier ?? 1.5,
            weeklyOT: data.attendance.weeklyOT ?? 45,
            blockPunchInAfterShiftEnd: data.attendance.blockPunchInAfterShiftEnd ?? true,
            punchInGraceAfterShiftEndMins: data.attendance.punchInGraceAfterShiftEndMins ?? 0,
            correctionWindowDays: data.attendance.correctionWindowDays ?? 7,
            lunchMinGapSeconds: data.attendance.lunchMinGapSeconds ?? 60,
            workMinGapSeconds: data.attendance.workMinGapSeconds ?? 60,
            punchDebounceSeconds: data.attendance.punchDebounceSeconds ?? 120,
            trackingMode: data.attendance.trackingMode === "always" ? "always" : "on_duty",
            officeRadius: data.attendance.officeRadius ?? 3000,
            roundingInterval: data.attendance.roundingInterval ?? 0,
            roundingDirection: data.attendance.roundingDirection || "nearest",
            roundingAppliedTo: data.attendance.roundingAppliedTo || ["Punch In", "Punch Out"],
            halfDayRules: {
              method: data.attendance.halfDayRules?.method || "durationBased",
              bothLogic: data.attendance.halfDayRules?.bothLogic || "or",
              cutoffTime: data.attendance.halfDayRules?.cutoffTime || "09:35",
              minHours: data.attendance.halfDayRules?.minHours ?? 8,
              deductLunch: data.attendance.halfDayRules?.deductLunch ?? true,
            },
          });
        }
        
        if (data.payroll) {
          setPayroll(p => ({
            ...p,
            ...data.payroll,
            rounding: data.payroll.rounding || p.rounding,
            bucketWeights: { ...p.bucketWeights, ...(data.payroll.bucketWeights || {}) },
          }));
        }

        if (data.salaryTemplates) {
          setSalaryTemplates(data.salaryTemplates);
        }

        setAllowSensitiveEdits(data.employeeSelfService?.allowSensitiveEdits === true);

        if (data.appearance?.defaultLayout) {
          updateDefaultLayout(data.appearance.defaultLayout);
        }

        if (session) {
          // Company branding only. The company's contact phone and email are
          // not the signed-in person's: writing them into the session
          // replaced the admin's own login number wherever it is shown
          // (header, sidebar, Users) with the office number.
          setSession({
            ...session,
            companyName: data.companyName,
            companyLogo: logoUrl,
            address: data.address,
          });
        }
      } catch (error: any) {
        console.error("Failed to fetch settings", error);
        setFetchError(error || new Error("load failed"));
      } finally {
        setIsProfileLoading(false);
      }
    };
    fetchSettings();
  }, [reloadKey]);

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (salaryTemplates.some(t => t.name.toLowerCase() === newTemplateName.trim().toLowerCase())) {
      toast.error("A template with this name already exists");
      return;
    }
    
    const newTemplate = {
      name: newTemplateName.trim(),
      components: {
        basic: { enabled: true, percentage: 50, amount: 0, type: 'percentage', includeInTotal: true },
        hra: { enabled: true, percentage: 40, amount: 0, type: 'percentage', includeInTotal: true },
        da: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        ca: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        pf: { enabled: false, percentage: 12, amount: 0, type: 'percentage', includeInTotal: true },
        esic: { enabled: false, percentage: 0.75, amount: 0, type: 'percentage', includeInTotal: true },
        epf: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        pt: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        tds: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        bonus: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        retention: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        adminCharge: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
        tdsOnProfession: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true }
      }
    };
    
    const updatedTemplates = [...salaryTemplates, newTemplate];
    
    try {
      await apiClient.put("/settings", { salaryTemplates: updatedTemplates });
      setSalaryTemplates(updatedTemplates);
      setIsCreating(false);
      setNewTemplateName("");
      toast.success("Template created");
    } catch (error) {
      const message = requestErrorMessage(error, "Could not create the template. Please try again.");
      if (message) toast.error(message);
    }
  };

  // Edits are made on a copy, so Cancel can put the template back. They used
  // to change the saved list in place: Cancel only closed the card, and the
  // abandoned edit was saved along with the next template anyone saved.
  const [templatesBeforeEdit, setTemplatesBeforeEdit] = useState<{name: string; components: any}[] | null>(null);
  const startEditTemplate = (idx: number) => {
    setTemplatesBeforeEdit(JSON.parse(JSON.stringify(salaryTemplates)));
    setEditingIdx(idx);
  };
  const cancelEditTemplate = () => {
    if (templatesBeforeEdit) setSalaryTemplates(templatesBeforeEdit);
    setTemplatesBeforeEdit(null);
    setEditingIdx(null);
  };

  const updateTemplateComponent = async (idx: number, key: string, field: string, value: any) => {
    setSalaryTemplates((prev) => prev.map((t, i) => i !== idx ? t : {
      ...t,
      components: { ...t.components, [key]: { ...t.components[key], [field]: value } },
    }));
  };

  const saveTemplates = async () => {
    setLoading(true);
    try {
      await apiClient.put("/settings", { salaryTemplates });
      toast.success("Template saved");
      setTemplatesBeforeEdit(null);
      setEditingIdx(null);
    } catch (error) {
      const message = requestErrorMessage(error, "Could not save the template. Please try again.");
      if (message) toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (idx: number) => {
    const updatedTemplates = salaryTemplates.filter((_, i) => i !== idx);
    
    try {
      await apiClient.put("/settings", { salaryTemplates: updatedTemplates });
      setSalaryTemplates(updatedTemplates);
      setDeleteIdx(null);
      toast.success("Template deleted");
    } catch (error) {
      const message = requestErrorMessage(error, "Could not delete the template. Please try again.");
      if (message) toast.error(message);
    }
  };

  // Saved the moment it is switched, like a light switch, and put back if the
  // save fails -- a single yes/no has nothing to review before saving, and a
  // switch that shows ON while the server still says OFF would mislead.
  const saveSelfService = async (next: boolean) => {
    setAllowSensitiveEdits(next);
    setSavingSelfService(true);
    try {
      await apiClient.put("/settings", { employeeSelfService: { allowSensitiveEdits: next } });
      toast.success(next
        ? "Employees can now change their bank, PAN and Aadhaar details"
        : "Only HR can change bank, PAN and Aadhaar details now");
    } catch (error) {
      setAllowSensitiveEdits(!next);
      const message = requestErrorMessage(error, "Could not save. Please try again.");
      if (message) toast.error(message);
    } finally {
      setSavingSelfService(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return (sessions ?? []).filter((log) => {
      if (logsFilter === "login" && log.action !== "login") return false;
      if (logsFilter === "logout" && log.action !== "logout") return false;
      
      if (logsSearch.trim()) {
        const q = logsSearch.toLowerCase();
        return (
          (log.name?.toLowerCase().includes(q) ?? false) ||
          (log.role?.toLowerCase().includes(q) ?? false) ||
          (log.phone?.toLowerCase().includes(q) ?? false) ||
          (log.ipAddress?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [sessions, logsFilter, logsSearch]);

  // The newest sign-in recorded for this person. The card used to print the
  // current clock time as "Last Login".
  const mySignIn = (sessions ?? []).find((s) => s.action === "login" && !!session?.phone && s.phone === session.phone) || null;

  if (!hasMounted) return null;

  const logout = async () => {
    await logoutAndClear();
    toast.success("Logged out");
    navigate({ to: "/login" });
  };

  if (!canView) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="Settings" description="Company details and the rules the app follows." />
        <NoAccessNotice
          title="You don't have access to Settings"
          message="Ask your company admin to give you the Settings page if you need it."
        />
      </div>
    );
  }

  if (fetchError && !isProfileLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="Settings" description="Company details and the rules the app follows." />
        <PanelLoadError
          what="your settings"
          message={requestErrorMessage(fetchError, "Something went wrong on our side. Please try again in a minute.")}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (isProfileLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="Settings" description="Loading your settings..." />
        <div className="flex gap-2 mb-6 border-b border-border/40 pb-px">
          {[1, 2, 3].map(i => <div key={i} className="h-10 w-32 bg-muted/20 animate-pulse rounded-t-xl" />)}
        </div>
        <SkeletonLoader type="card" count={1} className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <PageHeader
        title="Settings"
        description="Company details and the rules the app follows for attendance and pay."
      />

      {!canEdit && (
        <div role="status" className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
          You can look at these settings but not change them. Ask your company admin if something needs to change.
        </div>
      )}

      {/* Modern Tab System */}
      <div className="w-full overflow-x-auto scrollbar-none -mx-2 px-2 pb-1">
        <div className="flex items-center gap-1.5 p-1 bg-muted/30 border border-border/40 rounded-2xl w-fit min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-300 whitespace-nowrap",
                  isActive 
                    ? "bg-card text-primary shadow-sm ring-1 ring-border/20" 
                    : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 transition-transform duration-300", isActive && "scale-110")} />
                {tab.label}
                {isActive && (
                  <motion.div 
                    layoutId="active-settings-tab"
                    className="absolute inset-0 bg-card rounded-xl -z-10 shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "attendance" && (
            <div className="space-y-6">
              <Card className="p-5 sm:p-8 border border-border/60 bg-card rounded-2xl shadow-sm">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    try {
                      if (attendance.workDays.length === 0) {
                        toast.error("Pick at least one work day.");
                        return;
                      }
                      await apiClient.put("/settings", { attendance });
                      toast.success("Attendance rules saved");
                    } catch (error) {
                      const message = requestErrorMessage(error, "Could not save the attendance rules. Please try again.");
                      if (message) toast.error(message);
                    } finally { setLoading(false); }
                  }}
                  className="space-y-10"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {/* Default Shift */}
                    <div className="space-y-6">
                      <SectionHeader icon={Clock} label="Default Shift" description="Select standard shift automatically assigned to new employees." />
                      <div className="grid grid-cols-1 gap-4">
                        <FormSelect
                          label="Global Default Shift"
                          value={attendance.defaultShiftId}
                          onValueChange={(v) => setAttendance(p => ({ ...p, defaultShiftId: v }))}
                          options={shifts.map(s => ({ value: s._id, label: `${s.name} (${formatTime12h(s.startTime)} - ${formatTime12h(s.endTime)})` }))}
                          placeholder="-- Select Default Shift --"
                        />
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1">
                          <p className="text-[12px] font-semibold text-foreground">Configured in Shift Management</p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Shift timings, working hours, lunch break rules, and grace periods are configured directly per shift under <b>Shift Management</b>. New employees will automatically start on this default shift. A shift that leaves grace or lunch unset falls back to the <b>Company Fallbacks</b> below.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Punch Controls */}
                    <div className="space-y-6">
                      <SectionHeader icon={ShieldCheck} label="Punch Controls" description="Where people may punch from, and how often." />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40">
                          <div>
                            <div className="text-[13px] font-bold">Geofencing</div>
                            <div className="text-[11px] text-muted-foreground">Punch-in and punch-out need the phone's location, checked against the employee's branch.</div>
                          </div>
                          <Switch 
                            checked={attendance.requireLocation} 
                            onCheckedChange={(v) => setAttendance(p => ({ ...p, requireLocation: v }))} 
                          />
                        </div>
                        <OwnLocationRulesNote />
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40">
                          <div>
                            <div className="text-[13px] font-bold">Remote Punch</div>
                            <div className="text-[11px] text-muted-foreground">Let employees punch in from outside their branch.</div>
                          </div>
                          <Switch 
                            checked={attendance.remotePunch} 
                            onCheckedChange={(v) => setAttendance(p => ({ ...p, remotePunch: v }))} 
                          />
                        </div>
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40">
                          <div>
                            <div className="text-[13px] font-bold">Several punches a day</div>
                            <div className="text-[11px] text-muted-foreground">Let employees punch out and back in more than once a day.</div>
                          </div>
                          <Switch 
                            checked={attendance.allowMultiplePunches} 
                            onCheckedChange={(v) => setAttendance(p => ({ ...p, allowMultiplePunches: v }))} 
                          />
                        </div>
                        {/* When the phone records location, for employees whose tracking is on.
                            "Always" includes after work, so the choice is spelled out, and
                            employees are told on their own screen. Needs APK 17 or later:
                            older phones keep tracking only while punched in. */}
                        <div className="p-3.5 rounded-xl bg-muted/20 border border-border/40 space-y-3">
                          <div>
                            <div className="text-[13px] font-bold">Location tracking</div>
                            <div className="text-[11px] text-muted-foreground">
                              For employees whose tracking is switched on (on the employee or their department).
                            </div>
                          </div>
                          <div role="radiogroup" aria-label="Location tracking" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {([
                              { value: "on_duty", title: "On duty only", hint: "From punch-in to punch-out, lunch included." },
                              { value: "always", title: "Always", hint: "All the time, including after work, nights and days off." },
                            ] as const).map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={attendance.trackingMode === opt.value}
                                onClick={() => setAttendance(p => ({ ...p, trackingMode: opt.value }))}
                                className={`min-h-[44px] text-left rounded-lg border px-3 py-2 transition-colors ${attendance.trackingMode === opt.value ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/40"}`}
                              >
                                <div className="text-[13px] font-semibold">{opt.title}</div>
                                <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                              </button>
                            ))}
                          </div>
                          {attendance.trackingMode === "always" && (
                            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                              Employees are told on their phone that their location is recorded all the time, and the phone shows a permanent
                              "Location sharing is on" notification. Only phones on app version 17 or later can do this; older phones keep
                              tracking only while punched in. Make sure your employees have agreed to this.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Company-wide values the backend still reads. They are not
                      duplicates of the shift fields: a shift overrides each one
                      only when it sets its own, so these are what applies to
                      every shift that leaves a field at 0 or on "Company default". */}
                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={Timer} label="Company Fallbacks" description="Apply to any shift that does not set its own value. A shift's own grace or lunch always wins." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <NumField label="Late arrival grace" suffix="mins" value={attendance.lateGrace}
                        onChange={(v) => setAttendance(p => ({ ...p, lateGrace: v }))}
                        hint="Used when the shift's Late Punch In is 0." />
                      <NumField label="Early departure grace" suffix="mins" value={attendance.earlyGrace}
                        onChange={(v) => setAttendance(p => ({ ...p, earlyGrace: v }))}
                        hint="Used when the shift's Early Punch Out is 0." />
                      <NumField label="Company default lunch" suffix="mins" value={attendance.minLunch}
                        onChange={(v) => setAttendance(p => ({ ...p, minLunch: v }))}
                        hint={`Deducted on shifts whose lunch is "Company default". At least this much, more if a longer break is punched.`} />
                      <NumField label="Standard day" suffix="hrs" step={0.5} value={attendance.reqHours}
                        onChange={(v) => setAttendance(p => ({ ...p, reqHours: v }))}
                        hint="Sets the hourly rate for overtime, and credits daily-wage staff on a day with no punch times." />
                      <NumField label="Half-day credit" suffix="hrs" step={0.5} value={attendance.halfDayHours}
                        onChange={(v) => setAttendance(p => ({ ...p, halfDayHours: v }))}
                        hint="Hours credited to daily-wage staff for a half day with no punch times." />
                      <NumField label="Longest lunch" suffix="mins" max={600} value={attendance.maxLunch}
                        onChange={(v) => setAttendance(p => ({ ...p, maxLunch: v }))}
                        hint="A longer break is marked as an overrun on the Attendance page. It does not change pay." />
                    </div>
                  </div>

                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={CalendarDays} label="Half-Day Rules" description="Decide a half day for employees whose shift sets no grace of its own (both shift grace boxes at 0)." />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        { value: "durationBased", label: "Duration only", desc: "Half day if net hours worked are below the minimum." },
                        { value: "timeBased", label: "Cut-off time only", desc: "Half day if punch-in is after the cut-off." },
                        { value: "both", label: "Both", desc: "Combine the two rules, as set below." },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAttendance(p => ({ ...p, halfDayRules: { ...p.halfDayRules, method: opt.value } }))}
                          className={cn(
                            "w-full text-left p-3.5 rounded-xl border-2 transition-all",
                            attendance.halfDayRules.method === opt.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-muted bg-muted/10 hover:border-primary/30"
                          )}
                        >
                          <div className="text-[13px] font-bold">{opt.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {attendance.halfDayRules.method !== "durationBased" && (
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold uppercase tracking-wide">Late cut-off</Label>
                          <Input type="time" value={attendance.halfDayRules.cutoffTime}
                            onChange={(e) => setAttendance(p => ({ ...p, halfDayRules: { ...p.halfDayRules, cutoffTime: e.target.value } }))}
                            className="h-10 rounded-xl text-[13px]" />
                          <p className="text-[11px] text-muted-foreground">Exactly {formatTime12h(attendance.halfDayRules.cutoffTime)} is still on time.</p>
                        </div>
                      )}
                      {attendance.halfDayRules.method !== "timeBased" && (
                        <NumField label="Minimum hours" suffix="hrs" step={0.5} value={attendance.halfDayRules.minHours}
                          onChange={(v) => setAttendance(p => ({ ...p, halfDayRules: { ...p.halfDayRules, minHours: v } }))}
                          hint="Net worked time below this is a half day." />
                      )}
                      {attendance.halfDayRules.method === "both" && (
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold uppercase tracking-wide">Combine with</Label>
                          <select
                            value={attendance.halfDayRules.bothLogic}
                            onChange={(e) => setAttendance(p => ({ ...p, halfDayRules: { ...p.halfDayRules, bothLogic: e.target.value as "or" | "and" } }))}
                            className="w-full h-10 rounded-xl border border-border/60 bg-muted/10 text-[13px] px-3 font-medium"
                          >
                            <option value="or">OR: either rule alone makes a half day</option>
                            <option value="and">AND: both must be true</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40">
                      <div>
                        <div className="text-[13px] font-bold">Deduct lunch from worked hours</div>
                        <div className="text-[11px] text-muted-foreground">Turning this off stops lunch being deducted for everyone, on every shift, whatever the shift's own lunch setting.</div>
                      </div>
                      <Switch
                        checked={attendance.halfDayRules.deductLunch}
                        onCheckedChange={(v) => setAttendance(p => ({ ...p, halfDayRules: { ...p.halfDayRules, deductLunch: v } }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={Banknote} label="Overtime" description="Monthly-salaried staff only. Hours beyond the threshold are paid at the multiplier on the salary run." />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <NumField label="Daily threshold" suffix="hrs" min={1} step={0.5} value={attendance.otThreshold}
                        onChange={(v) => setAttendance(p => ({ ...p, otThreshold: v }))}
                        hint="Worked hours in a day above this count as overtime." />
                      <NumField label="Pay multiplier" suffix="×" step={0.25} value={attendance.otMultiplier}
                        onChange={(v) => setAttendance(p => ({ ...p, otMultiplier: v }))}
                        hint="0 turns overtime pay off." />
                      <NumField label="Weekly cap" suffix="hrs" min={1} value={attendance.weeklyOT}
                        onChange={(v) => setAttendance(p => ({ ...p, weeklyOT: v }))}
                        hint="The most overtime hours paid per week." />
                    </div>
                  </div>

                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={Clock} label="Punch Rounding & Late Punch-In" description="Rounding changes the stored punch time itself, before lateness, half-day and payroll are worked out." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wide">Round punches to</Label>
                        <select
                          value={attendance.roundingInterval}
                          onChange={(e) => setAttendance(p => ({ ...p, roundingInterval: Number(e.target.value) }))}
                          className="w-full h-10 rounded-xl border border-border/60 bg-muted/10 text-[13px] px-3 font-medium"
                        >
                          <option value={0}>Off (exact time)</option>
                          {[1, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m} mins</option>)}
                        </select>
                      </div>
                      {attendance.roundingInterval > 0 && (
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold uppercase tracking-wide">Direction</Label>
                          <select
                            value={attendance.roundingDirection}
                            onChange={(e) => setAttendance(p => ({ ...p, roundingDirection: e.target.value as "nearest" | "up" | "down" }))}
                            className="w-full h-10 rounded-xl border border-border/60 bg-muted/10 text-[13px] px-3 font-medium"
                          >
                            <option value="nearest">Nearest</option>
                            <option value="up">Up</option>
                            <option value="down">Down</option>
                          </select>
                        </div>
                      )}
                    </div>
                    {attendance.roundingInterval > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {["Punch In", "Punch Out", "Lunch In", "Lunch Out"].map(item => {
                          const on = attendance.roundingAppliedTo.includes(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setAttendance(p => ({
                                ...p,
                                roundingAppliedTo: on ? p.roundingAppliedTo.filter(i => i !== item) : [...p.roundingAppliedTo, item],
                              }))}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border",
                                on ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/10 border-border/60 text-muted-foreground hover:border-primary/30"
                              )}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40">
                      <div>
                        <div className="text-[13px] font-bold">Close punch-in after shift end</div>
                        <div className="text-[11px] text-muted-foreground">Refuse a new punch-in once the shift is over. Punching out is never blocked. Turn off for 24/7 operations.</div>
                      </div>
                      <Switch
                        checked={attendance.blockPunchInAfterShiftEnd}
                        onCheckedChange={(v) => setAttendance(p => ({ ...p, blockPunchInAfterShiftEnd: v }))}
                      />
                    </div>
                    {attendance.blockPunchInAfterShiftEnd && (
                      <div className="max-w-xs">
                        <NumField label="Late punch-in window" suffix="mins" value={attendance.punchInGraceAfterShiftEndMins}
                          onChange={(v) => setAttendance(p => ({ ...p, punchInGraceAfterShiftEndMins: v }))}
                          hint="Minutes past shift end during which a punch-in is still accepted." />
                      </div>
                    )}
                  </div>

                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={ShieldCheck} label="Punch Safeguards" description="Stop accidental double taps, and set how far back a missed punch can be fixed." />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <NumField label="Correction window" suffix="days" min={1} max={90} value={attendance.correctionWindowDays}
                        onChange={(v) => setAttendance(p => ({ ...p, correctionWindowDays: v }))}
                        hint="How many days back an employee can ask to fix a forgotten punch. Admins are not limited." />
                      <NumField label="Shortest lunch break" suffix="secs" max={3600} value={attendance.lunchMinGapSeconds}
                        onChange={(v) => setAttendance(p => ({ ...p, lunchMinGapSeconds: v }))}
                        hint="In the app, ending lunch sooner than this after starting it is refused. 0 turns it off." />
                      <NumField label="Shortest work stretch" suffix="secs" max={3600} value={attendance.workMinGapSeconds}
                        onChange={(v) => setAttendance(p => ({ ...p, workMinGapSeconds: v }))}
                        hint="In the app, starting lunch or punching out this soon after the previous punch is refused. 0 turns it off." />
                      <NumField label="Machine double-tap window" suffix="secs" max={3600} value={attendance.punchDebounceSeconds}
                        onChange={(v) => setAttendance(p => ({ ...p, punchDebounceSeconds: v }))}
                        hint="Biometric machines only: a second tap by the same person within this time is ignored. 0 turns it off." />
                      <NumField label="Default fence radius" suffix="m" min={50} max={100000} step={50} value={attendance.officeRadius}
                        onChange={(v) => setAttendance(p => ({ ...p, officeRadius: v }))}
                        hint="Used by any branch that has no radius of its own." />
                    </div>
                  </div>

                  <div className="space-y-6 border-t border-border/40 pt-8">
                    <SectionHeader icon={CalendarDays} label="Active Work Days" description="Days people are expected at work. A shift's own work days, or an employee's weekly holidays, take priority." />
                    <div className="flex flex-wrap gap-3">
                      {["M", "T", "W", "Th", "F", "Sa", "Su"].map(day => (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={attendance.workDays.includes(day)}
                          onClick={() => {
                            const newDays = attendance.workDays.includes(day)
                              ? attendance.workDays.filter(d => d !== day)
                              : [...attendance.workDays, day];
                            setAttendance(p => ({ ...p, workDays: newDays }));
                          }}
                          className={cn(
                            "h-12 w-12 rounded-xl text-[13px] font-black transition-all duration-300 border-2 shadow-sm",
                            attendance.workDays.includes(day)
                              ? "bg-primary border-primary text-white shadow-primary/20 scale-105"
                              : "bg-muted/30 border-muted text-muted-foreground hover:border-primary/40 hover:text-primary"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    {attendance.workDays.length === 0 && (
                      <p className="text-[12px] font-medium text-destructive">Pick at least one work day.</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="pt-6 flex justify-end border-t border-border/40">
                      <ActionButton
                        type="submit"
                        loading={loading}
                        variant="add"
                        showLabel
                        label="Save Attendance Rules"
                        className="px-10 h-11 rounded-xl shadow-lg shadow-primary/20"
                      />
                    </div>
                  )}
                </form>
              </Card>
            </div>
          )}

          {activeTab === "payroll" && (
            <div className="space-y-6">
              <Card className="p-5 sm:p-8 border border-border/60 bg-card rounded-2xl shadow-sm">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    try {
                      await apiClient.put("/settings", { payroll });
                      toast.success("Payroll rules saved");
                    } catch (error) {
                      const message = requestErrorMessage(error, "Could not save the payroll rules. Please try again.");
                      if (message) toast.error(message);
                    } finally { setLoading(false); }
                  }}
                  className="space-y-10"
                >
                  {/* Master toggle */}
                  <div>
                    <SectionHeader icon={Banknote} label="Deterministic Payroll Engine"
                      description="When on, every day of the month is sorted into one kind (present, half day, leave, weekly off and so on) and paid by the weights below. When off, the older salary formula is used." />
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40">
                      <div>
                        <div className="text-[13px] font-bold">Enable Payroll Engine</div>
                        <div className="text-[11px] text-muted-foreground">Uses configured daily-rate basis, sandwich rule and per-bucket weights.</div>
                      </div>
                      <Switch checked={payroll.enabled} onCheckedChange={(v) => setPayroll(p => ({ ...p, enabled: v }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {/* Daily rate basis */}
                    <div className="space-y-4">
                      <SectionHeader icon={Clock} label="Daily Rate Basis" description="How one day's salary is derived from the monthly CTC." />
                      {[
                        { value: "fixed30", label: "Fixed ÷ 30", desc: "CTC / 30 — same every month" },
                        { value: "fixed26", label: "Fixed ÷ 26", desc: "CTC / 26 — excludes weekends" },
                        { value: "calendar", label: "Calendar days", desc: "CTC / actual days in month" },
                        { value: "workingDay", label: "Working days", desc: "CTC / working days in month" },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPayroll(p => ({ ...p, dailyRateBasis: opt.value as any }))}
                          className={cn(
                            "w-full text-left p-4 rounded-xl border-2 transition-all",
                            payroll.dailyRateBasis === opt.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-muted bg-muted/10 hover:border-primary/30"
                          )}
                        >
                          <div className="text-[13px] font-bold">{opt.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>

                    {/* Rules */}
                    <div className="space-y-6">
                      <div>
                        <SectionHeader icon={ShieldCheck} label="Rules" />
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40">
                            <div>
                              <div className="text-[13px] font-bold">Sandwich Rule (Sunday / Weekly Off Pay)</div>
                              <div className="text-[11px] text-muted-foreground">When enabled, Sunday & weekly off-day salary is not paid if flanking days (Saturday & Monday) are absent.</div>
                            </div>
                            <Switch checked={payroll.sandwichRuleEnabled} onCheckedChange={(v) => setPayroll(p => ({ ...p, sandwichRuleEnabled: v }))} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <SectionHeader icon={CheckCircle2} label="Rounding" description="Applied once to the final net salary." />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold uppercase tracking-wide">Mode</Label>
                            <select
                              value={payroll.rounding.mode}
                              onChange={(e) => setPayroll(p => ({ ...p, rounding: { ...p.rounding, mode: e.target.value as any } }))}
                              className="w-full h-10 rounded-xl border border-border/60 bg-muted/10 text-[13px] px-3 font-medium"
                            >
                              <option value="nearest">Round to nearest</option>
                              <option value="floor">Floor</option>
                              <option value="ceil">Ceiling</option>
                              <option value="none">None (exact)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold uppercase tracking-wide">Decimal places</Label>
                            <Input
                              type="number" min={0} max={4} step={1}
                              value={payroll.rounding.precision}
                              onChange={(e) => setPayroll(p => ({ ...p, rounding: { ...p.rounding, precision: Math.min(4, Math.max(0, Math.round(Number(e.target.value) || 0))) } }))}
                              className="h-10 rounded-xl text-[13px]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Per-bucket weights */}
                  <div>
                    <SectionHeader icon={CalendarDays} label="Day Bucket Pay Weights"
                      description="Fraction of a full day's pay earned for each attendance bucket (0 = no pay, 1 = full pay, 0.5 = half pay)." />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(Object.entries(payroll.bucketWeights) as [string, number][]).map(([bucket, weight]) => (
                        <div key={bucket} className="space-y-1">
                          <Label className="text-[11px] font-bold uppercase tracking-wide capitalize">
                            {bucket.replace(/([A-Z])/g, ' $1')}
                          </Label>
                          <Input
                            type="number" min={0} max={1} step={0.05}
                            value={weight}
                            onChange={(e) => setPayroll(p => ({
                              ...p,
                              bucketWeights: { ...p.bucketWeights, [bucket]: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) }
                            }))}
                            className="h-10 rounded-xl text-[13px]"
                          />
                          <div className="text-[11px] text-muted-foreground text-right font-medium">{(weight * 100).toFixed(0)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="pt-6 flex justify-end border-t border-border/40">
                      <ActionButton
                        type="submit"
                        loading={loading}
                        variant="add"
                        showLabel
                        label="Save Payroll Settings"
                        className="px-10 h-11 rounded-xl shadow-lg shadow-primary/20"
                      />
                    </div>
                  )}
                </form>
              </Card>
            </div>
          )}

          {activeTab === "salary_templates" && (
            <div className="space-y-6">
              <Card className="p-8 border border-border/60 bg-card rounded-2xl shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/40">
                  <div>
                    <h3 className="text-lg font-black text-foreground">Pay Templates</h3>
                    <p className="text-sm text-muted-foreground mt-1">Define standard salary packages to quickly apply during employee onboarding.</p>
                  </div>
                  {!isCreating && canCreate && (
                    <Button onClick={() => setIsCreating(true)} className="font-bold gap-2 rounded-xl shadow-md h-10 px-5">
                      <Plus className="h-4 w-4" /> Create Template
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {/* Inline Creation Form */}
                  {isCreating && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 border-2 border-dashed border-primary/30 rounded-2xl bg-primary/5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-primary flex items-center gap-2">
                          <Plus className="h-4 w-4" /> New Template
                        </h4>
                        <Button variant="ghost" size="sm" aria-label="Close" onClick={() => setIsCreating(false)} className="h-10 w-10 p-0 rounded-lg">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-3">
                        <Input 
                          placeholder="Template Name (e.g. Senior Developer)" 
                          className="h-11 bg-card rounded-xl"
                          value={newTemplateName}
                          maxLength={60}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
                        />
                        <Button onClick={handleCreateTemplate} className="h-11 px-6 rounded-xl font-bold">Confirm</Button>
                      </div>
                    </motion.div>
                  )}

                  {salaryTemplates.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {salaryTemplates.map((template, idx) => {
                        const isEditing = editingIdx === idx;
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "p-5 border rounded-2xl transition-all duration-300 relative",
                              isEditing 
                                ? "col-span-full border-primary bg-primary/5 shadow-elegant ring-1 ring-primary/20" 
                                : "border-border/60 bg-muted/10 hover:bg-card hover:border-primary/30 hover:shadow-md cursor-pointer group"
                            )}
                            onClick={() => !isEditing && canEdit && editingIdx === null && startEditTemplate(idx)}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "h-10 w-10 rounded-xl grid place-items-center shadow-sm border",
                                  isEditing ? "bg-primary text-white border-primary" : cn("bg-card border-border/60", getTemplateColor(template.name).split(' ')[1])
                                )}>
                                  <div className={cn("absolute h-10 w-10 rounded-xl opacity-10", isEditing ? "bg-white" : getTemplateColor(template.name).split(' ')[0])} />
                                  <Receipt className="h-5 w-5 relative z-10" />
                                </div>
                                <div>
                                  <h4 className="font-black text-[15px] tracking-tight">{template.name}</h4>
                                  {!isEditing && canEdit && <span className="text-[11px] font-medium text-muted-foreground">Tap to edit</span>}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {isEditing ? (
                                  <Button variant="ghost" size="sm" aria-label="Close without saving" onClick={(e) => { e.stopPropagation(); cancelEditTemplate(); }} className="h-10 w-10 p-0 rounded-lg">
                                    <X className="h-4 w-4" />
                                  </Button>
                                ) : canDelete ? (
                                  <ActionButton
                                    icon={Trash2}
                                    variant="delete"
                                    className="h-10 w-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteIdx(idx);
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-1 gap-2.5">
                                  {Object.entries(template.components).map(([key, value]: [string, any]) => (
                                    <div
                                      key={key}
                                      className={cn(
                                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                                        value?.enabled ? "bg-card border-primary/30 shadow-sm" : "bg-muted/5 border-transparent opacity-60"
                                      )}
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <Switch
                                          checked={value.enabled}
                                          onCheckedChange={(v) => updateTemplateComponent(idx, key, 'enabled', v)}
                                          className="scale-75"
                                        />
                                        <span className="text-[12px] font-bold text-foreground/80 flex items-center gap-1.5">
                                          {formatKey(key)}
                                          {value.enabled && <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />}
                                        </span>
                                      </div>
                                      {value?.enabled && (
                                        <div className="flex items-center gap-1">
                                          <select
                                            className="h-7 text-[11px] rounded-md border border-border/60 bg-transparent px-1 focus:outline-hidden"
                                            value={value?.type || 'percentage'}
                                            onChange={(e) => updateTemplateComponent(idx, key, 'type', e.target.value)}
                                          >
                                            <option value="percentage">%</option>
                                            <option value="amount">₹</option>
                                          </select>
                                          <Input
                                            type="number"
                                            min="0"
                                            className="h-7 w-20 text-[11px] font-normal px-2 rounded-md border-border/60"
                                            value={value?.type === 'amount' ? (value?.amount || 0) : (value?.percentage || 0)}
                                            onChange={(e) => updateTemplateComponent(idx, key, value?.type === 'amount' ? 'amount' : 'percentage', parseFloat(e.target.value) || 0)}
                                          />
                                          <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-2">
                                            <input
                                              type="checkbox"
                                              checked={value?.includeInTotal !== false}
                                              onChange={(e) => updateTemplateComponent(idx, key, 'includeInTotal', e.target.checked)}
                                              className="scale-75 cursor-pointer"
                                              id={`incl-${idx}-${key}`}
                                            />
                                            <label htmlFor={`incl-${idx}-${key}`} className="text-[11px] font-bold text-muted-foreground cursor-pointer whitespace-nowrap">In total</label>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); cancelEditTemplate(); }} className="h-10 font-bold text-[12px] rounded-xl">Cancel</Button>
                                  {canEdit && (
                                    <Button size="sm" onClick={(e) => { e.stopPropagation(); saveTemplates(); }} loading={loading} className="h-10 font-bold text-[12px] rounded-xl px-6 shadow-md shadow-primary/20">Save Template</Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5 border-t border-border/40 pt-3">
                                {Object.entries(template.components).map(([key, comp]: [string, any]) => (
                                  comp.enabled && (
                                    <div key={key} className="flex justify-between text-[11px]">
                                      <span className="text-muted-foreground font-medium uppercase tracking-tight">{formatKey(key)}</span>
                                      <span className="font-black text-foreground/80">{comp.type === 'percentage' ? `${comp.percentage}%` : formatINRFull(comp.amount)}</span>
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : !isCreating && (
                    <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border/60 bg-muted/20">
                      <Receipt className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                      <h3 className="text-[15px] font-bold text-foreground">No templates yet</h3>
                      <p className="text-[13px] text-muted-foreground max-w-sm mx-auto mt-1">Create your first salary template to streamline the employee onboarding process.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "branches" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-foreground">Branches</h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">All office locations in your organisation</p>
                </div>
                <Button size="sm" onClick={() => navigate({ to: "/branches" })} className="font-bold gap-2 rounded-xl h-10 px-5 text-[13px]">
                  <Plus className="h-4 w-4" /> Manage Branches
                </Button>
              </div>

              {branchesLoading ? (
                <SkeletonLoader type="card" count={3} />
              ) : branchList.length === 0 ? (
                <Card className="p-10 border border-border/60 bg-card rounded-2xl shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
                    <GitBranch className="h-7 w-7" />
                  </div>
                  <p className="text-[14px] font-semibold text-foreground mb-1">No branches yet</p>
                  <p className="text-[12px] text-muted-foreground mb-5">Add your first branch to get started.</p>
                  <Button size="sm" onClick={() => navigate({ to: "/branches" })} className="font-bold rounded-xl h-10 px-6 text-[13px]">
                    Go to Branches →
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branchList.map((b) => (
                    <Card key={b._id} className="p-4 border border-border/60 bg-card rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-foreground truncate">{b.branchName}</p>
                          <p className="text-[12px] text-muted-foreground truncate mt-0.5">{b.branchLocation}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/8 px-2 py-0.5 rounded-lg">
                              <Globe className="h-3 w-3" />
                              {b.latitude != null && b.longitude != null && Number.isFinite(Number(b.latitude)) && Number.isFinite(Number(b.longitude))
                                ? `${Number(b.latitude).toFixed(2)}, ${Number(b.longitude).toFixed(2)}`
                                : "No location set"}
                            </span>
                            {(b.employees ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                {b.employees} staff
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-3 text-right">
                        Added {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Profile Overview Card */}
              <Card className="p-0 border border-border/60 bg-card rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 sm:p-8 bg-linear-to-br from-primary/5 via-transparent to-transparent border-b border-border/40">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="relative group">
                      <div className="h-28 w-28 rounded-3xl bg-white shadow-xl border-4 border-white overflow-hidden ring-1 ring-border/20">
                        {company.logo ? (
                          <img 
                            src={company.logo} 
                            alt="Logo" 
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${company.name}`; }}
                          />
                        ) : (
                          <div className="h-full w-full bg-primary/10 text-primary flex items-center justify-center font-black text-2xl uppercase">
                            {company.name?.charAt(0) || "B"}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label="Choose a new logo"
                          onClick={() => document.getElementById("logo-upload")?.click()}
                          className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl bg-card text-primary shadow-xl border border-border/60 grid place-items-center hover:scale-110 active:scale-95 transition-all"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      )}
                      <input
                        type="file"
                        id="logo-upload"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          // Same limits as the server, checked before anything is sent.
                          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                            toast.error("The logo must be a JPG, PNG or WebP image.");
                            e.target.value = "";
                            return;
                          }
                          if (file.size > 2 * 1024 * 1024) {
                            toast.error("The logo is too large. Use an image under 2 MB.");
                            e.target.value = "";
                            return;
                          }
                          setLogoPending(true);
                          setCompany(prev => ({ ...prev, logo: URL.createObjectURL(file) }));
                        }}
                      />
                    </div>
                    
                    <div className="flex-1 space-y-1.5">
                      <h2 className="text-2xl font-black tracking-tight text-foreground">{company.name || "Set Company Name"}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 font-medium">
                          <MapPin className="h-3.5 w-3.5" /> {company.address || "No address set"}
                        </span>
                      </div>
                      {canEdit && (
                        <p className={cn("text-[12px]", logoPending ? "font-semibold text-primary" : "text-muted-foreground")}>
                          {logoPending
                            ? "New logo chosen. Press Save Changes to keep it."
                            : "Logo: JPG, PNG or WebP, up to 2 MB."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-8">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLoading(true);
                      try {
                        const formData = new FormData();
                        formData.append("companyName", company.name);
                        formData.append("address", company.address);
                        formData.append("email", company.email);
                        formData.append("phone", company.phone);
                        // Only this tab's own fields. It used to send the
                        // Preferences tab's switches too, so saving the
                        // company name also saved whatever those showed.
                        
                        const logoFile = (document.getElementById("logo-upload") as HTMLInputElement)?.files?.[0];
                        if (logoFile) formData.append("logo", logoFile);

                        const { data } = await apiClient.put("/settings", formData, {
                          headers: { "Content-Type": "multipart/form-data" }
                        });
                        
                        const logoUrl = data.companyLogo
                          ? (data.companyLogo.startsWith("http") ? data.companyLogo : `${IMAGE_BASE_URL}${data.companyLogo.startsWith("/") ? "" : "/"}${data.companyLogo}`)
                          : company.logo;

                        setCompany(prev => ({ ...prev, logo: logoUrl }));
                        setLogoPending(false);
                        const input = document.getElementById("logo-upload") as HTMLInputElement | null;
                        if (input) input.value = "";
                        if (session) setSession({ ...session, companyName: data.companyName, companyLogo: logoUrl, address: data.address });
                        toast.success("Company details saved");
                      } catch (error: any) {
                        const message = requestErrorMessage(error, "Could not save the company details. Please try again.");
                        if (message) toast.error(message);
                      } finally { setLoading(false); }
                    }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                      <div className="space-y-6">
                        <SectionHeader icon={Building2} label="Organization Details" description="Basic identification info for your company." />
                        <FormInput 
                          label="Company Name"
                          placeholder="e.g. Sharma Traders"
                          maxLength={120} 
                          icon={Building2}
                          value={company.name} 
                          onChange={(e) => setCompany(prev => ({ ...prev, name: e.target.value }))} 
                        />
                        <FormInput 
                          label="Head Office Address"
                          placeholder="Full office address"
                          maxLength={500} 
                          icon={MapPin}
                          value={company.address} 
                          onChange={(e) => setCompany(prev => ({ ...prev, address: e.target.value }))} 
                        />
                      </div>

                      <div className="space-y-6">
                        <SectionHeader icon={Mail} label="Contact Information" description="Official communication channels." />
                        <FormInput 
                          label="Email"
                          type="email"
                          placeholder="hr@company.com"
                          maxLength={254} 
                          icon={Mail}
                          value={company.email} 
                          onChange={(e) => setCompany(prev => ({ ...prev, email: e.target.value }))} 
                        />
                        <FormInput 
                          label="Phone Number"
                          placeholder="98765 43210"
                          inputMode="tel"
                          maxLength={20} 
                          icon={Phone}
                          value={company.phone} 
                          onChange={(e) => setCompany(prev => ({ ...prev, phone: e.target.value }))} 
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-border/40">
                      <p className="text-[12px] text-muted-foreground max-w-xs">
                        The name and logo appear in this panel's header and on payslips.
                      </p>
                      {canEdit && (
                        <ActionButton
                          type="submit"
                          loading={loading}
                          variant="add"
                          showLabel
                          label="Save Changes"
                          className="px-10 h-11 rounded-xl shadow-lg shadow-primary/20 font-black text-[14px]"
                        />
                      )}
                    </div>
                  </form>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Notifications Card */}
              <Card className="p-5 sm:p-7 border border-border/60 bg-card rounded-2xl shadow-sm">
                <SectionHeader icon={Bell} label="Email and push alerts" description="Not available yet." />
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  No email, SMS or push service is connected yet, so the app does not send any alerts. These switches will be turned on once alerts are available.
                </p>
                <div className="space-y-1 mt-4 opacity-60" aria-disabled="true">
                  {[
                    { key: "email" as const, title: "Email Broadcasts", desc: "Daily summary of employee activities." },
                    { key: "push" as const, title: "Desktop Push", desc: "Immediate browser notifications for alerts." },
                    { key: "weekly" as const, title: "Executive Report", desc: "Weekly performance and attendance digest." },
                  ].map(({ key, title, desc }, i, arr) => (
                    <div key={key}>
                      <div className="flex items-center justify-between py-4 hover:bg-muted/5 px-2 -mx-2 rounded-xl transition-colors">
                        <div className="space-y-0.5">
                          <div className="text-[13px] font-bold text-foreground">{title}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">{desc}</div>
                        </div>
                        <Switch
                          checked={notif[key]}
                          disabled
                          aria-label={`${title} (not available yet)`}
                        />
                      </div>
                      {i < arr.length - 1 && <Separator className="bg-border/30 opacity-50" />}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Appearance Card */}
              <Card className="p-5 sm:p-7 border border-border/60 bg-card rounded-2xl shadow-sm">
                <SectionHeader icon={Palette} label="Default view" description="How lists such as Employees and Branches open: as a list or as cards." />
                <div className="mt-8 space-y-6">
                  <div>
                    <Label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-4 block">Open lists as</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'list', label: 'Compact List', icon: List, desc: 'Maximum data density' },
                        { id: 'grid', label: 'Visual Grid', icon: LayoutGrid, desc: 'Rich card preview' },
                      ].map(v => (
                        <button
                          key={v.id}
                          type="button"
                          aria-pressed={defaultLayout === v.id}
                          onClick={async () => {
                            updateDefaultLayout(v.id as any);
                            // Saved for the company too: opening Settings
                            // applies the company's saved view, so a choice
                            // kept only in this browser was undone the next
                            // time anyone opened this page.
                            if (!canEdit) {
                              toast.success(`${v.label} chosen for this device`);
                              return;
                            }
                            try {
                              await apiClient.put("/settings", { appearance: { defaultLayout: v.id } });
                              toast.success(`Lists now open as ${v.label}`);
                            } catch (error) {
                              const message = requestErrorMessage(error, "Could not save the default view. Please try again.");
                              if (message) toast.error(message);
                            }
                          }}
                          className={cn(
                            "flex flex-col items-center p-4 rounded-2xl border-2 transition-all group relative overflow-hidden text-center",
                            defaultLayout === v.id 
                              ? "border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20" 
                              : "border-border/50 hover:border-primary/20 text-muted-foreground bg-muted/5"
                          )}
                        >
                          <div className={cn(
                            "h-12 w-12 rounded-xl grid place-items-center mb-3 transition-all duration-500",
                            defaultLayout === v.id ? "bg-primary text-white scale-110 shadow-lg" : "bg-card group-hover:bg-primary/10 shadow-sm"
                          )}>
                            <v.icon className="h-6 w-6" />
                          </div>
                          <span className="text-[13px] font-black uppercase tracking-tight mb-1">{v.label}</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{v.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <Card className="p-8 border border-border/60 bg-card rounded-2xl shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="h-16 w-16 rounded-2xl bg-success/10 text-success grid place-items-center shadow-inner ring-1 ring-success/20">
                      <ShieldCheck className="h-8 w-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground tracking-tight">You are signed in</h3>
                      <p className="text-[13px] text-muted-foreground font-medium">As <span className="text-foreground font-bold">{session?.name}</span> · {session?.role === "subadmin" ? "Sub-admin" : "Admin"}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <Button
                      variant="destructive"
                      className="h-11 px-8 rounded-xl bg-destructive/5 text-destructive hover:bg-destructive hover:text-white border border-destructive/20 font-black text-[14px] transition-all duration-300 shadow-sm"
                      onClick={logout}
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Log out
                    </Button>
                    {mySignIn && (
                      <p className="text-[11px] text-center text-muted-foreground font-medium">
                        Signed in {new Date(mySignIn.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              {/* What employees may change about themselves in the app. Here
                  rather than under Org because it is about who can redirect
                  a salary: the bank account on file is where pay goes. */}
              <Card className="p-6 sm:p-8 border border-border/60 bg-card rounded-2xl shadow-sm">
                <SectionHeader icon={User} label="Employee App" description="What employees can change about themselves." />
                <label
                  htmlFor="allow-sensitive-edits"
                  className={cn(
                    "flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 border border-border/40",
                    canEdit && !savingSelfService ? "cursor-pointer" : "cursor-not-allowed"
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold">Let employees change their bank, PAN and Aadhaar details</div>
                    <div className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">
                      When this is off, only HR can change an employee's name, bank account, PAN or Aadhaar.
                    </div>
                  </div>
                  <Switch
                    id="allow-sensitive-edits"
                    checked={allowSensitiveEdits}
                    disabled={!canEdit || savingSelfService}
                    onCheckedChange={saveSelfService}
                  />
                </label>
              </Card>

              {/* Sign-in is by a one-time code, so there is no password to
                  change; the "Change Password - SOON" card promised one. */}
              <button
                type="button"
                onClick={() => setAccessLogsOpen(true)}
                className="w-full text-left p-6 border border-border/60 bg-card hover:border-primary/30 hover:shadow-elegant rounded-2xl transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Lock className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-[13px] font-bold text-foreground">Sign-in history</span>
                </div>
                <p className="text-[12px] text-muted-foreground">See who in your company signed in and out, when, and from which device.</p>
              </button>
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-6 max-w-2xl">
              <AppVersionCard />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Screens and fixes arrive over the air and need no reinstall. Anything that changes what
                the phone itself can do — background location, notifications, crash reporting — lives in
                the app version and needs a new APK.
              </p>
            </div>
          )}
          {/* Closes every tab: what the controls above actually do, and
              what they are currently set to. Rendered once, inside the tab
              animation, so it can never fall out of step with the tab it
              describes. */}
          <SettingsGuide
            lines={correctGuideLines(activeTab, settingsGuideLines(activeTab, {
              shiftName: shifts.find((s) => s._id === attendance.defaultShiftId)?.name || null,
              shiftCount: shifts.length,
              branchCount: branchList?.length || 0,
              workDayCount: attendance.workDays.length,
              requireLocation: attendance.requireLocation,
              remotePunch: attendance.remotePunch,
              payrollEnabled: payroll.enabled,
              dailyRateBasis: payroll.dailyRateBasis,
              sandwichRuleEnabled: payroll.sandwichRuleEnabled,
              roundingMode: payroll.rounding.mode,
              roundingPrecision: payroll.rounding.precision,
              templateCount: salaryTemplates.length,
              notifEmail: notif.email,
              notifPush: notif.push,
              notifWeekly: notif.weekly,
              companyName: company.name || null,
              allowSensitiveEdits,
            }))}
          />
        </motion.div>
      </AnimatePresence>

      <DeleteDialog
        open={deleteIdx !== null}
        onOpenChange={(open) => !open && setDeleteIdx(null)}
        onConfirm={() => deleteIdx !== null && handleDeleteTemplate(deleteIdx)}
        title="Delete Pay Template?"
        description={`Are you sure you want to delete "${deleteIdx !== null ? salaryTemplates[deleteIdx]?.name : ''}"? This will remove it from the list of available templates.`}
      />

      <Dialog open={accessLogsOpen} onOpenChange={setAccessLogsOpen}>
        <DialogContent className="rounded-3xl p-4 sm:p-6 md:p-8 border border-border/40 shadow-elegant max-w-2xl bg-card focus:outline-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="space-y-1 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-foreground">Sign-in history</DialogTitle>
                <DialogDescription className="text-[12px] text-muted-foreground font-medium">
                  The latest 100 sign-ins and sign-outs in your company, newest first. Recorded by the server.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
          {/* Controls: Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search by name, phone or IP address"
                className="pl-10 h-10 rounded-xl bg-muted/20 border-border/60 text-[13px] font-medium"
                value={logsSearch}
                onChange={(e) => setLogsSearch(e.target.value)}
              />
              {logsSearch && (
                <button
                  onClick={() => setLogsSearch("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-2 text-muted-foreground hover:text-foreground text-xs font-bold"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex gap-1.5 p-1 bg-muted/30 border border-border/40 rounded-xl self-start sm:self-auto">
              {(["all", "login", "logout"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLogsFilter(filter)}
                  className={cn(
                    "h-10 min-w-10 px-3 rounded-lg text-[12px] font-bold transition-all cursor-pointer",
                    logsFilter === filter
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter === "all" ? "All" : filter === "login" ? "Sign-ins" : "Sign-outs"}
                </button>
              ))}
            </div>
          </div>

          {/* Logs List with Custom Scrollbar */}
          <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin scrollbar-thumb-muted">
            {isLogsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-[12px] text-muted-foreground font-medium">Loading sign-in history...</p>
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const isLogin = log.action === "login";
                const dateObj = new Date(log.createdAt);
                const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                
                return (
                  <div 
                    key={log._id} 
                    className="p-4 rounded-2xl border border-border/40 bg-muted/5 hover:bg-muted/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-xl grid place-items-center shrink-0 border",
                        isLogin 
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                          : "bg-rose-50 text-rose-600 border-rose-200"
                      )}>
                        {isLogin ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black text-foreground">{log.name || "Unknown"}</span>
                          <span className="text-[11px] font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                            {log.role === "subadmin" ? "Sub-admin" : log.role === "admin" ? "Admin" : log.role === "employee" ? "Employee" : log.role === "superadmin" ? "Platform" : "User"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <span className="font-bold">{log.phone || "—"}</span>
                          <span className="opacity-40">•</span>
                          <span>{getBrowserOS(log.userAgent || "")}</span>
                          {log.appVersion && (
                            <>
                              <span className="opacity-40">•</span>
                              <span>v{log.appVersion}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start sm:items-end flex-col justify-between sm:text-right shrink-0 gap-1">
                      {log.ipAddress ? (
                        <div className="flex items-center gap-1.5">
                          <code className="text-[11px] font-bold text-foreground/80 bg-card border border-border/50 px-2 py-0.5 rounded-lg select-all">
                            {log.ipAddress}
                          </code>
                          <CopyButton text={log.ipAddress} />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground font-medium">—</span>
                      )}
                      <p className="text-[11px] text-muted-foreground font-bold">
                        {isLogin ? "Signed in" : "Signed out"} {dateString} at {timeString}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-muted/5 px-4">
                <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[13px] font-bold text-foreground">
                  {sessionsError ? "Could not load the sign-in history" : sessions && sessions.length === 0 ? "No sign-ins recorded yet" : "Nothing matches your search"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm mx-auto">
                  {sessionsError
                    ? "Check your internet connection, then close and open this window again."
                    : sessions && sessions.length === 0
                      ? "Sign-ins appear here as people sign in to the app or this panel."
                      : "Try another name, or choose All."}
                </p>
              </div>
            )}
          </div>
          </div>

          <div className="mt-6 flex justify-end items-center border-t border-border/40 pt-4 shrink-0">
            <DialogClose asChild>
              <Button className="h-10 px-6 rounded-xl font-bold text-[13px] cursor-pointer">
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * settings-guide.tsx is shared with the Shifts page, so its Settings lines are
 * corrected here rather than there. Each replacement states what this page
 * really does: there is no password (sign-in is by code), no date or timezone
 * control, alerts are not sent, and late grace and lunch DO have company
 * fallbacks on the Attendance tab.
 */
function correctGuideLines(tab: string, lines: { text: string; tone?: "on" | "off" | "info" | "warn" }[]) {
  return lines
    .filter((l) => !(tab === "preferences" && l.text.startsWith("Date, time and timezone")))
    .map((l) => {
      if (tab === "security" && l.text.startsWith("Change your password")) {
        return { ...l, text: "Review where your company's accounts have been signed in. There is no password: everyone signs in with a one-time code." };
      }
      if (tab === "attendance" && l.text.startsWith("Lunch, late grace and half-day limits are NOT here")) {
        return { ...l, text: "Lunch, late grace and half-day limits are set on each shift under Shift Management. The Company Fallbacks here apply only to a shift that leaves its own value at 0 or on Company default." };
      }
      if (tab === "preferences" && l.text.startsWith("Per-tenant display")) {
        return { ...l, text: "The default view is saved for the whole company. Alerts are not sent yet." };
      }
      return l;
    });
}

function Badge({ children, variant = "primary", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "outline"; className?: string }) {
  return (
    <div className={cn(
      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center justify-center",
      variant === "primary" ? "bg-primary text-white" : variant === "secondary" ? "bg-muted text-foreground" : "border border-border",
      className
    )}>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
      onClick={handleCopy}
      type="button"
      className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border/50 hover:bg-muted bg-card transition-all text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
      title="Copy IP address"
      aria-label="Copy IP address"
    >
      {copied ? <Check className="h-3 w-3 text-success animate-in zoom-in" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function getBrowserOS(userAgent: string) {
  if (!userAgent) return "Unknown Browser";
  let os = "Unknown OS";
  let browser = "Unknown Browser";
  
  if (userAgent.indexOf("Win") !== -1) os = "Windows";
  else if (userAgent.indexOf("Mac") !== -1) os = "macOS";
  else if (userAgent.indexOf("X11") !== -1) os = "Linux";
  else if (userAgent.indexOf("Linux") !== -1) os = "Linux";
  else if (userAgent.indexOf("Android") !== -1) os = "Android";
  else if (userAgent.indexOf("like Mac") !== -1) os = "iOS";
  
  if (userAgent.indexOf("Chrome") !== -1) browser = "Chrome";
  else if (userAgent.indexOf("Safari") !== -1) browser = "Safari";
  else if (userAgent.indexOf("Firefox") !== -1) browser = "Firefox";
  else if (userAgent.indexOf("MSIE") !== -1 || !!(document as any).documentMode) browser = "IE";
  else if (userAgent.indexOf("Edge") !== -1) browser = "Edge";
  
  return `${browser} on ${os}`;
}
