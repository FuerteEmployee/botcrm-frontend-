import { useAuth } from "./use-auth";

export type PermAction = "view" | "create" | "edit" | "delete";

/**
 * Permission helper for the admin panel.
 * - Full admins and super admins always have every right.
 * - Sub-admins are gated by the `permissions` map stored on their session.
 *
 * Usage:
 *   const { can, isSubadmin } = usePermission();
 *   if (can("employees", "create")) { ... }
 */
export function usePermission() {
  const { session } = useAuth();
  const isSubadmin = session?.role === "subadmin";
  const perms = session?.permissions || {};

  const can = (page: string, action: PermAction = "view"): boolean => {
    if (!isSubadmin) return true;
    return perms[page]?.[action] === true;
  };

  return { can, isSubadmin, permissions: perms };
}
