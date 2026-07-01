import { useEffect, useState } from "react";
import { Outlet, useNavigate, Link, useLocation, createFileRoute, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { clearSession, getSession } from "@/lib/auth";
import { 
  Home, History, CalendarDays, Ticket, User, LogOut, Sun, Moon, Sparkles, Coins
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/user")({
  // Only employees may enter the employee panel; everyone else is sent back to
  // "/" which re-routes them to the panel matching their real role.
  beforeLoad: () => {
    const session = getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (session.role !== "employee") {
      throw redirect({ to: "/" });
    }
  },
  component: UserLayout,
});

function UserLayout() {
  const { isAuthenticated, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [headerTime, setHeaderTime] = useState(new Date());

  useEffect(() => {
    setIsMounted(true);
    const stored = typeof window !== "undefined" && window.localStorage.getItem("bot_theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setHeaderTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isMounted, isAuthenticated, navigate]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("bot_theme", next ? "dark" : "light");
  };

  const handleLogout = () => {
    clearSession();
    toast.success("Successfully logged out");
    navigate({ to: "/login" });
  };

  const getGreeting = () => {
    const hr = headerTime.getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  if (!isAuthenticated) return null;

  const navItems = [
    { to: "/user", label: "Home", icon: Home },
    { to: "/user/history", label: "History", icon: History },
    { to: "/user/leaves", label: "Leaves", icon: CalendarDays },
    { to: "/user/advance-salary", label: "My Requests", icon: Coins },
    { to: "/user/tickets", label: "Tickets", icon: Ticket },
    { to: "/user/profile", label: "Profile", icon: User },
  ];

  // Profile is reached via the avatar in the top bar on mobile, so it is
  // excluded from the bottom bar — this keeps the bar uncluttered and lets the
  // remaining items distribute evenly on small screens.
  const bottomNavItems = navItems.filter((item) => item.to !== "/user/profile");
  const isProfileActive = location.pathname === "/user/profile";

  const initials = (session?.name ?? "User").split(" ").map(s => s[0]).slice(0, 2).join("");

  return (
    <div className="h-screen w-full flex bg-[#FAF7F9] dark:bg-[#0D070B] transition-colors duration-500 overflow-hidden relative font-sans">
      
      {/* ─── DYNAMIC AMBIENT BACKDROP GLOWS ─────────────────────────────────── */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] aspect-square rounded-full bg-gradient-to-br from-[#501537]/15 via-purple-500/5 to-transparent blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] aspect-square rounded-full bg-gradient-to-tr from-[#7B2453]/15 via-[#501537]/5 to-transparent blur-[120px] pointer-events-none z-0" />

      {/* ─── DESKTOP SIDEBAR ────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] flex-col border-r border-[#501537]/10 dark:border-white/5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shrink-0 shadow-[4px_0_30px_rgba(80,21,55,0.02)] z-10 relative">
        {/* Brand header */}
        <div className="p-6 border-b border-[#501537]/10 dark:border-white/5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-[#501537]/20 shrink-0">
            <Sparkles className="h-4.5 w-4.5 text-white animate-pulse" />
          </div>
          <div className="leading-tight truncate text-left">
            <h1 className="font-bold text-[14px] tracking-tight text-[#501537] dark:text-white uppercase">Be On Time</h1>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Employee Portal</span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1 relative">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to === "/user" && location.pathname === "/user/");
            const IconComponent = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-300 font-semibold text-xs relative ${
                  isActive
                    ? "text-[#501537] dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="desktopNavActiveBg"
                    className="absolute inset-0 bg-[#501537]/10 dark:bg-white/10 rounded-xl"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                {isActive && (
                  <div className="absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-[#501537] dark:bg-white" />
                )}
                <IconComponent className={`h-4.5 w-4.5 relative z-10 ${isActive ? "stroke-[2.5px] text-[#501537] dark:text-white" : "stroke-[2px]"}`} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Sidebar Footer (Inline Icon-Only Log Out style) */}
        <div className="p-4 border-t border-[#501537]/10 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="h-9 w-9 ring-2 ring-[#501537]/10 dark:ring-white/10 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-[#4A0E2E] to-[#7B2453] text-white text-[12px] font-bold uppercase">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{session?.name}</p>
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate">{session?.role}</p>
              </div>
            </div>

            {/* Icon-Only Log Out Button */}
            <button
              onClick={handleLogout}
              className="h-9 w-9 rounded-xl border border-rose-500/10 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
              aria-label="Log Out"
              title="Log Out"
            >
              <LogOut className="h-4 w-4 stroke-[2.2px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT CONTAINER ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden z-10 relative">
        {/* Mobile Glass Header */}
        <header className="md:hidden sticky top-0 z-30 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-b border-[#501537]/10 dark:border-white/5 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md shadow-[#501537]/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="text-left">
              <h1 className="font-bold text-[13px] tracking-tight text-[#501537] dark:text-white leading-none uppercase">Be On Time</h1>
              <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Employee Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Profile avatar — replaces the Profile item that used to live in the bottom bar */}
            <Link
              to="/user/profile"
              aria-label="Profile"
              className={`rounded-full transition-all active:scale-95 ${
                isProfileActive ? "ring-2 ring-[#501537] dark:ring-white" : "ring-2 ring-[#501537]/10 dark:ring-white/10"
              }`}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-[#4A0E2E] to-[#7B2453] text-white text-[11px] font-bold uppercase">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
              aria-label="Logout"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-20 bg-white/30 dark:bg-[#0D070B]/30 backdrop-blur-xl border-b border-[#501537]/10 dark:border-white/5 px-8 py-4 items-center justify-between shrink-0">
          <div className="flex flex-col text-left">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Employee Workspace</span>
            <h2 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 mt-1.5 flex items-center gap-1.5">
              <span>{getGreeting()}</span>
              <span className="text-[#501537] dark:text-white font-bold">{session?.name}</span>
              <span>👋</span>
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Live Ticking Time pill */}
            <div className="px-3.5 py-1.5 rounded-full bg-white/60 dark:bg-slate-900/60 border border-[#501537]/10 dark:border-white/5 backdrop-blur-md flex items-center gap-2 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-bold text-[#501537] dark:text-slate-300 font-mono tracking-wider">
                {headerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              <span className="text-[9px] text-slate-450 font-semibold uppercase tracking-wider border-l border-slate-200 dark:border-slate-800 pl-2">
                {headerTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable view container */}
        <main className="flex-1 overflow-y-auto pb-28 md:pb-8 scrollbar-thin">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-10 py-6 w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ─── FLOATING GLASS MOBILE BOTTOM BAR NAVIGATION ────────────────────── */}
      <nav className="md:hidden fixed bottom-4 left-3 right-3 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-lg border border-white/20 dark:border-white/5 px-1.5 py-1.5 rounded-[24px] flex items-center justify-between gap-0.5 shadow-[0_12px_40px_rgba(80,21,55,0.08)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] shrink-0">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.to || (item.to === "/user" && location.pathname === "/user/");
          const IconComponent = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition-all duration-300 relative ${
                isActive
                  ? "text-[#501537] dark:text-white font-bold"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="mobileNavIndicator"
                  className="absolute inset-0 bg-[#501537]/10 dark:bg-white/10 rounded-xl"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <IconComponent className={`h-[18px] w-[18px] shrink-0 relative z-10 ${isActive ? "stroke-[2.5px] text-[#501537] dark:text-white" : "stroke-[2px]"}`} />
              <span className="w-full text-center text-[8px] tracking-tight font-semibold uppercase leading-none mt-0.5 relative z-10 truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}

export default UserLayout;
