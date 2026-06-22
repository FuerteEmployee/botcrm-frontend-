import { createFileRoute } from "@tanstack/react-router";
import { MyAdvanceSalary } from "@/components/pages/MyAdvanceSalary";

export const Route = createFileRoute("/user/advance-salary")({
  component: MyAdvanceSalary,
});
