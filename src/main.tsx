import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { getRouter } from "./router";
import { initClientTelemetry } from "./lib/client-telemetry";
import { installHapticToasts } from "./lib/haptic-toast";
import { initLiveUpdates, markBundleHealthy } from "./lib/live-update";
import "./styles.css";
import { initPwaUpdates } from "./lib/pwa-update";

// In the Capacitor native app a service worker must not persist. Capacitor
// serves the bundled web assets locally, and a Workbox precache survives APK
// updates (Android keeps app data on update), so a stale service worker keeps
// serving OLD code and freshly built changes never appear. Tear down any
// service worker + caches left over from earlier builds so the WebView always
// runs the code shipped inside the current APK.
if (!Capacitor.isNativePlatform()) {
  // Web + installed PWA only. The native shell deliberately removes service
  // workers (see below), so registering one there would undo that.
  initPwaUpdates();
}

if (Capacitor.isNativePlatform()) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => {});
  }
  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((keys) => keys.forEach((key) => caches.delete(key)))
      .catch(() => {});
  }
}

/**
 * Recover from a chunk that no longer exists.
 *
 * Routes are code-split, so navigating fetches a JS file named with the hash
 * of the build that was loaded. If a deploy lands while someone has the app
 * open, the page they are on still references the OLD names — and once the
 * server has replaced them, the next navigation rejects and React unmounts to
 * a blank screen with nothing on it to explain why.
 *
 * Reloading picks up the new index.html and therefore the new names. The
 * sessionStorage flag makes it a one-shot: if the reload does not fix it the
 * cause is something else, and retrying forever would be a reload loop that is
 * far worse than the original failure.
 */
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "bot_chunk_reloaded";
  let alreadyTried = true;
  try {
    alreadyTried = sessionStorage.getItem(KEY) === "1";
    if (!alreadyTried) sessionStorage.setItem(KEY, "1");
  } catch {
    // Private mode: without somewhere to record the attempt we cannot
    // guarantee a single retry, so do not reload at all.
    return;
  }
  if (alreadyTried) return;
  event.preventDefault();
  window.location.reload();
});

// A clean load means any earlier chunk failure is behind us, so the one-shot
// guard above is armed again for the next deploy.
window.addEventListener("load", () => {
  try {
    sessionStorage.removeItem("bot_chunk_reloaded");
  } catch { /* nothing to clear */ }
});

// Installs the global error handlers and reports the build/permission state.
// Safe before login — the senders no-op without a session and pick it up from
// the bot-auth-change event.
initClientTelemetry();

// Must run before anything can raise a toast, so no action's feedback is
// missed on the way to the first screen.
installHapticToasts();

const router = getRouter();

initLiveUpdates();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

// Confirm to the live-update plugin that this bundle actually runs. If this
// never fires, the plugin rolls back to the previous bundle after
// appReadyTimeout (10s) — the safety net that makes pushing code to every
// phone at once recoverable.
//
// Deliberately AFTER render() and inside a frame callback: calling it at
// module load would mark a bundle healthy that might still crash while
// mounting, defeating the rollback entirely.
requestAnimationFrame(() => {
  void markBundleHealthy();
});

/**
 * Take down the boot screen in index.html once React has actually painted.
 *
 * Two frames, not one: the first fires after render() has been *scheduled*, the
 * second after the browser has committed it. Removing on the first leaves a
 * flash of empty page between the splash disappearing and the first route
 * drawing — the exact gap the boot screen exists to cover.
 *
 * The timeout is a backstop, not the mechanism. If a route's beforeLoad throws,
 * or a lazy chunk fails to fetch, the frame callbacks still run but the app
 * never draws; without a deadline the splash would sit there looking like a
 * hang, with the real error hidden behind it. Better to reveal a broken screen
 * than to hide it.
 */
function clearBootScreen() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.dataset.hide = "1";
  // Matches the 280ms opacity transition, then removes it from the tree so it
  // can never intercept a tap.
  window.setTimeout(() => boot.remove(), 320);
}

requestAnimationFrame(() => requestAnimationFrame(clearBootScreen));
window.setTimeout(clearBootScreen, 8000);
