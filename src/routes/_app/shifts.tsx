import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, Clock, Users, Pencil, Trash2, Search, Sun, Moon, Sunrise, Sunset, LayoutGrid, List, Calendar, Loader2, Star, RefreshCw, WifiOff, Ban } from "lucide-react";
import { isModuleUnavailable, requestErrorMessage } from "@/services/request-error";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { useShiftService, type Shift as BackendShift, type ShiftLunch, type LunchMode } from "@/services/shift-service";
import { useEmployeeService } from "@/services/employee-service";
import { ViewToggle } from "@/components/shared/view-toggle";
import { GridCard } from "@/components/shared/grid-card";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { SettingsGuide, settingsGuideLines } from "@/components/settings/settings-guide";

/**
 * Company values a shift falls back to when it leaves a field unset. Mirrors
 * resolveGraceMs / resolveLunchPolicy in backend utils/shift_status.js, which
 * read these from Settings > Attendance > Company Fallbacks.
 */
type CompanyRules = {
  lateGrace: number; earlyGrace: number; minLunch: number; deductLunch: boolean;
  // Settings > Attendance > Half-Day Rules, which grade a shift with no grace
  // of its own (determineHalfDayStatus). Defaults are the server's.
  hdMethod: "durationBased" | "timeBased" | "both"; hdMinHours: number; hdCutoff: string; hdBothLogic: "or" | "and";
};
const DEFAULT_COMPANY_RULES: CompanyRules = {
  lateGrace: 15, earlyGrace: 5, minLunch: 30, deductLunch: true,
  hdMethod: "durationBased", hdMinHours: 4, hdCutoff: "09:35", hdBothLogic: "or",
};

const SECTION_LABEL = "text-[11px] font-black text-muted-foreground uppercase tracking-wider block";

/** "9h 0m" / "45m" */
function fmtMins(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const toMins = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * Plain-English account of what the configured shift will do.
 *
 * Presentation only: it restates the fields on screen, it never decides
 * anything. The authority stays with the server (`resolveLunchPolicy` and
 * `requiredWorkMs` in utils/shift_status.js) -- this exists so a
 * misconfiguration is visible while the admin is still looking at it, rather
 * than a month later on a payslip.
 */
function shiftSummary(f: {
  startTime: string; endTime: string; is24Hours: boolean; workDays: string[];
  halfDayLatePunchInMin: number; halfDayEarlyPunchOutMin: number;
  lunch: { mode: LunchMode; startTime?: string | null; endTime?: string | null; durationMins?: number | null; minMins?: number | null; maxMins?: number | null };
}, company: CompanyRules): { text: string; tone: string }[] {
  const start = toMins(f.startTime);
  const end = toMins(f.endTime);
  const span = end <= start ? end + 1440 - start : end - start;
  const lines: { text: string; tone: string }[] = [];

  lines.push({
    tone: "bg-primary",
    text: f.is24Hours
      ? `Runs the full day, ${fmtMins(span)}, on ${f.workDays.length} day${f.workDays.length === 1 ? "" : "s"} a week.`
      : `${to12hLabel(f.startTime)} to ${to12hLabel(f.endTime)} — ${fmtMins(span)} on `
        + `${f.workDays.length} day${f.workDays.length === 1 ? "" : "s"} a week`
        + `${end <= start ? ", crossing midnight" : ""}.`,
  });

  const L = f.lunch;
  let lunchMins = 0;
  if (!company.deductLunch) {
    // Settings > Attendance > Half-Day Rules > "Deduct lunch" off beats every shift.
    lines.push({ tone: "bg-muted-foreground/50", text: "Lunch deduction is switched off company-wide in Settings > Attendance, so nothing is deducted whatever this shift says." });
  } else if (L.mode === "inherit") {
    lunchMins = Math.max(0, Number(company.minLunch) || 0);
    lines.push({ tone: "bg-warning", text: `Lunch follows the company default: at least ${fmtMins(lunchMins)} is deducted every working day, more if a longer break is punched. Change it in Settings > Attendance > Company Fallbacks.` });
  } else if (L.mode === "none") {
    lines.push({ tone: "bg-success", text: "No lunch is deducted. Credited hours equal the time between punches." });
  } else if (L.mode === "fixed_window") {
    // Wraps past midnight like scheduledLunchMs does (a 23:30-00:30 night lunch is 1h, not 0).
    const w = (toMins(L.endTime || "") - toMins(L.startTime || "") + 1440) % 1440;
    lunchMins = w;
    lines.push({ tone: "bg-warning", text: `Lunch ${to12hLabel(L.startTime || "")} to ${to12hLabel(L.endTime || "")} (${fmtMins(w)}). Only the part actually worked through is deducted — someone not at work then loses nothing.` });
  } else if (L.mode === "fixed_duration") {
    lunchMins = Number(L.durationMins) || 0;
    lines.push({ tone: "bg-warning", text: `${fmtMins(lunchMins)} is deducted every working day, whether or not a break is punched.` });
  } else if (L.mode === "from_punches") {
    const parts = [
      L.minMins != null ? `counted as at least ${fmtMins(Number(L.minMins))}` : null,
      L.maxMins != null ? `never more than ${fmtMins(Number(L.maxMins))}` : null,
    ].filter(Boolean).join(", ");
    lines.push({ tone: "bg-success", text: `Only a break that was actually punched is deducted${parts ? ` — ${parts}` : ""}. Nothing is docked if no lunch is punched.` });
  } else {
    lines.push({ tone: "bg-muted-foreground/50", text: "No lunch deduction configured for this shift." });
  }

  // The Full Day bar, stated as a sum the admin can check against a payslip.
  // Mirrors requiredWorkMs() in the backend: span - lunch - grace in - grace out.
  // Shown with the grace values worked in, because a bar quoted "before grace"
  // is not the number anyone is actually measured against.
  // Each direction falls back to the company value independently when the
  // shift's own box is 0 -- the same rule as resolveGraceMs on the server.
  const ownIn = Math.max(0, Number(f.halfDayLatePunchInMin) || 0);
  const ownOut = Math.max(0, Number(f.halfDayEarlyPunchOutMin) || 0);
  const graceIn = ownIn || Math.max(0, Number(company.lateGrace) || 0);
  const graceOut = ownOut || Math.max(0, Number(company.earlyGrace) || 0);
  const hasOwnGrace = ownIn > 0 || ownOut > 0;

  const bar = Math.max(0, span - lunchMins - graceIn - graceOut);
  const sum = [
    `${fmtMins(span)} shift`,
    lunchMins > 0 ? `${fmtMins(lunchMins)} lunch` : null,
    graceIn > 0 ? `${fmtMins(graceIn)} late grace` : null,
    graceOut > 0 ? `${fmtMins(graceOut)} early grace` : null,
  ].filter(Boolean).join(" − ");

  // What a Full Day actually needs. With its own grace the shift is graded on
  // hours alone (the bar). Without, determineHalfDayStatus applies the COMPANY
  // Half-Day Rules as well, and gradeDay still downgrades below the bar -- so
  // both have to pass. Stating only the bar here told admins 7h 50m was
  // enough on shifts where the company minimum of 8h was the real line.
  const minHrs = Math.max(0, Number(company.hdMinHours) || 0) * 60;
  const cutoff = company.hdCutoff;
  let need = bar;
  let fullDay = `A Full Day needs ${fmtMins(bar)} of credited work (${sum}). Anything less is a Half Day.`;
  if (!hasOwnGrace) {
    const rulesAt = "Settings > Attendance > Half-Day Rules";
    const needHours = company.hdMethod === "durationBased" || (company.hdMethod === "both" && company.hdBothLogic !== "and");
    if (needHours) need = Math.max(bar, minHrs);
    const hoursPart = needHours && minHrs > bar
      ? `${fmtMins(need)} of credited work: the company minimum in ${rulesAt}, which is more than this shift's own ${fmtMins(bar)} (${sum})`
      : `${fmtMins(bar)} of credited work (${sum})`;
    if (company.hdMethod === "durationBased") {
      fullDay = `A Full Day needs ${hoursPart}. Anything less is a Half Day.`;
    } else if (company.hdMethod === "timeBased") {
      fullDay = `A Full Day needs ${hoursPart}, and a punch-in by ${to12hLabel(cutoff)} (the company late cut-off in ${rulesAt}). After that the day is a Half Day whatever the hours.`;
    } else if (company.hdBothLogic === "and") {
      fullDay = `A Full Day needs ${hoursPart}. A day that is also both shorter than ${fmtMins(minHrs)} and punched in after ${to12hLabel(cutoff)} is a Half Day (${rulesAt}).`;
    } else {
      fullDay = `A Full Day needs ${hoursPart}, and a punch-in by ${to12hLabel(cutoff)} (${rulesAt}). Missing either is a Half Day.`;
    }
    // The cut-off is a fixed clock time, not relative to the shift.
    if (company.hdMethod !== "durationBased" && start > toMins(cutoff)) {
      lines.push({ tone: "bg-destructive", text: `This shift starts after the company late cut-off (${to12hLabel(cutoff)}), so under the time rule every punch-in on it counts as late. Set a late or early grace on this shift to grade it on hours instead.` });
    }
  }
  lines.push({ tone: "bg-primary", text: fullDay });

  // How much lateness, early leaving and extra break the day can absorb.
  const maxCredit = span - lunchMins;
  const slack = maxCredit - need;
  if (slack < 0) {
    lines.push({ tone: "bg-destructive", text: `This shift can credit at most ${fmtMins(maxCredit)}, so nobody on it can reach a Full Day.` });
  } else if (slack === 0) {
    lines.push({ tone: "bg-destructive", text: `That is every credited minute of the shift: arriving a minute late, leaving a minute early, or a longer break makes the day a Half Day.` });
  }
  if (company.deductLunch && slack >= 0) {
    if (L.mode === "from_punches") {
      const floor = Number(L.minMins) || 0;
      lines.push({
        tone: "bg-warning",
        text: floor > slack
          ? `The Full Day bar does not allow for lunch in this mode, and any punched break counts as at least ${fmtMins(floor)}, so punching a lunch at all makes the day a Half Day. Add a late or early grace of at least that much, or pick another lunch option.`
          : `The Full Day bar does not allow for lunch in this mode: a punched break longer than ${fmtMins(slack)} makes an otherwise full day a Half Day (time after the shift ends is not counted, so it cannot be made up).`,
      });
    } else if (L.mode === "inherit" || L.mode === "fixed_window") {
      lines.push({ tone: "bg-warning", text: `A punched break longer than ${fmtMins(lunchMins + slack)} is deducted in full and makes an otherwise full day a Half Day.` });
    }
  }

  if (hasOwnGrace) {
    const bits = [
      graceIn > 0 ? `up to ${fmtMins(graceIn)} late` : null,
      graceOut > 0 ? `up to ${fmtMins(graceOut)} early` : null,
    ].filter(Boolean).join(", and leaving ");
    const borrowed = [!ownIn && graceIn > 0 ? "late" : null, !ownOut && graceOut > 0 ? "early" : null].filter(Boolean).join(" and ");
    lines.push({ tone: "bg-success", text: `Arriving ${bits}, costs nothing on its own — only the hours decide.${borrowed ? ` The ${borrowed} grace comes from the company fallback.` : ""}` });
  } else {
    lines.push({ tone: "bg-muted-foreground/50", text: `No shift grace set, so the company fallbacks apply (${fmtMins(graceIn)} late, ${fmtMins(graceOut)} early) and the day is graded by Settings > Attendance > Half-Day Rules.` });
  }

  return lines;
}

/** "09:30" -> "9:30 AM" */
function to12hLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return hhmm || "—";
  const h = Number(m[1]);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m[2]} ${period}`;
}

const MAX_SHIFT_NAME = 60;

/**
 * The same checks the server makes (shift_controller readShiftInput and
 * crossCheck), run before the request so the admin reads the problem while
 * the form is still open. The server stays the authority.
 */
function validateShiftForm(f: {
  name: string; startTime: string; endTime: string; is24Hours: boolean; workDays: string[];
  halfDayLatePunchInMin: number; halfDayEarlyPunchOutMin: number;
  lunch: { mode: LunchMode; startTime?: string | null; endTime?: string | null; durationMins?: number | null; minMins?: number | null; maxMins?: number | null };
}): string | null {
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!f.name.trim()) return "Enter a shift name.";
  if (f.name.trim().length > MAX_SHIFT_NAME) return `The shift name is too long (${MAX_SHIFT_NAME} characters at most).`;
  if (!HHMM.test(f.startTime) || !HHMM.test(f.endTime)) return "Set the shift start and end time.";
  if (f.startTime === f.endTime) return "The start and end time cannot be the same. For a shift that runs all day, switch on 24 Hours Shift.";
  if (f.workDays.length === 0) return "Pick at least one working day.";

  const grace = [f.halfDayLatePunchInMin, f.halfDayEarlyPunchOutMin].map((v) => Number(v) || 0);
  if (grace.some((g) => g < 0)) return "Grace cannot be less than 0 minutes.";
  if (grace.some((g) => !Number.isInteger(g))) return "Grace must be a whole number of minutes.";

  const start = toMins(f.startTime);
  const span = toMins(f.endTime) <= start ? toMins(f.endTime) + 1440 - start : toMins(f.endTime) - start;
  const L = f.lunch;
  let lunchMins = 0;
  if (L.mode === "fixed_window") {
    if (!HHMM.test(L.startTime || "") || !HHMM.test(L.endTime || "")) return "Set both a lunch start and end time.";
    if (L.startTime === L.endTime) return "Lunch start and end cannot be the same time.";
    // Measured from the shift start, so a night shift's 02:00 lunch counts as
    // inside a 22:00-06:00 shift.
    const from = (toMins(L.startTime!) - start + 1440) % 1440;
    const len = (toMins(L.endTime!) - toMins(L.startTime!) + 1440) % 1440;
    if (from + len > span) {
      return `The lunch break (${to12hLabel(L.startTime!)} to ${to12hLabel(L.endTime!)}) must fall inside the shift (${to12hLabel(f.startTime)} to ${to12hLabel(f.endTime)}).`;
    }
    lunchMins = len;
  } else if (L.mode === "fixed_duration") {
    const d = Number(L.durationMins);
    if (!(d > 0)) return "Lunch length must be more than 0 minutes.";
    if (!Number.isInteger(d)) return "Lunch length must be a whole number of minutes.";
    if (d > 720) return "Lunch length cannot be more than 12 hours.";
    if (d >= span) return `The lunch break (${fmtMins(d)}) must be shorter than the shift (${fmtMins(span)}).`;
    lunchMins = d;
  } else if (L.mode === "from_punches") {
    const mn = L.minMins == null ? null : Number(L.minMins);
    const mx = L.maxMins == null ? null : Number(L.maxMins);
    if ((mn !== null && mn < 0) || (mx !== null && mx < 0)) return "Lunch minutes cannot be less than 0.";
    if (mx !== null && mx === 0) return "The longest lunch counted must be more than 0 minutes, or left blank.";
    if (mn !== null && mx !== null && mx < mn) return "The longest lunch counted cannot be less than the shortest.";
  }
  if (grace[0] + grace[1] + lunchMins >= span) {
    return `Late grace, early grace and lunch add up to ${fmtMins(grace[0] + grace[1] + lunchMins)}, which leaves no working time in this ${fmtMins(span)} shift. Lower them.`;
  }
  return null;
}

const LUNCH_MODES = [
  { label: "Fixed window (e.g. 1pm - 2pm)", value: "fixed_window" },
  { label: "Fixed length (e.g. 1 hour)", value: "fixed_duration" },
  { label: "Calculate from punches", value: "from_punches" },
  { label: "No lunch deduction", value: "none" },
];

const LUNCH_HELP: Record<string, string> = {
  fixed_window:
    "Only the part of this window the employee actually worked through is deducted. Someone who was not at work then loses nothing.",
  fixed_duration: "This exact length is deducted every working day, punched or not.",
  from_punches:
    "Deducts exactly the break that was punched, and nothing at all if none was. Use this when employees reliably punch their lunch.",
  none: "Nothing is ever deducted. Worked hours equal the time between punches.",
  inherit:
    "The older setting this shift was saved with: the company default lunch in Settings > Attendance > Company Fallbacks is deducted. Pick another option to give this shift its own rule.",
};

// Offered only for a shift already saved on it, so opening and saving an
// existing shift never silently changes what it deducts. New shifts cannot
// choose it.
const INHERIT_OPTION = { label: "Company default (legacy)", value: "inherit" };
import { toast } from "sonner";
import { cn, formatTime12h } from "@/lib/utils";
import { ActionButton } from "@/components/shared/action-button";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { useEffect } from "react";
import { usePermission } from "@/hooks/use-permission";
import { apiClient } from "@/lib/api-client";
import { DAY_LABELS } from "@/lib/constants";

const ALL_DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;

const to12h = (time24: string) => {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return { hour, minute: m, ampm };
};

const to24h = (hour: number, minute: number, ampm: string) => {
  let h = hour % 12;
  if (ampm === "PM") h += 12;
  return `${h.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

function TimePickerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { hour, minute, ampm } = to12h(value);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider block">{label}</label>
      <div className="flex items-center gap-1 h-10 px-2 rounded-xl border border-border/60 bg-muted/10 focus-within:border-primary transition-colors">
        <select
          className="bg-transparent text-[14px] font-semibold text-foreground outline-none w-10 text-center"
          value={hour}
          onChange={(e) => onChange(to24h(Number(e.target.value), minute, ampm))}
        >
          {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
        </select>
        <span className="text-muted-foreground font-bold text-[14px]">:</span>
        <select
          className="bg-transparent text-[14px] font-semibold text-foreground outline-none w-10 text-center"
          value={minute}
          onChange={(e) => onChange(to24h(hour, Number(e.target.value), ampm))}
        >
          {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
        <div className="flex ml-1 rounded-lg overflow-hidden border border-border/40">
          {["AM", "PM"].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(to24h(hour, minute, p))}
              className={cn(
                "px-2 py-0.5 text-[11px] font-bold transition-all",
                ampm === p ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/shifts")({
  component: ShiftsPage,
});

const SHIFT_ICONS: Record<string, typeof Sun> = {
  Morning: Sunrise,
  General: Sun,
  Evening: Sunset,
  Night: Moon,
};

const SHIFT_GRADIENTS: Record<string, string> = {
  Morning: "from-amber-400/15 to-orange-300/5",
  General: "from-primary/15 to-primary/5",
  Evening: "from-purple-400/15 to-indigo-300/5",
  Night: "from-slate-600/15 to-slate-400/5",
};

const SHIFT_ICON_COLORS: Record<string, string> = {
  Morning: "text-amber-600 bg-amber-500/10",
  General: "text-primary bg-primary/10",
  Evening: "text-purple-600 bg-purple-500/10",
  Night: "text-slate-600 bg-slate-500/10",
};


function ShiftsPage() {
  const {
    shifts: list, usage, isLoading, error: loadError, refetch, isRefetching,
    createShift, updateShift, deleteShift, isCreating, isUpdating, isDeleting,
  } = useShiftService();
  const { employees = [], updateEmployee, isUpdating: isAssigning } = useEmployeeService({ limit: 1000, status: "active" });
  // A second click (or Enter) that lands before React re-renders the disabled
  // Save button would otherwise send the same shift twice.
  const savingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendShift | null>(null);
  const [globalWorkDays, setGlobalWorkDays] = useState<string[]>(["M", "T", "W", "Th", "F", "Sa"]);
  const [form, setForm] = useState({ name: "", startTime: "09:00", endTime: "18:00", workDays: ["M", "T", "W", "Th", "F", "Sa"], is24Hours: false, halfDayLatePunchInMin: 0, halfDayEarlyPunchOutMin: 0, lunch: { mode: "fixed_window" as LunchMode, startTime: "13:00", endTime: "14:00", durationMins: 60, minMins: 30 as number | null, maxMins: 90 as number | null } });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("shifts", "create");
  const canEdit = can("shifts", "edit");
  const canDelete = can("shifts", "delete");
  // Assigning writes the EMPLOYEE record (PUT /users/employees/:id), which the
  // server gates on employees.edit -- not shifts.edit. Showing it on shifts.edit
  // offered sub-admins a button that always failed with "Access denied".
  const canAssign = can("employees", "edit");
  const atLimit = usage?.limit != null && usage.used >= usage.limit;

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [companyRules, setCompanyRules] = useState<CompanyRules>(DEFAULT_COMPANY_RULES);
  // Settings > Attendance > Default Shift. The server refuses to delete it,
  // so the page marks it and says so before the click.
  const [defaultShiftId, setDefaultShiftId] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get("/settings").then(({ data }) => {
      const a = data?.attendance;
      if (a?.workDays?.length) {
        setGlobalWorkDays(a.workDays);
      }
      setDefaultShiftId(a?.defaultShiftId ? String(a.defaultShiftId) : null);
      if (a) {
        const hdr = a.halfDayRules || {};
        setCompanyRules({
          lateGrace: a.lateGrace ?? DEFAULT_COMPANY_RULES.lateGrace,
          earlyGrace: a.earlyGrace ?? DEFAULT_COMPANY_RULES.earlyGrace,
          minLunch: a.minLunch ?? DEFAULT_COMPANY_RULES.minLunch,
          deductLunch: hdr.deductLunch !== false,
          // Same fallbacks as determineHalfDayStatus.
          hdMethod: ["durationBased", "timeBased", "both"].includes(hdr.method) ? hdr.method : "durationBased",
          hdMinHours: hdr.minHours != null ? Number(hdr.minHours) : (a.halfDayHours ?? DEFAULT_COMPANY_RULES.hdMinHours),
          hdCutoff: /^\d{1,2}:\d{2}$/.test(hdr.cutoffTime || "") ? hdr.cutoffTime : DEFAULT_COMPANY_RULES.hdCutoff,
          hdBothLogic: hdr.bothLogic === "and" ? "and" : "or",
        });
      }
    }).catch(() => {});
  }, []);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<{ employeeId: string; shiftIds: string[] }>({ employeeId: "", shiftIds: [] });

  const needle = search.trim().toLowerCase();
  const filtered = list.filter((s) => String(s.name || "").toLowerCase().includes(needle));

  // Assignment lives on the employee record (User.shiftId / shiftIds), not on
  // the Shift document, so both the count and the actual names per shift have
  // to be derived from the employees list rather than trusting a
  // `shift.assigned` field the backend never sets. An employee can now be
  // assigned multiple shifts (shiftIds), with shiftId kept as the primary one
  // used for attendance/lateness timing — dedupe the two here.
  const getEmployeeShiftIds = (e: any): string[] => {
    const ids = new Set<string>();
    const primary = e?.shiftId && typeof e.shiftId === "object" ? e.shiftId._id : e?.shiftId;
    if (primary) ids.add(primary);
    if (Array.isArray(e?.shiftIds)) {
      e.shiftIds.forEach((s: any) => {
        const id = s && typeof s === "object" ? s._id : s;
        if (id) ids.add(id);
      });
    }
    return Array.from(ids);
  };

  const assignedEmployeesByShift = employees.reduce<Record<string, { _id: string; name: string }[]>>((acc, e: any) => {
    getEmployeeShiftIds(e).forEach((shiftId) => {
      (acc[shiftId] ||= []).push({ _id: e._id, name: e.name });
    });
    return acc;
  }, {});

  const assignedCounts = Object.fromEntries(
    Object.entries(assignedEmployeesByShift).map(([shiftId, list]) => [shiftId, list.length])
  );
  // The server's count (every active employee, primary or secondary) is the
  // one that decides a delete, and is not capped by the 1000-row employee
  // fetch above; the local count is only a fallback for an older backend.
  const activeCountFor = (s: BackendShift) => s.activeEmployees ?? assignedCounts[s._id] ?? 0;

  const totalAssigned = employees.filter((e: any) => getEmployeeShiftIds(e).length > 0).length;

  const handleEmployeeChange = (empId: string) => {
    const emp = employees.find((e: any) => e._id === empId);
    setAssignForm({ employeeId: empId, shiftIds: emp ? getEmployeeShiftIds(emp) : [] });
  };

  const toggleAssignShift = (shiftId: string) => {
    setAssignForm((prev) => ({
      ...prev,
      shiftIds: prev.shiftIds.includes(shiftId)
        ? prev.shiftIds.filter((id) => id !== shiftId)
        : [...prev.shiftIds, shiftId],
    }));
  };

  const to12h = (time24: string) => {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return { hour: String(hour), minute: String(m).padStart(2, "0"), period };
  };

  const to24h = (hour: string, minute: string, period: string) => {
    let h = parseInt(hour);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${minute}`;
  };

  // A shift saved with no days of its own (workDays null -- 24 of 26 stored
  // shifts) follows Settings > Attendance > Active Work Days. The dialog shows
  // the company days for it, and saving used to pin that list onto the shift,
  // so a later change to the company days silently stopped applying to it.
  // Until a day is actually toggled, it keeps following the company.
  const [followsCompanyDays, setFollowsCompanyDays] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setFollowsCompanyDays(false);
    setForm({ name: "", startTime: "09:00", endTime: "18:00", workDays: globalWorkDays, is24Hours: false, halfDayLatePunchInMin: 0, halfDayEarlyPunchOutMin: 0, lunch: { mode: "fixed_window" as LunchMode, startTime: "13:00", endTime: "14:00", durationMins: 60, minMins: 30 as number | null, maxMins: 90 as number | null } });
    setOpen(true);
  };

  const openEdit = (s: BackendShift) => {
    setEditing(s);
    const is24 = s.startTime === "00:00" && s.endTime === "23:59";
    // Keep whatever the shift was saved with. A missing mode IS `inherit` --
    // that is the backend schema default -- so it must not be rewritten to
    // another mode just because the dialog was opened and saved.
    const initialMode: LunchMode = s.lunch?.mode || "inherit";
    const ownDays = Array.isArray(s.workDays) && s.workDays.length > 0;
    setFollowsCompanyDays(!ownDays);
    setForm({
      name: s.name, startTime: s.startTime, endTime: s.endTime,
      workDays: ownDays ? (s.workDays as string[]) : globalWorkDays, is24Hours: is24,
      halfDayLatePunchInMin: s.halfDayLatePunchInMin || 0,
      halfDayEarlyPunchOutMin: s.halfDayEarlyPunchOutMin || 0,
      lunch: {
        mode: initialMode,
        // Defaults for the inputs the SAVED mode does not use, so switching
        // mode inside the dialog never presents an empty required field.
        startTime: s.lunch?.startTime || "13:00",
        endTime: s.lunch?.endTime || "14:00",
        durationMins: s.lunch?.durationMins ?? 60,
        minMins: s.lunch?.minMins ?? 30,
        maxMins: s.lunch?.maxMins ?? 90,
      },
    });
    setOpen(true);
  };

  const toggleWorkDay = (day: string) => {
    setFollowsCompanyDays(false);
    setForm(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day]
    }));
  };

  /**
   * Only the fields the chosen mode actually uses.
   *
   * Sending a duration alongside `fixed_window` stores a contradiction that
   * reads fine today and surprises whoever changes the mode next month.
   */
  const lunchPayload = (): ShiftLunch => {
    const L = form.lunch;
    if (L.mode === "fixed_window") return { mode: L.mode, startTime: L.startTime, endTime: L.endTime };
    if (L.mode === "fixed_duration") return { mode: L.mode, durationMins: Number(L.durationMins) || 0 };
    if (L.mode === "from_punches") {
      return {
        mode: L.mode,
        minMins: L.minMins === null || L.minMins === undefined ? null : Number(L.minMins),
        maxMins: L.maxMins === null || L.maxMins === undefined ? null : Number(L.maxMins),
      };
    }
    return { mode: L.mode };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;

    // Same rules as the server, so the message arrives while the form is open.
    const problem = validateShiftForm(form);
    if (problem) { toast.error(problem); return; }

    // Only the fields the server stores. `is24Hours` is a screen-only switch
    // (a 24-hour shift IS 00:00-23:59), and used to be posted as well.
    const { is24Hours: _is24Hours, ...rest } = form;
    const payload = {
      ...rest,
      name: form.name.trim(),
      workDays: followsCompanyDays ? null : ALL_DAYS.filter((d) => form.workDays.includes(d)),
      lunch: lunchPayload(),
    };

    savingRef.current = true;
    try {
      if (editing) {
        await updateShift({ id: editing._id, ...payload });
      } else {
        await createShift(payload);
      }
      setOpen(false);
    } catch (err) {
      // Error handled by service
    } finally {
      savingRef.current = false;
    }
  };

  const remove = async () => {
    if (!deleteId || isDeleting) return;
    try {
      await deleteShift(deleteId);
      setDeleteId(null);
    } catch (err) {
      // Error handled by service. A 409 (still in use / default) keeps the
      // dialog open, which the refreshed counts then re-word.
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.employeeId || assignForm.shiftIds.length === 0) {
      toast.error("Select an employee and at least one shift");
      return;
    }
    try {
      await updateEmployee({ id: assignForm.employeeId, data: { shiftIds: assignForm.shiftIds } });
      setAssignOpen(false);
    } catch (err) {
      // Error toast handled by employee service
    }
  };

  const openAssign = (employeeId?: string) => {
    const first = employeeId || (employees.length > 0 ? employees[0]._id : "");
    if (first) handleEmployeeChange(first);
    setAssignOpen(true);
  };

  const deleteTarget = deleteId ? list.find((s) => s._id === deleteId) ?? null : null;
  const deleteActive = deleteTarget ? activeCountFor(deleteTarget) : 0;
  const deleteTotal = deleteTarget?.employees ?? deleteActive;
  const deleteIsDefault = !!deleteTarget && defaultShiftId === deleteTarget._id;
  const deleteBlocked = deleteIsDefault || deleteActive > 0;
  const deleteAssignees = deleteTarget ? assignedEmployeesByShift[deleteTarget._id] || [] : [];
  const deleteNames = deleteAssignees.map((e) => e.name).filter(Boolean);
  const deleteFirstAssignee = deleteAssignees[0]?._id;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shift Management" description="Define working hours and assign shifts to your team." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={4} />
      </div>
    );
  }

  // The list failed and there is nothing cached to show. This used to fall
  // through to the EMPTY state: "No shifts found" with zero totals, next to a
  // New Shift button inviting the admin to recreate shifts that still exist.
  if (loadError && list.length === 0) {
    const planBlocked = isModuleUnavailable(loadError);
    const offline = !(loadError as { response?: unknown })?.response;
    return (
      <div className="space-y-6">
        <PageHeader title="Shift Management" description="Define working hours and assign shifts to your team." />
        {planBlocked ? (
          <div role="status" className="rounded-2xl border border-border/60 bg-white p-8 text-center shadow-sm">
            <Ban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-[15px] font-bold text-foreground">Shift management is not in your plan</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Your current plan does not include shifts. The account owner can change the plan from Plan &amp; Billing.
            </p>
          </div>
        ) : (
          <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
            <WifiOff className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
            <p className="text-[15px] font-bold text-foreground">Could not load your shifts</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              {offline
                ? "Check your internet connection, then try again."
                : requestErrorMessage(loadError, "The server could not send the shifts just now.") || "The server could not send the shifts just now."}{" "}
              Nothing has been changed or deleted.
            </p>
            <Button type="button" onClick={() => void refetch()} disabled={isRefetching} className="mt-4 h-11 rounded-xl px-6 font-bold">
              <RefreshCw className={isRefetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {isRefetching ? "Loading..." : "Try again"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift Management"
        description="Define working hours and assign shifts to your team."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canCreate && usage?.limit != null && (
              <span className={cn("text-xs font-semibold", atLimit ? "text-amber-600" : "text-muted-foreground")}>
                {usage.used} of {usage.limit} used on your plan
              </span>
            )}
            {canAssign && list.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-10 sm:h-9 text-[13px] rounded-lg"
                onClick={() => openAssign()}
              >
                <Users className="h-4 w-4 mr-1.5" />Assign Shift
              </Button>
            )}
            {canCreate && (
              <Button
                size="sm"
                className="h-10 sm:h-9 text-[13px] bg-gradient-primary text-primary-foreground px-4 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                onClick={openAdd}
                disabled={atLimit}
                title={atLimit ? "Your plan's shift limit is reached. Ask your provider to upgrade the plan to add more." : undefined}
              >
                <Plus className="h-4 w-4 mr-1.5" />New Shift
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Total Shifts" value={list.length} icon={Clock} accent="primary" delay={0} />
        <StatCard label="Total Assigned" value={totalAssigned} icon={Users} accent="success" delay={0.05} />
        <StatCard label="Avg per Shift" value={list.length ? Math.round(totalAssigned / list.length) : 0} icon={Sun} accent="warning" delay={0.1} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
        </div>

        <FormInput
          placeholder="Search shifts..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid View */}
      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((s, i) => {
              const ShiftIcon = SHIFT_ICONS[s.name] || Clock;
              const gradient = SHIFT_GRADIENTS[s.name] || "from-primary/15 to-primary/5";
              const iconColor = SHIFT_ICON_COLORS[s.name] || "text-primary bg-primary/10";
              return (
                <motion.div
                  key={s._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={`group relative overflow-hidden p-5 border border-border/50 bg-white rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 h-full flex flex-col`}>
                    {/* Top gradient bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r ${gradient.replace("/15", "/60").replace("/5", "/30")} rounded-t-xl`} />

                    <div className="flex items-start justify-between mb-4 mt-1">
                      <div className={`h-12 w-12 rounded-xl grid place-items-center shadow-sm ${iconColor}`}>
                        <ShiftIcon className="h-5.5 w-5.5" />
                      </div>
                      <div className="flex items-center gap-1.5 translate-y-[-4px]">
                        {canEdit && (
                          <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} title="Edit shift" className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} title="Delete shift" className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => setDeleteId(s._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="text-[16px] font-semibold text-foreground mb-1 break-words">{s.name}</h3>
                      {defaultShiftId === s._id && (
                        <Badge variant="outline" className="mb-1.5 text-[11px] font-bold px-2 py-0.5 border-primary/30 bg-primary/5 text-primary gap-1" title="New employees start on this shift (Settings > Attendance > Default Shift)">
                          <Star className="h-3 w-3" /> Company default
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 text-[14px] text-muted-foreground font-mono">
                        <Clock className="h-3.5 w-3.5 text-primary/50" />
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </div>

                      {/* Duration & Half Day Badges */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 border-border/40 bg-muted/20">
                          {(() => {
                            const [sh, sm] = s.startTime.split(":").map(Number);
                            const [eh, em] = s.endTime.split(":").map(Number);
                            let diff = (eh * 60 + em) - (sh * 60 + sm);
                            if (diff < 0) diff += 24 * 60;
                            return `${Math.floor(diff / 60)}h ${diff % 60}m`;
                          })()}
                        </Badge>
                        {toMins(s.endTime) < toMins(s.startTime) && (
                          <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5 bg-slate-500/10 text-slate-700 border-none gap-1" title="Ends the next day">
                            <Moon className="h-3 w-3" /> Overnight
                          </Badge>
                        )}
                        {s.halfDayLatePunchInMin ? (
                          <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5 bg-amber-500/10 text-amber-700 border-none">
                            Late grace: {s.halfDayLatePunchInMin}m
                          </Badge>
                        ) : null}
                        {s.halfDayEarlyPunchOutMin ? (
                          <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5 bg-orange-500/10 text-orange-700 border-none">
                            Early grace: {s.halfDayEarlyPunchOutMin}m
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/40 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-primary/80 bg-primary/5 px-2 py-0.5 rounded-md">
                        <Users className="h-3.5 w-3.5" /> {activeCountFor(s)} assigned
                      </div>
                      <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
                      </span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataTable
              headers={["Shift Name", "Timing", "Duration", "Assigned", "Created", "Actions"]}
            >
              {filtered.map((s) => (
                <DataTableRow key={s._id}>
                  <DataTableCell isFirst>
                    <span className="text-[14px] font-medium">{s.name}</span>
                    {defaultShiftId === s._id && (
                      <Badge variant="outline" className="ml-2 text-[11px] font-bold px-1.5 py-0 border-primary/30 bg-primary/5 text-primary gap-1" title="New employees start on this shift (Settings > Attendance > Default Shift)">
                        <Star className="h-3 w-3" /> Default
                      </Badge>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-mono">
                        <Clock className="h-3.5 w-3.5 text-primary/50" />
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </div>
                      {(s.halfDayLatePunchInMin || s.halfDayEarlyPunchOutMin) ? (
                        <div className="text-[11px] text-muted-foreground/60 pl-5">
                          HD: {[
                            s.halfDayLatePunchInMin ? `late grace ${s.halfDayLatePunchInMin}m` : null,
                            s.halfDayEarlyPunchOutMin ? `early grace ${s.halfDayEarlyPunchOutMin}m` : null
                          ].filter(Boolean).join(" / ")}
                        </div>
                      ) : null}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className="text-[11px] font-medium px-2 py-0.5 border-border/40 bg-muted/10">
                      {(() => {
                        const [sh, sm] = s.startTime.split(":").map(Number);
                        const [eh, em] = s.endTime.split(":").map(Number);
                        let diff = (eh * 60 + em) - (sh * 60 + sm);
                        if (diff < 0) diff += 24 * 60;
                        return `${Math.floor(diff / 60)}h ${diff % 60}m`;
                      })()}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">{activeCountFor(s)}</Badge>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' - ')}
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Shift"
                          onClick={() => openEdit(s)}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Shift"
                          onClick={() => setDeleteId(s._id)}
                        />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          {list.length === 0 ? (
            <>
              <p className="text-[14px] text-muted-foreground">No shifts yet</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">
                {canCreate ? "Create a shift, then assign it to your employees." : "Ask an admin to create a shift."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] text-muted-foreground">No shift matches &ldquo;{search.trim()}&rdquo;</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">Try a different name.</p>
            </>
          )}
        </div>
      )}

      {/* Same closing guide the Settings tabs carry, so "what is this for and
          what is the default" is answered in the same place and the same
          words everywhere. */}
      <SettingsGuide
        title="About shifts"
        lines={settingsGuideLines("shifts", {
          shiftCount: list.length,
          branchCount: 0,
          workDayCount: globalWorkDays.length,
          requireLocation: false,
          remotePunch: false,
          payrollEnabled: false,
          dailyRateBasis: "fixed30",
          sandwichRuleEnabled: false,
          roundingMode: "nearest",
          roundingPrecision: 0,
          templateCount: 0,
          notifEmail: false,
          notifPush: false,
          notifWeekly: false,
        })}
      />

      {/* Create/Edit Shift Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Capped at 90vh with only the BODY scrolling, so the footer stays
            reachable. The dialog previously grew with its content and pushed
            Save off-screen once the lunch section opened. */}
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 space-y-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 text-primary grid place-items-center">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[15px] leading-tight">{editing ? "Edit Shift" : "New Shift"}</DialogTitle>
                <DialogDescription className="text-[12px] leading-tight">
                  Timings, working days, lunch and half-day rules.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <FormInput
              label="Shift Name"
              placeholder="e.g. Morning"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={MAX_SHIFT_NAME}
              className="h-10"
              containerClassName="space-y-1"
            />

            {/* 24h is a one-line switch rather than a card: it is a rare choice
                and was taking as much height as the times it replaces. */}
            <div className={cn(
              "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all",
              form.is24Hours ? "bg-primary/5 border-primary/40" : "bg-muted/20 border-border/40"
            )}>
              <p className="text-[12px] font-bold text-foreground">
                24 Hours Shift
                <span className="ml-1.5 font-normal text-muted-foreground">12:00 AM – 11:59 PM</span>
              </p>
              <Switch
                checked={form.is24Hours}
                onCheckedChange={(v) => setForm(prev => ({
                  ...prev,
                  is24Hours: v,
                  startTime: v ? "00:00" : "09:00",
                  endTime:   v ? "23:59" : "18:00",
                }))}
              />
            </div>

            {/* Time Pickers — hidden when 24h is on */}
            {!form.is24Hours ? (
              <div className="grid grid-cols-2 gap-3">
                {(["start", "end"] as const).map((which) => {
                  const timeKey = which === "start" ? "startTime" : "endTime";
                  const { hour, minute, period } = to12h(form[timeKey]);
                  const setTime = (h: string, m: string, p: string) =>
                    setForm(prev => ({ ...prev, [timeKey]: to24h(h, m, p) }));
                  return (
                    <div key={which} className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        {which === "start" ? "Start Time" : "End Time"}
                      </label>
                      <div className="flex items-center h-11 rounded-xl border border-border/60 bg-white overflow-hidden divide-x divide-border/40 focus-within:border-primary/60 transition-colors">
                        <select
                          value={hour}
                          onChange={e => setTime(e.target.value, minute, period)}
                          className="flex-1 min-w-0 h-full bg-transparent text-[13px] font-semibold text-center outline-none cursor-pointer px-1"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                            <option key={h} value={String(h)}>{String(h).padStart(2, "0")}</option>
                          ))}
                        </select>
                        <span className="px-1 text-muted-foreground font-bold text-[13px] select-none">:</span>
                        <select
                          value={minute}
                          onChange={e => setTime(hour, e.target.value, period)}
                          className="flex-1 min-w-0 h-full bg-transparent text-[13px] font-semibold text-center outline-none cursor-pointer px-1"
                        >
                          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={period}
                          onChange={e => setTime(hour, minute, e.target.value)}
                          className="h-full shrink-0 bg-primary/5 text-[12px] font-bold text-primary outline-none cursor-pointer px-2"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
                {/* There is no separate "overnight" switch: an end at or before
                    the start IS an overnight shift. Said here, next to the
                    times, because 9:00 AM to 6:00 AM picked for 6:00 PM is a
                    21-hour shift otherwise noticed only on a payslip. */}
                {form.startTime === form.endTime ? (
                  <p className="col-span-2 text-[11px] font-semibold text-destructive">
                    Start and end are the same. Pick a different end time, or switch on 24 Hours Shift.
                  </p>
                ) : toMins(form.endTime) < toMins(form.startTime) ? (
                  <p className="col-span-2 text-[11px] font-semibold text-amber-700">
                    <Moon className="inline h-3 w-3 mr-1 -mt-0.5" />
                    Overnight shift: ends at {to12hLabel(form.endTime)} the next day.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-primary/5 border border-primary/20">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span className="text-[13px] font-bold text-primary">12:00 AM</span>
                <span className="text-[12px] text-muted-foreground">→</span>
                <span className="text-[13px] font-bold text-primary">11:59 PM</span>
                <Badge variant="outline" className="ml-1 text-[11px] font-bold text-primary border-primary/30 bg-primary/5 px-1.5 py-0">24h</Badge>
              </div>
            )}

            {/* Working Days */}
            <div className="space-y-1.5">
              <label className={SECTION_LABEL}>Working Days</label>
              <div className="flex gap-1.5">
                {ALL_DAYS.map((day) => {
                  const active = form.workDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      aria-label={DAY_LABELS[day]}
                      onClick={() => toggleWorkDay(day)}
                      className={cn(
                        "h-10 min-w-0 flex-1 max-w-11 rounded-xl text-[12px] font-bold transition-all border",
                        active
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-muted-foreground border-border/50 hover:border-primary/40"
                      )}
                      title={DAY_LABELS[day]}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className={cn("text-[11px]", form.workDays.length === 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {form.workDays.length === 0
                  ? "Pick at least one working day."
                  : followsCompanyDays
                    ? "Highlighted = work day. These are the company days (Settings > Attendance), and this shift keeps following them until you change a day here."
                    : "Highlighted = work day."}
              </p>
              <div className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 space-y-1">
                <p className="text-[11px] font-bold text-foreground/70">Which setting actually wins</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  An employee's own <b>Weekly Holidays</b> (on their profile) replaces this list
                  entirely &mdash; not merged, replaced. Set them and this shift's days are ignored
                  for that person. This list in turn overrides <b>Settings &rsaquo; Attendance &rsaquo;
                  Active Work Days</b>.
                </p>
              </div>
            </div>

            {/* Lunch / unpaid break */}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <label className={SECTION_LABEL}>Lunch Break</label>

              <FormSelect
                label=""
                value={form.lunch.mode}
                onValueChange={(v) => setForm({ ...form, lunch: { ...form.lunch, mode: v as LunchMode } })}
                options={
                  (editing && (editing.lunch?.mode || "inherit") === "inherit") || form.lunch.mode === "inherit"
                    ? [INHERIT_OPTION, ...LUNCH_MODES]
                    : LUNCH_MODES
                }
                containerClassName="space-y-1"
                className="h-10"
              />

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {LUNCH_HELP[form.lunch.mode]}
              </p>

              {form.lunch.mode === "fixed_window" && (
                <div className="grid grid-cols-2 gap-3">
                  <FormInput
                    label="Lunch starts"
                    type="time"
                    value={form.lunch.startTime || ""}
                    onChange={(e) => setForm({ ...form, lunch: { ...form.lunch, startTime: e.target.value } })}
                    className="h-10"
                    containerClassName="space-y-1"
                  />
                  <FormInput
                    label="Lunch ends"
                    type="time"
                    value={form.lunch.endTime || ""}
                    onChange={(e) => setForm({ ...form, lunch: { ...form.lunch, endTime: e.target.value } })}
                    className="h-10"
                    containerClassName="space-y-1"
                  />
                </div>
              )}

              {form.lunch.mode === "fixed_duration" && (
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {[30, 45, 60, 90, 120].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setForm({ ...form, lunch: { ...form.lunch, durationMins: m } })}
                        className={cn(
                          "h-10 px-3 rounded-xl text-[12px] font-bold transition-all border",
                          Number(form.lunch.durationMins) === m
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-white text-muted-foreground border-border/50 hover:border-primary/40",
                        )}
                      >
                        {m >= 60 && m % 60 === 0 ? `${m / 60} hour${m > 60 ? "s" : ""}` : `${m} min`}
                      </button>
                    ))}
                  </div>
                  <FormInput
                    label="Or an exact number of minutes"
                    type="number"
                    value={form.lunch.durationMins ?? ""}
                    onChange={(e) => setForm({ ...form, lunch: { ...form.lunch, durationMins: e.target.value ? Number(e.target.value) : 0 } })}
                    className="h-10"
                    containerClassName="space-y-1"
                    min={0}
                  />
                </div>
              )}

              {form.lunch.mode === "from_punches" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Count at least (mins)"
                      type="number"
                      placeholder="e.g. 30"
                      value={form.lunch.minMins ?? ""}
                      onChange={(e) => setForm({ ...form, lunch: { ...form.lunch, minMins: e.target.value ? Number(e.target.value) : null } })}
                      className="h-10"
                      containerClassName="space-y-1"
                      min={0}
                    />
                    <FormInput
                      label="Never more than (mins)"
                      type="number"
                      placeholder="e.g. 90"
                      value={form.lunch.maxMins ?? ""}
                      onChange={(e) => setForm({ ...form, lunch: { ...form.lunch, maxMins: e.target.value ? Number(e.target.value) : null } })}
                      className="h-10"
                      containerClassName="space-y-1"
                      min={0}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Half Day Settings */}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <label className={SECTION_LABEL}>Half Day Rules</label>
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="Late Punch In (mins)"
                  type="number"
                  placeholder="e.g. 120"
                  value={form.halfDayLatePunchInMin || ""}
                  onChange={(e) => setForm({ ...form, halfDayLatePunchInMin: e.target.value ? Number(e.target.value) : 0 })}
                  className="h-10"
                  containerClassName="space-y-1"
                  min={0}
                />
                <FormInput
                  label="Early Punch Out (mins)"
                  type="number"
                  placeholder="e.g. 120"
                  value={form.halfDayEarlyPunchOutMin || ""}
                  onChange={(e) => setForm({ ...form, halfDayEarlyPunchOutMin: e.target.value ? Number(e.target.value) : 0 })}
                  className="h-10"
                  containerClassName="space-y-1"
                  min={0}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                How much lateness and how early a finish this shift absorbs. Both are
                subtracted from the hours needed for a Full Day. Leave both at 0 to use the
                company grace values instead.
              </p>
              {(form.halfDayLatePunchInMin > 0 || form.halfDayEarlyPunchOutMin > 0) && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-wide text-warning-foreground">
                    This switches the company half-day rules off
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Setting either box means <b>Settings &rsaquo; Attendance &rsaquo; Half Day Rules</b>
                    &mdash; the late cut-off time, the minimum hours, and the method &mdash; stop
                    applying to everyone on this shift. The day is judged on HOURS instead:
                    shift length, minus lunch, minus both grace values above. Arriving late is
                    not itself a half day &mdash; falling short of those hours is.
                  </p>
                </div>
              )}
            </div>

            {/* What this shift will actually DO, in the admin's own terms.
                Every line is derived from the fields above, so a mistake shows
                here before it shows on somebody's payslip. */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <p className={SECTION_LABEL}>Rule Preview</p>
              {shiftSummary(form, companyRules).map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", line.tone)} />
                  <span className="text-foreground/80">{line.text}</span>
                </div>
              ))}
            </div>
            </div>

            <DialogFooter className="gap-2 px-5 py-3 border-t border-border/40 bg-muted/10 shrink-0">
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} className="rounded-lg h-10" disabled={isCreating || isUpdating}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-primary text-primary-foreground rounded-lg h-10 px-5 shadow-md hover:opacity-90" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  editing ? "Save Changes" : "Create Shift"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog.
          Says what the server will do, before the click: a shift that active
          employees still work, or the company default, is refused (409).
          The old text promised to "unassign all employees", which it never
          did -- they were left pointing at a deleted shift, and every day they
          worked then graded as needs_review. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-xl border-destructive/20 shadow-xl">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center mb-2">
              {deleteBlocked ? <Ban className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            </div>
            <AlertDialogTitle className="text-[16px]">
              {deleteIsDefault
                ? "This is the company default shift"
                : deleteActive > 0
                  ? `Move ${deleteActive === 1 ? "1 employee" : `${deleteActive} employees`} first`
                  : `Delete ${deleteTarget?.name?.trim() || "shift"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-[13px] leading-relaxed text-muted-foreground space-y-2">
                {deleteIsDefault ? (
                  <p>
                    New employees start on this shift. Choose another default shift in{" "}
                    <b>Settings &rsaquo; Attendance &rsaquo; Default Shift</b> first, then delete this one.
                  </p>
                ) : deleteActive > 0 ? (
                  <>
                    <p>
                      {deleteActive === 1 ? "1 active employee is" : `${deleteActive} active employees are`} still on this shift.
                      Without a shift their days cannot be graded, so move them to another shift before deleting this one.
                    </p>
                    {deleteNames.length > 0 && (
                      <p className="text-foreground/80">
                        {deleteNames.slice(0, 6).join(", ")}
                        {deleteNames.length > 6 ? ` and ${deleteNames.length - 6} more` : ""}.
                      </p>
                    )}
                  </>
                ) : (
                  <p>
                    This cannot be undone.
                    {deleteTotal > 0 && ` ${deleteTotal === 1 ? "1 former employee" : `${deleteTotal} former employees`} will be unassigned from it.`}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-lg h-10" disabled={isDeleting}>{deleteBlocked ? "Close" : "Cancel"}</AlertDialogCancel>
            {deleteIsDefault ? (
              <Button asChild className="rounded-lg h-10 font-bold">
                <Link to="/settings">Open Settings</Link>
              </Button>
            ) : deleteActive > 0 ? (
              canAssign && deleteFirstAssignee ? (
                <Button
                  type="button"
                  className="rounded-lg h-10 font-bold"
                  onClick={() => { const id = deleteFirstAssignee; setDeleteId(null); openAssign(id); }}
                >
                  <Users className="h-4 w-4" /> Assign a new shift
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                onClick={remove}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground rounded-lg h-10 hover:bg-destructive/90 shadow-md"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? "Deleting..." : "Delete Shift"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Shift Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-success/15 to-success/5 text-success grid place-items-center mb-2">
              <Users className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[16px]">Assign Shift</DialogTitle>
            <DialogDescription className="text-[13px]">Move an employee to a different shift.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4 mt-2">
            <FormSelect
              label="Employee"
              placeholder="Select Employee"
              value={assignForm.employeeId}
              onValueChange={handleEmployeeChange}
              options={employees.map((e: any) => ({ label: e.name, value: e._id }))}
              containerClassName="space-y-1"
            />
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider block">Shifts</label>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => {
                  const active = assignForm.shiftIds.includes(s._id);
                  return (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => toggleAssignShift(s._id)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-left border transition-all",
                        active
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-foreground border-border/50 hover:border-primary/40"
                      )}
                    >
                      <div className="text-[13px] font-bold leading-none">{s.name}</div>
                      <div className={cn("text-[11px] mt-1", active ? "text-white/80" : "text-muted-foreground")}>
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Select one or more shifts this employee works. The first one picked is used as their primary shift for attendance timing.
              </p>
            </div>
            <DialogFooter className="gap-2 pt-2 border-t border-border/40 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAssignOpen(false)} className="rounded-lg h-10" disabled={isAssigning}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-gradient-primary text-primary-foreground rounded-lg h-10 px-5 shadow-md" disabled={isAssigning}>
                {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
