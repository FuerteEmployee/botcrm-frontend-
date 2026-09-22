import { useState } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  Bell,
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Power,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Footprints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { batteryStepsFor } from "@/lib/oem-battery-steps";
import {
  openAppSettings,
  openAutostartSettings,
  openBatterySettings,
  requestTrackerPermissions,
} from "@/plugins/background-tracker";
import type { SetupStep, StepId, TrackingSetup } from "@/hooks/use-tracking-setup";

// First-run setup, shown in place of the punch-in button until the phone can
// actually record attendance in the background.
//
// The tone matters here. This screen asks an employee for permissions that a
// tracking app has every reason to be asked hard questions about, so each step
// says WHAT it does and WHY it is needed in terms of their attendance -- never
// "required for app functionality". Somebody who understands why they are
// granting always-on location is far more likely to leave it granted, and the
// honesty is owed regardless.
//
// The auto-start step is presented differently on purpose: it is the only one
// nothing can verify, so it asks for a confirmation rather than claiming to
// have checked.

const ICONS: Record<StepId, typeof MapPin> = {
  precise: Crosshair,
  background: MapPin,
  notifications: Bell,
  activity: Footprints,
  battery: BatteryCharging,
  autostart: Power,
};

export function TrackingSetupGate({ setup }: { setup: TrackingSetup }) {
  const [busy, setBusy] = useState<StepId | null>(null);

  const act = async (step: SetupStep) => {
    setBusy(step.id);
    try {
      switch (step.id) {
        case "precise":
        case "background":
        case "notifications":
        case "activity":
          // The native side owns the ORDER. Android only offers background
          // location once foreground is already granted, and asking in the
          // wrong order fails silently -- it returns denied without ever
          // showing the user a dialog.
          await requestTrackerPermissions();
          break;
        case "battery":
          await openBatterySettings();
          break;
        case "autostart":
          await openAutostartSettings();
          break;
      }
    } finally {
      setBusy(null);
      await setup.refresh();
    }
  };

  const remaining = setup.steps.filter((s) => !s.done).length;
  const total = setup.steps.length;
  const doneCount = total - remaining;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-warning/20 grid place-items-center">
            <AlertTriangle className="h-4.5 w-4.5 text-warning-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-black tracking-tight text-foreground">
              Finish setup to start punching in
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Your attendance is recorded from your location while you are punched in. Android needs
              these {total} settings, or recording stops the moment your screen locks — and your hours
              would go missing without either of us noticing.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[11px] font-black tabular-nums text-muted-foreground">
            {doneCount}/{total}
          </span>
        </div>

        {setup.deviceIdentity && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/80">
            <Smartphone className="h-3 w-3 shrink-0" />
            {[setup.deviceIdentity.manufacturer, setup.deviceIdentity.model].filter(Boolean).join(" ")}
            {setup.deviceIdentity.osVersion && ` · Android ${setup.deviceIdentity.osVersion}`}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {setup.steps.map((step) => {
          const Icon = ICONS[step.id];
          return (
            <div
              key={step.id}
              className={cn(
                "rounded-2xl border p-3.5 transition-colors",
                step.done ? "border-success/25 bg-success/5" : "border-border/50 bg-card",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-xl grid place-items-center",
                    step.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.done ? <Check className="h-4.5 w-4.5" /> : <Icon className="h-4.5 w-4.5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-black tracking-tight">{step.title}</p>
                    {step.selfDeclared && !step.done && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        We can't check this
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>

                  {/* Where the setting ACTUALLY is on this phone.
                      The standard Allow dialog is intercepted by most Chinese
                      skins, which drop the employee on a vendor battery page
                      with no control that satisfies the check -- so "Open
                      settings" alone leads somewhere that cannot work. Only
                      shown for skins known to do this; stock Android gets the
                      one-tap dialog and needs no wall of text. */}
                  {!step.done && step.id === "battery" && (() => {
                    const oem = batteryStepsFor(setup.deviceIdentity?.manufacturer);
                    if (!oem) return null;
                    return (
                      <div className="mt-2.5 rounded-xl border border-border/50 bg-muted/30 p-2.5 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          On your phone ({oem.skin})
                        </p>
                        <ol className="space-y-1">
                          {oem.whitelist.map((line, i) => (
                            <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-foreground/80">
                              <span className="shrink-0 font-black text-primary">{i + 1}.</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ol>
                        {oem.vendor.length > 0 && (
                          <div className="border-t border-border/40 pt-2 space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground">
                              Also do these — we cannot check them, but without them your phone
                              stops recording anyway:
                            </p>
                            {oem.vendor.map((line, i) => (
                              <p key={i} className="text-[11px] leading-relaxed text-foreground/70">
                                • {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {!step.done && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-lg px-3 text-[11px] font-black"
                        disabled={busy === step.id}
                        onClick={() => act(step)}
                      >
                        {busy === step.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : step.id === "precise" || step.id === "background" || step.id === "notifications" ? (
                          "Allow"
                        ) : (
                          "Open settings"
                        )}
                      </Button>

                      {step.selfDeclared && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg px-3 text-[11px] font-black"
                          onClick={setup.confirmAutostart}
                        >
                          I've enabled it
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg px-3 text-[11px] font-black gap-1.5"
          onClick={() => setup.refresh()}
          disabled={setup.loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", setup.loading && "animate-spin")} />
          Re-check
        </Button>
        {/* Android permanently blocks the permission dialog after two denials.
            When that has happened, the only route left is the app's own
            settings page, so it must always be reachable from here. */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg px-3 text-[11px] font-bold text-muted-foreground"
          onClick={() => openAppSettings()}
        >
          Open app settings instead
        </Button>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
        Your location is recorded only between punch-in and punch-out, and is used solely to confirm
        attendance at your branch.
      </p>
    </div>
  );
}
