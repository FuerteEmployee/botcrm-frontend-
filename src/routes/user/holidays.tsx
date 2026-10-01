import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarHeart, Sparkles, PartyPopper, Gift, CalendarDays, Clock, Search, Filter
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFestivalService, type Festival } from "@/services/festival-service";
import { LoadError } from "@/components/user/load-error";

export const Route = createFileRoute("/user/holidays")({
  component: UserHolidays,
});

type FestivalType = "mandatory" | "optional" | "event";

const TYPE_CONFIG = {
  mandatory: {
    icon: CalendarHeart,
    color: "text-primary bg-primary/10",
    label: "Holiday for all",
  },
  optional: {
    icon: Sparkles,
    color: "text-amber-700 bg-amber-500/10",
    label: "Optional holiday",
  },
  event: {
    icon: PartyPopper,
    color: "text-blue-700 bg-blue-500/10",
    label: "Company event",
  },
};

// Festival dates are stored as "YYYY-MM-DD" calendar days. Read them as the
// phone's own local day; new Date("2026-10-02") is UTC midnight, a different
// instant from the local midnight it is compared against.
function parseDay(value: string) {
  const [y, m, d] = (value || "").slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function HolidayCard({ festival, index }: { festival: Festival; index: number }) {
  const config = TYPE_CONFIG[festival.type as FestivalType] || TYPE_CONFIG.mandatory;
  const Icon = config.icon;
  const start = parseDay(festival.startDate);
  const end = parseDay(festival.endDate || festival.startDate);
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const isPast = end < today;
  const isToday = start <= today && today <= end;
  const month = start.toLocaleString("en-IN", { month: "short" });
  const day = start.getDate();
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-IN", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.04 }}
    >
      <Card className={cn(
        "p-4 border border-slate-100/50 dark:border-white/5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-xs flex items-center gap-4",
        isPast && "opacity-60",
        isToday && "border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-500/40"
      )}>
        <div className="h-14 w-12 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100/60 dark:border-white/5 flex flex-col items-center justify-center shrink-0">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary/80">{month}</span>
          <span className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">{day}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 break-words">{festival.name}</h3>
            {isToday ? (
              <Badge className="text-[11px] px-1.5 py-0.5 font-bold uppercase bg-emerald-600 text-white border-transparent">Today</Badge>
            ) : !isPast && (
              <Badge className="text-[11px] px-1.5 py-0.5 font-bold uppercase bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Upcoming</Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1 flex-wrap">
            <CalendarDays className="h-3.5 w-3.5 text-primary/60" />
            <span>
              {diffDays === 1 ? fmt(start, true) : `${fmt(start, false)} – ${fmt(end, true)}`}
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <Clock className="h-3.5 w-3.5 text-primary/60" />
            <span>{diffDays} {diffDays === 1 ? "day" : "days"}</span>
          </div>
          <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-bold mt-2 border-transparent", config.color)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </Card>
    </motion.div>
  );
}

function UserHolidays() {
  const { festivals: list, isLoading, isError, error, refetch, isFetching } = useFestivalService();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | FestivalType>("all");

  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const isOver = (f: Festival) => parseDay(f.endDate || f.startDate) < today;

  const filtered = list
    .filter((f) => filterType === "all" || f.type === filterType)
    .filter((f) => (f.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => parseDay(a.startDate).getTime() - parseDay(b.startDate).getTime());

  // What is still ahead comes first. In date order, an employee in October
  // scrolled past every holiday since January before reaching the next one.
  const upcoming = filtered.filter((f) => !isOver(f));
  // Most recent first: last month's holiday, not one from years ago.
  const past = filtered.filter(isOver).reverse();

  const upcomingCount = list.filter((f) => !isOver(f)).length;
  const mandatoryCount = list.filter((f) => f.type === "mandatory").length;

  return (
    <div className="w-full space-y-6">
      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Festivals & Holidays</h2>
          <p className="text-xs text-slate-500">
            Days the office is closed this year, and company events.
          </p>
        </div>
      </div>

      {/* QUICK METRICS GRID ROW */}
      {!(isError && list.length === 0) && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-4xl mx-auto">
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center">
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide">Total</span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block">{list.length}</span>
          </Card>
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide pl-1">For all</span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">{mandatoryCount}</span>
          </Card>
          <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wide pl-1">Coming up</span>
            <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">{upcomingCount}</span>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-auto flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search holidays..."
            className="h-11 w-full pl-10 pr-4 bg-white/80 dark:bg-slate-900/40 border-slate-100/50 dark:border-white/5 rounded-xl text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | FestivalType)}>
          <SelectTrigger className="h-11 w-full sm:w-[200px] border-slate-100/50 dark:border-white/5 bg-white/80 dark:bg-slate-900/40 rounded-xl text-sm gap-2">
            <Filter className="h-3.5 w-3.5 text-primary/70" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="mandatory">Holidays for all</SelectItem>
            <SelectItem value="optional">Optional holidays</SelectItem>
            <SelectItem value="event">Company events</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-[110px] rounded-2xl border-slate-100/50 dark:border-white/5 animate-pulse bg-slate-100/40 dark:bg-slate-900/40" />
          ))}
        </div>
      ) : isError && list.length === 0 ? (
        // Not the empty state: "HR hasn't published any holidays" was a false
        // claim whenever the list simply failed to load.
        <LoadError what="the holiday list" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white/40 dark:bg-slate-900/30 rounded-[24px] border border-dashed border-slate-200/60 dark:border-white/10">
          <Gift className="h-8 w-8 text-primary/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No holidays found</p>
          <p className="text-[13px] text-slate-500 mt-1 px-4">
            {list.length === 0 ? "HR has not added this year's holidays yet. Check back later." : "Nothing matches your search. Try another word or type."}
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="holiday-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {upcoming.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {upcoming.map((festival, i) => <HolidayCard key={festival._id} festival={festival} index={i} />)}
              </div>
            )}
            {past.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">Already over</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {past.map((festival, i) => <HolidayCard key={festival._id} festival={festival} index={upcoming.length + i} />)}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
