package com.bot.admin.tracker

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat

/**
 * Restarts tracking after a device reboot, but only if a session was active
 * when the device went down.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            action != "com.htc.intent.action.QUICKBOOT_POWERON"
        ) return

        if (!Prefs.isActive(context)) {
            Log.i("BgTracker/Boot", "Boot — no active session, not resuming.")
            return
        }

        val hasLocation =
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (!hasLocation) {
            Log.w("BgTracker/Boot", "Boot — active session but no location permission; not resuming.")
            return
        }

        Log.i("BgTracker/Boot", "Boot — resuming tracking service.")
        val svc = Intent(context, LocationTrackingService::class.java)
            .apply { this.action = LocationTrackingService.ACTION_START }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc)
        } else {
            context.startService(svc)
        }
    }
}

