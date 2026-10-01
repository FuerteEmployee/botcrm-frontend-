import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Mail, Phone, Building2, Trash2, Loader2, Users, Clock, CheckCircle2, Banknote, Settings as SettingsIcon, PlusCircle, FileSpreadsheet, UploadCloud, AlertCircle, Download, MapPin, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/shared/form-input";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Pagination } from "@/components/shared/pagination";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/lib/api-client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLeadService, type Lead } from "@/services/lead-service";
import { useEmployeeService } from "@/services/employee-service";
import { requestErrorMessage } from "@/services/request-error";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { GridCard } from "@/components/shared/grid-card";
import { usePermission } from "@/hooks/use-permission";
import { formatINR, formatINRFull } from "@/lib/format";
import { AdminLoadError } from "@/components/festivals/admin-load-error";

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

const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

const STATUS_CONFIG = {
  new: { label: "New", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  contacted: { label: "Contacted", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  qualified: { label: "Qualified", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
  proposal: { label: "Proposal", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  lost: { label: "Lost", color: "bg-destructive/10 text-destructive border-destructive/20" },
  won: { label: "Won", color: "bg-success/10 text-success border-success/20" },
};
const stageLabel = (s: string) => STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label || s;

const STAGE_PROGRESS = {
  new: { count: 1, color: "bg-blue-500" },
  contacted: { count: 2, color: "bg-amber-500" },
  qualified: { count: 3, color: "bg-indigo-500" },
  proposal: { count: 4, color: "bg-purple-500" },
  won: { count: 5, color: "bg-emerald-500" },
  lost: { count: 5, color: "bg-rose-500" }
};

const BOT_STATUS_LABEL: Record<string, string> = {
  Inactive: "Inactive",
  Active: "Active",
  "Completed - Converted": "Converted (customer)",
  "Completed - Lost": "Lost",
};

// The server's own rules (lead_controller), checked here first so a typo is
// caught before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_VALUE = 10000000000; // ₹1,000 crore
function phoneProblem(phone: string): string | null {
  if (!/^[0-9+\-\s().]+$/.test(phone)) return "The phone number can only have digits, spaces, + and -.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return "Please enter a phone number with 10 to 13 digits.";
  return null;
}

// Excel import column map — required columns mirror the Add Lead form's
// required fields (Full Name, Email, Phone, Company) exactly, so anything
// that can be created by hand can also be imported.
const IMPORT_REQUIRED_COLUMNS: { key: string; header: string }[] = [
  { key: "name", header: "LEAD" },
  { key: "email", header: "EMAIL" },
  { key: "phone", header: "PHONE" },
  { key: "company", header: "COMPANY" },
];
const IMPORT_OPTIONAL_COLUMNS: { key: string; header: string }[] = [
  { key: "source", header: "SOURCE" },
  { key: "value", header: "VALUE" },
  { key: "followUpDate", header: "FOLLOW-UP" },
];
const normalizeHeader = (h: string) => h.trim().toUpperCase().replace(/\s+/g, " ");

// The India (IST) calendar date as YYYY-MM-DD, whatever timezone the browser is
// in. toISOString() alone is the UTC date (yesterday in India until 5:30), and
// the browser's own date is wrong for an admin abroad; follow-up dates are IST.
function localDateKey(d: Date) {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// xlsx is a large library only needed by this one rarely-used dialog, so it's
// dynamically imported here rather than at module scope — a static import
// pulled it into the main bundle and pushed it past the PWA plugin's 2MB
// precache limit, breaking the production build entirely.
async function downloadImportTemplate() {
  const XLSX = await import("xlsx");
  const headers = [...IMPORT_REQUIRED_COLUMNS, ...IMPORT_OPTIONAL_COLUMNS].map(c => c.header);
  const sample = ["Jane Doe", "jane@example.com", "9876543210", "Acme Corp", "Website", "150000", "2026-08-15"];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, "leads-import-template.xlsx");
}

// "2026-10-05" read as a local date. new Date("2026-10-05") is UTC midnight,
// which is the previous evening anywhere west of Greenwich.
function parseDateKey(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

const formatDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function formatFollowUpDate(dateStr: string | undefined | null, closed = false) {
  const d = parseDateKey(dateStr);
  if (!d) return { text: "—", className: "text-muted-foreground/60" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const short = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });

  if (closed) return { text: short, className: "text-muted-foreground" };
  if (diffDays === 0) return { text: "Today", className: "text-amber-600 font-semibold" };
  if (diffDays === 1) return { text: "Tomorrow", className: "text-foreground font-medium" };
  if (diffDays < 0) return { text: `Overdue · ${short}`, className: "text-rose-600 font-semibold" };
  if (diffDays <= 7) return { text: `In ${diffDays} days`, className: "text-foreground font-medium" };
  return { text: short, className: "text-muted-foreground font-medium" };
}

const addedByName = (l: Lead) => (l.createdBy && typeof l.createdBy === "object" ? l.createdBy.name : "");

function LeadsPage() {
  const { leads, isLoading, isError, error, refetch, isFetching, createLead, updateLead, deleteLead } = useLeadService();
  const { employees } = useEmployeeService({ status: "active" });
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canCreate = can("leads", "create");
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");
  // The field list lives in company Settings, so changing it needs that right.
  const canConfigure = can("settings", "edit");

  // Anyone active can hold a lead; people in a sales department come first.
  // (It used to offer only a department named exactly "Sale Person", so in a
  // company whose department is "Sales" the list was just "Unassigned".)
  const assignees = useMemo(() => {
    const isSales = (e: any) => /sale/i.test(((e.departmentId as any)?.name || ""));
    return [...employees].sort((a, b) => Number(isSales(b)) - Number(isSales(a)) || a.name.localeCompare(b.name));
  }, [employees]);

  const [leadFields, setLeadFields] = useState<LeadFieldConfig[]>(DEFAULT_LEAD_FIELDS);

  // Field Management state
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [editingFields, setEditingFields] = useState<LeadFieldConfig[]>([]);
  const [savingFields, setSavingFields] = useState(false);
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
    apiClient.get("/settings").then(({ data }) => {
      if (Array.isArray(data?.leadFields) && data.leadFields.length > 0) {
        setLeadFields(data.leadFields);
      }
    }).catch(() => {
      // The defaults above still give a working page.
    });
  }, []);

  const handleSaveFields = async () => {
    setSavingFields(true);
    try {
      const { data } = await apiClient.put("/settings", { leadFields: editingFields });
      if (Array.isArray(data?.leadFields) && data.leadFields.length > 0) setLeadFields(data.leadFields);
      else setLeadFields(editingFields);
      toast.success("Lead fields saved");
      setFieldsModalOpen(false);
    } catch (error) {
      const message = requestErrorMessage(error, "The lead fields could not be saved. Please try again.");
      if (message) toast.error(message);
    } finally {
      setSavingFields(false);
    }
  };

  const openFieldsModal = () => {
    setEditingFields(JSON.parse(JSON.stringify(leadFields)));
    setFieldsModalOpen(true);
  };

  const handleAddField = () => {
    if (!newField.label.trim()) {
      toast.error("Please give the field a name");
      return;
    }
    const key = "custom_" + newField.label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);
    if (editingFields.some(f => f.key === key)) {
      toast.error("A field with this name is already in the list");
      return;
    }
    const options = newField.type === 'select'
      ? newFieldOptionsStr.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    if (newField.type === 'select' && (!options || options.length === 0)) {
      toast.error("Please enter the choices for the dropdown, separated by commas");
      return;
    }

    setEditingFields(prev => [...prev, {
      key,
      label: newField.label.trim(),
      type: newField.type,
      options,
      required: newField.required,
      showInTable: newField.showInTable,
      isSystem: false
    }]);
    setNewField({ key: "", label: "", type: "text", options: [], required: false, showInTable: true });
    setNewFieldOptionsStr("");
    toast.success("Field added. Press Save to keep it.");
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [viewing, setViewing] = useState<Lead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Import Leads state
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<"select" | "error" | "preview" | "importing" | "done">("select");
  const [importError, setImportError] = useState("");
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [importSkipped, setImportSkipped] = useState(0);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [importFailures, setImportFailures] = useState<{ row: number; reason: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const resetImport = () => {
    setImportStep("select");
    setImportError("");
    setImportRows([]);
    setImportSkipped(0);
    setImportProgress({ done: 0, total: 0, failed: 0 });
    setImportFailures([]);
  };

  const handleImportFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        setImportError("The file is empty. Add at least one lead below the header row.");
        setImportStep("error");
        return;
      }

      const headerMap = new Map(Object.keys(rows[0]).map((h) => [normalizeHeader(h), h]));
      const missing = IMPORT_REQUIRED_COLUMNS.filter((c) => !headerMap.has(c.header)).map((c) => c.header);
      if (missing.length > 0) {
        setImportError(`These columns are missing: ${missing.join(", ")}.`);
        setImportStep("error");
        return;
      }

      const get = (row: Record<string, any>, header: string) => {
        const actual = headerMap.get(header);
        return actual ? row[actual] : undefined;
      };

      const mapped = rows.map((row, i) => {
        const rawValue = get(row, "VALUE");
        const rawFollowUp = get(row, "FOLLOW-UP");
        // "1,50,000" is how an Indian sheet writes a number.
        const value = rawValue !== undefined && rawValue !== "" ? Number(String(rawValue).replace(/[,\s₹]/g, "")) : 0;
        return {
          _row: i + 2, // +2: 1-indexed sheet rows, plus the header row
          name: String(get(row, "LEAD") ?? "").trim(),
          email: String(get(row, "EMAIL") ?? "").trim(),
          phone: String(get(row, "PHONE") ?? "").trim(),
          company: String(get(row, "COMPANY") ?? "").trim(),
          source: String(get(row, "SOURCE") ?? "").trim() || "Direct",
          value: Number.isFinite(value) ? value : 0,
          followUpDate:
            rawFollowUp instanceof Date
              // A date cell comes back as local midnight, give or take a few
              // seconds of float error; reading it at noon lands on the right
              // day either way (toISOString would give the UTC day).
              ? localDateKey(new Date(rawFollowUp.getTime() + 12 * 3600 * 1000))
              : rawFollowUp
              ? String(rawFollowUp).trim()
              : "",
          status: "new",
        };
      });

      const valid = mapped.filter((r) => r.name && r.email && r.phone && r.company);
      if (valid.length === 0) {
        setImportError("No rows could be used. Every row is missing the lead name, email, phone or company.");
        setImportStep("error");
        return;
      }

      setImportRows(valid);
      setImportSkipped(mapped.length - valid.length);
      setImportStep("preview");
    } catch {
      setImportError("This file could not be read. Please use an .xlsx, .xls or .csv file.");
      setImportStep("error");
    }
  };

  const runImport = async () => {
    setImportStep("importing");
    let failed = 0;
    const failures: { row: number; reason: string }[] = [];
    for (let i = 0; i < importRows.length; i++) {
      const { _row, ...payload } = importRows[i];
      try {
        await apiClient.post("/leads", payload);
      } catch (err) {
        failed++;
        failures.push({ row: _row, reason: requestErrorMessage(err, "Could not be saved.") || "Could not be saved." });
      }
      setImportProgress({ done: i + 1, total: importRows.length, failed });
    }
    setImportFailures(failures);
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    setImportStep("done");
  };

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const [form, setForm] = useState<Record<string, any>>({});

  const initForm = () => {
    const newForm: Record<string, any> = {
      name: "", email: "", phone: "", company: "", source: "Direct", status: "new",
      assignedToId: "", salesCalls: 0, botStatus: "Inactive", value: 0, followUpDate: "", notes: "",
    };
    leadFields.forEach(f => {
      if (f.isSystem) return;
      newForm[f.key] = f.type === 'select' ? (f.options?.[0] || '') : '';
    });
    const sourceOpts = leadFields.find(f => f.key === 'source')?.options;
    if (sourceOpts?.length) newForm.source = sourceOpts[0];
    setForm(newForm);
  };

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length };
    for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1;
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesSearch =
        !needle ||
        [l.name, l.email, l.company, l.phone, l.assignedTo, addedByName(l)]
          .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // After a delete or a filter change the page can run past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const validateForm = (): string | null => {
    if (!String(form.name || "").trim()) return "Please enter the lead's name.";
    if (!String(form.email || "").trim()) return "Please enter the email.";
    if (!EMAIL_RE.test(String(form.email).trim())) return "Please enter a valid email address, like name@example.com.";
    if (!String(form.phone || "").trim()) return "Please enter the phone number.";
    const p = phoneProblem(String(form.phone).trim());
    if (p) return p;
    if (!String(form.company || "").trim()) return "Please enter the company name.";
    const v = Number(form.value);
    if (!Number.isFinite(v) || v < 0) return "The deal value cannot be less than ₹0.";
    if (v > MAX_VALUE) return "The deal value is too large (at most ₹1,000 crore).";
    const calls = Number(form.salesCalls);
    if (!Number.isInteger(calls) || calls < 0) return "Sales calls must be a whole number, 0 or more.";
    for (const f of leadFields) {
      if (f.isSystem || !f.required) continue;
      const val = form[f.key];
      if (val === undefined || val === null || String(val).trim() === "") return `Please fill in ${f.label}.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const problem = validateForm();
    if (problem) {
      toast.error(problem);
      return;
    }
    // Only the fields this form edits: the lead object also carries its id,
    // company, who added it and its photos, none of which a save may change.
    const payload: Record<string, any> = {
      name: String(form.name).trim(),
      email: String(form.email).trim(),
      phone: String(form.phone).trim(),
      company: String(form.company).trim(),
      source: form.source,
      status: form.status,
      value: Number(form.value) || 0,
      followUpDate: form.followUpDate || "",
      salesCalls: Number(form.salesCalls) || 0,
      botStatus: form.botStatus,
      notes: form.notes || "",
      assignedToId: form.assignedToId || null,
    };
    for (const f of leadFields) if (!f.isSystem) payload[f.key] = form[f.key] ?? "";
    setSaving(true);
    try {
      if (editing) {
        await updateLead({ id: editing._id, data: payload });
        toast.success("Lead saved");
      } else {
        await createLead(payload as any);
      }
      setOpen(false);
      setSelectedIds([]);
    } catch {
      // The service has already said why; the form stays open for a retry.
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const results = await Promise.allSettled(deleteTarget.ids.map((id) => deleteLead(id)));
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const done = results.length - failed.length;
    if (done > 0) toast.success(done === 1 ? "Lead deleted" : `${done} leads deleted`);
    if (failed.length > 0) {
      const message = requestErrorMessage(failed[0].reason, "Some leads could not be deleted. Please try again.");
      if (message) toast.error(failed.length === 1 ? message : `${failed.length} leads could not be deleted. ${message}`);
    }
    const removed = new Set(deleteTarget.ids.filter((_, i) => results[i].status === "fulfilled"));
    setSelectedIds((prev) => prev.filter((id) => !removed.has(id)));
    setDeleting(false);
    setDeleteTarget(null);
    if (viewing && deleteTarget.ids.includes(viewing._id)) setViewing(null);
  };

  const changeStage = async (lead: Lead, val: string) => {
    if (val === lead.status) return;
    try {
      await updateLead({ id: lead._id, data: { status: val } });
      toast.success(`${lead.name} moved to ${stageLabel(val)}`);
    } catch {
      // updateLead's onError has said why.
    }
  };

  const handleEdit = (lead: Lead) => {
    setViewing(null);
    setEditing(lead);
    const editForm: Record<string, any> = {
      name: lead.name ?? "", email: lead.email ?? "", phone: lead.phone ?? "", company: lead.company ?? "",
      source: lead.source || "Direct", status: lead.status || "new",
      assignedToId: lead.assignedToId ? String(lead.assignedToId) : "",
      salesCalls: lead.salesCalls ?? 0, botStatus: lead.botStatus || "Inactive", value: lead.value ?? 0,
      followUpDate: lead.followUpDate || "", notes: lead.notes || "",
    };
    // An older lead carries the assignee by name only.
    if (!editForm.assignedToId && lead.assignedTo && lead.assignedTo !== "Unassigned") {
      const match = assignees.filter((e) => e.name === lead.assignedTo);
      if (match.length === 1) editForm.assignedToId = match[0]._id;
    }
    leadFields.forEach(f => {
      if (!f.isSystem) editForm[f.key] = lead[f.key] ?? (f.type === 'number' ? '' : '');
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

  const wonLeads = stageCounts.won || 0;
  const closedLeads = wonLeads + (stageCounts.lost || 0);
  const winRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : null;

  const followUpsDue = useMemo(() => {
    const todayStr = localDateKey(new Date());
    return leads.filter((l) => {
      if (!l.followUpDate || ["won", "lost"].includes(l.status)) return false;
      return l.followUpDate <= todayStr;
    }).length;
  }, [leads]);

  const customFields = useMemo(() => {
    return leadFields.filter((f) => !f.isSystem && f.showInTable);
  }, [leadFields]);

  const sourceOptions = useMemo(() => {
    const opts = leadFields.find(f => f.key === 'source')?.options?.length
      ? [...(leadFields.find(f => f.key === 'source')!.options as string[])]
      : ["Direct", "IndiaMART", "Referral", "Cold Call", "Website"];
    // A lead added from the employee app carries the employee's name as its
    // source; keep it selectable so opening the form does not blank it.
    if (form.source && !opts.includes(form.source)) opts.unshift(form.source);
    return opts;
  }, [leadFields, form.source]);

  const stageOptions = leadFields.find(f => f.key === 'status')?.options?.filter((o) => (STAGES as readonly string[]).includes(o)) ?? [...STAGES];

  const emptyMessage = leads.length === 0
    ? (canCreate ? "No leads yet. Add one, or import a list from Excel." : "No leads yet.")
    : "No leads match this search or stage.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Management"
        description={isLoading ? "Loading leads..." : `${leads.length} lead${leads.length === 1 ? "" : "s"} in total`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {canConfigure ? (
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl gap-2 font-semibold border-border/60 hover:bg-accent/40"
                onClick={openFieldsModal}
              >
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                Fields
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                size="sm"
                className="h-10 rounded-xl gap-2 font-semibold bg-[#217346] hover:bg-[#1a5c38] text-white border-none"
                onClick={() => { resetImport(); setImportOpen(true); }}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Import
              </Button>
            ) : null}
            {canCreate ? (
              <ActionButton
                variant="add"
                showLabel
                label="Add Lead"
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
        <StatCard label="OPEN PIPELINE" value={formatINR(openPipeline)} icon={Banknote} accent="warning" delay={0.05} />
        <StatCard label={winRate === null ? "WON" : `WON · ${winRate}% OF CLOSED`} value={wonLeads} icon={CheckCircle2} accent="success" delay={0.1} />
        <StatCard label="FOLLOW-UPS DUE" value={followUpsDue} icon={Clock} accent="destructive" delay={0.15} />
      </div>

      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl"
        >
          <span className="text-xs font-semibold text-primary">
            {selectedIds.length} lead{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget({ ids: [...selectedIds], label: `${selectedIds.length} selected lead${selectedIds.length > 1 ? "s" : ""}` })}
                className="h-10 text-[12px] gap-1.5 px-3 rounded-lg"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="h-10 text-[12px] px-3 rounded-lg"
            >
              Clear
            </Button>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by stage" className="h-10 w-[170px] rounded-xl border-border/60 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All stages ({stageCounts.all || 0})</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{stageLabel(s)} ({stageCounts[s] || 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FormInput
          placeholder="Search name, company, phone, email..."
          icon={Search}
          className="h-10 w-full md:w-[300px] shadow-none"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <SkeletonLoader type="table" count={PAGE_SIZE} />
      ) : isError ? (
        <AdminLoadError what="the leads" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : (
        <AnimatePresence mode="wait">
          {view === "grid" ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {pageData.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-[13px] text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pageData.map((l, i) => {
                    const closed = ["won", "lost"].includes(l.status);
                    const fu = formatFollowUpDate(l.followUpDate, closed);
                    return (
                      <GridCard
                        key={l._id}
                        title={l.name}
                        subtitle={l.company}
                        icon={
                          <span className="flex h-full w-full items-center justify-center rounded-full bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[14px] font-black uppercase">
                            {(l.name || "?").charAt(0)}
                          </span>
                        }
                        delay={i * 0.04}
                        onView={() => setViewing(l)}
                        onEdit={canEdit ? () => handleEdit(l) : undefined}
                        onDelete={canDelete ? () => setDeleteTarget({ ids: [l._id], label: l.name }) : undefined}
                      >
                        <div className="space-y-2 mt-1 mb-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-none",
                              STATUS_CONFIG[l.status as keyof typeof STATUS_CONFIG]?.color
                            )}
                          >
                            {stageLabel(l.status)}
                          </Badge>
                          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 opacity-60 shrink-0" /> <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a>
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-muted-foreground min-w-0">
                            <Mail className="h-3.5 w-3.5 opacity-60 shrink-0" /> <span className="truncate">{l.email}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground border-t border-border/30 pt-2 mt-2">
                            <span>Value: <strong className="text-foreground">{formatINRFull(l.value || 0)}</strong></span>
                            <span className="text-right">Follow-up: <span className={fu.className}>{fu.text}</span></span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground border-t border-border/30 pt-2">
                            <span className="truncate">Assigned: <strong className="text-foreground">{l.assignedTo && l.assignedTo !== "Unassigned" ? l.assignedTo : "No one"}</strong></span>
                            <span className="shrink-0">Calls: <strong className="text-foreground">{l.salesCalls || 0}</strong></span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-border/30 pt-2">
                            <span className="truncate">{addedByName(l) ? `Added by ${addedByName(l)}` : (l.source || "Direct")}</span>
                            <span className="shrink-0">{l.createdAt ? formatDay(new Date(l.createdAt)) : ""}</span>
                          </div>
                          {customFields.map(f => (
                            <div key={f.key} className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground border-t border-border/30 pt-2">
                              <span>{f.label}:</span>
                              <strong className="text-foreground truncate">{l[f.key] !== undefined && l[f.key] !== null && l[f.key] !== "" ? String(l[f.key]) : "—"}</strong>
                            </div>
                          ))}
                        </div>
                      </GridCard>
                    );
                  })}
                </div>
              )}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalRecords={filtered.length} />
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
                    aria-label="Select all on this page"
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
                  "STAGE",
                  "VALUE",
                  "FOLLOW-UP",
                  "ASSIGNED TO",
                  ...customFields.map(f => f.label.toUpperCase()),
                  "Actions"
                ]}
                isEmpty={pageData.length === 0}
                emptyMessage={emptyMessage}
                pagination={{
                  page,
                  totalPages,
                  onPageChange: setPage,
                  totalRecords: filtered.length,
                }}
              >
                {pageData.map((l) => {
                  const stageProgress = STAGE_PROGRESS[l.status as keyof typeof STAGE_PROGRESS] || { count: 1, color: "bg-blue-500" };
                  const closed = ["won", "lost"].includes(l.status);
                  const fu = formatFollowUpDate(l.followUpDate, closed);
                  return (
                    <DataTableRow key={l._id} className="group hover:bg-primary/1 transition-colors">
                      <DataTableCell isFirst>
                        <Checkbox
                          aria-label={`Select ${l.name}`}
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
                        <button type="button" onClick={() => setViewing(l)} className="flex flex-col text-left">
                          <span className="text-[13.5px] font-semibold text-foreground group-hover:text-primary transition-colors hover:underline">
                            {l.name}
                          </span>
                          {l.company && (
                            <span className="flex items-center gap-1.5 mt-0.5 text-[12px] text-muted-foreground font-medium">
                              <Building2 className="h-3 w-3 opacity-60" /> {l.company}
                            </span>
                          )}
                          <span className="mt-0.5 text-[11px] text-muted-foreground">
                            {addedByName(l) ? `Added by ${addedByName(l)}` : (l.source || "Direct")}
                          </span>
                        </button>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col gap-0.5">
                          {l.phone && (
                            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground font-medium">
                              <Phone className="h-3.5 w-3.5 opacity-60 text-muted-foreground/80" /> <span>{l.phone}</span>
                            </div>
                          )}
                          {l.email && (
                            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 opacity-60 text-muted-foreground/80" /> <span className="truncate max-w-[160px]">{l.email}</span>
                            </div>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col items-start gap-1">
                          {canEdit ? (
                            <Select value={l.status} onValueChange={(val) => changeStage(l, val)}>
                              <SelectTrigger aria-label={`Stage for ${l.name}`} className="h-10 w-[130px] rounded-lg border-border/60 text-xs px-2 shadow-none focus:ring-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/60">
                                {stageOptions.map((opt) => (
                                  <SelectItem key={opt} value={opt} className="text-xs">{stageLabel(opt)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-none", STATUS_CONFIG[l.status as keyof typeof STATUS_CONFIG]?.color)}>
                              {stageLabel(l.status)}
                            </Badge>
                          )}
                          <div className="flex gap-0.5 mt-1.5 w-[130px]">
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
                      <DataTableCell className="text-[12.5px] font-semibold text-foreground whitespace-nowrap">
                        {formatINRFull(l.value || 0)}
                      </DataTableCell>
                      <DataTableCell className="text-[12.5px] whitespace-nowrap">
                        <span className={fu.className}>{fu.text}</span>
                      </DataTableCell>
                      <DataTableCell className="text-[12.5px] text-muted-foreground">
                        {l.assignedTo && l.assignedTo !== "Unassigned" ? l.assignedTo : "—"}
                      </DataTableCell>
                      {customFields.map(f => (
                        <DataTableCell key={f.key} className="text-[12.5px] text-muted-foreground font-medium">
                          {l[f.key] !== undefined && l[f.key] !== null && l[f.key] !== "" ? String(l[f.key]) : "—"}
                        </DataTableCell>
                      ))}
                      <DataTableCell isLast>
                        <div className="flex items-center justify-end gap-1">
                          <ActionButton variant="view" tooltip="View lead" aria-label={`View ${l.name}`} className="h-10 w-10" onClick={() => setViewing(l)} />
                          {canEdit && (
                            <ActionButton variant="edit" tooltip="Edit lead" aria-label={`Edit ${l.name}`} className="h-10 w-10" onClick={() => handleEdit(l)} />
                          )}
                          {canDelete && (
                            <ActionButton variant="delete" tooltip="Delete lead" aria-label={`Delete ${l.name}`} className="h-10 w-10" onClick={() => setDeleteTarget({ ids: [l._id], label: l.name })} />
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

      {/* Lead details */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          {viewing && (() => {
            const v = viewing;
            const closed = ["won", "lost"].includes(v.status);
            const fu = formatFollowUpDate(v.followUpDate, closed);
            const rows: [string, React.ReactNode][] = [
              ["Stage", stageLabel(v.status)],
              ["Deal value", formatINRFull(v.value || 0)],
              ["Follow-up", <span className={fu.className}>{fu.text}</span>],
              ["Assigned to", v.assignedTo && v.assignedTo !== "Unassigned" ? v.assignedTo : "No one"],
              ["Source", v.source || "Direct"],
              ["Added by", addedByName(v) || "Admin panel"],
              ["Added on", v.createdAt ? formatDay(new Date(v.createdAt)) : "—"],
              ["Sales calls", String(v.salesCalls || 0)],
              ["Bot status", BOT_STATUS_LABEL[v.botStatus || "Inactive"] || v.botStatus],
              ...(v.businessType ? [["Business type", v.businessType] as [string, React.ReactNode]] : []),
              ...(v.requirement ? [["Requirement", v.requirement] as [string, React.ReactNode]] : []),
              ...leadFields.filter((f) => !f.isSystem).map((f) => [f.label, v[f.key] !== undefined && v[f.key] !== null && v[f.key] !== "" ? String(v[f.key]) : "—"] as [string, React.ReactNode]),
            ];
            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 text-left">
                  <DialogTitle className="text-[17px] font-bold">{v.name}</DialogTitle>
                  <DialogDescription className="text-[13px] flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {v.company}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <div className="flex flex-col gap-2">
                    <a href={`tel:${v.phone}`} className="flex items-center gap-2 text-[14px] font-semibold text-primary hover:underline min-h-10">
                      <Phone className="h-4 w-4" /> {v.phone}
                    </a>
                    <a href={`mailto:${v.email}`} className="flex items-center gap-2 text-[13px] text-primary hover:underline min-h-10 break-all">
                      <Mail className="h-4 w-4 shrink-0" /> {v.email}
                    </a>
                    {v.address && (
                      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" /> {v.address}
                      </p>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                    {rows.map(([k, val]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[11px] font-semibold text-muted-foreground">{k}</dt>
                        <dd className="text-[13px] font-medium text-foreground break-words">{val}</dd>
                      </div>
                    ))}
                  </dl>
                  {v.notes && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">Notes</p>
                      <p className="text-[13px] whitespace-pre-wrap text-foreground">{v.notes}</p>
                    </div>
                  )}
                  {Array.isArray(v.imageUrls) && v.imageUrls.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Photos ({v.imageUrls.length})</p>
                      <div className="grid grid-cols-3 gap-2">
                        {v.imageUrls.map((url, i) => (
                          <a key={url + i} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                            <img src={url} alt={`Photo ${i + 1} for ${v.name}`} className="h-full w-full object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20 flex-row justify-end">
                  {canDelete && (
                    <Button type="button" variant="ghost" className="rounded-xl h-10 text-destructive" onClick={() => setDeleteTarget({ ids: [v._id], label: v.name })}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  )}
                  {canEdit && (
                    <Button type="button" className="rounded-xl h-10" onClick={() => handleEdit(v)}>Edit</Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        isLoading={deleting}
        title={deleteTarget && deleteTarget.ids.length > 1 ? `Delete ${deleteTarget.ids.length} leads?` : "Delete this lead?"}
        description={deleteTarget ? `${deleteTarget.label} will be removed for good, with its notes and photos. This cannot be undone.` : ""}
        confirmText="Delete"
      />

      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-bold">{editing ? "Edit Lead" : "Add New Lead"}</DialogTitle>
            <DialogDescription className="text-[12px]">Fields marked * are needed.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[60vh]">
              <FormInput
                label="Full Name *"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lead name"
                maxLength={100}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput
                  label="Email *"
                  type="email"
                  inputMode="email"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  maxLength={254}
                />
                <FormInput
                  label="Phone *"
                  type="tel"
                  inputMode="tel"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="98765 43210"
                  maxLength={20}
                />
              </div>
              <FormInput
                label="Company *"
                value={form.company || ""}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Company name"
                maxLength={150}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Source</label>
                  <Select value={form.source || "Direct"} onValueChange={(v: any) => setForm({ ...form, source: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60">
                      {sourceOptions.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Stage</label>
                  <Select value={form.status || "new"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60">
                      {stageOptions.map(opt => (
                        <SelectItem key={opt} value={opt}>{stageLabel(opt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground ml-1">Assigned To</label>
                  <Select value={form.assignedToId || "none"} onValueChange={(v: any) => setForm({ ...form, assignedToId: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-10 rounded-xl border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/60 max-h-72">
                      <SelectItem value="none">No one</SelectItem>
                      {assignees.map((emp) => (
                        <SelectItem key={emp._id} value={emp._id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editing && !form.assignedToId && editing.assignedTo && editing.assignedTo !== "Unassigned" && (
                    <p className="text-[11px] text-amber-700 ml-1">Was "{editing.assignedTo}". Pick them again to keep it.</p>
                  )}
                </div>
                <FormInput
                  label="Sales Calls"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.salesCalls ?? 0}
                  onChange={(e) => setForm({ ...form, salesCalls: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput
                  label="Deal Value (₹)"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={form.value ?? 0}
                  onChange={(e) => setForm({ ...form, value: e.target.value === "" ? "" : Number(e.target.value) })}
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
                    {Object.entries(BOT_STATUS_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-muted-foreground ml-1">Notes</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="What was discussed, next steps..."
                  rows={3}
                  maxLength={2000}
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
                      />
                    ) : f.type === 'number' ? (
                      <FormInput
                        type="number"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    ) : (
                      <FormInput
                        type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
                        value={form[f.key] || ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={`Enter ${f.label}`}
                        maxLength={500}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20 flex-row justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving} className="rounded-xl h-10">Cancel</Button>
              <ActionButton
                variant="add"
                type="submit"
                showLabel
                loading={saving}
                disabled={saving}
                label={editing ? "Save Changes" : "Create Lead"}
                icon={editing ? CheckCircle2 : Plus}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Leads Dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (importStep === "importing") return; setImportOpen(o); if (!o) resetImport(); }}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Import Leads
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Add many leads at once from an Excel or CSV file.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {importStep === "select" && (
              <>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                  <p className="text-[12px] font-bold text-foreground/80">What the file needs</p>
                  <p className="text-[12px] text-muted-foreground">
                    The first row must hold these column names, in any order:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {IMPORT_REQUIRED_COLUMNS.map((c) => (
                      <Badge key={c.key} variant="outline" className="text-[11px] font-bold border-primary/30 text-primary bg-primary/5">
                        {c.header} *
                      </Badge>
                    ))}
                    {IMPORT_OPTIONAL_COLUMNS.map((c) => (
                      <Badge key={c.key} variant="outline" className="text-[11px] font-bold border-border/60 text-muted-foreground">
                        {c.header}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    * needed. Rows without them are skipped. A phone number already in your leads is not added again.
                  </p>
                  <button
                    type="button"
                    onClick={downloadImportTemplate}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:underline min-h-10"
                  >
                    <Download className="h-3.5 w-3.5" /> Download a sample file
                  </button>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImportFile(file);
                  }}
                  className={cn(
                    "rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 px-6 text-center transition-colors",
                    isDragging ? "border-primary bg-primary/5" : "border-border/60 bg-muted/10"
                  )}
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <UploadCloud className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground/80">Drop your file here</p>
                    <p className="text-[11px] text-muted-foreground">.xlsx, .xls or .csv</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl font-semibold h-10"
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </>
            )}

            {importStep === "error" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[13px] font-bold text-destructive">This file cannot be imported</p>
                  <p className="text-[12px] text-destructive/80">{importError}</p>
                </div>
              </div>
            )}

            {importStep === "preview" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                  <p className="text-[13px] font-bold text-success">{importRows.length} lead{importRows.length === 1 ? "" : "s"} ready to import</p>
                  {importSkipped > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {importSkipped} row{importSkipped === 1 ? "" : "s"} skipped: missing the lead name, email, phone or company.
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-border/40 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="bg-muted/30 text-muted-foreground font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Lead</th>
                        <th className="px-3 py-2 text-left">Company</th>
                        <th className="px-3 py-2 text-left">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {importRows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-semibold text-foreground/80">{r.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.company}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importRows.length > 5 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 bg-muted/10">
                      + {importRows.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {importStep === "importing" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-[13px] font-semibold text-foreground/80">
                  Importing {importProgress.done} of {importProgress.total}...
                </p>
                <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {importStep === "done" && (
              <div className={cn("rounded-xl border p-4 flex items-start gap-3", importProgress.failed === importProgress.total ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5")}>
                {importProgress.failed === importProgress.total
                  ? <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  : <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />}
                <div className="space-y-1 min-w-0">
                  <p className={cn("text-[13px] font-bold", importProgress.failed === importProgress.total ? "text-destructive" : "text-success")}>
                    Added {importProgress.total - importProgress.failed} of {importProgress.total} leads
                  </p>
                  {importFailures.length > 0 && (
                    <>
                      <p className="text-[12px] text-muted-foreground">These rows were not added:</p>
                      <ul className="text-[12px] text-foreground space-y-0.5 max-h-40 overflow-y-auto">
                        {importFailures.slice(0, 20).map((f) => (
                          <li key={f.row}>Row {f.row}: {f.reason}</li>
                        ))}
                        {importFailures.length > 20 && <li>…and {importFailures.length - 20} more.</li>}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20 flex-row justify-end">
            {importStep === "error" && (
              <Button type="button" variant="outline" className="rounded-xl h-10" onClick={resetImport}>Try another file</Button>
            )}
            {importStep === "preview" && (
              <>
                <Button type="button" variant="ghost" className="rounded-xl h-10" onClick={resetImport}>Back</Button>
                <ActionButton variant="add" showLabel label={`Import ${importRows.length} Lead${importRows.length === 1 ? "" : "s"}`} icon={UploadCloud} onClick={runImport} />
              </>
            )}
            {(importStep === "select" || importStep === "done") && (
              <Button type="button" variant="ghost" className="rounded-xl h-10" onClick={() => setImportOpen(false)}>
                {importStep === "done" ? "Close" : "Cancel"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Fields Dialog */}
      <Dialog open={fieldsModalOpen} onOpenChange={(o) => { if (!savingFields) setFieldsModalOpen(o); }}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="text-[16px] font-bold">Lead Fields</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Add your own fields to the lead form, and choose which show as columns.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fields</h4>
              <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
                {editingFields.map((field, idx) => (
                  <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-card">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">{field.label}</span>
                        <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded", field.isSystem ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                          {field.isSystem ? "Built-in" : field.type}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 min-h-10 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.showInTable !== false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditingFields(prev => prev.map((f, i) => i === idx ? { ...f, showInTable: val } : f));
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-[12px] text-muted-foreground">Column</span>
                      </label>
                      <label className={cn("flex items-center gap-2 min-h-10", field.isSystem ? "opacity-60" : "cursor-pointer")}>
                        <input
                          type="checkbox"
                          disabled={field.isSystem}
                          checked={field.required === true}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditingFields(prev => prev.map((f, i) => i === idx ? { ...f, required: val } : f));
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-[12px] text-muted-foreground">Needed</span>
                      </label>
                      {!field.isSystem ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${field.label}`}
                          onClick={() => {
                            setEditingFields(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="w-10 h-10" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Built-in fields are always part of the form. Removing your own field hides it; values already saved on leads are kept.</p>
            </div>

            <div className="p-4 border border-border/60 rounded-xl bg-muted/10 space-y-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-primary" />
                Add a field
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground">Field name</label>
                  <Input
                    placeholder="e.g. Industry, Designation"
                    value={newField.label}
                    maxLength={40}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    className="h-10 text-[13px] rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground">Type</label>
                  <Select
                    value={newField.type}
                    onValueChange={(val: any) => setNewField({ ...newField, type: val })}
                  >
                    <SelectTrigger className="h-10 text-[13px] rounded-lg">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="select">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newField.type === 'select' && (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-muted-foreground">Choices</label>
                  <Input
                    placeholder="Separate with commas, e.g. Retail, Finance, Tech"
                    value={newFieldOptionsStr}
                    onChange={(e) => setNewFieldOptionsStr(e.target.value)}
                    className="h-10 text-[13px] rounded-lg"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 min-h-10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newField.showInTable !== false}
                    onChange={(e) => setNewField({ ...newField, showInTable: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-[12px] font-medium text-muted-foreground select-none">Show as a column</span>
                </label>
                <label className="flex items-center gap-2 min-h-10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newField.required === true}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-[12px] font-medium text-muted-foreground select-none">Needed</span>
                </label>

                <div className="flex-1 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddField}
                    className="h-10 text-[13px] gap-1.5 px-4 rounded-lg font-semibold bg-background hover:bg-accent/40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to list
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20 flex-row justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFieldsModalOpen(false)}
              disabled={savingFields}
              className="rounded-xl h-10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveFields}
              disabled={savingFields}
              className="rounded-xl h-10 bg-primary text-primary-foreground hover:bg-primary/95 font-semibold px-5"
            >
              {savingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
