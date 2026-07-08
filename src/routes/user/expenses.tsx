import { createFileRoute } from "@tanstack/react-router";
import { MyExpenses } from "@/components/pages/MyExpenses";

export const Route = createFileRoute("/user/expenses")({
  component: MyExpenses,
});
