import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect} from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Mail, Phone, MapPin, ShieldAlert,
  Settings, CreditCard, Briefcase, Calendar, HeartPulse,
  Clock, Receipt, Contact2, ChevronRight, IndianRupee,
  Landmark, IdCard, FileText, Megaphone
, Gift, Ticket, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useExpenseService } from "@/services/expense-service";
import { NewExpenseModal } from "@/components/pages/NewExpenseModal";
import { useCreateLead } from "@/services/lead-service";
import { NewLeadModal } from "@/components/pages/NewLeadModal";
import { LoadError } from "@/components/user/load-error";

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
  branchId?: { branchName: string };
  shiftId?: { name: string; startTime: string; endTime: string };
  bankDetails?: {
    accountNumber?: string;
    bankName?: string;
    ifsc?: string;
    branchName?: string;
    nameAsPerBank?: string;
  };
  /** Set by the admin; when false only HR can change name, bank, PAN, Aadhaar. */
  canEditSensitiveDetails?: boolean;
}

// Said plainly when HR has not set something up. This page used to invent
// values instead -- "Operations Department", "General Shift", "Main Head
// Office" -- so an employee with no branch read that they belonged to Main
// Head Office, while the punch screen refused them for having no branch.
const NOT_ASSIGNED = "Not assigned yet";

const EMPLOYMENT_LABELS: Record<string, string> = {
  monthly: "Monthly salary",
  daily: "Daily wage",
  hourly: "Hourly pay",
};

// "1 Apr 2024": day first and the month in words, so it cannot be misread
// the way 04/01/2024 can. Pinned to IST like every other date in the product.
function formatDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// "09:30" -> "9:30 AM"
function formatClock(hhmm?: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

// Shown the way banks and UIDAI print it: only the last four digits. The
// account number on this same page was already masked; the Aadhaar number,
// which is at least as sensitive, was printed in full on a phone screen.
function maskAadhaar(value?: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length < 4) return value || null;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function UserProfilePage() {
  const navigate = useNavigate();
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const { expenses, createExpense, isCreating } = useExpenseService();
  const pendingExpenseCount = expenses.filter((e) => e.status === "pending").length;
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const { createLead, isCreating: isCreatingLead } = useCreateLead();

  // 1. Fetch Profile
  const { data: profile, isLoading, error, refetch, isFetching } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  // Scroll to Quick Actions once the page actually has a Quick Actions section.
  //
  // The bottom bar's Quick Action tab navigates to /user/profile#quick-actions,
  // but the router scrolls once on render and the loading skeleton below has no
  // such element — so on a cold tap the scroll silently no-ops and the employee
  // lands at the top of an unfamiliar profile page. That matters more than it
  // sounds: Holidays and Tickets were moved out of the bottom bar into this
  // grid, so on a phone this hash IS their only route to them.
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === "undefined" || window.location.hash !== "#quick-actions") return;
    // A frame after paint, so the element exists and layout has settled.
    const id = window.requestAnimationFrame(() => {
      document.getElementById("quick-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [isLoading]);

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
  const joiningDate = formatDate(profile?.joiningDate);
  const shiftStart = formatClock(profile?.shiftId?.startTime);
  const shiftEnd = formatClock(profile?.shiftId?.endTime);
  const employmentLabel = profile?.employmentType ? EMPLOYMENT_LABELS[profile.employmentType] ?? profile.employmentType : null;

  // The grid needs no profile data, so it is rendered even when the profile
  // failed to load: on a phone it is the only way to Holidays and Tickets.
  const quickActions = (
    <div id="quick-actions" className="space-y-3 scroll-mt-24">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">Quick Actions</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setNewExpenseOpen(true)}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <IndianRupee className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">New Expense</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">Claim money spent <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>

        <button
          onClick={() => navigate({ to: "/user/expenses" })}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer relative"
        >
          {/* On the tile that shows the claims, not on "New Expense", where
              "2 Pending" read as two expenses still waiting to be added. */}
          {pendingExpenseCount > 0 && (
            <Badge className="absolute top-3 right-3 bg-white/25 text-white border-none font-bold text-[11px] tracking-wide rounded-full px-2 py-0.5">
              {pendingExpenseCount} waiting
            </Badge>
          )}
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Receipt className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">My Expenses</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">See your claims <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>

        <button
          onClick={() => setNewLeadOpen(true)}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Contact2 className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">New Lead</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">Add a customer <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>

        <button
          onClick={() => navigate({ to: "/user/announcements" })}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Megaphone className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">Announcements</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">Company notices <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>

        {/* Both of these used to sit in the phone's bottom bar. They are
            occasional rather than daily, so they moved here to give the four
            everyday destinations room for their full labels. */}
        <button
          onClick={() => navigate({ to: "/user/holidays" })}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Gift className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">Holidays</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">Holiday list <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>

        <button
          onClick={() => navigate({ to: "/user/tickets" })}
          className="text-left p-4 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Ticket className="h-4.5 w-4.5" />
          </div>
          <p className="text-sm font-bold">Help / Tickets</p>
          <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">Ask HR for help <ChevronRight className="h-3 w-3 shrink-0" /></p>
        </button>
      </div>
    </div>
  );

  const dialogs = (
    <>
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
    </>
  );

  // Without this the page rendered a blank "U" profile with made-up
  // department and shift names -- indistinguishable from a real, empty record.
  // Keyed on having no data, not on isError: a failed background refetch
  // keeps the profile already on screen rather than replacing it.
  if (!profile) {
    return (
      <div className="w-full space-y-6">
        <div className="text-left">
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">My Account</h2>
        </div>
        <LoadError what="your details" error={error} onRetry={() => refetch()} retrying={isFetching} />
        {quickActions}
        {dialogs}
      </div>
    );
  }

  // Who may change bank, PAN and Aadhaar is the admin's choice. Either way the
  // employee is told what to do about a wrong detail: ask HR, or change it on
  // their Profile page.
  const canEditSensitive = profile.canEditSensitiveDetails === true;
  const changeDetailsNote = (
    <div data-sensitive-note className="mt-3 px-1 space-y-2">
      {canEditSensitive ? (
        <>
          <p className="text-[13px] text-slate-600 dark:text-slate-300">Details wrong? You can change them yourself.</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/user/account", hash: "bank" })}
            className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 px-3.5 py-2 text-[13px] font-bold text-primary"
          >
            Change bank &amp; ID details <ChevronRight className="h-4 w-4" />
          </button>
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">
          <Lock className="h-4 w-4 mt-px shrink-0 text-[#501537] dark:text-[#e0a6c6]" />
          <span>Details wrong? Ask HR to change this.</span>
        </p>
      )}
    </div>
  );

  const labelCls = "text-[11px] text-slate-500 dark:text-slate-400 font-bold block uppercase leading-none mb-1";
  const sectionCls = "text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3";

  return (
    <div className="w-full space-y-6">

      {/* Title */}
      <div className="text-left">
        <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
          My Account
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          Your personal, bank and work details.
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

          <div className="space-y-3 flex-1 min-w-0">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight break-words">{profile.name}</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
                {profile.departmentId?.name || "No department yet"}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
              {employmentLabel && (
                <Badge className="bg-[#501537]/5 text-[#501537] dark:bg-[#7B2453]/10 dark:text-[#e0a6c6] border-none font-bold text-[11px] uppercase tracking-wider rounded-full px-2.5 py-0.5">
                  {employmentLabel}
                </Badge>
              )}
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                Shift: {profile.shiftId?.name || NOT_ASSIGNED}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Joining date / shift time */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl">
          <CardContent className="p-4 text-center">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Joining Date</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {joiningDate || NOT_ASSIGNED}
            </span>
          </CardContent>
        </Card>
        {/* Replaces a "Deadline" card that always read N/A and meant nothing. */}
        <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-2xl">
          <CardContent className="p-4 text-center">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Shift Time</span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
              {shiftStart && shiftEnd ? `${shiftStart} – ${shiftEnd}` : NOT_ASSIGNED}
            </span>
          </CardContent>
        </Card>
      </div>

      {quickActions}

      {/* Tabs: Personal Info / Bank Info / Other Info */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="personal" className="py-3 whitespace-normal leading-tight">Personal</TabsTrigger>
          <TabsTrigger value="bank" className="py-3 whitespace-normal leading-tight">Bank</TabsTrigger>
          <TabsTrigger value="other" className="py-3 whitespace-normal leading-tight">ID &amp; Other</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal" className="mt-4 space-y-6">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className={sectionCls}>
                <ShieldAlert className="h-4 w-4 text-[#501537] dark:text-primary" /> Contact Details
              </h4>

              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={labelCls}>Email</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200 break-all">{profile.email || "Not added"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <span className={labelCls}>Mobile Number</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200">{profile.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={labelCls}>Home Address</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200 leading-snug break-words">{profile.address || "Not added"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className={sectionCls}>
                <Settings className="h-4 w-4 text-[#501537] dark:text-primary" /> Work Details
              </h4>

              <div className="grid grid-cols-2 gap-5 pt-1">
                <div className="space-y-0.5 min-w-0">
                  <span className={labelCls}>Shift</span>
                  <span className="text-[13px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {profile.shiftId?.name || NOT_ASSIGNED}
                  </span>
                </div>

                {/* The branch whose location decides where punch-in works. */}
                <div className="space-y-0.5 min-w-0">
                  <span className={labelCls}>Office / Branch</span>
                  <span className="text-[13px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {profile.branchId?.branchName || NOT_ASSIGNED}
                  </span>
                </div>

                <div className="space-y-0.5 min-w-0">
                  <span className={labelCls}>Joining Date</span>
                  <span className="text-[13px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {joiningDate || NOT_ASSIGNED}
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
              <h4 className={sectionCls}>
                <Landmark className="h-4 w-4 text-[#501537] dark:text-primary" /> Salary Bank Account
              </h4>

              {profile.bankDetails?.accountNumber ? (
                <div className="pt-1">
                  <div className="relative p-6 rounded-3xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-950 text-white overflow-hidden border border-white/10 shadow-lg select-none">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                       <CreditCard className="h-28 w-28" />
                    </div>

                    <div className="space-y-5">
                      <div className="flex justify-between items-start gap-3">
                         <div className="space-y-0.5 min-w-0">
                           <span className="text-[11px] font-black uppercase tracking-widest text-slate-300 leading-none">Bank</span>
                           <h5 className="text-[14px] font-black tracking-tight text-white mt-1 uppercase break-words">{profile.bankDetails.bankName || "—"}</h5>
                         </div>
                         <div className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-[11px] font-black uppercase tracking-wider text-amber-400 shrink-0">
                           Salary paid here
                         </div>
                      </div>

                      <div>
                         <span className="text-[11px] text-white/60 block font-bold tracking-widest leading-none mb-1">ACCOUNT NUMBER</span>
                         <span className="text-sm font-mono font-black tracking-widest text-white">•••• •••• •••• {profile.bankDetails.accountNumber.slice(-4)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-[11px] border-t border-white/5 pt-3">
                         <div className="min-w-0">
                            <span className="text-white/60 block font-bold tracking-widest text-[11px] leading-none mb-1">NAME ON ACCOUNT</span>
                            <span className="font-bold text-white tracking-wide uppercase break-words">{profile.bankDetails.nameAsPerBank || profile.name}</span>
                         </div>
                         <div className="min-w-0">
                            <span className="text-white/60 block font-bold tracking-widest text-[11px] leading-none mb-1">IFSC CODE</span>
                            <span className="font-mono font-bold text-white tracking-wider break-all">{profile.bankDetails.ifsc || "—"}</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  {changeDetailsNote}
                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[13px] text-slate-500">
                  <CreditCard className="h-7 w-7 text-slate-350 mx-auto mb-2" />
                  <span>
                    {canEditSensitive
                      ? "No bank account added yet. Please add it, so your salary can be paid."
                      : "No bank account added yet. Please ask HR to add it, so your salary can be paid."}
                  </span>
                  {canEditSensitive && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/user/account", hash: "bank" })}
                        className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 px-3.5 py-2 text-[13px] font-bold text-primary"
                      >
                        Add bank account <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Other Info */}
        <TabsContent value="other" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <h4 className={sectionCls}>
                <IdCard className="h-4 w-4 text-[#501537] dark:text-primary" /> ID &amp; Other Details
              </h4>

              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <IdCard className="h-4 w-4" />
                  </div>
                  <div>
                    <span className={labelCls}>PAN Number</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200">{profile.panNo || "Not added"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <IdCard className="h-4 w-4" />
                  </div>
                  <div>
                    <span className={labelCls}>Aadhaar Number</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200">{maskAadhaar(profile.aadhaarNo) || "Not added"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-[#501537]/5 text-[#501537] dark:text-primary flex items-center justify-center shrink-0">
                    <HeartPulse className="h-4 w-4" />
                  </div>
                  <div>
                    <span className={labelCls}>Blood Group</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200">{profile.bloodGroup || "Not added"}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-50 dark:border-slate-850/50 flex items-center gap-3.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className={labelCls}>Emergency Contact</span>
                    <span className="text-[13px] font-black text-slate-850 dark:text-slate-200 break-words">
                      {profile.contactPersonName
                        ? profile.contactPersonMobile ? `${profile.contactPersonName} (${profile.contactPersonMobile})` : profile.contactPersonName
                        : "Not added"}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-50 dark:border-slate-850/50 space-y-2">
                  <span className={labelCls}>Uploaded Documents</span>
                  {(!profile.panCardUrls?.length && !profile.aadhaarCardUrls?.length) ? (
                    <span className="text-[13px] text-slate-500">No documents uploaded yet.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(profile.panCardUrls || []).map((url, i) => (
                        <a key={`pan-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="min-h-10 flex items-center gap-1.5 text-[13px] font-bold text-primary px-3.5 py-2 rounded-lg bg-primary/5 hover:bg-primary/10">
                          <FileText className="h-4 w-4" /> PAN Card {i + 1}
                        </a>
                      ))}
                      {(profile.aadhaarCardUrls || []).map((url, i) => (
                        <a key={`aadhaar-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="min-h-10 flex items-center gap-1.5 text-[13px] font-bold text-primary px-3.5 py-2 rounded-lg bg-primary/5 hover:bg-primary/10">
                          <FileText className="h-4 w-4" /> Aadhaar Card {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* PAN, Aadhaar and their photos follow the same rule as the
                    bank account. Blood group and emergency contact are not
                    part of it. */}
                <div className="pt-1 -mx-1">{changeDetailsNote}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dialogs}

    </div>
  );
}
