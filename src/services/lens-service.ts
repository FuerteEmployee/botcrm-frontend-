import { apiClient } from "@/lib/api-client";

// Face kiosks (BOTLens) as the admin panel sees them: which kiosks exist and
// who has a face registered. The kiosk itself talks to /api/lens with its own
// key; these are the panel's read and switch-off routes
// (backend routes/lens_routes.js, perm key biometric-devices).

export interface LensKiosk {
  _id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
}

export interface LensFace {
  employeeId: string;
  name: string;
  /** False when the employee has since been switched off: the kiosk no longer matches them. */
  active: boolean;
  thumbnailUrl: string | null;
  registeredAt: string;
  updatedAt: string;
  kiosk: string | null;
}

export async function getLensKiosks() {
  const { data } = await apiClient.get("/lens/admin/kiosks");
  return (Array.isArray(data) ? data : []) as LensKiosk[];
}

/** Switch a kiosk off. Its key stops working at once; an admin can set it up again. */
export async function revokeLensKiosk(id: string) {
  const { data } = await apiClient.delete(`/lens/admin/kiosks/${id}`);
  return data;
}

export async function getLensFaces() {
  const { data } = await apiClient.get("/lens/admin/faces");
  return (Array.isArray(data) ? data : []) as LensFace[];
}

/** Remove someone's registered face. The kiosks stop recognising them. */
export async function deleteLensFace(employeeId: string) {
  const { data } = await apiClient.delete(`/lens/admin/faces/${employeeId}`);
  return data;
}
