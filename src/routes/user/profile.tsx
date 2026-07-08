import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Mail, Phone, MapPin, ShieldAlert,
  Settings, CreditCard, Briefcase, Calendar, HeartPulse,
  Clock, Receipt, Contact2, ChevronRight, IndianRupee,
  Landmark, IdCard, FileText
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useExpenseService } from "@/services/expense-service";
import { NewExpenseModal } from "@/components/pages/NewExpenseModal";
import { useLeadService } from "@/services/lead-service";
import { NewLeadModal } from "@/components/pages/NewLeadModal";

export const Route = createFileRoute("/user/profile")({
  component: UserProfilePage,
});

interface UserProfile {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  gender?: string;
  dob?: string;
  joiningDate?: string;
  employmentType?: string;
  bloodGroup?: string;
  address?: string;
  contactPersonName?: string;
  contactPersonMobile?: string;
  aadhaarNo?: string;
  panNo?: string;
  panCardUrls?: string[];
  aadhaarCardUrls?: string[];
  departmentId?: { name: string };
  branchId?: { name: string };
  shiftId?: { name: string; startTime: string; endTime: string };
  bankDetails?: {
    accountNumber?: string;
    bankName?: string;
    ifsc?: string;
    branchName?: string;
    nameAsPerBank?: string;
  };
}

function UserProfilePage() {
  const navigate = useNavigate();
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const { expenses, createExpense, isCreating } = useExpenseService();
  const pendingExpenseCount = expenses.filter((e) => e.status === "pending").length;
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const { createLead, isCreating: isCreatingLead } = useLeadService();

  // 1. Fetch Profile
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-2 text-left">
          <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded-md" />
          <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
        </div>
        <div className="h-[120px] bg-slate-200 dark:bg-slate-800/80 rounded-[28px] border-t-8 border-[#501537]/50" />
        <div className="h-[280px] bg-slate-200 dark:bg-slate-800/60 rounded-[24px]" />
      </div>
    );
  }

  const initials = (profile?.name ?? "User").split(" ").map(s => s[0]).slice(0, 2).join("");

  return (
    <div className="w-full space-y-6">

      {/* Title */}
      <div className="text-left">
        <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
          My Account
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          Review your personal, bank, and other details.
        </p>
      </div>

      {/* Hero Profile Banner Card */}
      <Card className="border-0 shadow-soft bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden relative border-t-8 border-[#501537]">
        <CardContent className="p-6 flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
          <Avatar className="h-20 w-20 ring-4 ring-[#501537]/10 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-[#4A0E2E] to-[#7B2453] text-white text-xl font-bold uppercase">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-3 flex-1">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-none">{profile?.name}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                {profile?.departmentId?.name || "Operations"} Department
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
              <Badge className="bg-[#501537]/5 text-[#501537] dark:bg-[#7B2453]/10 dark:text-[#7B2453] border-none font-bold text-[8.5px] uppercase tracking-wider rounded-full px-2.5 py-0.5">
                • {profile?.employmentType || "Monthly"} Base Staff
              </Badge>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                Shift: {profile?.shiftId?.name || "General Shift"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Joining Date / Deadline stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl">
          <CardContent className="p-4 text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Joining Date</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {profile?.joiningDate ? new Date(profile.joiningDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
            </span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl">
          <CardContent className="p-4 text-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Deadline</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">N/A</span>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div id="quick-actions" className="space-y-3 scroll-mt-24">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">Quick Actions</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setNewExpenseOpen(true)}
            className="text-left p-4 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer relative"
          >
            {pendingExpenseCount > 0 && (
              <Badge className="absolute top-3 right-3 bg-white/20 text-white border-none font-bold text-[8.5px] uppercase tracking-wider rounded-full px-2 py-0.5">
                {pendingExpenseCount} Pending
              </Badge>
            )}
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <IndianRupee className="h-4.5 w-4.5" />
            </div>
            <p className="text-sm font-bold">New Expense</p>
            <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5">Add Details <ChevronRight className="h-3 w-3" /></p>
          </button>

          <button
            onClick={() => navigate({ to: "/user/expenses" })}
            className="text-left p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Receipt className="h-4.5 w-4.5" />
            </div>
            <p className="text-sm font-bold">Expenses</p>
            <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5">View Details <ChevronRight className="h-3 w-3" /></p>
          </button>

          <button
            onClick={() => setNewLeadOpen(true)}
            className="text-left p-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Contact2 className="h-4.5 w-4.5" />
            </div>
            <p className="text-sm font-bold">Lead</p>
            <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5">Add Lead <ChevronRight className="h-3 w-3" /></p>
          </button>
        </div>
      </div>

      {/* Tabs: Personal Info / Bank Info / Other Info */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="bank">Bank Info</TabsTrigger>
          <TabsTrigger value="other">Other Info</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal" className="mt-4 space-y-6">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <ShieldAlert className="h-4 w-4 text-[#501537]" /> Contact Details
              </h4>

              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Email Address</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">{profile?.email || "No Email Configured"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Mobile Contact</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">{profile?.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Residential Address</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200 leading-snug">{profile?.address || "No Address Added"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <Settings className="h-4 w-4 text-[#501537]" /> Duty configurations
              </h4>

              <div className="grid grid-cols-2 gap-5 pt-1">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Assigned Shift</span>
                  <span className="text-[12px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {profile?.shiftId?.name || "General Shift"}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Base Geofence Branch</span>
                  <span className="text-[12px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {profile?.branchId?.name || "Main Head Office"}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Company Joining Date</span>
                  <span className="text-[12px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {profile?.joiningDate ? new Date(profile.joiningDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not Listed"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bank Info */}
        <TabsContent value="bank" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <Landmark className="h-4 w-4 text-[#501537]" /> Salary Disbursement Account
              </h4>

              {profile?.bankDetails?.accountNumber ? (
                <div className="pt-1">
                  <div className="relative p-6 rounded-3xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-950 text-white overflow-hidden border border-white/10 shadow-lg select-none">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                       <CreditCard className="h-28 w-28" />
                    </div>

                    <div className="space-y-5">
                      <div className="flex justify-between items-start">
                         <div className="space-y-0.5">
                           <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">Salary Creditor</span>
                           <h5 className="text-[13px] font-black tracking-tight text-white mt-1 uppercase">{profile.bankDetails.bankName}</h5>
                         </div>
                         <div className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-[7px] font-black uppercase tracking-widest text-amber-400">
                           Primary Account
                         </div>
                      </div>

                      <div>
                         <span className="text-[7.5px] text-white/40 block font-bold tracking-widest leading-none mb-1">ACCOUNT NUMBER</span>
                         <span className="text-sm font-mono font-black tracking-widest text-white">•••• •••• •••• {profile.bankDetails.accountNumber.slice(-4)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-[9px] border-t border-white/5 pt-3">
                         <div>
                            <span className="text-white/40 block font-bold tracking-widest text-[7px] leading-none mb-1">HOLDER NAME</span>
                            <span className="font-bold text-white tracking-wide uppercase">{profile.bankDetails.nameAsPerBank || profile.name}</span>
                         </div>
                         <div>
                            <span className="text-white/40 block font-bold tracking-widest text-[7px] leading-none mb-1">IFSC CODE</span>
                            <span className="font-mono font-bold text-white tracking-wider">{profile.bankDetails.ifsc}</span>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  <CreditCard className="h-7 w-7 text-slate-350 mx-auto mb-2" />
                  <span>No bank account added yet. Contact HR/Admin to have it configured.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Other Info */}
        <TabsContent value="other" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <IdCard className="h-4 w-4 text-[#501537]" /> Other Info
              </h4>

              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <IdCard className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">PAN No</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">{profile?.panNo || "Not Added"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <IdCard className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Aadhaar Card No</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">{profile?.aadhaarNo || "Not Added"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] flex items-center justify-center shrink-0">
                    <HeartPulse className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Blood Group</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">{profile?.bloodGroup || "Not Listed"}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-50 dark:border-slate-850/50 flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none mb-1">Emergency Contact Info</span>
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200">
                      {profile?.contactPersonName ? `${profile.contactPersonName} (${profile.contactPersonMobile})` : "Not Configured"}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-50 dark:border-slate-850/50 space-y-2">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase leading-none">Uploaded Documents</span>
                  {(!profile?.panCardUrls?.length && !profile?.aadhaarCardUrls?.length) ? (
                    <span className="text-xs text-slate-400">No documents uploaded yet.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(profile?.panCardUrls || []).map((url, i) => (
                        <a key={`pan-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10">
                          <FileText className="h-3.5 w-3.5" /> PAN Card {i + 1}
                        </a>
                      ))}
                      {(profile?.aadhaarCardUrls || []).map((url, i) => (
                        <a key={`aadhaar-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10">
                          <FileText className="h-3.5 w-3.5" /> Aadhaar Card {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NewExpenseModal
        open={newExpenseOpen}
        onOpenChange={setNewExpenseOpen}
        onSubmit={createExpense}
        isLoading={isCreating}
      />

      <NewLeadModal
        open={newLeadOpen}
        onOpenChange={setNewLeadOpen}
        onSubmit={createLead}
        isLoading={isCreatingLead}
      />

    </div>
  );
}

export default UserProfilePage;
