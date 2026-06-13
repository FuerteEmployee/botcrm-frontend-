import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: "primary" | "success" | "warning" | "info" | "destructive";
  subLabel?: string;
  delay?: number;
  to?: string;
  search?: any;
}

const ACCENT_THEMES = {
  primary: {
    icon: "bg-primary/10 text-primary border-primary/20",
    glow: "from-primary/5 to-transparent",
    border: "group-hover:border-primary/40",
    trend: "text-primary bg-primary/8",
    dot: "bg-primary",
  },
  success: {
    icon: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    glow: "from-emerald-500/5 to-transparent",
    border: "group-hover:border-emerald-500/40",
    trend: "text-emerald-600 bg-emerald-500/8",
    dot: "bg-emerald-500",
  },
  warning: {
    icon: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    glow: "from-amber-500/5 to-transparent",
    border: "group-hover:border-amber-500/40",
    trend: "text-amber-700 bg-amber-500/8",
    dot: "bg-amber-500",
  },
  info: {
    icon: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    glow: "from-blue-500/5 to-transparent",
    border: "group-hover:border-blue-500/40",
    trend: "text-blue-600 bg-blue-500/8",
    dot: "bg-blue-500",
  },
  destructive: {
    icon: "bg-red-500/10 text-red-600 border-red-500/20",
    glow: "from-red-500/5 to-transparent",
    border: "group-hover:border-red-500/40",
    trend: "text-red-600 bg-red-500/8",
    dot: "bg-red-500",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  accent = "primary",
  subLabel,
  delay = 0,
  to,
  search,
}: StatCardProps) {
  const theme = ACCENT_THEMES[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -4 }}
      className="group h-full"
    >
      {to ? (
        <Link to={to} search={search} className="block h-full cursor-pointer">
          <CardContent theme={theme} Icon={Icon} label={label} value={value} trend={trend} trendUp={trendUp} />
        </Link>
      ) : (
        <CardContent theme={theme} Icon={Icon} label={label} value={value} trend={trend} trendUp={trendUp} />
      )}
    </motion.div>
  );
}

function CardContent({ theme, Icon, label, value, trend, trendUp }: any) {
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-xl border border-border/50 bg-white p-4 shadow-sm transition-all duration-500 hover:shadow-lg hover:shadow-primary/5",
        theme.border
      )}
    >
      {/* Subtle background glow */}
      <div className={cn("absolute -right-8 -top-8 h-32 w-32 bg-linear-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100", theme.glow)} />

      {/* Decorative corner accent */}
      <div className="absolute right-0 top-0 h-16 w-16 overflow-hidden opacity-5 group-hover:opacity-10 transition-opacity duration-500">
        <Icon className="absolute -right-2 -top-2 h-full w-full rotate-12" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between mb-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3",
              theme.icon
            )}
          >
            <Icon className="h-5 w-5" />
          </div>

          {trend && (
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight shadow-sm transition-transform duration-300 group-hover:scale-105",
              trendUp ? "bg-emerald-500/12 text-emerald-600" : "bg-red-500/12 text-red-600"
            )}>
              {trendUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {trend}
            </div>
          )}
        </div>

        <div>
          <p className="text-[12px] font-bold tracking-widest text-muted-foreground/50 mb-1">
            {label}
          </p>
          <h3 className="text-[24px] font-bold tracking-tight text-foreground/90 tabular-nums leading-none">
            {value}
          </h3>
        </div>
      </div>
    </div>
  );
}

