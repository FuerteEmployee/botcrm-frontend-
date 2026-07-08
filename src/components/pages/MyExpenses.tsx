import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Search, Clock, CheckCircle, XCircle, Loader2, Plus, Tag, Users } from 'lucide-react';
import { useExpenseService, type Expense } from '@/services/expense-service';
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories';
import { NewExpenseModal } from './NewExpenseModal';
import { ViewExpenseModal } from './ViewExpenseModal';

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function MyExpenses() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);

  const { expenses, isLoading, createExpense, isCreating } = useExpenseService();

  const summary = useMemo(() => {
    const totals: Record<"pending" | "approved" | "rejected", number> = { pending: 0, approved: 0, rejected: 0 };
    for (const exp of expenses) {
      if (exp.status in totals) totals[exp.status as "pending" | "approved" | "rejected"] += exp.amount;
    }
    return totals;
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((exp) => exp.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (exp) =>
          exp.category.toLowerCase().includes(query) ||
          exp.description?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [expenses, statusFilter, searchQuery]);

  const getStatusIcon = (status: Expense['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'reimbursed':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: Expense['status']) => {
    switch (status) {
      case 'pending':
        return 'secondary' as const;
      case 'approved':
        return 'default' as const;
      case 'rejected':
        return 'destructive' as const;
      case 'reimbursed':
        return 'outline' as const;
      default:
        return 'secondary' as const;
    }
  };

  const getCategoryIcon = (cat: string) => EXPENSE_CATEGORIES.find((c) => c.value === cat)?.icon || Tag;

  return (
    <div className="w-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Expenses</h1>
            <p className="text-slate-600 dark:text-slate-400">View and submit your expense claims</p>
          </div>
          <Button
            onClick={() => setNewExpenseOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-lg"
          >
            + Add Expense
          </Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Pending', value: summary.pending, color: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20', textColor: 'text-yellow-700 dark:text-yellow-400' },
          { label: 'Approved', value: summary.approved, color: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20', textColor: 'text-green-700 dark:text-green-400' },
          { label: 'Rejected', value: summary.rejected, color: 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20', textColor: 'text-red-700 dark:text-red-400' },
        ].map((stat, idx) => (
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
            <Card className={`bg-linear-to-br ${stat.color} border-0 shadow-md`}>
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.textColor}`}>{RUPEE_FORMATTER.format(stat.value)}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="mb-8 flex gap-3 flex-col md:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 rounded-lg border-slate-200 dark:border-slate-700"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-full md:w-[180px] h-10 rounded-lg">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expenses List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredExpenses.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No expenses found</p>
              <Button onClick={() => setNewExpenseOpen(true)} variant="outline" className="rounded-lg">
                <Plus className="w-4 h-4 mr-2" />
                Add your first expense
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredExpenses.map((exp, idx) => {
            const CategoryIcon = getCategoryIcon(exp.category);
            return (
              <motion.div key={exp._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card
                  className="hover:shadow-lg transition-shadow border-0 shadow-md cursor-pointer"
                  onClick={() => setViewing(exp)}
                >
                  <CardContent className="p-4 md:p-6">
                    <div className="flex gap-4 flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex gap-3 items-center">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                          <CategoryIcon className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{exp.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(exp.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1">
                        {exp.description && (
                          <p className="text-sm italic text-slate-600 dark:text-slate-400 line-clamp-1">"{exp.description}"</p>
                        )}
                        {exp.splitGroupId && exp.splitParticipantCount && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" /> Split {exp.splitParticipantCount} ways
                          </p>
                        )}
                      </div>

                      <div className="flex gap-4 items-center justify-between md:justify-end md:flex-col md:items-end">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{RUPEE_FORMATTER.format(exp.amount)}</p>
                        <Badge variant={getStatusBadgeVariant(exp.status)} className="rounded-md">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(exp.status)}
                            <span className="capitalize">{exp.status}</span>
                          </span>
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      <NewExpenseModal open={newExpenseOpen} onOpenChange={setNewExpenseOpen} onSubmit={createExpense} isLoading={isCreating} />
      <ViewExpenseModal open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} expense={viewing} />
    </div>
  );
}
