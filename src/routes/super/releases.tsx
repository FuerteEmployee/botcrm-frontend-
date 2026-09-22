import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Smartphone, Upload } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super/releases")({
  component: ReleasesPage,
});

/**
 * Publishing the app — both halves of it, in one place.
 *
 * A web bundle ships over the air and installs itself. An APK has to be
 * downloaded and installed by the person holding the phone. They are different
 * artifacts with different reach, and the reason they belong on one screen is
 * that the only question an operator ever has spans both: what is actually
 * running on people's phones, and what is waiting for them.
 *
 * Until now neither had a UI at all — the bundle endpoints existed and were
 * driven by curl, and APKs were delivered by hand.
 */

// Matches nginx's `client_max_body_size 25M` and the multer limit in
// app_release_routes.js. All three have to agree: nginx cuts an oversized
// upload off at the proxy, so the server-side message never arrives and the
// uploader just sees a dead progress bar. Checking here is the only place that
// can explain it. Builds are ~8 MB.
const MAX_APK_BYTES = 25 * 1024 * 1024;

const fmtBytes = (b?: number | null) => (b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : "—");
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

interface ApkRow {
  _id: string;
  versionName: string;
  versionCode: number;
  url: string;
  sizeBytes: number | null;
  mandatory: boolean;
  enabled: boolean;
  channel: "production" | "pilot";
  pilotAdminIds?: { _id: string; name?: string; companyName?: string }[];
  notes?: string;
  createdAt: string;
}

interface BundleRow {
  _id: string;
  version: string;
  channel: "production" | "pilot";
  enabled: boolean;
  sizeBytes: number | null;
  notes?: string;
  createdAt: string;
  pilotAdminIds?: { _id: string; name?: string; companyName?: string }[];
}

function ReleasesPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [pilotIds, setPilotIds] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const { data: apks = [], isLoading: apksLoading } = useQuery<ApkRow[]>({
    queryKey: ["apk-releases"],
    queryFn: async () => (await apiClient.get("/app/apks")).data,
  });

  const { data: bundles = [] } = useQuery<BundleRow[]>({
    queryKey: ["bundle-releases"],
    queryFn: async () => (await apiClient.get("/app/releases")).data,
  });

  const reset = () => {
    setFile(null); setVersionName(""); setVersionCode("");
    setNotes(""); setMandatory(false); setPilotIds(""); setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("apk", file!);
      form.append("versionName", versionName.trim());
      form.append("versionCode", versionCode.trim());
      form.append("notes", notes.trim());
      form.append("mandatory", String(mandatory));
      if (pilotIds.trim()) form.append("pilotAdminIds", pilotIds.trim());

      const { data } = await apiClient.post("/app/apk", form, {
        // A 8 MB upload over a hotel wifi is not instant, and an unmoving
        // button is indistinguishable from a hung one.
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apk-releases"] });
      toast.success("APK published");
      reset();
    },
    onError: (err: any) => {
      setProgress(null);
      toast.error(err.response?.data?.message || "Upload failed");
    },
  });

  const toggleApk = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ApkRow> }) =>
      (await apiClient.put(`/app/apks/${id}`, patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apk-releases"] });
      toast.success("Release updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message || "Could not update release"),
  });

  const toggleBundle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      (await apiClient.put(`/app/releases/${id}`, { enabled })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bundle-releases"] });
      toast.success("Bundle updated");
    },
    onError: (err: any) => toast.error(err.response?.data?.message || "Could not update bundle"),
  });

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".apk")) {
      toast.error("That is not an .apk file");
      return;
    }
    if (f.size > MAX_APK_BYTES) {
      toast.error("That APK is over the 25 MB limit");
      return;
    }
    setFile(f);
    // Best-effort prefill from the conventional BOT-Staging-1.8.apk shape; the
    // filename is a hint, never the source of truth, so both stay editable.
    const m = /(\d+\.\d+(?:\.\d+)?)/.exec(f.name);
    if (m && !versionName) setVersionName(m[1]);
  };

  const canUpload = !!file && versionName.trim() !== "" && /^\d+$/.test(versionCode.trim());

  const liveApk = useMemo(
    () => apks.filter((a) => a.enabled).sort((a, b) => b.versionCode - a.versionCode)[0],
    [apks],
  );

  // Highest code ever published, enabled or not — a disabled release still used
  // up its number, and reusing it is rejected by the server.
  const highestCode = useMemo(
    () => apks.reduce((max, a) => Math.max(max, a.versionCode), 0),
    [apks],
  );

  // A code at or below the highest published one is almost always a slip (the
  // version NAME is what people have in their head — "1.8" — and the code is a
  // separate counter). It is worth flagging loudly because the failure is
  // silent: the release publishes fine and is then offered to nobody, because
  // every phone already reports a higher code.
  const enteredCode = Number(versionCode.trim());
  const codeTooLow =
    /^\d+$/.test(versionCode.trim()) && highestCode > 0 && enteredCode <= highestCode;

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">App Releases</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Android builds employees install, and web bundles that update themselves
          </p>
        </div>
        {liveApk && (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Live APK: {liveApk.versionName} ({liveApk.versionCode})
          </Badge>
        )}
      </div>

      <div className="space-y-6 p-6">
        {/* ── upload ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Upload className="h-4 w-4 text-primary" /> Publish a new APK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null); }}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                file ? "border-success/40 bg-success/5" : "border-border hover:border-primary/40",
              )}
            >
              <Smartphone className={cn("mb-2 h-6 w-6", file ? "text-success" : "text-muted-foreground")} />
              <p className="text-[13px] font-semibold">
                {file ? file.name : "Drop the .apk here, or click to choose"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {file ? fmtBytes(file.size) : "Up to 25 MB"}
              </p>
              <input
                ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                  Version name (shown to employees)
                </label>
                <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="1.9" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                  Version code (whole number, must increase)
                </label>
                <Input
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={highestCode ? String(highestCode + 1) : "9"}
                  inputMode="numeric"
                  className={cn(codeTooLow && "border-destructive focus-visible:ring-destructive/30")}
                />
                {highestCode > 0 && (
                  <p className={cn(
                    "mt-1 text-[11px]",
                    codeTooLow ? "font-semibold text-destructive" : "text-muted-foreground",
                  )}>
                    {codeTooLow
                      ? `Highest published is ${highestCode}. A code of ${enteredCode} is not newer, so no phone would ever be offered this build — use ${highestCode + 1} or higher.`
                      : `Highest published so far: ${highestCode}.`}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                What's new (shown in the update prompt)
              </label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px] text-[13px]" />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Pilot tenant IDs (comma separated) — leave blank to release to everyone
              </label>
              <Input value={pilotIds} onChange={(e) => setPilotIds(e.target.value)} placeholder="6a6990c0835fb1fb12e33268" />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
              <Switch checked={mandatory} onCheckedChange={setMandatory} />
              <div>
                <p className="text-[12px] font-semibold">Required update</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Turns OFF punching for anyone on an older build until they install this one.
                  They keep access to everything else. Use it only when the old build makes
                  attendance itself untrustworthy.
                </p>
              </div>
            </div>

            {progress !== null && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(3, progress)}%` }} />
                </div>
                <p className="text-center text-[11px] tabular-nums text-muted-foreground">Uploading {progress}%</p>
              </div>
            )}

            <Button
              disabled={!canUpload || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="w-full"
            >
              {uploadMutation.isPending ? "Uploading…" : "Publish APK"}
            </Button>
          </CardContent>
        </Card>

        {/* ── APK history ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Smartphone className="h-4 w-4 text-primary" /> Published APKs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {apksLoading ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : apks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No APKs published yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-center">Required</TableHead>
                    <TableHead className="text-center">Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apks.map((a) => (
                    <TableRow key={a._id}>
                      <TableCell>
                        <span className="text-[13px] font-semibold">{a.versionName}</span>
                        <span className="ml-1.5 text-[11px] text-muted-foreground">({a.versionCode})</span>
                        {a.notes && <p className="mt-0.5 max-w-[280px] truncate text-[11px] text-muted-foreground">{a.notes}</p>}
                      </TableCell>
                      <TableCell className="text-[12px]">
                        {a.channel === "production"
                          ? <Badge variant="outline">Everyone</Badge>
                          : <span className="text-muted-foreground">
                              {a.pilotAdminIds?.map((p) => p.companyName || p.name).join(", ") || "Pilot"}
                            </span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{fmtBytes(a.sizeBytes)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{fmtDate(a.createdAt)}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={a.mandatory}
                          onCheckedChange={(v) => toggleApk.mutate({ id: a._id, patch: { mandatory: v } })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={a.enabled}
                          onCheckedChange={(v) => toggleApk.mutate({ id: a._id, patch: { enabled: v } })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── bundles ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Package className="h-4 w-4 text-primary" /> Web bundles (over the air)
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Published from the command line with publishBundle.js. Turn one off here to pull it back.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {bundles.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No bundles published.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-center">Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundles.slice(0, 15).map((b) => (
                    <TableRow key={b._id}>
                      <TableCell className="text-[13px] font-semibold">{b.version}</TableCell>
                      <TableCell className="text-[12px]">
                        {b.channel === "production"
                          ? <Badge variant="outline">Everyone</Badge>
                          : <span className="text-muted-foreground">
                              {b.pilotAdminIds?.map((p) => p.companyName || p.name).join(", ") || "Pilot"}
                            </span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{fmtBytes(b.sizeBytes)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{fmtDate(b.createdAt)}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={b.enabled}
                          onCheckedChange={(v) => toggleBundle.mutate({ id: b._id, enabled: v })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
