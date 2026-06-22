import { createFileRoute } from "@tanstack/react-router";
import { AdvanceSalaryPage } from "@/components/pages/advance-salary-page";

export const Route = createFileRoute("/_app/advance-salary")({
  component: AdvanceSalaryPage,
});
