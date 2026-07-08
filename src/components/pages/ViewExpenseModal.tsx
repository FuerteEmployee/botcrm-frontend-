import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Tag } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories';
import type { Expense } from '@/services/expense-service';

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

interface ViewExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}

function getStatusBadgeVariant(status: Expense['status']) {
  switch (status) {
    case 'approved':
      return 'default' as const;
    case 'rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
}

export function ViewExpenseModal({ open, onOpenChange, expense }: ViewExpenseModalProps) {
  if (!expense) return null;

  const CategoryIcon = EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.icon || Tag;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <CategoryIcon className="h-4.5 w-4.5" />
            </div>
            <DialogTitle className="text-[18px] font-bold tracking-tight text-slate-900 dark:text-white">
              {expense.category}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-slate-600 dark:text-slate-400">
            Submitted on {new Date(expense.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {RUPEE_FORMATTER.format(expense.amount)}
              </p>
              {expense.splitGroupId && expense.splitParticipantCount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Your share · split {expense.splitParticipantCount} ways of {RUPEE_FORMATTER.format(expense.splitTotalAmount ?? expense.amount)}
                </p>
              )}
            </div>
            <Badge variant={getStatusBadgeVariant(expense.status)} className="capitalize rounded-md">
              {expense.status}
            </Badge>
          </div>

          {expense.description && (
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Description</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{expense.description}</p>
            </div>
          )}

          {expense.attachmentUrl && (
            <a
              href={expense.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <FileText className="w-4 h-4" />
              View supporting document
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
