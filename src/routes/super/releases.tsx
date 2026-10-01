import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Package, Smartphone, Upload } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { requestErrorMessage } from "@/services/request-error";
import {
  getApkReleases,
  getBundleReleases,
  getDeviceCompanies,
  getFleet,
  updateApkRelease,
  updateBundleRelease,
  type ApkRelease,
  type BundleRelease,
  type PilotCompany,
} from "@/services/superadmin-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * Every switch here reaches real phones the moment it is flipped, so each one
 * asks first and says who it reaches.
 */

// Matches nginx's `client_max_body_size 25M` and the multer limit in
// app_release_routes.js. All three have to agree: nginx cuts an oversized
// upload off at the proxy, so the server-side message never arrives and the
// uploader just sees a dead progress bar. Checking here is the only place that
// can explain it. Builds are ~8 MB.
const MAX_APK_BYTES = 25 * 1024 * 1024;
const BUNDLES_SHOWN = 15;

const fmtBytes = (b?: number | null) =>
  b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : "size unknown";
const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "—";
const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
};
const audience = (channel: "production" | "pilot", pilots?: PilotCompany[]) =>
  channel === "production"
    ? "Everyone: every phone of every company"
    : pilots && pilots.length
      ? `Only ${pilots.map((p) => p.companyName || p.name || "a company").join(", ")}`
      : "A pilot with no company (reaches nobody)";

type Pending =
  | { kind: "bundle"; row: BundleRelease; enabled: boolean }
  | { kind: "apk-live"; row: ApkRelease; enabled: boolean }
  | { kind: "apk-required"; row: ApkRelease; mandatory: boolean };

const toastError = (err: unknown, fallback: string) => {
  const msg = requestErrorMessage(err, fallback);
  if (msg) toast.error(msg);
};

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium">Could not load {what}.</p>
      <Button variant="outline" className="mt-3 h-10" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ReleasesPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [pilotIds, setPilotIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showAllBundles, setShowAllBundles] = useState(false);

  const apksQ = useQuery({ queryKey: ["apk-releases"], queryFn: getApkReleases });
  const bundlesQ = useQuery({ queryKey: ["bundle-releases"], queryFn: getBundleReleases });
  // Which APK and which web bundle each installed app is running, from the
  // updater's own check-in -- works on every OTA-capable APK with no new code
  // on the phone.
  const fleetQ = useQuery({ queryKey: ["ota-fleet"], queryFn: getFleet });
  const companiesQ = useQuery({
    queryKey: ["superadmin", "device-companies"],
    queryFn: getDeviceCompanies,
    staleTime: 60_000,
  });

  const apks = useMemo(() => (Array.isArray(apksQ.data) ? apksQ.data : []), [apksQ.data]);
  const bundles = Array.isArray(bundlesQ.data) ? bundlesQ.data : [];
  const fleet = fleetQ.data;
  const companies = Array.isArray(companiesQ.data) ? companiesQ.data : [];

  const reset = () => {
    setFile(null);
    setVersionName("");
    setVersionCode("");
    setNotes("");
    setMandatory(false);
    setPilotIds([]);
    setProgress(null);
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
      if (pilotIds.length) form.append("pilotAdminIds", pilotIds.join(","));

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
    onError: (err) => {
      setProgress(null);
      toastError(err, "Upload failed. Try again.");
    },
  });

  const apkMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { enabled?: boolean; mandatory?: boolean };
    }) => updateApkRelease(id, patch),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["apk-releases"] });
      toast.success(`APK ${row.versionName} (${row.versionCode}) updated`);
      setPending(null);
    },
    onError: (err) => toastError(err, "Could not change the APK. Try again."),
  });

  const bundleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateBundleRelease(id, { enabled }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["bundle-releases"] });
      qc.invalidateQueries({ queryKey: ["ota-fleet"] });
      toast.success(`Bundle ${row.version} is ${row.enabled ? "live" : "off"}`);
      setPending(null);
    },
    onError: (err) => toastError(err, "Could not change the bundle. Try again."),
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

  const nameOk = /^[\w.+-]{1,40}$/.test(versionName.trim());
  const canUpload = !!file && nameOk && /^\d+$/.test(versionCode.trim()) && Number(versionCode) > 0;

  const liveApk = useMemo(
    () =>
      apks
        .filter((a) => a.enabled && a.channel === "production")
        .sort((a, b) => b.versionCode - a.versionCode)[0],
    [apks],
  );

  // Highest code ever published, enabled or not — a disabled release still used
  // up its number, and reusing it is rejected by the server.
  const highestCode = useMemo(
    () => apks.reduce((max, a) => Math.max(max, a.versionCode), 0),
    [apks],
  );
  const enteredCode = Number(versionCode.trim());
  const codeTaken =
    /^\d+$/.test(versionCode.trim()) && apks.some((a) => a.versionCode === enteredCode);
  // A code at or below the highest published one is almost always a slip: the
  // release publishes fine and is then offered to nobody, because every phone
  // already reports a higher code.
  const codeTooLow =
    /^\d+$/.test(versionCode.trim()) && highestCode > 0 && enteredCode <= highestCode;

  const shownBundles = showAllBundles ? bundles : bundles.slice(0, BUNDLES_SHOWN);

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "bundle")
      bundleMutation.mutate({ id: pending.row._id, enabled: pending.enabled });
    else if (pending.kind === "apk-live")
      apkMutation.mutate({ id: pending.row._id, patch: { enabled: pending.enabled } });
    else apkMutation.mutate({ id: pending.row._id, patch: { mandatory: pending.mandatory } });
  };
  const busy = apkMutation.isPending || bundleMutation.isPending;

  return (
    <div className="min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">App releases</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Android builds employees install, and screen updates that install themselves
          </p>
        </div>
        {liveApk && (
          <Badge
            variant="outline"
            className="border-success/30 bg-success/10 text-[12px] text-success"
          >
            Live APK for everyone: {liveApk.versionName} ({liveApk.versionCode})
          </Badge>
        )}
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {/* ── fleet ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Smartphone className="h-4 w-4 text-primary" /> Phones checking in (last{" "}
              {fleet?.windowDays ?? 30} days)
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Every phone here takes screen updates over the air. A phone that never appears is on
              an APK older than 1.2 and can only be updated by installing a new APK. Emulators are
              not counted.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {fleetQ.isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : fleetQ.isError || !fleet ? (
              <LoadError what="the phones" onRetry={() => fleetQ.refetch()} />
            ) : fleet.total === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No phone has checked in yet.
              </p>
            ) : (
              <>
                <p className="text-[13px]">
                  <span className="font-bold">{fleet.total}</span> phone
                  {fleet.total === 1 ? "" : "s"}.{" "}
                  {fleet.latestBundle && fleet.onLatestBundle !== null ? (
                    <>
                      <span className="font-bold">{fleet.onLatestBundle}</span> already run the
                      latest screens for everyone ({fleet.latestBundle}).
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      No screen update is live for everyone right now.
                    </span>
                  )}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["By APK", fleet.byApk],
                      ["By screens (web bundle)", fleet.byBundle],
                    ] as const
                  ).map(([title, list]) => (
                    <div key={title}>
                      <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">{title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((x) => (
                          <Badge key={x.label} variant="outline" className="text-[12px]">
                            {x.label} · {x.devices}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <ul className="divide-y rounded-lg border">
                  {fleet.devices.map((d, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-0.5 px-3 py-2 text-[12px] sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="min-w-0 font-medium sm:w-48 sm:truncate">{d.company}</span>
                      <span className="text-muted-foreground sm:w-40">APK {d.apk}</span>
                      <span className="text-muted-foreground sm:w-40">Screens {d.bundle}</span>
                      <span className="text-muted-foreground sm:w-24">
                        Android {d.android || "—"}
                      </span>
                      <span className="text-muted-foreground">
                        Last seen {fmtDate(d.lastSeenAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                {fleet.total > fleet.devices.length && (
                  <p className="text-[12px] text-muted-foreground">
                    Showing the {fleet.devices.length} most recent.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── bundles ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Package className="h-4 w-4 text-primary" /> Screen updates (web bundles, over the
              air)
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Published from the command line with publishBundle.js. Each phone gets the newest live
              update it is allowed. Turning one off makes phones go back to the previous live one on
              their next check.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {bundlesQ.isLoading ? (
              <Skeleton className="m-4 h-24 rounded-lg" />
            ) : bundlesQ.isError ? (
              <LoadError what="the screen updates" onRetry={() => bundlesQ.refetch()} />
            ) : bundles.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No screen updates published.
              </p>
            ) : (
              <>
                <ul className="divide-y border-t">
                  {shownBundles.map((b) => (
                    <li key={b._id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[14px] font-semibold">
                          {b.version}{" "}
                          <span
                            className={cn(
                              "text-[12px] font-normal",
                              b.enabled ? "text-success" : "text-muted-foreground",
                            )}
                          >
                            {b.enabled ? "Live" : "Off"}
                          </span>
                        </p>
                        <p className="text-[12px]">{audience(b.channel, b.pilotAdminIds)}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {fmtDate(b.createdAt)} · {fmtBytes(b.sizeBytes)}
                          {hostOf(b.url) ? ` · from ${hostOf(b.url)}` : ""}
                        </p>
                        {b.notes && (
                          <p className="line-clamp-2 text-[12px] text-muted-foreground">
                            {b.notes}
                          </p>
                        )}
                      </div>
                      <label
                        className="flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
                        aria-label={`Bundle ${b.version} live`}
                      >
                        <Switch
                          checked={b.enabled}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setPending({ kind: "bundle", row: b, enabled: v })
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                {bundles.length > BUNDLES_SHOWN && (
                  <div className="border-t px-4 py-2">
                    <Button
                      variant="ghost"
                      className="h-10 text-[13px]"
                      onClick={() => setShowAllBundles((v) => !v)}
                    >
                      {showAllBundles ? "Show fewer" : `Show all ${bundles.length}`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── APK history ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Smartphone className="h-4 w-4 text-primary" /> Published APKs
            </CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Each phone is offered the highest build it is allowed. "Required" stops punching on
              older builds.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {apksQ.isLoading ? (
              <Skeleton className="m-4 h-24 rounded-lg" />
            ) : apksQ.isError ? (
              <LoadError what="the APKs" onRetry={() => apksQ.refetch()} />
            ) : apks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No APKs published yet.
              </p>
            ) : (
              <ul className="divide-y border-t">
                {apks.map((a) => (
                  <li
                    key={a._id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[14px] font-semibold">
                        {a.versionName}{" "}
                        <span className="text-[12px] font-normal text-muted-foreground">
                          (build {a.versionCode})
                        </span>
                      </p>
                      <p className="text-[12px]">{audience(a.channel, a.pilotAdminIds)}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {fmtDate(a.createdAt)} · {fmtBytes(a.sizeBytes)}
                      </p>
                      {a.notes && (
                        <p className="line-clamp-2 text-[12px] text-muted-foreground">{a.notes}</p>
                      )}
                      {a.url && (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                        >
                          <Download className="h-4 w-4" /> Download APK
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-4">
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px]">
                        <Switch
                          checked={a.mandatory}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setPending({ kind: "apk-required", row: a, mandatory: v })
                          }
                        />
                        Required
                      </label>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px]">
                        <Switch
                          checked={a.enabled}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setPending({ kind: "apk-live", row: a, enabled: v })
                          }
                        />
                        Live
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── upload ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Upload className="h-4 w-4 text-primary" /> Publish a new APK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                file ? "border-success/40 bg-success/5" : "border-border hover:border-primary/40",
              )}
            >
              <Smartphone
                className={cn("mb-2 h-6 w-6", file ? "text-success" : "text-muted-foreground")}
              />
              <p className="break-all text-[13px] font-semibold">
                {file ? file.name : "Drop the .apk here, or tap to choose"}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {file ? fmtBytes(file.size) : "Up to 25 MB"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="apk-name"
                  className="mb-1 block text-[12px] font-semibold text-muted-foreground"
                >
                  Version name (shown to employees)
                </label>
                <Input
                  id="apk-name"
                  className="h-10"
                  value={versionName}
                  maxLength={40}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="1.9"
                />
                {versionName.trim() !== "" && !nameOk && (
                  <p className="mt-1 text-[12px] font-semibold text-destructive">
                    Use letters, digits, dots and dashes only.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="apk-code"
                  className="mb-1 block text-[12px] font-semibold text-muted-foreground"
                >
                  Version code (whole number, must go up)
                </label>
                <Input
                  id="apk-code"
                  className={cn(
                    "h-10",
                    codeTooLow && "border-destructive focus-visible:ring-destructive/30",
                  )}
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder={highestCode ? String(highestCode + 1) : "9"}
                  inputMode="numeric"
                />
                {highestCode > 0 && (
                  <p
                    className={cn(
                      "mt-1 text-[12px]",
                      codeTooLow ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {codeTaken
                      ? `Build ${enteredCode} is already published. Each code can be used once — use ${highestCode + 1} or higher.`
                      : codeTooLow
                        ? `Highest published is ${highestCode}. A code of ${enteredCode} is not newer, so no phone would ever be offered this build — use ${highestCode + 1} or higher.`
                        : `Highest published so far: ${highestCode}.`}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="apk-notes"
                className="mb-1 block text-[12px] font-semibold text-muted-foreground"
              >
                What's new (shown in the update prompt)
              </label>
              <Textarea
                id="apk-notes"
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[70px] text-[13px]"
              />
            </div>

            <div>
              <p className="mb-1 text-[12px] font-semibold text-muted-foreground">
                Pilot companies — choose none to release to everyone
              </p>
              {companiesQ.isError ? (
                <LoadError what="the companies" onRetry={() => companiesQ.refetch()} />
              ) : (
                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2">
                  {companies.map((c) => {
                    const on = pilotIds.includes(c._id);
                    return (
                      <button
                        key={c._id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPilotIds((ids) =>
                            on ? ids.filter((x) => x !== c._id) : [...ids, c._id],
                          )
                        }
                        className={cn(
                          "min-h-10 rounded-lg border px-3 text-[12px]",
                          on
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "hover:bg-muted",
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-[12px] text-muted-foreground">
                {pilotIds.length
                  ? `Pilot: only ${pilotIds.length} compan${pilotIds.length === 1 ? "y" : "ies"} will be offered this build.`
                  : "Everyone will be offered this build."}
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
              <label
                className="-my-1 flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
                aria-label="Required update"
              >
                <Switch id="apk-mandatory" checked={mandatory} onCheckedChange={setMandatory} />
              </label>
              <label htmlFor="apk-mandatory" className="cursor-pointer">
                <p className="text-[13px] font-semibold">Required update</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Turns OFF punching for anyone on an older build until they install this one. They
                  keep access to everything else. Use it only when the old build makes attendance
                  itself untrustworthy.
                </p>
              </label>
            </div>

            {progress !== null && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
                <p className="text-center text-[12px] tabular-nums text-muted-foreground">
                  Uploading {progress}%
                </p>
              </div>
            )}

            <Button
              disabled={!canUpload || codeTaken || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="h-11 w-full"
            >
              {uploadMutation.isPending
                ? "Uploading…"
                : pilotIds.length
                  ? "Publish APK to the pilot companies"
                  : "Publish APK to everyone"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTitle(pending)}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[13px]">{pendingBody(pending)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              {busy ? "Saving..." : "Yes, change it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function pendingTitle(p: Pending | null) {
  if (!p) return "";
  if (p.kind === "bundle")
    return p.enabled
      ? `Make screen update ${p.row.version} live?`
      : `Turn off screen update ${p.row.version}?`;
  if (p.kind === "apk-live")
    return p.enabled
      ? `Offer APK ${p.row.versionName} (build ${p.row.versionCode})?`
      : `Stop offering APK ${p.row.versionName}?`;
  return p.mandatory
    ? `Make APK ${p.row.versionName} required?`
    : `Make APK ${p.row.versionName} optional?`;
}

function pendingBody(p: Pending | null) {
  if (!p) return null;
  if (p.kind === "bundle") {
    const who = audience(p.row.channel, p.row.pilotAdminIds);
    return p.enabled ? (
      <>
        <p>
          <strong>Who gets it:</strong> {who}.
        </p>
        <p>
          Their phones download it on the next app open and switch to it, with no question asked.
        </p>
        {hostOf(p.row.url) && (
          <p>
            <strong>Downloads from:</strong> {hostOf(p.row.url)}. Make sure that is the server this
            screen belongs to.
          </p>
        )}
      </>
    ) : (
      <>
        <p>
          <strong>Who it affects:</strong> {who}.
        </p>
        <p>
          Phones stop being offered it and go back to the previous live update on their next check.
        </p>
      </>
    );
  }
  const who = audience(p.row.channel, p.row.pilotAdminIds);
  if (p.kind === "apk-live")
    return p.enabled ? (
      <p>
        {who} will be asked to install this build the next time they open the app
        {p.row.mandatory
          ? ", and it is required: older builds cannot punch until they install it"
          : ""}
        .
      </p>
    ) : (
      <p>
        Phones stop being offered this build and fall back to the previous live one. Phones that
        installed it keep it.
      </p>
    );
  return p.mandatory ? (
    <p>
      <strong>Punching stops</strong> on any build older than {p.row.versionCode} until the phone
      installs this one ({who}). They can still see everything else. Use this only when the old
      build records attendance wrongly.
    </p>
  ) : (
    <p>Phones on older builds can punch again. They are still asked to update.</p>
  );
}
