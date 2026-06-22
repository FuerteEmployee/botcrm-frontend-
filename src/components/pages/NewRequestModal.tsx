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
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface NewRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    type: 'advance-salary' | 'loan';
    amount: number;
    reason: string;
    notes?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function NewRequestModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: NewRequestModalProps) {
  const [requestType, setRequestType] = useState<'advance-salary' | 'loan'>('advance-salary');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const isFormValid = amount && reason.trim();

  const handleSubmit = async () => {
    if (!isFormValid) return;
    
    try {
      await onSubmit({
        type: requestType,
        amount: parseFloat(amount),
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      
      // Reset form
      setAmount('');
      setReason('');
      setNotes('');
      setRequestType('advance-salary');
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the service
    }
  };

  const reasonPlaceholder = requestType === 'advance-salary' 
    ? 'e.g., Medical emergency, urgent need...'
    : 'e.g., Business expense, personal loan...';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[500px]">
        <DialogHeader className="space-y-2 mb-6">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">New Request</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-600 dark:text-slate-400">
            Submit an advance salary or loan request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Request Type Toggle */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Request Type *</label>
            <div className="flex gap-3">
              <button
                onClick={() => setRequestType('advance-salary')}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
                  requestType === 'advance-salary'
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Advance Salary
              </button>
              <button
                onClick={() => setRequestType('loan')}
                className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
                  requestType === 'loan'
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Loan
              </button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-600 dark:text-slate-400">₹</span>
              <Input
                type="number"
                placeholder="e.g. 10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                className="pl-8 text-base font-medium rounded-lg h-10 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Reason *</label>
            <Textarea
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="rounded-lg border-slate-200 dark:border-slate-700 resize-none text-sm"
            />
          </div>

          {/* Notes (Optional) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Notes (Optional)</label>
            <Textarea
              placeholder="Additional notes or context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border-slate-200 dark:border-slate-700 resize-none text-sm"
            />
          </div>

          {/* Info Box */}
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40">
            <div className="p-4 text-sm text-blue-900 dark:text-blue-200">
              <p className="font-semibold mb-1">ℹ️ Your request will be reviewed by the admin.</p>
              <p className="text-xs opacity-90">Approved requests will be processed according to company policy.</p>
            </div>
          </Card>
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
              '+ Submit Request'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
