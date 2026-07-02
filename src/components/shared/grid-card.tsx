import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ActionButton } from "./action-button";

interface GridCardProps {
  title: string;
  subtitle?: string | React.ReactNode;
  icon: React.ReactNode;
  iconBgColor?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onView?: () => void;
  metaLeft?: {
    icon: any;
    label: string;
    onClick?: () => void;
  };
  metaRight?: {
    icon: any;
    label: string;
  };
  className?: string;
  delay?: number;
  statusNode?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function GridCard({
  title,
  subtitle,
  icon,
  iconBgColor,
  onEdit,
  onDelete,
  onView,
  metaLeft,
  metaRight,
  className,
  delay = 0,
  statusNode,
  actions,
  children
}: GridCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="h-full"
    >
      <Card className={cn(
        "group relative overflow-hidden p-5 border border-border/60 bg-white rounded-xl shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 h-full flex flex-col",
        className
      )}>
        {/* Header: Icon & Actions */}
        <div className="flex items-start justify-between mb-4">
          <div 
            className={cn(
              "h-10 w-10 shrink-0 shadow-sm border border-border/50 flex items-center justify-center overflow-hidden transition-transform duration-300",
              !iconBgColor ? "rounded-full ring-2 ring-primary/5 group-hover:scale-105" : "rounded-xl"
            )}
            style={iconBgColor ? { backgroundColor: iconBgColor } : undefined}
          >
            {icon}
          </div>
          
          <div className="flex items-center gap-1">
            {statusNode}
            <div className="flex items-center gap-1.5">
              {onView && (
                <ActionButton
                  variant="view"
                  tooltip="View Details"
                  onClick={onView}
                />
              )}
              {onEdit && (
                <ActionButton
                  variant="edit"
                  tooltip="Edit"
                  onClick={onEdit}
                />
              )}
              {onDelete && (
                <ActionButton
                  variant="delete"
                  tooltip="Delete"
                  onClick={onDelete}
                />
              )}
            </div>
            {actions}
          </div>
        </div>

        {/* Content: Title & Subtitle */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
            {title}
          </h3>
          {subtitle && (
            <div className="flex items-center gap-2 mb-3">
              {typeof subtitle === 'string' && iconBgColor && (
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: iconBgColor }} />
              )}
              <span className="text-[11px] text-muted-foreground truncate">
                {subtitle}
              </span>
            </div>
          )}
          {children}
        </div>

        {/* Footer: Meta Info */}
        {(metaLeft || metaRight) && (
          <div className="pt-3 border-t border-border/40 flex items-center justify-between mt-auto gap-2">
            {metaLeft && (
              metaLeft.onClick ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); metaLeft.onClick?.(); }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-primary/80 bg-primary/5 px-2 py-0.5 rounded-md truncate max-w-[60%] cursor-pointer hover:bg-primary/15 hover:underline transition-colors"
                >
                  <metaLeft.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{metaLeft.label}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary/80 bg-primary/5 px-2 py-0.5 rounded-md truncate max-w-[60%]">
                  <metaLeft.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{metaLeft.label}</span>
                </div>
              )
            )}
            {metaRight && (
              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 shrink-0">
                <metaRight.icon className="h-3 w-3" /> {metaRight.label}
              </span>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
