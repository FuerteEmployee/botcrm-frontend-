// Moves this browser to the classic site, for a company kept on the previous
// release (the backend's FROZEN_TENANT_IDS).
//
// botcrm.beontimeofficial.com serves two builds from one address: nginx picks
// the classic one when the `bot_ui=legacy` cookie is set, this one otherwise.
// Setting the cookie is not enough on its own: this build's service worker
// would keep answering from its own cache, so it is unregistered and every
// cache dropped before reloading. The saved session is left alone — the
// classic site reads the same key and the person stays signed in.
//
// The same check runs once more, earlier, as an inline script in index.html,
// so an already signed-in person is moved before any of this app is drawn.
// This copy covers the rest: the API refusing a request with code
// "frozen_tenant" (signing in on this site's login page, or a session whose
// company id the inline check could not read).

import { Capacitor } from "@capacitor/core";

function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

const COOKIE = "bot_ui=legacy; Max-Age=31536000; Path=/; SameSite=Lax";
let switching = false;

export function frozenTenants(): string[] {
  return String(import.meta.env.VITE_FROZEN_TENANTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isSwitchingToLegacy(): boolean {
  return switching;
}

export async function switchToLegacyUi(): Promise<void> {
  // An installed app carries its own screens and has no second build to go to.
  if (switching || typeof window === "undefined" || isNativeApp()) return;
  switching = true;
  document.cookie = window.location.protocol === "https:" ? `${COOKIE}; Secure` : COOKIE;
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* nothing to unregister */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* no caches */
  }
  window.location.replace("/");
}
