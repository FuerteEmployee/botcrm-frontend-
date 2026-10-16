import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Banknote, HandCoins, Info, Loader2 } from "lucide-react";
import { formatINRFull } from "@/lib/format";
import { advanceSalaryErrorMessage, ADVANCE_MAX_AMOUNT } from "@/services/advance-salary-service";

interface NewRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    type: "advance-salary" | "loan";
    amount: number;
    reason: string;
    notes?: string;
  }) => Promise<unknown>;
  isLoading?: boolean;
}

// Mirrors the model's maxlength and the backend controller's check. Without a
// limit here, a long reason was only refused by Mongoose, and the app showed
// its raw "Path `reason` ... is longer than the maximum allowed length" text.
const MAX_TEXT = 500;

// Hard cap on one request, ₹1,00,00,000 (1 crore), set by the product owner.
// Shared with the admin approve screen; the backend controller
// (advanceSalary.js) refuses anything above it too.
const MAX_AMOUNT = ADVANCE_MAX_AMOUNT;
// One digit more than the cap, so typing past it shows "Maximum amount is ..."
// instead of the keypad silently ignoring the key.
const MAX_AMOUNT_DIGITS = String(MAX_AMOUNT).length + 1;

const REQUEST_TYPES = [
  {
    value: "advance-salary",
    label: "Advance Salary",
    hint: "Get part of your salary early",
    icon: Banknote,
  },
  { value: "loan", label: "Loan", hint: "Borrow money from the company", icon: HandCoins },
] as const;

/**
 * "1 lakh 25 thousand rupees" under the typed number, so an extra or missing
 * zero is obvious before the request is sent — the employee cannot edit or
 * cancel it afterwards. Lakh/crore because that is how amounts are said here.
 */
function amountInWords(n: number): string {
  if (!Number.isFinite(n) || n < 1000) return "";
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  const parts: string[] = [];
  if (crore) parts.push(`${crore.toLocaleString("en-IN")} crore`);
  if (lakh) parts.push(`${lakh} lakh`);
  if (thousand) parts.push(`${thousand} thousand`);
  if (rest) parts.push(String(rest));
  return `${parts.join(" ")} rupees`;
}

/**
 * Digits plus one decimal point, nothing else ("-", "e", commas and spaces are
 * dropped). The point is kept, not stripped: stripping it made "1500.50",
 * typed key by key, arrive as "150050" — a hundred times the amount. Paise are
 * refused with a message instead (see amountError).
 */
function cleanAmount(raw: string): string {
  const dot = raw.indexOf(".");
  const whole = (dot === -1 ? raw : raw.slice(0, dot))
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MAX_AMOUNT_DIGITS);
  if (dot === -1) return whole;
  return `${whole}.${raw
    .slice(dot + 1)
    .replace(/\D/g, "")
    .slice(0, 2)}`;
}

export function NewRequestModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: NewRequestModalProps) {
  const [requestType, setRequestType] = useState<"advance-salary" | "loan">("advance-salary");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  // Errors appear only after a first tap on Send. The button is never silently
  // disabled for a missing field: a greyed-out button with no reason is a dead
  // end for someone who cannot read the labels well.
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // `isLoading` only turns true after React Query re-renders, so two taps in
  // the same few milliseconds could both get through. A ref is synchronous.
  const submittingRef = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const [wholeRupees, paise = ""] = amount.split(".");
  const amountValue = wholeRupees ? Number(wholeRupees) : NaN;
  // "5000." and "5000.00" are whole rupees; "5000.50" is not. The server only
  // takes whole rupees, and saying so here beats a silent rounding.
  const amountError = !wholeRupees
    ? "Please enter how much money you need."
    : /[1-9]/.test(paise)
      ? "Please enter the amount in whole rupees, without paise."
      : amountValue < 1
        ? "Amount must be at least ₹1."
        : amountValue > MAX_AMOUNT
          ? `Maximum amount is ${formatINRFull(MAX_AMOUNT)}.`
          : null;
  const reasonError = reason.trim() ? null : "Please write why you need this money.";
  const amountWords = amountError ? "" : amountInWords(amountValue);

  const resetForm = () => {
    setAmount("");
    setReason("");
    setNotes("");
    setRequestType("advance-salary");
    setTriedSubmit(false);
    setServerError(null);
  };

  // While the request is on its way, the dialog stays put. Closing it then hid
  // the outcome: a stray tap outside, Escape, or the Android Back button (which
  // the shell turns into Escape) dismissed it mid-send.
  const handleOpenChange = (next: boolean) => {
    if (!next && (isLoading || submittingRef.current)) return;
    if (!next) {
      setTriedSubmit(false);
      setServerError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (submittingRef.current || isLoading) return;
    if (amountError || reasonError) {
      setTriedSubmit(true);
      (amountError ? amountRef.current : reasonRef.current)?.focus();
      return;
    }

    submittingRef.current = true;
    setServerError(null);
    try {
      await onSubmit({
        type: requestType,
        amount: amountValue,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      // The service also raises a toast (which carries the error haptic), but a
      // toast covers the top of this dialog and fades. This line stays beside
      // the button until something changes.
      setServerError(advanceSalaryErrorMessage(error, "send"));
    } finally {
      submittingRef.current = false;
    }
  };

  const reasonPlaceholder =
    requestType === "advance-salary"
      ? "For example: medical bills, school fees"
      : "For example: house repair, wedding in the family";

  // A problem with what was typed (paise, zero) shows at once; an empty field
  // only complains after a tap on Send.
  const showAmountError = !!amountError && (triedSubmit || !!wholeRupees);
  const showReasonError = triedSubmit && !!reasonError;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // Flex column with a pinned footer: the body scrolls, the Send button is
        // always on screen. It used to sit at the bottom of the scroll area,
        // below the fold on a 740px phone and further still with the keyboard
        // up. The arbitrary variants enlarge Radix's built-in close button,
        // which is otherwise a 16px target.
        className="flex max-h-[88dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-xl sm:max-w-[480px] [&>button:last-child]:right-2.5 [&>button:last-child]:top-2.5 [&>button:last-child]:flex [&>button:last-child]:h-10 [&>button:last-child]:w-10 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child>svg]:h-5 [&>button:last-child>svg]:w-5"
        onInteractOutside={(e) => {
          if (isLoading || submittingRef.current) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isLoading || submittingRef.current) e.preventDefault();
        }}
      >
        {/* Pinned title bar. The close button lives here, not over the fields:
            when it floated above the scrolling body, a tap at the right edge of
            the amount box could land on it and close the form. */}
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-14 text-left dark:border-slate-700">
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            New Request
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <DialogDescription className="mb-5 text-[15px] text-slate-600 dark:text-slate-400">
            Ask your company for an advance on your salary, or for a loan.
          </DialogDescription>

          <div className="space-y-5">
            {/* Request type */}
            <div className="space-y-2">
              <p
                id="adv-type-label"
                className="text-[15px] font-semibold text-slate-900 dark:text-white"
              >
                What do you need?
              </p>
              <div
                role="radiogroup"
                aria-labelledby="adv-type-label"
                className="grid grid-cols-2 gap-3"
              >
                {REQUEST_TYPES.map((t) => {
                  const selected = requestType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRequestType(t.value)}
                      className={`flex min-h-[84px] flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary text-white shadow-md"
                          : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <t.icon className="h-5 w-5 shrink-0" />
                      <span className="text-[15px] font-bold leading-tight">{t.label}</span>
                      <span
                        className={`text-[13px] leading-snug ${selected ? "text-white/90" : "text-slate-600 dark:text-slate-400"}`}
                      >
                        {t.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label
                htmlFor="adv-amount"
                className="block text-[15px] font-semibold text-slate-900 dark:text-white"
              >
                How much money?
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-600 dark:text-slate-400">
                  ₹
                </span>
                <Input
                  ref={amountRef}
                  id="adv-amount"
                  // Text + numeric keypad rather than type="number": the number
                  // input accepted "-5", "1e5" and "1.5" and sent them as-is.
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder="For example 5000"
                  value={amount}
                  onChange={(e) => {
                    setAmount(cleanAmount(e.target.value));
                    setServerError(null);
                  }}
                  aria-invalid={showAmountError}
                  aria-describedby="adv-amount-help"
                  className={`h-12 rounded-xl pl-9 text-lg font-semibold placeholder:font-normal ${showAmountError ? "border-rose-500" : "border-slate-300 dark:border-slate-700"}`}
                />
              </div>
              <div id="adv-amount-help" aria-live="polite">
                {showAmountError ? (
                  <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                    {amountError}
                  </p>
                ) : !amountError ? (
                  <p className="text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">
                    <span className="font-bold">{formatINRFull(amountValue)}</span>
                    {amountWords && (
                      <span className="text-slate-500 dark:text-slate-400"> · {amountWords}</span>
                    )}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label
                htmlFor="adv-reason"
                className="block text-[15px] font-semibold text-slate-900 dark:text-white"
              >
                Why do you need it?
              </label>
              <Textarea
                ref={reasonRef}
                id="adv-reason"
                placeholder={reasonPlaceholder}
                value={reason}
                maxLength={MAX_TEXT}
                onChange={(e) => {
                  setReason(e.target.value);
                  setServerError(null);
                }}
                rows={3}
                aria-invalid={showReasonError}
                aria-describedby="adv-reason-help"
                className={`resize-none rounded-xl text-base ${showReasonError ? "border-rose-500" : "border-slate-300 dark:border-slate-700"}`}
              />
              <div id="adv-reason-help" className="flex items-start justify-between gap-3 text-sm">
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {showReasonError ? reasonError : ""}
                </span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {reason.length}/{MAX_TEXT}
                </span>
              </div>
            </div>

            {/* Notes (optional) */}
            <div className="space-y-2">
              <label
                htmlFor="adv-notes"
                className="block text-[15px] font-semibold text-slate-900 dark:text-white"
              >
                Anything else?{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <Textarea
                id="adv-notes"
                placeholder="For example: when you need the money"
                value={notes}
                maxLength={MAX_TEXT}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-xl border-slate-300 text-base dark:border-slate-700"
              />
              <p className="text-right text-sm text-slate-500 dark:text-slate-400">
                {notes.length}/{MAX_TEXT}
              </p>
            </div>

            <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-[15px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Your admin will check your request. You will see the answer on the My Requests page.
              </p>
            </div>
          </div>
        </div>

        {/* Pinned footer */}
        <div className="shrink-0 space-y-2 border-t border-slate-200 bg-background px-5 py-4 dark:border-slate-700">
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            // The amount is on the button so the last thing tapped is the
            // number being asked for.
            className="h-auto min-h-12 w-full whitespace-normal rounded-xl [overflow-wrap:anywhere] bg-gradient-primary py-3 text-base font-bold text-white hover:opacity-95"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending...
              </>
            ) : amountError ? (
              "Send request"
            ) : (
              `Send request for ${formatINRFull(amountValue)}`
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
            className="h-11 w-full rounded-xl text-base font-semibold"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
