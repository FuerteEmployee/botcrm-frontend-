import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Plus, Monitor, Smartphone, Speaker, IndianRupee, MousePointer2, 
  Keyboard, Tablet, Image as ImageIcon, ChevronLeft, Landmark, 
  Info, Hash, Calendar, ShieldCheck, CheckCircle2, ArrowRight, Loader2, Laptop,
  Trash2, Copy, AlertCircle, X, User, VenetianMask, LayoutGrid, Lock
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEmployeeService } from "@/services/employee-service";
import { useAssetService, type Asset } from "@/services/asset-service";
import { useAssetCategoryService, type AssetCategory } from "@/services/asset-category-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import * as Icons from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { formatINRFull } from "@/lib/format";

type AssetAllocateSearch = {
  assetId?: string;
  employeeId?: string;
};

export const Route = createFileRoute("/_app/assets/allocate")({
  validateSearch: (search: Record<string, unknown>): AssetAllocateSearch => {
    return {
      assetId: search.assetId as string | undefined,
      employeeId: search.employeeId as string | undefined,
    };
  },
  component: AssetAllocatePage,
});

const DEVICE_TYPES = [
  { label: "Laptop", value: "Laptop", icon: Laptop },
  { label: "Mobile", value: "Mobile", icon: Smartphone },
  { label: "Mouse", value: "Mouse", icon: MousePointer2 },
  { label: "Keyboard", value: "Keyboard", icon: Keyboard },
  { label: "Monitor", value: "Monitor", icon: Monitor },
  { label: "Headset", value: "Headset", icon: Speaker },
  { label: "Tablet", value: "Tablet", icon: Tablet },
];

// Today as YYYY-MM-DD on this device's calendar (toISOString is the UTC day,
// which in India is still yesterday before 5:30 am).
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const getIconByName = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("laptop")) return Icons.Laptop;
  if (lowerName.includes("mobile") || lowerName.includes("phone")) return Icons.Smartphone;
  if (lowerName.includes("monitor") || lowerName.includes("screen")) return Icons.Monitor;
  if (lowerName.includes("mouse")) return Icons.MousePointer2;
  if (lowerName.includes("keyboard")) return Icons.Keyboard;
  if (lowerName.includes("tablet") || lowerName.includes("ipad")) return Icons.Tablet;
  if (lowerName.includes("headset") || lowerName.includes("speaker") || lowerName.includes("audio")) return Icons.Speaker;
  if (lowerName.includes("printer")) return Icons.Printer;
  if (lowerName.includes("watch")) return Icons.Watch;
  if (lowerName.includes("camera")) return Icons.Camera;
  if (lowerName.includes("router") || lowerName.includes("wifi")) return Icons.Wifi;
  if (lowerName.includes("server")) return Icons.Server;
  if (lowerName.includes("cpu") || lowerName.includes("desktop")) return Icons.Cpu;
  return Icons.LayoutGrid;
};

function CategoryManager({
  categories,
  onCreate,
  onUpdate,
  onDelete,
  canCreate,
  canEdit,
  canDelete,
}: {
  categories: AssetCategory[],
  onCreate: (v: any) => Promise<any>,
  onUpdate: (id: string, v: any) => Promise<any>,
  onDelete: (id: string) => Promise<any>,
  canCreate: boolean,
  canEdit: boolean,
  canDelete: boolean,
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetCategory | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a category name.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (editingId) {
        await onUpdate(editingId, { name: trimmed });
        setEditingId(null);
      } else {
        await onCreate({ name: trimmed, icon: "Monitor" });
      }
      setName("");
    } catch {
      // The service has said why (e.g. "There is already a category ...").
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDelete(deleteTarget._id);
    } catch {
      // The service has said why (e.g. still used by device records).
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  };

  const canSave = editingId ? canEdit : canCreate;

  return (
    <div className="space-y-4 py-2">
      {(canCreate || editingId) && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        >
          <FormInput
            label={editingId ? "Rename category" : "New category"}
            placeholder="e.g. Printer, SIM card"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            containerClassName="flex-1 space-y-1"
          />
          <Button type="submit" disabled={busy || !canSave} className="h-10 px-4">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Save" : "Add"}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" className="h-10 px-3" onClick={() => { setEditingId(null); setName(""); }}>
              Cancel
            </Button>
          )}
        </form>
      )}
      {editingId && (
        <p className="text-[12px] text-muted-foreground">Device records in this category move to the new name.</p>
      )}

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {categories.length === 0 && (
          <p className="text-[13px] text-muted-foreground text-center py-4">No categories yet.</p>
        )}
        {categories.map((cat) => (
          <div key={cat._id} className="flex items-center justify-between gap-2 p-2 pl-3 rounded-xl border border-border/60 bg-muted/5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-card shadow-sm flex items-center justify-center">
                {(() => {
                  const Icon = getIconByName(cat.name);
                  return <Icon className="h-4 w-4 text-primary" />;
                })()}
              </div>
              <span className="text-[13px] font-bold truncate">{cat.name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && (
                <ActionButton
                  variant="edit"
                  tooltip="Rename"
                  aria-label={`Rename ${cat.name}`}
                  className="h-10 w-10"
                  onClick={() => { setEditingId(cat._id); setName(cat.name); }}
                />
              )}
              {canDelete && (
                <ActionButton
                  variant="delete"
                  tooltip="Delete"
                  aria-label={`Delete ${cat.name}`}
                  className="h-10 w-10"
                  onClick={() => setDeleteTarget(cat)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !busy) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        isLoading={busy}
        title="Delete this category?"
        description={deleteTarget ? `"${deleteTarget.name}" will be removed from the list. A category still used by a device record cannot be deleted.` : ""}
        confirmText="Delete"
      />
    </div>
  );
}

function SectionTitle({ title, icon: Icon, className }: { title: string; icon: any; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 mb-6", className)}>
      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-[14px] font-bold text-foreground tracking-tight">{title}</h3>
    </div>
  );
}

interface DeviceEntry {
  tempId: number;
  deviceName?: string;
  deviceType: string;
  brand: string;
  model: string;
  amount: string;
  serialNumber: string;
  allocatedAt: string;
  status: Asset["status"];
  unlockCredentials: string;
  unlockType: "password" | "pin" | "pattern";
  patternSize?: 3 | 4;
}

function AssetAllocatePage() {
  const { assetId, employeeId: initialEmployeeId } = Route.useSearch();
  const navigate = useNavigate();
  const { assets, isLoading: assetsLoading, createAsset, updateAsset, isCreating, isUpdating } = useAssetService({ silent: true });
  // Active employees only: the server refuses a device for an inactive one.
  const { employees } = useEmployeeService({ status: "active" });
  const {
    categories,
    createCategory,
    updateCategory,
    deleteCategory
  } = useAssetCategoryService();
  const { can } = usePermission();
  // New allocation = create right; editing an existing allocation = edit right
  const canAllocate = assetId ? can("assets", "edit") : can("assets", "create");
  const [submitting, setSubmitting] = useState(false);

  const [employeeId, setEmployeeId] = useState<string>(initialEmployeeId || "");
  const [devices, setDevices] = useState<DeviceEntry[]>([]);

  // The starter categories are created by the server on the first read.
  // (This page used to create them in an effect that ran while the list was
  // still loading, so every visit fired seven POSTs that came back 400.)

  // Sync employeeId from search params
  useEffect(() => {
    if (initialEmployeeId) {
      setEmployeeId(initialEmployeeId);
    }
  }, [initialEmployeeId]);

  const categoryOptionsFor = (current: string) => {
    const opts = categories.map(cat => ({ label: cat.name, value: cat.name, icon: getIconByName(cat.name) }));
    // A record saved under a category that has since gone keeps its value.
    if (current && !opts.some((o) => o.value === current)) opts.unshift({ label: current, value: current, icon: getIconByName(current) });
    return opts;
  };

  const isEditing = !!assetId;
  const editingAsset = isEditing ? assets.find(a => a._id === assetId) : undefined;
  const isSubmitting = submitting || isCreating || isUpdating;

  // The employee holding the device being edited may have left since; keep
  // them in the picker so the record can still be marked returned.
  const employeeOptions = employees.map(e => ({ label: e.name, value: e._id, subLabel: e.phone }));
  if (editingAsset && !employees.some(e => e._id === editingAsset.employeeId)) {
    employeeOptions.unshift({ label: `${editingAsset.employeeName} (inactive)`, value: editingAsset.employeeId, subLabel: "" });
  }
  const selectedEmployee = employees.find(e => e._id === employeeId);
  const selectedName = selectedEmployee?.name || (editingAsset && editingAsset.employeeId === employeeId ? editingAsset.employeeName : "");

  useEffect(() => {
    if (isEditing && assets.length > 0) {
      const asset = assets.find(a => a._id === assetId);
      if (asset) {
        setDevices([{
          tempId: 1,
          deviceType: asset.deviceType,
          brand: asset.brand,
          model: asset.model,
          deviceName: asset.deviceName,
          amount: String(asset.amount),
          serialNumber: asset.serialNumber,
          allocatedAt: asset.allocatedAt.split("T")[0],
          status: asset.status,
          unlockCredentials: asset.unlockCredentials || "",
          unlockType: asset.unlockType || "password",
          patternSize: asset.patternSize || 3,
        }]);
        setEmployeeId(asset.employeeId);
      }
    } else if (!isEditing && devices.length === 0) {
      setDevices([{
        tempId: Date.now(),
        deviceType: "Laptop",
        brand: "",
        model: "",
        deviceName: "",
        amount: "",
        serialNumber: "",
        allocatedAt: todayKey(),
        status: "active",
        unlockCredentials: "",
        unlockType: "password",
        patternSize: 3,
      }]);
    }
  }, [isEditing, assetId, assets, initialEmployeeId]);

  const addDevice = () => {
    setDevices(prev => [...prev, {
      tempId: Date.now(),
      deviceType: "Laptop",
      brand: "",
      model: "",
      deviceName: "",
      amount: "",
      serialNumber: "",
      allocatedAt: todayKey(),
      status: "active",
      unlockCredentials: "",
      unlockType: "password",
      patternSize: 3,
    }]);
  };

  const removeDevice = (tempId: number) => {
    if (devices.length === 1) return toast.error("At least one device is required");
    setDevices(prev => prev.filter(d => d.tempId !== tempId));
  };

  const updateDevice = (tempId: number, data: Partial<DeviceEntry>) => {
    setDevices(prev => prev.map(d => d.tempId === tempId ? { ...d, ...data } : d));
  };

  const totalValue = devices.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const validate = (): string | null => {
    if (!employeeId) return "Please choose the employee who gets the device.";
    const seen = new Set<string>();
    for (const [i, d] of devices.entries()) {
      const n = devices.length > 1 ? ` for item ${i + 1}` : "";
      if (!d.deviceType) return `Please pick the device category${n}.`;
      if (!d.brand.trim()) return `Please enter the brand${n}.`;
      if (!d.model.trim()) return `Please enter the model${n}.`;
      if (!d.serialNumber.trim()) return `Please enter the serial number${n}.`;
      const key = d.serialNumber.trim().toLowerCase();
      if (seen.has(key)) return `Serial number "${d.serialNumber.trim()}" is entered twice.`;
      seen.add(key);
      if (String(d.amount).trim() === "") return `Please enter the device value${n}.`;
      const amt = Number(String(d.amount).replace(/,/g, ""));
      if (!Number.isFinite(amt) || amt < 0) return `The device value${n} cannot be less than ₹0.`;
      if (amt > 10000000) return `The device value${n} is too large (at most ₹1 crore).`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.allocatedAt)) return `Please pick the date the device was given${n}.`;
      if (d.allocatedAt > todayKey()) return `The date the device was given${n} cannot be in the future.`;
      if (d.unlockType === "pin" && d.unlockCredentials && !/^\d{4,16}$/.test(d.unlockCredentials)) return `A PIN can only have digits (4 to 16)${n}.`;
    }
    return null;
  };

  const payloadOf = (d: DeviceEntry) => ({
    employeeId,
    deviceType: d.deviceType,
    brand: d.brand.trim(),
    model: d.model.trim(),
    serialNumber: d.serialNumber.trim(),
    amount: Number(String(d.amount).replace(/,/g, "")),
    allocatedAt: d.allocatedAt,
    status: d.status,
    unlockType: d.unlockType,
    unlockCredentials: d.unlockCredentials,
    patternSize: d.patternSize || 3,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && assetId) {
        await updateAsset({ id: assetId, data: payloadOf(devices[0]) });
        toast.success("Device record saved");
        navigate({ to: "/assets" });
        return;
      }
      // One at a time, so a refused item (say, a serial already given to
      // someone else) stops here with the ones before it saved -- and taken
      // off this list, so pressing the button again does not add them twice.
      let saved = 0;
      for (const d of devices) {
        try {
          await createAsset(payloadOf(d));
          saved++;
          setDevices(prev => prev.filter(x => x.tempId !== d.tempId));
        } catch {
          if (saved > 0) toast.message(`${saved} device${saved === 1 ? "" : "s"} saved. Fix the item left on the list and press the button again.`);
          return;
        }
      }
      toast.success(saved === 1 ? `Device given to ${selectedName}` : `${saved} devices given to ${selectedName}`);
      navigate({ to: "/assets" });
    } catch {
      // The service has said why.
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAllocate) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
          <Lock className="h-5 w-5" />
        </div>
        <p className="text-[14px] font-bold text-foreground">No permission</p>
        <p className="text-[12px] text-muted-foreground max-w-[280px]">You don't have permission to allocate or edit assets.</p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/assets" })}
          className="mt-2 h-9 rounded-xl px-4 text-[13px] font-semibold"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Assets
        </Button>
      </div>
    );
  }

  if (isEditing && !assetsLoading && !editingAsset) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <p className="text-[14px] font-bold text-foreground">This device record was not found</p>
        <p className="text-[13px] text-muted-foreground max-w-[300px]">It may have been deleted. Go back to the list and try again.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/assets" })} className="mt-2 h-10 rounded-xl px-4 text-[13px] font-semibold">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Assets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate({ to: "/assets" })}
          aria-label="Back to Assets"
          className="h-10 w-10 rounded-lg border-border/60 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={isEditing ? "Edit Device Record" : "Give Devices"}
          description={isEditing ? "Change the details, or mark it returned or damaged" : "Record one or more devices given to an employee"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-5">
          {/* Employee Selection */}
          <Card className="p-4 border border-border/60 bg-card rounded-xl shadow-sm">
            <SectionTitle title="Assignment Target" icon={User} className="mb-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormSelect
                label="Assign to Employee"
                value={employeeId}
                onValueChange={setEmployeeId}
                options={employeeOptions}
                placeholder="Select employee to receive assets"
                icon={User}
              />
              {employeeId ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="h-9 w-9 rounded-lg bg-card shadow-sm flex items-center justify-center">
                    <Icons.Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Contact Info</p>
                    <div className="flex flex-col">
                      <p className="text-[12px] font-bold truncate">
                        {selectedEmployee?.email || (selectedEmployee ? "No email" : selectedName)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedEmployee?.phone}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/5 border border-dashed border-border/60 opacity-60">
                  <div className="h-9 w-9 rounded-lg bg-card shadow-sm flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Status</p>
                    <p className="text-[13px] font-bold text-muted-foreground">Awaiting Selection</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Device List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Device List</h4>
                <Badge variant="outline" className="rounded-full px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20 text-[11px] font-bold">
                  {devices.length}
                </Badge>
              </div>
              {!isEditing && (
                <ActionButton 
                  variant="add" 
                  showLabel 
                  label="Add Item" 
                  onClick={addDevice} 
                  className="h-8 rounded-lg px-3"
                />
              )}
            </div>

            <AnimatePresence initial={false}>
              {devices.map((device, index) => (
                <motion.div
                  key={device.tempId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <Card className="p-4 border border-border/60 bg-card rounded-xl shadow-sm hover:border-primary/20 transition-all relative group overflow-hidden">
                    <div className="absolute top-0 right-0 p-2.5 flex items-center gap-2">
                      <Badge className="bg-muted/50 text-muted-foreground border-border/40 text-[11px] font-medium rounded px-1.5 py-0">
                        #{index + 1}
                      </Badge>
                      {devices.length > 1 && !isEditing && (
                        <ActionButton
                          variant="delete"
                          tooltip="Remove Item"
                          onClick={() => removeDevice(device.tempId)}
                          className="h-6 w-6"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Device Category</Label>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-9 rounded-lg border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 font-bold text-[12px] gap-1 px-3"
                              >
                                <Plus className="h-3 w-3" /> Manage
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                              <DialogHeader>
                                <DialogTitle>Manage Categories</DialogTitle>
                                <DialogDescription>Add, edit or remove device categories.</DialogDescription>
                              </DialogHeader>
                              <CategoryManager
                                categories={categories}
                                onCreate={createCategory}
                                onUpdate={(id, data) => updateCategory({ id, data })}
                                onDelete={deleteCategory}
                                canCreate={can("assets", "create")}
                                canEdit={can("assets", "edit")}
                                canDelete={can("assets", "delete")}
                              />
                            </DialogContent>
                          </Dialog>
                        </div>
                        <FormSelect
                          label=""
                          value={device.deviceType}
                          onValueChange={(v) => updateDevice(device.tempId, { deviceType: v })}
                          options={categoryOptionsFor(device.deviceType)}
                        />
                      </div>
                      <FormInput
                        label="Asset Value (₹)"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        icon={IndianRupee}
                        value={device.amount}
                        onChange={e => updateDevice(device.tempId, { amount: e.target.value })}
                        placeholder="e.g. 45000"
                        required
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <FormInput
                          label="Brand"
                          icon={Landmark}
                          value={device.brand}
                          onChange={e => updateDevice(device.tempId, { brand: e.target.value })}
                          placeholder="e.g. Dell"
                          required
                        />
                        <FormInput
                          label="Model"
                          icon={Info}
                          value={device.model}
                          onChange={e => updateDevice(device.tempId, { model: e.target.value })}
                          placeholder="e.g. Latitude"
                          required
                        />
                      </div>
                      <FormInput
                        label="Assign Date"
                        type="date"
                        max={todayKey()}
                        icon={Calendar}
                        value={device.allocatedAt}
                        onChange={e => updateDevice(device.tempId, { allocatedAt: e.target.value })}
                        required
                      />

                      <FormInput
                        label="Serial Number"
                        icon={Hash}
                        value={device.serialNumber}
                        onChange={e => updateDevice(device.tempId, { serialNumber: e.target.value })}
                        maxLength={80}
                        placeholder="From the sticker or box"
                        required
                      />
                      <FormSelect
                        label="Status"
                        value={device.status}
                        onValueChange={(v) => updateDevice(device.tempId, { status: v as any })}
                        options={[
                          { label: "With employee", value: "active" },
                          { label: "Damaged", value: "damaged" },
                          { label: "Returned", value: "returned" },
                        ]}
                      />

                      <div className="md:col-span-2 space-y-4 pt-2">
                        <div className="flex items-center justify-between border-t border-border/40 pt-4">
                          <div className="flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5 text-primary/70" />
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Device Security & Unlock Credentials</Label>
                          </div>
                          <Badge variant="outline" className="text-[11px] font-bold bg-primary/5 border-primary/20 text-primary uppercase">
                            {device.unlockType} Secured
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-1 flex flex-col gap-2">
                            <Label className="text-[11px] font-bold text-muted-foreground ml-1">Unlock Method</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {[
                                { id: 'password', label: 'Pass', icon: Lock },
                                { id: 'pin', label: 'PIN', icon: Hash },
                                { id: 'pattern', label: 'Pattern', icon: LayoutGrid },
                              ].map(t => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => updateDevice(device.tempId, { unlockType: t.id as any, unlockCredentials: "" })}
                                  className={cn(
                                    "flex flex-col items-center justify-center gap-1 h-14 rounded-xl border transition-all duration-300",
                                    device.unlockType === t.id 
                                      ? "bg-primary/5 border-primary ring-1 ring-primary/20 shadow-sm" 
                                      : "bg-card border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/5"
                                  )}
                                >
                                  <t.icon className={cn("h-3.5 w-3.5", device.unlockType === t.id ? "text-primary" : "text-muted-foreground")} />
                                  <span className={cn("text-[11px] font-bold uppercase", device.unlockType === t.id ? "text-primary" : "text-foreground/70")}>{t.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="md:col-span-2">
                            {device.unlockType === 'pattern' ? (
                              <div className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-dashed border-primary/20 bg-primary/5 animate-in fade-in zoom-in-95 duration-300">
                                <div className="w-full flex items-center justify-between mb-2">
                                  <Label className="text-[11px] font-bold text-primary tracking-widest uppercase">Grid Size</Label>
                                  <div className="flex bg-card/50 p-0.5 rounded-lg border border-primary/10">
                                    {[3, 4].map(size => (
                                      <button
                                        key={size}
                                        type="button"
                                        onClick={() => updateDevice(device.tempId, { patternSize: size as 3 | 4, unlockCredentials: "" })}
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[11px] font-bold transition-all",
                                          device.patternSize === size 
                                            ? "bg-primary text-white shadow-sm" 
                                            : "text-muted-foreground hover:text-primary"
                                        )}
                                      >
                                        {size}x{size}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="relative p-8 bg-primary/5 rounded-2xl border border-primary/20 shadow-inner overflow-hidden">
                                  {/* Ambient Glow Background */}
                                  <div className="absolute inset-0 bg-linear-to-br from-white via-transparent to-primary/5 pointer-events-none" />
                                  
                                  {/* SVG Pattern Lines */}
                                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100">
                                    {(() => {
                                      const size = device.patternSize || 3;
                                      const parts = device.unlockCredentials ? device.unlockCredentials.split('-').map(Number) : [];
                                      if (parts.length < 2) return null;
                                      
                                      const getCoords = (num: number) => {
                                        const idx = num - 1;
                                        const x = ((idx % size) + 0.5) * (100 / size);
                                        const y = (Math.floor(idx / size) + 0.5) * (100 / size);
                                        return { x, y };
                                      };

                                      const points = parts.map(getCoords);
                                      const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                                      return (
                                        <>
                                          {/* Static Ghost Path */}
                                          <path
                                            d={pathData}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-primary/20"
                                          />
                                          {/* Animated Path */}
                                          <motion.path
                                            key={device.unlockCredentials}
                                            d={pathData}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-primary"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ 
                                              pathLength: [0, 1, 1],
                                              opacity: [0.3, 1, 0.3]
                                            }}
                                            transition={{ 
                                              duration: Math.max(1.5, parts.length * 0.4), 
                                              ease: "linear",
                                              repeat: Infinity,
                                              repeatDelay: 0.5
                                            }}
                                          />
                                        </>
                                      );
                                    })()}
                                  </svg>

                                  <div className={cn(
                                    "grid gap-8 sm:gap-12 relative z-20",
                                    device.patternSize === 4 ? "grid-cols-4" : "grid-cols-3"
                                  )}>
                                    {Array.from({ length: (device.patternSize || 3) * (device.patternSize || 3) }).map((_, i) => {
                                      const num = i + 1;
                                      const parts = device.unlockCredentials ? device.unlockCredentials.split('-') : [];
                                      const isActive = parts.includes(String(num));
                                      const order = parts.indexOf(String(num)) + 1;
                                      
                                      return (
                                        <button
                                          key={num}
                                          type="button"
                                          onClick={() => {
                                            if (isActive) {
                                              updateDevice(device.tempId, { unlockCredentials: parts.filter(p => p !== String(num)).join('-') });
                                            } else {
                                              updateDevice(device.tempId, { unlockCredentials: [...parts, String(num)].join('-') });
                                            }
                                          }}
                                          aria-label={`Pattern dot ${num}`}
                                          className="h-2 w-2 relative flex items-center justify-center group"
                                        >
                                          {/* Touch Target Area */}
                                          <div className="absolute inset-[-16px] rounded-full cursor-pointer hover:bg-primary/5 transition-colors" />
                                          
                                          {/* The Dot */}
                                          <motion.div 
                                            className={cn(
                                              "h-2 w-2 rounded-full transition-all duration-500",
                                              isActive ? "bg-primary shadow-[0_0_12px_rgba(var(--primary),0.5)] scale-125" : "bg-primary/20 group-hover:bg-primary/50"
                                            )}
                                            animate={isActive ? { scale: [1, 1.4, 1] } : {}}
                                            transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                                          />
                                          
                                          {/* Sequence Number */}
                                          {isActive && (
                                            <motion.span 
                                              initial={{ opacity: 0, y: 5 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              className="absolute -top-4 text-[11px] font-bold text-primary/60"
                                            >
                                              {order}
                                            </motion.span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="w-full flex items-center justify-between mt-1">
                                  <p className="text-[11px] font-bold text-primary tracking-widest uppercase opacity-80">
                                    {device.unlockCredentials ? `Seq: ${device.unlockCredentials}` : "Define Pattern"}
                                  </p>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-[11px] font-bold text-destructive hover:bg-destructive/5 rounded-lg px-2"
                                    onClick={() => updateDevice(device.tempId, { unlockCredentials: "" })}
                                  >
                                    Reset
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Label className="text-[11px] font-bold text-muted-foreground ml-1">
                                  {device.unlockType === 'pin' ? "Security PIN" : "Unlock Password"}
                                </Label>
                                <FormInput
                                  icon={device.unlockType === 'pin' ? Hash : VenetianMask}
                                  type="text"
                                  inputMode={device.unlockType === 'pin' ? "numeric" : "text"}
                                  maxLength={device.unlockType === 'pin' ? 16 : 100}
                                  value={device.unlockCredentials}
                                  onChange={e => updateDevice(device.tempId, { unlockCredentials: e.target.value })}
                                  placeholder={device.unlockType === 'pin' ? "e.g. 1234" : "Enter password"}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="p-4 border border-border/60 bg-card rounded-xl shadow-sm sticky top-5">
            <h3 className="font-semibold text-[13px] mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
              Summary
            </h3>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Target Employee</span>
                <span className="text-[12px] font-bold text-foreground text-right truncate">{selectedName || "—"}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Total Items</span>
                <span className="text-[12px] font-bold text-foreground">{devices.length} Units</span>
              </div>
              <div className="pt-4 border-t border-border/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold text-foreground uppercase tracking-wider shrink-0">Total Value</span>
                  <span className="text-[18px] font-bold text-primary truncate min-w-0">{formatINRFull(totalValue)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                type="submit"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="h-11 w-full rounded-xl bg-primary text-white hover:opacity-95 shadow-md font-bold text-[14px] gap-2 group"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isEditing ? "Save Changes" : devices.length > 1 ? `Give ${devices.length} Devices` : "Give Device"}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate({ to: "/assets" })}
                className="h-10 w-full rounded-xl text-muted-foreground font-semibold text-[13px] hover:bg-muted"
              >
                Cancel
              </Button>
            </div>

            <div className="mt-6 flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <AlertCircle className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
              <p className="text-[11px] text-primary/70 leading-relaxed font-medium">
                Check the serial numbers against the device. Each record stays in the employee's device history, even after it is returned.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
