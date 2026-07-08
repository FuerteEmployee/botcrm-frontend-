import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Users, Paperclip } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories';
import { useCoworkers } from '@/services/expense-service';

interface NewExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<unknown>;
  isLoading?: boolean;
}

export function NewExpenseModal({ open, onOpenChange, onSubmit, isLoading = false }: NewExpenseModalProps) {
  const { coworkers } = useCoworkers();

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const isFormValid = amount && date && category;
  const participantCount = splitEnabled ? splitWith.length + 1 : 1;
  const shareAmount = amount && participantCount > 1 ? Number(amount) / participantCount : null;

  const toggleCoworker = (id: string) => {
    setSplitWith((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const resetForm = () => {
    setSplitEnabled(false);
    setSplitWith([]);
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory(EXPENSE_CATEGORIES[0].value);
    setDescription('');
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const formData = new FormData();
    formData.append('category', category);
    formData.append('amount', amount);
    formData.append('date', date);
    formData.append('description', description.trim());
    if (file) formData.append('document', file);
    if (splitEnabled && splitWith.length > 0) {
      formData.append('splitWith', JSON.stringify(splitWith));
    }

    try {
      await onSubmit(formData);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the service
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-6">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">Add Expenses</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-600 dark:text-slate-400">
            Submit an expense claim for admin review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Split the bill */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSplitEnabled((v) => !v)}
              className={`w-full flex items-center gap-3 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
                splitEnabled
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Split the bill (Optional)
            </button>

            {splitEnabled && (
              <div className="space-y-2">
                {coworkers.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">No other employees found to split with.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {coworkers.map((c) => (
                      <button
                        type="button"
                        key={c._id}
                        onClick={() => toggleCoworker(c._id)}
                        className={`py-1.5 px-3 rounded-full text-xs font-medium transition-all border ${
                          splitWith.includes(c._id)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {shareAmount !== null && (
                  <p className="text-xs text-muted-foreground px-1">
                    Split {participantCount} ways · your share ₹{shareAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-600 dark:text-slate-400">₹</span>
              <Input
                type="number"
                placeholder="Enter an amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                className="pl-8 text-base font-medium rounded-lg h-10 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          {/* Expense Date */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Expense Date *</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Expense Type */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Expense Type *</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full h-10 rounded-lg">
                <SelectValue placeholder="Select expense type" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Description</label>
            <Textarea
              placeholder="Write something here..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border-slate-200 dark:border-slate-700 resize-none text-sm"
            />
          </div>

          {/* Upload Supporting Documents */}
          <div className="space-y-2">
            <label
              htmlFor="expense-document"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <Paperclip className="w-4 h-4" />
              {file ? file.name : 'Upload Supporting Documents'}
            </label>
            <input
              id="expense-document"
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-primary text-center">* You can upload doc &amp; pdf files only</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 h-10 rounded-lg font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isLoading}
            className="flex-1 h-10 rounded-lg font-semibold bg-primary hover:bg-primary/90 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
