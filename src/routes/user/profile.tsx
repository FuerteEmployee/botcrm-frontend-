import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { 
  User, Mail, Phone, MapPin, ShieldAlert, Library, 
  Settings, CreditCard, Save, Edit2, RefreshCw, Briefcase, Calendar, HeartPulse,
  Badge as LucideBadge, Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";

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
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Edit fields
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  // 1. Fetch Profile
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  useEffect(() => {
    if (profile) {
      setAddress(profile.address || "");
      setEmergencyName(profile.contactPersonName || "");
      setEmergencyPhone(profile.contactPersonMobile || "");
    }
  }, [profile]);

  // 2. Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        address,
        contactPersonName: emergencyName,
        contactPersonMobile: emergencyPhone
      };
      const { data } = await apiClient.put("/users/profile", payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Profile Update Failed");
    }
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        {/* Title skeleton */}
        <div className="space-y-2 text-left">
          <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded-md" />
          <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
        </div>

        {/* Hero Profile Banner Card Skeleton */}
        <div className="h-[120px] bg-slate-200 dark:bg-slate-800/80 rounded-[28px] border-t-8 border-[#501537]/50" />

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left skeleton */}
          <div className="col-span-1 lg:col-span-6 space-y-6">
            <div className="h-[280px] bg-slate-200 dark:bg-slate-800/60 rounded-[24px]" />
          </div>

          {/* Right skeleton */}
          <div className="col-span-1 lg:col-span-6 space-y-6">
            <div className="h-[160px] bg-slate-200 dark:bg-slate-800/60 rounded-[28px]" />
            <div className="h-[220px] bg-slate-200 dark:bg-slate-800/60 rounded-[28px]" />
          </div>
        </div>
      </div>
    );
  }

  const initials = (profile?.name ?? "User").split(" ").map(s => s[0]).slice(0, 2).join("");

  return (
    <div className="w-full space-y-6">
      
      {/* Title */}
      <div className="text-left">
        <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
          My Profile settings
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          Review emergency contacts, bank details, branch settings, and customize residential addresses.
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

      {/* Main Info Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Contact & Emergency Details (Editable) */}
        <div className="col-span-1 lg:col-span-6 space-y-6">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[#501537]" /> Contact & Emergency Details
                </h4>
                
                <Button
                  variant="ghost"
                  onClick={() => setIsEditing(!isEditing)}
                  className="rounded-xl h-8 px-3 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-none cursor-pointer"
                >
                  <Edit2 className="h-3 w-3 mr-1.5" />
                  <span>{isEditing ? "Cancel" : "Edit Profile"}</span>
                </Button>
              </div>

              {isEditing ? (
                <div className="space-y-4 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Residential Address</Label>
                    <Input 
                      value={address} 
                      onChange={(e) => setAddress(e.target.value)} 
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Emergency Contact Name</Label>
                    <Input 
                      value={emergencyName} 
                      onChange={(e) => setEmergencyName(e.target.value)} 
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Emergency Contact Mobile</Label>
                    <Input 
                      value={emergencyPhone} 
                      onChange={(e) => setEmergencyPhone(e.target.value)} 
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>

                  <Button 
                    onClick={() => updateProfileMutation.mutate()}
                    disabled={updateProfileMutation.isPending}
                    className="w-full bg-gradient-primary text-white font-extrabold rounded-xl h-11 border-none shadow-md shadow-primary/20 text-xs mt-2 cursor-pointer"
                  >
                    {updateProfileMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </div>
              ) : (
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

                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Work Settings & Financial Bank details ( salary account mockup card) */}
        <div className="col-span-1 lg:col-span-6 space-y-6">
          
          {/* Work settings details */}
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

                <div className="space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Blood Group</span>
                  <span className="text-[12px] font-black text-slate-850 dark:text-slate-250 flex items-center gap-1">
                    <HeartPulse className="h-3.5 w-3.5 text-slate-400" />
                    {profile?.bloodGroup || "Not Listed"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* salary account credit card mockup visual */}
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[28px] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800/40 pb-3">
                <CreditCard className="h-4 w-4 text-[#501537]" /> Salary Disbursement Account
              </h4>

              {profile?.bankDetails?.accountNumber ? (
                <div className="pt-1">
                  
                  {/* Credit Card Mockup design */}
                  <div className="relative p-6 rounded-3xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-950 text-white overflow-hidden border border-white/10 shadow-lg select-none">
                    
                    {/* Watermark symbol */}
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

                  <span className="text-[9.5px] text-slate-400 block font-bold italic text-center mt-3">
                    *Account details can only be edited by HR administrators for safety.
                  </span>

                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  <CreditCard className="h-7 w-7 text-slate-350 mx-auto mb-2" />
                  <span>Salary bank account has not been uploaded by HR.</span>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

      </div>

    </div>
  );
}

export default UserProfilePage;
