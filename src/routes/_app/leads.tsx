import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Plus, Search, Filter, Mail, Phone, Building2, UserCheck, Trash2, Pencil, MoreVertical, Loader2, LayoutGrid, List, Users, Clock, CheckCircle2, Banknote, Settings as SettingsIcon, X, PlusCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/shared/form-input";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/lib/api-client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLeadService, type Lead } from "@/services/lead-service";
import { useEmployeeService } from "@/services/employee-service";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { usePermission } from "@/hooks/use-permission";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});

const PAGE_SIZE = 8;

interface LeadFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'phone' | 'select' | 'date';
  options?: string[];
  required?: boolean;
  showInTable?: boolean;
  isSystem?: boolean;
}

const DEFAULT_LEAD_FIELDS: LeadFieldConfig[] = [
  { key: "name", label: "Lead Name", type: "text", required: true, showInTable: true, isSystem: true },
  { key: "company", label: "Company Name", type: "text", required: true, showInTable: true, isSystem: true },
  { key: "email", label: "Email", type: "email", required: true, showInTable: true, isSystem: true },
  { key: "phone", label: "Phone", type: "phone", required: true, showInTable: true, isSystem: true },
  { key: "source", label: "Source", type: "select", options: ["Direct", "IndiaMART", "Referral", "Cold Call", "Website"], required: false, showInTable: true, isSystem: true },
  { key: "status", label: "Stage", type: "select", options: ["new", "contacted", "qualified", "proposal", "won", "lost"], required: true, showInTable: true, isSystem: true },
  { key: "value", label: "Value", type: "number", required: false, showInTable: true, isSystem: true },
  { key: "followUpDate", label: "Follow-up", type: "date", required: false, showInTable: true, isSystem: true }
];

const STATUS_CONFIG = {
  new: { label: "New", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  contacted: { label: "Contacted", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  qualified: { label: "Qualified", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
  proposal: { label: "Proposal", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  lost: { label: "Lost", color: "bg-destructive/10 text-destructive border-destructive/20" },
  won: { label: "Won", color: "bg-success/10 text-success border-success/20" },
};

const STAGE_PROGRESS = {
  new: { count: 1, color: "bg-blue-500" },
  contacted: { count: 2, color: "bg-amber-500" },
  qualified: { count: 3, color: "bg-indigo-500" },
  proposal: { count: 4, color: "bg-purple-500" },
  won: { count: 5, color: "bg-emerald-500" },
  lost: { count: 5, color: "bg-rose-500" }
};

function formatFollowUpDate(dateStr: string | undefined) {
  if (!dateStr) return { text: "—", className: "text-muted-foreground/50" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: dateStr, className: "text-muted-foreground" };

  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(d);
  target.setHours(0,0,0,0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { text: "Today", className: "text-amber-600 font-semibold" };
  if (diffDays === 1) return { text: "Tomorrow", className: "text-slate-600 font-medium" };
  if (diffDays === -1) return { text: "Yesterday", className: "text-rose-600 font-medium" };
  if (diffDays > 1 && diffDays <= 7) return { text: `In ${diffDays}d`, className: "text-slate-600 font-medium" };
  
  return {
    text: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined }),
    className: "text-slate-500 font-medium"
  };
}

function LeadsPage() {
  const { leads, isLoading, createLead, updateLead, deleteLead } = useLeadService();
  const { employees } = useEmployeeService({ limit: 1000, status: "active" });

  const salespeople = useMemo(() => {
    return employees.filter((emp) => {
      const deptName = ((emp.departmentId as any)?.name || "").trim().toLowerCase();
      return deptName === "sale person" || deptName === "sales person";
    });
  }, [employees]);

  const [leadFields, setLeadFields] = useState<LeadFieldConfig[]>(DEFAULT_LEAD_FIELDS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Field Management state
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [editingFields, setEditingFields] = useState<LeadFieldConfig[]>([]);
  const [newField, setNewField] = useState<Omit<LeadFieldConfig, 'isSystem'>>({
    key: "",
    label: "",
    type: "text",
    options: [],
    required: false,
    showInTable: true
  });
  const [newFieldOptionsStr, setNewFieldOptionsStr] = useState("");

  useEffect(() => {
    setSettingsLoading(true);
    apiClient.get("/settings").then(({ data }) => {
      if (data?.leadFields && data.leadFields.length > 0) {
        setLeadFields(data.leadFields);
      }
    }).catch((err) => {
      console.error("Failed to load settings:", err);
    }).finally(() => {
      setSettingsLoading(false);
    });
  }, []);

  const saveFields = async (updatedFields: LeadFieldConfig[]) => {
    try {
      const { data } = await apiClient.put("/settings", { leadFields: updatedFields });
      if (data?.leadFields) {
        setLeadFields(data.leadFields);
      }
      toast.success("Lead fields configuration updated successfully");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update lead fields");
    }
  };

  const handleSaveFields = async () => {
    await saveFields(editingFields);
    setFieldsModalOpen(false);
  };

  const openFieldsModal = () => {
    setEditingFields(JSON.parse(JSON.stringify(leadFields)));
    setFieldsModalOpen(true);
  };

  const handleAddField = () => {
    if (!newField.label.trim()) {
      toast.error("Field label is required");
      return;
    }
    const key = "custom_" + newField.label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (editingFields.some(f => f.key === key)) {
      toast.error("A field with a similar label already exists");
      return;
    }
    const options = newField.type === 'select'
      ? newFieldOptionsStr.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const fieldToAdd: LeadFieldConfig = {
      key,
      label: newField.label.trim(),
      type: newField.type,
      options,
      required: newField.required,
      showInTable: newField.showInTable,
      isSystem: false
    };

    setEditingFields(prev => [...prev, fieldToAdd]);
    setNewField({ key: "", label: "", type: "text", options: [], required: false, showInTable: true });
    setNewFieldOptionsStr("");
    toast.success("Field added to list. Remember to save changes.");
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("leads", "create");
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [form, setForm] = useState<Record<string, any>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    source: "Direct",
    status: "new",
    assignedTo: "Unassigned",
    salesCalls: 0,
    botStatus: "Inactive",
    value: 0,
    followUpDate: "",
    notes: "",
  });

  const initForm = () => {
    const newForm: Record<string, any> = {};
    leadFields.forEach(f => {
      if (f.key === 'status') newForm[f.key] = 'new';
      else if (f.key === 'source') newForm[f.key] = f.options?.[0] || 'Direct';
      else if (f.key === 'value' || f.key === 'salesCalls') newForm[f.key] = 0;
      else if (f.key === 'botStatus') newForm[f.key] = 'Inactive';
      else if (f.key === 'assignedTo') newForm[f.key] = 'Unassigned';
      else newForm[f.key] = f.type === 'select' ? (f.options?.[0] || '') : '';
    });
    setForm(newForm);
  };

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch =
        !search ||
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.email.toLowerCase().includes(search.toLowerCase()) ||
        l.company.toLowerCase().includes(search.toLowerCase()) ||
        (l.phone && l.phone.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    for (const f of leadFields) {
      if (f.required && !form[f.key]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    try {
      if (editing) {
        await updateLead({ id: editing._id, data: form });
      } else {
        await createLead(form as any);
      }
      setOpen(false);
      setSelectedIds([]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected leads?`)) return;
    try {
      await Promise.all(selectedIds.map(id => deleteLead(id)));
      setSelectedIds([]);
      toast.success("Selected leads deleted successfully");
    } catch (err) {
      toast.error("Failed to delete some leads");
    }
  };

  const handleEdit = (lead: Lead) => {
    setEditing(lead);
    const editForm: Record<string, any> = {};
    leadFields.forEach(f => {
      editForm[f.key] = lead[f.key] ?? (f.type === 'number' ? 0 : '');
    });
    // Include custom properties that might exist on the lead
    Object.keys(lead).forEach(k => {
      if (!['createdAt', 'updatedAt', '_id', '__v'].includes(k) && editForm[k] === undefined) {
        editForm[k] = lead[k];
      }
    });
    setForm(editForm);
    setOpen(true);
  };

  // Derived metrics
  const totalLeads = leads.length;

  const openPipeline = useMemo(() => {
    return leads
      .filter((l) => !["won", "lost"].includes(l.status))
      .reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  }, [leads]);

  const wonLeads = useMemo(() => {
    return leads.filter((l) => l.status === "won").length;
  }, [leads]);

  const followUpsDue = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return leads.filter((l) => {
      if (!l.followUpDate || ["won", "lost"].includes(l.status)) return false;
      return l.followUpDate <= todayStr;
    }).length;
  }, [leads]);

  const customFields = useMemo(() => {
    return leadFields.filter((f) => !f.isSystem && f.showInTable);
  }, [leadFields]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Management"
        description={`${leads.length} total leads tracked from various sources`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl gap-2 font-semibold border-border/60 hover:bg-accent/40"
              onClick={openFieldsModal}
            >
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              Configure Fields
            </Button>
            {canCreate ? (
              <ActionButton
                variant="add"
                showLabel
                label="Add New Lead"
                onClick={() => {
                  setEditing(null);
                  initForm();
                  setOpen(true);
                }}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="TOTAL LEADS" value={totalLeads} icon={Users} accent="primary" delay={0} />
        <StatCard label="OPEN PIPELINE" value={`₹${openPipeline.toLocaleString("en-IN")}`} icon={Banknote} accent="warning" delay={0.05} />
        <StatCard label="WON" value={wonLeads} icon={CheckCircle2} accent="success" delay={0.1} />
        <StatCard label="FOLLOW-UPS DUE" value={followUpsDue} icon={Clock} accent="destructive" delay={0.15} />
      </div>

      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl"
        >
          <span className="text-xs font-semibold text-primary">
            {selectedIds.length} lead{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="h-8 text-[11px] gap-1.5 px-3 rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="h-8 text-[11px] px-3 rounded-lg"
            >
              Clear Selection
            </Button>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
        </div>

        <FormInput
          placeholder="Search by name, company, phone, email..."
          icon={Search}
          className="h-10 w-full md:w-[300px] shadow-none"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <SkeletonLoader type="table" count={PAGE_SIZE} />
      ) : (
        <AnimatePresence mode="wait">
          {view === "grid" ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {pageData.map((l, i) => (
                <GridCard
                  key={l._id}
                  title={l.name}
                  subtitle={l.company}
                  icon={
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[14px] font-black uppercase">
                      {l.name.charAt(0)}
                    </span>
                  }
                  delay={i * 0.04}
                  onEdit={canEdit ? () => handleEdit(l) : undefined}
                  onDelete={canDelete ? () => handleDelete(l._id) : undefined}
                  statusNode={
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shadow-none",
                        STATUS_CONFIG[l.status as keyof typeof STATUS_CONFIG]?.color
                      )}
                    >
                      {STATUS_CONFIG[l.status as keyof typeof STATUS_CONFIG]?.label || l.status}
                    </Badge>
                  }
                >
                  <div className="space-y-2 mt-3 mb-1">
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 opacity-60" /> <span className="truncate">{l.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 opacity-60" /> {l.phone}
                    </div>
                    <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/60">
                        {new Date(l.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">
                        {l.source}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/20 pt-2 mt-2">
                      <span>Value: <strong className="text-foreground">₹{(l.value || 0).toLocaleString("en-IN")}</strong></span>
                      <span>Follow-up: <strong className="text-foreground">{(() => {
                        const formatted = formatFollowUpDate(l.followUpDate);
                        return <span className={formatted.className}>{formatted.text}</span>;
                      })()}</strong></span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/20 pt-2 mt-2">
                      <span>Calls: <strong className="text-foreground">{l.salesCalls || 0}</strong></span>
                      <span className="flex items-center gap-1">
                        Bot: 
                        <strong className={cn(
                          "font-bold uppercase text-[9px]",
                          l.botStatus === "Completed - Converted" ? "text-emerald-600" : l.botStatus === "Completed - Lost" ? "text-destructive" : l.botStatus === "Active" ? "text-blue-500 animate-pulse" : "text-muted-foreground/60"
                        )}>{l.botStatus || "Inactive"}</strong>
                      </span>
                    </div>
                    {customFields.map(f => (
                      <div key={f.key} className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/20 pt-2 mt-2">
                        <span>{f.label}:</span>
                        <strong className="text-foreground">{l[f.key] !== undefined && l[f.key] !== null ? String(l[f.key]) : "—"}</strong>
                      </div>
                    ))}
                  </div>
                </GridCard>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DataTable
                headers={[
                  <Checkbox
                    checked={pageData.length > 0 && pageData.every(l => selectedIds.includes(l._id))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(prev => Array.from(new Set([...prev, ...pageData.map(l => l._id)])));
                      } else {
                        setSelectedIds(prev => prev.filter(id => !pageData.some(l => l._id === id)));
                      }
                    }}
                  />,
                  "LEAD",
                  "CONTACT",
                  "SOURCE",
                  "STAGE",
                  "VALUE",
                  "FOLLOW-UP",
                  ...customFields.map(f => f.label.toUpperCase()),
                  "Actions"
                ]}
                isEmpty={pageData.length === 0}
                pagination={{
                  page,
                  totalPages,
                  onPageChange: setPage,
                  totalRecords: filtered.length,
                }}
              >
                {pageData.map((l) => {
                  const stageProgress = STAGE_PROGRESS[l.status as keyof typeof STAGE_PROGRESS] || { count: 1, color: "bg-blue-500" };
                  return (
                    <DataTableRow key={l._id} className="group hover:bg-primary/1 transition-colors">
                      <DataTableCell isFirst>
                        <Checkbox
                          checked={selectedIds.includes(l._id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedIds(prev => [...prev, l._id]);
                            } else {
                              setSelectedIds(prev => prev.filter(id => id !== l._id));
                            }
                          }}
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col">
                          <span className="text-[13.5px] font-semibold text-foreground group-hover:text-primary transition-colors">
                            {l.name}
                          </span>
                          {l.company && (
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-muted-foreground font-medium">
                              <Building2 className="h-3 w-3 opacity-60" /> {l.company}
                            </div>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col gap-0.5">
                          {l.phone && (
                            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground font-medium">
                              <Phone className="h-3.5 w-3.5 opacity-60 text-muted-foreground/80" /> <span>{l.phone}</span>
                            </div>
                          )}
                          {l.email && (
                            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 opacity-60 text-muted-foreground/80" /> <span className="truncate max-w-[160px]">{l.email}</span>
                            </div>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <span className="text-[12.5px] text-muted-foreground font-medium">{l.source || "Direct"}</span>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Select
                            value={l.status}
                            onValueChange={async (val) => {
                              try {
                                await updateLead({ id: l._id, data: { status: val } });
                                toast.success(`Stage updated to ${val} for ${l.name}`);
                              } catch (err) {
                                toast.error("Failed to update stage");
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 w-[120px] rounded-lg border-border/60 text-xs px-2 shadow-none focus:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-border/60">
                              {leadFields.find(f => f.key === 'status')?.options?.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                </SelectItem>
                              )) || (
                                <>
                                  <SelectItem value="new" className="text-xs">New</SelectItem>
                                  <SelectItem value="contacted" className="text-xs">Contacted</SelectItem>
                                  <SelectItem value="qualified" className="text-xs">Qualified</SelectItem>
                                  <SelectItem value="proposal" className="text-xs">Proposal</SelectItem>
                                  <SelectItem value="won" className="text-xs">Won</SelectItem>
                                  <SelectItem value="lost" className="text-xs">Lost</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          
                          <div className="flex gap-0.5 mt-1.5 w-[120px]">
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  "h-1 flex-1 rounded-sm transition-all duration-300",
                                  idx < stageProgress.count ? stageProgress.color : "bg-muted-foreground/10"
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-[12.5px] font-semibold text-foreground">
                        {l.value ? `₹${l.value.toLocaleString("en-IN")}` : "₹0"}
                      </DataTableCell>
                      <DataTableCell className="text-[12.5px]">
                        {(() => {
                          const formatted = formatFollowUpDate(l.followUpDate);
                          return <span className={formatted.className}>{formatted.text}</span>;
                        })()}
                      </DataTableCell>
                      {customFields.map(f => (
                        <DataTableCell key={f.key} className="text-[12.5px] text-muted-foreground font-medium">
                          {l[f.key] !== undefined && l[f.key] !== null ? String(l[f.key]) : "—"}
                        </DataTableCell>
                      ))}
                      <DataTableCell isLast>
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <ActionButton
                              variant="edit"
                              tooltip="Edit Lead"
                              onClick={() => handleEdit(l)}
                            />
                          )}
                          {canDelete && (
                            <ActionButton
                              variant="delete"
                              tooltip="Delete Lead"
                              onClick={() => handleDelete(l._id)}
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-bold">{editing ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[60vh]">
              <FormInput
                label="Full Name"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lead name"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="Email"
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  required
                />
                <FormInput
                  label="Phone"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone number"
                  required
                />
              </div>
              <FormInput
                label="Company"
                value={form.company || ""}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Company name"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Source</label>
                  <Select value={form.source || "Direct"} onValueChange={(v: any) => setForm({ ...form, source: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60">
                      {leadFields.find(f => f.key === 'source')?.options?.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      )) || (
                        <>
                          <SelectItem value="Direct">Direct</SelectItem>
                          <SelectItem value="IndiaMART">IndiaMART</SelectItem>
                          <SelectItem value="Referral">Referral</SelectItem>
                          <SelectItem value="Cold Call">Cold Call</SelectItem>
                          <SelectItem value="Website">Website</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Status (Stage)</label>
                  <Select value={form.status || "new"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60">
                      {leadFields.find(f => f.key === 'status')?.options?.map(opt => (
                        <SelectItem key={opt} value={opt}>
                          {opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </SelectItem>
                      )) || (
                        <>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="proposal">Proposal</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Assigned To</label>
                  <Select value={form.assignedTo || "Unassigned"} onValueChange={(v: any) => setForm({ ...form, assignedTo: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60">
                      <SelectItem value="Unassigned">Unassigned</SelectItem>
                      {salespeople.map((emp) => (
                        <SelectItem key={emp._id} value={emp.name}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FormInput
                  label="Sales Calls"
                  type="number"
                  min="0"
                  value={form.salesCalls ?? 0}
                  onChange={(e) => setForm({ ...form, salesCalls: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="Deal Value (₹)"
                  type="number"
                  min="0"
                  value={form.value ?? 0}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })}
                  placeholder="150000"
                />
                <FormInput
                  label="Follow-up Date"
                  type="date"
                  value={form.followUpDate || ""}
                  onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground ml-1">Bot Status</label>
                <Select value={form.botStatus || "Inactive"} onValueChange={(v: any) => setForm({ ...form, botStatus: v })}>
                  <SelectTrigger className="h-10 rounded-xl border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60">
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Completed - Converted">Converted (Customer)</SelectItem>
                    <SelectItem value="Completed - Lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground ml-1">Notes</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Context, next steps..."
                  rows={3}
                  className="w-full bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Custom Dynamic Fields */}
              {leadFields.filter(f => !f.isSystem).map((f) => {
                return (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-muted-foreground ml-1">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </label>
                    {f.type === 'select' ? (
                      <Select
                        value={form[f.key] || ""}
                        onValueChange={(val) => setForm({ ...form, [f.key]: val })}
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/60">
                          <SelectValue placeholder={`Select ${f.label}`} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/60">
                          {f.options?.map(opt => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.type === 'date' ? (
                      <FormInput
                        type="date"
                        value={form[f.key] || ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        required={f.required}
                      />
                    ) : f.type === 'number' ? (
                      <FormInput
                        type="number"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                        required={f.required}
                      />
                    ) : (
                      <FormInput
                        type={f.type === 'email' ? 'email' : 'text'}
                        value={form[f.key] || ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={`Enter ${f.label}`}
                        required={f.required}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
              <ActionButton
                variant="add"
                type="submit"
                showLabel
                label={editing ? "Save Changes" : "Create Lead"}
                icon={editing ? CheckCircle2 : Plus}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Configure Fields Dialog */}
      <Dialog open={fieldsModalOpen} onOpenChange={setFieldsModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-bold">Configure Lead Fields</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Add custom fields or toggle visibility of default columns in the leads table.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* List of current fields */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Fields</h4>
              <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
                {editingFields.map((field, idx) => (
                  <div key={field.key} className="flex items-center justify-between p-3.5 bg-card hover:bg-muted/5 transition-colors">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{field.label}</span>
                        {field.isSystem && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">System</span>
                        )}
                        {!field.isSystem && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">{field.type}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">{field.key}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Show in Table Toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Show in Table</span>
                        <input
                          type="checkbox"
                          checked={field.showInTable !== false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditingFields(prev => prev.map((f, i) => i === idx ? { ...f, showInTable: val } : f));
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </div>

                      {/* Required Toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Required</span>
                        <input
                          type="checkbox"
                          disabled={field.isSystem && ['name', 'status'].includes(field.key)} // Name and Status must always be required
                          checked={field.required === true}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditingFields(prev => prev.map((f, i) => i === idx ? { ...f, required: val } : f));
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                        />
                      </div>

                      {/* Actions */}
                      {!field.isSystem ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingFields(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg flex items-center justify-center p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="w-7 h-7" /> // spacer
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Custom Field section */}
            <div className="p-4 border border-border/60 rounded-xl bg-muted/10 space-y-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-primary" />
                Add Custom Field
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground">Field Label</label>
                  <Input
                    placeholder="e.g. Industry, Designation"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground">Field Type</label>
                  <Select
                    value={newField.type}
                    onValueChange={(val: any) => setNewField({ ...newField, type: val })}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="text" className="text-xs">Text</SelectItem>
                      <SelectItem value="number" className="text-xs">Number</SelectItem>
                      <SelectItem value="email" className="text-xs">Email</SelectItem>
                      <SelectItem value="phone" className="text-xs">Phone Number</SelectItem>
                      <SelectItem value="date" className="text-xs">Date</SelectItem>
                      <SelectItem value="select" className="text-xs">Dropdown Select</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newField.type === 'select' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground">Dropdown Options</label>
                  <Input
                    placeholder="Enter options separated by commas (e.g. Retail, Finance, Tech)"
                    value={newFieldOptionsStr}
                    onChange={(e) => setNewFieldOptionsStr(e.target.value)}
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
              )}

              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="newFieldShow"
                    checked={newField.showInTable !== false}
                    onChange={(e) => setNewField({ ...newField, showInTable: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="newFieldShow" className="text-[11px] font-medium text-muted-foreground select-none">Show as table column</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="newFieldReq"
                    checked={newField.required === true}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="newFieldReq" className="text-[11px] font-medium text-muted-foreground select-none">Required field</label>
                </div>

                <div className="flex-1 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddField}
                    className="h-9 text-xs gap-1.5 px-4 rounded-lg font-semibold bg-background hover:bg-accent/40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Field to List
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFieldsModalOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveFields}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 font-semibold px-5"
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
