import { createFileRoute } from "@tanstack/react-router";
import { MachinesManager } from "@/components/pages/machines-manager";

export const Route = createFileRoute("/super/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  return (
    <div className="min-h-screen">
      <div className="border-b bg-card px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Machines</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Biometric attendance machines of every company
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <MachinesManager />
      </div>
    </div>
  );
}
