import React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Pencil, Trash2, Eye, Plus, Loader2, LucideIcon, Download, 
  Check, X, MessageSquare, MoreVertical, Search, Filter, RotateCw, 
  RotateCcw, Play, History 
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type ActionButtonVariant = 
  | "edit" 
  | "delete" 
  | "view" 
  | "add" 
  | "download" 
  | "approve" 
  | "reject" 
  | "comment" 
  | "more" 
  | "search" 
  | "filter"
  | "refresh"
  | "destructive"
  | "revoke"
  | "reopen"
  | "history"
  | "ghost";

interface ActionButtonProps extends Omit<ButtonProps, "variant"> {
  variant: ActionButtonVariant;
  icon?: LucideIcon;
  tooltip?: string;
  loading?: boolean;
  label?: string;
  showLabel?: boolean;
}

const variantConfig: Record<ActionButtonVariant, { icon: LucideIcon; className: string; }> = {
  edit: { icon: Pencil, className: "bg-primary/5 text-primary border border-primary/10" },
  delete: { icon: Trash2, className: "bg-destructive/5 text-destructive border border-destructive/10" },
  view: { icon: Eye, className: "bg-info/5 text-info border border-info/10" },
  add: { icon: Plus, className: "bg-gradient-primary text-primary-foreground shadow-elegant border-none" },
  download: { icon: Download, className: "bg-emerald-500/5 text-emerald-600 border border-emerald-500/10" },
  approve: { icon: Check, className: "bg-emerald-500/5 text-emerald-600 border border-emerald-500/10" },
  reject: { icon: X, className: "bg-destructive/5 text-destructive border border-destructive/10" },
  comment: { icon: MessageSquare, className: "bg-primary/5 text-primary border border-primary/10" },
  more: { icon: MoreVertical, className: "bg-muted/30 text-muted-foreground" },
  search: { icon: Search, className: "bg-primary/5 text-primary" },
  filter: { icon: Filter, className: "bg-primary/5 text-primary" },
  refresh: { icon: RotateCw, className: "bg-primary/5 text-primary" },
  destructive: { icon: Trash2, className: "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 border-none" },
  revoke: { icon: RotateCcw, className: "bg-amber-500/5 text-amber-600 border border-amber-500/10" },
  reopen: { icon: Play, className: "bg-primary/5 text-primary border border-primary/10" },
  history: { icon: History, className: "bg-muted/30 text-muted-foreground" },
  ghost: { icon: MoreVertical, className: "bg-transparent text-muted-foreground hover:bg-muted/50" },
};

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ variant, icon: IconOverride, tooltip, loading, className, label, showLabel, size, children, asChild, ...props }, ref) => {
    const config = variantConfig[variant];
    const Icon = IconOverride || config.icon;

    const content = (
      <>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {showLabel && (
          <span className="whitespace-nowrap">
            {label || variant.charAt(0).toUpperCase() + variant.slice(1)}
          </span>
        )}
      </>
    );

    const button = (
      <Button
        ref={ref}
        asChild={asChild}
        variant={(variant === "add" || variant === "destructive") ? "default" : "ghost"}
        size={showLabel ? (size || "default") : (size || "icon")}
        className={cn(
          "rounded-xl font-bold flex flex-row items-center justify-center gap-2.5",
          !showLabel && "h-9 w-9",
          showLabel && "h-10 px-5 text-[13px] tracking-tight",
          config.className,
          loading && "opacity-70 pointer-events-none",
          className
        )}
        {...props}
      >
        {asChild ? (
          React.isValidElement(children) && !(children.props as any).children
            ? React.cloneElement(children as React.ReactElement, {}, content)
            : children
        ) : (
          children || content
        )}
      </Button>
    );

    if (tooltip && !showLabel) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent className="rounded-lg text-[10px] font-black uppercase tracking-wider bg-white text-foreground border shadow-xl">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);

ActionButton.displayName = "ActionButton";
