import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAlerts, toggleAlert, type AlertRuleRow } from "@/services/superadmin-service";
import { requestErrorMessage } from "@/services/request-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";

export const Route = createFileRoute("/super/alerts")({
  component: AlertsPage,
});

/**
 * Platform alert rules. Only some of them are read by any job; the rest are
 * switches with nothing behind them. The page says which is which, from the
 * backend's own map (superadmin_controller ALERT_WIRING), because a switch that
 * looks like it controls something and doesn't is worse than no switch.
 */
function AlertsPage() {
  const queryClient = useQueryClient();
  const [confirmOff, setConfirmOff] = useState<AlertRuleRow | null>(null);

  const {
    data: alerts,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["superadmin", "alerts"],
    queryFn: getAlerts,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ slug, isEnabled }: { slug: string; isEnabled: boolean }) =>
      toggleAlert(slug, isEnabled),
    onSuccess: (data) => {
      toast.success(`${data.name} is now ${data.isEnabled ? "on" : "off"}`);
      queryClient.invalidateQueries({ queryKey: ["superadmin", "alerts"] });
    },
    onError: (err) => {
      const msg = requestErrorMessage(err, "Could not change the alert rule. Try again.");
      if (msg) toast.error(msg);
    },
  });

  const change = (alert: AlertRuleRow, next: boolean) => {
    // Turning off a rule that really does something stops real warnings, so ask.
    if (!next && alert.wired) return setConfirmOff(alert);
    toggleMutation.mutate({ slug: alert.slug, isEnabled: next });
  };

  const list = Array.isArray(alerts) ? alerts : [];
  const wired = list.filter((a) => a.wired);
  const unwired = list.filter((a) => !a.wired);

  return (
    <div className="min-h-screen">
      <div className="border-b bg-card px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold">Alert rules</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Automatic warnings the system sends to companies
        </p>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>No SMS or email service is connected yet.</strong> When a rule fires, the message
          is only written to the server log. Nobody receives it until a provider is added.
        </div>

        {isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : isError ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center">
            <p className="text-sm font-medium">Could not load the alert rules.</p>
            <Button
              variant="outline"
              className="mt-3 h-10"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Trying..." : "Try again"}
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            There are no alert rules yet. They are created by the super admin setup script.
          </div>
        ) : (
          <>
            <RuleGroup
              title="Working"
              hint="Switching these on or off changes what companies are told."
              rules={wired}
              onChange={change}
              busy={toggleMutation.isPending}
            />
            <RuleGroup
              title="Not connected yet"
              hint="Nothing reads these switches today. On or off, the system behaves the same."
              rules={unwired}
              onChange={change}
              busy={toggleMutation.isPending}
            />
          </>
        )}
      </div>

      <AlertDialog open={!!confirmOff} onOpenChange={(open) => !open && setConfirmOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off "{confirmOff?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This applies to every company. {confirmOff?.effect}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Keep it on</AlertDialogCancel>
            <AlertDialogAction
              className="h-10"
              onClick={() => {
                if (confirmOff) toggleMutation.mutate({ slug: confirmOff.slug, isEnabled: false });
                setConfirmOff(null);
              }}
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RuleGroup({
  title,
  hint,
  rules,
  onChange,
  busy,
}: {
  title: string;
  hint: string;
  rules: AlertRuleRow[];
  onChange: (rule: AlertRuleRow, next: boolean) => void;
  busy: boolean;
}) {
  if (rules.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-2 text-[12px] text-muted-foreground">{hint}</p>
      <div className="divide-y rounded-xl border bg-card">
        {rules.map((alert) => {
          const id = `alert-${alert.slug}`;
          return (
            <div
              key={alert._id}
              className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="cursor-pointer text-[14px] font-medium">
                    {alert.name}
                  </label>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      alert.wired
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {alert.wired ? "Working" : "Not connected"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {alert.effect}
                </p>
              </div>
              {/* A 44px hit area around the small switch, so it is easy to tap. */}
              <label
                htmlFor={id}
                className="flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
                aria-label={`${alert.name}: ${alert.isEnabled ? "on" : "off"}`}
              >
                <Switch
                  id={id}
                  checked={alert.isEnabled}
                  onCheckedChange={(v) => onChange(alert, v)}
                  disabled={busy}
                />
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
