import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import { patchSession } from "@/lib/auth";
import {
  User, Phone, MapPin, Briefcase, Building2, Clock, CalendarDays, BadgeCheck,
  Pencil, RefreshCw, Save, Edit2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/user/account")({
  component: UserAccountSummaryPage,
});

interface UserProfile {
  name: string;
  phone: string;
  address?: string;
  profileImage?: string;
  joiningDate?: string;
  employmentType?: string;
  departmentId?: { name: string };
  branchId?: { name: string };
  shiftId?: { name: string };
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="h-9 w-9 rounded-xl bg-[#501537]/5 dark:bg-white/5 text-[#501537] dark:text-[#c17ba0] flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider leading-none mb-1">{label}</span>
        <span className="text-sm font-black text-slate-800 dark:text-slate-100 leading-snug">{value}</span>
      </div>
    </div>
  );
}

function UserAccountSummaryPage() {
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  const startEditing = () => {
    setForm({
      name: profile?.name || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
    });
    setIsEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.put("/users/profile", form);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Profile updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      // The sidebar/header greeting reads from the cached auth session, not
      // this query — patch it so the new name/phone show up immediately.
      patchSession({ name: data.name, phone: data.phone });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Profile Update Failed");
    }
  });

  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const { data } = await apiClient.put("/users/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Profile photo updated!");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Photo Upload Failed");
    }
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-2 text-left">
          <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
          <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
        </div>
        <div className="h-[160px] bg-gradient-to-br from-[#2D061A] via-[#501537] to-[#8C2059] rounded-[28px] opacity-40" />
        <div className="h-[240px] bg-slate-200 dark:bg-slate-800/60 rounded-[24px]" />
      </div>
    );
  }

  const initials = (profile?.name ?? "User").split(" ").map(s => s[0]).slice(0, 2).join("");
  const photoUrl = profile?.profileImage
    ? (profile.profileImage.startsWith("http") ? profile.profileImage : `${IMAGE_BASE_URL}${profile.profileImage}`)
    : undefined;

  return (
    <div className="w-full space-y-6">

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Profile
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Your personal and professional details at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="rounded-xl h-9 px-4 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-none cursor-pointer"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={() => isEditing ? updateMutation.mutate() : startEditing()}
            disabled={updateMutation.isPending}
            className="rounded-xl h-9 px-4 text-xs font-bold bg-gradient-primary text-white border-none shadow-md shadow-primary/20 cursor-pointer"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : isEditing ? (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isEditing ? "Save Changes" : "Edit Profile"}
          </Button>
        </div>
      </div>

      {/* Hero Avatar Banner — signature plum-burgundy gradient */}
      <Card className="border border-white/10 shadow-[0_20px_50px_rgba(80,21,55,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-gradient-to-br from-[#2D061A] via-[#501537] to-[#8C2059] text-white rounded-[28px] overflow-hidden relative">
        <div className="absolute inset-0 bg-radial-at-t from-white/10 to-transparent pointer-events-none" />
        <CardContent className="p-6 flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left relative z-10">
          <div className="relative shrink-0">
            <Avatar className="h-20 w-20 ring-4 ring-white/15">
              <AvatarImage src={photoUrl} className="object-cover" />
              <AvatarFallback className="bg-white/10 text-white text-xl font-bold uppercase">
                {initials}
              </AvatarFallback>
            </Avatar>
            {photoMutation.isPending && (
              <div className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-xs flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-white animate-spin" />
              </div>
            )}
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={photoMutation.isPending}
              aria-label="Change profile photo"
              title="Change profile photo"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white text-[#501537] flex items-center justify-center shadow-md border-2 border-[#501537]/20 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) photoMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="space-y-2 flex-1">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white leading-none">{profile?.name}</h3>
              <p className="text-xs text-white/60 font-bold uppercase tracking-wider mt-1">
                {profile?.departmentId?.name || "Operations"} Department
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
              <Badge className="bg-white/10 text-white border-none font-bold text-[8.5px] uppercase tracking-wider rounded-full px-2.5 py-0.5">
                • {profile?.employmentType || "Monthly"} Base Staff
              </Badge>
              <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wider flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified Employee
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Personal Info / Professional Info */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="personal" className="whitespace-normal text-center leading-tight py-2 px-2">Personal Info</TabsTrigger>
          <TabsTrigger value="professional" className="whitespace-normal text-center leading-tight py-2 px-2">Professional Info</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              {isEditing ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Full Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phone Number</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <p className="text-[9.5px] text-amber-500 font-medium leading-relaxed">
                      This is your login number — changing it means you'll sign in with the new number next time.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Address</Label>
                    <Input
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="rounded-xl h-11 text-xs dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </div>
                </>
              ) : (
                <>
                  <InfoRow icon={User} label="Full Name" value={profile?.name || "Not Added"} />
                  <InfoRow icon={Phone} label="Phone Number" value={profile?.phone || "Not Added"} />
                  <InfoRow icon={MapPin} label="Address" value={profile?.address || "No Address Added"} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Professional Info */}
        <TabsContent value="professional" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <InfoRow icon={Building2} label="Department" value={profile?.departmentId?.name || "Not Assigned"} />
              <InfoRow icon={MapPin} label="Branch" value={profile?.branchId?.name || "Main Head Office"} />
              <InfoRow icon={Clock} label="Assigned Shift" value={profile?.shiftId?.name || "General Shift"} />
              <InfoRow icon={Briefcase} label="Employment Type" value={profile?.employmentType || "Monthly"} />
              <InfoRow
                icon={CalendarDays}
                label="Joining Date"
                value={profile?.joiningDate ? new Date(profile.joiningDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not Listed"}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

export default UserAccountSummaryPage;
