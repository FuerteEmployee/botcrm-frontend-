import { useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openAppSettings } from "@/plugins/background-tracker";
import type { DeveloperOptionsGate } from "@/hooks/use-developer-options-gate";

// Full-screen, unmissable, no way to dismiss or work around it. This replaces
// the ENTIRE employee app -- header, punch card, bottom navigation, all of
// it -- for as long as Developer Options is on, because the concern is not
// "the punch button specifically" but that the setting makes every location
// this phone reports untrustworthy.
export function DeveloperOptionsBlock({ gate }: { gate: DeveloperOptionsGate }) {
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    try {
      await gate.refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#FAF7F9] dark:bg-[#0D070B] px-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-3xl bg-destructive/10 grid place-items-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-black tracking-tight text-foreground">
            Turn off Developer Options to continue
          </h1>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Developer Options is switched on for this phone. That setting is what allows a fake-location app
            to override your real GPS position, so while it is on we cannot trust anything this phone reports —
            punch-in, punch-out, and every other feature are unavailable until it is switched off.
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-4 text-left space-y-1.5">
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">How to turn it off</p>
          <p className="text-[12px] leading-relaxed text-foreground/80">
            Settings → System → Developer options → toggle it off.
            <br />
            (On some phones: Settings → About phone → Developer options.)
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button className="h-10 rounded-xl font-black gap-2" disabled={checking} onClick={recheck}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            I've turned it off — check again
          </Button>
          <Button variant="ghost" className="h-9 rounded-xl text-[12px] font-bold text-muted-foreground" onClick={() => openAppSettings()}>
            Open app settings
          </Button>
        </div>
      </div>
    </div>
  );
}
