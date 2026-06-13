import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

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
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/user" });
  },
});
