/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register";

/**
 * Keep an installed PWA on the current build.
 *
 * `registerType: 'autoUpdate'` sounds like it handles this, and on a browser tab
 * it very nearly does: the service worker checks itself on every page LOAD, and
 * `skipWaiting` + `clientsClaim` mean a new one takes over at once.
 *
 * A home-screen PWA barely ever loads a page. iOS and Android keep the web view
 * alive and RESUME it, so an app opened in the morning and used all week never
 * navigates, never re-registers, and therefore never asks whether a newer build
 * exists. It sits on whatever shipped the day it was installed -- which is
 * exactly the "the home-screen shortcut isn't updating" report.
 *
 * Two things were needed. The server side is done: index.html, sw.js,
 * registerSW.js and the manifest are served `no-cache, must-revalidate`, because
 * they previously carried no Cache-Control at all and browsers applied heuristic
 * caching -- the worker asked for a newer copy of itself and was handed the old
 * one out of the HTTP cache. This file is the client side: ask on a timer, and
 * ask whenever the app comes back to the foreground.
 */

/** How often to ask while the app stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Don't re-check more than this often on rapid foreground/background flips. */
const MIN_RECHECK_MS = 5 * 60 * 1000;

let lastCheck = 0;

export function initPwaUpdates(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  /**
   * Reload once the new worker is actually in charge.
   *
   * With skipWaiting the new worker activates immediately, but the PAGE keeps
   * running the JavaScript it already parsed -- so without this the app updates
   * its cache and carries on showing the old build until something happens to
   * reload it. `controllerchange` is the moment the swap is real.
   *
   * Guarded against loops, and deliberately NOT fired for the very first
   * controller: on a first visit the page goes from no controller to one, which
   * is not an update and must not bounce a user who has just arrived.
   */
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = () => {
        const now = Date.now();
        if (now - lastCheck < MIN_RECHECK_MS) return;
        lastCheck = now;
        // Never allowed to throw: a failed update check (offline, captive
        // portal, the server mid-deploy) must leave the running app alone.
        registration.update().catch(() => {});
      };

      setInterval(check, CHECK_INTERVAL_MS);

      // The one that actually matters for an installed app: this is the only
      // signal a resumed PWA reliably gets.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);

      // And once on startup, after the app has settled, so a user who opens a
      // long-dormant install is on the current build within a few seconds.
      setTimeout(check, 10_000);
    },
  });

  // Exposed for a manual "check for updates" control, and so the import is not
  // dropped as unused.
  (window as unknown as { __botCheckForUpdate?: () => void }).__botCheckForUpdate = () => {
    lastCheck = 0;
    void updateSW(true);
  };
}
