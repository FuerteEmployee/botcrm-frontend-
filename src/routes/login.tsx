import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Loader2, ArrowRight, ShieldCheck, CheckCircle2, Clock, LogOut, User, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSession, getSession, clearSession } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { toast } from "sonner";
import logo from "@/assets/bot-logo.png";
import bgImage from "@/assets/login-bg.png";
import { apiClient } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const OTP_KEY = (phone: string) => `bot_pending_otp_${phone}`;

function maskPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 4) return cleaned;
  return cleaned.slice(0, 2) + "x".repeat(cleaned.length - 4) + cleaned.slice(-2);
}

function roleLabel(role: Session["role"]) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "subadmin") return "Sub-Admin";
  return "Employee";
}

function roleDashboard(role: Session["role"]) {
  if (role === "superadmin") return "/super/overview";
  if (role === "admin" || role === "subadmin") return "/dashboard";
  return "/user";
}

function LoginPage() {
  const navigate = useNavigate();

  // Detect existing session on mount
  const [existingSession, setExistingSession] = useState<Session | null>(null);
  const [step, setStep] = useState<"session" | "phone" | "otp">("phone");
  const [logoutReason, setLogoutReason] = useState<"another_device" | "inactive" | null>(null);
  const [inactiveName, setInactiveName] = useState<string | undefined>(undefined);
  const [inactiveMessage, setInactiveMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    const reason = window.localStorage.getItem("bot_logout_reason");
    if (reason === "another_device" || reason === "inactive") {
      setLogoutReason(reason);
      if (reason === "inactive") {
        const msg = window.localStorage.getItem("bot_logout_message");
        if (msg) setInactiveMessage(msg);
      }
      window.localStorage.removeItem("bot_logout_reason");
      window.localStorage.removeItem("bot_logout_message");
    }
    const s = getSession();
    if (s) {
      setExistingSession(s);
      setStep("session");
    }
  }, []);

  // Backend sends { code: 'account_inactive', message, name } when the account
  // is deactivated — message may be a custom reason the admin set per employee.
  const readInactiveError = (error: any): { name?: string; message?: string } | null => {
    const data = error?.response?.data;
    if (!data) return null;
    const isInactiveCode = data.code === "inactive" || data.code === "employee_inactive" || data.code === "account_inactive";
    const isInactiveMessage = typeof data.message === "string" && /inactive|deactivat/i.test(data.message);
    if (!isInactiveCode && !isInactiveMessage) return null;
    return { name: data.name || data.employeeName, message: data.message };
  };

  const companyLogo = existingSession?.companyLogo || logo;

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [resendIn, setResendIn] = useState(30);
  const [otpStatus, setOtpStatus] = useState<"idle" | "error">("idle");
  const [liveMessage, setLiveMessage] = useState("");

  const phoneRef = useRef<HTMLInputElement>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step === "phone") phoneRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // ─── Generate and store a fresh OTP ───────────────────────────────────────
  const issueOtp = (cleaned: string) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    window.localStorage.setItem(OTP_KEY(cleaned), code);
    setGeneratedOtp(code);
    return code;
  };

  // ─── Send OTP ──────────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    setLogoutReason(null);
    try {
      await apiClient.post("/users/login-request", { phone: cleaned });
      issueOtp(cleaned);
      setStep("otp");
      setResendIn(30);
      setOtp(["", "", "", "", "", ""]);
      setOtpStatus("idle");
      setLiveMessage("OTP sent. Enter the 6-digit code.");
      toast.success("OTP sent successfully");
    } catch (error: any) {
      const inactive = readInactiveError(error);
      if (inactive) {
        setLogoutReason("inactive");
        setInactiveName(inactive.name);
        setInactiveMessage(inactive.message);
      } else {
        toast.error(error.response?.data?.message || "Failed to send OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ───────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    const cleaned = phone.replace(/\D/g, "");
    setResendIn(30);
    setOtp(["", "", "", "", "", ""]);
    setOtpStatus("idle");
    setTimeout(() => inputsRef.current[0]?.focus(), 50);
    try {
      await apiClient.post("/users/login-request", { phone: cleaned });
      issueOtp(cleaned);
      setLiveMessage("New OTP sent.");
      toast.success("OTP resent successfully");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to resend OTP");
    }
  };

  // ─── OTP digit change ─────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.slice(-1);
    if (!/^\d?$/.test(digit)) return;
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpStatus("idle");
    if (digit && index < 5) inputsRef.current[index + 1]?.focus();
    if (digit && next.every((d) => d !== "")) submitOtp(next.join(""));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const next = [...otp];
        next[index] = "";
        setOtp(next);
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = text[i] ?? "";
    setOtp(next);
    inputsRef.current[Math.min(text.length, 5)]?.focus();
    if (text.length === 6) submitOtp(text);
  };

  // ─── Core OTP submission ───────────────────────────────────────────────────
  const submitOtp = async (code: string) => {
    if (code.length !== 6) {
      toast.error("Enter the full 6-digit OTP");
      return;
    }

    // Verify against the locally-generated OTP
    const cleaned = phone.replace(/\D/g, "");
    const stored = window.localStorage.getItem(OTP_KEY(cleaned));
    if (code !== stored) {
      setOtpStatus("error");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
      setLiveMessage("Incorrect OTP. Please try again.");
      toast.error("Invalid OTP");
      return;
    }

    setLoading(true);
    try {
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json").then((r) => r.json());
        if (ipRes?.ip) window.localStorage.setItem("bot_temp_ip", ipRes.ip);
      } catch {
        // IP fetch is best-effort
      }

      // Backend still expects its own OTP — send the hardcoded value
      const { data } = await apiClient.post("/users/verify-otp", {
        phone: cleaned,
        otp: "123456",
      });

      // Discard the used OTP
      window.localStorage.removeItem(OTP_KEY(cleaned));

      setSession({
        phone: `+91 ${data.phone}`,
        name: data.name,
        role: data.role,
        companyName: data.companyName,
        companyLogo: data.companyLogo,
        address: data.address,
        email: data.email,
        token: data.token,
        loggedInAt: Date.now(),
        permissions: data.permissions,
      });

      setLiveMessage("Verification successful. Signing in.");
      toast.success("Welcome back!");
      navigate({ to: roleDashboard(data.role) });
    } catch (error: any) {
      const inactive = readInactiveError(error);
      if (inactive) {
        setLogoutReason("inactive");
        setInactiveName(inactive.name);
        setInactiveMessage(inactive.message);
        setStep("phone");
        setOtp(["", "", "", "", "", ""]);
        return;
      }
      setOtpStatus("error");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
      setLiveMessage("Incorrect OTP. Please try again.");
      toast.error(error.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    submitOtp(otp.join(""));
  };

  const handleGoBack = () => {
    setStep("phone");
    setOtp(["", "", "", "", "", ""]);
    setOtpStatus("idle");
  };

  const otpInputClass = [
    "h-12 w-10 sm:h-14 sm:w-12 rounded-xl border bg-white text-center text-xl font-extrabold",
    "focus:ring-4 outline-none transition-all shadow-sm select-none",
    otpStatus === "error"
      ? "border-destructive focus:border-destructive focus:ring-destructive/10"
      : "border-border/80 focus:border-primary focus:ring-primary/5",
  ].join(" ");

  // Initials for existing session avatar
  const initials = existingSession?.name
    ? existingSession.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen w-full flex bg-white overflow-hidden">
      {/* ── Left Side: Brand panel (desktop only) ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary overflow-hidden items-center justify-center">
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <div
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-50 grayscale contrast-125"
            style={{ backgroundImage: `url(${bgImage})` }}
          />
        </div>
        <div className="absolute inset-0 bg-linear-to-br from-primary/80 via-primary/40 to-black/60 z-10" />
        <div className="relative z-20 p-12 w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-black/20 backdrop-blur-md border border-white/10 p-10 rounded-[40px] shadow-2xl"
          >
            <div className="h-20 w-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 grid place-items-center mb-8 shadow-2xl">
              <img src={companyLogo} alt="BOT" className="h-14 w-14 object-contain" />
            </div>
            <h1 className="text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Manage your workforce <br />
              <span className="text-white/60">with precision.</span>
            </h1>
            <p className="text-lg text-white/80 mb-12 leading-relaxed font-medium max-w-md">
              The next generation HRMS platform designed for modern enterprises.
              Be On Time, every time.
            </p>
            <div className="grid grid-cols-2 gap-8">
              {[
                { icon: CheckCircle2, label: "Secure Auth" },
                { icon: Clock, label: "Real-time Tracking" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 text-white/90">
                  <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 shadow-xl">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-bold tracking-wide uppercase">{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl z-0"
        />
      </div>

      {/* ── Right Side: Login form ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-background relative min-h-screen">
        <div className="lg:hidden absolute inset-0 bg-primary/5 -z-10" />
        <div className="lg:hidden absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex justify-center mb-10">
            <div className="h-16 w-16 rounded-2xl bg-white shadow-xl grid place-items-center p-2 border border-border/40">
              <img src={companyLogo} alt="BOT" className="h-12 w-12" />
            </div>
          </div>

          <div className="mb-10 text-center">
            <h2 className="text-4xl font-extrabold tracking-tight text-foreground mb-3">
              Welcome Back
            </h2>
            <p className="text-muted-foreground font-medium text-lg">
              {step === "session" ? "You're already signed in" : "Please enter your details to sign in"}
            </p>
          </div>

          <div className="bg-white/50 backdrop-blur-sm lg:bg-transparent rounded-3xl p-0">
            <AnimatePresence mode="wait">

              {/* ── Step 0: Already logged in ─────────────────────────────── */}
              {step === "session" && existingSession && (
                <motion.div
                  key="session"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 max-w-sm mx-auto"
                >
                  {/* Avatar card */}
                  <div className="bg-primary/5 rounded-2xl p-6 text-center border border-primary/10 shadow-inner space-y-3">
                    <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center text-2xl font-extrabold text-primary mx-auto border-2 border-primary/20">
                      {initials}
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground text-xl">{existingSession.name}</p>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">
                        {roleLabel(existingSession.role)}
                        {existingSession.companyName ? ` · ${existingSession.companyName}` : ""}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 font-medium">{existingSession.phone}</p>
                  </div>

                  {/* Continue button */}
                  <Button
                    className="w-full h-14 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-xl shadow-primary/20 text-base font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                    onClick={() => navigate({ to: roleDashboard(existingSession.role) })}
                  >
                    <User className="h-5 w-5" />
                    Continue to Dashboard
                  </Button>

                  <div className="flex items-center gap-2">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest px-2">or</span>
                    <div className="h-px bg-border flex-1" />
                  </div>

                  {/* Switch account */}
                  <button
                    type="button"
                    onClick={() => {
                      clearSession();
                      setExistingSession(null);
                      setStep("phone");
                    }}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-destructive/30 text-destructive hover:bg-destructive/5 text-sm font-bold transition-all"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out &amp; login as someone else
                  </button>
                </motion.div>
              )}

              {/* ── Step 1: Phone ─────────────────────────────────────────── */}
              {step === "phone" && (
                <motion.form
                  key="phone"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onSubmit={handleSendOtp}
                  className="space-y-6"
                  noValidate
                >
                  {logoutReason === "another_device" && (
                    <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-orange-800">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-500" />
                      <p className="text-xs font-semibold leading-relaxed">
                        You were signed out because your account was logged in on another device.
                      </p>
                    </div>
                  )}

                  {logoutReason === "inactive" && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-800">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                      <p className="text-xs font-semibold leading-relaxed">
                        {inactiveMessage
                          ? inactiveMessage
                          : `${inactiveName ? `${inactiveName}'s account` : "This account"} has been deactivated. Please contact your administrator.`}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label
                      htmlFor="phone"
                      className="text-sm font-bold text-muted-foreground/80 block tracking-widest"
                    >
                      Phone Number
                    </Label>
                    <div className="relative group max-w-sm mx-auto">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors border-r border-border/60 pr-3">
                        <Phone className="h-4 w-4" />
                        <span className="text-sm font-bold">+91</span>
                      </div>
                      <Input
                        id="phone"
                        ref={phoneRef}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="88888 88888"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="pl-[85px] pr-4 sm:pl-24 sm:pr-24 h-14 sm:h-16 text-[18px] sm:text-[28px] rounded-2xl border-border/80 focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all shadow-sm text-center font-bold tracking-widest sm:tracking-[0.25em]"
                        maxLength={10}
                        aria-describedby="phone-hint"
                      />
                    </div>
                    <p id="phone-hint" className="sr-only">
                      Enter your 10-digit Indian mobile number. Country code +91 is pre-filled.
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto">
                    <Button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="w-full h-14 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-xl shadow-primary/20 text-base font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Sending OTP…</span>
                        </>
                      ) : (
                        <>
                          Continue to OTP <ArrowRight className="h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 justify-center py-2">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest px-2">
                      Secure Access
                    </span>
                    <div className="h-px bg-border flex-1" />
                  </div>

                  <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    Encrypted end-to-end verification
                  </p>
                </motion.form>
              )}

              {/* ── Step 2: OTP ───────────────────────────────────────────── */}
              {step === "otp" && (
                <motion.form
                  key="otp"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onSubmit={handleVerify}
                  className="space-y-6 max-w-sm mx-auto"
                  noValidate
                >
                  <div className="bg-primary/5 rounded-2xl p-6 text-center border border-primary/10 shadow-inner">
                    <p className="text-sm text-muted-foreground mb-2 font-medium uppercase tracking-widest">
                      OTP sent to
                    </p>
                    <p className="font-extrabold text-primary text-2xl tracking-tighter">
                      +91 {maskPhone(phone.replace(/\D/g, ""))}
                    </p>
                  </div>

                  {/* Dynamic OTP hint */}
                  <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-800">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="text-xs font-semibold">
                      Your OTP: <span className="font-extrabold tracking-widest text-sm">{generatedOtp}</span>
                    </span>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm font-bold text-muted-foreground/80 block text-center uppercase tracking-widest">
                      Verification Code
                    </Label>

                    <AnimatePresence>
                      {otpStatus === "error" && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-sm text-destructive text-center font-semibold"
                          role="alert"
                        >
                          Incorrect code — please try again
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <div
                      className="flex justify-center gap-2 sm:gap-3"
                      role="group"
                      aria-label="6-digit verification code"
                    >
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => { inputsRef.current[i] = el; }}
                          autoFocus={i === 0}
                          type="text"
                          inputMode="numeric"
                          value={digit}
                          aria-label={`OTP digit ${i + 1}`}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          onPaste={i === 0 ? handleOtpPaste : undefined}
                          className={otpInputClass}
                        />
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    aria-busy={loading}
                    className="w-full h-14 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-xl shadow-primary/20 text-base font-bold rounded-2xl transition-all active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify & Sign In"}
                  </Button>

                  <div className="flex flex-col items-center gap-4 px-1">
                    {resendIn > 0 ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-bold bg-muted/30 px-4 py-1.5 rounded-full">
                        <Clock className="h-4 w-4 text-primary" />
                        Resend in <span className="text-foreground">{resendIn}s</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        className="text-sm text-primary font-bold hover:underline bg-primary/5 px-6 py-2 rounded-full transition-all hover:bg-primary/10"
                      >
                        Resend OTP
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleGoBack}
                      className="text-sm text-muted-foreground hover:text-primary font-bold transition-colors underline underline-offset-4"
                    >
                      Change phone number
                    </button>
                  </div>
                </motion.form>
              )}

            </AnimatePresence>
          </div>

          <div className="mt-20 pt-8 border-t border-border/40 text-center lg:text-left">
            <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              © {new Date().getFullYear()} BE ON TIME (BOT) Platform
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
