import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  Plus, Receipt, Search, MoreVertical, Trash2, Pencil, IndianRupee, Tag, Info,
  Coffee, Utensils, Plane, Sparkles, Box, Wallet, Calendar, Clock, User, List,
  UserCheck, MoreHorizontal, CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/shared/view-toggle";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { ActionButton } from "@/components/shared/action-button";
import { GridCard } from "@/components/shared/grid-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";

import { useExpenseService, type Expense } from "@/services/expense-service";
import { useEmployeeService } from "@/services/employee-service";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

type ViewMode = "list" | "employee";

const CATEGORIES = [
  { label: "Tea/Coffee", value: "Tea/Coffee", icon: Coffee },
  { label: "Party", value: "Party", icon: Sparkles },
  { label: "Snacks", value: "Snacks", icon: Utensils },
  { label: "Cleaning & Maintenance", value: "Cleaning & Maintenance", icon: Box },
  { label: "Travel", value: "Travel", icon: Plane },
  { label: "Other Expenses", value: "Other Expenses", icon: Tag },
];

function ExpensesPage() {
  const { expenses: list, isLoading: isExpensesLoading, createExpense, updateExpense, deleteExpense, isCreating, isUpdating } = useExpenseService();
  const { employees, isLoading: isEmployeesLoading } = useEmployeeService();
  
  const isLoading = isExpensesLoading || isEmployeesLoading;
  const [searchQuery, setSearchQuery] = useState("");
  const { defaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("expenses", "create");
  const canEdit = can("expenses", "edit");
  const canDelete = can("expenses", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: "",
    category: "Tea/Coffee",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    status: "pending" as Expense["status"],
  });

  const filtered = useMemo(() => list.filter((e) =>
    e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.employeeName.toLowerCase().includes(searchQuery.toLowerCase())
  ), [list, searchQuery]);

  const groupedByEmployee = useMemo(() => {
    const groups: Record<string, { employeeName: string; expenses: Expense[] }> = {};
    filtered.forEach(e => {
      const key = e.employeeId || "admin";
      if (!groups[key]) {
        groups[key] = { employeeName: e.employeeName, expenses: [] };
      }
      groups[key].expenses.push(e);
    });
    return Object.entries(groups).map(([id, data]) => ({ employeeId: id, ...data }));
  }, [filtered]);

  const totalAmount = list.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = list.filter(e => e.status === "pending").length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount))) return toast.error("Please enter a valid amount");
    
    const emp = employees.find(e => e._id === form.employeeId);
    if (!emp && form.employeeId !== "admin") return toast.error("Please select an employee or General Office");

    const expenseData = {
      ...form,
      employeeId: form.employeeId === "admin" ? undefined : form.employeeId,
      employeeName: emp ? emp.name : "General Office",
      amount: Number(form.amount),
    };

    try {
      if (editing) {
        await updateExpense({ id: editing._id, data: expenseData });
      } else {
        await createExpense(expenseData);
      }
      setOpen(false);
    } catch (err) {}
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense(deleteId);
      setDeleteId(null);
    } catch (err) {}
  };

  const getCategoryIcon = (cat: string) => {
    return CATEGORIES.find(c => c.value === cat)?.icon || Tag;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Expense Management" description="Track office expenses and team spending." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="card" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Management"
        description="Track office expenses and team spending."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Expense"
              onClick={() => { setEditing(null); setForm({ employeeId: "", category: "Tea/Coffee", amount: "", date: new Date().toISOString().split("T")[0], description: "", status: "pending" }); setOpen(true); }}
            />
          ) : null
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Portfolio" value={`₹${totalAmount.toLocaleString()}`} icon={Wallet} accent="primary" delay={0} />
        <StatCard label="Awaiting Approval" value={pendingCount} icon={Clock} accent="warning" delay={0.05} />
        <StatCard label="Active Employees" value={groupedByEmployee.length} icon={UserCheck} accent="info" delay={0.1} />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={setView} />
        </div>

        <FormInput
          placeholder="Search expenses..."
          icon={Search}
          className="h-10 w-full md:w-[300px] shadow-none bg-background"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div 
            key="grid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {groupedByEmployee.map((group, i) => {
              const groupTotal = group.expenses.reduce((s, e) => s + e.amount, 0);
              return (
                <GridCard
                  key={group.employeeId}
                  title={group.employeeName}
                  subtitle={`${group.expenses.length} records`}
                  icon={<div className="h-full w-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[16px]">{group.employeeName.charAt(0)}</div>}
                  delay={i * 0.04}
                  statusNode={
                    <Badge variant="outline" className="text-[10px] font-bold text-primary bg-primary/5 border-primary/20">
                      ₹{groupTotal.toLocaleString()}
                    </Badge>
                  }
                >
                  <div className="space-y-2 mt-3">
                    {group.expenses.slice(0, 3).map((exp) => {
                      const CatIcon = getCategoryIcon(exp.category);
                      return (
                        <div key={exp._id} className="group flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-transparent hover:border-primary/10 transition-all">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded bg-card border border-border/40 flex items-center justify-center text-primary/50 group-hover:text-primary">
                              <CatIcon className="h-3 w-3" />
                            </div>
                            <div className="text-[11px] font-medium truncate max-w-[80px]">{exp.category}</div>
                          </div>
                          <div className="text-[11px] font-bold">₹{exp.amount.toLocaleString()}</div>
                        </div>
                      );
                    })}
                    {group.expenses.length > 3 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-1 italic">
                        + {group.expenses.length - 3} more records
                      </p>
                    )}
                    <div className="pt-3 mt-2 border-t border-border/40 flex items-center gap-2">
                      {canCreate && (
                        <ActionButton
                          variant="add"
                          showLabel
                          label="Add"
                          onClick={() => { setEditing(null); setForm({ employeeId: group.employeeId, category: "Tea/Coffee", amount: "", date: new Date().toISOString().split("T")[0], description: "", status: "pending" }); setOpen(true); }}
                          className="flex-1 h-9"
                        />
                      )}
                      <ActionButton 
                        variant="view" 
                        showLabel
                        label="View All"
                        onClick={() => setView("list")}
                        className="flex-1 h-9"
                      />
                    </div>
                  </div>
                </GridCard>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm"
          >
            <DataTable
              headers={["Employee", "Category", "Amount", "Date", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
              emptyMessage="No expenses found."
            >
              {filtered.map((exp) => {
                const Icon = getCategoryIcon(exp.category);
                return (
                  <DataTableRow key={exp._id}>
                    <DataTableCell isFirst className="font-semibold text-[13px]">{exp.employeeName}</DataTableCell>
                    <DataTableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded bg-primary/5 text-primary flex items-center justify-center shrink-0 border border-primary/10">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-medium text-[12px]">{exp.category}</span>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="font-bold text-foreground text-[12px]">₹{exp.amount.toLocaleString()}</DataTableCell>
                    <DataTableCell className="text-muted-foreground text-[12px] font-medium">{new Date(exp.date).toLocaleDateString()}</DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[9px] font-bold px-1.5 py-0 rounded",
                          exp.status === "approved" ? "bg-success/10 text-success border-success/20" :
                          exp.status === "pending" ? "bg-warning/10 text-warning-foreground border-warning/20" :
                          "bg-destructive/10 text-destructive border-destructive/20"
                        )}
                      >
                        {exp.status}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell isLast>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <ActionButton
                            variant="edit"
                            tooltip="Edit Record"
                            onClick={() => { setEditing(exp); setForm({ employeeId: exp.employeeId || "admin", category: exp.category, amount: String(exp.amount), date: new Date(exp.date).toISOString().split("T")[0], description: exp.description || "", status: exp.status }); setOpen(true); }}
                          />
                        )}
                        {canDelete && (
                          <ActionButton
                            variant="delete"
                            tooltip="Delete Record"
                            onClick={() => setDeleteId(exp._id)}
                          />
                        )}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <div className="h-9 w-9 rounded-lg bg-primary/5 text-primary grid place-items-center mb-2">
              <Receipt className="h-4.5 w-4.5" />
            </div>
            <DialogTitle className="text-[15px] font-bold">{editing ? "Edit Record" : "New Expense"}</DialogTitle>
            <DialogDescription className="text-[12px]">Log financial data for office management.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 mt-1">
            <FormSelect
              label="Associated Employee"
              value={form.employeeId}
              onValueChange={(v) => setForm({ ...form, employeeId: v })}
              options={[
                { label: "General Office / Admin", value: "admin", subLabel: "Company Expense" },
                ...employees.map(e => ({ label: e.name, value: e._id, subLabel: e.phone }))
              ]}
              containerClassName="space-y-1"
            />

            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Amount (₹)"
                type="number"
                placeholder="0"
                icon={IndianRupee}
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
                className="h-9"
              />
              <FormInput
                label="Date"
                type="date"
                icon={Calendar}
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
                className="h-9"
              />
            </div>

            <FormSelect
              label="Category"
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
              options={CATEGORIES}
            />

            <FormInput
              label="Brief Description"
              placeholder="e.g. Printer ink purchase"
              icon={Info}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="h-9"
            />

            <FormSelect
              label="Status"
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as any })}
              options={[
                { label: "Pending", value: "pending" },
                { label: "Approved", value: "approved" },
                { label: "Rejected", value: "rejected" },
              ]}
            />

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl h-10 text-[12px] font-semibold">Cancel</Button>
              <ActionButton 
                type="submit" 
                variant="add"
                showLabel
                label={editing ? "Save Changes" : "Confirm Record"}
                icon={editing ? CheckCircle2 : Plus}
                loading={isCreating || isUpdating}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl border-destructive/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px] font-bold">Delete record?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">This record will be permanently removed from the ledger.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl h-10 text-[12px]">Cancel</AlertDialogCancel>
            <ActionButton
              variant="destructive"
              showLabel
              label="Delete"
              onClick={remove}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
