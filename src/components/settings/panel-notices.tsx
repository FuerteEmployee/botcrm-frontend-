import { Lock, RefreshCw, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Shared by Users, Plan & Billing and Settings: what a panel user sees when a
 * page is not theirs to open, or when it failed to load. Both used to fall
 * through to something false -- an empty list, "No subscription is attached",
 * or a Settings form full of defaults that one click on Save would have
 * written over the real values.
 */
export function NoAccessNotice({ title, message }: { title: string; message: string }) {
  return (
    <Card role="status" className="p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
    </Card>
  );
}

export function PanelLoadError({
  what,
  message,
  onRetry,
  retrying = false,
}: {
  what: string;
  message?: string | null;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Card role="alert" className="border-destructive/30 bg-destructive/5 p-8 text-center">
      <WifiOff className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <p className="text-base font-semibold text-foreground">Could not load {what}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {message || "Check your internet connection, then try again."}
      </p>
      <Button className="mt-4 h-10" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {retrying ? "Loading..." : "Try again"}
      </Button>
    </Card>
  );
}
