import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: LucideIcon;
  containerClassName?: string;
  error?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, icon: Icon, containerClassName, className, error, ...props }, ref) => {
    return (
      <div className={cn(label ? "space-y-4" : "space-y-0", containerClassName)}>
        {label && (
          <Label className="text-[11px] font-bold text-muted-foreground tracking-widest ml-1">
            {label}
            {props.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
        )}
        <div className="relative group">
          {Icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 text-primary/40 group-focus-within:text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <Input
            ref={ref}
            className={cn(
              "h-12 border-border/60 bg-background focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/5 rounded-xl text-[14px] font-normal transition-all shadow-sm",
              Icon && "pl-11",
              error && "border-destructive focus-visible:ring-destructive/5",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] text-destructive font-medium ml-1">{error}</p>}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
