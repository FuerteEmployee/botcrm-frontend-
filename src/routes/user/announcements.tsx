import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, Pin, AlertTriangle, PartyPopper, ScrollText, Search, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAnnouncementService, type Announcement } from "@/services/announcement-service";

export const Route = createFileRoute("/user/announcements")({
  component: UserAnnouncements,
});

type AnnouncementType = Announcement["type"];

const TYPE_CONFIG: Record<AnnouncementType, { icon: typeof Megaphone; color: string; label: string }> = {
  urgent: { icon: AlertTriangle, color: "text-rose-600 bg-rose-500/10", label: "Urgent" },
  event: { icon: PartyPopper, color: "text-blue-600 bg-blue-500/10", label: "Event" },
  policy: { icon: ScrollText, color: "text-primary bg-primary/10", label: "Policy" },
  general: { icon: Megaphone, color: "text-amber-600 bg-amber-500/10", label: "General" },
};

function UserAnnouncements() {
  const { announcements: list, isLoading } = useAnnouncementService();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | AnnouncementType>("all");

  const filtered = list
    .filter((a) => filterType === "all" || a.type === filterType)
    .filter((a) => a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Announcements</h2>
          <p className="text-xs text-slate-500">Company-wide notices and updates published by HR.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-auto flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search announcements..."
            className="h-10 w-full pl-10 pr-4 bg-white/80 dark:bg-slate-900/40 border-slate-100/50 dark:border-white/5 rounded-xl text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | AnnouncementType)}>
          <SelectTrigger className="h-10 w-full sm:w-[200px] border-slate-100/50 dark:border-white/5 bg-white/80 dark:bg-slate-900/40 rounded-xl text-xs gap-2">
            <Filter className="h-3.5 w-3.5 text-primary/70" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="event">Events</SelectItem>
            <SelectItem value="policy">Policy</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-[100px] rounded-2xl border-slate-100/50 dark:border-white/5 animate-pulse bg-slate-100/40 dark:bg-slate-900/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white/40 dark:bg-slate-900/30 rounded-[24px] border border-dashed border-slate-200/60 dark:border-white/10">
          <Megaphone className="h-8 w-8 text-primary/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No announcements found</p>
          <p className="text-xs text-slate-500 mt-1">Check back later — HR hasn't published anything matching this filter yet.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="announcement-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-4"
          >
            {filtered.map((a, i) => {
              const config = TYPE_CONFIG[a.type] || TYPE_CONFIG.general;
              const Icon = config.icon;
              return (
                <motion.div
                  key={a._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <Card className={cn(
                    "p-4 border border-slate-100/50 dark:border-white/5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-xs",
                    a.pinned && "border-primary/30 ring-1 ring-primary/10"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", config.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.title}</h3>
                          {a.pinned && (
                            <Badge className="h-4.5 text-[8px] px-1.5 font-bold uppercase bg-primary/10 text-primary border-primary/20 gap-1">
                              <Pin className="h-2.5 w-2.5" /> Pinned
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn("h-4.5 text-[8px] px-1.5 font-bold uppercase border-transparent", config.color)}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-line">{a.content}</p>
                        <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
                          <span>{a.author}</span>
                          <span>•</span>
                          <span>{a.date}</span>
                        </div>
                      </div>
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
