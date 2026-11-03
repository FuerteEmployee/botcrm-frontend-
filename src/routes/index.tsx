import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";
import { panelHomeFor } from "@/lib/panel-home";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const session = getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (session.role === "superadmin") {
      throw redirect({ to: "/super/overview" });
    }
    if (session.role === "admin" || session.role === "subadmin") {
      // A sub-admin goes to the first page they may open, not always /dashboard.
      throw redirect({ to: panelHomeFor(session) as "/dashboard" });
    }
    throw redirect({ to: "/user" });
  },
});
