import { createFileRoute } from "@tanstack/react-router";
import { AppVersionCard } from "@/components/shared/app-update";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, IMAGE_BASE_URL } from "@/lib/api-client";
import { patchSession } from "@/lib/auth";
import {
  User, Phone, MapPin, Briefcase, Building2, Clock, CalendarDays, BadgeCheck,
  Pencil, RefreshCw, Save, Edit2, Landmark, IdCard, Lock, FileText, Upload
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { requestErrorMessage } from "@/services/request-error";
import { LoadError } from "@/components/user/load-error";

export const Route = createFileRoute("/user/account")({
  component: UserAccountSummaryPage,
});

interface BankDetails {
  accountNumber?: string;
  bankName?: string;
  ifsc?: string;
  branchName?: string;
  nameAsPerBank?: string;
}

interface UserProfile {
  name: string;
  phone: string;
  address?: string;
  profileImage?: string;
  joiningDate?: string;
  employmentType?: string;
  departmentId?: { name: string };
  branchId?: { branchName: string };
  shiftId?: { name: string };
  bankDetails?: BankDetails;
  panNo?: string;
  aadhaarNo?: string;
  panCardUrls?: string[];
  aadhaarCardUrls?: string[];
  /**
   * May this person change their own name, bank, PAN and Aadhaar here? Set by
   * the admin (Settings > Security > Employee App) and resolved by the server,
   * which refuses the change anyway when it is false. Missing = locked.
   */
  canEditSensitiveDetails?: boolean;
}

type BankForm = Required<BankDetails>;
const EMPTY_BANK: BankForm = { accountNumber: "", bankName: "", ifsc: "", branchName: "", nameAsPerBank: "" };
const ID_FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";

// Only the last four digits, the way banks and UIDAI print them.
const maskTail = (value?: string, groups = "•••• ") => {
  const digits = (value || "").replace(/\s/g, "");
  return digits.length > 4 ? `${groups}${digits.slice(-4)}` : value || "";
};

const same = (a?: string, b?: string) => (a || "").trim() === (b || "").trim();

/**
 * Format checks for a CHANGED value only. A value already on file passes as it
 * is, whatever its format -- otherwise fixing an address would force someone
 * to first retype an old PAN that HR once entered in lower case.
 */
function idFieldErrors(form: { bank: BankForm; panNo: string; aadhaarNo: string }, profile: UserProfile) {
  const e: Partial<Record<"accountNumber" | "ifsc" | "panNo" | "aadhaarNo", string>> = {};
  const acct = form.bank.accountNumber.replace(/\s/g, "");
  if (acct && !same(form.bank.accountNumber, profile.bankDetails?.accountNumber) && !/^\d{6,18}$/.test(acct)) {
    e.accountNumber = "Account number should be 6 to 18 numbers.";
  }
  const ifsc = form.bank.ifsc.trim().toUpperCase();
  if (ifsc && !same(form.bank.ifsc, profile.bankDetails?.ifsc) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    e.ifsc = "IFSC should look like SBIN0001234 (11 letters and numbers).";
  }
  const pan = form.panNo.trim().toUpperCase();
  if (pan && !same(form.panNo, profile.panNo) && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
    e.panNo = "PAN should look like ABCDE1234F.";
  }
  const aadhaar = form.aadhaarNo.replace(/\s/g, "");
  if (aadhaar && !same(form.aadhaarNo, profile.aadhaarNo) && !/^\d{12}$/.test(aadhaar)) {
    e.aadhaarNo = "Aadhaar should be 12 numbers.";
  }
  return e;
}

/** The note shown beside anything only HR can change. */
function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p data-locked-note className="flex items-start gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 leading-snug">
      <Lock className="h-4 w-4 mt-px shrink-0 text-[#501537] dark:text-[#c17ba0]" />
      <span>{children}</span>
    </p>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="h-9 w-9 rounded-xl bg-[#501537]/5 dark:bg-white/5 text-[#501537] dark:text-[#c17ba0] flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <span className="text-[11px] text-slate-500 font-bold block uppercase tracking-wider leading-none mb-1">{label}</span>
        <span className="text-sm font-black text-slate-800 dark:text-slate-100 leading-snug break-words">{value}</span>
      </div>
    </div>
  );
}

function UserAccountSummaryPage() {
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", bank: EMPTY_BANK, panNo: "", aadhaarNo: "" });
  // New PAN / Aadhaar scans picked while editing (front and back, up to two).
  const [panFiles, setPanFiles] = useState<File[]>([]);
  const [aadhaarFiles, setAadhaarFiles] = useState<File[]>([]);
  // "#bank" opens straight on Bank & ID -- the My Account page links here
  // when the admin lets employees change those details themselves.
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#bank" ? "bank" : "personal"
  );

  const { data: profile, isLoading, error, refetch, isFetching } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    }
  });

  // The phone number is the login. Saved with a typo, the employee's next
  // sign-in says "You are not registered" and only an admin can get them back
  // in -- so a CHANGED number must look like a real 10-digit mobile before
  // Save is allowed. An unchanged one passes whatever its format, or an
  // address-only edit would push people into rewriting their login.
  const phoneUnchanged = form.phone.trim() === (profile?.phone || "").trim();
  const phoneValid = phoneUnchanged || /^\d{10}$/.test(form.phone.trim());
  // Legal name, bank, PAN and Aadhaar: editable only when the admin allows it.
  // The server enforces the same rule; this only avoids offering a control
  // that would then be refused.
  const canEditSensitive = profile?.canEditSensitiveDetails === true;
  const nameValid = !canEditSensitive || form.name.trim().length > 0;
  const idErrors = profile && canEditSensitive ? idFieldErrors(form, profile) : {};
  const canSave = phoneValid && nameValid && Object.keys(idErrors).length === 0;

  const startEditing = () => {
    setForm({
      name: profile?.name || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      bank: { ...EMPTY_BANK, ...Object.fromEntries(Object.entries(profile?.bankDetails || {}).map(([k, v]) => [k, v ?? ""])) },
      panNo: profile?.panNo || "",
      aadhaarNo: profile?.aadhaarNo || "",
    });
    setPanFiles([]);
    setAadhaarFiles([]);
    setIsEditing(true);
  };

  // A changed value is tidied (upper case, no spaces); an untouched one is
  // sent exactly as stored, so re-saving never "changes" it.
  const tidy = (value: string, stored: string | undefined, fix: (v: string) => string) =>
    same(value, stored) ? stored || "" : fix(value);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        phone: form.phone.trim(),
        address: form.address.trim(),
      };
      if (canEditSensitive && profile) {
        payload.name = form.name.trim();
        payload.panNo = tidy(form.panNo, profile.panNo, (v) => v.trim().toUpperCase());
        payload.aadhaarNo = tidy(form.aadhaarNo, profile.aadhaarNo, (v) => v.replace(/\s/g, ""));
        payload.bankDetails = {
          accountNumber: tidy(form.bank.accountNumber, profile.bankDetails?.accountNumber, (v) => v.replace(/\s/g, "")),
          bankName: form.bank.bankName.trim(),
          ifsc: tidy(form.bank.ifsc, profile.bankDetails?.ifsc, (v) => v.trim().toUpperCase()),
          branchName: form.bank.branchName.trim(),
          nameAsPerBank: form.bank.nameAsPerBank.trim(),
        };
      }

      const files = canEditSensitive ? [...panFiles, ...aadhaarFiles] : [];
      if (files.length === 0) {
        const { data } = await apiClient.put("/users/profile", payload);
        return data;
      }
      // Scans go as multipart; bankDetails then travels as a JSON string,
      // which updateProfile already parses.
      const fd = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        fd.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      panFiles.forEach((f) => fd.append("panCard", f));
      aadhaarFiles.forEach((f) => fd.append("aadhaarCard", f));
      const { data } = await apiClient.put("/users/profile", fd, { headers: { "Content-Type": "multipart/form-data" } });
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
    onError: (err) => {
      const message = requestErrorMessage(err, "Your changes could not be saved. Please try again.");
      if (message) toast.error(message);
      // Refused because the admin has just locked these fields: reload the
      // profile so the screen shows them as HR-only instead of editable.
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "sensitive_edit_locked") queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    }
  });

  const pickFiles = (setter: (f: File[]) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []).slice(0, 2);
    e.target.value = "";
    if (picked.length) setter(picked);
  };

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
    onError: (err) => {
      const message = requestErrorMessage(err, "The photo could not be uploaded. Please try a JPG or PNG photo.");
      if (message) toast.error(message);
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

  // Without this a failed load rendered "Not Added" in every field -- which
  // reads as the employee's record being empty, not as a network problem.
  if (!profile) {
    return (
      <div className="w-full space-y-6">
        <div className="text-left">
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">Profile</h2>
        </div>
        <LoadError what="your profile" error={error} onRetry={() => refetch()} retrying={isFetching} />
        <AppVersionCard className="mt-4" />
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
              className="rounded-xl h-11 px-4 text-sm font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-none cursor-pointer"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={() => isEditing ? updateMutation.mutate() : startEditing()}
            disabled={updateMutation.isPending || (isEditing && !canSave)}
            className="rounded-xl h-11 px-4 text-sm font-bold bg-gradient-primary text-white border-none shadow-md shadow-primary/20 cursor-pointer"
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
              className="absolute -bottom-1 -right-1 h-10 w-10 rounded-full bg-white text-[#501537] flex items-center justify-center shadow-md border-2 border-[#501537]/20 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <Pencil className="h-4 w-4" />
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
              <p className="text-xs text-white/70 font-bold uppercase tracking-wider mt-1">
                {profile?.departmentId?.name || "No department yet"}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
              {profile?.employmentType && (
                <Badge className="bg-white/10 text-white border-none font-bold text-[11px] uppercase tracking-wider rounded-full px-2.5 py-0.5">
                  {profile.employmentType} staff
                </Badge>
              )}
              <span className="text-[11px] text-white/70 font-semibold uppercase tracking-wider flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified Employee
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Personal Info / Professional Info */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="personal" className="whitespace-normal text-center leading-tight py-3 px-2">Personal</TabsTrigger>
          <TabsTrigger value="bank" className="whitespace-normal text-center leading-tight py-3 px-2">Bank &amp; ID</TabsTrigger>
          <TabsTrigger value="professional" className="whitespace-normal text-center leading-tight py-3 px-2">Work</TabsTrigger>
        </TabsList>

        {/* Personal Info */}
        <TabsContent value="personal" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              {isEditing ? (
                <>
                  {canEditSensitive ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="acct-name" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Full Name</Label>
                      <Input
                        id="acct-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        aria-invalid={!nameValid}
                        className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                      />
                      {!nameValid && <p className="text-[13px] text-rose-600">Please enter your name.</p>}
                    </div>
                  ) : (
                    // Legal name is on payslips and bank transfers, so it
                    // changes through HR unless the admin allows otherwise.
                    <div className="space-y-2">
                      <InfoRow icon={User} label="Full Name" value={profile.name || "Not Added"} />
                      <LockedNote>Ask HR to change your name.</LockedNote>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Phone Number</Label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      aria-invalid={!phoneValid}
                      className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    {!phoneValid && <p className="text-[13px] text-rose-600">Enter a 10-digit mobile number, numbers only.</p>}
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                      This is your login number — changing it means you'll sign in with the new number next time.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Address</Label>
                    <Input
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
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

        {/* Bank & ID: where salary is paid, and the ID numbers on file. Only
            editable when the admin allows employees to change them. */}
        <TabsContent value="bank" className="mt-4">
          <Card className="border-0 shadow-xs bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden">
            <CardContent className="p-6 space-y-5">
              {isEditing && canEditSensitive ? (
                <>
                  {([
                    { key: "bankName", label: "Bank Name", placeholder: "Example: State Bank of India" },
                    { key: "accountNumber", label: "Account Number", placeholder: "Numbers only", numeric: true },
                    { key: "ifsc", label: "IFSC Code", placeholder: "Example: SBIN0001234", upper: true },
                    { key: "branchName", label: "Bank Branch", placeholder: "Example: MG Road" },
                    { key: "nameAsPerBank", label: "Name on Bank Account", placeholder: "As printed in your passbook" },
                  ] as const).map((f) => {
                    const err = f.key === "accountNumber" || f.key === "ifsc" ? idErrors[f.key] : undefined;
                    return (
                      <div key={f.key} className="space-y-1.5">
                        <Label htmlFor={`acct-${f.key}`} className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{f.label}</Label>
                        <Input
                          id={`acct-${f.key}`}
                          value={form.bank[f.key]}
                          inputMode={"numeric" in f ? "numeric" : undefined}
                          autoCapitalize={"upper" in f ? "characters" : undefined}
                          placeholder={f.placeholder}
                          onChange={(e) => setForm({ ...form, bank: { ...form.bank, [f.key]: e.target.value } })}
                          aria-invalid={!!err}
                          className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                        />
                        {err && <p className="text-[13px] text-rose-600">{err}</p>}
                      </div>
                    );
                  })}
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                    Your salary is paid to this account. Please check every number before you save.
                  </p>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="acct-pan" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">PAN Number</Label>
                      <Input
                        id="acct-pan"
                        value={form.panNo}
                        autoCapitalize="characters"
                        placeholder="Example: ABCDE1234F"
                        onChange={(e) => setForm({ ...form, panNo: e.target.value })}
                        aria-invalid={!!idErrors.panNo}
                        className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                      />
                      {idErrors.panNo && <p className="text-[13px] text-rose-600">{idErrors.panNo}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="acct-aadhaar" className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Aadhaar Number</Label>
                      <Input
                        id="acct-aadhaar"
                        value={form.aadhaarNo}
                        inputMode="numeric"
                        placeholder="12 numbers"
                        onChange={(e) => setForm({ ...form, aadhaarNo: e.target.value })}
                        aria-invalid={!!idErrors.aadhaarNo}
                        className="rounded-xl h-11 text-sm dark:bg-slate-950 border-slate-200 dark:border-slate-800 px-3 focus-visible:ring-1 focus-visible:ring-primary"
                      />
                      {idErrors.aadhaarNo && <p className="text-[13px] text-rose-600">{idErrors.aadhaarNo}</p>}
                    </div>

                    {/* A new photo REPLACES the one on file, so it says so. */}
                    {([
                      { key: "pan", label: "PAN card photo", files: panFiles, set: setPanFiles, onFile: profile.panCardUrls?.length || 0 },
                      { key: "aadhaar", label: "Aadhaar card photo", files: aadhaarFiles, set: setAadhaarFiles, onFile: profile.aadhaarCardUrls?.length || 0 },
                    ] as const).map((d) => (
                      <div key={d.key} className="space-y-1.5">
                        <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">{d.label}</span>
                        <label className="min-h-11 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3.5 py-2.5 text-sm font-semibold text-[#501537] dark:text-[#e0a6c6] cursor-pointer hover:bg-[#501537]/5">
                          <Upload className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 break-words">
                            {d.files.length
                              ? `${d.files.length} new photo${d.files.length > 1 ? "s" : ""} chosen`
                              : d.onFile ? "Choose a new photo (front and back)" : "Add a photo (front and back)"}
                          </span>
                          <input type="file" accept={ID_FILE_TYPES} multiple className="sr-only" onChange={pickFiles(d.set)} />
                        </label>
                        {d.files.length > 0 && d.onFile > 0 && (
                          <p className="text-xs text-slate-500">The photo on file will be replaced when you save.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <InfoRow icon={Landmark} label="Bank" value={profile.bankDetails?.bankName || "Not Added"} />
                  <InfoRow icon={Landmark} label="Account Number" value={maskTail(profile.bankDetails?.accountNumber) || "Not Added"} />
                  <InfoRow icon={Landmark} label="IFSC Code" value={profile.bankDetails?.ifsc || "Not Added"} />
                  <InfoRow icon={User} label="Name on Bank Account" value={profile.bankDetails?.nameAsPerBank || "Not Added"} />
                  <InfoRow icon={IdCard} label="PAN Number" value={profile.panNo || "Not Added"} />
                  <InfoRow icon={IdCard} label="Aadhaar Number" value={maskTail(profile.aadhaarNo, "XXXX XXXX ") || "Not Added"} />
                  <InfoRow
                    icon={FileText}
                    label="ID Photos"
                    value={(profile.panCardUrls?.length || profile.aadhaarCardUrls?.length)
                      ? [profile.panCardUrls?.length ? "PAN card" : "", profile.aadhaarCardUrls?.length ? "Aadhaar card" : ""].filter(Boolean).join(", ")
                      : "None added"}
                  />
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    {canEditSensitive ? (
                      <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-snug">To change these, tap Edit Profile.</p>
                    ) : (
                      <LockedNote>Ask HR to change your bank, PAN or Aadhaar details.</LockedNote>
                    )}
                  </div>
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
              <InfoRow icon={MapPin} label="Branch" value={profile?.branchId?.branchName || "Main Head Office"} />
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

      {/* Support's first question is always "what version are you on?" — this
          is so the employee can answer it without being talked through
          Android's app-info screen. */}
      <AppVersionCard className="mt-4" />

    </div>
  );
}
