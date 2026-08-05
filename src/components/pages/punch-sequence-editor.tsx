import { Fingerprint, Plus, X, AlertTriangle, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * What a single tap on a biometric machine means.
 *
 * Careful with the names: 'lunch-in' is the moment the break STARTS (the
 * employee goes in to lunch) and 'lunch-out' is coming back to work. That's the
 * backend's vocabulary — lunch duration is computed as lunchOut − lunchIn, and
 * attendance_controller.lunchOut refuses to run without an existing lunchInTime
 * — so the values must stay as-is while the UI shows plain English.
 */
export type PunchStep = "punch-in" | "lunch-in" | "lunch-out" | "punch-out";

export interface PunchSequenceConfig {
  enabled: boolean;
  steps: PunchStep[];
  afterLast: "ignore" | "toggle";
}

export const DEFAULT_PUNCH_SEQUENCE: PunchSequenceConfig = {
  enabled: false,
  steps: ["punch-in", "lunch-in", "lunch-out", "punch-out"],
  afterLast: "ignore",
};

export const STEP_LABELS: Record<PunchStep, string> = {
  "punch-in": "Punch in",
  "lunch-in": "Lunch break starts",
  "lunch-out": "Back from lunch",
  "punch-out": "Punch out",
};

const STEP_ORDER: PunchStep[] = ["punch-in", "lunch-in", "lunch-out", "punch-out"];

const PRESETS: { name: string; hint: string; steps: PunchStep[] }[] = [
  { name: "In / out only", hint: "2 taps a day", steps: ["punch-in", "punch-out"] },
  {
    name: "With lunch break",
    hint: "4 taps a day",
    steps: ["punch-in", "lunch-in", "lunch-out", "punch-out"],
  },
  { name: "In + lunch, no out", hint: "3 taps", steps: ["punch-in", "lunch-in", "lunch-out"] },
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/**
 * Mirrors validateSteps() in backend utils/punch_sequence.js. These rules exist
 * because the recording handlers have hard preconditions — "back from lunch"
 * can't be recorded without a lunch start, and nothing records after punch out.
 * Returns an error message, or null when the sequence is workable.
 */
export function validateSequence(steps: PunchStep[]): string | null {
  if (!steps.length) return "Add at least one step.";
  if (new Set(steps).size !== steps.length) return "Each step can only be used once.";
  if (steps[0] !== "punch-in") return 'The first punch of the day must be "Punch in".';

  const lunchIn = steps.indexOf("lunch-in");
  const lunchOut = steps.indexOf("lunch-out");
  if (lunchOut !== -1 && lunchIn === -1)
    return '"Back from lunch" needs "Lunch break starts" earlier in the sequence.';
  if (lunchOut !== -1 && lunchOut < lunchIn)
    return '"Back from lunch" must come after "Lunch break starts".';

  const punchOut = steps.indexOf("punch-out");
  if (punchOut !== -1 && punchOut !== steps.length - 1)
    return '"Punch out" has to be the last step.';

  return null;
}

export function PunchSequenceEditor({
  value,
  onChange,
}: {
  value: PunchSequenceConfig;
  onChange: (next: PunchSequenceConfig) => void;
}) {
  const error = value.enabled ? validateSequence(value.steps) : null;
  const set = (patch: Partial<PunchSequenceConfig>) => onChange({ ...value, ...patch });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3.5 flex-1">
          <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A fingerprint machine only reports <em>who</em> was recognised — it can't say whether
            someone is arriving, going for lunch or leaving. Turn this on to fix the meaning of each
            tap in order.
            {!value.enabled && (
              <>
                {" "}
                <strong className="text-foreground">Currently off:</strong> taps simply alternate
                between punch in and punch out, so a lunch break gets recorded as leaving for the
                day.
              </>
            )}
          </p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>

      {value.enabled && (
        <>
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Start from a common pattern
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = JSON.stringify(p.steps) === JSON.stringify(value.steps);
                return (
                  <button
                    key={p.name}
                    onClick={() => set({ steps: [...p.steps] })}
                    className={cn(
                      "text-left px-3 py-2 rounded-xl border transition-all",
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
                    )}
                  >
                    <span className="block text-[12px] font-bold">{p.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{p.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Sequence
          </p>
          <div className="space-y-2">
            {value.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[11px] font-bold text-muted-foreground tabular-nums">
                  {ORDINALS[i] || `${i + 1}th`}
                </span>
                <Select
                  value={step}
                  onValueChange={(v) => {
                    const steps = [...value.steps];
                    steps[i] = v as PunchStep;
                    set({ steps });
                  }}
                >
                  <SelectTrigger className="h-10 flex-1 rounded-xl border-border/60 font-bold text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_ORDER.map((s) => (
                      <SelectItem key={s} value={s} className="text-[13px]">
                        {STEP_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => set({ steps: value.steps.filter((_, j) => j !== i) })}
                  disabled={value.steps.length <= 1}
                  className="h-10 w-10 shrink-0 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Remove this step"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              // Offer whichever action isn't in use yet, so a new row never
              // lands on a duplicate the validator would reject.
              const unused = STEP_ORDER.find((s) => !value.steps.includes(s));
              if (unused) set({ steps: [...value.steps, unused] });
            }}
            disabled={STEP_ORDER.every((s) => value.steps.includes(s))}
            className="mt-2 ml-12 flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline disabled:opacity-40 disabled:pointer-events-none disabled:no-underline"
          >
            <Plus className="h-3 w-3" />
            Add step
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-bold text-destructive">This sequence can't be saved</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!error && (
            <div className="mt-5 rounded-xl border border-border/60 overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2.5 bg-muted/40 border-b border-border/40">
                A day at the machine
              </p>
              <div className="p-4 space-y-2">
                {value.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">Tap {i + 1} records</span>
                    <span className="font-bold">{STEP_LABELS[s]}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-[12px] pt-1.5 border-t border-border/40 mt-1">
                  <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                    +
                  </span>
                  <span className="text-muted-foreground">Any further taps are</span>
                  <span className="font-bold">
                    {value.afterLast === "ignore" ? "ignored" : "treated as a second shift"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-border/30 flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold">Extra taps after the sequence finishes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
                {value.afterLast === "ignore"
                  ? "Ignored, so an accidental tap can't reopen a completed day. Still listed under the machine's unmatched punches."
                  : "Starts a second shift by punching in again. Choose this for split-shift sites."}
              </p>
            </div>
            <Select
              value={value.afterLast}
              onValueChange={(v) => set({ afterLast: v as "ignore" | "toggle" })}
            >
              <SelectTrigger className="w-44 h-10 shrink-0 rounded-xl border-border/60 font-bold text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ignore" className="text-[13px]">Ignore them</SelectItem>
                <SelectItem value="toggle" className="text-[13px]">Start a second shift</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-900">
              This applies to punches from <strong>biometric machines</strong>, which can't say what a
              tap means. The mobile app sends its action explicitly and is unaffected. Steps already
              recorded by the app still count — if someone punches in on their phone, their first tap
              on the machine becomes the next step in the sequence.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
