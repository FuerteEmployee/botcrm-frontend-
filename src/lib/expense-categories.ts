import { Coffee, Sparkles, Utensils, Box, Plane, Tag, type LucideIcon } from "lucide-react";

export interface ExpenseCategory {
  label: string;
  value: string;
  icon: LucideIcon;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { label: "Tea/Coffee", value: "Tea/Coffee", icon: Coffee },
  { label: "Party", value: "Party", icon: Sparkles },
  { label: "Snacks", value: "Snacks", icon: Utensils },
  { label: "Cleaning & Maintenance", value: "Cleaning & Maintenance", icon: Box },
  { label: "Travel", value: "Travel", icon: Plane },
  { label: "Other Expenses", value: "Other Expenses", icon: Tag },
];
