import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GridCard } from "@/components/shared/grid-card";
import {
  Check,
  X,
  Clock,
  MessageSquare,
  CalendarDays,
  Ticket as TicketIcon,
  Search,
  ArrowRight,
  ClipboardList,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTicketService,
  isCorrectionTicket,
  TICKET_TYPE_LABELS,
  type Ticket,
} from "@/services/ticket-service";
import type { Regularization } from "@/services/regularization-service";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AttendanceCorrectionsPanel,
  CorrectionReviewDialog,
} from "@/components/attendance/attendance-corrections-panel";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { fmtIST12, fmtISTDay } from "@/components/tickets/correction-log";

export const Route = createFileRoute("/_app/tickets")({
  component: TicketsPage,
});

/** Same cap the server enforces on a ticket reply. */
const MAX_TICKET_REMARK = 1000;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

const initials = (name?: string) =>
  (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 3);

const statusLabel = (t: Ticket) =>
  t.status === "pending"
    ? "Pending"
    : t.status === "approved"
      ? isCorrectionTicket(t.type)
        ? "Approved"
        : "Resolved"
      : "Rejected";

const statusClass = (status: Ticket["status"]) =>
  status === "approved"
    ? "bg-success/10 text-success"
    : status === "pending"
      ? "bg-warning/15 text-warning-foreground"
      : "bg-destructive/10 text-destructive";

/**
 * "Punched 10:00 AM → asks for 9:30 AM" for a punch-correction ticket, plus
 * the day. After a decision the recorded time has been replaced, so the
 * snapshot taken when the employee asked is what is shown as "Punched".
 */
function CorrectionLine({ t, compact = false }: { t: Ticket; compact?: boolean }) {
  const c = t.correction;
  if (!c?.field) return null;
  const isIn = c.field === "punchIn";
  const applied = c.appliedTime;
  return (
    <div className={cn("space-y-0.5", compact ? "text-[12px]" : "text-[13px]")}>
      <p className="font-semibold text-foreground">
        {isIn ? "Punch in" : "Punch out"} · {fmtISTDay(c.date)}
      </p>
      <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <span>
          Punched{" "}
          <b className="font-mono text-foreground/80">
            {c.recordedTime ? fmtIST12(c.recordedTime) : "no time"}
          </b>
        </span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <span>
          asks for <b className="font-mono text-primary">{fmtIST12(c.requestedTime)}</b>
        </span>
      </p>
      {t.status === "approved" && applied && applied !== c.requestedTime && (
        <p className="text-success">Approved as {fmtIST12(applied)}</p>
      )}
    </div>
  );
}

/** A punch ticket's linked request, shaped for the shared correction review dialog. */
function asRegularization(t: Ticket): Regularization | null {
  const r = t.regularization;
  if (!r) return null;
  return { ...r, employeeId: t.employeeId } as Regularization;
}

function TicketsPage() {
  const {
    tickets: rawTickets,
    isLoading,
    isError,
    refetch,
    isFetching,
    updateTicketStatus,
    deleteTicket,
    isUpdating,
    isDeleting,
  } = useTicketService();
  // A correction ticket's status is copied from its correction after each
  // decision, and the copy can lag or fail (syncLinkedTicket only logs). The
  // correction is the truth, so the cards, the tabs and the row all read it.
  const tickets = useMemo(
    () => rawTickets.map((t) => (t.regularization?.status && t.regularization.status !== t.status ? { ...t, status: t.regularization.status } : t)),
    [rawTickets],
  );
  const [tab, setTab] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [section, setSection] = useState<"helpdesk" | "corrections">("helpdesk");
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<Regularization | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [remarkText, setRemarkText] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canEdit = can("tickets", "edit");
  const canDelete = can("tickets", "delete");
  // Deciding a punch correction rewrites attendance and pay: the server also
  // requires attendance.edit for a sub-admin.
  const canDecideCorrections = canEdit && can("attendance", "edit");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const name = t.employeeId?.name || "";
      const phone = t.employeeId?.phone || "";
      const matchesTab = tab === "all" || t.status === tab;
      const matchesKind =
        kind === "all" ||
        (kind === "punch"
          ? isCorrectionTicket(t.type) || t.type === "Correction"
          : t.type === kind);
      const matchesSearch = !term || name.toLowerCase().includes(term) || phone.includes(term);
      return matchesTab && matchesKind && matchesSearch;
    });
  }, [tickets, tab, kind, search]);

  const openReview = (t: Ticket) => {
    if (isCorrectionTicket(t.type) && t.regularization) {
      setCorrectionTarget(asRegularization(t));
      return;
    }
    setSelectedTicket(t);
    setRemarkText(t.adminRemark || "");
    setConfirmReject(false);
  };

  const canReview = (t: Ticket) =>
    isCorrectionTicket(t.type) ? canDecideCorrections && t.status === "pending" : canEdit;

  const handleStatusUpdate = async (id: string, status: string) => {
    if (remarkText.trim().length > MAX_TICKET_REMARK) return;
    try {
      await updateTicketStatus({ id, status, adminRemark: remarkText.trim() });
      setSelectedTicket(null);
      setRemarkText("");
      setConfirmReject(false);
    } catch {
      // The service toasts the reason; keep the dialog open to retry.
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTicket(deleteTarget._id);
      setDeleteTarget(null);
    } catch {
      // Toasted by the service (e.g. a pending punch correction must be decided first).
    }
  };

  // The cards follow the type and search filters (everything but the status
  // tab), so each card's number is what its tab will list.
  const counts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const inScope = tickets.filter((t) => {
      const matchesKind = kind === "all" || (kind === "punch" ? isCorrectionTicket(t.type) || t.type === "Correction" : t.type === kind);
      const matchesSearch = !term || (t.employeeId?.name || "").toLowerCase().includes(term) || (t.employeeId?.phone || "").includes(term);
      return matchesKind && matchesSearch;
    });
    return {
      all: inScope.length,
      pending: inScope.filter((t) => t.status === "pending").length,
      approved: inScope.filter((t) => t.status === "approved").length,
    };
  }, [tickets, kind, search]);

  const actionsFor = (t: Ticket) => {
    const review = canReview(t);
    if (!review && !canDelete) return null;
    return { review, del: canDelete };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Helpdesk & Tickets"
          description="Answer employee questions, complaints and missed-punch requests."
        />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Helpdesk & Tickets"
        description="Answer employee questions, complaints and missed-punch requests."
      />

      {/* Punch-correction tickets are decided through their Regularization,
          the same record Attendance -> Corrections shows. Deciding in either
          place updates both. */}
      <div
        className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/30 p-1 w-fit"
        role="tablist"
      >
        {(
          [
            ["helpdesk", "Helpdesk"],
            ["corrections", "Attendance Corrections"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            onClick={() => setSection(key)}
            className={cn(
              "h-10 rounded-lg px-4 text-[13px] font-semibold transition-all",
              section === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "corrections" ? (
        <AttendanceCorrectionsPanel />
      ) : isError && tickets.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-muted/20 p-8 text-center space-y-3">
          <p className="text-[14px] font-semibold">Tickets could not be loaded.</p>
          <p className="text-[13px] text-muted-foreground">Check the connection and try again.</p>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} /> Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard
              label="Pending Review"
              value={counts.pending}
              icon={Clock}
              accent="warning"
              delay={0}
            />
            <StatCard
              label="Approved / Resolved"
              value={counts.approved}
              icon={Check}
              accent="success"
              delay={0.05}
            />
            <StatCard
              label="Total Tickets"
              value={counts.all}
              icon={TicketIcon}
              accent="primary"
              delay={0.1}
            />
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
            <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
              <ViewToggle view={view} onViewChange={updateDefaultLayout} />

              <Select value={tab} onValueChange={setTab}>
                <SelectTrigger
                  aria-label="Filter by status"
                  className="w-full md:w-[140px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none"
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      tab === "pending"
                        ? "bg-warning"
                        : tab === "approved"
                          ? "bg-success"
                          : tab === "rejected"
                            ? "bg-destructive"
                            : "bg-primary",
                    )}
                  />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved / Resolved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger
                  aria-label="Filter by type"
                  className="w-full md:w-[170px] h-10 rounded-xl text-[13px] font-medium gap-2 px-3 shadow-none"
                >
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/60">
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="punch">Missed punches</SelectItem>
                  <SelectItem value="Query">Questions for HR</SelectItem>
                  <SelectItem value="Complaint">Complaints</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Search by employee"
                  placeholder="Search by employee..."
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/50 bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {view === "grid" ? (
              <motion.div
                key="grid-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4"
              >
                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-[13px] text-muted-foreground">
                    <Inbox className="h-7 w-7 mx-auto mb-2 opacity-50" />
                    {tickets.length === 0 ? "No tickets yet." : "No tickets match these filters."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((t) => {
                      const acts = actionsFor(t);
                      const punch = isCorrectionTicket(t.type);
                      return (
                        <GridCard
                          key={t._id}
                          title={t.employeeId?.name || "Unknown"}
                          subtitle={TICKET_TYPE_LABELS[t.type] ?? t.type}
                          icon={
                            <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                              {initials(t.employeeId?.name)}
                            </div>
                          }
                          statusNode={
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-bold px-2 py-0 border-transparent rounded-full",
                                statusClass(t.status),
                              )}
                            >
                              {statusLabel(t)}
                            </Badge>
                          }
                          actions={
                            acts ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <ActionButton variant="more" tooltip="Actions" aria-label="Actions" className="h-10 w-10" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {acts.review && (
                                    <DropdownMenuItem onClick={() => openReview(t)}>
                                      {punch ? "Review punch correction" : "Review ticket"}
                                    </DropdownMenuItem>
                                  )}
                                  {acts.del && (
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      disabled={isDeleting}
                                      onClick={() => setDeleteTarget(t)}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : undefined
                          }
                        >
                          <div className="space-y-3 mb-4">
                            {punch && (
                              <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
                                <CorrectionLine t={t} />
                              </div>
                            )}
                            {(!punch || t.reason !== TICKET_TYPE_LABELS[t.type]) && (
                              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                                <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-tight mb-1">
                                  Employee wrote
                                </p>
                                <p className="text-[13px] text-foreground leading-relaxed line-clamp-3 break-words">
                                  {t.reason}
                                </p>
                              </div>
                            )}
                            {t.adminRemark && (
                              <p className="text-[12px] text-muted-foreground line-clamp-2 break-words px-1">
                                <span className="font-semibold text-foreground/80">Reply:</span>{" "}
                                {t.adminRemark}
                              </p>
                            )}
                            <div className="flex items-center justify-between px-1 text-[12px] text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {fmtDate(t.createdAt)}
                              </div>
                            </div>
                          </div>
                        </GridCard>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4"
              >
                <DataTable
                  headers={["Employee", "Type", "Details", "Sent", "Status", "Actions"]}
                  isEmpty={filtered.length === 0}
                  emptyMessage={
                    tickets.length === 0 ? "No tickets yet." : "No tickets match these filters."
                  }
                >
                  {filtered.map((t) => {
                    const acts = actionsFor(t);
                    const punch = isCorrectionTicket(t.type);
                    return (
                      <DataTableRow key={t._id}>
                        <DataTableCell isFirst>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                              <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                                {initials(t.employeeId?.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0 max-w-[150px]">
                              <span
                                className="font-bold text-[13px] text-foreground leading-tight truncate"
                                title={t.employeeId?.name}
                              >
                                {t.employeeId?.name || "Unknown"}
                              </span>
                              <span className="text-[11px] text-muted-foreground mt-0.5">
                                {t.employeeId?.phone}
                              </span>
                            </div>
                          </div>
                        </DataTableCell>
                        <DataTableCell>
                          <Badge
                            variant="outline"
                            className="text-[11px] bg-primary/5 text-primary border-primary/20 whitespace-nowrap"
                          >
                            {TICKET_TYPE_LABELS[t.type] ?? t.type}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell className="max-w-[250px] text-[13px] text-muted-foreground">
                          {punch ? (
                            <CorrectionLine t={t} compact />
                          ) : (
                            <span className="block truncate">{t.reason}</span>
                          )}
                          {punch && t.reason !== TICKET_TYPE_LABELS[t.type] && (
                            <span className="block truncate text-[12px] italic">“{t.reason}”</span>
                          )}
                        </DataTableCell>
                        <DataTableCell className="text-[13px] text-muted-foreground whitespace-nowrap">
                          {fmtDate(t.createdAt)}
                        </DataTableCell>
                        <DataTableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] font-bold px-2 py-0.5 border-transparent",
                              statusClass(t.status),
                            )}
                          >
                            {statusLabel(t)}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell isLast>
                          <div className="flex justify-end items-center gap-1">
                            {acts?.review && (
                              <ActionButton
                                variant="comment"
                                icon={punch ? ClipboardList : MessageSquare}
                                tooltip={punch ? "Review punch correction" : "Review ticket"}
                                aria-label={punch ? "Review punch correction" : "Review ticket"}
                                className="h-10 w-10"
                                onClick={() => openReview(t)}
                              />
                            )}
                            {acts?.del && (
                              <ActionButton
                                variant="delete"
                                tooltip="Delete ticket"
                                aria-label="Delete ticket"
                                className="h-10 w-10"
                                disabled={isDeleting}
                                onClick={() => setDeleteTarget(t)}
                              />
                            )}
                          </div>
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTable>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Review a free-text ticket. Punch corrections open the shared
          correction review dialog instead (same one as Attendance). */}
          <Dialog
            open={!!selectedTicket}
            onOpenChange={(o) => {
              if (!o && !isUpdating) setSelectedTicket(null);
            }}
          >
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-[15px]">Review ticket</DialogTitle>
                <DialogDescription className="text-[13px]">
                  Write a reply, then mark it resolved or reject it. The employee sees your reply.
                </DialogDescription>
              </DialogHeader>

              {selectedTicket && (
                <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge variant="outline" className="text-[11px]">
                        {TICKET_TYPE_LABELS[selectedTicket.type] ?? selectedTicket.type}
                      </Badge>
                      <span className="text-[12px] text-muted-foreground">
                        {fmtDateTime(selectedTicket.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13px] text-foreground font-medium mb-1">
                      {selectedTicket.employeeId?.name} wrote:
                    </p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line break-words">
                      {selectedTicket.reason}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="ticket-remark"
                      className="text-[12px] font-bold text-foreground"
                    >
                      Reply to the employee
                    </label>
                    <Textarea
                      id="ticket-remark"
                      value={remarkText}
                      maxLength={MAX_TICKET_REMARK}
                      onChange={(e) => setRemarkText(e.target.value)}
                      placeholder="e.g. You have 4 casual leaves left."
                      rows={3}
                      className="text-[13px] rounded-xl border-border/60"
                    />
                    <p className="text-right text-[11px] text-muted-foreground">
                      {remarkText.length}/{MAX_TICKET_REMARK}
                    </p>
                  </div>

                  {confirmReject ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="text-[13px] font-semibold text-destructive">
                        Reject this ticket?
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {remarkText.trim()
                          ? "The employee will see your reply as the reason."
                          : "Tip: add a reply so the employee knows why."}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 h-10"
                          disabled={isUpdating}
                          onClick={() => setConfirmReject(false)}
                        >
                          Go back
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1 h-10"
                          disabled={isUpdating}
                          onClick={() => handleStatusUpdate(selectedTicket._id, "rejected")}
                        >
                          Yes, reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2">
                      <ActionButton
                        variant="destructive"
                        showLabel
                        label="REJECT"
                        icon={X}
                        className="flex-1 h-10 rounded-xl"
                        disabled={isUpdating}
                        onClick={() => setConfirmReject(true)}
                      />
                      <ActionButton
                        variant="approve"
                        showLabel
                        label="RESOLVE"
                        icon={Check}
                        className="flex-1 h-10 rounded-xl bg-success text-success-foreground hover:bg-success/90"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(selectedTicket._id, "approved")}
                      />
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <CorrectionReviewDialog
            request={correctionTarget}
            onClose={() => setCorrectionTarget(null)}
          />

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(o) => {
              if (!o && !isDeleting) setDeleteTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget && isCorrectionTicket(deleteTarget.type)
                    ? deleteTarget.status === "pending"
                      ? "This punch correction is still waiting. Approve or reject it first, then delete the ticket."
                      : "The ticket goes, but the attendance correction and its record stay."
                    : `${deleteTarget?.employeeId?.name ?? "The employee"} will no longer see it. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-10" disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                {!(
                  deleteTarget &&
                  isCorrectionTicket(deleteTarget.type) &&
                  deleteTarget.status === "pending"
                ) && (
                  <AlertDialogAction
                    className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleDelete();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
