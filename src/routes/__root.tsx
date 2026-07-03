import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen } from "@/components/shared/splash-screen";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getSession, patchSession } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

function dashboardForRole(role: string) {
  if (role === "superadmin") return "/super/overview";
  if (role === "admin" || role === "subadmin") return "/dashboard";
  return "/user";
}

import appCss from "../styles.css?url";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      enabled: typeof window !== "undefined",
    },
  },
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" },
      { title: "Be On Time" },
      { name: "description", content: "B.O.T HRMS Admin Panel — manage employees, attendance, salary and more." },
      { name: "author", content: "B.O.T" },
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "B.O.T Admin" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "B.O.T — HRMS Admin" },
      { property: "og:description", content: "Premium HRMS dashboard for the B.O.T workforce." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { session } = useAuth();

  // The session lives in a single shared localStorage key across every role
  // (employee/admin/subadmin/superadmin), and logout/login navigate client-side
  // rather than reloading the page — so the module-level QueryClient survives
  // an account switch. Without this, switching accounts in the same tab leaves
  // the previous account's cached data (e.g. tickets, employees) on screen,
  // and acting on it 404s against the new account's tenant scope.
  const lastTokenRef = useRef<string | undefined>(getSession()?.token);
  useEffect(() => {
    const handleAuthChange = () => {
      const token = getSession()?.token;
      if (token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        queryClient.clear();
      }
    };

    window.addEventListener("bot-auth-change", handleAuthChange);
    return () => {
      window.removeEventListener("bot-auth-change", handleAuthChange);
    };
  }, []);

  useEffect(() => {
    const handleUpgradeRequired = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      toast.error(customEvent.detail?.message || "Plan Upgrade Required", {
        description: "Your current subscription plan does not cover this feature module. Please upgrade.",
        duration: 5000,
      });
    };

    window.addEventListener("bot-upgrade-required", handleUpgradeRequired);
    return () => {
      window.removeEventListener("bot-upgrade-required", handleUpgradeRequired);
    };
  }, []);

  // Reconcile a cached (possibly stale) session against the server on load.
  // Guards against a stale localStorage role routing a user to the wrong panel.
  useEffect(() => {
    const stored = getSession();
    if (!stored?.token) return;

    apiClient
      .get("/users/profile")
      .then(({ data }) => {
        const serverRole = data?.role as string | undefined;
        if (serverRole && serverRole !== stored.role) {
          patchSession({ role: serverRole as typeof stored.role });
          // Send them to the panel that actually matches their real role
          window.location.replace(dashboardForRole(serverRole));
        }
      })
      .catch(() => {
        // 401 is already handled by the api-client interceptor (clears session).
        // Other errors (network/offline) are non-fatal — keep the cached session.
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <SplashScreen />
        <Outlet />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
