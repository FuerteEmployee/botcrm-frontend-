import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bot.admin',
  appName: 'BOT Admin',
  webDir: 'dist',
  plugins: {
    // Over-the-air updates, self-hosted. The app is a web bundle in a WebView,
    // so replacing that bundle replaces the UI and most logic without anyone
    // reinstalling — which matters because APKs are handed to clients by hand.
    //
    // Only the WEB layer ships this way. New native plugins, Android
    // permissions, or a Capacitor upgrade still need a real APK.
    CapacitorUpdater: {
      // Our own endpoint, not Capgo Cloud. It knows which tenant is asking
      // (via setCustomId after login), so staged rollout is a query rather
      // than a paid feature.
      // Overridable so a staging build does not depend on anyone remembering
      // to hand-edit this file before `cap sync` and hand-edit it back after.
      // Getting that wrong points staging testers at the PRODUCTION bundle and
      // therefore the production database, silently, which is the one outcome
      // the separate staging stack exists to prevent.
      //   CAP_OTA_URL=https://staging-api.beontimeofficial.com/api/app/update npx cap sync android
      updateUrl: process.env.CAP_OTA_URL || 'https://api.beontimeofficial.com/api/app/update',
      autoUpdate: true,

      // The safety net, and the reason self-hosting is acceptable here.
      // If a freshly installed bundle does not call notifyAppReady() within
      // this window, the plugin restores the previous one by itself. Without
      // it, shipping a bundle that crashes on launch would brick every device
      // with no way to push a fix — the exact situation OTA exists to avoid.
      appReadyTimeout: 10000,

      // Clean up after a failed install and reclaim the superseded bundle.
      autoDeleteFailed: true,
      autoDeletePrevious: true,

      // A slow or captive network must not hold up app start.
      responseTimeout: 20,
    },
  },
};

export default config;
