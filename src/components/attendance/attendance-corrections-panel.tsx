import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, ClipboardList, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ActionButton } from "@/components/shared/action-button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { FormInput } from "@/components/shared/form-input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useRegularizationService, type Regularization,
} from "@/services/regularization-service";
import { usePermission } from "@/hooks/use-permission";
import { cn, toISTDateKey } from "@/lib/utils";

/**
 * The admin review queue for employee-raised attendance corrections.
 *
 * These arrive when somebody forgets to punch out: the 04:00 job writes the
 * shift end so the day can still be paid, the employee is asked what time they
 * actually left, and this is where that claim gets adjudicated. The reviewer
 * sees the claim next to the value it would replace, because approving a time
 * without seeing what it overwrites is not a review.
 *
 * Approving with an edited time is deliberate: an admin who knows the real
 * leaving time should not have to reject and ask the employee to file again.
 */

const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Same cap the server enforces on a decision remark / reject reason. */
const MAX_CORRECTION_REMARK = 300;

// Every correction is about an IST day, so dates and times are read in IST --
// not in whatever timezone the reviewer's browser happens to use.
const fmtCorrectionDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: IST_TZ, day: "numeric", month: "short", year: "numeric" });

const fmtCorrectionTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { timeZone: IST_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    : "--:--";

/** "HH:mm" in IST for a real instant, for a time input. */
const istHHMM = (iso?: string | null) =>
  iso ? new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(11, 16) : "";

/** Epoch ms of an IST wall clock "YYYY-MM-DDTHH:mm", independent of the browser's zone. */
const istWallMs = (wall: string) => {
  const [d, t] = wall.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return Date.UTC(y, mo - 1, da, h, mi) - IST_OFFSET_MS;
};

/** The "YYYY-MM-DD" after `key`. */
const nextDayKey = (key: string) => {
  const [y, mo, da] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, da + 1)).toISOString().slice(0, 10);
};

const STATUS_META: Record<string, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning-foreground",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Which parts of the day a request asks to change, in words. */
function claimSummary(r: Regularization): string {
  const parts: string[] = [];
  if (r.requestedPunchIn) parts.push(`In ${fmtCorrectionTime(r.requestedPunchIn)}`);
  if (r.requestedPunchOut) parts.push(`Out ${fmtCorrectionTime(r.requestedPunchOut)}`);
  if (r.requestedLunchInTime || r.requestedLunchOutTime) {
    parts.push(`Lunch ${fmtCorrectionTime(r.requestedLunchInTime)}–${fmtCorrectionTime(r.requestedLunchOutTime)}`);
  }
  if (r.requestedStatus) parts.push(`Status ${r.requestedStatus}`);
  return parts.join(" · ") || "—";
}

/**
 * Review one correction: the claim beside what the record says now, an
 * optional edit of the claimed times, and a remark the employee is shown with
 * the decision. Used by the Tickets page queue and the Attendance page sheet.
 *
 * The edit fields are TIME inputs anchored to the request's own day, so an
 * approved time cannot land on another date (the server refuses that too).
 * Approval used to require a punch-out, which made a request that only
 * corrected the punch-in impossible to approve.
 */
export function CorrectionReviewDialog({
  request,
  onClose,
}: {
  request: Regularization | null;
  onClose: () => void;
}) {
  // Keyed by request, so each one opens with fresh fields and a list refetch
  // while it is open does not wipe what the admin typed.
  return request ? <ReviewDialogBody key={request._id} request={request} onClose={onClose} /> : null;
}

function ReviewDialogBody({ request, onClose }: { request: Regularization; onClose: () => void }) {
  const { approveRegularization, rejectRegularization } = useRegularizationService({ enabled: false });
  // Prefilled with what the employee claimed, so the common case (agree) is one
  // click and an edit is a deliberate change to a visible number.
  const [remark, setRemark] = useState(request.adminRemark || "");
  const [punchIn, setPunchIn] = useState(istHHMM(request.requestedPunchIn));
  const [punchOut, setPunchOut] = useState(istHHMM(request.requestedPunchOut));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayKey = toISTDateKey(request.date);
  const hasClaim = !!(
    request.requestedPunchIn || request.requestedPunchOut ||
    request.requestedLunchInTime || request.requestedLunchOutTime || request.requestedStatus
  );
  const canApprove = hasClaim || !!punchIn || !!punchOut;

  const decide = async (approve: boolean) => {
    const trimmed = remark.trim();
    if (trimmed.length > MAX_CORRECTION_REMARK) {
      setError(`Keep the remark under ${MAX_CORRECTION_REMARK} characters.`);
      return;
    }
    // Anchor each edited time to a DATE. A night shift's punch-out is on the
    // next calendar day (22:00 in, 06:00 out), so a punch-out that would fall
    // at or before the punch-in moves to the next morning. Comparing the bare
    // "HH:mm" strings refused every overnight approval.
    const inKey = request.requestedPunchIn ? toISTDateKey(request.requestedPunchIn) : dayKey;
    const inWall = punchIn ? `${inKey}T${punchIn}` : null;
    const inMs = inWall ? istWallMs(inWall) : request.currentPunchIn ? +new Date(request.currentPunchIn) : null;
    let outWall = punchOut ? `${dayKey}T${punchOut}` : null;
    if (outWall && inMs !== null && istWallMs(outWall) <= inMs) outWall = `${nextDayKey(dayKey)}T${punchOut}`;
    if (approve && outWall && inMs !== null && istWallMs(outWall) <= inMs) {
      setError("Punch out must be after punch in.");
      return;
    }
    // Only an EDITED time is sent. An unchanged claim keeps the exact instant
    // the employee asked for (its own date included) on the server.
    const inChanged = !!punchIn && punchIn !== istHHMM(request.requestedPunchIn);
    const outChanged = !!punchOut && punchOut !== istHHMM(request.requestedPunchOut);
    setError(null);
    setBusy(true);
    try {
      if (approve) {
        await approveRegularization({
          id: request._id,
          adminRemark: trimmed || undefined,
          // Only sent when edited; the server keeps the claim otherwise.
          requestedPunchIn: inChanged && inWall ? inWall : undefined,
          requestedPunchOut: outChanged && outWall ? outWall : undefined,
        });
      } else {
        await rejectRegularization({ id: request._id, adminRemark: trimmed || undefined });
      }
      onClose();
    } catch {
      // The service toasts the reason; leave the dialog open so the admin can
      // retry rather than losing what they typed.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review correction request</DialogTitle>
          <DialogDescription>
            {request.employeeId?.name} · {fmtCorrectionDate(request.date)}
            {request.ticketId ? " · raised as a ticket" : ""}
          </DialogDescription>
        </DialogHeader>

        {(
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-3">
              {[
                ["Recorded in", fmtCorrectionTime(request.currentPunchIn)],
                ["Claimed in", request.requestedPunchIn ? fmtCorrectionTime(request.requestedPunchIn) : "no change"],
                ["Recorded out", fmtCorrectionTime(request.currentPunchOut)],
                ["Claimed out", request.requestedPunchOut ? fmtCorrectionTime(request.requestedPunchOut) : "no change"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-0.5 font-mono text-[13px] font-bold">{value}</p>
                </div>
              ))}
              {(request.requestedLunchInTime || request.requestedLunchOutTime) && (
                <div className="col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Claimed lunch</p>
                  <p className="mt-0.5 font-mono text-[13px] font-bold">
                    {fmtCorrectionTime(request.requestedLunchInTime)} – {fmtCorrectionTime(request.requestedLunchOutTime)}
                  </p>
                </div>
              )}
              {request.currentCloseReason === "shift_end" && (
                <p className="col-span-2 text-[11px] text-warning-foreground">
                  The recorded punch-out was written automatically at shift end — nobody punched out.
                </p>
              )}
            </div>

            <p className="rounded-xl bg-muted/30 px-3.5 py-2.5 text-[12px] italic text-muted-foreground break-words">
              “{request.reason}”
            </p>

            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Approve punch in"
                type="time"
                value={punchIn}
                onChange={(e) => setPunchIn(e.target.value)}
                className="h-11"
                containerClassName="space-y-1"
              />
              <FormInput
                label="Approve punch out"
                type="time"
                value={punchOut}
                onChange={(e) => setPunchOut(e.target.value)}
                className="h-11"
                containerClassName="space-y-1"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Remark / reason for rejecting (optional)
              </label>
              <Textarea
                value={remark}
                maxLength={MAX_CORRECTION_REMARK}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Shown to the employee with your decision"
                className="min-h-[70px] text-[13px]"
              />
              <p className="text-right text-[11px] text-muted-foreground">{remark.length}/{MAX_CORRECTION_REMARK}</p>
            </div>

            {error && <p className="text-[12px] font-medium text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <ActionButton
            variant="destructive" showLabel label="REJECT" icon={X} className="h-11"
            disabled={busy} onClick={() => decide(false)}
          />
          <ActionButton
            variant="approve" showLabel label="APPROVE" icon={Check} className="h-11"
            disabled={busy || !canApprove} onClick={() => decide(true)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceCorrectionsPanel() {
  const { regularizations, isLoading } = useRegularizationService();
  const { can } = usePermission();
  const canEdit = can("attendance", "edit");

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Regularization | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return regularizations
      .filter((r) => !term || (r.employeeId?.name || "").toLowerCase().includes(term))
      // Pending first — this is a queue, and anything already decided is history.
      .sort((a, b) => {
        if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      });
  }, [regularizations, search]);

  const counts = {
    pending: regularizations.filter((r) => r.status === "pending").length,
    approved: regularizations.filter((r) => r.status === "approved").length,
    total: regularizations.length,
  };

  if (isLoading) {
    return <div className="py-10 text-center text-[13px] text-muted-foreground">Loading corrections…</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Awaiting Review" value={counts.pending} icon={Clock} accent="warning" delay={0} />
        <StatCard label="Approved" value={counts.approved} icon={Check} accent="success" delay={0.05} />
        <StatCard label="Total Requests" value={counts.total} icon={ClipboardList} accent="primary" delay={0.1} />
      </div>

      <div className="relative w-full md:w-[260px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search by employee..."
          className="h-10 w-full rounded-xl border border-border/50 bg-background pl-9 pr-4 text-[13px] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        headers={["Employee", "Attendance Date", "Punched In", "Recorded Out", "Claimed", "Reason", "Status", "Actions"]}
        isEmpty={rows.length === 0}
        emptyMessage="No correction requests. They arrive when an employee raises a 'Forgot to punch in / out' ticket, or answers the prompt after a day is closed at shift end."
      >
        {rows.map((r) => (
          <DataTableRow key={r._id}>
            <DataTableCell isFirst>
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-black uppercase">
                    {(r.employeeId?.name || "?").split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[13px] font-semibold">{r.employeeId?.name || "Unknown"}</span>
              </div>
            </DataTableCell>
            <DataTableCell className="text-[13px] text-muted-foreground">{fmtCorrectionDate(r.date)}</DataTableCell>
            <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
              {/* Once approved the day holds the corrected arrival; what the
                  employee actually punched survives as originalPunchIn. */}
              {r.status === "approved" && r.originalPunchIn ? (
                <span title="Punched → corrected to">
                  <span className="text-muted-foreground line-through decoration-1">{fmtCorrectionTime(r.originalPunchIn)}</span>
                  <span className="mx-1 text-muted-foreground/60">→</span>
                  {fmtCorrectionTime(r.currentPunchIn)}
                </span>
              ) : (
                fmtCorrectionTime(r.currentPunchIn)
              )}
            </DataTableCell>
            <DataTableCell className="text-[13px] font-mono text-muted-foreground">
              {/* Once approved the live row holds the NEW time, so the thing that
                  was replaced only survives on the request itself. */}
              {fmtCorrectionTime(r.status === "approved" ? r.originalPunchOut : r.currentPunchOut)}
              {r.currentCloseReason === "shift_end" && r.status !== "approved" && (
                <span className="ml-1.5 rounded border border-warning/30 bg-warning/10 px-1 py-px text-[11px] font-black uppercase text-warning-foreground">
                  auto
                </span>
              )}
            </DataTableCell>
            <DataTableCell className="text-[12px] font-mono font-bold text-primary">
              {claimSummary(r)}
              {r.ticketId && (
                <span className="ml-1.5 rounded border border-primary/20 bg-primary/5 px-1 py-px font-sans text-[11px] font-bold text-primary">
                  Ticket
                </span>
              )}
            </DataTableCell>
            <DataTableCell className="max-w-[180px] text-[12px] italic text-muted-foreground">
              <span className="block truncate">{r.reason}</span>
              {r.status !== "pending" && r.adminRemark && (
                <span className="block truncate not-italic text-foreground/70">Admin: {r.adminRemark}</span>
              )}
            </DataTableCell>
            <DataTableCell>
              <Badge variant="outline" className={cn("text-[11px] font-black uppercase", STATUS_META[r.status])}>
                {r.status}
              </Badge>
            </DataTableCell>
            <DataTableCell isLast>
              {r.status === "pending" && canEdit ? (
                <ActionButton variant="edit" icon={ClipboardList} tooltip="Review" aria-label="Review" className="h-10 w-10" onClick={() => setSelected(r)} />
              ) : (
                <span className="text-[11px] text-muted-foreground/60">
                  {r.status === "pending" ? "—" : fmtCorrectionDate(r.reviewedAt || r.createdAt)}
                </span>
              )}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>

      <CorrectionReviewDialog request={selected} onClose={() => setSelected(null)} />
    </motion.div>
  );
}
