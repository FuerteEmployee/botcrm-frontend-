import { Ban, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isModuleUnavailable, requestErrorMessage } from "@/services/request-error";

/**
 * Shown by the Branches and Departments pages in place of a list that failed
 * to load.
 *
 * Both pages used to fall through to their EMPTY state on any error, so a
 * dropped connection or a 500 read as "No branches found" with zero totals --
 * a claim that every office had been deleted, next to an Add button inviting
 * the admin to recreate them. This says what actually happened instead.
 */
export function OrgLoadError({
  what,
  error,
  onRetry,
  retrying = false,
}: {
  /** Plain plural noun: "branches", "departments". */
  what: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  // Plan-gated: retrying cannot fix it, so no button. The root route has
  // already shown its upgrade prompt; this is what stays on the page.
  if (isModuleUnavailable(error)) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm"
      >
        <Ban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-[15px] font-bold text-foreground">
          Branches &amp; departments are not in your plan
        </p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Your current plan does not include this module. The account owner can change the plan from
          Plan &amp; Billing.
        </p>
      </div>
    );
  }

  const offline = !(error as { response?: unknown })?.response;
  const detail = offline
    ? "Check your internet connection, then try again."
    : requestErrorMessage(error, `The server could not send the ${what} just now.`) ||
      `The server could not send the ${what} just now.`;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center"
    >
      <WifiOff className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
      <p className="text-[15px] font-bold text-foreground">Could not load your {what}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {detail} Nothing has been changed or deleted.
      </p>
      <Button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 h-11 rounded-xl px-6 font-bold"
      >
        <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {retrying ? "Loading..." : "Try again"}
      </Button>
    </div>
  );
}
