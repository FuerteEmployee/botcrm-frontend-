import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FormSelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  icon?: LucideIcon;
  options: { label: string; value: string; subLabel?: string; icon?: LucideIcon }[];
  containerClassName?: string;
  className?: string;
  error?: string;
  required?: boolean;
}

export function FormSelect({
  label,
  value,
  onValueChange,
  placeholder = "Select option",
  icon: Icon,
  options,
  containerClassName,
  className,
  error,
  required,
}: FormSelectProps) {
  return (
    <div className={cn("space-y-4", containerClassName)}>
      {label && (
        <Label className="text-[11px] font-bold text-muted-foreground tracking-widest ml-1">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className={cn(
            "h-12 border-border/60 bg-background focus:ring-4 focus:ring-primary/5 rounded-xl text-[14px] font-normal transition-all shadow-sm",
            error && "border-destructive focus:ring-destructive/5",
            className
          )}
        >
          <div className="flex items-center gap-2.5">
            {Icon && <Icon className="h-4 w-4 text-primary/60" />}
            <SelectValue placeholder={placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-xl border-border/60 p-1">
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="rounded-lg py-2.5 text-[13px] focus:bg-primary/5 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {opt.icon && (
                  <div className="h-7 w-7 rounded-lg bg-muted/50 flex items-center justify-center">
                    <opt.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className="flex flex-col items-start">
                  <span className="font-medium">{opt.label}</span>
                  {opt.subLabel && <span className="text-[10px] text-muted-foreground">{opt.subLabel}</span>}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-[11px] text-destructive font-medium ml-1">{error}</p>}
    </div>
  );
}
