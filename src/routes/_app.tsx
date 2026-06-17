import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { getSession } from "@/lib/auth";

// Pathless layout route — wraps all protected admin pages with sidebar + header.
// Only admins/sub-admins may enter the admin dashboard; everyone else is sent
// back to "/" which re-routes them to the panel matching their real role.
export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    const session = getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (session.role !== "admin" && session.role !== "subadmin") {
      throw redirect({ to: "/" });
    }
  },
  component: AppLayout,
});
