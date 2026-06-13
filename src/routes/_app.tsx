import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";

// Pathless layout route — wraps all protected admin pages with sidebar + header.
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
