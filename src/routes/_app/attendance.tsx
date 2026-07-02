import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { GridCard } from "@/components/shared/grid-card";
import { Check, X, Clock as ClockIcon, MessageSquare, Pencil, CalendarDays, Ticket, Search, MapPin, MoreVertical, Download, Plus } from "lucide-react";
import { ActionButton } from "@/components/shared/action-button";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FormInput } from "@/components/shared/form-input";
import { FormSelect } from "@/components/shared/form-select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAttendanceService, type AttendanceRecord } from "@/services/attendance-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";

const attendanceSearchSchema = z.object({
  status: z.string().optional(),
});

export const Route = createFileRoute("/_app/attendance")({
  validateSearch: (search) => attendanceSearchSchema.parse(search),
  component: AttendancePage,
});

function AttendancePage() {
  const { records: list, isLoading, updateAttendance } = useAttendanceService();
  const { status } = Route.useSearch();
  const [tab, setTab] = useState<string>(status || "all");
  const [search, setSearch] = useState("");
  const [remarkOpenId, setRemarkOpenId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canEdit = can("attendance", "edit");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  useEffect(() => {
    if (status) {
      setTab(status);
    }
  }, [status]);

  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyForm, setModifyForm] = useState({
    id: "",
    punchIn: "",
    punchOut: "",
    lunchInTime: "",
    lunchOutTime: "",
    status: "present" as any
  });

  const [dateFilter, setDateFilter] = useState<string>("");

  // Punched in but not yet punched out — shown as "On Duty" instead of the
  // backend's raw status (which is assigned at punch-in and doesn't reflect
  // whether the shift is still in progress).
  const getDisplayStatus = (t: AttendanceRecord) => (t.punchIn && !t.punchOut ? "on-duty" : t.status);

  const filtered = useMemo(() => {
    return list.filter((t) => {
      const name = t.employeeId?.name || "";
      const displayStatus = getDisplayStatus(t);
      const matchesTab = tab === "all" || displayStatus === tab || t.status === tab;
      const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchesDate = !dateFilter || t.date?.slice(0, 10) === dateFilter;
      return matchesTab && matchesSearch && matchesDate;
    });
  }, [list, tab, search, dateFilter]);

  const saveRemark = async () => {
    if (!remarkOpenId) return;
    try {
      await updateAttendance({ id: remarkOpenId, data: { remarks: remarkText } });
      setRemarkOpenId(null);
      setRemarkText("");
    } catch (err) { }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const todayList = list.filter((t) => t.date?.slice(0, 10) === todayStr);
  const counts = {
    all: list.length,
    present: todayList.filter((t) => t.status === "present" || t.status === "late" || t.status === "wfh").length,
    late: todayList.filter((t) => t.status === "late").length,
    absent: todayList.filter((t) => t.status === "absent").length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance Reports" description="Monitor daily punch logs and modify login times." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Reports"
        description="Monitor daily punch logs and modify login times."
        actions={
          <div className="flex gap-2">
            <ActionButton
              variant="download"
              showLabel
              label="Export Logs"
            />
            {canEdit && (
              <ActionButton
                variant="edit"
                showLabel
                label="Modify Punch"
                onClick={() => setModifyOpen(true)}
              />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Present Today" value={counts.present} icon={Check} accent="success" delay={0} />
        <StatCard label="Late Arrivals" value={counts.late} icon={ClockIcon} accent="warning" delay={0.05} />
        <StatCard label="Total Records" value={counts.all} icon={Ticket} accent="primary" delay={0.1} />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <Select value={tab} onValueChange={setTab}>
            <SelectTrigger className="w-full md:w-[130px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
              <div className={cn("h-2 w-2 rounded-full", tab === 'present' ? "bg-success" : tab === 'late' ? "bg-warning" : tab === 'on-duty' ? "bg-blue-500" : "bg-primary")} />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All Logs</SelectItem>
              <SelectItem value="on-duty">On Duty</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="half-day">Half Day</SelectItem>
            </SelectContent>
          </Select>

          <FormInput
            type="date"
            icon={CalendarDays}
            className="h-10 w-full md:w-[170px] shadow-none"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          {dateFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDateFilter("")}
              className="h-10 px-3 rounded-xl text-[12px] text-muted-foreground hover:text-foreground"
            >
              Clear date
            </Button>
          )}
        </div>

        <FormInput
          placeholder="Search employee..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4"
          >
            {filtered.map((t) => (
              <GridCard
                key={t._id}
                title={t.employeeId?.name || "Unknown"}
                subtitle={new Date(t.date).toLocaleDateString()}
                icon={
                  t.punchInPhoto ? (
                    <img
                      src={t.punchInPhoto}
                      alt={t.employeeId?.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                      {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                    </div>
                  )
                }
                statusNode={
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-[10px] font-bold px-2 py-0 border-transparent rounded-full",
                      getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                        t.status === "present" ? "bg-success/10 text-success" :
                          t.status === "late" ? "bg-warning/15 text-warning-foreground" :
                            "bg-destructive/10 text-destructive"
                    )}
                  >{getDisplayStatus(t) === "on-duty" ? "On Duty" : t.status}</Badge>
                }
                actions={
                  canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setModifyForm({
                          id: t._id,
                          punchIn: t.punchIn ? new Date(t.punchIn).toISOString().slice(0, 16) : "",
                          punchOut: t.punchOut ? new Date(t.punchOut).toISOString().slice(0, 16) : "",
                          lunchInTime: t.lunchInTime ? new Date(t.lunchInTime).toISOString().slice(0, 16) : "",
                          lunchOutTime: t.lunchOutTime ? new Date(t.lunchOutTime).toISOString().slice(0, 16) : "",
                          status: t.status
                        });
                        setModifyOpen(true);
                      }}>Edit Punch</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}>Add Remark</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  ) : undefined
                }
              >
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch In
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.lunchInTime ? new Date(t.lunchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Lunch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.lunchOutTime ? new Date(t.lunchOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter mb-1 flex items-center gap-1">
                      <ClockIcon className="h-2.5 w-2.5" /> Punch Out
                    </p>
                    <p className="text-[12px] font-mono font-bold text-foreground">
                      {t.punchOut ? new Date(t.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground mb-1 line-clamp-1 italic px-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-primary/40" />
                  {typeof t.punchInLocation === 'object'
                    ? `${t.punchInLocation.lat.toFixed(4)}, ${t.punchInLocation.lng.toFixed(4)}`
                    : (t.punchInLocation || "No location data")}
                </div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4"
          >
            <DataTable
              headers={["Employee", "Date", "Punch In", "Lunch In", "Lunch Out", "Punch Out", "Location", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
              emptyMessage={`No logs found.`}
              className="shadow-sm"
            >
              {filtered.map((t) => (
                <DataTableRow key={t._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                        {t.punchInPhoto ? (
                          <img
                            src={t.punchInPhoto}
                            alt={t.employeeId?.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                            {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-[13px] text-foreground leading-tight">{t.employeeId?.name}</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5">{t.employeeId?.phone}</span>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">{new Date(t.date).toLocaleDateString()}</DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchIn ? new Date(t.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.lunchInTime ? new Date(t.lunchInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.lunchOutTime ? new Date(t.lunchOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-mono font-bold text-foreground/80">
                    {t.punchOut ? new Date(t.punchOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-[12px] text-muted-foreground max-w-[150px] truncate italic">
                    {typeof t.punchInLocation === 'object'
                      ? `${t.punchInLocation.lat.toFixed(2)}, ${t.punchInLocation.lng.toFixed(2)}`
                      : (t.punchInLocation || "N/A")}
                  </DataTableCell>
                  <DataTableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-bold px-2 py-0.5 border-transparent",
                        getDisplayStatus(t) === "on-duty" ? "bg-blue-500/10 text-blue-600" :
                          t.status === "present" ? "bg-success/10 text-success" :
                            t.status === "late" ? "bg-warning/15 text-warning-foreground" :
                              "bg-destructive/10 text-destructive"
                      )}
                    >{getDisplayStatus(t) === "on-duty" ? "On Duty" : t.status}</Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end items-center gap-1">
                      {canEdit && (
                      <ActionButton
                        variant="edit"
                        tooltip="Edit Punch"
                        onClick={() => {
                          setModifyForm({
                            id: t._id,
                            punchIn: t.punchIn ? new Date(t.punchIn).toISOString().slice(0, 16) : "",
                            punchOut: t.punchOut ? new Date(t.punchOut).toISOString().slice(0, 16) : "",
                            lunchInTime: t.lunchInTime ? new Date(t.lunchInTime).toISOString().slice(0, 16) : "",
                            lunchOutTime: t.lunchOutTime ? new Date(t.lunchOutTime).toISOString().slice(0, 16) : "",
                            status: t.status
                          });
                          setModifyOpen(true);
                        }}
                      />
                      )}
                      {canEdit && (
                      <ActionButton
                        variant="more"
                        tooltip="Add Remark"
                        icon={MessageSquare}
                        onClick={() => { setRemarkOpenId(t._id); setRemarkText(t.remarks || ""); }}
                      />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remark Dialog */}
      <Dialog open={!!remarkOpenId} onOpenChange={(o) => { if (!o) { setRemarkOpenId(null); setRemarkText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Add admin remark</DialogTitle>
            <DialogDescription className="text-[12px]">This note will be visible to the employee.</DialogDescription>
          </DialogHeader>
          <Textarea value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="Verified with team lead…" rows={4} className="text-[13px]" />
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRemarkOpenId(null); setRemarkText(""); }} className="rounded-xl">Cancel</Button>
            <ActionButton
              variant="add"
              showLabel
              label="Save"
              icon={Check}
              onClick={saveRemark}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify Login Time Dialog */}
      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Modify Punch Time</DialogTitle>
            <DialogDescription className="text-[12px]">Adjust punch in / out and status for this record.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateAttendance({
                id: modifyForm.id,
                data: {
                  punchIn: modifyForm.punchIn,
                  punchOut: modifyForm.punchOut,
                  lunchInTime: modifyForm.lunchInTime,
                  lunchOutTime: modifyForm.lunchOutTime,
                  status: modifyForm.status
                }
              });
              setModifyOpen(false);
            }}
            className="space-y-3"
          >
            <FormInput
              label="Punch In"
              type="datetime-local"
              value={modifyForm.punchIn}
              onChange={(e) => setModifyForm({ ...modifyForm, punchIn: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Punch Out"
              type="datetime-local"
              value={modifyForm.punchOut}
              onChange={(e) => setModifyForm({ ...modifyForm, punchOut: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Lunch In"
              type="datetime-local"
              value={modifyForm.lunchInTime}
              onChange={(e) => setModifyForm({ ...modifyForm, lunchInTime: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormInput
              label="Lunch Out"
              type="datetime-local"
              value={modifyForm.lunchOutTime}
              onChange={(e) => setModifyForm({ ...modifyForm, lunchOutTime: e.target.value })}
              className="h-9"
              containerClassName="space-y-1"
            />
            <FormSelect
              label="Status"
              value={modifyForm.status}
              onValueChange={(v) => setModifyForm({ ...modifyForm, status: v })}
              options={[
                { label: "Present", value: "present" },
                { label: "Late", value: "late" },
                { label: "Half Day", value: "half-day" },
                { label: "Absent", value: "absent" },
              ]}
              containerClassName="space-y-1"
            />
             <DialogFooter className="gap-2 pt-1">
               <Button type="button" size="sm" variant="outline" onClick={() => setModifyOpen(false)} className="rounded-xl">Cancel</Button>
               <ActionButton
                 variant="add"
                 type="submit"
                 showLabel
                 label="Save Changes"
                 icon={Check}
               />
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
