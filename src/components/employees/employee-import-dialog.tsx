import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, UploadCloud } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { apiClient } from "@/lib/api-client";
import { cn, toISTDateKey } from "@/lib/utils";
import {
  IMPORT_COLUMNS, MAX_IMPORT_ROWS, parseEmployeeRows,
  type ImportContext, type ImportRow,
} from "@/lib/employee-import";
import {
  postEmployee, refreshEmployeeViews, useEmployeeSeatUsage, useEmployeeService,
} from "@/services/employee-service";
import { useBranchService } from "@/services/branch-service";
import { useDepartmentService } from "@/services/department-service";
import { useShiftService } from "@/services/shift-service";
import { requestErrorMessage } from "@/services/request-error";

type Step = "select" | "error" | "preview" | "importing" | "done";

// The parts of GET /settings the import reads (the same values the Add
// Employee form pre-fills from).
type CompanySettings = {
  branchSettings?: { allowMultipleBranches?: boolean };
  attendance?: { defaultShiftId?: string | null; workDays?: string[]; requireLocation?: boolean; remotePunch?: boolean };
  salaryTemplates?: { name: string; components: Record<string, unknown> }[];
};
type Failure = { row: number; name: string; reason: string; source: Record<string, unknown> };

// xlsx is ~400KB and only this dialog needs it, so it is loaded on use. A
// static import pushed the main bundle past the PWA plugin's 2MB precache
// limit and broke the production build (see leads.tsx).
const loadXlsx = () => import("xlsx");

const STATUS_STYLE: Record<ImportRow["status"], string> = {
  ready: "text-success",
  exists: "text-muted-foreground",
  error: "text-destructive",
};

export function EmployeeImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { branches, isLoading: branchesLoading } = useBranchService();
  const { departments, isLoading: departmentsLoading } = useDepartmentService();
  const { shifts, isLoading: shiftsLoading } = useShiftService();
  // Everyone, inactive included: their phone numbers are taken too.
  const { employees, isLoading: employeesLoading } = useEmployeeService({ status: "all" });
  const seats = useEmployeeSeatUsage();
  const { data: settings, isLoading: settingsLoading } = useQuery<CompanySettings>({
    queryKey: ["settings"],
    queryFn: async () => (await apiClient.get("/settings")).data,
  });
  const loading = branchesLoading || departmentsLoading || shiftsLoading || employeesLoading || settingsLoading;

  const [step, setStep] = useState<Step>("select");
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [ignoredHeaders, setIgnoredHeaders] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [added, setAdded] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopRequested = useRef(false);

  const context = useMemo<ImportContext>(() => ({
    branches: branches || [],
    departments: departments || [],
    shifts: shifts || [],
    existing: (employees || []).map((e) => ({ name: e.name, phone: e.phone, deviceUserId: e.deviceUserId })),
    allowMultipleBranches: !!settings?.branchSettings?.allowMultipleBranches,
    defaultShiftId: settings?.attendance?.defaultShiftId ?? null,
    workDays: settings?.attendance?.workDays ?? null,
    companyRequireLocation: !!settings?.attendance?.requireLocation,
    companyRemotePunch: !!settings?.attendance?.remotePunch,
    salaryTemplates: settings?.salaryTemplates || [],
    today: toISTDateKey(new Date()),
  }), [branches, departments, shifts, employees, settings]);

  const ready = rows.filter((r) => r.status === "ready");
  const needFixing = rows.filter((r) => r.status === "error");
  const already = rows.filter((r) => r.status === "exists");
  const seatsLeft = seats?.limit != null ? Math.max(0, seats.limit - seats.used) : null;

  const reset = () => {
    setStep("select");
    setFileError("");
    setFileName("");
    setRows([]);
    setIgnoredHeaders([]);
    setProgress({ done: 0, total: 0 });
    setAdded(0);
    setFailures([]);
  };

  const close = (next: boolean) => {
    if (step === "importing") return; // finish or stop first
    onOpenChange(next);
    if (!next) reset();
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXlsx();
    const headers = IMPORT_COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header));
    // The sample uses this company's real names so the spelling to copy is on screen.
    const sample = IMPORT_COLUMNS.map((c) => {
      if (c.key === "branch") return context.branches[0]?.branchName ?? "";
      if (c.key === "department") return context.departments[0]?.name ?? "";
      if (c.key === "shift") return context.shifts.find((s) => s._id === context.defaultShiftId)?.name ?? context.shifts[0]?.name ?? "";
      if (c.key === "comp:basic") return "50%";
      if (c.key === "comp:hra") return "40%";
      return c.sample;
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));

    const help = XLSX.utils.aoa_to_sheet([
      ["Column", "Needed?", "Form section", "What to enter"],
      ...IMPORT_COLUMNS.map((c) => [c.header, c.required ? "Required" : "Optional", c.section, c.help]),
      [],
      ["Row 2 of the Employees sheet is an example. Replace it with your own employees, one per row."],
      [`At most ${MAX_IMPORT_ROWS} employees per file. Columns may be in any order; leave out any optional column you do not need.`],
    ]);
    help["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 110 }];

    const longest = Math.max(context.branches.length, context.departments.length, context.shifts.length, context.salaryTemplates?.length || 0, 2);
    const lists = XLSX.utils.aoa_to_sheet([
      ["Branches", "Departments", "Shifts", "Salary templates", "Gender", "Pay type"],
      ...Array.from({ length: longest }, (_, i) => [
        context.branches[i]?.branchName ?? "",
        context.departments[i]?.name ?? "",
        context.shifts[i] ? `${context.shifts[i].name}${context.shifts[i]._id === context.defaultShiftId ? " (default)" : ""}` : "",
        context.salaryTemplates?.[i]?.name ?? "",
        ["Male", "Female"][i] ?? "",
        ["Monthly", "Daily", "Hourly"][i] ?? "",
      ]),
    ]);
    lists["!cols"] = Array(6).fill({ wch: 24 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Employees");
    XLSX.utils.book_append_sheet(wb, help, "How to fill");
    XLSX.utils.book_append_sheet(wb, lists, "Your lists");
    XLSX.writeFile(wb, "employees-import-template.xlsx");
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      // The template's own sheet if present, so the help sheets are never read as data.
      const sheetName = wb.SheetNames.includes("Employees") ? "Employees" : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const shown = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const result = parseEmployeeRows(raw, shown, context);
      if (!result.ok) {
        setFileError(result.error);
        setStep("error");
        return;
      }
      // Rows that need attention first; within each group, sheet order.
      const order = { error: 0, ready: 1, exists: 2 } as const;
      setRows([...result.rows].sort((a, b) => order[a.status] - order[b.status] || a.row - b.row));
      setIgnoredHeaders(result.ignoredHeaders);
      setStep("preview");
    } catch {
      setFileError("This file could not be read. Please use an .xlsx, .xls or .csv file.");
      setStep("error");
    }
  };

  const runImport = async () => {
    const queue = [...ready].sort((a, b) => a.row - b.row);
    stopRequested.current = false;
    setStep("importing");
    setProgress({ done: 0, total: queue.length });
    let ok = 0;
    const failed: Failure[] = [];
    const notAttempted = (from: number, reason: string) => {
      for (const r of queue.slice(from)) failed.push({ row: r.row, name: r.name, reason, source: r.source });
    };

    // One at a time, through the same endpoint as the Add Employee form, so
    // every server check (duplicate phone across all companies, biometric ID,
    // the plan's seat limit) applies to each row exactly as it would by hand.
    for (let i = 0; i < queue.length; i++) {
      if (stopRequested.current) {
        notAttempted(i, "Not added: the import was stopped.");
        break;
      }
      const r = queue[i];
      try {
        await postEmployee(r.payload!);
        ok++;
      } catch (err) {
        const res = (err as { response?: { status?: number; data?: { limitReached?: boolean } } }).response;
        if (!res) {
          // The request may have reached the server before the connection
          // dropped. Re-importing the same file is safe: anyone who was
          // saved shows as "already an employee".
          failed.push({ row: r.row, name: r.name, reason: "Connection lost while saving. This one may or may not have been added; check the list.", source: r.source });
          notAttempted(i + 1, "Not added: the connection was lost.");
          break;
        }
        if (res.data?.limitReached) {
          notAttempted(i, "Not added: your plan's employee limit was reached.");
          break;
        }
        if (res.status === 401 || res.status === 403) {
          notAttempted(i, requestErrorMessage(err, "") || "Not added: you were signed out.");
          break;
        }
        failed.push({ row: r.row, name: r.name, reason: requestErrorMessage(err, "Could not be saved.") || "Could not be saved.", source: r.source });
      }
      setProgress({ done: i + 1, total: queue.length });
    }

    setAdded(ok);
    setFailures(failed.sort((a, b) => a.row - b.row));
    if (ok > 0) refreshEmployeeViews(queryClient);
    setStep("done");
  };

  // Everything that did not go in, with the reason, as a file the admin can
  // fix and upload again.
  const downloadNotAdded = async () => {
    const XLSX = await loadXlsx();
    const fromPreview = needFixing.map((r) => ({ row: r.row, source: r.source, reason: r.problems.join(" ") }));
    const fromImport = failures.map((f) => ({ row: f.row, source: f.source, reason: f.reason }));
    const all = [...fromPreview, ...fromImport].sort((a, b) => a.row - b.row);
    const sheet = XLSX.utils.json_to_sheet(all.map((x) => ({ PROBLEM: x.reason, ...x.source })), { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Employees");
    XLSX.writeFile(wb, "employees-not-added.xlsx");
  };

  const notAddedCount = needFixing.length + failures.length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl rounded-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-[16px] font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Import Employees
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Add many employees at once from an Excel or CSV file. Every field on the Add Employee form has a column.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === "select" && (
            <>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                <p className="text-[12px] font-bold text-foreground/80">1. Download the template</p>
                <p className="text-[12px] text-muted-foreground">
                  Only <b>NAME</b>, <b>PHONE</b> and <b>SALARY</b> are needed. Branch, department and shift can be
                  left blank if you have only one (or a default shift). Any other blank cell gets what the Add
                  Employee form starts with. The "How to fill" sheet explains each column, and "Your lists" has
                  your branch, department, shift and salary template names to copy.
                </p>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:underline min-h-10 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> Download template (.xlsx)
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && !loading) handleFile(file);
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
                  <p className="text-[13px] font-bold text-foreground/80">2. Drop your filled-in file here</p>
                  <p className="text-[11px] text-muted-foreground">.xlsx, .xls or .csv, up to {MAX_IMPORT_ROWS} employees. Nothing is saved until you confirm.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-semibold h-10"
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Loading your company…</> : "Choose file"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </>
          )}

          {step === "error" && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[13px] font-bold text-destructive">{fileName || "This file"} cannot be imported</p>
                <p className="text-[12px] text-destructive/80">{fileError}</p>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SummaryTile tone="success" count={ready.length} label="ready to add" />
                <SummaryTile tone="destructive" count={needFixing.length} label="need fixing (will be skipped)" />
                <SummaryTile tone="muted" count={already.length} label="already employees (skipped)" />
              </div>

              {seatsLeft !== null && ready.length > seatsLeft && (
                <Notice tone="warning">
                  Your plan has room for {seatsLeft} more employee{seatsLeft === 1 ? "" : "s"} ({seats!.used} of {seats!.limit} used,
                  inactive included). Only the first {seatsLeft} will be added; ask your provider to upgrade the plan for the rest.
                </Notice>
              )}
              {ignoredHeaders.length > 0 && (
                <Notice tone="info">
                  These columns were not recognised and will be ignored: {ignoredHeaders.join(", ")}. Check the spelling against the template if one of them should have been read.
                </Notice>
              )}

              <div className="rounded-xl border border-border/40 overflow-x-auto max-h-[45vh]">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/30 text-muted-foreground font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Phone</th>
                      <th className="px-3 py-2 text-left">Branch</th>
                      <th className="px-3 py-2 text-left">Department</th>
                      <th className="px-3 py-2 text-left">Shift</th>
                      <th className="px-3 py-2 text-right">Salary</th>
                      <th className="px-3 py-2 text-left min-w-[220px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {rows.map((r) => (
                      <tr key={r.row} className={r.status === "error" ? "bg-destructive/3" : undefined}>
                        <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-2 font-semibold text-foreground/80">{r.name || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.phone || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.branch || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.department || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.shift || "—"}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{r.salary != null ? `₹${r.salary.toLocaleString("en-IN")}` : "—"}</td>
                        <td className={cn("px-3 py-2", STATUS_STYLE[r.status])}>
                          {r.status === "ready" ? (
                            <span className="font-semibold">Ready</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {r.problems.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {needFixing.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  You can add the ready rows now and fix the rest later, or fix the file and upload it again. Uploading the
                  same file again is safe: anyone already added shows as "already an employee".
                </p>
              )}
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
              <p className="text-[13px] font-semibold text-foreground/80">
                Adding {progress.done} of {progress.total}…
              </p>
              <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Keep this window open until it finishes.</p>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-3">
              <div className={cn("rounded-xl border p-4 flex items-start gap-3", added === 0 ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5")}>
                {added === 0
                  ? <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  : <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />}
                <div className="space-y-1 min-w-0">
                  <p className={cn("text-[13px] font-bold", added === 0 ? "text-destructive" : "text-success")}>
                    Added {added} employee{added === 1 ? "" : "s"}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {[
                      needFixing.length ? `${needFixing.length} skipped because they need fixing` : "",
                      already.length ? `${already.length} were already employees` : "",
                      failures.length ? `${failures.length} could not be saved` : "",
                    ].filter(Boolean).join(" · ") || "Every row in the file was added."}
                  </p>
                </div>
              </div>
              {failures.length > 0 && (
                <div className="rounded-xl border border-border/40 p-4 space-y-1">
                  <p className="text-[12px] font-bold text-foreground/80">Not saved:</p>
                  <ul className="text-[12px] text-foreground space-y-0.5 max-h-40 overflow-y-auto">
                    {failures.slice(0, 30).map((f) => (
                      <li key={f.row}>Row {f.row}{f.name ? ` (${f.name})` : ""}: {f.reason}</li>
                    ))}
                    {failures.length > 30 && <li>…and {failures.length - 30} more (all of them are in the download).</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 bg-muted/20 flex-row flex-wrap justify-end">
          {step === "error" && (
            <Button type="button" variant="outline" className="rounded-xl h-10" onClick={reset}>Try another file</Button>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="ghost" className="rounded-xl h-10" onClick={reset}>Choose another file</Button>
              {needFixing.length > 0 && (
                <Button type="button" variant="outline" className="rounded-xl h-10" onClick={downloadNotAdded}>
                  <Download className="h-4 w-4 mr-1.5" /> Rows to fix
                </Button>
              )}
              <ActionButton
                variant="add"
                showLabel
                icon={UploadCloud}
                disabled={ready.length === 0 || seatsLeft === 0}
                label={ready.length === 0 ? "Nothing to add" : `Add ${ready.length} Employee${ready.length === 1 ? "" : "s"}`}
                onClick={runImport}
              />
            </>
          )}
          {step === "importing" && (
            <Button type="button" variant="outline" className="rounded-xl h-10" onClick={() => { stopRequested.current = true; }}>
              Stop after this one
            </Button>
          )}
          {step === "done" && notAddedCount > 0 && (
            <Button type="button" variant="outline" className="rounded-xl h-10" onClick={downloadNotAdded}>
              <Download className="h-4 w-4 mr-1.5" /> Download {notAddedCount} row{notAddedCount === 1 ? "" : "s"} not added
            </Button>
          )}
          {(step === "select" || step === "done" || step === "error") && (
            <Button type="button" variant="ghost" className="rounded-xl h-10" onClick={() => close(false)}>
              {step === "done" ? "Close" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ tone, count, label }: { tone: "success" | "destructive" | "muted"; count: number; label: string }) {
  const styles = {
    success: "border-success/30 bg-success/5 text-success",
    destructive: "border-destructive/30 bg-destructive/5 text-destructive",
    muted: "border-border/60 bg-muted/20 text-muted-foreground",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3", styles)}>
      <p className="text-[20px] font-black leading-none">{count}</p>
      <p className="text-[11px] font-semibold mt-1">{label}</p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "info"; children: ReactNode }) {
  return (
    <div className={cn(
      "rounded-xl border p-3 flex items-start gap-2 text-[12px]",
      tone === "warning" ? "border-warning/40 bg-warning/10 text-warning-foreground" : "border-border/60 bg-muted/20 text-muted-foreground"
    )}>
      {tone === "warning" ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <Info className="h-4 w-4 shrink-0 mt-0.5" />}
      <p>{children}</p>
    </div>
  );
}
