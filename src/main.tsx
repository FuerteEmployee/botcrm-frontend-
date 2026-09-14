import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { getRouter } from "./router";
import { initClientTelemetry } from "./lib/client-telemetry";
import { initLiveUpdates, markBundleHealthy } from "./lib/live-update";
import "./styles.css";
import "virtual:pwa-register";

// In the Capacitor native app a service worker must not persist. Capacitor
// serves the bundled web assets locally, and a Workbox precache survives APK
// updates (Android keeps app data on update), so a stale service worker keeps
// serving OLD code and freshly built changes never appear. Tear down any
// service worker + caches left over from earlier builds so the WebView always
// runs the code shipped inside the current APK.
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

// Installs the global error handlers and reports the build/permission state.
// Safe before login — the senders no-op without a session and pick it up from
// the bot-auth-change event.
initClientTelemetry();

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
