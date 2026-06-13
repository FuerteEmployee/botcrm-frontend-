import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Package,
  Receipt,
  Bell,
  LogOut,
} from "lucide-react";
import { clearSession, getSession } from "@/lib/auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import logo from "@/assets/bot-logo.png";

const mainNav = [
  { to: "/super/overview", label: "Dashboard", icon: LayoutDashboard },
  { to: "/super/tenants", label: "Companies", icon: Building2 },
];

const subsNav = [
  { to: "/super/plans", label: "Plans", icon: Package },
  { to: "/super/billing", label: "Billing", icon: Receipt },
  { to: "/super/alerts", label: "Alerts", icon: Bell },
];

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  collapsed?: boolean;
}) {
  const matchRoute = useMatchRoute();
  const isActive = matchRoute({ to, fuzzy: true });

  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={`
        flex items-center ${collapsed ? 'justify-center h-9 w-9 mx-auto p-0' : 'gap-2.5 px-3 py-2'} rounded-lg text-[13px] font-medium transition-all
        ${
          isActive
            ? "bg-primary/10 text-primary border-l-2 border-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground border-l-2 border-transparent"
        }
      `}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function SuperSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const session = getSession();
  const initials = session?.name
    ? session.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "SA";

  return (
    <aside className={`flex h-full flex-col border-r bg-card transition-all duration-300 ${collapsed ? 'w-[64px]' : 'w-[220px]'}`}>
      {/* Logo */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'} py-4 border-b h-[65px]`}>
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
          <img src={logo} alt="B.O.T" className="h-6 w-6 object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden whitespace-nowrap">
            <div className="text-sm font-semibold leading-none">B.O.T</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Super Admin
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-3 px-3">
        {/* Main */}
        <div className="mb-4">
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
              Main
            </p>
          )}
          <div className="space-y-0.5">
            {mainNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Subscriptions */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
              Subscriptions
            </p>
          )}
          <div className="space-y-0.5">
            {subsNav.map((item) => (
              <NavItem key={item.to + item.label} {...item} collapsed={collapsed} />
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* User footer */}
      <div className={`border-t py-3 ${collapsed ? 'px-0 flex-col gap-3 items-center' : 'px-3'}`}>
        <div className={`flex items-center ${collapsed ? 'flex-col justify-center' : 'gap-2.5'}`}>
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary mb-1">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">
                {session?.name || "Super Admin"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Super admin
              </div>
            </div>
          )}
          <button
            onClick={() => {
              clearSession();
              window.location.href = "/login";
            }}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
