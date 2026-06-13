import { useEffect, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// Pages a sub-admin may never reach regardless of their permission map.
const ADMIN_ONLY_PAGES = new Set(["users"]);

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { isAuthenticated, session } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    if (!isAuthenticated) {
      navigate({ to: "/login" });
      return;
    }
    if (session?.role !== "admin" && session?.role !== "subadmin") {
      navigate({ to: "/user" });
      return;
    }

    // Sub-admins can only open pages their permission map allows.
    if (session?.role === "subadmin") {
      const perms = session.permissions || {};
      const pageKey = pathname.split("/")[1] || "dashboard";
      const allowed = !ADMIN_ONLY_PAGES.has(pageKey) && perms[pageKey]?.view === true;

      if (!allowed) {
        const firstAllowed = Object.keys(perms).find((k) => perms[k]?.view);
        toast.error("You don't have access to that page");
        navigate({ to: (firstAllowed ? `/${firstAllowed}` : "/login") as string });
      }
    }
  }, [isMounted, isAuthenticated, session, navigate, pathname]);



  return (
    <div className="h-screen flex w-full overflow-hidden bg-muted/20 selection:bg-primary/20 selection:text-primary fixed inset-0">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background relative">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-24 sm:pb-8 max-w-[1440px] w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
