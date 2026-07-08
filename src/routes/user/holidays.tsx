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
import { useFestivalService } from "@/services/festival-service";

export const Route = createFileRoute("/user/holidays")({
  component: UserHolidays,
});

type FestivalType = "mandatory" | "optional" | "event";

const TYPE_CONFIG = {
  mandatory: {
    icon: CalendarHeart,
    color: "text-primary bg-primary/10",
    label: "Mandatory Holiday",
  },
  optional: {
    icon: Sparkles,
    color: "text-amber-600 bg-amber-500/10",
    label: "Optional Holiday",
  },
  event: {
    icon: PartyPopper,
    color: "text-blue-600 bg-blue-500/10",
    label: "Company Event",
  },
};

function UserHolidays() {
  const { festivals: list, isLoading } = useFestivalService();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | FestivalType>("all");

  const filtered = list
    .filter((f) => filterType === "all" || f.type === filterType)
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const upcomingCount = list.filter((f) => new Date(f.endDate) >= new Date(new Date().setHours(0, 0, 0, 0))).length;
  const mandatoryCount = list.filter((f) => f.type === "mandatory").length;

  return (
    <div className="w-full space-y-6">
      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Festivals & Holidays</h2>
          <p className="text-xs text-slate-500">
            The company's annual holiday calendar and upcoming events, as published by HR.
          </p>
        </div>
      </div>

      {/* QUICK METRICS GRID ROW */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-4xl mx-auto">
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center">
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest">Total Holidays</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block">{list.length}</span>
        </Card>
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest pl-1">Mandatory</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">{mandatoryCount}</span>
        </Card>
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest pl-1">Upcoming</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">{upcomingCount}</span>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-auto flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search holidays..."
            className="h-10 w-full pl-10 pr-4 bg-white/80 dark:bg-slate-900/40 border-slate-100/50 dark:border-white/5 rounded-xl text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | FestivalType)}>
          <SelectTrigger className="h-10 w-full sm:w-[200px] border-slate-100/50 dark:border-white/5 bg-white/80 dark:bg-slate-900/40 rounded-xl text-xs gap-2">
            <Filter className="h-3.5 w-3.5 text-primary/70" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="mandatory">Mandatory Holidays</SelectItem>
            <SelectItem value="optional">Optional Holidays</SelectItem>
            <SelectItem value="event">Company Events</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-[110px] rounded-2xl border-slate-100/50 dark:border-white/5 animate-pulse bg-slate-100/40 dark:bg-slate-900/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white/40 dark:bg-slate-900/30 rounded-[24px] border border-dashed border-slate-200/60 dark:border-white/10">
          <Gift className="h-8 w-8 text-primary/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No holidays found</p>
          <p className="text-xs text-slate-500 mt-1">Check back later — HR hasn't published any holidays matching this filter yet.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="holiday-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {filtered.map((festival, i) => {
              const config = TYPE_CONFIG[festival.type as FestivalType] || TYPE_CONFIG.mandatory;
              const Icon = config.icon;
              const start = new Date(festival.startDate);
              const end = new Date(festival.endDate);
              const month = start.toLocaleString("default", { month: "short" });
              const day = start.getDate();
              const isPast = end < new Date(new Date().setHours(0, 0, 0, 0));
              const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

              return (
                <motion.div
                  key={festival._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <Card className={cn(
                    "p-4 border border-slate-100/50 dark:border-white/5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-xs flex items-center gap-4",
                    isPast && "opacity-60"
                  )}>
                    <div className="h-14 w-12 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100/60 dark:border-white/5 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-primary/60">{month}</span>
                      <span className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">{day}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{festival.name}</h3>
                        {!isPast && (
                          <Badge className="h-4.5 text-[8px] px-1.5 font-bold uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Upcoming</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
                        <CalendarDays className="h-3 w-3 text-primary/60" />
                        <span>
                          {festival.startDate === festival.endDate
                            ? start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} - ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <Clock className="h-3 w-3 text-primary/60" />
                        <span>{diffDays} {diffDays === 1 ? "Day" : "Days"}</span>
                      </div>
                      <Badge variant="outline" className={cn("h-4.5 text-[8px] px-1.5 font-bold mt-2 border-transparent", config.color)}>
                        <Icon className="h-2.5 w-2.5 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
