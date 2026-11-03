import { useEffect, useId, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestErrorMessage } from "@/services/request-error";

/** Mirrors the backend limit on `adminRemark` (advance requests and expenses). */
export const REJECT_REASON_MAX = 300;

/**
 * Makes the Radix dialog's own close "X" (the last child of DialogContent) a
 * 40x40 target. It is 16px as vendored, which is hard to hit on a phone.
 */
export const DIALOG_CLOSE_40 =
  "[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:grid [&>button:last-child]:size-10 [&>button:last-child]:place-items-center";

/**
 * "Are you sure?" before a rejection, with an optional reason the employee
 * will see on their request.
 *
 * Rejecting used to be one tap on a small X next to Approve, with no
 * confirmation and no way to say why -- so a slip rejected someone's request,
 * and the employee only ever learned "Not approved" and had to go and ask.
 */
export function RejectReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isLoading = false,
  confirmLabel = "Reject",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Called with the trimmed reason ("" when none). A throw keeps the dialog open. */
  onConfirm: (reason: string) => Promise<unknown>;
  isLoading?: boolean;
  confirmLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  // Fresh every time it opens: a reason typed for one request must never be
  // sent with the next one.
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      // Shown inside the dialog, where the admin is looking. Null for a 401,
      // which the api client already announces.
      setError(requestErrorMessage(err, "Could not reject. Please try again."));
    }
  };

  return (
    <Dialog
      open={open}
      // Escape / outside tap / Android Back are ignored while the request is
      // in flight, so the dialog cannot vanish before the answer arrives.
      onOpenChange={(next) => {
        if (!isLoading) onOpenChange(next);
      }}
    >
      <DialogContent className={`rounded-xl sm:max-w-md ${DIALOG_CLOSE_40}`}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId} className="text-sm font-semibold">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={fieldId}
            value={reason}
            maxLength={REJECT_REASON_MAX}
            rows={3}
            placeholder="For example: Please attach the bill and send it again."
            onChange={(e) => setReason(e.target.value)}
            className="resize-none rounded-lg text-sm"
          />
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>The employee will see this reason.</span>
            <span className="shrink-0 tabular-nums">
              {reason.length}/{REJECT_REASON_MAX}
            </span>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 rounded-lg text-white"
            onClick={submit}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
