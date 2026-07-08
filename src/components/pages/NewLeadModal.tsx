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

export function NewLeadModal({ open, onOpenChange, onSubmit, isLoading = false }: NewLeadModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [requirement, setRequirement] = useState('');
  const [images, setImages] = useState<File[]>([]);

  const isFormValid = name.trim() && phone.trim() && email.trim() && company.trim();

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setAddress('');
    setBusinessType('');
    setRequirement('');
    setImages([]);
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

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
    } catch (error) {
      // Error is handled by the service
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg p-6 md:p-8 border-0 shadow-lg sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 mb-6">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">Create Lead</DialogTitle>
          <DialogDescription className="text-[14px] text-slate-600 dark:text-slate-400">
            Submit a new lead for the sales team to follow up on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Name *</label>
            <Input
              placeholder="Enter Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Phone Number *</label>
            <Input
              type="tel"
              placeholder="Enter Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Email *</label>
            <Input
              type="email"
              placeholder="Enter Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Business Name *</label>
            <Input
              placeholder="Enter Business Name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Address</label>
            <Input
              placeholder="Enter Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-lg h-10 border-slate-200 dark:border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">Business Type</label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger className="w-full h-10 rounded-lg">
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
              <SelectTrigger className="w-full h-10 rounded-lg">
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
              {images.length > 0 ? `${images.length} image${images.length > 1 ? 's' : ''} selected` : 'Select Images'}
            </label>
            <input
              id="lead-images"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setImages(Array.from(e.target.files ?? []))}
            />
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
