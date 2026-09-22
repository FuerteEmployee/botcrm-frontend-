package com.bot.admin.tracker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import android.util.Log
import java.util.concurrent.TimeUnit

/**
 * Brings the tracking service back after the whole app process has been killed.
 *
 * Everything else that restarts the service depends on something of ours still
 * being alive:
 *
 *   BootReceiver      only fires on device boot
 *   onTaskRemoved     only fires when the user swipes the app away, and the
 *                     alarm it schedules cannot start a foreground service from
 *                     the background on Android 12+
 *   START_STICKY      is honoured by stock Android and widely ignored by OEM
 *                     builds — Xiaomi, Oppo, Vivo and Samsung all reap
 *                     background processes on their own schedule
 *   the JS watchdog   only runs while the WebView is alive
 *
 * None of those survive the case that actually happens most: the battery
 * manager kills the process outright while the phone is in a pocket. Then
 * nothing in this app exists to notice, and tracking silently stops until the
 * employee happens to open it — which they have no reason to do, because as far
 * as they know they are punched in and being tracked.
 *
 * WorkManager is the one mechanism that survives that. Its queue lives in its
 * own database, owned by the system, so the work is still scheduled after our
 * process is gone and it is far harder for an OEM to defeat.
 *
 * Fifteen minutes is WorkManager's floor for periodic work, so a worst-case
 * outage is a fifteen-minute gap rather than the rest of the shift.
 */
class TrackerWatchdogWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext

        // Not supposed to be tracking. Nothing to heal, and restarting here
        // would put a location notification on someone who has punched out.
        if (!Prefs.isActive(ctx)) {
            cancel(ctx)
            return Result.success()
        }

        if (!hasLocationPermission(ctx)) {
            Log.w(TAG, "Active session but no location permission — not restarting.")
            return Result.success()
        }

        // Two independent symptoms, because either alone can lie.
        //
        //  · isRunning is a static on the service class. If the PROCESS was
        //    killed it is false again on the next start, which is precisely the
        //    case this worker exists for. But it is true while a service that
        //    has silently stopped producing fixes still technically exists.
        //  · lastFixAt catches that second case: the service is "up" but has
        //    delivered nothing for far longer than its own interval.
        val alive = LocationTrackingService.isRunning
        val lastFix = Prefs.lastFixAt(ctx)
        val silentFor = if (lastFix > 0) System.currentTimeMillis() - lastFix else Long.MAX_VALUE
        val stale = silentFor > STALE_AFTER_MS

        if (alive && !stale) return Result.success()

        Log.i(TAG, "Restarting tracker (alive=$alive, silentForMs=$silentFor)")

        // The clearest signal in the whole log: reaching here means the service
        // was supposed to be running and was not. `alive=false` specifically
        // means the app PROCESS had been killed — which is the OEM battery
        // manager, and is exactly the complaint this event finally makes
        // visible instead of leaving as an unexplained gap.
        TrackerEventLog.record(
            ctx, TrackerEventLog.WATCHDOG_RESTART,
            mapOf(
                "processWasKilled" to !alive,
                "silentMinutes" to if (silentFor == Long.MAX_VALUE) -1L else silentFor / 60_000L,
            ),
        )

        return try {
            val svc = Intent(ctx, LocationTrackingService::class.java)
                .apply { action = LocationTrackingService.ACTION_START }
            ContextCompat.startForegroundService(ctx, svc)
            Result.success()
        } catch (e: Exception) {
            // Android 12+ refuses most foreground-service starts from the
            // background (ForegroundServiceStartNotAllowedException). There is
            // no way around that from here and it is not an error worth
            // retrying immediately — the next periodic run tries again, and the
            // JS watchdog catches it the moment the employee opens the app.
            Log.w(TAG, "Could not start service from background: ${e.javaClass.simpleName}: ${e.message}")
            Result.success()
        }
    }

    private fun hasLocationPermission(ctx: Context): Boolean =
        ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
        ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    companion object {
        private const val TAG = "BgTracker/Watchdog"
        const val WORK_NAME = "bot_tracker_watchdog"

        /** 15 min is WorkManager's floor for periodic work. */
        private const val INTERVAL_MIN = 15L

        /**
         * How long a supposedly-running service may deliver nothing before it
         * is treated as dead. Generous against the service's own ~15s capture
         * and ~45s sync, so ordinary indoor signal loss never triggers a
         * pointless restart.
         */
        private const val STALE_AFTER_MS = 10 * 60 * 1000L

        /**
         * Scheduled when tracking starts, cancelled when it stops.
         *
         * KEEP, not REPLACE: replacing resets the 15-minute clock, so a punch-in
         * loop or an app that is opened repeatedly would push the next check
         * further and further away — the watchdog would be perpetually about to
         * run and never actually run.
         */
        @JvmStatic
        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<TrackerWatchdogWorker>(
                INTERVAL_MIN, TimeUnit.MINUTES,
            ).build()

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                req,
            )
        }

        @JvmStatic
        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork(WORK_NAME)
        }
    }
}
