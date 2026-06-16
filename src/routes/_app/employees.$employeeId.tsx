import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  CreditCard,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download,
  CalendarCheck,
  CalendarX,
  Zap,
  IndianRupee,
  Activity,
  Heart,
  Utensils,
  MapPinOff,
  UserCheck,
  UserMinus,
  Maximize2,
  Cake,
  Trophy,
  GraduationCap,
  ShieldCheck,
  FileText,
  Play,
  Square,
  ArrowLeft
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAttendanceService, type AttendanceRecord } from "@/services/attendance-service";
import { cn } from "@/lib/utils";
import { useEmployeeService } from "@/services/employee-service";
import { useDepartmentService } from "@/services/department-service";
import { useBranchService } from "@/services/branch-service";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";

export const Route = createFileRoute("/_app/employees/$employeeId")({
  component: EmployeeDetailsPage,
});

function EmployeeDetailsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const { employeeId } = useParams({ from: "/_app/employees/$employeeId" });
  const { employees, isLoading: empLoading } = useEmployeeService();
  const { departments, isLoading: deptLoading } = useDepartmentService();
  const { branches, isLoading: branchLoading } = useBranchService();

  const { records: allAttendance, isLoading: attLoading } = useAttendanceService(
    undefined, 
    undefined, 
    employeeId
  );
  const { lunchIn, lunchOut } = useAttendanceService();

  const isLoading = empLoading || deptLoading || branchLoading;

  const employee = useMemo(() => employees.find(e => e._id === employeeId), [employees, employeeId]);
  
  const getDeptName = (id?: string | any) => {
    if (!id) return "N/A";
    const deptId = typeof id === 'object' ? id._id : id;
    const dept = departments.find((d: any) => d._id === deptId);
    return dept ? dept.name : "N/A";
  };

  const getBranchNames = () => {
    const e = employee as any;
    const raw = (e?.branchIds?.length ? e.branchIds : (e?.branchId ? [e.branchId] : [])) as any[];
    const names = raw
      .map((b) => {
        const id = typeof b === 'object' ? b?._id : b;
        return (typeof b === 'object' && b?.branchName)
          ? b.branchName
          : branches.find((x: any) => x._id === id)?.branchName;
      })
      .filter(Boolean);
    return names.length ? names.join(", ") : "N/A";
  };

  const [activeTab, setActiveTab] = useState<"profile" | "attendance">("profile");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedLog, setSelectedLog] = useState<AttendanceRecord | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 px-2">
          <SkeletonLoader type="card" count={1} className="h-10 w-10 rounded-xl" />
          <div className="space-y-2 flex-1">
            <SkeletonLoader type="list" count={1} />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <SkeletonLoader type="card" count={2} />
          </div>
          <div className="lg:col-span-8 space-y-6">
            <SkeletonLoader type="card" count={3} />
          </div>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <h2 className="text-2xl font-bold">Employee not found</h2>
        <Link to="/employees">
          <ActionButton
            variant="view"
            showLabel
            label="Back to Employee List"
            icon={ArrowLeft}
          />
        </Link>
      </div>
    );
  }

  const workDuration = (() => {
    const start = employee.joiningDate ? new Date(employee.joiningDate) : (employee.createdAt ? new Date(employee.createdAt) : new Date());
    const end = new Date();
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    
    return parts.length > 0 ? parts.join(" ") : "Joined today";
  })();
  const logs = allAttendance;

  // --- Expected Salary Calculation Logic ---
  const c = (employee?.salaryComponents || {}) as Record<string, any>;
  let remainingBase = employee?.salary || 0;
  let addedOnTop = 0;
  let totalDeductions = 0;
  
  const expectedEarnings: { name: string; amount: number; included: boolean }[] = [];
  const expectedDeductions: { name: string; amount: number; included: boolean }[] = [];

  const addComp = (key: string, label: string, type: 'earning' | 'deduction') => {
    if (c[key] && c[key].enabled) {
      let amt = 0;
      if (c[key].type === 'amount') {
        amt = c[key].amount || 0;
      } else {
        amt = Math.round(((employee?.salary || 0) * (c[key].percentage || 0)) / 100);
      }

      const isInclusive = c[key].includeInTotal !== false;

      if (type === 'earning') {
        expectedEarnings.push({ name: label, amount: amt, included: isInclusive });
        if (isInclusive) {
          remainingBase -= amt;
        } else {
          addedOnTop += amt;
        }
      } else {
        const isDeducted = c[key].includeInTotal !== false;
        expectedDeductions.push({ name: label, amount: amt, included: isDeducted });
        if (isDeducted) {
          totalDeductions += amt;
        }
      }
    }
  };

  addComp('basic', 'Basic Salary', 'earning');
  addComp('da', 'DA', 'earning');
  addComp('hra', 'HRA', 'earning');
  addComp('ca', 'Conveyance Allowance', 'earning');
  addComp('bonus', 'Bonus', 'earning');
  
  addComp('tds', 'TDS', 'deduction');
  addComp('pf', 'PF', 'deduction');
  addComp('esic', 'ESIC', 'deduction');
  addComp('epf', 'EPF', 'deduction');
  addComp('pt', 'Professional Tax', 'deduction');
  addComp('retention', 'Retention', 'deduction');
  addComp('adminCharge', 'Admin Charges', 'deduction');

  if (remainingBase !== 0) {
    expectedEarnings.push({ name: 'Remaining Balance (Special)', amount: remainingBase, included: true });
  }

  const grossSalary = (employee?.salary || 0) + addedOnTop;
  const netSalary = grossSalary - totalDeductions;
  // ----------------------------------------

  return (
    <div className="space-y-6 pb-10">
      {/* Header / Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-4">
          <Link to="/employees">
            <ActionButton
              variant="view"
              icon={ArrowLeft}
              className="h-10 w-10 border-border/60"
              tooltip="Back to Directory"
            />
          </Link>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{employee.name}</h1>
              <Badge className="bg-primary/10 text-primary border-none text-[9px] font-bold uppercase tracking-widest px-2 py-0.5">
                Staff
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <span className="text-primary font-semibold">Employee</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{getDeptName(employee.departmentId)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ActionButton
            variant="download"
            showLabel
            label="Export"
            className="flex-1 sm:flex-none h-10"
          />
          <ActionButton
            variant="edit"
            showLabel
            label="Edit Profile"
            className="flex-1 sm:flex-none h-10 shadow-lg shadow-primary/20"
            asChild
          >
            <Link to={`/employees/create`} search={{ employeeId: employee._id }} />
          </ActionButton>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/40 px-2 overflow-x-auto scrollbar-none">
        {[
          { id: "profile", label: "Profile", icon: User },
          { id: "attendance", label: "Attendance", icon: CalendarCheck },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "relative flex items-center gap-2 px-6 py-4 text-xs font-semibold transition-all duration-300 whitespace-nowrap",
              activeTab === tab.id 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            <tab.icon className={cn("h-3.5 w-3.5 transition-transform duration-300", activeTab === tab.id && "scale-110")} />
            <span className="uppercase tracking-widest">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "profile" ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Sidebar info */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="overflow-hidden border-none shadow-soft rounded-2xl bg-card relative">
                <div className="h-32 relative bg-gradient-primary">
                  <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
                  <div className="absolute top-0 right-0 p-3">
                    <Badge className="bg-white/20 text-white border-none backdrop-blur-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                      {employee.status}
                    </Badge>
                  </div>
                </div>
                <CardContent className="relative pt-0 flex flex-col items-center text-center pb-6 px-4">
                  <div className="-mt-16 mb-4 z-10 relative">
                    <div className="h-32 w-32 rounded-full border-4 border-card bg-card overflow-hidden shadow-lg relative group">
                      <img
                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${employee.name}&backgroundColor=8b0a7a,2e1065,4c1d95&textColor=ffffff`}
                        alt={employee.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <h3 className="text-xl font-bold text-foreground tracking-tight">{employee.name}</h3>
                    <p className="text-xs font-semibold text-primary tracking-wide uppercase">{employee.designation}</p>
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest bg-muted/50 px-2 py-1 rounded mt-2">
                      Tenure: <span className="text-foreground">{workDuration}</span>
                    </p>
                  </div>

                  <div className="w-full grid grid-cols-1 gap-2.5">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 transition-all hover:bg-primary/10">
                      <div className="h-9 w-9 rounded-lg bg-card shadow-sm flex items-center justify-center shrink-0">
                        <Cake className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Birthday</span>
                        <span className="text-xs font-semibold text-foreground/90">{employee.dob ? new Date(employee.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "N/A"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 transition-all hover:bg-amber-500/10">
                      <div className="h-9 w-9 rounded-lg bg-card shadow-sm flex items-center justify-center shrink-0">
                        <Trophy className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Anniversary</span>
                        <span className="text-xs font-semibold text-foreground/90">{employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-2 mt-5">
                    <ActionButton
                      variant="download"
                      showLabel
                      label="PAN"
                      className="h-9 border-primary/20 text-primary hover:bg-primary/5"
                    />
                    <ActionButton
                      variant="download"
                      showLabel
                      label="Aadhaar"
                      className="h-9 border-primary/20 text-primary hover:bg-primary/5"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-soft bg-gradient-primary text-white overflow-hidden relative rounded-2xl group">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <IndianRupee className="h-24 w-24" />
                </div>
                <CardContent className="p-6 relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h4 className="text-[9px] font-bold opacity-70 uppercase tracking-widest mb-1 text-white">Annual CTC</h4>
                      <div className="text-2xl font-bold tracking-tight">₹{(employee.salary * 12).toLocaleString()}</div>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
                      <CreditCard className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                    <span className="text-[9px] font-bold opacity-60 uppercase tracking-wider">Monthly Base</span>
                    <span className="text-xs font-semibold">₹{employee.salary.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8 space-y-6">
              <Card className="border-none shadow-soft rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/5 py-4 px-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      Personal & Bank Information
                    </CardTitle>
                    <Badge variant="outline" className="border-primary/20 text-primary font-bold text-[10px]">ID: {employee._id.slice(-6).toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40">
                    <div className="p-6 space-y-6">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-3 bg-primary rounded-full" />
                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Personal Details</span>
                      </div>
                      <div className="grid grid-cols-1 gap-5">
                        {[
                          { label: "Full Name", value: employee.name, icon: User },
                          { label: "Email Address", value: employee.email, icon: Mail },
                          { label: "Phone Number", value: employee.phone, icon: Phone },
                          { label: "Local Address", value: employee.address, icon: MapPin },
                          { label: "Branch(es)", value: getBranchNames(), icon: MapPin },
                          { label: "Date of Birth", value: employee.dob, icon: Calendar },
                          { label: "Date of Joining", value: employee.joiningDate, icon: Clock },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-3.5 group">
                            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                              <item.icon className="h-3.5 w-3.5 text-muted-foreground/80" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">{item.label}</p>
                              <p className="text-[13px] font-semibold text-foreground/90 truncate">{item.value || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-3 bg-primary rounded-full" />
                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Bank Information</span>
                      </div>
                      <div className="grid grid-cols-1 gap-5">
                        {[
                          { label: "Account Number", value: employee.bankDetails?.accountNumber, icon: Activity },
                          { label: "Bank Name", value: employee.bankDetails?.bankName, icon: Briefcase },
                          { label: "IFSC Code", value: employee.bankDetails?.ifsc, icon: Zap },
                          { label: "Branch Name", value: employee.bankDetails?.branchName, icon: MapPin },
                          { label: "Name as per Bank", value: employee.bankDetails?.nameAsPerBank, icon: UserCheck },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-3.5 group">
                            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                              <item.icon className="h-3.5 w-3.5 text-muted-foreground/80" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">{item.label}</p>
                              <p className="text-[13px] font-semibold text-foreground/90 truncate">{item.value || "N/A"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Other Details Section */}
              <Card className="border-none shadow-soft rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/5 py-4 px-6">
                  <CardTitle className="text-sm font-bold flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Other Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-6">
                    {[
                      { label: "Blood Group", value: employee.bloodGroup, icon: Heart, color: "text-red-500" },
                      { label: "Contact Person", value: employee.contactPersonName, icon: User },
                      { label: "Contact Phone", value: employee.contactPersonMobile, icon: Phone },
                      { label: "Aadhaar Number", value: employee.aadhaarNo, icon: FileText },
                      { label: "PAN Number", value: employee.panNo, icon: CreditCard },
                      { label: "Experience", value: employee.experience, icon: Briefcase },
                      { label: "Residential Addr.", value: employee.residentialAddress, icon: MapPin },
                      { label: "Residential Phone", value: employee.residentialPhone, icon: Phone },
                      { label: "Education", value: employee.education, icon: GraduationCap },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 group">
                        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/5 transition-colors shrink-0">
                          <item.icon className={cn("h-3.5 w-3.5 text-muted-foreground/80", item.color)} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest truncate">{item.label}</p>
                          <p className="text-[12px] font-semibold text-foreground/90 leading-snug wrap-break-word">{item.value || "N/A"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Salary Structure Card */}
              <Card className="border-none shadow-soft rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/5 py-4 px-6 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IndianRupee className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Expected Salary Structure
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40">
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-1 w-3 bg-success rounded-full" />
                        <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">Earnings</span>
                      </div>
                      {expectedEarnings.map((e, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {e.name}
                            {!e.included && <Badge className="ml-2 bg-primary/10 text-primary border-none text-[8px] px-1 py-0">ON TOP</Badge>}
                          </span>
                          <p className="text-[14px] font-bold text-foreground">#{employee?._id?.slice(-6).toUpperCase()}</p>
                        </div>
                      ))}
                      <div className="pt-4 mt-2 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Gross Salary</span>
                        <span className="text-[15px] font-bold text-success">₹{grossSalary.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-1 w-3 bg-destructive rounded-full" />
                        <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">Deductions</span>
                      </div>
                      {expectedDeductions.length > 0 ? expectedDeductions.map((d, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {d.name}
                            {!d.included && <Badge className="ml-2 bg-muted/50 text-muted-foreground border-none text-[8px] px-1 py-0">IGNORED</Badge>}
                          </span>
                          <span className="text-[13px] font-bold text-foreground">₹{d.amount.toLocaleString()}</span>
                        </div>
                      )) : (
                        <div className="text-[12px] text-muted-foreground/50 italic py-2">No deductions configured</div>
                      )}
                      <div className="pt-4 mt-auto border-t border-border/40 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground uppercase tracking-widest">Total Deductions</span>
                        <span className="text-[15px] font-bold text-destructive">₹{totalDeductions.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-primary/5 p-4 border-t border-primary/10 flex items-center justify-between px-6">
                    <span className="text-[12px] font-bold text-primary uppercase tracking-widest">Net Payable Salary</span>
                    <span className="text-xl font-black text-primary tracking-tight">₹{netSalary.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-soft rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/5 py-4 px-6 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Official Documents
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {["Aadhar Card", "PAN Card", "Educational", "Experience"].map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 hover:border-primary/30 hover:bg-primary/2 transition-all cursor-pointer group">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div>
                            <span className="text-[12px] font-semibold text-foreground/80 group-hover:text-primary transition-colors">{doc}</span>
                            <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest">PDF • 2MB</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-success/5 text-success border-none text-[8px] font-bold px-1.5 py-0 rounded-sm">VERIFIED</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="attendance"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Present Days", value: "18", icon: CalendarCheck, color: "text-success bg-success/10" },
                { label: "Absent Days", value: "01", icon: CalendarX, color: "text-red-500 bg-red-50" },
                { label: "Half Days", value: "02", icon: Clock, color: "text-amber-500 bg-amber-50" },
                { label: "WFH Sessions", value: "00", icon: MapPin, color: "text-blue-500 bg-blue-50" },
              ].map((stat, i) => (
                <Card key={i} className="border-none shadow-elegant overflow-hidden group">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">{stat.label}</p>
                      <h4 className="text-2xl font-semibold tracking-tight">{stat.value}</h4>
                    </div>
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", stat.color)}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Everyday Logs */}
              <div className="lg:col-span-2">
                <Card className="border-none shadow-elegant overflow-hidden h-full">
                  <CardHeader className="border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                    <div className="flex flex-col">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" /> Daily Attendance Logs
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Track punch-in, breaks, and punch-out history.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {logs.length > 0 && logs[0].punchIn && !logs[0].punchOut && (
                        <>
                          {!(logs[0].lunchInTime && !logs[0].lunchOutTime) ? (
                            <ActionButton
                              variant="approve"
                              showLabel
                              label="START LUNCH"
                              icon={Play}
                              className="h-7 bg-amber-500 hover:bg-amber-600 border-none text-[10px]"
                              onClick={() => lunchIn({ employeeId: employee._id })}
                            />
                          ) : (
                            <ActionButton
                              variant="destructive"
                              showLabel
                              label="END LUNCH"
                              icon={Square}
                              className="h-7 bg-slate-800 hover:bg-slate-900 border-none text-[10px]"
                              onClick={() => lunchOut({ employeeId: employee._id })}
                            />
                          )}
                        </>
                      )}
                      <Badge variant="outline" className="bg-primary/5 text-primary h-7">April 2025</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4 text-left">Date</th>
                            <th className="px-6 py-4 text-center">Punch In</th>
                            <th className="px-6 py-4 text-center">Lunch</th>
                            <th className="px-6 py-4 text-center">Punch Out</th>
                            <th className="px-6 py-4 text-center">Duration</th>
                            <th className="px-6 py-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {logs.map((log) => {
                            const formatTime = (date?: string) => date ? new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : "--";
                            return (
                              <tr
                                key={log._id}
                                onClick={() => setSelectedLog(log)}
                                className="hover:bg-primary/3 transition-colors group cursor-pointer"
                              >
                                <td className="px-6 py-4 font-medium text-foreground/80">{new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="px-6 py-4 text-center text-muted-foreground font-medium text-xs">{formatTime(log.punchIn)}</td>
                                <td className="px-6 py-4 text-center">
                                  {log.lunchInTime ? (
                                    <div className="flex flex-col items-center">
                                      <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-tighter">IN: {formatTime(log.lunchInTime)}</span>
                                      <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-tighter">OUT: {formatTime(log.lunchOutTime)}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground/30">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center text-muted-foreground font-medium text-xs">{formatTime(log.punchOut)}</td>
                                <td className="px-6 py-4 text-center">
                                  <Badge variant="secondary" className="font-medium text-[9px] px-1.5 py-0 bg-muted/50 text-muted-foreground border-none">
                                    {log.punchIn && log.punchOut ? `${Math.round((new Date(log.punchOut).getTime() - new Date(log.punchIn).getTime()) / (1000 * 60 * 60))}h` : "0h"}
                                  </Badge>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className={cn(
                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide",
                                    log.status === "present" ? "bg-success/10 text-success" :
                                      log.status === "absent" ? "bg-red-50 text-red-500" :
                                        "bg-amber-50 text-amber-500"
                                  )}>
                                    {log.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Month Selector & Summary */}
              <div className="space-y-6">
                <Card className="border-none shadow-elegant">
                  <CardHeader className="border-b border-border/40 bg-muted/20">
                    <CardTitle className="text-sm font-bold">Month Selector</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 border border-border/60">
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <div className="text-center">
                        <p className="text-lg font-bold">April 2025</p>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Active Period</p>
                      </div>
                      <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 border border-border/60">
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-border/40">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Total Working Hours</span>
                        <span className="font-bold text-primary">169 : 18 h</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Estimated Net Salary</span>
                        <span className="font-bold text-success">₹{(employee.salary).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-elegant bg-primary/5 border border-primary/10">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">Need assistance?</h4>
                        <p className="text-xs text-muted-foreground">Contact HR regarding attendance</p>
                      </div>
                    </div>
                    <ActionButton
                      variant="add"
                      showLabel
                      label="Raise Ticket"
                      className="w-full"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detailed Log Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
          {selectedLog && (
            <div className="flex flex-col bg-slate-50 min-h-[500px]">
              <DialogHeader className="bg-primary p-6 text-white shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl font-bold">Attendance Detail</DialogTitle>
                  <Badge className="bg-white/20 text-white border-white/30 uppercase tracking-widest">{new Date(selectedLog.date).toLocaleDateString()}</Badge>
                </div>
                <DialogDescription className="text-white/70 text-xs font-medium">
                  Viewing detailed punch-in and punch-out logs for this day.
                </DialogDescription>
              </DialogHeader>

              <div className="p-8 space-y-8 overflow-y-auto">
                {/* Login Timeline Item */}
                <div className="relative pl-8 border-l-2 border-dashed border-primary/30">
                  <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary ring-4 ring-primary/10" />
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-primary uppercase tracking-wider text-[10px]">Step 1: Punch In (Login)</h4>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-border/40">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-lg font-semibold">{selectedLog.punchIn ? new Date(selectedLog.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "--"}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">ENTRY</Badge>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{typeof selectedLog.punchInLocation === 'string' ? selectedLog.punchInLocation : "Location data not captured"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-32 h-32 rounded-xl overflow-hidden shadow-md border border-border/50 bg-white flex items-center justify-center transition-transform hover:scale-105">
                        {selectedLog.punchInPhoto ? (
                          <img src={selectedLog.punchInPhoto} alt="Login Selfie" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground/30">
                            <User className="h-8 w-8 mb-1" />
                            <span className="text-[10px]">No Photo</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Punch In Photo</span>
                    </div>
                  </div>
                </div>

                {/* Lunch In Timeline Item */}
                {selectedLog.lunchInTime && (
                  <div className="relative pl-8 border-l-2 border-dashed border-amber-300">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-amber-500 ring-4 ring-amber-500/10" />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-amber-500" />
                        <h4 className="font-semibold text-amber-600 uppercase tracking-wider text-[10px]">Step 2: Lunch Break In</h4>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-border/40 border-l-4 border-l-amber-500">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-lg font-semibold">{new Date(selectedLog.lunchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{typeof selectedLog.lunchInLocation === 'string' ? selectedLog.lunchInLocation : "Location data not captured"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lunch Out Timeline Item */}
                {selectedLog.lunchOutTime && (
                  <div className="relative pl-8 border-l-2 border-dashed border-amber-300">
                    <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-amber-400 ring-4 ring-amber-400/10" />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-amber-400" />
                        <h4 className="font-semibold text-amber-500 uppercase tracking-wider text-[10px]">Step 3: Lunch Break Out</h4>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-border/40 border-l-4 border-l-amber-400">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-lg font-semibold">{new Date(selectedLog.lunchOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{typeof selectedLog.lunchOutLocation === 'string' ? selectedLog.lunchOutLocation : "Location data not captured"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Logout Timeline Item */}
                <div className="relative pl-8 border-l-2 border-dashed border-slate-300">
                  <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-slate-500 ring-4 ring-slate-100" />
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <UserMinus className="h-4 w-4 text-slate-500" />
                        <h4 className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Step 4: Punch Out (Logout)</h4>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-border/40">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-lg font-semibold">{selectedLog.punchOut ? new Date(selectedLog.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "Still at Office"}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">EXIT</Badge>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{typeof selectedLog.punchOutLocation === 'string' ? selectedLog.punchOutLocation : "Location data pending"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-32 h-32 rounded-xl overflow-hidden shadow-md border border-border/50 bg-white flex items-center justify-center transition-transform hover:scale-105">
                        {selectedLog.punchOutPhoto && selectedLog.punchOut ? (
                          <img src={selectedLog.punchOutPhoto} alt="Logout Selfie" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground/30">
                            <User className="h-8 w-8 mb-1" />
                            <span className="text-[10px]">No Photo</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Punch Out Photo</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto bg-white p-6 border-t border-border/40 flex justify-end">
                <ActionButton
                  variant="view"
                  showLabel
                  label="Close Details"
                  onClick={() => setSelectedLog(null)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
