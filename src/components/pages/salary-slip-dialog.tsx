// Salary slip shared by the Salary and Payslips pages: the breakdown dialog,
// plain-language status labels, money formatting and a printable slip.
import { ArrowDownRight, ArrowUpRight, Printer, Receipt, RotateCcw, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatINRFull } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { isNativeApp } from "@/lib/geolocation";
import type { SalaryRecord } from "@/services/salary-service";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month?: number, year?: number): string {
  if (!month || !year) return "—";
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** ₹ with Indian grouping and at most 2 decimals (the engine keeps paise). */
export function money(amount?: number | null): string {
  return formatINRFull(Math.round((Number(amount) || 0) * 100) / 100);
}

export const STATUS_LABELS: Record<SalaryRecord["status"], string> = {
  paid: "Paid",
  pending: "Pending",
  final: "Final",
  review: "Needs review",
};

export function statusLabel(status?: string): string {
  return STATUS_LABELS[status as SalaryRecord["status"]] ?? (status || "Pending");
}

export function statusClass(status?: string): string {
  if (status === "paid") return "border-success/40 text-success bg-success/8";
  if (status === "review") return "border-amber-400/60 text-amber-700 bg-amber-50";
  if (status === "final") return "border-primary/30 text-primary bg-primary/5";
  return "border-warning/40 text-warning-foreground bg-warning/8";
}

/** Pay basis shown next to the salary: monthly, per day or per hour. */
export function salaryBasis(r: SalaryRecord): string {
  if (r.employmentType === "daily") return `${money(r.baseSalary)}/day`;
  if (r.employmentType === "hourly") return `${money(r.baseSalary)}/hour`;
  return money(r.baseSalary);
}

/** Pay earned before deductions. Older rows may lack grossSalary. */
export function earnedOf(r: SalaryRecord): number {
  if (typeof r.grossSalary === "number") return r.grossSalary;
  return (r.totalSalary || 0) + (r.deductions || 0);
}

// Remarks are stored as " | "-separated parts, some of them internal
// (the pay basis code). Keep only what an admin can act on.
const INTERNAL_PARTS = /^(Engine|Monthly|Daily|Hourly|fixed30|fixed26|calendar|workingDay)$/;
export function remarkNotes(remarks?: string): string[] {
  if (!remarks) return [];
  return remarks
    .split(" | ")
    .map((p) => p.replace(/^Validation:\s*/, "").trim())
    .flatMap((p) => p.split("; "))
    .filter((p) => p && !INTERNAL_PARTS.test(p) && !/^Payable:/.test(p) && !/^Days Worked:/.test(p) && !/^Hours Worked:/.test(p));
}

const BUCKET_LABELS: [keyof NonNullable<SalaryRecord["buckets"]>, string][] = [
  ["present", "Present"], ["wfh", "Work from home"], ["halfDay", "Half day"], ["paidLeave", "Paid leave"],
  ["weeklyOff", "Weekly off"], ["holiday", "Holiday"], ["absent", "Absent"], ["unpaidLeave", "Unpaid leave"],
  ["needsReview", "Needs checking"],
];

function daysLine(r: SalaryRecord): string | null {
  if (r.employmentType === "daily") {
    const m = /Days Worked: ([\d.]+) \(([\d.]+) hrs/.exec(r.remarks || "");
    return m ? `${m[1]} days worked (${m[2]} hours)` : null;
  }
  if (r.employmentType === "hourly") {
    const m = /Hours Worked: ([\d.]+)/.exec(r.remarks || "");
    return m ? `${m[1]} hours worked` : null;
  }
  if (r.payableDays == null) return null;
  return `${r.payableDays} of ${r.totalDaysInWindow ?? "—"} days paid`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Opens the browser's print dialog with a plain, printable slip. */
export function printSlip(r: SalaryRecord): void {
  const company = getSession()?.companyName || "";
  const rows = (items: { name: string; amount: number; included?: boolean }[], sign: string, deduction: boolean) =>
    items.map((e) => `<tr><td>${escapeHtml(e.name)}${deduction && e.included === false ? " (not deducted)" : ""}</td><td class="n">${sign}${escapeHtml(money(e.amount))}</td></tr>`).join("");
  const earnings = r.breakdown?.earnings || [];
  const deductions = r.breakdown?.deductions || [];
  const days = daysLine(r);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Salary slip</title>
<style>body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:14px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.05em}
table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #ddd}td.n{text-align:right}.muted{color:#555}.total td{font-weight:bold;font-size:16px;border-bottom:none;padding-top:12px}</style></head>
<body><p class="muted">${escapeHtml(company)}</p><h1>Salary slip — ${escapeHtml(monthLabel(r.month, r.year))}</h1>
<p><b>${escapeHtml(r.employeeId?.name || "")}</b>${r.employeeId?.phone ? ` · ${escapeHtml(r.employeeId.phone)}` : ""}</p>
<p class="muted">Salary: ${escapeHtml(salaryBasis(r))}${days ? ` · ${escapeHtml(days)}` : ""} · Status: ${escapeHtml(statusLabel(r.status))}</p>
<h2>Earnings</h2><table>${rows(earnings, "", false)}<tr class="total"><td>Earned</td><td class="n">${escapeHtml(money(earnedOf(r)))}</td></tr></table>
<h2>Deductions</h2><table>${rows(deductions, "-", true) || '<tr><td class="muted">None</td><td></td></tr>'}<tr class="total"><td>Total deductions</td><td class="n">-${escapeHtml(money(r.deductions))}</td></tr></table>
<table><tr class="total"><td>Net pay</td><td class="n">${escapeHtml(money(r.totalSalary))}</td></tr></table></body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 50);
}

interface SlipDialogProps {
  record: SalaryRecord | null;
  onClose: () => void;
  /** Shown for a paid record when the viewer may edit salaries. */
  onUndoPayment?: (r: SalaryRecord) => void;
}

export function SalarySlipDialog({ record, onClose, onUndoPayment }: SlipDialogProps) {
  const r = record;
  const showBuckets = !!r?.dailyRateBasis && !!r.buckets;
  const notes = remarkNotes(r?.remarks);
  const days = r ? daysLine(r) : null;
  const canPrint = !isNativeApp();

  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl overflow-hidden p-0 border-none shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4 shrink-0">
          <DialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-card shadow-sm border border-primary/10 grid place-items-center mb-3">
              <Receipt className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-[18px] font-bold break-words">{r?.employeeId?.name || "—"}</DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-muted-foreground">
              Salary slip — {monthLabel(r?.month, r?.year)}
            </DialogDescription>
          </DialogHeader>
        </div>

        {r && (
          <div className="p-6 space-y-5 bg-card flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Salary</p>
                <p className="font-bold truncate">{salaryBasis(r)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Days</p>
                <p className="font-bold">{days ?? "—"}</p>
              </div>
            </div>

            {r.status === "review" && (
              <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Some attendance days could not be worked out automatically. Correct them on the
                  Attendance page, then press Recalculate. This salary can't be marked paid until then.
                </p>
              </div>
            )}

            {showBuckets && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                {BUCKET_LABELS.filter(([k]) => (r.buckets?.[k] ?? 0) > 0).map(([k, label]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-bold">{r.buckets?.[k]}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-success uppercase tracking-widest">
                <ArrowUpRight className="h-3.5 w-3.5" /> Earnings
              </div>
              <div className="space-y-2.5">
                {(r.breakdown?.earnings || []).map((e, idx) => (
                  <div key={idx} className="flex justify-between items-center gap-3 text-[13px]">
                    <span className="text-muted-foreground font-medium min-w-0">{e.name}</span>
                    <span className="font-bold text-foreground shrink-0">{money(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center gap-3 text-[13px] border-t border-border/40 pt-2">
                  <span className="font-bold">Earned</span>
                  <span className="font-bold">{money(earnedOf(r))}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-destructive uppercase tracking-widest">
                <ArrowDownRight className="h-3.5 w-3.5" /> Deductions
              </div>
              <div className="space-y-2.5">
                {(r.breakdown?.deductions || []).length === 0 && (
                  <p className="text-[13px] text-muted-foreground">No deductions</p>
                )}
                {(r.breakdown?.deductions || []).map((e, idx) => (
                  <div key={idx} className="flex justify-between items-center gap-3 text-[13px]">
                    <span className="text-muted-foreground font-medium min-w-0">
                      {e.name}
                      {e.included === false && <span className="block text-[11px]">Shown only, not deducted</span>}
                    </span>
                    <span className={cn("font-bold shrink-0", e.included === false ? "text-muted-foreground line-through" : "text-destructive")}>
                      -{money(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {notes.length > 0 && (
              <div className="space-y-1 text-[12px] text-muted-foreground">
                {notes.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-muted/30 border border-border/40 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Net pay</p>
                <p className="text-[20px] font-black text-primary break-all">{money(r.totalSalary)}</p>
              </div>
              <Badge variant="outline" className={cn("px-3 py-1 rounded-full text-[11px] font-bold shrink-0", statusClass(r.status))}>
                {statusLabel(r.status)}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {canPrint && (
                <Button variant="outline" className="h-10 rounded-xl flex-1" onClick={() => printSlip(r)}>
                  <Printer className="h-4 w-4 mr-1.5" /> Print slip
                </Button>
              )}
              {r.status === "paid" && onUndoPayment && (
                <Button variant="outline" className="h-10 rounded-xl flex-1 text-amber-700 border-amber-300" onClick={() => onUndoPayment(r)}>
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Undo payment
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
