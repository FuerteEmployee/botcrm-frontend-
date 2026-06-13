import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { ActionButton } from "./action-button";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Are you sure?",
  description = "This action cannot be undone. This will permanently delete the record.",
  confirmText = "Delete Forever",
  cancelText = "Cancel",
  isLoading,
}: DeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl border-destructive/20 shadow-2xl">
        <AlertDialogHeader>
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 text-destructive grid place-items-center mb-2">
            <Trash2 className="h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-[18px] font-black tracking-tight">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[14px] text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 mt-4">
          <AlertDialogCancel className="rounded-xl border-border/60">{cancelText}</AlertDialogCancel>
          <ActionButton
            variant="destructive"
            showLabel
            label={confirmText}
            onClick={onConfirm}
            disabled={isLoading}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
