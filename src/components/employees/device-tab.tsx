import { useMemo, useState } from "react";
import {
  Smartphone,
  Activity,
  ShieldCheck,
  AlertTriangle,
  CircleAlert,
  BatteryFull,
  BatteryLow,
  BatteryCharging,
  Info,
  WifiOff,
  Navigation,
  Plane,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useClientDevices,
  useClientErrors,
  useTrackerEvents,
  describeTrackerEvent,
  TRACKER_EVENT_META,
  PERMISSION_LABELS,
  TRACKING_PERMISSIONS,
  isPermissionBlocking,
  isPermissionUnreadable,
  buildOutageIntervals,
  reportsDiagnostics,
  heldFixesWithin,
  useHeldFixes,
  OUTAGE_EVENT_TYPES,
  type ClientDevice,
  type TrackerEvent,
  type OutageInterval,
} from "@/services/client-service";

/**
 * Everything support needs when an employee says "the app is not working".
 *
 * The page is ordered by the question being asked, not by where the data comes
 * from: first the verdict, then the settings that could cause it, then the
 * timeline that shows what actually happened, then raw errors. Anyone reading
 * it top to bottom should be able to stop as soon as they have their answer.
 *
 * Tables rather than cards throughout. The previous layout used a grid of
 * tiles, which looked tidier but made the two things this page is for —
 * comparing states down a column, and scanning a timeline — into the two things
 * it was worst at.
 */

// ── shared bits ───────────────────────────────────────────────────────────────

const IST: Intl.DateTimeFormatOptions = {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
};

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { ...IST, year: "numeric" }) : "—";

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", IST) : "—";

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "granted"
      ? "border-success/30 bg-success/10 text-success"
      : state === "denied"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : state === "prompt" || state === "prompt-with-rationale"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
          : "border-border bg-muted/40 text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("font-semibold whitespace-nowrap", tone)}>
      {PERMISSION_LABELS[state as keyof typeof PERMISSION_LABELS] ?? state}
    </Badge>
  );
}

function SectionCard({
  title, icon: Icon, subtitle, action, children,
}: {
  title: string;
  icon: React.ElementType;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-none shadow-soft rounded-2xl overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-muted/5 py-3.5 px-5 flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            {title}
          </CardTitle>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

// ── verdict ───────────────────────────────────────────────────────────────────

/**
 * The one line support reads first.
 *
 * Distinguishes four situations that need four different responses, and which
 * used to be collapsed into "something is wrong":
 *
 *   · not the app at all (a browser login, or iOS)
 *   · too old an APK to report anything
 *   · every requirement met
 *   · a specific blocking setting, named, with where to change it
 */
function Verdict({ device }: { device: ClientDevice }) {
  const blocking = TRACKING_PERMISSIONS.filter(
    (p) => !p.selfDeclared && isPermissionBlocking(device.permissions[p.key]),
  );
  const unverified = TRACKING_PERMISSIONS.filter(
    (p) => !p.selfDeclared && isPermissionUnreadable(device.permissions[p.key]),
  );

  if (device.isNative !== true) {
    return (
      <Banner tone="neutral" icon={Info}>
        This is a browser or PWA login{device.platform ? ` (${device.platform})` : ""}, not the installed
        Android app. Background tracking needs the native app — nothing is wrong with the phone.
      </Banner>
    );
  }

  if (TRACKING_PERMISSIONS.every((p) => device.permissions[p.key] === "unknown")) {
    return (
      <Banner tone="neutral" icon={Info}>
        This build predates background tracking and cannot report these settings. The employee needs
        the newer APK; nothing is wrong with the phone.
      </Banner>
    );
  }

  if (blocking.length === 0) {
    return (
      <Banner tone="good" icon={ShieldCheck}>
        <span className="font-bold">Background tracking is fully enabled on this device.</span>
        {device.trackingSetupComplete === false && " Setup was never formally completed, but every required permission is granted."}
        {unverified.length > 0 && (
          <span className="block mt-1 font-normal opacity-80">
            Not checkable from the app: {unverified.map((p) => p.label).join(", ")}.
          </span>
        )}
      </Banner>
    );
  }

  return (
    <Banner tone="bad" icon={AlertTriangle}>
      <span className="font-bold">
        Location will stop when the screen locks — {blocking.length} setting
        {blocking.length > 1 ? "s are" : " is"} blocking it.
      </span>
      <span className="block mt-1 font-normal opacity-90">
        {blocking.map((p) => p.label).join(", ")} — see the table below for where to change{" "}
        {blocking.length > 1 ? "them" : "it"}.
      </span>
    </Banner>
  );
}

function Banner({
  tone, icon: Icon, children,
}: { tone: "good" | "bad" | "neutral"; icon: React.ElementType; children: React.ReactNode }) {
  const cls = {
    good: "border-success/25 bg-success/10 text-success",
    bad: "border-destructive/25 bg-destructive/10 text-destructive",
    neutral: "border-border/60 bg-muted/30 text-muted-foreground",
  }[tone];

  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed", cls)}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── activity log ──────────────────────────────────────────────────────────────

const SEVERITY_DOT = {
  bad: "bg-destructive",
  warn: "bg-amber-500",
  good: "bg-success",
  neutral: "bg-muted-foreground/40",
} as const;

function BatteryCell({ event }: { event: TrackerEvent }) {
  if (event.batteryLevel == null) return <span className="text-muted-foreground">—</span>;

  const low = event.batteryLevel <= 20;
  const Icon = event.charging ? BatteryCharging : low ? BatteryLow : BatteryFull;

  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
      low && !event.charging && "text-destructive font-semibold")}>
      <Icon className="h-3.5 w-3.5" />
      {event.batteryLevel}%
    </span>
  );
}

/**
 * Only the events that answer a complaint, unless the reader asks for all of
 * them.
 *
 * Doze and battery samples are the bulk of the rows and almost never the cause;
 * leaving them in by default buries a single `gps_off` under forty lines of
 * routine phone behaviour. They stay available because occasionally the pattern
 * of them IS the answer.
 */
// Routine phone behaviour, hidden behind "Show all" so the timeline reads as a
// list of things that went wrong.
//
// `service_stop` is here because it was the single noisiest entry in the whole
// system: stopping an already-stopped service was recorded as an event, so one
// device logged 136 of them against 18 real starts. The source is fixed in
// LocationTrackingService.stopTrackingInternal, but that only reaches a device
// on its next APK — every install already in the field keeps sending them, so
// the filter has to stand on its own.
const NOISE: ReadonlySet<string> = new Set(["doze_on", "doze_off", "battery", "service_stop"]);

// ── connectivity ──────────────────────────────────────────────────────────────

const OUTAGE_META: Record<
  OutageInterval["kind"],
  { label: string; icon: React.ElementType; tone: string; effect: string }
> = {
  network: {
    label: "No internet",
    icon: WifiOff,
    tone: "text-amber-600",
    effect: "Location kept recording on the phone and uploaded on reconnect.",
  },
  gps: {
    label: "GPS switched off",
    icon: Navigation,
    tone: "text-destructive",
    effect: "Nothing could be recorded for this period — location was off at the phone.",
  },
  airplane: {
    label: "Airplane mode",
    icon: Plane,
    tone: "text-amber-600",
    effect: "Deliberately offline. Recording continued locally.",
  },
};

function fmtDuration(ms: number): string {
  // Seconds below a minute, because real data has 3-second blips and rounding
  // one of those to "0 min" reads as "nothing happened" — the opposite of the
  // truth, and the difference between a flaky connection and a healthy one.
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} sec`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * How long this phone was unreachable, and what that cost.
 *
 * The Activity log below already lists every one of these events, but reading
 * "how long was he offline yesterday" off it means finding two rows and
 * subtracting. That is the question an admin is actually being asked by a
 * client, so it gets answered directly.
 *
 * The distinction between the two kinds is the part worth showing a client: no
 * internet loses nothing, because fixes queue on the device and arrive later;
 * GPS switched off loses the time outright, because there was nothing to queue.
 */
function Connectivity({ employeeId }: { employeeId: string }) {
  const { data: events, isLoading } = useTrackerEvents(employeeId, {
    limit: 500,
    types: OUTAGE_EVENT_TYPES,
  });

  // Match the tracker-event TTL: there is no point asking for backlog older
  // than the outages it would be attributed to.
  const from = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const { data: held } = useHeldFixes(employeeId, { from });

  const intervals = useMemo(() => buildOutageIntervals(events ?? []), [events]);

  const recovered = (iv: OutageInterval) =>
    heldFixesWithin(held?.fixes ?? [], iv.start, iv.end);

  return (
    <SectionCard
      title="Connectivity & GPS outages"
      icon={WifiOff}
      subtitle="Periods this phone could not reach us, or had location switched off."
    >
      {isLoading ? (
        <Empty>Loading connectivity…</Empty>
      ) : intervals.length === 0 ? (
        <Empty>
          {events?.length
            ? "No outages recorded. The phone stayed online with GPS on."
            : "No connectivity events recorded. This needs app version 1.5 or newer."}
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">Problem</TableHead>
              <TableHead className="w-[150px]">Started</TableHead>
              <TableHead className="w-[150px]">Ended</TableHead>
              <TableHead className="w-[100px]">For</TableHead>
              <TableHead>Effect</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {intervals.map((iv, i) => {
              const meta = OUTAGE_META[iv.kind];
              const Icon = meta.icon;
              return (
                <TableRow key={`${iv.kind}-${iv.start ?? iv.end}-${i}`}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.tone)} />
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                    {iv.startedBeforeWindow
                      ? <span className="italic">before this range</span>
                      : fmtTime(iv.start)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                    {iv.stillOpen
                      ? <span className="italic text-amber-600">not yet recovered</span>
                      : fmtTime(iv.end)}
                  </TableCell>
                  <TableCell className="text-xs font-semibold tabular-nums">
                    {/* Never a computed guess: one end being unknown means the
                        length is unknown, and inventing it here is how a
                        support answer becomes wrong. */}
                    {iv.durationMs != null ? fmtDuration(iv.durationMs) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground leading-relaxed">
                    {meta.effect}
                    {/* The recovery evidence. Only meaningful for outages that
                        kept recording — GPS off produces nothing to recover, so
                        a zero there is expected, not reassuring. */}
                    {iv.kind !== "gps" && recovered(iv) > 0 && (
                      <span className="mt-1 block text-[11px] font-semibold text-success">
                        {recovered(iv)} location{recovered(iv) === 1 ? "" : "s"} held on the phone
                        and delivered afterwards.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

function ActivityLog({ employeeId }: { employeeId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data: events, isLoading } = useTrackerEvents(employeeId, { limit: 300 });

  const rows = useMemo(
    () => (events ?? []).filter((e) => showAll || !NOISE.has(e.type)),
    [events, showAll],
  );

  const hiddenCount = (events?.length ?? 0) - rows.length;

  return (
    <SectionCard
      title="Activity log"
      icon={Activity}
      subtitle="What the phone did to background tracking, newest first."
      action={
        (events?.length ?? 0) > 0 && (
          <Button
            variant="outline" size="sm" className="h-7 text-[11px] shrink-0"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Hide routine" : `Show all${hiddenCount > 0 ? ` (+${hiddenCount})` : ""}`}
          </Button>
        )
      }
    >
      {isLoading ? (
        <Empty>Loading activity…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          {events?.length
            ? "Only routine phone activity recorded. Nothing has interrupted tracking."
            : "No activity recorded yet. This needs app version 1.5 or newer."}
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">When</TableHead>
              <TableHead className="w-[190px]">Event</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead className="w-[100px] text-right">Battery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const meta = TRACKER_EVENT_META[e.type];
              return (
                <TableRow key={e._id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                    {fmtTime(e.at)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", SEVERITY_DOT[meta?.severity ?? "neutral"])} />
                      {meta?.label ?? e.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground leading-relaxed">
                    {describeTrackerEvent(e)}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <BatteryCell event={e} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function DeviceTab({ employeeId }: { employeeId: string }) {
  const { data: devices, isLoading } = useClientDevices(employeeId);
  const { data: errors } = useClientErrors(employeeId);

  const sorted = useMemo(
    () => [...(devices ?? [])].sort((a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt)),
    [devices],
  );
  const current = sorted[0];

  if (isLoading) {
    return <Card className="border-none shadow-soft rounded-2xl"><CardContent className="p-6 text-sm text-muted-foreground">Loading device reports…</CardContent></Card>;
  }

  if (!current) {
    return (
      <SectionCard title="No installs reported" icon={Smartphone}>
        <Empty>
          This employee has not opened an app build that reports in. They need an APK newer than the
          telemetry release.
        </Empty>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <Verdict device={current} />

      {/* Installs. A table because the only reason to look at more than one row
          is to compare them — which build was on which handset, and when each
          was last seen. */}
      <SectionCard
        title="Installs"
        icon={Smartphone}
        subtitle={sorted.length > 1 ? `${sorted.length} installs reported` : "Current install"}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Build</TableHead>
              <TableHead>Device</TableHead>
              <TableHead className="w-[110px]">OS</TableHead>
              <TableHead className="w-[80px] text-right">Opens</TableHead>
              <TableHead className="w-[170px]">First seen</TableHead>
              <TableHead className="w-[170px]">Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((d, i) => (
              <TableRow key={d._id} className={cn(i === 0 && "bg-primary/[0.03]")}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs">
                      {d.appVersion ?? "Unknown"}{d.appBuild ? ` (${d.appBuild})` : ""}
                    </span>
                    {i === 0 && (
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[9px] px-1.5 py-0">
                        Current
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {d.deviceModel || "—"}
                  {d.manufacturer && <span className="text-muted-foreground"> · {d.manufacturer}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.platform ?? "—"} {d.osVersion ?? ""}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums">{d.appOpenCount.toLocaleString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(d.firstSeenAt)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(d.lastSeenAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Readiness for the CURRENT install only. Older installs' permissions
          describe a phone state that no longer exists and only ever misled. */}
      <SectionCard
        title="Tracking requirements"
        icon={ShieldCheck}
        subtitle={`${current.deviceModel || current.platform || "This install"} — every row must be granted, or recording stops when the screen locks.`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[210px]">Setting</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead>Where to change it</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TRACKING_PERMISSIONS.map((perm) => {
              const state = current.permissions[perm.key];
              // Auto-start is the one setting Android cannot report. It gets a
              // third state beyond granted/denied: PROVEN, meaning the app was
              // seen resuming after a reboot, which only auto-start allows.
              const proven = perm.key === "autoStart" && current.autoStartProven === true;

              return (
                <TableRow key={perm.key}>
                  <TableCell className="text-xs font-semibold">{perm.label}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <StateBadge state={state} />
                      {proven && (
                        <span className="text-[9px] font-semibold text-success">
                          Verified after a restart
                        </span>
                      )}
                      {perm.selfDeclared && state === "granted" && !proven && (
                        <span className="text-[9px] text-muted-foreground/70">
                          Employee's own report
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground leading-relaxed">
                    {isPermissionBlocking(state) ? (
                      <span className="text-foreground">{perm.fix}</span>
                    ) : perm.key === "autoStart" && !proven ? (
                      <>
                        {perm.fix}
                        <span className="block text-[10px] opacity-70 mt-0.5">
                          Android exposes no way to read this. It shows as verified once the phone has
                          restarted and tracking came back on its own.
                        </span>
                      </>
                    ) : (
                      perm.fix
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>

      {/* An old install is a SILENT phone, not a healthy one. Without saying so,
          the two empty sections below read as "nothing ever went wrong", which
          is the opposite of what they mean. */}
      {!reportsDiagnostics(current.appVersion) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
              This build cannot report diagnostics
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-200/70">
              Connectivity and activity reporting arrived in app version 1.5. This device is on{" "}
              <span className="font-semibold">{current.appVersion || "an unknown build"}</span>, so
              the two sections below will stay empty however the phone behaves — that is the build,
              not a sign the phone is healthy. Update the app to see them.
            </p>
          </div>
        </div>
      )}

      <Connectivity employeeId={employeeId} />

      <ActivityLog employeeId={employeeId} />

      <SectionCard
        title="App errors"
        icon={CircleAlert}
        subtitle="Failures the employee was actually shown, plus crashes the app recovered from."
      >
        {!errors?.length ? (
          <Empty>No app errors reported for this employee.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">When</TableHead>
                <TableHead className="w-[100px]">Kind</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-[160px]">Where</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((err) => (
                <TableRow key={err._id} className="align-top">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(err.occurredAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-[10px]">{err.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-md break-words">
                    {err.message}
                    {err.stack && (
                      <Collapsible className="mt-1.5">
                        <CollapsibleTrigger className="text-[11px] font-semibold text-primary hover:underline">
                          Show stack
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="mt-1.5 max-w-md whitespace-pre-wrap break-words rounded bg-muted p-2.5 text-[10px] text-muted-foreground">
                            {err.stack}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground break-all">
                    {err.statusCode ? <span className="mr-1 font-semibold text-foreground">{err.statusCode}</span> : null}
                    {err.requestUrl || err.route || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
