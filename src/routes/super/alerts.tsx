import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAlerts, toggleAlert } from "@/services/superadmin-service";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/super/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["superadmin", "alerts"],
    queryFn: getAlerts,
  });

  const toggleMutation = useMutation({
    mutationFn: (slug: string) => toggleAlert(slug),
    onSuccess: (data) => {
      toast.success(`${data.name} ${data.isEnabled ? "enabled" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["superadmin", "alerts"] });
    },
    onError: () => {
      toast.error("Failed to update alert rule");
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Alert Rules</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated notifications
          </p>
        </div>
      </div>

      <div className="p-6">
        <h2 className="text-sm font-semibold mb-3">Automated alert rules</h2>
        <div className="border rounded-xl bg-card divide-y">
          {(alerts || []).map((alert: any) => (
            <div
              key={alert._id}
              className="flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
            >
              <div>
                <h3 className="text-[13px] font-medium">{alert.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {alert.description}
                </p>
              </div>
              <Switch
                checked={alert.isEnabled}
                onCheckedChange={() => toggleMutation.mutate(alert.slug)}
                disabled={toggleMutation.isPending}
              />
            </div>
          ))}

          {(!alerts || alerts.length === 0) && (
            <div className="px-5 py-12 text-center text-muted-foreground text-sm">
              No alert rules configured. Run the seed script to populate defaults.
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4">
          Alert rules control automated notifications for subscription events. 
          Actual notification delivery (email, Firebase push) will be implemented in Phase 2 using background jobs.
        </p>
      </div>
    </div>
  );
}
