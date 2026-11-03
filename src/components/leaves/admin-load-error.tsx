import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on the admin Leave Management and Leave Types pages when their list
 * could not be loaded. Both pages used to fall through to their EMPTY state on
 * an error, so a dropped connection read as "No leave requests found" or "No
 * leave types configured" -- a false claim about the company's data.
 */
export function AdminLoadError({
  what,
  onRetry,
  retrying = false,
}: {
  what: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"
    >
      <WifiOff className="h-8 w-8 text-destructive mx-auto mb-2" />
      <p className="text-[14px] font-bold text-foreground">Could not load {what}</p>
      <p className="text-[13px] text-muted-foreground mt-1">
        Check the internet connection, then try again.
      </p>
      <Button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 h-11 rounded-xl px-6 font-bold gap-2"
      >
        <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {retrying ? "Loading..." : "Try again"}
      </Button>
    </div>
  );
}
