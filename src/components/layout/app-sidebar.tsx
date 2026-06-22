import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Wallet,
  Ticket,
  Clock,
  MapPin,
  Settings,
  LogOut,
  X,
  CalendarDays,
  CalendarCheck,
  Megaphone,
  Gift,
  Settings2,
  Landmark,
  UserCheck,
  Monitor,
  Receipt,
  UserCog,
  CreditCard,
  Coins,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { clearSession } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import logo from "@/assets/bot-logo.png";
import React from "react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/branches", label: "Branches", icon: Landmark },
  { to: "/departments", label: "Departments", icon: Building2 },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/leaves", label: "Leave Management", icon: CalendarDays },
  { to: "/attendance", label: "Attendance Logs", icon: CalendarCheck },
  { to: "/tickets", label: "Helpdesk Tickets", icon: Ticket },
  { to: "/salary", label: "Salary", icon: Wallet },
  { to: "/advance-salary", label: "Advance Salary & Loan", icon: Coins },
  { to: "/leads", label: "Lead Management", icon: UserCheck },
  { to: "/festivals", label: "Festivals & Holidays", icon: Gift },
  { to: "/announcements", label: "Notice Board", icon: Megaphone },
  { to: "/tracking", label: "Tracking", icon: MapPin },
  { to: "/leave-types", label: "Leave Types", icon: Settings2 },
  { to: "/shifts", label: "Shift Management", icon: Clock },
  { to: "/assets", label: "Assets Management", icon: Monitor },
  { to: "/expenses", label: "Expense Management", icon: Receipt },
  { to: "/users", label: "Users", icon: UserCog, adminOnly: true },
  { to: "/billing", label: "Plan & Billing", icon: CreditCard, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const pathname = location.pathname;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { session } = useAuth();
  const isSubadmin = session?.role === "subadmin";
  const permissions = session?.permissions || {};

  // Filter nav: subadmin sees only permitted pages; admin-only items hidden from subadmin
  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly && isSubadmin) return false;
    if (!isSubadmin) return true;
    const key = item.to.replace("/", "");
    return permissions[key]?.view === true;
  });

  const handleLogout = () => {
    clearSession();
    toast.success("Logged out");
    navigate({ to: "/login" });
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-sidebar text-sidebar-foreground shadow-lg transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 border-r border-sidebar-border",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2.5 flex-1" onClick={onClose}>
            <img src={logo} alt="BE ON TIME" className="h-8 w-8 rounded-lg object-cover" />
            <div className="leading-tight">
              <div className="font-bold text-[15px] tracking-[0.02em] text-foreground uppercase truncate">
                BE ON TIME
              </div>
              <div className="text-[10px] text-muted-foreground font-semibold tracking-[0.05em] uppercase">
                HRMS Platform
              </div>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 py-3 space-y-0.5">
          <div className="mb-2 px-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Main Menu</span>
          </div>
          {visibleNav.map((item, idx) => {
            const active =
              pathname === item.to ||
              (item.to !== "/" && pathname.startsWith(`${item.to}/`));
            const Icon = item.icon;
            return (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.025 }}
              >
                <Link
                  to={item.to}
                  onClick={onClose}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-300 group mb-0.5",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-sidebar-foreground/60 hover:text-primary hover:bg-primary/3"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary"
                    />
                  )}
                  <Icon className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-all duration-300",
                    active ? "text-primary scale-110" : "group-hover:text-primary group-hover:scale-110"
                  )} />
                  <span className={cn("truncate", active)}>{item.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* User Profile & Logout */}
        <div className="px-3 pt-4 pb-8 lg:pb-4 border-t border-sidebar-border/50 bg-muted/20">
          <div className="flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px] border border-primary/10 shadow-inner overflow-hidden">
              {session?.companyLogo && !isSubadmin ? (
                <img src={session.companyLogo} alt={session.companyName} className="h-full w-full object-cover" />
              ) : (
                session?.name ? session.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "AD"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[12px] text-foreground truncate uppercase tracking-tight">
                {isSubadmin ? session?.name || "Sub-Admin" : session?.companyName || "BE ON TIME"}
              </div>
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                {isSubadmin ? "Sub-Admin" : session?.phone || "BE ON TIME"}
              </div>
            </div>
            <motion.button
              onClick={handleLogout}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white flex items-center justify-center transition-all duration-300 shadow-sm"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </aside>
    </>
  );
}
