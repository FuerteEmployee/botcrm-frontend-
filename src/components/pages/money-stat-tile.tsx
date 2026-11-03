import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENTS = {
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  destructive: "bg-red-500/10 text-red-700 dark:text-red-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  primary: "bg-primary/10 text-primary",
} as const;

/**
 * A number tile for the Advance Salary and Expenses admin pages.
 *
 * The shared StatCard sets its label at 10px on phones, which is too small to
 * read on the budget Android phones admins use; this keeps every line at 12px
 * or more and lets a long value wrap instead of being cut off.
 */
export function MoneyStatTile({
  label,
  value,
  subLabel,
  icon: Icon,
  accent = "primary",
  className,
}: {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-3 shadow-sm sm:p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold leading-tight text-muted-foreground">{label}</p>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", ACCENTS[accent])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-1 text-[20px] font-bold leading-tight text-foreground [overflow-wrap:anywhere] sm:text-[24px]">{value}</p>
      {subLabel && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{subLabel}</p>}
    </div>
  );
}
