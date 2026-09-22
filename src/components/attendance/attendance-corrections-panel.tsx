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
import { cn, toDatetimeLocalValue } from "@/lib/utils";

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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) : "--:--";

const STATUS_META: Record<string, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning-foreground",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function AttendanceCorrectionsPanel() {
  const {
    regularizations, isLoading, approveRegularization, rejectRegularization,
  } = useRegularizationService();
  const { can } = usePermission();
  const canEdit = can("attendance", "edit");

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Regularization | null>(null);
  const [remark, setRemark] = useState("");
  const [punchOut, setPunchOut] = useState("");
  const [busy, setBusy] = useState(false);

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

  const open = (r: Regularization) => {
    setSelected(r);
    setRemark(r.adminRemark || "");
    // Prefill with what the employee claimed, so the common case (agree) is one
    // click and an edit is a deliberate change to a visible number.
    setPunchOut(r.requestedPunchOut ? toDatetimeLocalValue(new Date(r.requestedPunchOut)) : "");
  };

  const decide = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      if (approve) {
        await approveRegularization({
          id: selected._id,
          adminRemark: remark || undefined,
          requestedPunchOut: punchOut || undefined,
        });
      } else {
        await rejectRegularization({ id: selected._id, adminRemark: remark || undefined });
      }
      setSelected(null);
      setRemark("");
    } catch {
      // The service toasts the reason; leave the dialog open so the admin can
      // retry rather than losing what they typed.
    } finally {
      setBusy(false);
    }
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
        headers={["Employee", "Attendance Date", "Punched In", "Recorded Out", "Claimed Out", "Reason", "Status", "Actions"]}
        isEmpty={rows.length === 0}
        emptyMessage="No correction requests. Employees are prompted automatically when a day is auto-closed at shift end."
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
            <DataTableCell className="text-[13px] text-muted-foreground">{fmtDate(r.date)}</DataTableCell>
            <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
              {fmtTime(r.currentPunchIn)}
            </DataTableCell>
            <DataTableCell className="text-[13px] font-mono text-muted-foreground">
              {/* Once approved the live row holds the NEW time, so the thing that
                  was replaced only survives on the request itself. */}
              {fmtTime(r.status === "approved" ? r.originalPunchOut : r.currentPunchOut)}
              {r.currentCloseReason === "shift_end" && r.status !== "approved" && (
                <span className="ml-1.5 rounded border border-warning/30 bg-warning/10 px-1 py-px text-[8px] font-black uppercase text-warning-foreground">
                  auto
                </span>
              )}
            </DataTableCell>
            <DataTableCell className="text-[13px] font-mono font-bold text-primary">
              {fmtTime(r.requestedPunchOut)}
            </DataTableCell>
            <DataTableCell className="max-w-[180px] truncate text-[12px] italic text-muted-foreground">
              {r.reason}
            </DataTableCell>
            <DataTableCell>
              <Badge variant="outline" className={cn("text-[10px] font-black uppercase", STATUS_META[r.status])}>
                {r.status}
              </Badge>
            </DataTableCell>
            <DataTableCell isLast>
              {r.status === "pending" && canEdit ? (
                <ActionButton variant="edit" icon={ClipboardList} tooltip="Review" onClick={() => open(r)} />
              ) : (
                <span className="text-[11px] text-muted-foreground/60">
                  {r.status === "pending" ? "—" : fmtDate(r.reviewedAt || r.createdAt)}
                </span>
              )}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Review correction request</DialogTitle>
            <DialogDescription>
              {selected?.employeeId?.name} · {selected && fmtDate(selected.date)}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-3">
                {[
                  ["Punched in", fmtTime(selected.currentPunchIn)],
                  ["Recorded out", fmtTime(selected.currentPunchOut)],
                  ["Claimed out", fmtTime(selected.requestedPunchOut)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 font-mono text-[12px] font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <p className="rounded-xl bg-muted/30 px-3.5 py-2.5 text-[12px] italic text-muted-foreground">
                “{selected.reason}”
              </p>

              <FormInput
                label="Approve with this punch-out"
                type="datetime-local"
                value={punchOut}
                onChange={(e) => setPunchOut(e.target.value)}
              />

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground">Remark (optional)</label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Shown to the employee with your decision"
                  className="min-h-[70px] text-[13px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <ActionButton
              variant="destructive" showLabel label="REJECT" icon={X}
              disabled={busy} onClick={() => decide(false)}
            />
            <ActionButton
              variant="approve" showLabel label="APPROVE" icon={Check}
              disabled={busy || !punchOut} onClick={() => decide(true)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
