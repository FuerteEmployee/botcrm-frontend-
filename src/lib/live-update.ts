import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { getSession } from "./auth";

// Over-the-air updates for the installed Android app.
//
// APKs are handed to clients by hand, so without this every fix — however
// small — means rebuilding and chasing every client to reinstall. A Capacitor
// app is a web bundle in a WebView, so swapping that bundle ships the whole UI
// and nearly all logic without touching the device.
//
// It does NOT ship: new native plugins, Android permissions, app id/icon, or a
// Capacitor version bump. Those still need a real APK.

let ready = false;

/**
 * Tell the plugin this bundle actually works.
 *
 * THE most important call in this file. If it does not happen within
 * `appReadyTimeout` (10s, set in capacitor.config.ts), the plugin assumes the
 * update is broken and rolls back to the previous bundle on its own. That is
 * what makes shipping code to every phone at once survivable: a bundle that
 * crashes before this line gets undone instead of bricking the app with no way
 * to deliver a fix.
 *
 * Consequently: never call it optimistically at module load. It belongs after
 * React has mounted and rendered, which is the earliest point we actually know
 * the bundle runs.
 */
export async function markBundleHealthy(): Promise<void> {
  if (ready || !Capacitor.isNativePlatform()) return;
  ready = true;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // Non-native, or the plugin is unavailable in this build. Nothing to do —
    // and definitely nothing worth showing the user.
  }
}

/**
 * Tell the update server which tenant this device belongs to, so a release can
 * be piloted on one company before everyone gets it.
 *
 * Sent as Capgo's `custom_id`, which the plugin includes in every subsequent
 * update check. Called after login, since before that we genuinely don't know.
 */
export async function tagTenantForUpdates(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // `adminId` is the tenant: the admin's own id, or the parent admin's for a
  // subadmin or employee. The backend returns it from verifyOtp and matches it
  // against AppRelease.pilotAdminIds.
  const id = getSession()?.adminId;
  if (!id) return;
  try {
    await CapacitorUpdater.setCustomId({ customId: id });
  } catch {
    /* targeting is a nicety; a failure just means this device gets production */
  }
}

/**
 * Wire up live updates. Safe to call on web — everything no-ops there.
 */
export function initLiveUpdates(): void {
  if (!Capacitor.isNativePlatform()) return;

  // Re-tag on login/logout so a device that changes hands follows the right
  // rollout channel.
  window.addEventListener("bot-auth-change", () => {
    void tagTenantForUpdates();
  });

  void tagTenantForUpdates();
}
