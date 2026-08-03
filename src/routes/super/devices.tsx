import { createFileRoute } from "@tanstack/react-router";
import { MachinesManager } from "@/components/pages/machines-manager";

export const Route = createFileRoute("/super/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-lg font-semibold">Machines</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Biometric attendance terminals across all customers
          </p>
        </div>
      </div>

      <div className="p-6">
        <MachinesManager />
      </div>
    </div>
  );
}
