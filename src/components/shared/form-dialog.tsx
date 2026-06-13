import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "./action-button";
import { cn } from "@/lib/utils";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitText?: string;
  cancelText?: string;
  isLoading?: boolean;
  maxWidth?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitText = "Save Changes",
  cancelText = "Cancel",
  isLoading = false,
  maxWidth = "sm:max-w-[425px]",
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("rounded-2xl p-6 md:p-8 border-none shadow-2xl", maxWidth)}>
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-[20px] font-black tracking-tight">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-[14px] text-muted-foreground leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="py-2">
          {children}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 mt-4 border-t border-border/40 pt-4">
          <ActionButton 
            variant="history"
            type="button"
            label={cancelText}
            showLabel
            onClick={() => onOpenChange(false)} 
            className="rounded-xl h-10 font-bold text-[13px] px-8 bg-transparent hover:bg-muted border-none text-muted-foreground"
            disabled={isLoading}
          />
          <ActionButton 
            variant="add"
            type="button"
            label={submitText}
            showLabel
            onClick={onSubmit} 
            className="px-10 h-10 rounded-xl text-[14px] shadow-lg shadow-primary/20"
            loading={isLoading}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
