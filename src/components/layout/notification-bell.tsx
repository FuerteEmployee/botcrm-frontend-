import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Megaphone, Pin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useFeatureToggles } from "@/hooks/use-feature-toggles";
import { cn } from "@/lib/utils";
import { useNoticeFeed, type Announcement } from "@/services/announcement-service";

const SHOWN = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TYPE_STYLE: Record<Announcement["type"], { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-destructive/10 text-destructive" },
  event: { label: "Event", className: "bg-info/10 text-info" },
  policy: { label: "Policy", className: "bg-warning/15 text-warning-foreground" },
  general: { label: "General", className: "bg-primary/10 text-primary" },
};

// "When did this person last open the bell", per login on this device. Only a
// convenience for the unread dot: it never decides what anyone can see.
const seenKey = (phone?: string) => `bot:notices-seen:${phone || "anon"}`;

function readSeen(phone?: string): number {
  try {
    const raw = window.localStorage.getItem(seenKey(phone));
    if (raw) return Number(raw) || 0;
  } catch { /* storage blocked: fall through */ }
  // First open on this device: only the last week counts as new, rather than
  // every notice the company ever posted.
  return Date.now() - WEEK_MS;
}

function writeSeen(phone: string | undefined, at: number) {
  try {
    window.localStorage.setItem(seenKey(phone), String(at));
  } catch { /* storage blocked: the dot just comes back next load */ }
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "yesterday";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Header bell: a small panel with the latest notice-board posts and an unread
 * count. `href` is the full Notice Board for this shell.
 */
export function NotificationBell({ href, className }: { href: "/announcements" | "/user/announcements"; className?: string }) {
  const { session } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const enabled = isFeatureEnabled("announcements");
  const { notices, isLoading, unavailable, failed } = useNoticeFeed(enabled);

  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(session?.phone));
  // What was unread when the panel opened, so those keep their "new" mark
  // while it is open even though opening it marks everything read.
  const [newSince, setNewSince] = useState<number | null>(null);

  const unread = notices.filter((n) => Date.parse(n.createdAt) > seen).length;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNewSince(seen);
      const now = Date.now();
      setSeen(now);
      writeSeen(session?.phone, now);
    }
  };

  if (!enabled) return null;

  const label = unread > 0 ? `Notifications, ${unread} new` : "Notifications";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "relative rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-all hover:scale-105",
            className,
          )}
        >
          <Bell className="h-[17px] w-[17px]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-4 text-center ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-[13px] font-bold text-foreground">Notifications</p>
          {notices.length > 0 && <span className="text-[11px] text-muted-foreground">Latest from the notice board</span>}
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5 animate-pulse">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="h-2.5 w-full rounded bg-muted/70" />
                </div>
              ))}
            </div>
          ) : unavailable ? (
            <EmptyState icon={BellOff} title="Notice board not available" text="It is not part of your company's plan." />
          ) : failed ? (
            <EmptyState icon={BellOff} title="Could not load notifications" text="Check your connection and open this again." />
          ) : notices.length === 0 ? (
            <EmptyState icon={Megaphone} title="You're all caught up" text="New notices from your company will show here." />
          ) : (
            <ul className="divide-y divide-border/50">
              {notices.slice(0, SHOWN).map((n) => {
                const isNew = newSince !== null && Date.parse(n.createdAt) > newSince;
                const type = TYPE_STYLE[n.type] ?? TYPE_STYLE.general;
                return (
                  <li key={n._id}>
                    <Link
                      to={href}
                      onClick={() => setOpen(false)}
                      className={cn("flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors", isNew && "bg-primary/5")}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isNew ? "bg-primary" : "bg-transparent")} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", type.className)}>{type.label}</span>
                          {n.pinned && <Pin className="h-3 w-3 text-muted-foreground" aria-label="Pinned" />}
                          <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-1">{n.title}</p>
                        <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">{n.content}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!unavailable && (
          <Link
            to={href}
            onClick={() => setOpen(false)}
            className="block border-t border-border/60 px-4 py-2.5 text-center text-[12px] font-bold text-primary hover:bg-muted/50 transition-colors"
          >
            Open notice board{notices.length > SHOWN ? ` (${notices.length})` : ""}
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Bell; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      <p className="text-[12px] text-muted-foreground">{text}</p>
    </div>
  );
}
