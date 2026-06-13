import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GridCard } from "@/components/shared/grid-card";
import {
  Plus, Search, Calendar, HeartPulse, User, Baby, Heart,
  Settings2, Type as TypeIcon, Hash, Pencil, Trash2, Info
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { FormInput } from "@/components/shared/form-input";
import { Badge } from "@/components/ui/badge";
import { useLeaveTypeService, type LeaveType as BackendLeaveType } from "@/services/leave-type-service";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { cn } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/form-dialog";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/leave-types")({
  component: LeaveTypesPage,
});

function LeaveTypesPage() {
  const ICON_MAP: Record<string, any> = {
    Calendar,
    HeartPulse,
    User,
    Baby,
    Heart,
  };
  const [hasMounted, setHasMounted] = useState(false);
  const { leaveTypes: types, isLoading, isFetching, createLeaveType, updateLeaveType, deleteLeaveType, isCreating, isUpdating, isDeleting } = useLeaveTypeService();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BackendLeaveType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { defaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("leave-types", "create");
  const canEdit = can("leave-types", "edit");
  const canDelete = can("leave-types", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const [form, setForm] = useState({
    leaveName: "",
    code: "",
    totalDays: 0,
    description: "",
    iconStyle: "Calendar",
    colorCode: "#3b82f6",
  });

  if (!hasMounted) return null;

  const filtered = types.filter(t =>
    t.leaveName.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    try {
      if (editing) {
        await updateLeaveType({ id: editing._id, ...form });
      } else {
        await createLeaveType(form);
      }
      setOpen(false);
      setEditing(null);
      setForm({ leaveName: "", code: "", totalDays: 0, description: "", iconStyle: "Calendar", colorCode: "#3b82f6" });
    } catch (error) {
      // Handled by service
    }
  };

  const openEdit = (t: BackendLeaveType) => {
    setEditing(t);
    setForm({
      leaveName: t.leaveName,
      code: t.code,
      totalDays: t.totalDays,
      description: t.description || "",
      iconStyle: t.iconStyle,
      colorCode: t.colorCode || "#3b82f6",
    });
    setOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      try {
        await deleteLeaveType(deleteId);
        setDeleteId(null);
      } catch (error) {
        // Handled by service
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Leave Types"
        description="Configure and manage different categories of employee leaves."
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add Leave Type"
              onClick={() => { setEditing(null); setForm({ leaveName: "", code: "", totalDays: 0, description: "", iconStyle: "Calendar", colorCode: "#3b82f6" }); setOpen(true); }}
            />
          ) : null
        }
      />

      {(isLoading || (types.length === 0 && isFetching)) ? (
        <SkeletonLoader type="card" count={8} />
      ) : (
        <>
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-3">
              <ViewToggle view={view} onViewChange={setView} />
            </div>

            <FormInput
              placeholder="Search by name or code..."
              icon={Search}
              className="h-10 w-full md:w-[260px] shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <AnimatePresence mode="wait">
            {view === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5"
              >
                {filtered.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center mb-4">
                      <Settings2 className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-[14px] font-bold text-foreground/60">No leave types configured</p>
                    <p className="text-[12px] text-muted-foreground mt-1">Click "Add Leave Type" to create your first leave policy.</p>
                  </div>
                )}
                {filtered.map((t, i) => {
                  const Icon = ICON_MAP[t.iconStyle] || Calendar;
                  return (
                    <GridCard
                      key={t._id}
                      title={t.leaveName}
                      subtitle={t.description}
                      delay={i * 0.04}
                      icon={
                        <div 
                          className="h-full w-full flex items-center justify-center"
                          style={{ backgroundColor: `${t.colorCode}15`, color: t.colorCode }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                      }
                      statusNode={
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 border-border/60 bg-muted/30 uppercase rounded-full">
                          {t.code}
                        </Badge>
                      }
                      onEdit={canEdit ? () => openEdit(t) : undefined}
                      onDelete={canDelete ? () => setDeleteId(t._id) : undefined}
                      metaLeft={{ icon: Settings2, label: `Max: ${t.totalDays} Days` }}
                    />
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DataTable
                  headers={["Icon", "Leave Name", "Code", "Max Days", "Actions"]}
                  isEmpty={filtered.length === 0}
                  emptyMessage="No leave types configured. Click 'Add Leave Type' to get started."
                >
                  {filtered.map((t) => {
                    const Icon = ICON_MAP[t.iconStyle] || Calendar;
                    return (
                      <DataTableRow key={t._id}>
                        <DataTableCell isFirst>
                          <div 
                            className="h-8 w-8 rounded-lg grid place-items-center border"
                            style={{ 
                              backgroundColor: `${t.colorCode}15`,
                              borderColor: `${t.colorCode}30`,
                              color: t.colorCode 
                            }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        </DataTableCell>
                        <DataTableCell className="font-medium text-[14px]">{t.leaveName}</DataTableCell>
                        <DataTableCell>
                          <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 border-border/60 bg-muted/30 uppercase">{t.code}</Badge>
                        </DataTableCell>
                        <DataTableCell className="text-[14px] font-semibold text-primary">{t.totalDays} Days</DataTableCell>
                        <DataTableCell isLast>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <ActionButton
                                variant="edit"
                                tooltip="Edit Policy"
                                onClick={() => openEdit(t)}
                              />
                            )}
                            {canDelete && (
                              <ActionButton
                                variant="delete"
                                tooltip="Delete Type"
                                onClick={() => setDeleteId(t._id)}
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
        </>
      )}

      {/* Add/Edit Dialog */}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit Leave Policy" : "Create New Leave Type"}
        description="Define the leave policy and description for employees."
        onSubmit={handleSave}
        submitText={editing ? "Update Policy" : "Create Type"}
        isLoading={isCreating || isUpdating}
        maxWidth="sm:max-w-[600px]"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <FormInput
              label="Leave Name"
              icon={TypeIcon}
              value={form.leaveName}
              onChange={e => setForm({ ...form, leaveName: e.target.value })}
              placeholder="e.g. Annual Leave"
              containerClassName="space-y-1.5"
              className="h-10 text-[13px]"
            />
            
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Code"
                icon={Hash}
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. AL"
                className="uppercase h-10 text-[13px]"
                containerClassName="space-y-1.5"
              />
              <FormInput
                label="Total Days"
                type="number"
                min="0"
                icon={Calendar}
                value={form.totalDays}
                onChange={e => setForm({ ...form, totalDays: Math.max(0, parseInt(e.target.value) || 0) })}
                containerClassName="space-y-1.5"
                className="h-10 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="icon" className="text-[12px] font-black uppercase tracking-wider text-muted-foreground ml-1">
                Icon & Color
              </Label>
              <div className="flex gap-2">
                <Select value={form.iconStyle} onValueChange={v => setForm({ ...form, iconStyle: v })}>
                  <SelectTrigger className="flex-1 h-10 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-[13px] font-medium">
                    <SelectValue placeholder="Select icon" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60 shadow-xl">
                    {Object.keys(ICON_MAP).map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-xl border border-border/40 shrink-0 h-10">
                  <FormInput
                    type="color"
                    value={form.colorCode}
                    onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                    className="w-8 h-8 p-0 border-none bg-transparent cursor-pointer rounded-lg overflow-hidden shadow-none"
                    containerClassName="shrink-0"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-[12px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              Description
            </Label>
            <Textarea 
              id="desc" 
              value={form.description} 
              onChange={e => setForm({ ...form, description: e.target.value })} 
              placeholder="Describe the leave eligibility..." 
              className="rounded-xl h-[calc(100%-25px)] min-h-[160px] text-[13px] bg-muted/30 border-border/40 focus:bg-white transition-all p-4 leading-relaxed resize-none" 
            />
          </div>
        </div>
      </FormDialog>

      <DeleteDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Leave Type?"
        description="Are you sure you want to delete this leave type? This action cannot be undone and may affect employee balance tracking."
        isLoading={isDeleting}
      />
    </div>
  );
}
