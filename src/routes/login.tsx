import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  Loader2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  LogOut,
  User,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSession, getSession } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { logoutAndClear } from "@/lib/logout";
import { panelHomeFor } from "@/lib/panel-home";
import { isNativeApp } from "@/lib/geolocation";
import { toast } from "sonner";
import logo from "@/assets/bot-logo.png";
import bgImage from "@/assets/login-bg.png";
import { apiClient } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const RESEND_SECONDS = 30;
const EMPTY_OTP = ["", "", "", "", "", ""];

/**
 * The 10-digit number from whatever was typed or pasted. People paste
 * "+91 98765 43210" or "098765 43210"; keeping only the first ten digits of
 * those gave "9198765432", a different (usually unregistered) number.
 * The server normalises the same way, so both sides agree.
 */
function normalizePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function formatPhone(digits: string) {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

function roleLabel(role: Session["role"]) {
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "subadmin") return "Sub-Admin";
  return "Employee";
}

// A sub-admin lands on the first page they may view, not always /dashboard:
// one without the dashboard right got a "no access" toast on every sign-in.
function roleDashboard(role: Session["role"], permissions?: Session["permissions"]) {
  if (role === "superadmin") return "/super/overview";
  if (role === "admin" || role === "subadmin") return panelHomeFor({ role, permissions });
  return "/user";
}

const firstName = (name?: string) => (name || "").trim().split(/\s+/)[0] || "";

type ApiError = {
  response?: {
    status?: number;
    data?: { code?: string; message?: unknown; name?: string; employeeName?: string };
  };
};

/**
 * One sentence for a failed login call. Most people signing in read little
 * English, so: no response means the phone could not reach us (say so, plainly);
 * a gateway error means the server is down; a 4xx carries the server's own
 * sentence, written for people; anything else gets the caller's fallback,
 * never an exception's text.
 */
function plainError(error: unknown, fallback: string): string {
  const res = (error as ApiError)?.response;
  if (!res) return "Could not connect. Check your internet and try again.";
  const status = res.status ?? 0;
  if (status === 502 || status === 503 || status === 504) {
    return "The server is not answering right now. Please try again in a few minutes.";
  }
  const message = typeof res.data?.message === "string" ? res.data.message.trim() : "";
  if (status >= 400 && status < 500 && message) return message;
  return fallback;
}

/**
 * A refusal that is about the account or the company, not the code: shown as
 * a red notice on the phone step, because typing again will not help.
 */
function refusalNotice(error: unknown): string | null {
  const res = (error as ApiError)?.response;
  const data = res?.data;
  if (!data) return null;
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const code = data.code;
  if (
    code === "account_inactive" ||
    code === "company_inactive" ||
    code === "company_subscription" ||
    code === "inactive" ||
    code === "employee_inactive"
  ) {
    return message || "This account cannot sign in right now. Please contact your admin.";
  }
  if (res?.status === 403 && /inactive|deactivat|switched off/i.test(message)) return message;
  return null;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function dropStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

/** Why the last session ended, written by api-client's 401 handler. Read once. */
function takeLogoutNotice(): string | null {
  const reason = readStorage("bot_logout_reason");
  if (!reason) return null;
  const message = readStorage("bot_logout_message");
  dropStorage("bot_logout_reason");
  dropStorage("bot_logout_message");
  if (reason === "inactive")
    return message || "Your account has been switched off. Please contact your admin.";
  if (reason === "another_device")
    return "You were signed out because your account was signed in on another phone.";
  return null;
}

function LoginPage() {
  const navigate = useNavigate();

  const [existingSession, setExistingSession] = useState<Session | null>(null);
  const [step, setStep] = useState<"session" | "phone" | "otp">("phone");
  const stepRef = useRef(step);
  stepRef.current = step;

  // A red notice on the phone step: the account or company cannot sign in.
  const [notice, setNotice] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [otpError, setOtpError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");

  const phoneRef = useRef<HTMLInputElement>(null);
  const sendBoxRef = useRef<HTMLDivElement>(null);
  const verifyBoxRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  // Blocks a second verify while one is in flight: the last digit auto-submits,
  // and a tap on the button a moment later used to send the same code again,
  // which then failed as "expired" on top of the successful sign-in.
  const submittingRef = useRef(false);

  useEffect(() => {
    const reason = takeLogoutNotice();
    if (reason) setNotice(reason);
    const s = getSession();
    if (s) {
      setExistingSession(s);
      setStep("session");
    }

    // The root route re-checks a stored session with the server on load. When
    // that session is dead (user deleted, switched off) the 401 handler clears
    // it -- this screen then must stop offering "Continue as ...".
    const onAuthChange = () => {
      if (getSession()) return;
      setExistingSession(null);
      setStep((st) => (st === "session" ? "phone" : st));
      const why = takeLogoutNotice();
      if (why) setNotice(why);
    };
    window.addEventListener("bot-auth-change", onAuthChange);
    return () => window.removeEventListener("bot-auth-change", onAuthChange);
  }, []);

  useEffect(() => {
    if (step === "phone") phoneRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Android's Back button. Without a handler, Capacitor went back in history --
  // from the OTP step that left the screen, and after a sign-out it could land
  // on a signed-in page that bounced straight back here. On the OTP step Back
  // returns to the number; otherwise the app goes to the background.
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let disposed = false;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          if (stepRef.current === "otp") {
            goBackToPhone();
            return;
          }
          void App.minimizeApp();
        }),
      )
      .then((h) => {
        if (disposed) void h.remove();
        else remove = () => void h.remove();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);

  // With the keyboard open a 600px phone has ~340px left, and the button sat
  // under the keyboard. Bring it into view once the keyboard has opened.
  const keepVisible = (el: HTMLElement | null) => {
    window.setTimeout(() => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
  };

  const companyLogo = existingSession?.companyLogo || logo;

  // ─── Send OTP ──────────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const digits = normalizePhoneInput(phone);
    if (digits.length !== 10) {
      setPhoneError("Please enter your 10-digit mobile number.");
      phoneRef.current?.focus();
      return;
    }
    setLoading(true);
    setNotice(null);
    setPhoneError("");
    try {
      const { data } = await apiClient.post("/users/login-request", { phone: digits });
      setSentPhone(digits);
      setGeneratedOtp(data.otp || "");
      setOtp(EMPTY_OTP);
      setOtpError("");
      setResendIn(RESEND_SECONDS);
      setStep("otp");
      setLiveMessage("OTP sent. Enter the 6-digit OTP.");
    } catch (error) {
      const refusal = refusalNotice(error);
      if (refusal) setNotice(refusal);
      else setPhoneError(plainError(error, "Could not send the OTP. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ───────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resending || loading || resendIn > 0) return;
    setResending(true);
    setOtpError("");
    try {
      const { data } = await apiClient.post("/users/login-request", { phone: sentPhone });
      setGeneratedOtp(data.otp || "");
      setOtp(EMPTY_OTP);
      setResendIn(RESEND_SECONDS);
      setLiveMessage("New OTP sent.");
      toast.success("New OTP sent");
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (error) {
      const refusal = refusalNotice(error);
      if (refusal) {
        setNotice(refusal);
        setStep("phone");
      } else {
        setOtpError(plainError(error, "Could not send a new OTP. Please try again."));
      }
    } finally {
      setResending(false);
    }
  };

  // ─── Core OTP submission ───────────────────────────────────────────────────
  const submitOtp = async (code: string) => {
    if (submittingRef.current) return;
    if (!/^\d{6}$/.test(code)) {
      setOtpError("Please enter all 6 numbers of the OTP.");
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setOtpError("");
    try {
      const { data } = await apiClient.post("/users/verify-otp", { phone: sentPhone, otp: code });

      setSession({
        phone: `+91 ${data.phone}`,
        name: data.name,
        role: data.role,
        adminId: data.adminId,
        companyName: data.companyName,
        companyLogo: data.companyLogo,
        address: data.address,
        email: data.email,
        token: data.token,
        loggedInAt: Date.now(),
        permissions: data.permissions,
      });

      setLiveMessage("Signed in.");
      toast.success(firstName(data.name) ? `Welcome, ${firstName(data.name)}!` : "Welcome!");
      navigate({ to: roleDashboard(data.role, data.permissions) });
    } catch (error) {
      const refusal = refusalNotice(error);
      if (refusal) {
        setNotice(refusal);
        setStep("phone");
        setOtp(EMPTY_OTP);
        return;
      }
      const code = (error as ApiError)?.response?.data?.code;
      // A dead code cannot be retried: offer a new one straight away.
      if (code === "otp_locked" || code === "otp_expired") setResendIn(0);
      setOtp(EMPTY_OTP);
      const text = plainError(error, "Could not sign you in. Please try again.");
      setOtpError(text);
      setLiveMessage(text);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  // ─── OTP boxes ────────────────────────────────────────────────────────────
  const fillOtp = (start: number, text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    // A whole code always means the whole code, wherever it was dropped.
    const from = digits.length === 6 ? 0 : start;
    const next = [...otp];
    for (let i = 0; i < digits.length && from + i < 6; i++) next[from + i] = digits[i];
    setOtp(next);
    setOtpError("");
    const firstEmpty = next.findIndex((d) => d === "");
    inputsRef.current[firstEmpty === -1 ? 5 : firstEmpty]?.focus();
    if (next.every((d) => d !== "")) submitOtp(next.join(""));
  };

  const handleOtpChange = (index: number, value: string) => {
    let digits = value.replace(/\D/g, "");
    if (value && !digits) return; // a letter: ignore it
    const old = otp[index];
    // Typing over a filled box gives two characters: keep the new one.
    if (old && digits.length === 2) digits = digits[0] === old ? digits[1] : digits[0];
    // Keyboard OTP suggestions and autofill drop the whole code into one box.
    if (digits.length > 1) {
      fillOtp(index, digits);
      return;
    }
    const next = [...otp];
    next[index] = digits;
    setOtp(next);
    setOtpError("");
    if (digits && index < 5) inputsRef.current[index + 1]?.focus();
    if (digits && next.every((d) => d !== "")) submitOtp(next.join(""));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      e.preventDefault();
      const next = [...otp];
      next[index - 1] = "";
      setOtp(next);
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleOtpPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fillOtp(index, e.clipboardData.getData("text"));
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    submitOtp(otp.join(""));
  };

  function goBackToPhone() {
    setStep("phone");
    setOtp(EMPTY_OTP);
    setOtpError("");
  }

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // Through the server, so the access log records the sign-out.
    await logoutAndClear();
    setSigningOut(false);
    setExistingSession(null);
    setStep("phone");
  };

  const otpInputClass = [
    "h-12 w-10 sm:h-14 sm:w-12 rounded-xl border bg-white text-center text-xl font-extrabold text-foreground",
    "focus:ring-4 outline-none transition-all shadow-sm disabled:opacity-60",
    otpError
      ? "border-destructive focus:border-destructive focus:ring-destructive/10"
      : "border-border/80 focus:border-primary focus:ring-primary/5",
  ].join(" ");

  const initials = existingSession?.name
    ? existingSession.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  const heading = step === "session" ? "Welcome back" : step === "otp" ? "Enter OTP" : "Sign in";
  const subheading =
    step === "session"
      ? "You are already signed in on this phone."
      : step === "otp"
        ? "Type the 6-digit OTP shown below."
        : "Enter your mobile number to get an OTP.";

  return (
    <div className="min-h-[100dvh] w-full flex bg-white overflow-x-hidden">
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
              The next generation HRMS platform designed for modern enterprises. Be On Time, every
              time.
            </p>
            <div className="grid grid-cols-2 gap-8">
              {[
                { icon: CheckCircle2, label: "Phone + OTP sign-in" },
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
      <div className="w-full lg:w-1/2 flex items-start sm:items-center justify-center px-4 pt-8 pb-6 sm:p-12 bg-background relative min-h-[100dvh] overflow-hidden">
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
          <div className="lg:hidden flex justify-center mb-5 sm:mb-10">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white shadow-xl grid place-items-center p-2 border border-border/40">
              <img
                src={companyLogo}
                alt="BOT"
                className="h-10 w-10 sm:h-12 sm:w-12 object-contain"
              />
            </div>
          </div>

          <div className="mb-6 sm:mb-10 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2">
              {heading}
            </h2>
            <p className="text-muted-foreground font-medium text-base sm:text-lg">{subheading}</p>
          </div>

          <div className="bg-white/50 backdrop-blur-sm lg:bg-transparent rounded-3xl p-0">
            <AnimatePresence mode="wait">
              {/* ── Step 0: Already signed in ─────────────────────────────── */}
              {step === "session" && existingSession && (
                <motion.div
                  key="session"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-5 max-w-sm mx-auto"
                >
                  <div className="bg-primary/5 rounded-2xl p-5 text-center border border-primary/10 shadow-inner space-y-3">
                    <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center text-2xl font-extrabold text-primary mx-auto border-2 border-primary/20">
                      {initials}
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground text-xl break-words">
                        {existingSession.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">
                        {roleLabel(existingSession.role)}
                        {existingSession.companyName ? ` · ${existingSession.companyName}` : ""}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {existingSession.phone}
                    </p>
                  </div>

                  <Button
                    className="w-full h-14 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-xl shadow-primary/20 text-base font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                    disabled={signingOut}
                    onClick={() =>
                      navigate({
                        to: roleDashboard(existingSession.role, existingSession.permissions),
                      })
                    }
                  >
                    <User className="h-5 w-5" />
                    {firstName(existingSession.name)
                      ? `Continue as ${firstName(existingSession.name)}`
                      : "Continue"}
                  </Button>

                  <div className="flex items-center gap-2">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest px-2">
                      or
                    </span>
                    <div className="h-px bg-border flex-1" />
                  </div>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    aria-busy={signingOut}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-destructive/30 text-destructive hover:bg-destructive/5 text-sm font-bold transition-all disabled:opacity-60"
                  >
                    {signingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    {signingOut ? "Signing out…" : "Sign out and use another number"}
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
                  className="space-y-5 max-w-sm mx-auto"
                  noValidate
                >
                  {notice && (
                    <div
                      role="alert"
                      className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-800"
                    >
                      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-500" />
                      <p className="text-sm font-semibold leading-relaxed">{notice}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-bold text-foreground/80 block">
                      Mobile number
                    </Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground group-focus-within:text-primary transition-colors border-r border-border/60 pr-3 pointer-events-none">
                        <Phone className="h-4 w-4" />
                        <span className="text-base font-bold">+91</span>
                      </div>
                      <Input
                        id="phone"
                        ref={phoneRef}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setPhone(normalizePhoneInput(raw));
                          setPhoneError(/[a-z]/i.test(raw) ? "Please type numbers only." : "");
                        }}
                        onFocus={() => keepVisible(sendBoxRef.current)}
                        aria-invalid={!!phoneError}
                        aria-describedby="phone-hint phone-error"
                        className={[
                          "pl-[92px] pr-4 h-14 sm:h-16 text-xl sm:text-2xl rounded-2xl focus:ring-4 focus:ring-primary/5 transition-all shadow-sm font-bold tracking-wider",
                          phoneError
                            ? "border-destructive"
                            : "border-border/80 focus:border-primary/40",
                        ].join(" ")}
                      />
                    </div>
                    {phoneError ? (
                      <p
                        id="phone-error"
                        role="alert"
                        className="text-sm font-semibold text-destructive"
                      >
                        {phoneError}
                      </p>
                    ) : (
                      <p
                        id="phone-hint"
                        className="text-[13px] text-muted-foreground leading-relaxed"
                      >
                        Use the number your company added for you.
                      </p>
                    )}
                  </div>

                  <div ref={sendBoxRef} className="scroll-mb-4">
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
                          Get OTP <ArrowRight className="h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
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
                  className="space-y-4 sm:space-y-5 max-w-sm mx-auto"
                  noValidate
                >
                  <div className="bg-primary/5 rounded-2xl px-4 py-2.5 text-center border border-primary/10 shadow-inner">
                    <p className="text-sm text-muted-foreground font-medium">
                      OTP for{" "}
                      <span className="font-extrabold text-primary text-lg tracking-tight whitespace-nowrap">
                        +91 {formatPhone(sentPhone)}
                      </span>
                    </p>
                  </div>

                  {/* No SMS gateway yet: the server returns the code and it is shown here. */}
                  {generatedOtp && (
                    <div className="flex flex-col items-center gap-0.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-900">
                      <span className="text-sm font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
                        Your OTP is
                      </span>
                      <span
                        className="font-extrabold tracking-[0.3em] text-2xl"
                        data-testid="shown-otp"
                      >
                        {generatedOtp}
                      </span>
                      <span className="text-[13px] text-amber-800/80">
                        It works for 10 minutes.
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-foreground/80 block text-center">
                      Type the OTP here
                    </Label>

                    <div
                      className="flex justify-center gap-2 sm:gap-3"
                      role="group"
                      aria-label="6-digit OTP"
                    >
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            inputsRef.current[i] = el;
                          }}
                          autoFocus={i === 0}
                          type="text"
                          inputMode="numeric"
                          autoComplete={i === 0 ? "one-time-code" : "off"}
                          pattern="[0-9]*"
                          value={digit}
                          disabled={loading}
                          aria-label={`OTP number ${i + 1}`}
                          aria-invalid={!!otpError}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          onPaste={(e) => handleOtpPaste(i, e)}
                          onFocus={(e) => {
                            e.currentTarget.select();
                            keepVisible(verifyBoxRef.current);
                          }}
                          className={otpInputClass}
                        />
                      ))}
                    </div>

                    <AnimatePresence>
                      {otpError && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-sm text-destructive text-center font-semibold leading-relaxed"
                          role="alert"
                        >
                          {otpError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div ref={verifyBoxRef} className="scroll-mb-4">
                    <Button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="w-full h-14 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-xl shadow-primary/20 text-base font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Signing in…</span>
                        </>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </div>

                  <div className="flex flex-col items-center gap-2 px-1">
                    {resendIn > 0 ? (
                      <div
                        className="flex items-center gap-2 h-11 text-sm text-muted-foreground font-bold px-4"
                        aria-live="off"
                      >
                        <Clock className="h-4 w-4 text-primary" />
                        Get a new OTP in{" "}
                        <span className="text-foreground tabular-nums">{resendIn}s</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resending || loading}
                        className="h-11 min-w-[160px] text-sm text-primary font-bold bg-primary/5 px-6 rounded-full transition-all hover:bg-primary/10 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                      >
                        {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {resending ? "Sending…" : "Send a new OTP"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={goBackToPhone}
                      disabled={loading}
                      className="h-11 px-4 text-sm text-muted-foreground hover:text-primary font-bold transition-colors underline underline-offset-4"
                    >
                      Change mobile number
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 sm:mt-20 pt-6 border-t border-border/40 text-center lg:text-left">
            <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">
              © {new Date().getFullYear()} BE ON TIME (BOT) Platform
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
