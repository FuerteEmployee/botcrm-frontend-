import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Copy, Download, PackageCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CenterModal } from "@/components/shared/center-modal";
import { checkApkUpdate, formatBytes, type ApkStatus } from "@/lib/apk-update";
import { getSession } from "@/lib/auth";
import { haptic } from "@/lib/haptics";

/**
 * Offers a new APK, because OTA cannot.
 *
 * The download opens in the SYSTEM BROWSER rather than installing in place.
 * The shipped app declares a FileProvider but not REQUEST_INSTALL_PACKAGES, so
 * it cannot hand a package to Android's installer — and the build that would
 * add that permission is itself an APK, so an in-app installer could never
 * deliver the release that introduces it. Handing the URL to the browser needs
 * no native change at all, which means this works on the builds already in the
 * field instead of only on future ones.
 *
 * The copy-link fallback is not decoration. Capacitor usually routes an
 * off-origin link out to the browser, but if a WebView swallows it the button
 * does nothing visible and the employee is stuck with no way to report why.
 */

const DISMISS_KEY = "bot_apk_dismissed_code";

function dismissed(code: number): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === String(code);
  } catch {
    return false;
  }
}

function dismiss(code: number) {
  try {
    localStorage.setItem(DISMISS_KEY, String(code));
  } catch {
    /* private mode — the prompt simply reappears, which is the safe direction */
  }
}

export function ApkUpdatePrompt() {
  const [status, setStatus] = useState<ApkStatus | null>(null);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    let alive = true;
    // Behind the OTA prompt on purpose: a web bundle installs in seconds and a
    // 7 MB APK does not, so if both are waiting the cheap one should go first.
    const timer = setTimeout(async () => {
      const s = await checkApkUpdate(getSession()?.adminId);
      if (alive) setStatus(s);
    }, 9000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const release = status?.release;
  if (!release) return null;
  // A mandatory build cannot be dismissed — that is the whole difference.
  if (!status?.blocking && dismissed(release.versionCode)) return null;

  const size = formatBytes(release.sizeBytes);

  const download = () => {
    void haptic("impactMedium");
    setShowLink(true); // revealed regardless, so a swallowed link is recoverable
    window.open(release.url, "_blank", "noopener");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(release.url);
      toast.success("Download link copied");
    } catch {
      toast.error("Could not copy — long-press the link to copy it");
    }
  };

  return (
    <AnimatePresence>
      <CenterModal
        zIndex={85}
        labelledBy="apk-update-title"
        // Closable even when the update is mandatory. Dismissing the DIALOG
        // does not grant anything -- punching stays disabled server-side until
        // the build is installed -- so withholding the X only traps someone who
        // wants to read the screen behind it, or who cannot install right now.
        // A modal with no way out reads as a crash, not as a policy.
        onClose={() => { if (!status.blocking) dismiss(release.versionCode); setStatus(null); }}
        footer={
          <div className="flex flex-col gap-2">
            <Button onClick={download} className="h-11 w-full gap-2 rounded-[14px] text-xs font-semibold">
              <Download className="h-4 w-4" /> Download new app
            </Button>
            {!status.blocking && (
              <Button
                variant="ghost"
                onClick={() => { dismiss(release.versionCode); setStatus(null); }}
                className="h-10 w-full rounded-[14px] text-xs font-semibold text-slate-500"
              >
                Later
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <div
              className={`mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl ${
                status.blocking ? "bg-destructive/10" : "bg-primary/10"
              }`}
            >
              {status.blocking
                ? <ShieldAlert className="h-6 w-6 text-destructive" />
                : <PackageCheck className="h-6 w-6 text-primary" />}
            </div>
            <h4 id="apk-update-title" className="text-sm font-bold text-slate-800 dark:text-white">
              {status.blocking ? "Update required" : "A new app version is ready"}
            </h4>
            {/* Both build numbers, always.
                The two published 1.8 APKs differ only by versionCode (8 pilot,
                9 production), so a prompt naming the version alone told seven
                employees on "1.8" that "1.8" was ready -- indistinguishable
                from a bug, and the fastest way to train people to ignore
                update prompts. The comparison was right; the sentence was not. */}
            <p className="mt-1 text-[10.5px] text-slate-500">
              Version {release.versionName}
              <span className="text-slate-400"> (build {release.versionCode})</span>
              {size && <span className="text-slate-400"> &middot; {size}</span>}
            </p>
            {status.installedCode != null && (
              <p className="mt-0.5 text-[10px] text-slate-400">
                You have build {status.installedCode}
              </p>
            )}
          </div>

          {status.blocking && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[11px] leading-relaxed text-destructive">
              You can keep using the app, but punching in and out is turned off until this
              update is installed.
            </p>
          )}

          {release.notes && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-white/5 dark:bg-white/5">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                What's new
              </p>
              <p className="whitespace-pre-line text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {release.notes}
              </p>
            </div>
          )}

          <p className="text-center text-[10.5px] leading-relaxed text-slate-500">
            This opens your browser to download the app. When it finishes, tap the downloaded
            file to install. Your data stays where it is.
          </p>

          {showLink && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Download didn't start?
              </p>
              <p className="break-all text-[10px] text-slate-600 select-all dark:text-slate-300">
                {release.url}
              </p>
              <button
                type="button"
                onClick={copy}
                className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary"
              >
                <Copy className="h-3 w-3" /> Copy link
              </button>
            </div>
          )}
        </div>
      </CenterModal>
    </AnimatePresence>
  );
}
