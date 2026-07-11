import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { getRouter } from "./router";
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

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
