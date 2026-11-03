import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Trash2, Edit2, MoreHorizontal, Shield, ShieldCheck, UserX, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import type { PagePermission } from "@/lib/auth";
import { requestErrorMessage } from "@/services/request-error";
import { NoAccessNotice, PanelLoadError } from "@/components/settings/panel-notices";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

// Every sidebar page a sub-admin can be given, in sidebar order. Each key must
// equal the route path without its "/" (that is how app-sidebar looks it up)
// and the backend checkPermission() key, and match ALL_PAGES in
// user_controller.js. "biometric-devices" was missing, so it could never be
// granted. Users and Plan & Billing are owner-only and never listed.
const ALL_PAGES = [
  { key: "dashboard",         label: "Dashboard" },
  { key: "branches",          label: "Branches" },
  { key: "departments",       label: "Departments" },
  { key: "employees",         label: "Employees" },
  { key: "leaves",            label: "Leave Management" },
  { key: "attendance",        label: "Attendance Dashboard" },
  { key: "tickets",           label: "Helpdesk Tickets" },
  { key: "salary",            label: "Salary" },
  { key: "advance-salary",    label: "Advance Salary & Loan" },
  { key: "leads",             label: "Lead Management" },
  { key: "festivals",         label: "Festivals & Holidays" },
  { key: "announcements",     label: "Notice Board" },
  { key: "tracking",          label: "Tracking" },
  { key: "leave-types",       label: "Leave Types" },
  { key: "shifts",            label: "Shift Management" },
  { key: "biometric-devices", label: "Biometric Device" },
  { key: "assets",            label: "Assets Management" },
  { key: "expenses",          label: "Expense Management" },
  { key: "settings",          label: "Settings" },
];

const DEFAULT_ALLOWED = new Set(["dashboard", "employees", "leaves", "attendance", "salary", "advance-salary", "expenses"]);

type Perms = Record<string, PagePermission>;
type SubAdmin = {
  _id: string;
  name: string;
  phone: string;
  isActive?: boolean;
  permissions?: Record<string, Partial<PagePermission>> | null;
};

function buildDefaultPerms(): Perms {
  return ALL_PAGES.reduce<Perms>((acc, { key }) => {
    const on = DEFAULT_ALLOWED.has(key);
    acc[key] = { view: on, create: false, edit: false, delete: false };
    return acc;
  }, {});
}

function mergePerms(saved?: Record<string, any> | null): Perms {
  const defaults = buildDefaultPerms();
  if (!saved) return defaults;
  return ALL_PAGES.reduce<Perms>((acc, { key }) => {
    // A page the saved map does not mention is OFF, not the default: the
    // server refuses it, so showing it ticked would misstate their access.
    const p = saved[key] || {};
    const view = p.view === true;
    acc[key] = { view, create: view && p.create === true, edit: view && p.edit === true, delete: view && p.delete === true };
    return acc;
  }, {});
}

const initials = (name: string) =>
  name?.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function UsersPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const isOwner = session?.role === "admin";
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SubAdmin | null>(null);
  const [deleting, setDeleting] = useState<SubAdmin | null>(null);
  const [toggling, setToggling] = useState<SubAdmin | null>(null);

  const { data: subadmins = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/admin-users");
      return (Array.isArray(data) ? data : []) as SubAdmin[];
    },
    enabled: isOwner,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/admin-users/${id}`),
    onSuccess: () => {
      toast.success("Sub-admin removed");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleting(null);
    },
    onError: (e) => {
      const m = requestErrorMessage(e, "Could not remove the sub-admin. Please try again.");
      if (m) toast.error(m);
    },
  });

  const activeMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.put(`/users/admin-users/${id}`, { isActive }),
    onSuccess: (_d, v) => {
      toast.success(v.isActive ? "Sub-admin can sign in again" : "Sub-admin deactivated. They are signed out now.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setToggling(null);
    },
    onError: (e) => {
      const m = requestErrorMessage(e, "Could not change the status. Please try again.");
      if (m) toast.error(m);
    },
  });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Give team members access to chosen pages of this panel
        </p>
      </div>
      {isOwner && (
        <Button className="h-10" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New sub-admin
        </Button>
      )}
    </div>
  );

  if (session && !isOwner) {
    return (
      <div className="space-y-6">
        {header}
        <NoAccessNotice
          title="Only the account owner can manage users"
          message="Ask your company admin if you need access to another page."
        />
      </div>
    );
  }

  const rowMenu = (u: SubAdmin) => {
    const active = u.isActive !== false;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${u.name}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-10" onClick={() => setEditing(u)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit name and pages
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onClick={() => setToggling(u)}>
            {active ? <UserX className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
            {active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-10 text-destructive focus:text-destructive"
            onClick={() => setDeleting(u)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const accessText = (u: SubAdmin) => {
    const n = Object.values(mergePerms(u.permissions)).filter((p) => p.view).length;
    return `${n} of ${ALL_PAGES.length} pages`;
  };

  return (
    <div className="space-y-6">
      {header}

      {isError ? (
        <PanelLoadError
          what="the users"
          message={requestErrorMessage(error, "Something went wrong on our side. Please try again in a minute.")}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : (
        <>
          {/* Phones: one card per person, actions within thumb reach. */}
          <div className="space-y-3 sm:hidden">
            {session && (
              <div className="border rounded-xl bg-card p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {initials(session.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{session.name}</div>
                  <div className="text-xs text-muted-foreground">{session.phone} · Owner, full access</div>
                </div>
              </div>
            )}
            {isLoading ? (
              [1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : subadmins.length === 0 ? (
              <div className="border rounded-xl bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                No sub-admins yet. Add one to share part of the work.
              </div>
            ) : (
              subadmins.map((u) => (
                <div key={u._id} className="border rounded-xl bg-card p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.phone} · {accessText(u)}</div>
                    <div className="mt-1"><StatusPill active={u.isActive !== false} /></div>
                  </div>
                  {rowMenu(u)}
                </div>
              ))
            )}
          </div>

          <div className="hidden sm:block border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Pages</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 w-14"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {session && (
                  <tr className="border-b bg-primary/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {initials(session.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-[13px]">{session.name}</div>
                          {session.email && <div className="text-[11px] text-muted-foreground">{session.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px]">{session.phone}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                        <ShieldCheck className="h-3 w-3" /> Owner
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground font-medium">Full access</td>
                    <td className="px-4 py-3"><StatusPill active /></td>
                    <td className="px-4 py-3" />
                  </tr>
                )}

                {isLoading ? (
                  [1, 2].map((i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-5 w-2/3 rounded" />
                      </td>
                    </tr>
                  ))
                ) : subadmins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No sub-admins yet. Add one to share part of the work.
                    </td>
                  </tr>
                ) : (
                  subadmins.map((u) => (
                    <tr key={u._id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                            {initials(u.name)}
                          </div>
                          <div className="font-medium text-[13px]">{u.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px]">{u.phone}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                          <Shield className="h-3 w-3" /> Sub-admin
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">{accessText(u)}</td>
                      <td className="px-4 py-3"><StatusPill active={u.isActive !== false} /></td>
                      <td className="px-4 py-2">{rowMenu(u)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCreate && (
        <UserFormDialog
          onClose={() => setShowCreate(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setShowCreate(false); }}
        />
      )}

      {editing && (
        <UserFormDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setEditing(null); }}
        />
      )}

      <AlertDialog open={!!toggling} onOpenChange={(open) => !open && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.isActive !== false ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.isActive !== false
                ? "They are signed out straight away and cannot sign in until you activate them again. Their page access is kept."
                : "They can sign in again with their phone number and see the same pages as before."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={activeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toggling) activeMut.mutate({ id: toggling._id, isActive: toggling.isActive === false });
              }}
            >
              {activeMut.isPending ? "Saving…" : toggling?.isActive !== false ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this panel for good and their phone number is freed. To stop access for a while instead, choose Deactivate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-destructive hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMut.mutate(deleting._id);
              }}
            >
              {deleteMut.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Create / Edit dialog ───────────────────────────────────────────────────

function UserFormDialog({
  user,
  onClose,
  onSuccess,
}: {
  user?: SubAdmin;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [perms, setPerms] = useState<Perms>(() => (user ? mergePerms(user.permissions) : buildDefaultPerms()));
  const [touched, setTouched] = useState(false);

  const mut = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? apiClient.put(`/users/admin-users/${user!._id}`, { name: payload.name, permissions: payload.permissions })
        : apiClient.post("/users/admin-users", payload),
    onSuccess: () => {
      toast.success(isEdit ? "Saved. Their menu shows the new pages the next time they sign in." : "Sub-admin added. They can sign in with this phone number.");
      onSuccess();
    },
    onError: (e) => {
      const m = requestErrorMessage(e, "Could not save. Please try again.");
      if (m) toast.error(m);
    },
  });

  const phoneDigits = phone.replace(/\D/g, "");
  const nameError = !name.trim() ? "Enter a name." : null;
  const phoneError = !isEdit && phoneDigits.length !== 10 ? "Enter a 10-digit mobile number." : null;
  const isValid = !nameError && !phoneError;
  const accessCount = Object.values(perms).filter((p) => p.view).length;

  const toggleAction = (key: string, action: keyof PagePermission) => {
    setPerms((prev) => ({ ...prev, [key]: { ...prev[key], [action]: !prev[key][action] } }));
  };

  // Ticking View alone gives view only; unticking it takes every right away,
  // since the server drops create/edit/delete without view.
  const setView = (key: string, enabled: boolean) => {
    setPerms((prev) => ({
      ...prev,
      [key]: enabled ? { ...prev[key], view: true } : { view: false, create: false, edit: false, delete: false },
    }));
  };

  const selectAll = (enabled: boolean) => {
    setPerms(
      ALL_PAGES.reduce<Perms>((acc, { key }) => {
        acc[key] = { view: enabled, create: enabled, edit: enabled, delete: enabled };
        return acc;
      }, {}),
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">
            {isEdit ? `Edit ${user!.name}` : "New sub-admin"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            A sub-admin signs in with their phone number and sees only the pages you tick.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subadmin-name" className="text-xs">Name</Label>
              <Input
                id="subadmin-name"
                className="h-10 text-sm"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Full name"
              />
              {touched && nameError && <p className="text-[11px] text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subadmin-phone" className="text-xs">Phone (used to sign in)</Label>
              <Input
                id="subadmin-phone"
                className="h-10 text-sm"
                value={phone}
                inputMode="numeric"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onBlur={() => setTouched(true)}
                placeholder="10-digit mobile number"
                disabled={isEdit}
              />
              {isEdit ? (
                <p className="text-[11px] text-muted-foreground">The phone number cannot be changed. Remove and add again for a new number.</p>
              ) : touched && phoneError ? (
                <p className="text-[11px] text-destructive">{phoneError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Must not already belong to an employee or another admin.</p>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Pages they can use</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {accessCount} of {ALL_PAGES.length} pages. Users and Plan & Billing stay with you.
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <button type="button" onClick={() => selectAll(true)} className="h-10 px-2 text-primary font-medium hover:underline">
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={() => selectAll(false)} className="h-10 px-2 text-muted-foreground font-medium hover:underline">
                  Clear all
                </button>
              </div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Page</th>
                    {["View", "Add", "Edit", "Delete"].map((h) => (
                      <th key={h} className="px-0 py-2.5 font-medium text-muted-foreground text-center w-11 sm:w-16">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAGES.map(({ key, label }) => {
                    const p = perms[key];
                    return (
                      <tr key={key} className={`border-b last:border-0 ${p.view ? "" : "text-muted-foreground"}`}>
                        <td className="px-3 py-1 font-medium">{label}</td>
                        {(["view", "create", "edit", "delete"] as const).map((action) => {
                          const disabled = action !== "view" && !p.view;
                          return (
                            <td key={action} className="p-0 text-center">
                              <label
                                className={`flex h-10 w-full items-center justify-center ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                              >
                                <Checkbox
                                  checked={p[action]}
                                  aria-label={`${label}: ${action === "create" ? "add" : action}`}
                                  onCheckedChange={(v) => (action === "view" ? setView(key, !!v) : toggleAction(key, action))}
                                  disabled={disabled}
                                  className="h-5 w-5"
                                />
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 sm:px-6 py-4 border-t">
          <Button variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
          <Button
            className="h-10"
            disabled={mut.isPending || !isValid}
            onClick={() => mut.mutate({ name: name.trim(), phone: phoneDigits, permissions: perms })}
          >
            {mut.isPending ? "Saving…" : isEdit ? "Save changes" : "Add sub-admin"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
