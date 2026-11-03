import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinOff, Check, X, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatINRFull } from "@/lib/format";
import { usePermission } from "@/hooks/use-permission";
import { requestErrorMessage } from "@/services/request-error";

type PenaltyStatus = "pending" | "approved" | "waived";

interface GpsPenalty {
  _id: string;
  employeeId: { _id: string; name: string; phone?: string } | null;
  dayKey: string;
  offAt: string;
  onAt: string;
  minutes: number;
  amount: number;
  status: PenaltyStatus;
  decidedBy?: { name: string } | null;
  note?: string;
}

interface PenaltyResponse {
  settings: { enabled: boolean; graceMinutes: number; amount: number; autoApprove: boolean };
  penalties: GpsPenalty[];
}

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const dayLabel = (key: string) =>
  new Date(`${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

const STATUS: Record<PenaltyStatus, { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  approved: { label: "Will be deducted", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  waived: { label: "Waived", cls: "bg-muted text-muted-foreground border-border" },
};

/**
 * GPS switched off while on duty, for one month: the penalties the phones'
 * reports produced, for the admin to approve (deducted from that month's
 * salary) or waive. Hidden while the rule is off in Settings.
 */
export function GpsPenaltiesCard() {
  const { can } = usePermission();
  const canEdit = can("tracking", "edit");
  const queryClient = useQueryClient();
  const nowIst = new Date(Date.now() + 5.5 * 3600e3);
  const [ym, setYm] = useState({ y: nowIst.getUTCFullYear(), m: nowIst.getUTCMonth() + 1 });
  const [filter, setFilter] = useState<PenaltyStatus | "all">("pending");

  const { data, isLoading, isError } = useQuery<PenaltyResponse>({
    queryKey: ["gps-penalties", ym.y, ym.m],
    queryFn: async () => (await apiClient.get("/tracking/gps-penalties", { params: { year: ym.y, month: ym.m } })).data,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PenaltyStatus }) =>
      (await apiClient.patch(`/tracking/gps-penalties/${id}`, { status })).data,
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Penalty approved" : v.status === "waived" ? "Penalty waived" : "Moved back to waiting");
      queryClient.invalidateQueries({ queryKey: ["gps-penalties"] });
    },
    onError: (err) => {
      const message = requestErrorMessage(err, "Could not save that decision. Please try again.");
      if (message) toast.error(message);
    },
  });

  const rows = useMemo(() => data?.penalties ?? [], [data]);
  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    waived: rows.filter((r) => r.status === "waived").length,
  }), [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const approvedTotal = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);

  if (isLoading || isError || !data?.settings.enabled) return null;

  const months = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - i, 15));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) };
  });

  return (
    <Card className="p-4 sm:p-5 rounded-2xl border-border/50 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <MapPinOff className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold">GPS turned off on duty</h3>
            <p className="text-[12px] text-muted-foreground">
              Off for more than {data.settings.graceMinutes} min between punch-in and punch-out. {formatINRFull(data.settings.amount)} a day
              {data.settings.autoApprove ? ", deducted automatically." : " once you approve it."}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Month">
          {months.map((o) => (
            <Button
              key={`${o.y}-${o.m}`}
              size="sm"
              variant={o.y === ym.y && o.m === ym.m ? "default" : "outline"}
              className="h-9 rounded-lg text-[12px]"
              onClick={() => setYm({ y: o.y, m: o.m })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {(["pending", "approved", "waived", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "h-9 px-3 rounded-lg border text-[12px] font-semibold",
              filter === k ? "border-primary bg-primary/5 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40",
            )}
          >
            {k === "all" ? "All" : STATUS[k].label} ({counts[k]})
          </button>
        ))}
        {approvedTotal > 0 && (
          <span className="ml-auto self-center text-[12px] text-muted-foreground">
            To be deducted this month: <b className="text-foreground">{formatINRFull(approvedTotal)}</b>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-4 text-center">
          {rows.length === 0 ? "Nobody turned GPS off on duty this month." : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {shown.map((r) => {
            const busy = decide.isPending && decide.variables?.id === r._id;
            return (
              <li key={r._id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{r.employeeId?.name ?? "Employee removed"}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {dayLabel(r.dayKey)} · GPS off {istTime(r.offAt)} – {istTime(r.onAt)} ({duration(r.minutes)})
                  </div>
                  {r.status !== "pending" && r.decidedBy?.name && (
                    <div className="text-[11px] text-muted-foreground">Decided by {r.decidedBy.name}</div>
                  )}
                </div>
                <div className="text-[13px] font-bold tabular-nums">{formatINRFull(r.amount)}</div>
                <Badge variant="outline" className={cn("text-[11px] font-bold", STATUS[r.status].cls)}>{STATUS[r.status].label}</Badge>
                {canEdit && (
                  <div className="flex gap-1.5">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : r.status === "pending" ? (
                      <>
                        <Button size="sm" className="h-9 rounded-lg text-[12px]" onClick={() => decide.mutate({ id: r._id, status: "approved" })}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 rounded-lg text-[12px]" onClick={() => decide.mutate({ id: r._id, status: "waived" })}>
                          <X className="h-3.5 w-3.5 mr-1" /> Waive
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-9 rounded-lg text-[12px]" onClick={() => decide.mutate({ id: r._id, status: "pending" })}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Based on the phone's own report that GPS was switched off. A phone can also lose GPS by itself (battery saver, no signal), so check before
        approving. Approved penalties appear as a deduction on that month's salary.
      </p>
    </Card>
  );
}
