import { Ban, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isModuleUnavailable, requestErrorMessage } from "@/services/request-error";

/**
 * Shown by the admin Festivals and Notice Board pages in place of a list that
 * failed to load. Both used to fall through to their EMPTY state on any error,
 * so a dropped connection read as "No holidays found" -- next to an Add button
 * inviting the admin to enter the whole calendar again.
 */
export function AdminLoadError({
  what,
  error,
  onRetry,
  retrying = false,
}: {
  /** Plain noun phrase: "the holiday list", "the notices". */
  what: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const data = (error as { response?: { status?: number; data?: { featureDisabled?: boolean; message?: string } } })?.response;
  // Switched off by the plan or by the super admin: retrying cannot fix it.
  if (isModuleUnavailable(error) || data?.data?.featureDisabled) {
    return (
      <div role="status" className="rounded-2xl border border-border/60 bg-white p-8 text-center shadow-sm">
        <Ban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-[15px] font-bold text-foreground">This page is not turned on for your company</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {data?.data?.featureDisabled
            ? "Please contact support to turn it on."
            : "Your current plan does not include it. The account owner can change the plan from Plan & Billing."}
        </p>
      </div>
    );
  }

  const offline = !data;
  const detail = offline
    ? "Check your internet connection, then try again."
    : requestErrorMessage(error, `The server could not send ${what} just now.`) || `The server could not send ${what} just now.`;
  return (
    <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
      <WifiOff className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
      <p className="text-[15px] font-bold text-foreground">Could not load {what}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {detail} Nothing has been changed or deleted.
      </p>
      <Button type="button" variant="outline" onClick={onRetry} disabled={retrying} className="mt-4 h-11 rounded-xl px-6 font-bold">
        <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "Loading..." : "Try again"}
      </Button>
    </div>
  );
}
