import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ScanFace, Power, Trash2, ExternalLink, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { requestErrorMessage } from "@/services/request-error";
import {
  deleteLensFace,
  getLensFaces,
  getLensKiosks,
  revokeLensKiosk,
  type LensFace,
  type LensKiosk,
} from "@/services/lens-service";

const ago = (iso?: string | null) => {
  if (!iso) return "never";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
};

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

/**
 * Face kiosks (BOTLens): the kiosks set up for this company and the faces
 * registered on them. A kiosk is set up by signing in as admin on the kiosk
 * itself; here it can only be switched off. A face is registered on a kiosk;
 * here it can be removed.
 */
export function FaceKiosksCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<LensKiosk | null>(null);
  const [removing, setRemoving] = useState<LensFace | null>(null);
  const kioskUrl = (import.meta.env.VITE_BOTLENS_URL as string | undefined) || "";

  const kiosks = useQuery({ queryKey: ["lens-kiosks"], queryFn: getLensKiosks, refetchInterval: 60000 });
  const faces = useQuery({ queryKey: ["lens-faces"], queryFn: getLensFaces });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeLensKiosk(id),
    onSuccess: () => {
      toast.success("Kiosk switched off");
      setRevoking(null);
      queryClient.invalidateQueries({ queryKey: ["lens-kiosks"] });
    },
    onError: (e) => toast.error(requestErrorMessage(e, "Could not switch the kiosk off.") || "Could not switch the kiosk off."),
  });

  const remove = useMutation({
    mutationFn: (employeeId: string) => deleteLensFace(employeeId),
    onSuccess: () => {
      toast.success("Face removed");
      setRemoving(null);
      queryClient.invalidateQueries({ queryKey: ["lens-faces"] });
    },
    onError: (e) => toast.error(requestErrorMessage(e, "Could not remove the face.") || "Could not remove the face."),
  });

  const activeKiosks = (kiosks.data || []).filter((k) => !k.revokedAt);
  const offKiosks = (kiosks.data || []).filter((k) => k.revokedAt);
  const faceRows = faces.data || [];

  return (
    <Card className="border-none shadow-sm bg-card rounded-2xl overflow-hidden">
      <CardHeader className="border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ScanFace className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Face kiosks</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Tablets that punch by recognising faces. Each sighting is read like a fingerprint tap.
              </p>
            </div>
          </div>
          {kioskUrl && (
            <Button asChild variant="outline" className="h-10 rounded-xl font-bold">
              <a href={kioskUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open kiosk
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {kiosks.isLoading || faces.isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : kiosks.isError ? (
          <p className="px-6 py-8 text-center text-[13px] text-muted-foreground">
            {requestErrorMessage(kiosks.error, "Could not load the face kiosks.") || "Could not load the face kiosks."}
          </p>
        ) : (
          <>
            {activeKiosks.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-bold">No face kiosk set up</p>
                <p className="text-[12px] text-muted-foreground mt-1 max-w-md mx-auto">
                  Open BOTLens on the tablet at your entrance and sign in with the admin phone number. The tablet
                  gets its own kiosk key; it cannot open this admin panel.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {activeKiosks.map((k) => (
                  <div key={k._id} className="flex items-center gap-3 px-6 py-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${k.lastSeenAt && Date.now() - new Date(k.lastSeenAt).getTime() < 15 * 60000 ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold truncate">{k.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Last used {ago(k.lastSeenAt)} · set up {day(k.createdAt)}
                        {k.createdBy ? ` by ${k.createdBy}` : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <Button variant="outline" className="h-10 rounded-xl text-destructive border-destructive/40" onClick={() => setRevoking(k)}>
                        <Power className="h-3.5 w-3.5 mr-1.5" />
                        Switch off
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {offKiosks.length > 0 && (
              <p className="px-6 py-2 text-[11px] text-muted-foreground border-t border-border/30">
                Switched off: {offKiosks.map((k) => k.name).join(", ")}
              </p>
            )}

            <div className="border-t border-border/40 px-6 py-3">
              <p className="text-[12px] font-bold">
                Registered faces <span className="text-muted-foreground font-normal">({faceRows.length})</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Faces are added on a kiosk with the BOTLens email and password. Removing one here stops every kiosk
                recognising that person.
              </p>
            </div>
            {faceRows.length === 0 ? (
              <p className="px-6 pb-6 text-[12px] text-muted-foreground">No faces registered yet.</p>
            ) : (
              <div className="divide-y divide-border/30">
                {faceRows.map((f) => (
                  <div key={f.employeeId} className="flex items-center gap-3 px-6 py-2.5">
                    {f.thumbnailUrl ? (
                      <img src={f.thumbnailUrl} alt="" className="h-9 w-9 rounded-full object-cover bg-muted shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">
                        {f.name}
                        {!f.active && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(switched off, not recognised)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Registered {day(f.registeredAt)}
                        {f.kiosk ? ` on ${f.kiosk}` : ""}
                        {f.updatedAt !== f.registeredAt ? ` · rescanned ${day(f.updatedAt)}` : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive" aria-label={`Remove ${f.name}'s face`} onClick={() => setRemoving(f)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch off {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The kiosk stops recording faces within a minute. Punches it already recorded are kept. To use it again,
              sign in as admin on the kiosk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={revoke.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (revoking) revoke.mutate(revoking._id);
              }}
            >
              {revoke.isPending ? "Switching off..." : "Switch off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}'s face?</AlertDialogTitle>
            <AlertDialogDescription>
              No kiosk will recognise them until their face is scanned again on a kiosk. Their attendance is not
              changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removing) remove.mutate(removing.employeeId);
              }}
            >
              {remove.isPending ? "Removing..." : "Remove face"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
