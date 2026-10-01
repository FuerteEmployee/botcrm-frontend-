import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { useLeaveService, useLeaveBalances, describeBalancePeriod, formatLeaveSpan, type Leave } from "@/services/leave-service";
import {
  CheckCircle, XCircle, Clock, Plus, AlertCircle, RefreshCw, Info, X
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CenterModal } from "@/components/shared/center-modal";
import { LoadError } from "@/components/user/load-error";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { isNativeApp } from "@/lib/geolocation";

export const Route = createFileRoute("/user/leaves")({
  component: UserLeaves,
});

const GRADIENTS = [
  "from-emerald-600 to-teal-500",
  "from-blue-600 to-indigo-500",
  "from-purple-600 to-[#501537]",
  "from-amber-600 to-[#7b4611]",
  "from-rose-600 to-pink-500",
  "from-cyan-600 to-sky-500",
];

// Word, icon and colour together, so a status reads even to someone who does
// not read the word. The pill used to be 8.5px text in emerald-500 on white --
// too small and too faint to tell Approved from Pending at a glance.
const STATUS = {
  approved: {
    label: "Approved",
    icon: CheckCircle,
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    stripe: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    pill: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    stripe: "bg-rose-500",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    pill: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    stripe: "bg-amber-500",
  },
} as const;
const statusMeta = (status: string) => STATUS[status as keyof typeof STATUS] ?? STATUS.pending;

/** "0.5 day", "1 day", "7.5 days". */
const fmtDays = (n: number) => `${n} ${n > 1 || n === 0 ? "days" : "day"}`;

const appliedOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type FieldErrors = Partial<Record<"type" | "start" | "end" | "reason", string>>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p data-leave-error className="flex items-start gap-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function UserLeaves() {
  const [open, setOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // How much time off is being asked for. "half" and "single" are both one
  // date, so the End Date field is hidden for them and endDate is kept equal
  // to startDate -- the server requires startDate === endDate for a half day
  // and would otherwise reject a stale endDate left over from a range.
  const [mode, setMode] = useState<"half" | "single" | "range">("single");
  const [halfPortion, setHalfPortion] = useState<"first_half" | "second_half">("first_half");
  const [description, setDescription] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [cancelTarget, setCancelTarget] = useState<Leave | null>(null);
  // isCreating only flips on the next render, and a thumb double-press on a
  // slow phone can land both taps before that. A ref blocks the second at once.
  const submittingRef = useRef(false);

  const queryClient = useQueryClient();
  const {
    leaveTypes, hasData: typesLoaded, error: typesError,
    isError: typesFailed, isFetching: typesFetching, refetch: refetchTypes,
  } = useLeaveTypeService();
  const {
    leaves, hasData: leavesLoaded, isLoading: isLeavesLoading, isError: leavesFailed, error: leavesError,
    isFetching: leavesFetching, refetch: refetchLeaves,
    createLeave, isCreating, deleteLeave, isDeleting,
  } = useLeaveService();

  // Keep a valid type selected: the first one by default, and a fresh pick if
  // the admin deletes the one that was selected.
  useEffect(() => {
    if (leaveTypes.length === 0) return;
    if (!leaveTypeId || !leaveTypes.some((t) => t._id === leaveTypeId)) {
      setLeaveTypeId(leaveTypes[0]._id);
    }
  }, [leaveTypes, leaveTypeId]);

  // Coming back to the app shows the admin's latest decision. A WebView gets no
  // window-focus event on resume (and focus refetching is off app-wide), so an
  // employee waiting on an approval kept seeing "Pending" until they restarted.
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    let removeAppListener: (() => void) | undefined;
    let disposed = false;
    if (isNativeApp()) {
      import("@capacitor/app")
        .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); }))
        .then((h) => { if (disposed) void h.remove(); else removeAppListener = () => void h.remove(); })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [queryClient]);

  // Quota, computed by the server for the company's balance period (for ever,
  // this calendar year, or this financial year -- the admin's choice). It used
  // to be summed here from the leave list, which could only ever mean "for
  // ever" and would have drifted from any other screen showing a balance.
  // Pending requests are still held against the balance; they are only listed
  // separately so "left" is explained.
  const {
    period: balancePeriod, balances: serverBalances, hasData: balancesLoaded, isLoading: isBalancesLoading,
    isError: balancesError, error: balancesErr, isFetching: balancesFetching, refetch: refetchBalances,
  } = useLeaveBalances();
  const periodText = describeBalancePeriod(balancePeriod);
  const balances = serverBalances.map((b, index) => ({
    id: b.leaveTypeId,
    title: b.leaveName,
    total: b.total,
    pending: b.pending,
    remaining: b.remaining,
    bg: GRADIENTS[index % GRADIENTS.length],
  }));
  // Never show a balance from a failed load: an empty list would read as the
  // full quota being available.
  const balancesFailed = (typesFailed && !typesLoaded) || (balancesError && !balancesLoaded);
  const retryAll = () => { void refetchTypes(); void refetchBalances(); };
  const noLeaveTypes = typesLoaded && leaveTypes.length === 0;
  const selectedBalance = balancesLoaded ? balances.find((b) => b.id === leaveTypeId) : undefined;
  const leftWord = periodText ? ` ${periodText.short}` : "";

  // One date for everything but a range, so a half day can never be submitted
  // with an endDate the server will refuse.
  useEffect(() => {
    if (mode !== "range") setEndDate(startDate);
  }, [mode, startDate]);

  const onStartChange = (value: string) => {
    setStartDate(value);
    setErrors((e) => ({ ...e, start: undefined, end: undefined }));
    // Moving the first day past the last day drags the last day along, rather
    // than leaving a range the server refuses and a person has to untangle.
    if (mode === "range" && endDate && value && endDate < value) setEndDate(value);
  };

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setDescription("");
    setMode("single");
    setHalfPortion("first_half");
    setErrors({});
  };

  // Everything checked here is also checked by the server; checking first puts
  // the message next to the field it is about, in words, instead of in a toast.
  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!leaveTypeId) e.type = "Please choose a leave type.";
    if (!startDate) e.start = mode === "range" ? "Please pick the first day of leave." : "Please pick a date.";
    if (mode === "range") {
      if (!endDate) e.end = "Please pick the last day of leave.";
      else if (startDate && endDate < startDate) e.end = "The last day cannot be before the first day.";
    }
    if (!description.trim()) e.reason = "Please write why you need leave.";
    return e;
  };

  const submit = async () => {
    if (submittingRef.current || isCreating) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // On a short screen the first problem can be scrolled out of view.
      requestAnimationFrame(() => {
        document.querySelector("[data-leave-error]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }
    submittingRef.current = true;
    try {
      await createLeave({
        leaveTypeId,
        startDate,
        endDate: mode === "range" ? endDate : startDate,
        reason: description.trim(),
        dayPortion: mode === "half" ? halfPortion : "full",
      });
      setOpen(false);
      resetForm();
    } catch {
      // toast already shown by the service; the form stays filled in so nothing
      // typed is lost and the person can fix the dates and send again
    } finally {
      submittingRef.current = false;
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await deleteLeave(cancelTarget._id);
    } catch {
      // toast shown by the service, and the list refetches either way
    }
    setCancelTarget(null);
  };

  const labelClass = "text-sm font-semibold text-slate-700 dark:text-slate-200";

  return (
    <div className="w-full space-y-6">

      {/* Page Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">My Leave</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ask for time off and see if it is approved.</p>
        </div>

        {/* Disabled until there is a type to pick. The card below says why --
            still loading, could not load, or none set up by the admin -- where
            an open form with an empty list would only have been a dead end. */}
        <Button
          onClick={() => setOpen(true)}
          disabled={!typesLoaded || noLeaveTypes}
          className="w-full sm:w-auto bg-gradient-primary hover:opacity-95 text-white font-bold rounded-2xl h-12 px-5 border-none shadow-md shadow-primary/20 text-base gap-2 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Plus className="h-5 w-5" />
          <span>Apply for Leave</span>
        </Button>
      </div>

      {/* Leave balance cards */}
      <section aria-label="Leave balance" className="space-y-3">
        <div className="text-left">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">Leave balance</h3>
          {/* Said once, above the cards it applies to. Nothing is shown for a
              lifetime balance: there is no period to explain. */}
          {periodText && !balancesFailed && (
            <p data-balance-period className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400 leading-snug">
              {periodText.label}. Starts again on {periodText.startsAgain}.
            </p>
          )}
        </div>
        <div className={cn("grid gap-3 sm:gap-4 md:gap-5", balances.length > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1")}>
          {balancesFailed ? (
            // Both lists used to fall back to [] on failure, so a dropped
            // connection read as "No Leave Types Configured" and the balance was
            // computed from nothing: the full quota shown as available.
            <div className="col-span-full">
              <LoadError
                what="your leave balance"
                error={typesFailed && !typesLoaded ? typesError : balancesErr}
                onRetry={retryAll}
                retrying={typesFetching || balancesFetching}
              />
            </div>
          ) : !typesLoaded || (!balancesLoaded && isBalancesLoading) ? (
            <div className="col-span-full grid grid-cols-2 gap-3 animate-pulse" aria-label="Loading">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div key={idx} className="h-[120px] rounded-2xl bg-slate-200 dark:bg-slate-800/40" />
              ))}
            </div>
          ) : noLeaveTypes ? (
            <div className="col-span-full flex flex-col items-center justify-center py-10 px-4 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] border border-slate-100/50 dark:border-white/5">
              <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-base font-bold text-slate-600 dark:text-slate-300">No leave types yet</p>
              <p className="text-sm text-slate-500 mt-1">Your admin has not set up leave yet. Please ask your admin.</p>
            </div>
          ) : (
            balances.map((b) => (
              <Card key={b.id} className="border border-white/10 dark:border-white/5 overflow-hidden shadow-md relative rounded-2xl sm:rounded-3xl">
                <div className={`absolute inset-0 bg-gradient-to-br ${b.bg} opacity-90`} />
                <div className="absolute inset-0 bg-radial-at-t from-white/15 to-transparent pointer-events-none" />
                <CardContent className="p-3.5 sm:p-5 md:p-6 text-white relative z-10 space-y-2 text-left">
                  <p className="text-[13px] font-semibold leading-snug line-clamp-2 opacity-95">{b.title}</p>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl md:text-4xl font-bold tracking-tight leading-none">{b.remaining}</span>
                    <span className="text-sm font-semibold opacity-90">{b.remaining > 1 || b.remaining === 0 ? "days left" : "day left"}</span>
                  </div>

                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    {/* Empty, not full, when no days are given: a full bar next
                        to "0 days left" read as plenty available. */}
                    <div
                      className="h-full bg-white rounded-full transition-all duration-500"
                      style={{ width: `${b.total > 0 ? (b.remaining / b.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs font-medium opacity-90">Out of {fmtDays(b.total)}{leftWord}</p>
                  {b.pending > 0 && (
                    <p className="text-xs font-medium opacity-90 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {fmtDays(b.pending)} waiting for approval
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* The employee's own requests, newest first */}
      <section aria-label="My leave requests" className="max-w-4xl mx-auto space-y-3">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 text-left">My requests</h3>

        {leavesFailed && !leavesLoaded ? (
          <LoadError what="your leave requests" error={leavesError} onRetry={() => void refetchLeaves()} retrying={leavesFetching} />
        ) : isLeavesLoading ? (
          <div className="space-y-3.5 animate-pulse" aria-label="Loading">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[100px]" />
            ))}
          </div>
        ) : leaves.length > 0 ? (
          <div className="space-y-3.5">
            {leaves.map((leave) => {
              const meta = statusMeta(leave.status);
              const StatusIcon = meta.icon;
              return (
                <motion.div
                  key={leave._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 pl-5 bg-white/80 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] shadow-xs border border-slate-100/50 dark:border-white/5 relative overflow-hidden text-left"
                >
                  <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-r-full", meta.stripe)} />

                  {/* The status pill shares a row only with the short type chip,
                      and min-w-0 lets that chip shrink. The pill used to sit
                      beside the reason, and one long unbroken word in it pushed
                      the pill off the right edge of the screen. */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {leave.leaveTypeId?.leaveName || "Leave"}
                    </span>
                    <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold", meta.pill)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </div>

                  <h4 className="mt-2 text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    {formatLeaveSpan(leave)}
                  </h4>

                  {leave.reason && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed break-words [overflow-wrap:anywhere]">
                      {leave.reason}
                    </p>
                  )}

                  {/* Why it was rejected, when the admin said. Other decisions
                      can carry a note too; that keeps its neutral label. */}
                  {leave.adminRemark?.trim() && (leave.status === "rejected" ? (
                    <div data-reject-reason className="mt-3 p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                      <p className="text-sm text-rose-900 dark:text-rose-200 break-words [overflow-wrap:anywhere]">
                        <span className="font-bold">Reason: </span>{leave.adminRemark}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="block text-xs font-bold text-[#501537] dark:text-[#e7a6c8] mb-0.5">Note from admin</span>
                      <span className="block text-sm text-slate-700 dark:text-slate-300 break-words [overflow-wrap:anywhere]">{leave.adminRemark}</span>
                    </div>
                  ))}

                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Applied on {appliedOn(leave.createdAt)}</span>
                    {/* Only while it is still waiting: once decided, it is the
                        admin's to change. The server enforces the same rule. */}
                    {leave.status === "pending" && (
                      <Button
                        variant="outline"
                        onClick={() => setCancelTarget(leave)}
                        className="h-10 rounded-xl px-3.5 text-sm font-semibold gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                      >
                        <X className="h-4 w-4" />
                        Cancel request
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md border border-slate-100/50 dark:border-white/5 rounded-[24px]">
            <Info className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">You have not applied for leave yet.</p>
            {!noLeaveTypes && <p className="text-sm text-slate-500 mt-1">Tap "Apply for Leave" above to ask for time off.</p>}
          </div>
        )}
      </section>

      {/* Apply Leave Dialog */}
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setErrors({}); }}>
        {/* Height-capped with only the middle scrolling. It used to be
            overflow-hidden at its natural height, so on a small phone -- or any
            phone with the keyboard up -- the title and the Submit button sat
            off-screen with no way to scroll to them. The [&>button.absolute]
            rules pad the dialog's built-in close X from a 16px icon to a 40px
            tap target without editing the shared ui/dialog. */}
        <DialogContent className="flex flex-col gap-0 p-0 max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 dark:bg-slate-900 text-left [&>button.absolute]:p-3 [&>button.absolute]:right-1.5 [&>button.absolute]:top-1.5 [&>button.absolute]:rounded-full">
          <DialogHeader className="text-left px-5 pt-5 pb-3 pr-12 shrink-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Apply for Leave
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Your weekly off days and holidays are not counted.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 space-y-5 text-left">
            <div className="space-y-2">
              <Label className={labelClass}>Leave type</Label>
              <Select value={leaveTypeId} onValueChange={(v) => { setLeaveTypeId(v); setErrors((e) => ({ ...e, type: undefined })); }}>
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-12 text-base">
                  <SelectValue placeholder="Choose leave type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {leaveTypes.map((type) => (
                    <SelectItem key={type._id} value={type._id} className="py-3 text-base">
                      {type.leaveName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBalance && (selectedBalance.remaining > 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">You have {fmtDays(selectedBalance.remaining)} left{leftWord}.</p>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  You have no {selectedBalance.title} left{leftWord}. You can still apply — your admin will decide.
                </p>
              ))}
              <FieldError message={errors.type} />
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>How long?</Label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60" role="radiogroup" aria-label="How long">
                {([
                  { key: "half", label: "Half day" },
                  { key: "single", label: "One day" },
                  { key: "range", label: "Many days" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={mode === opt.key}
                    onClick={() => { setMode(opt.key); setErrors((e) => ({ ...e, start: undefined, end: undefined })); }}
                    className={cn(
                      "h-11 rounded-lg text-sm font-bold transition-all",
                      mode === opt.key
                        ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "half" && (
              <div className="space-y-2">
                <Label className={labelClass}>Which half?</Label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60" role="radiogroup" aria-label="Which half">
                  {([
                    { key: "first_half", label: "First half", hint: "Morning off" },
                    { key: "second_half", label: "Second half", hint: "Afternoon off" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={halfPortion === opt.key}
                      onClick={() => setHalfPortion(opt.key)}
                      className={cn(
                        "min-h-[52px] rounded-lg px-2 py-1.5 transition-all flex flex-col items-center justify-center",
                        halfPortion === opt.key
                          ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className="text-xs font-medium opacity-80">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* dark:[color-scheme:dark] makes the native date picker and its
                calendar icon follow the theme; otherwise the icon is black on
                the dark field and the picker opens blinding white. */}
            <div className={cn("gap-3", mode === "range" ? "grid grid-cols-2" : "grid grid-cols-1")}>
              <div className="space-y-2 min-w-0">
                <Label htmlFor="leave-start" className={labelClass}>
                  {mode === "range" ? "First day" : "Date"}
                </Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartChange(e.target.value)}
                  aria-invalid={!!errors.start}
                  className="rounded-xl border-slate-200 dark:border-slate-800 dark:[color-scheme:dark] h-12 text-base px-3 focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
              {mode === "range" && (
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="leave-end" className={labelClass}>Last day</Label>
                  <Input
                    id="leave-end"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => { setEndDate(e.target.value); setErrors((er) => ({ ...er, end: undefined })); }}
                    aria-invalid={!!errors.end}
                    className="rounded-xl border-slate-200 dark:border-slate-800 dark:[color-scheme:dark] h-12 text-base px-3 focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
              )}
            </div>
            {(errors.start || errors.end) && (
              <div className="space-y-1 -mt-2">
                <FieldError message={errors.start} />
                <FieldError message={errors.end} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="leave-reason" className={labelClass}>Reason</Label>
              <Textarea
                id="leave-reason"
                placeholder="Example: Going to my village for a wedding"
                value={description}
                maxLength={500}
                // The keyboard opens after focus and shrinks the viewport, which
                // can leave this box hidden under the pinned buttons. Scroll it
                // back into view once the resize has happened.
                onFocus={(e) => {
                  const el = e.currentTarget;
                  window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
                }}
                onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, reason: undefined })); }}
                aria-invalid={!!errors.reason}
                className="rounded-xl border-slate-200 dark:border-slate-800 min-h-[84px] text-base px-3 focus-visible:ring-1 focus-visible:ring-primary"
              />
              <FieldError message={errors.reason} />
            </div>
          </div>

          {/* Outside the scroll area, so the buttons are always on screen. */}
          <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl h-12 text-base font-semibold"
            >
              Close
            </Button>
            <Button
              onClick={submit}
              disabled={isCreating}
              className="flex-[1.4] bg-gradient-primary text-white font-bold rounded-xl h-12 border-none shadow-md shadow-primary/20 text-base gap-2"
            >
              {isCreating ? (<><RefreshCw className="h-4 w-4 animate-spin" /> Sending…</>) : "Send request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm before taking a request back: it cannot be undone from here. */}
      {cancelTarget && (
        <CenterModal
          onClose={() => { if (!isDeleting) setCancelTarget(null); }}
          labelledBy="cancel-leave-title"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={isDeleting}
                className="flex-1 h-12 rounded-xl px-4 text-[15px] font-semibold text-slate-700 border border-slate-200 dark:text-slate-200 dark:border-white/10 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
              >
                No, keep it
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={isDeleting}
                className="flex-1 h-12 rounded-xl px-4 text-[15px] font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20 disabled:opacity-60"
              >
                {isDeleting ? "Cancelling…" : "Yes, cancel it"}
              </button>
            </div>
          }
        >
          <div className="pr-8 text-left space-y-2">
            <h3 id="cancel-leave-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">Cancel this leave request?</h3>
            <p className="text-[15px] font-semibold text-slate-700 dark:text-slate-200">
              {cancelTarget.leaveTypeId?.leaveName || "Leave"}: {formatLeaveSpan(cancelTarget)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              The request will be removed. You can apply again later if you need to.
            </p>
          </div>
        </CenterModal>
      )}
    </div>
  );
}
