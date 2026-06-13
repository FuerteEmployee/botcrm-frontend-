import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus, Trash2, Edit2, MoreHorizontal, Shield, ShieldCheck,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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

const ALL_PAGES = [
  { key: "dashboard",     label: "Dashboard" },
  { key: "branches",      label: "Branches" },
  { key: "departments",   label: "Departments" },
  { key: "employees",     label: "Employees" },
  { key: "leaves",        label: "Leave Management" },
  { key: "attendance",    label: "Attendance" },
  { key: "tickets",       label: "Helpdesk Tickets" },
  { key: "salary",        label: "Salary" },
  { key: "leads",         label: "Lead Management" },
  { key: "festivals",     label: "Festivals & Holidays" },
  { key: "announcements", label: "Notice Board" },
  { key: "tracking",      label: "Tracking" },
  { key: "leave-types",   label: "Leave Types" },
  { key: "shifts",        label: "Shift Management" },
  { key: "assets",        label: "Assets Management" },
  { key: "expenses",      label: "Expense Management" },
  { key: "settings",      label: "Settings" },
];

const DEFAULT_ALLOWED = new Set(["dashboard", "employees", "leaves", "attendance", "salary", "expenses"]);

type Perms = Record<string, PagePermission>;

function buildDefaultPerms(): Perms {
  return ALL_PAGES.reduce<Perms>((acc, { key }) => {
    const on = DEFAULT_ALLOWED.has(key);
    acc[key] = { view: on, create: false, edit: false, delete: false };
    return acc;
  }, {});
}

function mergePerms(saved?: Record<string, any>): Perms {
  const defaults = buildDefaultPerms();
  if (!saved) return defaults;
  return ALL_PAGES.reduce<Perms>((acc, { key }) => {
    acc[key] = { ...defaults[key], ...(saved[key] || {}) };
    return acc;
  }, {});
}

function UsersPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const { data: subadmins = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/admin-users");
      return data as any[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/admin-users/${id}`),
    onSuccess: () => {
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to remove"),
  });

  const initials = (name: string) =>
    name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage admin accounts and sub-admin access
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New User
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Pages access</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {/* Current admin — always first, read-only */}
            {session && (
              <tr className="border-b bg-primary/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {initials(session.name)}
                    </div>
                    <div>
                      <div className="font-semibold text-[13px]">{session.name}</div>
                      <div className="text-[10px] text-muted-foreground">{session.email || ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px]">{session.phone}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                    <ShieldCheck className="h-3 w-3" /> Admin
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-muted-foreground font-medium">Full access</td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">Active</span>
                </td>
                <td className="px-4 py-3" />
              </tr>
            )}

            {/* Subadmin rows */}
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
                  No sub-admins yet. Create one to delegate access.
                </td>
              </tr>
            ) : (
              subadmins.map((u: any) => {
                const perms: Perms = mergePerms(u.permissions);
                const accessCount = Object.values(perms).filter((p) => p.view).length;
                const isActive = u.isActive !== false;
                return (
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700">
                        <Shield className="h-3 w-3" /> Sub-Admin
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {accessCount} of {ALL_PAGES.length} pages
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-md border hover:bg-muted transition-colors">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(u)}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" />
                            Edit permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting({ id: u._id, name: u.name })}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Remove user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <UserFormDialog
          onClose={() => setShowCreate(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setShowCreate(false); }}
        />
      )}

      {/* Edit dialog */}
      {editing && (
        <UserFormDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setEditing(null); }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke their panel access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
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
  user?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [perms, setPerms] = useState<Perms>(() => mergePerms(user?.permissions));

  const mut = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? apiClient.put(`/users/admin-users/${user._id}`, payload)
        : apiClient.post("/users/admin-users", payload),
    onSuccess: () => {
      toast.success(isEdit ? "User updated" : "Sub-admin created");
      onSuccess();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Failed to save"),
  });

  const phoneDigits = phone.replace(/\D/g, "");
  const isValid = name.trim() && (isEdit || phoneDigits.length === 10);
  const accessCount = Object.values(perms).filter((p) => p.view).length;

  const toggleAction = (key: string, action: keyof PagePermission) => {
    setPerms((prev) => ({
      ...prev,
      [key]: { ...prev[key], [action]: !prev[key][action] },
    }));
  };

  const togglePage = (key: string, enabled: boolean) => {
    setPerms((prev) => ({
      ...prev,
      [key]: { view: enabled, create: enabled, edit: enabled, delete: enabled },
    }));
  };

  const selectAll = (enabled: boolean) => {
    setPerms(
      ALL_PAGES.reduce<Perms>((acc, { key }) => {
        acc[key] = { view: enabled, create: enabled, edit: enabled, delete: enabled };
        return acc;
      }, {})
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-sm font-semibold">
            {isEdit ? `Edit — ${user.name}` : "New Sub-Admin"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-8 text-xs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                className="h-8 text-xs"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                disabled={isEdit}
              />
              {isEdit && (
                <p className="text-[10px] text-muted-foreground">Phone cannot be changed after creation</p>
              )}
            </div>
          </div>

          {/* Permission matrix */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Page Permissions</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {accessCount} of {ALL_PAGES.length} pages accessible
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  className="text-primary font-medium hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  className="text-muted-foreground font-medium hover:underline"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Page</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-16">View</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-16">Create</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-16">Edit</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-16">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAGES.map(({ key, label }) => {
                    const p = perms[key];
                    return (
                      <tr
                        key={key}
                        className={`border-b last:border-0 transition-colors ${p.view ? "hover:bg-primary/[0.02]" : "hover:bg-muted/20 opacity-60"}`}
                      >
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={p.view}
                              onCheckedChange={(v) => togglePage(key, !!v)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="font-medium">{label}</span>
                          </label>
                        </td>
                        {(["view", "create", "edit", "delete"] as const).map((action) => (
                          <td key={action} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={p[action]}
                              onCheckedChange={() => {
                                if (action === "view") {
                                  togglePage(key, !p.view);
                                } else {
                                  toggleAction(key, action);
                                }
                              }}
                              disabled={action !== "view" && !p.view}
                              className="h-3.5 w-3.5"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={mut.isPending || !isValid}
            onClick={() =>
              mut.mutate({
                name: name.trim(),
                phone: phoneDigits,
                permissions: perms,
              })
            }
          >
            {mut.isPending ? "Saving…" : isEdit ? "Save changes" : "Create user"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
