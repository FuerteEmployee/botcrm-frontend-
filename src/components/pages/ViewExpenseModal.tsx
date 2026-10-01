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
import { rupees, EXPENSE_STATUS_LABELS, type Expense } from '@/services/expense-service';
import { DIALOG_CLOSE_40 } from './reject-reason-dialog';

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
    case 'reimbursed':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

const formatDay = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });

export function ViewExpenseModal({ open, onOpenChange, expense }: ViewExpenseModalProps) {
  if (!expense) return null;

  const CategoryIcon = EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.icon || Tag;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[460px] max-h-[90vh] overflow-y-auto ${DIALOG_CLOSE_40}`}>
        <DialogHeader className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <CategoryIcon className="h-4.5 w-4.5" />
            </div>
            <DialogTitle className="text-[18px] font-bold tracking-tight text-slate-900 dark:text-white">
              {expense.category}
            </DialogTitle>
          </div>
          {/* `date` is the day the money was SPENT. This used to be labelled
              "Submitted on", which is a different day and the one employees
              argue about when a claim is late. */}
          <DialogDescription className="text-[13px] text-slate-600 dark:text-slate-400">
            Spent on {formatDay(expense.date)}
            {expense.createdAt && <> · Sent on {formatDay(expense.createdAt)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl font-bold text-slate-900 dark:text-white break-words">
                {rupees(expense.amount)}
              </p>
              {expense.splitGroupId && expense.splitParticipantCount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Your share · split {expense.splitParticipantCount} ways of {rupees(expense.splitTotalAmount ?? expense.amount)}
                </p>
              )}
            </div>
            <Badge variant={getStatusBadgeVariant(expense.status)} className="rounded-md text-xs shrink-0">
              {EXPENSE_STATUS_LABELS[expense.status] ?? expense.status}
            </Badge>
          </div>

          {expense.status === 'rejected' && expense.adminRemark?.trim() && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm leading-snug text-rose-900 whitespace-pre-line [overflow-wrap:anywhere] dark:bg-rose-500/10 dark:text-rose-200">
              <span className="font-bold">Reason:</span> {expense.adminRemark.trim()}
            </p>
          )}

          {expense.description && (
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Details</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line break-words">{expense.description}</p>
            </div>
          )}

          {expense.attachmentUrl && (
            <a
              href={expense.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-10 flex items-center gap-3 text-sm font-semibold text-primary hover:underline"
            >
              {/* Photos of a bill are stored as Cloudinary images (PDF/Word as
                  raw files), so an image URL can be shown as a thumbnail. */}
              {/\/image\/upload\/.+\.(jpe?g|png|webp)$/i.test(expense.attachmentUrl) ? (
                <img src={expense.attachmentUrl} alt="Attached bill" className="h-16 w-16 rounded-md object-cover border border-slate-200 dark:border-slate-700" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              View attached bill
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
