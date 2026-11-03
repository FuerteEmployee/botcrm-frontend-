import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Images } from 'lucide-react';
import { BUSINESS_TYPES, REQUIREMENTS } from '@/lib/lead-options';

interface NewLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<unknown>;
  isLoading?: boolean;
}

// The server takes at most this many (upload.array('images', 5)); a sixth
// made multer throw "Unexpected field" and the whole lead was lost.
const MAX_IMAGES = 5;

export function NewLeadModal({ open, onOpenChange, onSubmit, isLoading = false }: NewLeadModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [requirement, setRequirement] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imageNote, setImageNote] = useState('');
  // A ref, not state: a double tap fires both clicks before React re-renders
  // the button as disabled, and each click created its own lead.
  const submittingRef = useRef(false);

  // Loose on purpose -- landlines, +91 and spaces are all real -- but a lead
  // nobody can call back is worth catching before it is saved.
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 13;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isFormValid = !!name.trim() && phoneValid && emailValid && !!company.trim();

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setAddress('');
    setBusinessType('');
    setRequirement('');
    setImages([]);
    setImageNote('');
  };

  const handleSubmit = async () => {
    if (!isFormValid || submittingRef.current) return;
    submittingRef.current = true;

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('phone', phone.trim());
    formData.append('email', email.trim());
    formData.append('company', company.trim());
    formData.append('address', address.trim());
    formData.append('businessType', businessType);
    formData.append('requirement', requirement);
    images.forEach((file) => formData.append('images', file));

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-6">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">New Lead</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-600 dark:text-slate-400">
            Met someone who may buy from us? Add their details and the sales team will call them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Customer Name *</label>
            <Input
              placeholder="Enter Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Phone Number *</label>
            <Input
              type="tel"
              inputMode="tel"
              placeholder="Enter Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={phone.trim() !== '' && !phoneValid}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
            {phone.trim() !== '' && !phoneValid && (
              <p className="text-[13px] text-rose-600 px-1">Enter a full phone number (10 digits).</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Email *</label>
            <Input
              type="email"
              inputMode="email"
              placeholder="Enter Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={email.trim() !== '' && !emailValid}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
            {email.trim() !== '' && !emailValid && (
              <p className="text-[13px] text-rose-600 px-1">Enter an email like name@example.com.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Business Name *</label>
            <Input
              placeholder="Enter Business Name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Address</label>
            <Input
              placeholder="Enter Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-lg h-11 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Business Type</label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger className="w-full h-11 rounded-lg">
                <SelectValue placeholder="Select Business Type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Requirement</label>
            <Select value={requirement} onValueChange={setRequirement}>
              <SelectTrigger className="w-full h-11 rounded-lg">
                <SelectValue placeholder="Select Requirement" />
              </SelectTrigger>
              <SelectContent>
                {REQUIREMENTS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="lead-images"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <Images className="w-4 h-4" />
              {images.length > 0 ? `${images.length} photo${images.length > 1 ? 's' : ''} selected` : `Add photos (up to ${MAX_IMAGES})`}
            </label>
            <input
              id="lead-images"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const all = Array.from(e.target.files ?? []);
                // The server's image storage takes JPG/PNG/WebP only; a HEIC
                // gallery photo failed the WHOLE lead with a generic error.
                const picked = all.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
                // Kept, not refused: dropping the extras is kinder than
                // making someone re-pick all of them.
                setImages(picked.slice(0, MAX_IMAGES));
                const notes = [];
                if (picked.length < all.length) notes.push('Some photos were skipped — only JPG or PNG photos can be added.');
                if (picked.length > MAX_IMAGES) notes.push(`Only ${MAX_IMAGES} photos can be added — the first ${MAX_IMAGES} were kept.`);
                setImageNote(notes.join(' '));
                e.target.value = '';
              }}
            />
            {imageNote && <p className="text-[13px] text-amber-600 text-center">{imageNote}</p>}
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
