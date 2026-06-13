import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);

  const handleProfileClick = () => {
    if (session?.role === 'admin') {
      navigate({ to: '/settings' });
    } else {
      navigate({ to: '/user/profile' });
    }
  };

  useEffect(() => {
    const stored = typeof window !== "undefined" && window.localStorage.getItem("bot_theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("bot_theme", next ? "dark" : "light");
  };

  const initials = (session?.name ?? "Admin").split(" ").map((s) => s[0]).slice(0, 2).join("");

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-card/90 backdrop-blur-md border-b border-border/50 shadow-sm">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={onMenuClick}
          className="lg:hidden rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-colors mr-1"
          aria-label="Open menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        {/* Mobile Logo */}
        <div className="flex lg:hidden items-center gap-2">
          <img src="/favicon.png" alt="B.O.T" className="h-7 w-7 rounded-lg" />
          <span className="font-bold text-[14px] tracking-tight">Be On Time</span>
        </div>

        <div className="hidden md:flex items-center gap-2 max-w-xs flex-1">
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search..."
              className="pl-8 h-8 text-[13px] bg-muted/40 border-transparent focus-visible:bg-white dark:focus-visible:bg-card focus-visible:border-primary/30 rounded-lg transition-all"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-all hover:scale-105"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
          </button>

          <button className="relative rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-all hover:scale-105" aria-label="Notifications">
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-white" />
          </button>

          <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-border/60">
            <div className="hidden sm:block leading-tight text-right">
              <div className="text-[13px] font-medium text-foreground">{session?.role === 'admin' ? session?.companyName || "BE ON TIME" : 'Staff'}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium"> {session?.role === 'admin' ? session?.phone || "BE ON TIME" : 'Staff'}</div>
            </div>
            <Avatar onClick={handleProfileClick} className="h-8 w-8 ring-2 ring-primary/15 hover:ring-primary/35 transition-all cursor-pointer">
              {session?.companyLogo && (
                <AvatarImage src={session.companyLogo} alt={session.companyName || "Logo"} className="object-cover" />
              )}
              <AvatarFallback className="bg-primary/8 text-primary text-[11px] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
}
