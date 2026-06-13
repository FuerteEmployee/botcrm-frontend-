import { createFileRoute, redirect } from "@tanstack/react-router";
import { SuperLayout } from "@/components/layout/super-layout";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/super")({
  beforeLoad: () => {
    const session = getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (session.role !== "superadmin") {
      throw redirect({ to: "/" });
    }
  },
  component: SuperLayout,
});
