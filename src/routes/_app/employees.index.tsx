import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { Plus, Search, Pencil, Trash2, Eye, Filter, LayoutGrid, List, MoreVertical, MoreHorizontal, Phone, Mail, MapPin, Building2, UserCircle2, Calendar, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import { ViewToggle } from "@/components/shared/view-toggle";
import { GridCard } from "@/components/shared/grid-card";
import { FormInput } from "@/components/shared/form-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Pagination } from "@/components/shared/pagination";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Employee, useEmployeeService, type Employee as BackendEmployee } from "@/services/employee-service";
import { useDepartmentService } from "@/services/department-service";
import { useBranchService } from "@/services/branch-service";
import { cn } from "@/lib/utils";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";

const employeesSearchSchema = z.object({
  departmentId: z.string().optional(),
});

export const Route = createFileRoute("/_app/employees/")({
  validateSearch: (search) => employeesSearchSchema.parse(search),
  component: EmployeesPage,
});

const PAGE_SIZE = 10;

function EmployeesPage() {
  const navigate = useNavigate();
  const { departmentId } = Route.useSearch();
  const [hasMounted, setHasMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>(departmentId || "all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  useEffect(() => {
    if (departmentId) {
      setDeptFilter(departmentId);
    }
  }, [departmentId]);
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canCreate = can("employees", "create");
  const canEdit = can("employees", "edit");
  const canDelete = can("employees", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const {
    employees,
    totalPages,
    totalRecords,
    isLoading,
    isFetching,
    deleteEmployee,
    updateEmployee
  } = useEmployeeService({
    page,
    limit: PAGE_SIZE,
    search,
    departmentId: deptFilter,
    status: statusFilter
  });

  const { departments } = useDepartmentService();
  const { branches } = useBranchService();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Server-side filtering is now handled by useEmployeeService parameters
  const pageData = employees;

  if (!hasMounted) return null;

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmployee(deleteId);
      setDeleteId(null);
    } catch (error) { }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      await updateEmployee({
        id,
        data: { status: currentStatus === "active" ? "inactive" : "active" }
      });
    } catch (error) { }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee Directory"
        description={`${totalRecords} total staff members · ${employees.filter((e) => e.status === "active").length} active (current page)`}
        actions={
          canCreate ? (
            <ActionButton
              variant="add"
              showLabel
              label="Add New Employee"
              asChild
            >
              <Link to="/employees/create" />
            </ActionButton>
          ) : null
        }
      />

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-[180px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <Building2 className="h-3.5 w-3.5" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-[130px] h-10 border border-success/20 bg-success/5 text-success hover:bg-success/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
                <div className={cn("h-2 w-2 rounded-full", statusFilter === 'active' ? "bg-success" : statusFilter === 'inactive' ? "bg-muted-foreground" : "bg-primary")} />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <FormInput
          placeholder="Search employees..."
          icon={Search}
          className="h-10 w-full md:w-[260px] shadow-none bg-background"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <AnimatePresence mode="wait">
        {(isLoading || (employees.length === 0 && isFetching)) ? (
          <SkeletonLoader key="loading" type="table" count={PAGE_SIZE} />
        ) : view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col h-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageData.map((e, idx) => (
                <GridCard
                  key={e._id}
                  title={e.name}
                  subtitle={e.phone}
                  icon={
                    e.profileImage ? (
                      <img src={e.profileImage} alt={e.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black uppercase">
                        {e.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </span>
                    )
                  }
                  className="group/card"
                  delay={idx * 0.05}
                  statusNode={
                    <Switch
                      checked={e.status === "active"}
                      onCheckedChange={() => toggleStatus(e._id, e.status)}
                      disabled={!canEdit}
                      className="data-[state=checked]:bg-success scale-75 shadow-sm"
                    />
                  }
                  onView={() => navigate({ to: "/employees/$employeeId", params: { employeeId: e._id } })}
                  onEdit={canEdit ? () => navigate({ to: "/employees/create", search: { employeeId: e._id } }) : undefined}
                  onDelete={canDelete ? () => setDeleteId(e._id) : undefined}
                  metaLeft={{ icon: Building2, label: (e.departmentId as any)?.name || "Not Assigned" }}
                  metaRight={{
                    icon: Calendar,
                    label: `Joined: ${new Date(e.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`
                  }}
                />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalRecords={totalRecords}
            />
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
                <div key="emp" className="w-[200px]">Employee Details</div>,
                "Mobile", "Department", "Branch / Location", "Status", <div key="act" className="text-right">Actions</div>
              ]}
              isEmpty={pageData.length === 0}
              emptyMessage={
                <div className="flex flex-col items-center justify-center text-muted-foreground py-12 gap-2">
                  <UserCircle2 className="h-10 w-10 opacity-20" />
                  <p className="text-[14px] font-bold">No employees found</p>
                  <p className="text-[12px] opacity-60 max-w-[240px] text-center">Try adjusting your filters or search terms to find who you're looking for.</p>
                </div>
              }
              pagination={{
                page,
                totalPages,
                onPageChange: setPage,
                totalRecords: totalRecords
              }}
            >
              {pageData.map((e) => (
                <DataTableRow
                  key={e._id}
                  className="group hover:bg-primary/1.5 transition-colors border-b border-border/30 last:border-0"
                >
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3.5 py-1.5">
                      <Avatar className="h-10 w-10 shrink-0 shadow-sm border border-border/50 ring-2 ring-primary/5 group-hover:scale-105 transition-transform">
                        {e.profileImage ? (
                          <img src={e.profileImage} alt={e.name} className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black">
                            {e.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold text-foreground leading-tight mb-1">{e.name}</div>
                        <div className="flex items-center gap-4">
                          <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 opacity-60" /> {e.email || "emp@bot-hrms.com"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-bold text-foreground/80">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-primary/40" />
                      {e.phone}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className="text-[10px] font-black bg-primary/5 border-primary/20 px-2 py-0.5 text-primary uppercase tracking-wider">
                      {(e.departmentId as any)?.name || "Unassigned"}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell className="text-[13px] font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground/40" />
                      {(e.branchId as any)?.branchName || "Gurugram"}
                      {((e as any).branchIds?.length || 0) > 1 && (
                        <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                          +{(e as any).branchIds.length - 1}
                        </Badge>
                      )}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={e.status === "active"}
                        onCheckedChange={() => toggleStatus(e._id, e.status)}
                        disabled={!canEdit}
                        className="data-[state=checked]:bg-success scale-90"
                      />
                      <span className={cn(
                        "text-[12px] font-bold",
                        e.status === "active" ? "text-success" : "text-muted-foreground"
                      )}>
                        {e.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex items-center justify-end gap-1">
                      <ActionButton
                        variant="view"
                        tooltip="View Profile"
                        asChild
                      >
                        <Link to="/employees/$employeeId" params={{ employeeId: e._id }} />
                      </ActionButton>
                      {canEdit && (
                        <ActionButton
                          variant="edit"
                          tooltip="Edit Details"
                          asChild
                        >
                          <Link to="/employees/create" search={{ employeeId: e._id }} />
                        </ActionButton>
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Employee"
                          onClick={() => setDeleteId(e._id)}
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


      <DeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete employee?"
        description="This will permanently remove the employee from the system and archive their records. This action cannot be reversed."
        cancelText="Keep Employee"
      />
    </div>
  );
}
