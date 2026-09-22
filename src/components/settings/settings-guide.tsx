import { cn } from "@/lib/utils";

/**
 * The "what does this page actually do" block that closes every Settings tab.
 *
 * Same idea as the Rule Preview in the shift dialog, and for the same reason:
 * these screens are full of switches whose effect is invisible until it lands
 * on somebody's attendance record or payslip. Each line states what a control
 * is for, and — where the current value can be read — what it is set to right
 * now, so an admin can confirm the effect without saving and waiting a day.
 *
 * Presentation only. Nothing here decides anything; it restates settings the
 * server owns. Where a line describes a precedence rule or a default, that
 * rule lives in the backend and this is a plain-English echo of it.
 */

export type GuideTone = "on" | "off" | "info" | "warn";

export interface GuideLine {
  text: string;
  tone?: GuideTone;
}

const TONE_DOT: Record<GuideTone, string> = {
  on: "bg-success",
  off: "bg-muted-foreground/40",
  info: "bg-primary",
  warn: "bg-warning",
};

export function SettingsGuide({
  title = "What these settings do",
  lines,
}: {
  title?: string;
  lines: GuideLine[];
}) {
  if (!lines.length) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 sm:p-5 space-y-2 mt-6">
      <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70">
        {title}
      </p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[12px] leading-relaxed">
            <span className={cn("mt-[6px] h-1.5 w-1.5 rounded-full shrink-0", TONE_DOT[line.tone || "info"])} />
            <span className="text-foreground/75">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Everything the guide can read about the tenant's current configuration. */
export interface GuideContext {
  shiftName?: string | null;
  shiftCount: number;
  branchCount: number;
  workDayCount: number;
  requireLocation: boolean;
  remotePunch: boolean;
  payrollEnabled: boolean;
  dailyRateBasis: string;
  sandwichRuleEnabled: boolean;
  roundingMode: string;
  roundingPrecision: number;
  templateCount: number;
  notifEmail: boolean;
  notifPush: boolean;
  notifWeekly: boolean;
  companyName?: string | null;
}

const RATE_BASIS_LABEL: Record<string, string> = {
  fixed30: "a fixed 30-day month",
  fixed26: "a fixed 26-day month",
  calendar: "the real number of days in each month",
  workingDay: "only the working days in each month",
};

export function settingsGuideLines(tab: string, c: GuideContext): GuideLine[] {
  switch (tab) {
    case "general":
      return [
        { tone: "info", text: "Your company profile. The name, logo and address here are what appear on payslips, reports and exports — not just a label for this screen." },
        {
          tone: c.companyName ? "on" : "warn",
          text: c.companyName
            ? `Documents will be issued as "${c.companyName}".`
            : "No company name set yet, so generated documents will go out unbranded.",
        },
        { tone: "info", text: "The contact email and phone are shown to employees who need to reach HR; they are not used for sending anything automatically." },
      ];

    case "branches":
      return [
        { tone: "info", text: "A branch is a location with a geo-fence around it. Punches are measured against the nearest branch an employee is assigned to." },
        {
          tone: c.branchCount > 0 ? "on" : "warn",
          text: c.branchCount > 0
            ? `${c.branchCount} branch${c.branchCount === 1 ? "" : "es"} configured.`
            : "No branches yet. With Geofencing on, an employee without a branch is refused rather than waved through.",
        },
        { tone: "info", text: "Each branch can carry its own allowed radius. If it has none, the tenant-wide office radius applies, and failing that a 3 km default. A branch radius therefore overrides Settings \u203a Attendance \u203a office radius." },
        { tone: "info", text: "Defaults for a new branch: geo-fence enabled, radius taken from your attendance settings." },
      ];

    case "attendance":
      return [
        {
          tone: c.shiftName ? "on" : "warn",
          text: c.shiftName
            ? `New employees start on "${c.shiftName}". Changing this does not move anyone already assigned.`
            : "No global default shift chosen. New employees will have no shift, so their days cannot be graded on hours.",
        },
        {
          tone: c.requireLocation ? "on" : "off",
          text: c.requireLocation
            ? "Geofencing ON — every punch must carry a GPS fix, and a punch from outside the branch radius is refused. An employee with no branch assigned is also refused."
            : "Geofencing OFF — punches are accepted without a location, so attendance is recorded but cannot be proved against a site.",
        },
        {
          tone: c.remotePunch ? "on" : "off",
          text: c.remotePunch
            ? "Remote Punch ON — employees may clock in from anywhere, which overrides the branch radius for them."
            : "Remote Punch OFF — clocking in is only possible inside an assigned branch's radius.",
        },
        { tone: "info", text: "Either control can be overridden per employee, on their profile, for field staff who genuinely work off-site." },
        {
          tone: "warn",
          text: `Active Work Days (${c.workDayCount} selected) is the WEAKEST of three places this is set. A shift's own Working Days beat it, and an employee's Weekly Holidays beat both \u2014 and an employee list replaces the week entirely rather than adding to it. If everyone has Weekly Holidays set, changing this changes nothing.`,
        },
        {
          tone: "warn",
          text: "Half Day Rules here are switched off completely for any shift that has its own Late Punch In or Early Punch Out minutes. Check Shift Management before relying on the cut-off time or minimum hours below.",
        },
        {
          tone: "info",
          text: "Geofencing and Remote Punch can be overridden per employee, but only if that employee's \u201coverride global\u201d switch is on \u2014 values filled in without it are stored and ignored.",
        },
        {
          tone: "info",
          text: `Lunch, late grace and half-day limits are NOT here — they belong to each shift, under Shift Management${c.shiftCount ? ` (${c.shiftCount} shift${c.shiftCount === 1 ? "" : "s"} configured)` : ""}.`,
        },
      ];

    case "payroll":
      return [
        {
          tone: c.payrollEnabled ? "on" : "off",
          text: c.payrollEnabled
            ? "The payroll engine is ON. Every day in a pay period is sorted into exactly one bucket — present, WFH, half day, paid leave, weekly off, holiday, absent or unpaid leave — and pay is the sum of each bucket's weight times the daily rate."
            : "The payroll engine is OFF, so salaries are not computed from attendance. Turn it on to have days graded into pay buckets automatically.",
        },
        {
          tone: "info",
          text: `Daily rate is derived from ${RATE_BASIS_LABEL[c.dailyRateBasis] || c.dailyRateBasis}. This is the single biggest lever on take-home pay — a 26-day basis makes each day worth more than a 30-day one.`,
        },
        {
          tone: c.sandwichRuleEnabled ? "warn" : "off",
          text: c.sandwichRuleEnabled
            ? "Sandwich rule ON — a weekly off or holiday with absence on BOTH sides is unpaid. It cannot see past the edge of the pay period."
            : "Sandwich rule OFF — weekly offs and holidays are paid even when surrounded by absence.",
        },
        { tone: "info", text: "Regardless of that rule, if a pay period contains no actual work at all, weekly offs and holidays are not credited." },
        {
          tone: "info",
          text: `Rounding: ${c.roundingMode}${c.roundingPrecision ? ` to ${c.roundingPrecision} decimal place${c.roundingPrecision === 1 ? "" : "s"}` : ", to whole rupees"}. Applied once, at the end.`,
        },
        { tone: "info", text: "Bucket weights are the fraction of a day's pay each kind of day earns. Defaults: present, WFH, paid leave, weekly off and holiday pay 1; half day pays 0.5; absent and unpaid leave pay 0." },
        { tone: "info", text: "These can be overridden per employee, field by field \u2014 unlike the attendance overrides, an employee can change only the sandwich rule and still inherit everything else here." },
        { tone: "info", text: "A run whose day counts do not add up to the days in the period is flagged for review instead of being paid." },
      ];

    case "salary_templates":
      return [
        { tone: "info", text: "A pay template is a reusable salary structure — earnings and deductions — that you attach to an employee instead of typing the same components each time." },
        {
          tone: c.templateCount > 0 ? "on" : "off",
          text: c.templateCount > 0
            ? `${c.templateCount} template${c.templateCount === 1 ? "" : "s"} saved. Editing one does not retroactively change payslips already generated.`
            : "No templates yet. Without one, each employee's components are entered by hand on their salary record.",
        },
        { tone: "info", text: "Components here define the structure only. The actual amounts, overtime and final rounding are applied when a salary is computed." },
      ];

    case "preferences":
      return [
        { tone: "info", text: "Per-tenant display and notification preferences." },
        {
          tone: "warn",
          text: "Note: notification preferences are saved, but no email or SMS provider is connected yet, so nothing is actually delivered. Turning these on does not send anything today.",
        },
        {
          tone: "off",
          text: (c.notifEmail || c.notifPush || c.notifWeekly)
            ? "Your choices are saved as a record of what you want sent, ready for when delivery is connected."
            : "All notification channels are off.",
        },
        { tone: "info", text: "Date, time and timezone preferences affect how this admin panel displays values. Attendance itself is always bucketed by the IST calendar day, regardless of what is chosen here." },
      ];

    case "security":
      return [
        { tone: "info", text: "Change your password and review where your account has been signed in." },
        { tone: "info", text: "Sign-in history is recorded by the server, including the deliberate sign-outs made from this panel, so a closed tab is distinguishable from a real logout." },
        { tone: "warn", text: "Signing in on a second device does not end the first session — multiple devices can be signed in at once, by design." },
        { tone: "warn", text: "The login code is shown on screen rather than sent by SMS, because no SMS gateway is connected. Treat it as a convenience, not a second factor." },
      ];

    case "shifts":
      return [
        { tone: "info", text: "A shift is the schedule a day is graded against: its hours decide late arrival, early departure and how much of a day counts toward pay." },
        {
          tone: c.shiftCount > 0 ? "on" : "warn",
          text: c.shiftCount > 0
            ? `${c.shiftCount} shift${c.shiftCount === 1 ? "" : "s"} configured. An employee with no shift cannot be graded on hours at all.`
            : "No shifts yet. Until one exists and is assigned, days cannot be graded on hours worked.",
        },
        { tone: "info", text: "Working days resolve in three layers: the employee's own Weekly Holidays win, then the shift's working days, then the company-wide Active Work Days in Settings." },
        { tone: "warn", text: "Lunch Break defaults to \u201cUse company default\u201d, which deducts the tenant's configured minimum from everyone \u2014 whether or not a break was punched. Choose \u201cCalculate from punches\u201d if you only want to deduct breaks that were actually taken." },
        { tone: "info", text: "Half Day Rules are off by default (0 minutes = no rule); with both blank, a day is graded purely on hours worked against the shift span minus lunch." },
        { tone: "info", text: "Editing a shift changes how FUTURE days are graded. It does not recompute attendance already recorded." },
      ];

    default:
      return [];
  }
}
