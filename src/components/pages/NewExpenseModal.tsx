import { useEffect, useRef, useState } from 'react';
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
import { Loader2, Users, Camera, Paperclip, FileText, X } from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories';
import { useCoworkers } from '@/services/expense-service';

interface NewExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<unknown>;
  isLoading?: boolean;
}

// The same limits the server enforces (expense_controller / config/cloudinary),
// checked here first so the employee is told before anything is sent.
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000000; // ₹1,00,00,000
const MAX_CLAIM_AGE_DAYS = 365;
const MAX_DESCRIPTION = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx'];

// Camera photos are routinely 4-10 MB -- over the limit on arrival. Rather
// than refuse the photo someone just took, shrink it: 1600px on the long
// side is plenty to read a bill, and lands at a few hundred KB. HEIC cannot
// be decoded by the WebView, so it is sent as it is (the server converts it).
const SHRINK_ABOVE_BYTES = 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const isImageFile = (f: File) => IMAGE_EXTENSIONS.includes(extensionOf(f.name)) || f.type.startsWith('image/');
const canPreview = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type);

async function shrinkImage(file: File): Promise<File> {
  if (!canPreview(file) || file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // Any failure just means the original is sent and the size check decides.
    return file;
  }
}

// Today as the PHONE's calendar day (IST for this app's users).
// toISOString() is UTC, so between midnight and 05:30 IST it named
// yesterday -- and that was the form's default date.
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Digits and one decimal point, at most two paise digits. The field is a text
// box with a numeric keypad rather than type="number", which accepts "e",
// "-" and "+" and would let "1e7" through as a valid-looking amount.
function cleanAmount(raw: string) {
  const digits = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = digits.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

export function NewExpenseModal({ open, onOpenChange, onSubmit, isLoading = false }: NewExpenseModalProps) {
  const { coworkers } = useCoworkers();

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [preparingFile, setPreparingFile] = useState(false);
  // A ref, not state: a double tap fires both clicks before React re-renders
  // the button as disabled, and each click submitted its own claim.
  const submittingRef = useRef(false);

  // This component stays mounted while the dialog is closed, so a form left
  // untouched overnight would still default to yesterday. Re-read "today"
  // each time it opens -- unless the employee has already started filling it.
  useEffect(() => {
    if (open && !amount) setDate(localDateKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Thumbnail for a chosen photo; the object URL is released when replaced.
  useEffect(() => {
    if (!file || !canPreview(file)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const today = localDateKey();
  const oldest = localDateKey(new Date(Date.now() - MAX_CLAIM_AGE_DAYS * 24 * 60 * 60 * 1000));
  const amountNumber = Number(amount);
  const amountError = amount === ''
    ? ''
    : !/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(amountNumber)
      ? 'Enter the amount in numbers only, like 250 or 250.50.'
      : amountNumber < MIN_AMOUNT
        ? 'The amount must be at least ₹1.'
        : amountNumber > MAX_AMOUNT
          ? 'The amount cannot be more than ₹1,00,00,000.'
          : '';
  const dateError = !date
    ? 'Choose the date you spent the money.'
    : date > today
      ? 'The date cannot be in the future.'
      : date < oldest
        ? 'This date is more than 1 year ago. Please check it.'
        : '';
  const isFormValid = amount !== '' && !amountError && !dateError && !!category && !preparingFile;
  const participantCount = splitEnabled ? splitWith.length + 1 : 1;
  const shareAmount = amount !== '' && !amountError && participantCount > 1 ? amountNumber / participantCount : null;

  const toggleCoworker = (id: string) => {
    setSplitWith((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const pickFile = async (picked: File | null) => {
    setFileError('');
    if (!picked) return setFile(null);
    const ext = extensionOf(picked.name);
    if (!isImageFile(picked) && !DOCUMENT_EXTENSIONS.includes(ext)) {
      setFile(null);
      return setFileError('This file cannot be attached. Please choose a photo, a PDF or a Word file.');
    }
    setPreparingFile(true);
    const ready = await shrinkImage(picked);
    setPreparingFile(false);
    if (ready.size > MAX_FILE_BYTES) {
      setFile(null);
      return setFileError('This file is too big. Please choose a file smaller than 5 MB.');
    }
    setFile(ready);
  };

  const resetForm = () => {
    setSplitEnabled(false);
    setSplitWith([]);
    setAmount('');
    setDate(localDateKey());
    setCategory(EXPENSE_CATEGORIES[0].value);
    setDescription('');
    setFile(null);
    setFileError('');
  };

  const handleSubmit = async () => {
    if (!isFormValid || submittingRef.current) return;
    submittingRef.current = true;

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
    } catch {
      // The service toasts the reason; the form stays filled so a retry is one tap.
    } finally {
      submittingRef.current = false;
    }
  };

  const fileInputHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    void pickFile(e.target.files?.[0] ?? null);
    // Cleared so choosing the same file again still fires onChange.
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-6">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">New Expense</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-600 dark:text-slate-400">
            Claim money you spent for work. Your admin will check it and approve it.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent is a grid, and a grid item will not shrink
            below its content -- a long file name widened the whole form past
            the screen edge. */}
        <div className="space-y-6 min-w-0">
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
                        aria-pressed={splitWith.includes(c._id)}
                        className={`min-h-10 py-2 px-3.5 rounded-full text-sm font-medium transition-all border ${
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
                  <p className="text-[13px] text-muted-foreground px-1">
                    Split {participantCount} ways · your share ₹{shareAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label htmlFor="expense-amount" className="text-sm font-semibold text-slate-900 dark:text-white">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-600 dark:text-slate-400">₹</span>
              <Input
                id="expense-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Enter an amount"
                value={amount}
                onChange={(e) => setAmount(cleanAmount(e.target.value))}
                maxLength={11}
                aria-invalid={!!amountError}
                className="pl-8 text-base font-medium rounded-lg h-11 border-slate-200 dark:border-slate-700"
              />
            </div>
            {amountError ? (
              <p className="text-[13px] text-rose-600 px-1">{amountError}</p>
            ) : amount !== '' && (
              // Read back with Indian commas, so a missing or extra zero is
              // visible before the claim goes to the admin.
              <p className="text-[13px] text-slate-500 px-1">₹{amountNumber.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
            )}
          </div>

          {/* Expense Date */}
          <div className="space-y-2">
            <label htmlFor="expense-date" className="text-sm font-semibold text-slate-900 dark:text-white">Date you spent it *</label>
            <Input
              id="expense-date"
              type="date"
              value={date}
              min={oldest}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateError}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
            {dateError && <p className="text-[13px] text-rose-600 px-1">{dateError}</p>}
          </div>

          {/* Expense Type */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Expense Type *</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full h-11 rounded-lg">
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
            <label htmlFor="expense-details" className="text-sm font-semibold text-slate-900 dark:text-white">Details (optional)</label>
            <Textarea
              id="expense-details"
              placeholder="What was it for? Example: auto fare to client office"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              className="rounded-lg border-slate-200 dark:border-slate-700 resize-none text-sm"
            />
            {description.length > MAX_DESCRIPTION - 100 && (
              <p className="text-xs text-slate-500 text-right px-1">{description.length} / {MAX_DESCRIPTION}</p>
            )}
          </div>

          {/* Receipt: a photo of the bill, or a PDF/Word file */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Bill / receipt (optional)</p>
            {file ? (
              <div className="flex items-center gap-3 p-2 pr-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {preview ? (
                  <img src={preview} alt="Attached bill" className="h-16 w-16 rounded-md object-cover shrink-0 bg-white" />
                ) : (
                  <div className="h-16 w-16 rounded-md bg-white dark:bg-slate-900 flex items-center justify-center shrink-0">
                    <FileText className="h-7 w-7 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => void pickFile(null)}
                  aria-label="Remove attached file"
                  className="h-11 w-11 shrink-0 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              // Two buttons, because the Android app only opens the camera for
              // an input that asks for it (capture + image/*); the other one
              // opens the gallery / files for a saved photo or a PDF.
              <div className="grid grid-cols-2 gap-2">
                <label
                  htmlFor="expense-camera"
                  className="min-h-12 flex items-center justify-center gap-2 py-3 px-3 rounded-lg font-semibold text-sm cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  {preparingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 shrink-0" />}
                  Take photo
                </label>
                <label
                  htmlFor="expense-document"
                  className="min-h-12 flex items-center justify-center gap-2 py-3 px-3 rounded-lg font-semibold text-sm cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  <Paperclip className="w-4 h-4 shrink-0" />
                  Choose file
                </label>
              </div>
            )}
            <input
              id="expense-camera"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={fileInputHandler}
            />
            <input
              id="expense-document"
              type="file"
              accept="image/*,.heic,.heif,.pdf,.doc,.docx"
              className="hidden"
              onChange={fileInputHandler}
            />
            {fileError ? (
              <p className="text-[13px] text-rose-600 text-center">{fileError}</p>
            ) : !file && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">Photo, PDF or Word file, up to 5 MB.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 h-11 rounded-lg font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isLoading}
            className="flex-1 h-11 rounded-lg font-semibold bg-primary hover:bg-primary/90 text-white"
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
