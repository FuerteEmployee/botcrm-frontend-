import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, UploadCloud } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { available, getTrackerStatus } from "@/plugins/background-tracker";

/**
 * Tells the employee they are offline — and that it does not mean their work is
 * being lost.
 *
 * The second half is the point. Location keeps recording to an on-disk queue
 * while the phone has no network and uploads when it returns; an employee who
 * assumes tracking is broken is an employee who turns it off. So the banner
 * leads with reassurance and, where the native tracker can tell us, shows how
 * many fixes are actually waiting.
 *
 * Not a modal and not dismissible: it disappears by itself the moment the
 * network comes back, and there is nothing for the employee to acknowledge.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => {
    if (online || !available()) {
      setQueued(null);
      return;
    }

    let cancelled = false;
    const read = async () => {
      const status = await getTrackerStatus();
      // -1 is "not known yet", not "empty" — the native side resolves the
      // count asynchronously. Showing it as zero would tell someone with a
      // three-hour backlog that nothing is waiting.
      if (!cancelled) setQueued(status && status.queued >= 0 ? status.queued : null);
    };

    read();
    const timer = setInterval(read, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [online]);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-4 flex items-start gap-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10"
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-amber-900 dark:text-amber-200">
              No internet connection
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-200/70">
              Your location is still being recorded and will upload on its own once you
              reconnect. You cannot punch in or out until then.
            </p>
            {queued !== null && queued > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                <UploadCloud className="h-3 w-3" />
                {queued} location{queued === 1 ? "" : "s"} waiting to upload
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
