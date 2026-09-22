package com.bot.admin.tracker

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * What the PHONE'S MOTION SENSORS say the person is doing.
 *
 * The tracker used to derive this from the GPS speed field:
 *
 *     val activityType = if (speed > 0.5f) "moving" else "stationary"
 *
 * That is circular. GPS speed on a stationary handset is computed from the same
 * drifting positions that produce the drift, so the label agreed with the noise
 * instead of contradicting it. Measured 2026-09-18: a phone that sat on a desk
 * all morning reported 191 of its 568 fixes as "moving", with a peak speed of
 * 24.2 m/s -- 87 km/h, on a table. Meanwhile an employee who genuinely walked
 * 711 m out of the geofence was labelled "stationary" for 137 of his 162 fixes.
 * The field was worse than useless: it was confidently wrong in both directions.
 *
 * Activity Recognition reads the accelerometer instead, which is the one sensor
 * that cannot be fooled by a bad satellite fix. A phone lying still produces no
 * acceleration, so STILL is reported with high confidence no matter how far the
 * reported coordinates wander. This is the signal Google Maps uses to decide you
 * have not moved, and the reason its traces do not scribble while you sit at a
 * desk.
 *
 * Reported alongside the fix rather than acted on here. The device says what it
 * observed; the server decides what that means for a route or a distance. A
 * tracker that silently withheld fixes it believed were noise would also
 * withhold them from the geofence engine, which does its own reasoning over raw
 * data and must keep seeing everything the device saw.
 */
object ActivityRecognitionTracker {

    private const val TAG = "BOTActivity"
    private const val ACTION = "com.bot.admin.tracker.ACTIVITY_RESULT"
    private const val REQUEST_CODE = 4821

    /** How often Play Services reports. Cheap: it is sensor-driven, not GPS. */
    private const val INTERVAL_MS = 30_000L

    /**
     * Below this, a detection is a guess and is treated as unknown.
     *
     * Play Services reports confidence 0-100. Anything under this is not
     * evidence of anything, and reporting it as though it were would reintroduce
     * exactly the false certainty this class exists to remove.
     */
    private const val MIN_CONFIDENCE = 60

    @Volatile private var latest: String = "unknown"
    @Volatile private var latestConfidence: Int = 0
    @Volatile private var latestAt: Long = 0L
    @Volatile private var registered = false

    /**
     * A reading older than this is stale and must not be attached to a new fix.
     *
     * A phone can be put down and picked up; a STILL detection from ten minutes
     * ago says nothing about now, and attaching it to a current fix would let an
     * old observation suppress a real movement.
     */
    private const val MAX_AGE_MS = 5 * 60 * 1000L

    /** "still" | "walking" | "running" | "vehicle" | "cycling" | "unknown" */
    fun current(): String =
        if (System.currentTimeMillis() - latestAt > MAX_AGE_MS) "unknown" else latest

    fun confidence(): Int =
        if (System.currentTimeMillis() - latestAt > MAX_AGE_MS) 0 else latestConfidence

    /**
     * True only when the SENSORS positively say the device is still.
     *
     * "unknown" is never still. The whole point is to act on a measurement that
     * was actually taken -- an absent reading is not evidence of stillness, and
     * treating it as such would discard real movement whenever Play Services is
     * unavailable.
     */
    fun isStill(): Boolean = current() == "still" && confidence() >= MIN_CONFIDENCE

    fun hasPermission(context: Context): Boolean {
        // The runtime permission only exists on Android 10+. Below that the
        // install-time GMS permission covers it and there is nothing to ask for.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context, android.Manifest.permission.ACTIVITY_RECOGNITION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (!ActivityRecognitionResult.hasResult(intent)) return
            val result = ActivityRecognitionResult.extractResult(intent) ?: return
            val probable = result.mostProbableActivity ?: return

            val label = when (probable.type) {
                DetectedActivity.STILL -> "still"
                DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "walking"
                DetectedActivity.RUNNING -> "running"
                DetectedActivity.IN_VEHICLE -> "vehicle"
                DetectedActivity.ON_BICYCLE -> "cycling"
                // TILTING means the handset was picked up or turned over. That is
                // motion, but it is not travel -- calling it movement would credit
                // a distance for someone reaching across their own desk.
                DetectedActivity.TILTING -> "still"
                else -> "unknown"
            }

            latest = label
            latestConfidence = probable.confidence
            latestAt = System.currentTimeMillis()
            Log.d(TAG, "activity=$label confidence=${probable.confidence}")
        }
    }

    @Synchronized
    fun start(context: Context) {
        if (registered) return
        if (!hasPermission(context)) {
            Log.i(TAG, "ACTIVITY_RECOGNITION not granted - falling back to unknown")
            return
        }

        val app = context.applicationContext
        try {
            val filter = IntentFilter(ACTION)
            // Not exported: only Play Services, via our own PendingIntent,
            // should ever deliver to this.
            ContextCompat.registerReceiver(
                app, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED,
            )

            val intent = Intent(ACTION).setPackage(app.packageName)
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
            val pending = PendingIntent.getBroadcast(app, REQUEST_CODE, intent, flags)

            ActivityRecognition.getClient(app)
                .requestActivityUpdates(INTERVAL_MS, pending)
                .addOnSuccessListener { Log.i(TAG, "activity updates registered") }
                .addOnFailureListener { e -> Log.w(TAG, "activity updates failed: ${e.message}") }

            registered = true
        } catch (e: Exception) {
            // Never fatal. Losing the activity signal degrades smoothing; it must
            // not stop location tracking, which is the thing people are paid on.
            Log.w(TAG, "Could not start activity recognition: ${e.message}")
        }
    }

    @Synchronized
    fun stop(context: Context) {
        if (!registered) return
        val app = context.applicationContext
        try {
            val intent = Intent(ACTION).setPackage(app.packageName)
            var flags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
            val pending = PendingIntent.getBroadcast(app, REQUEST_CODE, intent, flags)
            ActivityRecognition.getClient(app).removeActivityUpdates(pending)
        } catch (e: Exception) {
            Log.w(TAG, "Could not stop activity recognition: ${e.message}")
        }
        try {
            app.unregisterReceiver(receiver)
        } catch (e: Exception) {
            /* not registered */
        }
        registered = false
        latest = "unknown"
        latestConfidence = 0
        latestAt = 0L
    }
}
