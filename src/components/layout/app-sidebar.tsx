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
  Search,
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { clearSession } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { useSidebarOrder } from "@/hooks/use-sidebar-order";
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

/** Minimum pixels cursor must move before a click becomes a drag */
const DRAG_THRESHOLD = 6;

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

  const { orderedKeys, reorder } = useSidebarOrder(visibleNav.map((i) => i.to));
  const orderedNav = orderedKeys
    .map((key) => visibleNav.find((i) => i.to === key))
    .filter((i): i is NavItem => Boolean(i));

  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const displayedNav = query
    ? orderedNav.filter((i) => i.label.toLowerCase().includes(query))
    : orderedNav;
  const canReorder = !query;

  // ── Drag state ──────────────────────────────────────────────────────────────
  // Refs so window listeners never have stale closure values.
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const orderedNavRef = useRef<NavItem[]>(orderedNav);
  orderedNavRef.current = orderedNav; // always current

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // One ref per visible list item — used to calculate drop slots.
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  /** Return the list index that corresponds to a given clientY position. */
  const getSlotIndex = (clientY: number): number => {
    const items = itemRefs.current;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (!el) continue;
      const { top, height } = el.getBoundingClientRect();
      if (clientY < top + height / 2) return i;
    }
    return Math.max(0, items.length - 1);
  };

  /**
   * Attached to every draggable row's onPointerDown.
   *
   * Phase 1 – monitor movement. If the pointer moves > DRAG_THRESHOLD px
   *           before lifting, this becomes a drag; otherwise it's a click
   *           and we do nothing (the Link inside handles navigation).
   *
   * Phase 2 – active drag. Update the over-index on every pointermove and
   *           commit the new order on pointerup.
   */
  const handleItemPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      // Ignore non-primary buttons (right-click, etc.)
      if (e.button !== 0 && e.pointerType === "mouse") return;

      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;

      const onMove = (mv: PointerEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;

        // ── Activate drag once threshold is exceeded ──
        if (!dragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          dragging = true;
          dragIndexRef.current = idx;
          overIndexRef.current = idx;
          setDragIndex(idx);
          setOverIndex(idx);
          document.body.style.cursor = "grabbing";
        }

        // ── Update drop-target slot ──
        if (dragging) {
          const slot = getSlotIndex(mv.clientY);
          if (slot !== overIndexRef.current) {
            overIndexRef.current = slot;
            setOverIndex(slot);
          }
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";

        if (!dragging) return; // pure click → let Link navigate normally

        // Swallow the synthetic click that fires after pointerup so the
        // Link doesn't navigate after a drag.
        const eatClick = (ce: Event) => {
          ce.preventDefault();
          ce.stopImmediatePropagation();
          window.removeEventListener("click", eatClick, true);
        };
        window.addEventListener("click", eatClick, true);

        // Commit the new order
        const from = dragIndexRef.current;
        const to = overIndexRef.current;
        if (from !== null && to !== null && from !== to) {
          const newOrder = [...orderedNavRef.current];
          const [moved] = newOrder.splice(from, 1);
          newOrder.splice(to, 0, moved);
          reorder(newOrder.map((item) => item.to));
        }

        dragIndexRef.current = null;
        overIndexRef.current = null;
        setDragIndex(null);
        setOverIndex(null);
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [reorder],
  );

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
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 flex-1"
            onClick={onClose}
          >
            <img
              src={logo}
              alt="BE ON TIME"
              className="h-8 w-8 rounded-lg object-cover"
            />
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
        <nav className="flex-1 flex flex-col min-h-0 px-2.5 py-3">
          {/* Header row */}
          <div className="mb-2 px-2 shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Main Menu
            </span>
            {canReorder && (
              <span className="text-[9px] italic text-muted-foreground/35 select-none">
                drag to reorder
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-2.5 px-0.5 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu..."
              className="w-full h-8 pl-8 pr-2 rounded-lg bg-muted/40 border border-sidebar-border/60 text-[12px] text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
            />
          </div>

          {displayedNav.length === 0 && (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground/50 shrink-0">
              No matching menu items.
            </p>
          )}

          {canReorder ? (
            /* ── Draggable list ─────────────────────────────────────────── */
            <div
              className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
              style={{ userSelect: "none" }}
            >
              {orderedNav.map((item, idx) => {
                const isDragging = dragIndex === idx;
                // Show an insertion line above/below the current hover slot
                const isHoverSlot =
                  dragIndex !== null &&
                  overIndex === idx &&
                  overIndex !== dragIndex;
                const showAbove = isHoverSlot && overIndex < (dragIndex ?? 0);
                const showBelow = isHoverSlot && overIndex > (dragIndex ?? 0);

                return (
                  <div
                    key={item.to}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onPointerDown={(e) => handleItemPointerDown(e, idx)}
                    className={cn(
                      "relative mb-0.5 rounded-xl transition-all duration-100",
                      // When nothing is being dragged: show grab cursor on hover
                      dragIndex === null && "cursor-grab",
                      // Dragged item fades out
                      isDragging && "opacity-35 scale-[0.97] ring-1 ring-primary/20",
                    )}
                  >
                    {/* ── Drop indicators ── */}
                    {showAbove && (
                      <div className="absolute -top-px inset-x-1 h-[2px] rounded-full bg-primary z-10 shadow-sm shadow-primary/30" />
                    )}
                    {showBelow && (
                      <div className="absolute -bottom-px inset-x-1 h-[2px] rounded-full bg-primary z-10 shadow-sm shadow-primary/30" />
                    )}

                    <NavLink
                      item={item}
                      active={isNavItemActive(item, pathname)}
                      onClose={onClose}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Filtered / search list (no drag) ──────────────────────── */
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-0.5">
              <AnimatePresence initial={false}>
                {displayedNav.map((item, idx) => (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ delay: idx * 0.02, duration: 0.15 }}
                    className="mb-0.5"
                  >
                    <NavLink
                      item={item}
                      active={isNavItemActive(item, pathname)}
                      onClose={onClose}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </nav>

        {/* User Profile & Logout */}
        <div className="px-3 pt-4 pb-8 lg:pb-4 border-t border-sidebar-border/50 bg-muted/20">
          <div className="flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px] border border-primary/10 shadow-inner overflow-hidden">
              {session?.companyLogo && !isSubadmin ? (
                <img
                  src={session.companyLogo}
                  alt={session.companyName}
                  className="h-full w-full object-cover"
                />
              ) : session?.name ? (
                session.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              ) : (
                "AD"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[12px] text-foreground truncate uppercase tracking-tight">
                {isSubadmin
                  ? session?.name || "Sub-Admin"
                  : session?.companyName || "BE ON TIME"}
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

function isNavItemActive(item: NavItem, pathname: string) {
  return (
    pathname === item.to ||
    (item.to !== "/" && pathname.startsWith(`${item.to}/`))
  );
}

/** Pure presentational nav link — zero drag logic */
function NavLink({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClose}
      draggable={false}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-300 group",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/60 hover:text-primary hover:bg-primary/3",
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary"
        />
      )}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-all duration-300",
          active
            ? "text-primary scale-110"
            : "group-hover:text-primary group-hover:scale-110",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
