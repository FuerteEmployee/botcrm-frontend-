import { Ban, RefreshCw, WifiOff } from "lucide-react";
import { companyBlockedMessage, isModuleUnavailable } from "@/services/request-error";

/**
 * Shown in place of a list that failed to load.
 *
 * Every employee page used to fall through to its EMPTY state on an error, so
 * a dropped connection read as "No expenses found" with ₹0 totals, or "HR
 * hasn't published any holidays" -- a claim about the employee's data that was
 * simply false, and one that sends people to HR to ask where their claims
 * went. This says what actually happened and offers the one useful action.
 */
export function LoadError({
  what,
  error,
  onRetry,
  retrying = false,
}: {
  /** Plain noun phrase: "your expenses", "the holiday list". */
  what: string;
  error?: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  // A module the company's plan does not include is not a network problem,
  // and retrying will never fix it -- so no button, and no "upgrade" talk:
  // an employee cannot change the plan.
  if (isModuleUnavailable(error)) {
    return (
      <div role="status" className="p-6 text-center rounded-[24px] border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-900/40">
        <Ban className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Not available for your company</p>
        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
          This feature is turned off for your company. Please ask HR if you need it.
        </p>
      </div>
    );
  }

  // The company's account is paused or expired: the server says so in words
  // the employee can act on. Retrying will not help, so no button.
  const companyMessage = companyBlockedMessage(error);
  if (companyMessage) {
    return (
      <div role="status" className="p-6 text-center rounded-[24px] border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10">
        <Ban className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Not available right now</p>
        <p className="text-[13px] text-amber-800/90 dark:text-amber-200/80 mt-1 leading-relaxed">{companyMessage}</p>
      </div>
    );
  }

  return (
    <div role="alert" className="p-6 text-center rounded-[24px] border border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10">
      <WifiOff className="h-8 w-8 text-rose-500 mx-auto mb-2" />
      <p className="text-sm font-bold text-rose-900 dark:text-rose-200">Could not load {what}</p>
      <p className="text-[13px] text-rose-800/80 dark:text-rose-200/70 mt-1 leading-relaxed">
        Check your internet, then tap Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 h-11 px-6 rounded-xl bg-rose-600 text-white text-sm font-bold inline-flex items-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 cursor-pointer"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "Loading..." : "Try again"}
      </button>
    </div>
  );
}
