import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Plus,
  Info,
  RefreshCw,
  Calendar,
  LogIn,
  LogOut,
  HelpCircle,
  MessageSquareWarning,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { requestErrorMessage } from "@/services/request-error";
import { LoadError } from "@/components/user/load-error";
import { DIALOG_CLOSE_40 } from "@/components/pages/reject-reason-dialog";
import { isNativeApp } from "@/lib/geolocation";
import { cn } from "@/lib/utils";
import { TICKET_TYPE_LABELS, isCorrectionTicket, type Ticket } from "@/services/ticket-service";
import {
  PunchCorrectionFields,
  type PunchCorrectionValue,
} from "@/components/tickets/punch-correction-fields";
import { fmt12 } from "@/components/tickets/punch-correction-rules";

export const Route = createFileRoute("/user/tickets")({
  component: UserTickets,
});

type SupportTicket = Omit<Ticket, "employeeId">;

type NewTicketType = "ForgotPunchIn" | "ForgotPunchOut" | "Query" | "Complaint";

// Big, plain choices instead of a dropdown: a first-time user sees every
// option at once and taps one.
const NEW_TYPES: { value: NewTicketType; label: string; icon: typeof LogIn }[] = [
  { value: "ForgotPunchIn", label: "Forgot to punch in", icon: LogIn },
  { value: "ForgotPunchOut", label: "Forgot to punch out", icon: LogOut },
  { value: "Query", label: "Question for HR", icon: HelpCircle },
  { value: "Complaint", label: "Complaint", icon: MessageSquareWarning },
];

const PLACEHOLDERS: Record<string, string> = {
  ForgotPunchIn: "Example: I reached at 9:30 but the app did not open. (You can leave this empty.)",
  ForgotPunchOut:
    "Example: I left at 6:30 and forgot to press Punch Out. (You can leave this empty.)",
  Query: "Example: How many casual leaves do I have left?",
  Complaint: "Tell us what went wrong.",
};

// Match the server's limits, so the box stops rather than the server refusing.
const MAX_REASON = 2000;
const MAX_CORRECTION_REASON = 300;

const PUNCH_TYPES = ["ForgotPunchIn", "ForgotPunchOut", "Correction"];

const fmtDayLong = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      })
    : "";

/** The correction part of a punch ticket: what was punched, what was asked, and the answer. */
function CorrectionSummary({ ticket }: { ticket: SupportTicket }) {
  const c = ticket.correction;
  if (!c?.field) return null;
  const isIn = c.field === "punchIn";
  const noun = isIn ? "punch-in" : "punch-out";
  // What was actually applied: the admin may have approved an edited time.
  const applied =
    c.appliedTime ||
    (isIn ? ticket.regularization?.requestedPunchIn : ticket.regularization?.requestedPunchOut) ||
    c.requestedTime;
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
        For {fmtDayLong(c.date)}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
        <span className="text-slate-600 dark:text-slate-300">
          You {isIn ? "punched in" : "punched out"} at{" "}
          <b className="text-slate-900 dark:text-white">
            {c.recordedTime ? fmt12(c.recordedTime) : "no time"}
          </b>
        </span>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <span className="text-slate-600 dark:text-slate-300">
          you asked for <b className="text-slate-900 dark:text-white">{fmt12(c.requestedTime)}</b>
        </span>
      </div>
      {ticket.status === "approved" && (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[14px] font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Approved: your {noun} is now {fmt12(applied)}
        </p>
      )}
      {ticket.status === "rejected" && (
        <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[14px] font-bold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Not approved. Your {noun} stays {c.recordedTime ? fmt12(c.recordedTime) : "as it was"}.
        </p>
      )}
    </div>
  );
}

function UserTickets() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ticketType, setTicketType] = useState<NewTicketType>("ForgotPunchIn");
  // No pre-filled text: it made the Submit button live on an untouched form,
  // so empty tickets reached HR.
  const [description, setDescription] = useState<string>("");
  const [correction, setCorrection] = useState<PunchCorrectionValue | null>(null);
  // A ref, not state: a double tap fires both clicks before React re-renders
  // the button as disabled, and each click raised its own ticket.
  const submittingRef = useRef(false);

  const [ticketFilter, setTicketFilter] = useState<string>("all");

  const isCorrection = isCorrectionTicket(ticketType);
  const reasonMax = isCorrection ? MAX_CORRECTION_REASON : MAX_REASON;

  const {
    data: rawTickets,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<SupportTicket[]>({
    queryKey: ["user-tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets/my-tickets");
      return data;
    },
  });
  // A 200 that is not a list (captive portal, proxy page) must not blank the page.
  const tickets: SupportTicket[] = Array.isArray(rawTickets) ? rawTickets : [];

  // The admin answers from the office; show it when the app comes back to the
  // front. React Query's focus refetch is off app-wide and Capacitor sends no
  // focus event.
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    let removeAppListener: (() => void) | undefined;
    let disposed = false;
    if (isNativeApp()) {
      import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) refresh();
          }),
        )
        .then((h) => {
          if (disposed) void h.remove();
          else removeAppListener = () => void h.remove();
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [queryClient]);

  // Leave tickets go to the Leaves page.
  const supportTickets = tickets.filter((t) => t.type !== "Leave");

  const filteredTickets = supportTickets.filter((t) => {
    if (ticketFilter === "all") return true;
    if (ticketFilter === "punch") return PUNCH_TYPES.includes(t.type);
    return t.type.toLowerCase() === ticketFilter;
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const payload = isCorrection
        ? {
            type: ticketType,
            date: correction?.date,
            time: correction?.time,
            reason: description.trim(),
          }
        : { type: ticketType, reason: description.trim() };
      const { data } = await apiClient.post("/tickets", payload);
      return data;
    },
    onSuccess: () => {
      toast.success(
        isCorrection
          ? "Sent to your admin. You will see the answer here."
          : "Ticket sent to HR. You will see their reply here.",
      );
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-correction-context"] });
      setOpen(false);
      setDescription("");
    },
    onError: (err) => {
      const message = requestErrorMessage(err, "Your ticket could not be sent. Please try again.");
      if (message) toast.error(message);
      // The day may have changed meanwhile (another request, an approval).
      queryClient.invalidateQueries({ queryKey: ["ticket-correction-context"] });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const canSend = isCorrection
    ? !!correction && !correction.blocker && !!correction.time
    : !!description.trim();

  const submit = () => {
    if (submittingRef.current || createTicketMutation.isPending || !canSend) return;
    submittingRef.current = true;
    createTicketMutation.mutate();
  };

  const openNew = () => {
    setTicketType("ForgotPunchIn");
    setDescription("");
    setCorrection(null);
    setOpen(true);
  };

  const getStatusBadge = (t: SupportTicket) => {
    const punch = isCorrectionTicket(t.type);
    switch (t.status) {
      case "approved":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-none rounded-full text-[12px] font-bold px-2.5 py-0.5">
            {punch ? "Approved" : "Resolved"}
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 border-none rounded-full text-[12px] font-bold px-2.5 py-0.5">
            {punch ? "Not approved" : "Rejected"}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-none rounded-full text-[12px] font-bold px-2.5 py-0.5">
            Waiting
          </Badge>
        );
    }
  };

  const loadFailed = isError && tickets.length === 0;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Help Desk</h2>
          <p className="text-[13px] text-slate-500">
            Fix a missed punch, ask HR a question, or make a complaint.
          </p>
        </div>

        <Button
          onClick={openNew}
          className="w-full sm:w-auto bg-gradient-primary hover:opacity-95 text-white font-bold rounded-2xl h-12 px-5 border-none shadow-md shadow-primary/20 text-sm gap-2 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Raise Ticket</span>
        </Button>
      </div>

      {!loadFailed && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-4xl mx-auto">
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center">
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">
              Total
            </span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block">
              {supportTickets.length}
            </span>
          </Card>
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide pl-1">
              Waiting
            </span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">
              {supportTickets.filter((t) => t.status === "pending").length}
            </span>
          </Card>
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide pl-1">
              Answered
            </span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">
              {supportTickets.filter((t) => t.status !== "pending").length}
            </span>
          </Card>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md px-3 sm:px-5 py-2.5 rounded-2xl shadow-xs border border-slate-100/50 dark:border-white/5 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
          {[
            { value: "all", label: "All" },
            { value: "punch", label: "Punch fixes" },
            { value: "query", label: "Questions" },
            { value: "complaint", label: "Complaints" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setTicketFilter(f.value)}
              aria-pressed={ticketFilter === f.value}
              className={`h-10 px-4 rounded-xl text-[13px] font-bold transition-all cursor-pointer shrink-0 ${
                ticketFilter === f.value
                  ? "bg-[#501537] text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3.5 animate-pulse" aria-label="Loading your tickets">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[100px]"
              />
            ))}
          </div>
        ) : loadFailed ? (
          <LoadError
            what="your tickets"
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : filteredTickets.length > 0 ? (
          <div className="space-y-3.5">
            {filteredTickets.map((ticket) => {
              const punch = isCorrectionTicket(ticket.type);
              // A punch ticket's reason defaults to its own label; don't repeat it.
              const ownWords = !punch || ticket.reason !== TICKET_TYPE_LABELS[ticket.type];
              return (
                <motion.div
                  key={ticket._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] shadow-xs border border-slate-100/50 dark:border-white/5 flex items-start justify-between gap-3 transition-all duration-300 relative overflow-hidden"
                >
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full rounded-r-full ${
                      ticket.status === "approved"
                        ? "bg-emerald-500"
                        : ticket.status === "rejected"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                    }`}
                  />

                  <div className="space-y-2 flex-1 min-w-0 text-left pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[12px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0"
                      >
                        {TICKET_TYPE_LABELS[ticket.type] ?? ticket.type}
                      </Badge>
                      <span className="text-[12px] text-slate-500 font-semibold flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-primary/70" />
                        Sent{" "}
                        {new Date(ticket.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Asia/Kolkata",
                        })}
                      </span>
                    </div>

                    {punch && <CorrectionSummary ticket={ticket} />}

                    {ownWords && (
                      <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line break-words">
                        {ticket.reason}
                      </p>
                    )}

                    {ticket.adminRemark && (
                      <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-[14px] leading-relaxed">
                        <span className="font-bold text-[#501537] dark:text-[#e0a6c6] block text-[12px] mb-0.5">
                          {ticket.status === "rejected" ? "Reason from HR" : "Reply from HR"}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium break-words">
                          {ticket.adminRemark}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 pt-0.5">{getStatusBadge(ticket)}</div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md border border-slate-100/50 dark:border-white/5 rounded-[24px]">
            <Info className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-[14px] text-slate-500 font-medium">
              {supportTickets.length === 0
                ? "You have not raised any tickets yet."
                : "No tickets of this kind yet."}
            </p>
          </div>
        )}
      </div>

      {/* Radix Dialog portals to <body>, so the bottom nav cannot paint over
          it, and closes on Escape -- which is what Android Back sends. */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!createTicketMutation.isPending) setOpen(o);
        }}
      >
        <DialogContent
          className={cn(
            "w-[calc(100vw-24px)] max-w-md rounded-3xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto border border-slate-100 dark:border-slate-800 dark:bg-slate-900 text-left",
            DIALOG_CLOSE_40,
          )}
        >
          <DialogHeader className="text-left pr-8">
            <DialogTitle className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Raise a Ticket
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500">
              {isCorrection
                ? "Pick the day and the real time. Your admin will check it."
                : "Choose what it is about and write your message. HR will reply here."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left">
            <div className="space-y-1.5">
              <span
                className="text-[13px] font-bold text-slate-600 dark:text-slate-300"
                id="ticket-kind"
              >
                What is it about?
              </span>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-labelledby="ticket-kind"
              >
                {NEW_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={ticketType === value}
                    onClick={() => setTicketType(value)}
                    className={cn(
                      "min-h-12 rounded-xl border px-3 py-2 text-left text-[13px] font-bold leading-tight flex items-center gap-2 transition-colors",
                      ticketType === value
                        ? "border-[#501537] bg-[#501537] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isCorrection && (
              // Keyed by type: switching in <-> out starts the picker afresh.
              <PunchCorrectionFields
                key={ticketType}
                field={ticketType === "ForgotPunchIn" ? "punchIn" : "punchOut"}
                onChange={setCorrection}
              />
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="ticket-message"
                className="text-[13px] font-bold text-slate-600 dark:text-slate-300"
              >
                {isCorrection ? "Reason (you can leave this empty)" : "Your message"}
              </label>
              <Textarea
                id="ticket-message"
                placeholder={PLACEHOLDERS[ticketType] ?? "Write your message"}
                value={description}
                maxLength={reasonMax}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border-slate-200 dark:border-slate-800 min-h-[90px] text-[16px] px-3 focus-visible:ring-1 focus-visible:ring-primary"
              />
              {isCorrection && (
                <p className="text-right text-[12px] text-slate-500">
                  {description.length}/{reasonMax}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 mt-1">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={createTicketMutation.isPending}
              className="flex-1 rounded-xl h-12 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={createTicketMutation.isPending || !canSend}
              className="flex-1 bg-gradient-primary text-white font-bold rounded-xl h-12 border-none shadow-md shadow-primary/20 text-sm"
            >
              {createTicketMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
