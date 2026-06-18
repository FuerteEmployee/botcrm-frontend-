import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { LogOut, Bell, Lock, Building2, Palette, AlertCircle, Mail, Phone, MapPin, Camera, User, LayoutGrid, List, CheckCircle2, ShieldCheck, Globe, Trash2, Edit2, Loader2, Clock, CalendarDays, Plus, X, GitBranch, Receipt, Search, LogIn, Copy, Check, Banknote } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { setSession, clearSession, getAccessLogs, type AccessLog } from "@/lib/auth";
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
import { usePermission } from "@/hooks/use-permission";

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
  const canCreate = can("settings", "create");
  const canEdit = can("settings", "edit");
  const canDelete = can("settings", "delete");

  const tabs = [
    { id: "general", label: "Org", icon: Building2 },
    { id: "branches", label: "Branches", icon: GitBranch },
    { id: "attendance", label: "Attendance", icon: Clock },
    { id: "payroll", label: "Payroll", icon: Banknote },
    { id: "salary_templates", label: "Pay Templates", icon: Receipt },
    { id: "preferences", label: "Prefs", icon: Bell },
    { id: "security", label: "Security", icon: Lock },
  ] as const;

  const [activeTab, setActiveTab] = useState<"general" | "branches" | "attendance" | "payroll" | "salary_templates" | "preferences" | "security">("general");
  const [loading, setLoading] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [notif, setNotif] = useState({ email: true, push: true, weekly: false });
  const [accessLogsOpen, setAccessLogsOpen] = useState(false);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [logsFilter, setLogsFilter] = useState<"all" | "login" | "logout">("all");
  const [logsSearch, setLogsSearch] = useState("");
  const [attendance, setAttendance] = useState({
    defaultShiftId: "",
    workDays: ["M", "T", "W", "Th", "F"],
    requireLocation: false,
    remotePunch: true,
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

  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const fetchSettings = async () => {
      setIsProfileLoading(true);
      setFetchError(false);
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
            requireLocation: data.attendance.requireLocation || false,
            remotePunch: data.attendance.remotePunch || true,
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

        if (data.appearance?.defaultLayout) {
          updateDefaultLayout(data.appearance.defaultLayout);
        }

        if (session) {
          setSession({
            ...session,
            companyName: data.companyName,
            companyLogo: logoUrl,
            address: data.address,
            email: data.email,
            phone: data.phone
          });
        }
      } catch (error: any) {
        console.error("Failed to fetch settings", error);
        if (error.response?.status === 404) {
          setFetchError(true);
        }
      } finally {
        setIsProfileLoading(false);
      }
    };
    fetchSettings();
  }, []);

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
      toast.success("Template created successfully");
    } catch (error) {
      toast.error("Failed to create template");
    }
  };

  const updateTemplateComponent = async (idx: number, key: string, field: string, value: any) => {
    const updatedTemplates = [...salaryTemplates];
    const template = updatedTemplates[idx];
    
    template.components = {
      ...template.components,
      [key]: {
        ...template.components[key],
        [field]: value
      }
    };

    setSalaryTemplates(updatedTemplates);
  };

  const saveTemplates = async () => {
    setLoading(true);
    try {
      await apiClient.put("/settings", { salaryTemplates });
      toast.success("Templates saved successfully");
      setEditingIdx(null);
    } catch (error) {
      toast.error("Failed to save templates");
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
      toast.success("Template deleted successfully");
    } catch (error) {
      toast.error("Failed to delete template");
    }
  };

  useEffect(() => {
    if (hasMounted) {
      setAccessLogs(getAccessLogs());
    }
  }, [hasMounted, accessLogsOpen]);

  const filteredLogs = accessLogs.filter((log) => {
    if (logsFilter === "login" && log.action !== "login") return false;
    if (logsFilter === "logout" && log.action !== "logout") return false;
    
    if (logsSearch.trim()) {
      const q = logsSearch.toLowerCase();
      return (
        log.name.toLowerCase().includes(q) ||
        log.role.toLowerCase().includes(q) ||
        log.phone.toLowerCase().includes(q) ||
        log.ipAddress.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!hasMounted) return null;

  const logout = () => {
    clearSession();
    toast.success("Logged out");
    navigate({ to: "/login" });
  };

  if (isProfileLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="Settings" description="Loading your workspace configurations..." />
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
        title="Workspace Settings"
        description="Global configurations for your organization's HRMS environment."
      />

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
                    ? "bg-white text-primary shadow-sm ring-1 ring-border/20" 
                    : "text-muted-foreground hover:bg-white/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 transition-transform duration-300", isActive && "scale-110")} />
                {tab.label}
                {isActive && (
                  <motion.div 
                    layoutId="active-settings-tab"
                    className="absolute inset-0 bg-white rounded-xl -z-10 shadow-sm"
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
              <Card className="p-8 border border-border/60 bg-white rounded-2xl shadow-sm">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    try {
                      await apiClient.put("/settings", { attendance });
                      toast.success("Attendance rules updated");
                    } catch (error) {
                      toast.error("Failed to update attendance rules");
                    } finally { setLoading(false); }
                  }}
                  className="space-y-10"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <div className="space-y-6">
                      <SectionHeader icon={Clock} label="Default Shift" description="Select the standard shift for new employees." />
                      <div className="grid grid-cols-1 gap-4">
                        <FormSelect
                          label="Global Default Shift"
                          value={attendance.defaultShiftId}
                          onValueChange={(v) => setAttendance(p => ({ ...p, defaultShiftId: v }))}
                          options={shifts.map(s => ({ value: s._id, label: `${s.name} (${formatTime12h(s.startTime)} - ${formatTime12h(s.endTime)})` }))}
                          placeholder="-- Select Default Shift --"
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <SectionHeader icon={ShieldCheck} label="Punch Controls" description="Security and location requirements." />
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40">
                          <div>
                            <div className="text-[13px] font-bold">Geofencing</div>
                            <div className="text-[11px] text-muted-foreground">Require GPS for every punch.</div>
                          </div>
                          <Switch 
                            checked={attendance.requireLocation} 
                            onCheckedChange={(v) => setAttendance(p => ({ ...p, requireLocation: v }))} 
                          />
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/40">
                          <div>
                            <div className="text-[13px] font-bold">Remote Punch</div>
                            <div className="text-[11px] text-muted-foreground">Allow clock-in from any location.</div>
                          </div>
                          <Switch 
                            checked={attendance.remotePunch} 
                            onCheckedChange={(v) => setAttendance(p => ({ ...p, remotePunch: v }))} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <SectionHeader icon={CalendarDays} label="Active Work Days" description="Select the days when attendance is mandatory." />
                    <div className="flex flex-wrap gap-3">
                      {["M", "T", "W", "Th", "F", "Sa", "Su"].map(day => (
                        <button
                          key={day}
                          type="button"
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
                  </div>

                  {canEdit && (
                    <div className="pt-6 flex justify-end border-t border-border/40">
                      <ActionButton
                        type="submit"
                        loading={loading}
                        variant="add"
                        showLabel
                        label="Apply Attendance Rules"
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
              <Card className="p-8 border border-border/60 bg-white rounded-2xl shadow-sm">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setLoading(true);
                    try {
                      await apiClient.put("/settings", { payroll });
                      toast.success("Payroll rules updated");
                    } catch {
                      toast.error("Failed to update payroll rules");
                    } finally { setLoading(false); }
                  }}
                  className="space-y-10"
                >
                  {/* Master toggle */}
                  <div>
                    <SectionHeader icon={Banknote} label="Deterministic Payroll Engine"
                      description="When ON, every rupee is derived from the 8-bucket day classification. When OFF, the legacy formula is used — safe for existing tenants." />
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
                              <div className="text-[13px] font-bold">Sandwich Rule</div>
                              <div className="text-[11px] text-muted-foreground">Weekly-off/holiday flanked by absent on both sides becomes LOP.</div>
                            </div>
                            <Switch checked={payroll.sandwichRuleEnabled} onCheckedChange={(v) => setPayroll(p => ({ ...p, sandwichRuleEnabled: v }))} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <SectionHeader icon={CheckCircle2} label="Rounding" description="Applied once to the final net salary." />
                        <div className="grid grid-cols-2 gap-3">
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
                              type="number" min={0} max={4}
                              value={payroll.rounding.precision}
                              onChange={(e) => setPayroll(p => ({ ...p, rounding: { ...p.rounding, precision: Number(e.target.value) } }))}
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
                          <div className="text-[10px] text-muted-foreground text-right font-medium">{(weight * 100).toFixed(0)}%</div>
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
              <Card className="p-8 border border-border/60 bg-white rounded-2xl shadow-sm">
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
                        <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="h-8 w-8 p-0 rounded-lg">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-3">
                        <Input 
                          placeholder="Template Name (e.g. Senior Developer)" 
                          className="h-11 bg-white rounded-xl"
                          value={newTemplateName}
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
                                : "border-border/60 bg-muted/10 hover:bg-white hover:border-primary/30 hover:shadow-md cursor-pointer group"
                            )}
                            onClick={() => !isEditing && canEdit && setEditingIdx(idx)}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "h-10 w-10 rounded-xl grid place-items-center shadow-sm border",
                                  isEditing ? "bg-primary text-white border-primary" : cn("bg-white border-border/60", getTemplateColor(template.name).split(' ')[1])
                                )}>
                                  <div className={cn("absolute h-10 w-10 rounded-xl opacity-10", isEditing ? "bg-white" : getTemplateColor(template.name).split(' ')[0])} />
                                  <Receipt className="h-5 w-5 relative z-10" />
                                </div>
                                <div>
                                  <h4 className="font-black text-[15px] tracking-tight">{template.name}</h4>
                                  {!isEditing && <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">0 Employees Linked</span>}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {isEditing ? (
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingIdx(null); }} className="h-8 w-8 p-0 rounded-lg">
                                    <X className="h-4 w-4" />
                                  </Button>
                                ) : canDelete ? (
                                  <ActionButton
                                    icon={Trash2}
                                    variant="delete"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                        value?.enabled ? "bg-white border-primary/30 shadow-sm" : "bg-muted/5 border-transparent opacity-60"
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
                                            <label htmlFor={`incl-${idx}-${key}`} className="text-[9px] font-bold text-muted-foreground cursor-pointer whitespace-nowrap">Incl.</label>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingIdx(null); }} className="font-bold text-[12px] rounded-xl">Cancel</Button>
                                  {canEdit && (
                                    <Button size="sm" onClick={(e) => { e.stopPropagation(); saveTemplates(); }} loading={loading} className="font-bold text-[12px] rounded-xl px-6 shadow-md shadow-primary/20">Save Template</Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5 border-t border-border/40 pt-3">
                                {Object.entries(template.components).map(([key, comp]: [string, any]) => (
                                  comp.enabled && (
                                    <div key={key} className="flex justify-between text-[11px]">
                                      <span className="text-muted-foreground font-medium uppercase tracking-tight">{formatKey(key)}</span>
                                      <span className="font-black text-foreground/80">{comp.type === 'percentage' ? `${comp.percentage}%` : `₹${comp.amount}`}</span>
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
                <Button size="sm" onClick={() => navigate({ to: "/branches" })} className="font-bold gap-2 rounded-xl h-9 px-5 text-[13px]">
                  <Plus className="h-4 w-4" /> Manage Branches
                </Button>
              </div>

              {branchesLoading ? (
                <SkeletonLoader type="card" count={3} />
              ) : branchList.length === 0 ? (
                <Card className="p-10 border border-border/60 bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
                    <GitBranch className="h-7 w-7" />
                  </div>
                  <p className="text-[14px] font-semibold text-foreground mb-1">No branches yet</p>
                  <p className="text-[12px] text-muted-foreground mb-5">Add your first branch to get started.</p>
                  <Button size="sm" onClick={() => navigate({ to: "/branches" })} className="font-bold rounded-xl h-9 px-6 text-[13px]">
                    Go to Branches →
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branchList.map((b) => (
                    <Card key={b._id} className="p-4 border border-border/60 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
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
                              {b.latitude.toFixed(2)}, {b.longitude.toFixed(2)}
                            </span>
                            {(b.employees ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                                {b.employees} staff
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-3 text-right">
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
              <Card className="p-0 border border-border/60 bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-8 bg-linear-to-br from-primary/5 via-transparent to-transparent border-b border-border/40">
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
                          onClick={() => document.getElementById("logo-upload")?.click()}
                          className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl bg-white text-primary shadow-xl border border-border/60 grid place-items-center hover:scale-110 active:scale-95 transition-all"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      )}
                      <input
                        type="file"
                        id="logo-upload"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setCompany(prev => ({ ...prev, logo: URL.createObjectURL(file) }));
                        }}
                      />
                    </div>
                    
                    <div className="flex-1 space-y-1.5">
                      <h2 className="text-2xl font-black tracking-tight text-foreground">{company.name || "Set Company Name"}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-lg gap-1">
                          <CheckCircle2 className="h-3 w-3" /> VERIFIED BUSINESS
                        </Badge>
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 font-medium">
                          <MapPin className="h-3.5 w-3.5" /> {company.address || "No address set"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8">
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
                        formData.append("notifications", JSON.stringify(notif));
                        formData.append("appearance", JSON.stringify({ defaultLayout }));
                        
                        const logoFile = (document.getElementById("logo-upload") as HTMLInputElement)?.files?.[0];
                        if (logoFile) formData.append("logo", logoFile);

                        const { data } = await apiClient.put("/settings", formData, {
                          headers: { "Content-Type": "multipart/form-data" }
                        });
                        
                        const logoUrl = data.companyLogo
                          ? (data.companyLogo.startsWith("http") ? data.companyLogo : `${IMAGE_BASE_URL}${data.companyLogo.startsWith("/") ? "" : "/"}${data.companyLogo}`)
                          : company.logo;

                        setCompany(prev => ({ ...prev, logo: logoUrl }));
                        if (session) setSession({ ...session, companyName: data.companyName, companyLogo: logoUrl, address: data.address, email: data.email, phone: data.phone });
                        toast.success("Profile updated successfully");
                      } catch (error: any) {
                        toast.error(error.response?.data?.message || "Update failed");
                      } finally { setLoading(false); }
                    }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                      <div className="space-y-6">
                        <SectionHeader icon={Building2} label="Organization Details" description="Basic identification info for your company." />
                        <FormInput 
                          label="Company Display Name" 
                          placeholder="e.g. Acme Corporation" 
                          icon={Building2}
                          value={company.name} 
                          onChange={(e) => setCompany(prev => ({ ...prev, name: e.target.value }))} 
                        />
                        <FormInput 
                          label="Headquarters Address" 
                          placeholder="Full office address" 
                          icon={MapPin}
                          value={company.address} 
                          onChange={(e) => setCompany(prev => ({ ...prev, address: e.target.value }))} 
                        />
                      </div>

                      <div className="space-y-6">
                        <SectionHeader icon={Mail} label="Contact Information" description="Official communication channels." />
                        <FormInput 
                          label="Administrative Email" 
                          type="email"
                          placeholder="admin@company.com" 
                          icon={Mail}
                          value={company.email} 
                          onChange={(e) => setCompany(prev => ({ ...prev, email: e.target.value }))} 
                        />
                        <FormInput 
                          label="Official Phone Number" 
                          placeholder="+1 (555) 000-0000" 
                          icon={Phone}
                          value={company.phone} 
                          onChange={(e) => setCompany(prev => ({ ...prev, phone: e.target.value }))} 
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-border/40">
                      <p className="text-[11px] text-muted-foreground font-medium max-w-xs italic">
                        All changes to company profile will be reflected across official reports and employee dashboards.
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
              <Card className="p-7 border border-border/60 bg-white rounded-2xl shadow-sm">
                <SectionHeader icon={Bell} label="Notification Channels" description="Configure how you receive system alerts." />
                <div className="space-y-1 mt-6">
                  {[
                    { key: "email" as const, title: "Email Broadcasts", desc: "Daily summary of employee activities." },
                    { key: "push" as const, title: "Desktop Push", desc: "Immediate browser notifications for alerts." },
                    { key: "weekly" as const, title: "Executive Report", desc: "Weekly performance and attendance digest." },
                  ].map(({ key, title, desc }, i, arr) => (
                    <div key={key}>
                      <div className="flex items-center justify-between py-4 hover:bg-muted/5 px-2 -mx-2 rounded-xl transition-colors">
                        <div className="space-y-0.5">
                          <div className="text-[13px] font-black text-foreground uppercase tracking-tight">{title}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">{desc}</div>
                        </div>
                        <Switch
                          checked={notif[key]}
                          onCheckedChange={(v) => {
                            setNotif(prev => ({ ...prev, [key]: v }));
                            toast.info(`${title} ${v ? 'enabled' : 'disabled'}`);
                          }}
                        />
                      </div>
                      {i < arr.length - 1 && <Separator className="bg-border/30 opacity-50" />}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Appearance Card */}
              <Card className="p-7 border border-border/60 bg-white rounded-2xl shadow-sm">
                <SectionHeader icon={Palette} label="Global Interface" description="Set your default viewing preferences." />
                <div className="mt-8 space-y-6">
                  <div>
                    <Label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-4 block">Default Data Presentation</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'list', label: 'Compact List', icon: List, desc: 'Maximum data density' },
                        { id: 'grid', label: 'Visual Grid', icon: LayoutGrid, desc: 'Rich card preview' },
                      ].map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            updateDefaultLayout(v.id as any);
                            toast.success(`Default layout set to ${v.label}`);
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
                            defaultLayout === v.id ? "bg-primary text-white scale-110 shadow-lg" : "bg-white group-hover:bg-primary/10 shadow-sm"
                          )}>
                            <v.icon className="h-6 w-6" />
                          </div>
                          <span className="text-[13px] font-black uppercase tracking-tight mb-1">{v.label}</span>
                          <span className="text-[10px] opacity-60 font-medium">{v.desc}</span>
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
              <Card className="p-8 border border-border/60 bg-white rounded-2xl shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="h-16 w-16 rounded-2xl bg-success/10 text-success grid place-items-center shadow-inner ring-1 ring-success/20">
                      <ShieldCheck className="h-8 w-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground tracking-tight">Active Administration Session</h3>
                      <p className="text-[13px] text-muted-foreground font-medium">Logged in as <span className="text-foreground font-bold">{session?.name}</span> • Super Admin</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <Button
                      variant="destructive"
                      className="h-11 px-8 rounded-xl bg-destructive/5 text-destructive hover:bg-destructive hover:text-white border border-destructive/20 font-black text-[14px] transition-all duration-300 shadow-sm"
                      onClick={logout}
                    >
                      <LogOut className="h-4 w-4 mr-2" /> End Current Session
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest opacity-50">Last Login: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-6 border border-border/60 bg-muted/5 rounded-2xl opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-not-allowed group">
                  <div className="flex items-center gap-3 mb-2">
                    <Lock className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[13px] font-black uppercase tracking-tight">Change Password</span>
                    <Badge variant="secondary" className="text-[9px] font-bold py-0 h-4">SOON</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium">Enhanced security with 2FA and password rotation policies.</p>
                </Card>
                <Card 
                  onClick={() => {
                    setAccessLogs(getAccessLogs());
                    setAccessLogsOpen(true);
                  }}
                  className="p-6 border border-border/60 bg-white hover:border-primary/30 hover:shadow-elegant rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Bell className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[13px] font-black uppercase tracking-tight text-foreground">Access Logs</span>
                    <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 bg-emerald-50 text-emerald-600 border-emerald-200">ACTIVE</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium">Monitor all administrative login attempts and IP addresses.</p>
                </Card>
              </div>
            </div>
          )}
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
        <DialogContent className="rounded-3xl p-6 md:p-8 border border-border/40 shadow-elegant max-w-2xl bg-white focus:outline-hidden">
          <DialogHeader className="space-y-1 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-foreground uppercase">System Access Logs</DialogTitle>
                <DialogDescription className="text-[12px] text-muted-foreground font-medium">
                  Real-time monitor of administrative authentication events and client IP addresses.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Controls: Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search by name, role, or IP address..."
                className="pl-10 h-10 rounded-xl bg-muted/20 border-border/60 text-[13px] font-medium"
                value={logsSearch}
                onChange={(e) => setLogsSearch(e.target.value)}
              />
              {logsSearch && (
                <button 
                  onClick={() => setLogsSearch("")} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-bold"
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
                    "px-3 py-1 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer",
                    logsFilter === filter
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Logs List with Custom Scrollbar */}
          <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin scrollbar-thumb-muted">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const isLogin = log.action === "login";
                const dateObj = new Date(log.timestamp);
                const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                
                return (
                  <div 
                    key={log.id} 
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
                          <span className="text-[13px] font-black text-foreground">{log.name}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 bg-muted/40 px-1.5 py-0.5 rounded-md">
                            {log.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <span className="font-bold">{log.phone}</span>
                          <span className="opacity-40">•</span>
                          <span>{getBrowserOS(log.userAgent)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start sm:items-end flex-col justify-between sm:text-right shrink-0 gap-1">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[11px] font-bold text-foreground/80 bg-white border border-border/50 px-2 py-0.5 rounded-lg select-all">
                          {log.ipAddress}
                        </code>
                        <CopyButton text={log.ipAddress} />
                      </div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                        {dateString} at {timeString}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-muted/5">
                <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[13px] font-bold text-foreground">No access logs found</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Try adjusting your filters or search query.</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between items-center border-t border-border/40 pt-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all access logs?")) {
                  window.localStorage.setItem("bot_hrms_access_logs", JSON.stringify([]));
                  setAccessLogs([]);
                  toast.success("Access logs cleared");
                }
              }}
              disabled={filteredLogs.length === 0}
              className="h-9 rounded-xl text-[11px] font-bold border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive hover:text-white transition-all px-4 cursor-pointer"
            >
              Clear Logs
            </Button>
            <DialogClose asChild>
              <Button className="h-9 px-6 rounded-xl font-bold text-[12px] cursor-pointer">
                Close Window
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
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
      className="p-1.5 rounded-lg border border-border/50 hover:bg-muted bg-white transition-all text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
      title="Copy IP Address"
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
