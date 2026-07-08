import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  Calendar,
  User,
  Mail,
  Phone,
  Briefcase,
  ShieldCheck,
  IndianRupee,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  Plus,
  Percent,
  Clock,
  LayoutGrid,
  VenetianMask,
  Users2,
  Building2,
  MapPin,
  Banknote,
  Timer,
  CalendarCheck
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useEmployeeService } from "@/services/employee-service";
import { useDepartmentService } from "@/services/department-service";
import { useBranchService } from "@/services/branch-service";
import { useShiftService } from "@/services/shift-service";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { QuickAddBranchDialog, QuickAddDepartmentDialog, QuickAddShiftDialog } from "@/components/shared/quick-add-dialogs";
import { cn, formatTime12h } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { DAYS, WEEKS, DAY_LABELS } from "@/lib/constants";
import { usePermission } from "@/hooks/use-permission";

type AddEmployeeSearch = {
  employeeId?: string;
};

export const Route = createFileRoute("/_app/employees/create")({
  validateSearch: (search: Record<string, unknown>): AddEmployeeSearch => {
    return {
      employeeId: search.employeeId as string | undefined,
    };
  },
  component: AddEmployeePage,
});

const DAYS_OF_WEEK = [
  { label: "Mon", key: "mon" },
  { label: "Tue", key: "tue" },
  { label: "Wed", key: "wed" },
  { label: "Thu", key: "thu" },
  { label: "Fri", key: "fri" },
  { label: "Sat", key: "sat" },
  { label: "Sun", key: "sun" },
];

function SectionTitle({ title, icon: Icon, className }: { title: string; icon: any; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 mb-6", className)}>
      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-[14px] font-bold text-foreground tracking-tight">{title}</h3>
    </div>
  );
}

const formatKey = (key: string) => {
  const customMap: Record<string, string> = { basic: "BASIC", da: "DA", hra: "HRA", ca: "Conveyance Allowance", bonus: "Bonus", tds: "TDS", pf: "PF", esic: "ESIC", epf: "EPF", pt: "Professional Tax", retention: "Retention", adminCharge: "Admin Charge", tdsOnProfession: "TDS on Profession" };
  return customMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const DRAFT_KEY = "bot:employee-create-draft";

function AddEmployeePage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { employeeId } = Route.useSearch();
  const navigate = useNavigate();
  const { createEmployee, updateEmployee, employees } = useEmployeeService();
  const { departments } = useDepartmentService();
  const { branches } = useBranchService();
  const { shifts } = useShiftService();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState<"branch" | "department" | "shift" | null>(null);
  const isEditing = !!employeeId;
  const { can } = usePermission();
  const isAllowed = isEditing ? can("employees", "edit") : can("employees", "create");

  useEffect(() => {
    if (!isAllowed) {
      toast.error(isEditing ? "You don't have permission to edit employees" : "You don't have permission to create employees");
      navigate({ to: "/employees" });
    }
  }, [isAllowed, isEditing, navigate]);

  const [form, setForm] = useState(() => {
    const defaults = {
    fullName: "",
    phone: "",
    email: "",
    gender: "male",
    dob: "",
    salary: "",
    joiningDate: new Date().toISOString().slice(0, 10),
    departmentId: "",
    branchId: "",
    branchIds: [] as string[],
    employmentType: "monthly",
    shiftIds: [] as string[],
    weeklyHolidays: [] as { day: string; weeks: number[] }[],
    address: "",
    bloodGroup: "",
    contactPersonName: "",
    contactPersonMobile: "",
    aadhaarNo: "",
    panNo: "",
    experience: "",
    residentialAddress: "",
    residentialPhone: "",
    education: "",
    bankDetails: {
      accountNumber: "",
      bankName: "",
      ifsc: "",
      branchName: "",
      nameAsPerBank: "",
    },
    attendanceExceptions: {
      overrideGlobal: false,
      requireLocation: false,
      remotePunch: true,
    },
    leadDeletionPermission: false,
    salaryComponents: {
      tds: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      tdsCategory: "",
      basic: { enabled: true, percentage: 50, amount: 0, type: 'percentage', includeInTotal: true },
      da: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      hra: { enabled: true, percentage: 40, amount: 0, type: 'percentage', includeInTotal: true },
      ca: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      pf: { enabled: false, percentage: 12, amount: 0, type: 'percentage', includeInTotal: true },
      esic: { enabled: false, percentage: 0.75, amount: 0, type: 'percentage', includeInTotal: true },
      epf: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      tdsOnProfession: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      retention: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      pt: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      adminCharge: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
      bonus: { enabled: false, percentage: 0, amount: 0, type: 'percentage', includeInTotal: true },
    }
    };
    // Restore an in-progress draft after a page refresh (create mode only).
    if (!employeeId) {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) return { ...defaults, ...(JSON.parse(saved) as Partial<typeof defaults>) };
      } catch { /* ignore corrupt draft */ }
    }
    return defaults;
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const allowMultipleBranches = !!globalSettings?.branchSettings?.allowMultipleBranches;

  const errors = useMemo(() => {
    const err: Record<string, string> = {};
    if (!form.fullName.trim()) err.fullName = "Full name is required";
    if (!form.phone.trim()) err.phone = "Phone number is required";
    else if (form.phone.replace(/\D/g, '').length !== 10) err.phone = "Phone number must be exactly 10 digits";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) err.email = "Invalid email format";
    if (!form.salary || Number(form.salary) < 0) err.salary = "Valid salary is required";
    if (!form.joiningDate) err.joiningDate = "Joining date is required";
    if (allowMultipleBranches) {
      if (form.branchIds.length === 0) err.branchId = "Select at least one branch";
    } else if (!form.branchId) {
      err.branchId = "Branch selection is required";
    }
    if (!form.departmentId) err.departmentId = "Department selection is required";
    if (form.shiftIds.length === 0) err.shiftId = "Select at least one shift";
    return err;
  }, [form, allowMultipleBranches]);

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  useEffect(() => {
    setHasMounted(true);
    const fetchSettings = async () => {
      try {
        const { data } = await apiClient.get('/settings');
        setGlobalSettings(data);
        if (!isEditing) {
          // Only fill empty fields so a restored draft isn't overwritten.
          setForm(prev => {
            const updates: Partial<typeof prev> = {};
            if (prev.shiftIds.length === 0 && data?.attendance?.defaultShiftId) {
              updates.shiftIds = [data.attendance.defaultShiftId];
            }
            if (prev.weeklyHolidays.length === 0 && data?.attendance?.workDays?.length) {
              // Days NOT in workDays are holidays — pre-populate weeklyHolidays
              const holidayDays = Object.entries(DAY_LABELS)
                .filter(([key]) => !data.attendance.workDays.includes(key))
                .map(([, fullName]) => fullName);
              if (holidayDays.length > 0) {
                updates.weeklyHolidays = holidayDays.map(day => ({ day, weeks: [] }));
              }
            }
            return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
          });
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, [isEditing]);

  // Auto-select dropdown defaults (Branch / Department / Shift) to the first
  // available option, so the form isn't left with empty required selects.
  useEffect(() => {
    if (isEditing) return;
    setForm(prev => {
      const updates: Partial<typeof prev> = {};
      if (!prev.departmentId && departments?.length) updates.departmentId = departments[0]._id;
      if (prev.shiftIds.length === 0 && shifts?.length) updates.shiftIds = [shifts[0]._id];
      if (allowMultipleBranches) {
        if ((prev.branchIds?.length || 0) === 0 && branches?.length) updates.branchIds = [branches[0]._id];
      } else if (!prev.branchId && branches?.length) {
        updates.branchId = branches[0]._id;
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [departments, branches, shifts, isEditing, allowMultipleBranches]);

  // Persist the in-progress form so a page refresh doesn't wipe it (create mode only).
  useEffect(() => {
    if (isEditing || !hasMounted) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch { /* storage full / unavailable — ignore */ }
  }, [form, isEditing, hasMounted]);

  const formatDateForInput = (dateVal?: string | Date) => {
    if (!dateVal) return "";
    try {
      const date = new Date(dateVal);
      if (isNaN(date.getTime())) return "";
      return date.toISOString().split('T')[0];
    } catch (e) {
      return "";
    }
  };

  useEffect(() => {
    if (employeeId && employees.length > 0) {
      const emp = employees.find(e => e._id === employeeId);
      if (emp) {
        setForm({
          fullName: emp.name,
          phone: emp.phone,
          email: emp.email || "",
          gender: (emp as any).gender || "male",
          dob: formatDateForInput((emp as any).dob),
          salary: emp.salary?.toString() || "0",
          joiningDate: formatDateForInput((emp as any).joiningDate || emp.createdAt),
          departmentId: (emp.departmentId as any)?._id || emp.departmentId || "",
          branchId: (emp.branchId as any)?._id || emp.branchId || "",
          branchIds: (() => {
            const ids = ((emp as any).branchIds || []).map((b: any) => b?._id || b).filter(Boolean);
            if (ids.length) return ids;
            const primary = (emp.branchId as any)?._id || emp.branchId;
            return primary ? [primary] : [];
          })(),
          employmentType: (emp as any).employmentType || "monthly",
          shiftIds: (() => {
            const ids = ((emp as any).shiftIds || []).map((s: any) => s?._id || s).filter(Boolean);
            if (ids.length) return ids;
            const primary = (emp.shiftId as any)?._id || emp.shiftId;
            return primary ? [primary] : [];
          })(),
          weeklyHolidays: emp.weeklyHolidays || [],
          address: (emp as any).address || "",
          bloodGroup: (emp as any).bloodGroup || "",
          contactPersonName: (emp as any).contactPersonName || "",
          contactPersonMobile: (emp as any).contactPersonMobile || "",
          aadhaarNo: (emp as any).aadhaarNo || "",
          panNo: (emp as any).panNo || "",
          experience: (emp as any).experience || "",
          residentialAddress: (emp as any).residentialAddress || "",
          residentialPhone: (emp as any).residentialPhone || "",
          education: (emp as any).education || "",
          bankDetails: (emp as any).bankDetails || {
            accountNumber: "",
            bankName: "",
            ifsc: "",
            branchName: "",
            nameAsPerBank: "",
          },
          leadDeletionPermission: (emp as any).leadDeletionPermission || false,
          attendanceExceptions: (emp as any).attendanceExceptions || {
            overrideGlobal: false,
            requireLocation: false,
            remotePunch: true,
          },
          salaryComponents: {
            ...form.salaryComponents,
            ...emp.salaryComponents
          }
        });
      }
    }
  }, [employeeId, employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setTouched({
      fullName: true, phone: true, email: true, salary: true, 
      joiningDate: true, branchId: true, departmentId: true, shiftId: true
    });

    if (Object.keys(errors).length > 0) {
      toast.error("Please fill all required fields correctly");
      return;
    }

    setIsSubmitting(true);
    try {
      const branchIds = allowMultipleBranches
        ? form.branchIds
        : (form.branchId ? [form.branchId] : []);

      const payload = {
        ...form,
        name: form.fullName,
        salary: Number(form.salary) || 0,
        branchIds,
        branchId: branchIds[0] || "",
        shiftIds: form.shiftIds,
        shiftId: form.shiftIds[0] || "",
      };

      if (isEditing && employeeId) {
        await updateEmployee({ id: employeeId, data: payload as any });
      } else {
        await createEmployee({ ...payload, role: 'employee' } as any);
      }
      // Submission succeeded — clear the saved draft.
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      navigate({ to: "/employees" });
    } catch (error: any) {
      // The actual validation reason (shown to the user via the toast in
      // useEmployeeService) lives in the response body, not the AxiosError
      // wrapper — log that directly so it's visible without expanding the object.
      console.error("Employee save failed:", error?.response?.data ?? error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleHoliday = (day: string) => {
    setForm(prev => {
      const exists = prev.weeklyHolidays.find(h => h.day === day);
      if (exists) {
        return { ...prev, weeklyHolidays: prev.weeklyHolidays.filter(h => h.day !== day) };
      }
      return { ...prev, weeklyHolidays: [...prev.weeklyHolidays, { day, weeks: [] }] };
    });
  };

  const toggleWeek = (day: string, week: number) => {
    setForm(prev => ({
      ...prev,
      weeklyHolidays: prev.weeklyHolidays.map(h => {
        if (h.day !== day) return h;
        const weeks = h.weeks.includes(week)
          ? h.weeks.filter(w => w !== week)
          : [...h.weeks, week].sort();
        return { ...h, weeks };
      })
    }));
  };

  const updateSalaryComp = (key: string, field: 'enabled' | 'percentage' | 'amount' | 'type' | 'includeInTotal', value: any) => {
    setForm(prev => {
      let processedValue = value;
      
      if (field === 'percentage' || field === 'amount') {
        if (typeof value === 'number') {
          if (value < 0) processedValue = 0;
          if (field === 'percentage' && processedValue > 100) processedValue = 100;
          if (field === 'amount') {
            const maxAmount = parseFloat(prev.salary as any) || 0;
            if (maxAmount > 0 && processedValue > maxAmount) {
              processedValue = maxAmount;
            } else if (maxAmount === 0) {
              // Allow them to type an amount even if base salary isn't set yet.
            }
          }
        }
      }

      return {
        ...prev,
        salaryComponents: {
          ...prev.salaryComponents,
          [key]: {
            ...(prev.salaryComponents as any)[key],
            [field]: processedValue
          }
        }
      };
    });
  };

  if (!hasMounted) return null;

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md pt-2 pb-4 border-b border-border/50 -mx-5 sm:-mx-6 px-5 sm:px-6 flex items-center gap-3 mb-2">
        <ActionButton
          variant="ghost"
          icon={ChevronLeft}
          onClick={() => navigate({ to: "/employees" })}
          className="h-9 w-9 rounded-xl border border-border/60 hover:bg-muted hover:text-primary transition-all shadow-sm"
        />
        <PageHeader
          title={isEditing ? "Edit Profile" : "Add Employee"}
          description={isEditing ? `Managing details for ${form.fullName}` : "Register a new member to the organization"}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
          <div className="lg:col-span-8 space-y-6">

            <Card id="general" className="p-8 border border-border/60 bg-white rounded-xl shadow-sm scroll-mt-28">
            <SectionTitle title="General Details" icon={User} className="mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">

              <FormInput
                label="Full Name"
                icon={User}
                placeholder="John Doe"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                onBlur={() => handleBlur('fullName')}
                error={touched.fullName ? errors.fullName : undefined}
                required
              />

              <FormInput
                label="Phone Number"
                type="tel"
                icon={Phone}
                placeholder="9876543210"
                value={form.phone}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setForm({ ...form, phone: val });
                }}
                onBlur={() => handleBlur('phone')}
                error={touched.phone ? errors.phone : undefined}
                required
              />

              <FormInput
                label="Email Address"
                type="email"
                icon={Mail}
                placeholder="john@example.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                onBlur={() => handleBlur('email')}
                error={touched.email ? errors.email : undefined}
              />{/* Gender */}
              <div className="space-y-2">
                <Label className="text-[12px] font-bold text-muted-foreground tracking-wider">Gender Selection</Label>
                <div className="flex bg-white border border-primary p-0 rounded-full h-12 overflow-hidden shadow-sm mt-2">
                  {[
                    { id: 'male', label: 'Male' },
                    { id: 'female', label: 'Female' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setForm({ ...form, gender: g.id })}
                      className={cn(
                        "flex-1 h-full font-bold text-[14px] transition-all duration-300",
                        form.gender === g.id
                          ? "bg-primary text-white"
                          : "bg-white text-foreground hover:bg-muted/10"
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <FormInput
                label="Date of Birth"
                type="date"
                icon={Calendar}
                value={form.dob}
                onChange={e => setForm({ ...form, dob: e.target.value })}
              />

            </div>
          </Card>

          <Card id="employment" className="p-6 border border-border/60 bg-white rounded-xl shadow-sm scroll-mt-28">
            <SectionTitle title="Employment Terms" icon={Briefcase} className="mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7">

              {/* Employment Type */}
              <div className="col-span-1 md:col-span-2 space-y-2 pb-6 border-b border-border/40 mb-2">
                <Label className="text-[12px] font-bold text-muted-foreground tracking-wider">Employment & Pay Type</Label>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  {[
                    { id: 'monthly', label: 'Monthly', icon: CalendarCheck, desc: 'Fixed monthly' },
                    { id: 'daily', label: 'Daily', icon: Banknote, desc: 'Daily wage' },
                    { id: 'hourly', label: 'Hourly', icon: Timer, desc: 'Pay per hour' },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setForm({ ...form, employmentType: type.id })}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border transition-all duration-300 shadow-sm",
                        form.employmentType === type.id
                          ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                          : "bg-white border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/5"
                      )}
                    >
                      <type.icon className={cn("h-6 w-6", form.employmentType === type.id ? "text-primary" : "text-muted-foreground")} />
                      <div className="text-center">
                        <div className={cn("text-[13px] font-bold", form.employmentType === type.id ? "text-primary" : "text-foreground")}>{type.label}</div>
                        <div className="text-[10px] opacity-60 font-medium">{type.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <FormInput
                label="Salary Amount (₹)"
                icon={IndianRupee}
                placeholder="Enter amount"
                value={form.salary}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setForm({ ...form, salary: val });
                }}
                onBlur={() => handleBlur('salary')}
                error={touched.salary ? errors.salary : undefined}
                required
              />

              <FormInput
                label="Joining Date"
                type="date"
                icon={Calendar}
                value={form.joiningDate}
                onChange={e => setForm({ ...form, joiningDate: e.target.value })}
                onBlur={() => handleBlur('joiningDate')}
                error={touched.joiningDate ? errors.joiningDate : undefined}
                required
              />

              {allowMultipleBranches ? (
                <div className="space-y-4 md:col-span-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[11px] font-bold text-muted-foreground tracking-widest">
                      BRANCH LOCATIONS<span className="text-destructive ml-0.5">*</span>
                      <span className="ml-2 font-semibold normal-case tracking-normal text-[10px] text-primary">Select one or more</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setQuickAddOpen("branch")}
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/70 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Add New
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-background p-3 shadow-sm min-h-12">
                    {(branches || []).length === 0 && (
                      <span className="text-[12px] text-muted-foreground">No branches available</span>
                    )}
                    {(branches || []).map((b: any) => {
                      const selected = form.branchIds.includes(b._id);
                      return (
                        <button
                          type="button"
                          key={b._id}
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              branchIds: selected
                                ? prev.branchIds.filter(id => id !== b._id)
                                : [...prev.branchIds, b._id],
                            }));
                            handleBlur('branchId');
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
                            selected
                              ? "border-primary bg-primary text-white shadow-sm"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                          {b.branchName}
                        </button>
                      );
                    })}
                  </div>
                  {form.branchIds.length > 0 && (
                    <p className="text-[11px] text-muted-foreground ml-1">The first selected branch is treated as the primary branch.</p>
                  )}
                  {touched.branchId && errors.branchId && (
                    <p className="text-[11px] text-destructive font-medium ml-1">{errors.branchId}</p>
                  )}
                </div>
              ) : (
                <FormSelect
                  label="Branch Location"
                  icon={MapPin}
                  placeholder="Select Branch"
                  value={form.branchId}
                  onValueChange={(v) => { setForm({ ...form, branchId: v }); handleBlur('branchId'); }}
                  options={(branches || []).map((b: any) => ({ label: b.branchName, value: b._id }))}
                  error={touched.branchId ? errors.branchId : undefined}
                  required
                  onAddNew={() => setQuickAddOpen("branch")}
                />
              )}

              <FormSelect
                label="Department"
                icon={Building2}
                placeholder="Select Department"
                value={form.departmentId}
                onValueChange={(v) => { setForm({ ...form, departmentId: v }); handleBlur('departmentId'); }}
                options={(departments || []).map((d: any) => ({ label: d.name, value: d._id }))}
                error={touched.departmentId ? errors.departmentId : undefined}
                required
                onAddNew={() => setQuickAddOpen("department")}
              />

              <div className="space-y-4 md:col-span-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[11px] font-bold text-muted-foreground tracking-widest">
                    SHIFTS<span className="text-destructive ml-0.5">*</span>
                    <span className="ml-2 font-semibold normal-case tracking-normal text-[10px] text-primary">Select one or more</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAddOpen("shift")}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/70 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add New
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-background p-3 shadow-sm min-h-12">
                  {(shifts || []).length === 0 && (
                    <span className="text-[12px] text-muted-foreground">No shifts available</span>
                  )}
                  {(shifts || []).map((s: any) => {
                    const selected = form.shiftIds.includes(s._id);
                    return (
                      <button
                        type="button"
                        key={s._id}
                        onClick={() => {
                          setForm(prev => ({
                            ...prev,
                            shiftIds: selected
                              ? prev.shiftIds.filter(id => id !== s._id)
                              : [...prev.shiftIds, s._id],
                          }));
                          handleBlur('shiftId');
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
                          selected
                            ? "border-primary bg-primary text-white shadow-sm"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        {s.name}
                        {globalSettings?.attendance?.defaultShiftId === s._id && " (Global Default)"}
                      </button>
                    );
                  })}
                </div>
                {form.shiftIds.length > 0 && (
                  <p className="text-[11px] text-muted-foreground ml-1">The first selected shift is used as the primary shift for attendance timing.</p>
                )}
                {touched.shiftId && errors.shiftId && (
                  <p className="text-[11px] text-destructive font-medium ml-1">{errors.shiftId}</p>
                )}
              </div>

              {/* Weekly Holidays */}
              <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px] font-bold text-foreground">Weekly Holiday Settings</Label>
                  <span className="text-[11px] text-muted-foreground italic">* Leave weeks empty for all weeks</span>
                </div>
                {globalSettings?.attendance?.workDays && (
                  <div className="text-[11px] font-medium text-primary bg-primary/5 p-2 rounded-lg mb-2">
                    Global Active Work Days: {globalSettings.attendance.workDays.map((d: string) => {
                      return DAY_LABELS[d] || d;
                    }).join(", ")}
                    <span className="text-muted-foreground ml-2">(Overrides apply below)</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {DAYS.map((day) => {
                    const holiday = form.weeklyHolidays.find(h => h.day === day);
                    return (
                      <div key={day} className="flex flex-col gap-2 p-3 rounded-xl border border-border/50 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={!!holiday}
                              onCheckedChange={() => toggleHoliday(day)}
                              className="scale-90"
                            />
                            <span className={cn("text-[13px] font-semibold", !!holiday ? "text-primary" : "text-muted-foreground")}>{day}</span>
                          </div>
                          {holiday && (
                            <div className="flex items-center gap-1.5 bg-white/60 p-1 rounded-lg border border-border/40">
                              <span className="text-[10px] font-bold text-muted-foreground px-2">WEEKS:</span>
                              {WEEKS.map(w => (
                                <button
                                  key={w}
                                  type="button"
                                  onClick={() => toggleWeek(day, w)}
                                  className={cn(
                                    "h-6 w-6 rounded-md text-[10px] font-bold transition-all",
                                    holiday.weeks?.includes(w) ? "bg-primary text-white" : "hover:bg-primary/10 text-muted-foreground"
                                  )}
                                >
                                  {w}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({
                                  ...prev,
                                  weeklyHolidays: prev.weeklyHolidays.map(h => h.day === day ? { ...h, weeks: [] } : h)
                                }))}
                                className={cn(
                                  "px-2 h-6 rounded-md text-[10px] font-bold transition-all",
                                  (!holiday.weeks || holiday.weeks.length === 0) ? "bg-primary/20 text-primary" : "text-muted-foreground"
                                )}
                              >
                                ALL
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attendance Exceptions */}
              <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px] font-bold text-foreground">Attendance Exceptions</Label>
                  <Switch
                    checked={form.attendanceExceptions.overrideGlobal}
                    onCheckedChange={(v) => setForm(prev => ({ 
                      ...prev, 
                      attendanceExceptions: { ...prev.attendanceExceptions, overrideGlobal: v } 
                    }))}
                  />
                </div>
                {form.attendanceExceptions.overrideGlobal && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-border/50 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-[12px] font-bold">Require Location</Label>
                        <p className="text-[10px] text-muted-foreground">Mandate GPS for punches.</p>
                      </div>
                      <Switch
                        checked={form.attendanceExceptions.requireLocation}
                        onCheckedChange={(v) => setForm(prev => ({ 
                          ...prev, 
                          attendanceExceptions: { ...prev.attendanceExceptions, requireLocation: v } 
                        }))}
                        className="scale-90"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-[12px] font-bold">Remote Punch</Label>
                        <p className="text-[10px] text-muted-foreground">Allow clock-in from any location.</p>
                      </div>
                      <Switch
                        checked={form.attendanceExceptions.remotePunch}
                        onCheckedChange={(v) => setForm(prev => ({ 
                          ...prev, 
                          attendanceExceptions: { ...prev.attendanceExceptions, remotePunch: v } 
                        }))}
                        className="scale-90"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card id="personal" className="p-8 border border-border/60 bg-white rounded-xl shadow-sm scroll-mt-28">
            <SectionTitle title="Personal Details" icon={User} className="mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
              <FormInput
                label="Blood Group"
                placeholder="e.g. A+"
                value={form.bloodGroup}
                onChange={e => setForm({ ...form, bloodGroup: e.target.value })}
              />
              <FormInput
                label="Education"
                placeholder="Highest qualification"
                value={form.education}
                onChange={e => setForm({ ...form, education: e.target.value })}
              />
              <FormInput
                label="Aadhaar Number"
                placeholder="0000 0000 0000"
                value={form.aadhaarNo}
                onChange={e => setForm({ ...form, aadhaarNo: e.target.value })}
              />
              <FormInput
                label="PAN Number"
                placeholder="ABCDE1234F"
                value={form.panNo}
                onChange={e => setForm({ ...form, panNo: e.target.value })}
              />
              <FormInput
                label="Total Experience"
                placeholder="e.g. 2 years"
                value={form.experience}
                onChange={e => setForm({ ...form, experience: e.target.value })}
              />
            </div>
          </Card>

          <Card id="contact" className="p-8 border border-border/60 bg-white rounded-xl shadow-sm scroll-mt-28">
            <SectionTitle title="Contact Information" icon={MapPin} className="mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
              <div className="col-span-1 md:col-span-2">
                <FormInput
                  label="Current Address"
                  placeholder="Enter full address"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <FormInput
                  label="Residential Address"
                  placeholder="Enter permanent address"
                  value={form.residentialAddress}
                  onChange={e => setForm({ ...form, residentialAddress: e.target.value })}
                />
              </div>
              <FormInput
                label="Residential Phone"
                placeholder="Landline or mobile"
                value={form.residentialPhone}
                onChange={e => setForm({ ...form, residentialPhone: e.target.value })}
              />
              <div className="col-span-1 md:col-span-2 pt-4 border-t border-border/40">
                <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Emergency Contact</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormInput
                    label="Contact Person Name"
                    placeholder="Name"
                    value={form.contactPersonName}
                    onChange={e => setForm({ ...form, contactPersonName: e.target.value })}
                  />
                  <FormInput
                    label="Contact Person Mobile"
                    placeholder="Mobile number"
                    value={form.contactPersonMobile}
                    onChange={e => setForm({ ...form, contactPersonMobile: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card id="bank" className="p-8 border border-border/60 bg-white rounded-xl shadow-sm scroll-mt-28">
            <SectionTitle title="Bank Information" icon={Banknote} className="mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
              <FormInput
                label="Account Number"
                placeholder="Enter account number"
                value={form.bankDetails.accountNumber}
                onChange={e => setForm({ ...form, bankDetails: { ...form.bankDetails, accountNumber: e.target.value } })}
              />
              <FormInput
                label="Bank Name"
                placeholder="e.g. HDFC Bank"
                value={form.bankDetails.bankName}
                onChange={e => setForm({ ...form, bankDetails: { ...form.bankDetails, bankName: e.target.value } })}
              />
              <FormInput
                label="IFSC Code"
                placeholder="HDFC0000001"
                value={form.bankDetails.ifsc}
                onChange={e => setForm({ ...form, bankDetails: { ...form.bankDetails, ifsc: e.target.value } })}
              />
              <FormInput
                label="Bank Branch"
                placeholder="Branch name"
                value={form.bankDetails.branchName}
                onChange={e => setForm({ ...form, bankDetails: { ...form.bankDetails, branchName: e.target.value } })}
              />
              <div className="col-span-1 md:col-span-2">
                <FormInput
                  label="Name as per Bank"
                  placeholder="Full name as in passbook"
                  value={form.bankDetails.nameAsPerBank}
                  onChange={e => setForm({ ...form, bankDetails: { ...form.bankDetails, nameAsPerBank: e.target.value } })}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="text-[14px] font-bold tracking-tight">Permissions</h3>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40">
              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold">Lead Deletion</p>
                <p className="text-[11px] text-muted-foreground">Allow record removal</p>
              </div>
              <Switch
                checked={form.leadDeletionPermission}
                onCheckedChange={checked => setForm({ ...form, leadDeletionPermission: checked })}
              />
            </div>
          </Card>

          <Card className="p-5 border border-border/60 bg-white rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-bold tracking-tight">Salary Configuration</h3>
              </div>
            </div>

            {globalSettings?.salaryTemplates && globalSettings.salaryTemplates.length > 0 && (
              <div className="mb-4 pt-1">
                <FormSelect
                  label="Apply Template"
                  value=""
                  placeholder="-- Select a Template --"
                  onValueChange={(val) => {
                    if (!val) return;
                    const template = globalSettings.salaryTemplates.find((t: any) => t.name === val);
                    if (template) {
                      setForm(prev => ({ 
                        ...prev, 
                        salaryComponents: { ...prev.salaryComponents, ...template.components } 
                      }));
                      toast.success(`Applied ${template.name} template`);
                    }
                  }}
                  options={globalSettings.salaryTemplates.map((t: any) => ({ value: t.name, label: t.name }))}
                />
              </div>
            )}

            <div className="space-y-4">
              {/* TDS */}
              <div className="space-y-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.salaryComponents.tds.enabled}
                      onCheckedChange={(v) => updateSalaryComp('tds', 'enabled', v)}
                      className="scale-75"
                    />
                    <span className="text-[12px] font-bold">TDS Settings</span>
                  </div>
                  {form.salaryComponents.tds.enabled && (
                    <div className="flex items-center gap-1">
                      <select
                        className="h-7 text-[11px] rounded-md border border-primary/20 bg-transparent px-1 focus:outline-hidden"
                        value={form.salaryComponents.tds.type || 'percentage'}
                        onChange={(e) => updateSalaryComp('tds', 'type', e.target.value)}
                      >
                        <option value="percentage">%</option>
                        <option value="amount">₹</option>
                      </select>
                      <Input
                        type="number"
                        min="0"
                        max={form.salaryComponents.tds.type === 'percentage' ? "100" : (form.salary || undefined)}
                        className="h-7 w-20 text-[11px] font-normal px-2 rounded-md border-primary/20"
                        value={form.salaryComponents.tds.type === 'amount' ? (form.salaryComponents.tds.amount || 0) : (form.salaryComponents.tds.percentage || 0)}
                        onChange={(e) => updateSalaryComp('tds', form.salaryComponents.tds.type === 'amount' ? 'amount' : 'percentage', parseFloat(e.target.value) || 0)}
                      />
                      <div className="flex items-center gap-1 ml-1 border-l border-primary/20 pl-2">
                        <input
                          type="checkbox"
                          checked={form.salaryComponents.tds.includeInTotal !== false}
                          onChange={(e) => updateSalaryComp('tds', 'includeInTotal', e.target.checked)}
                          className="scale-75 cursor-pointer"
                          id="tds-incl"
                        />
                        <label htmlFor="tds-incl" className="text-[9px] font-bold text-primary cursor-pointer whitespace-nowrap">Incl.</label>
                      </div>
                    </div>
                  )}
                </div>
                {form.salaryComponents.tds.enabled && (
                  <Input
                    placeholder="Category (e.g. 92B)"
                    className="h-8 text-[11px] font-normal rounded-lg bg-white mt-2"
                    value={form.salaryComponents.tdsCategory}
                    onChange={(e) => setForm({ ...form, salaryComponents: { ...form.salaryComponents, tdsCategory: e.target.value } })}
                  />
                )}
              </div>

              {/* Salary components grid */}
              <div className="grid grid-cols-1 gap-2.5">
                {Object.entries(form.salaryComponents)
                  .filter(([key]) => key !== 'tds' && key !== 'tdsCategory')
                  .map(([key, value]: [string, any]) => (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-xl border transition-all",
                        value?.enabled ? "bg-white border-primary/30 shadow-sm" : "bg-muted/10 border-transparent opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Switch
                          checked={value.enabled}
                          onCheckedChange={(v) => updateSalaryComp(key, 'enabled', v)}
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
                            onChange={(e) => updateSalaryComp(key, 'type', e.target.value)}
                          >
                            <option value="percentage">%</option>
                            <option value="amount">₹</option>
                          </select>
                          <Input
                            type="number"
                            min="0"
                            max={value?.type === 'percentage' ? "100" : (form.salary || undefined)}
                            className="h-7 w-20 text-[11px] font-normal px-2 rounded-md border-border/60"
                            value={value?.type === 'amount' ? (value?.amount || 0) : (value?.percentage || 0)}
                            onChange={(e) => updateSalaryComp(key, value?.type === 'amount' ? 'amount' : 'percentage', parseFloat(e.target.value) || 0)}
                          />
                          <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-2">
                            <input
                              type="checkbox"
                              checked={value?.includeInTotal !== false}
                              onChange={(e) => updateSalaryComp(key, 'includeInTotal', e.target.checked)}
                              className="scale-75 cursor-pointer"
                              id={`incl-${key}`}
                            />
                            <label htmlFor={`incl-${key}`} className="text-[9px] font-bold text-muted-foreground cursor-pointer whitespace-nowrap">Incl.</label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-2.5 pt-2">
            <ActionButton
              type="submit"
              variant="add"
              showLabel
              label={isEditing ? "Update Employee" : "Onboard Employee"}
              icon={isEditing ? Check : Plus}
              loading={isSubmitting}
              className="h-11 w-full rounded-xl shadow-md text-[14px]"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate({ to: "/employees" })}
              className="h-10 w-full rounded-xl text-muted-foreground font-semibold text-[13px] hover:bg-muted"
            >
              Discard Changes
            </Button>
          </div>
          </div>
        </div>
      </form>

      <QuickAddBranchDialog
        open={quickAddOpen === "branch"}
        onOpenChange={(o) => setQuickAddOpen(o ? "branch" : null)}
        onCreated={(id) => {
          if (allowMultipleBranches) {
            setForm(prev => prev.branchIds.includes(id) ? prev : { ...prev, branchIds: [...prev.branchIds, id] });
          } else {
            setForm(prev => ({ ...prev, branchId: id }));
          }
        }}
      />
      <QuickAddDepartmentDialog
        open={quickAddOpen === "department"}
        onOpenChange={(o) => setQuickAddOpen(o ? "department" : null)}
        onCreated={(id) => setForm(prev => ({ ...prev, departmentId: id }))}
      />
      <QuickAddShiftDialog
        open={quickAddOpen === "shift"}
        onOpenChange={(o) => setQuickAddOpen(o ? "shift" : null)}
        onCreated={(id) => setForm(prev => prev.shiftIds.includes(id) ? prev : { ...prev, shiftIds: [...prev.shiftIds, id] })}
      />
    </div>
  );
}