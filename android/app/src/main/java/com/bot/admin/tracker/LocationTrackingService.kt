package com.bot.admin.tracker

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.bot.admin.R
import com.bot.admin.tracker.db.AppDatabase
import com.bot.admin.tracker.db.LocationEntity
import com.bot.admin.tracker.sync.EventSyncer
import com.bot.admin.tracker.sync.LocationSyncer
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.Tasks
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Foreground service that records GPS fixes independently of the WebView.
 * Keeps running when the app is backgrounded, swiped from recents, or after
 * reboot (via BootReceiver). Every valid fix is written to Room and a coroutine
 * loop POSTs the batch queue to the backend.
 *
 * Constraint compliance:
 *  #1  JVM target 21 (set in build.gradle)
 *  #2  No FCM — polls GET /api/tracking/ping-check every 30 s
 *  #3  POST /api/tracking/update/batch; trackedAt = capture time
 *  #4  401 → stopSelf + clearPrefs; 403 → stopSelf; 5xx → exponential back-off
 *  #5  Room fallbackToDestructiveMigration (in AppDatabase)
 *  #6  android:foregroundServiceType="location"; START_STICKY; try/catch startForeground
 *  #7  Stop when attendance API says no open session
 *  #8  Package com.bot.admin.tracker; channel "bot_tracking"
 */
class LocationTrackingService : Service() {

    companion object {
        /**
         * Is the service alive IN THIS PROCESS?
         *
         * Deliberately a static rather than anything persisted: if the process
         * is killed this resets to false on the next start, which is precisely
         * how TrackerWatchdogWorker detects that the whole app was reaped. A
         * persisted flag would survive the death it is meant to detect.
         */
        @Volatile
        @JvmStatic
        var isRunning: Boolean = false
            private set

        const val TAG              = "BgTracker/Service"
        const val ACTION_START     = "com.bot.admin.tracker.START"
        const val ACTION_STOP      = "com.bot.admin.tracker.STOP"
        const val ACTION_FORCE_FIX = "com.bot.admin.tracker.FORCE_FIX"

        private const val CHANNEL_ID          = "bot_tracking"
        private const val NOTIF_ID            = 9001
        private const val MOVING_INTERVAL_MS  = 15_000L
        private const val ACCURACY_THRESHOLD  = 50f      // metres — reject coarse stream fixes
        private const val HEARTBEAT_ACCURACY  = 100f     // metres — cap for heartbeat fixes
        private const val POLL_INTERVAL_MS    = 30_000L  // ping-check + attendance poll
        private const val SYNC_INTERVAL_MS    = 45_000L  // initial sync interval
        private const val BACKOFF_MAX_MS      = 15 * 60 * 1_000L  // 15 min

        /**
         * A silence longer than this is logged as a fix_gap.
         *
         * Ten minutes, well clear of the ~15 s capture interval and of any
         * ordinary indoor signal loss, so the timeline shows real outages
         * rather than a row every time somebody walks into a lift.
         */
        private const val FIX_GAP_THRESHOLD_MS = 10 * 60 * 1_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var fusedClient: FusedLocationProviderClient? = null
    private var locationManager: LocationManager? = null
    private var usingFallback = false
    private var started = false

    // Watches GPS / network / battery-saver while on duty. Null when not
    // tracking: we deliberately do not observe an employee's phone settings
    // outside their working session.
    private var deviceWatcher: DeviceStateWatcher? = null

    // ── Fused callback ───────────────────────────────────────────────────────
    private val fusedCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { enqueue(it, forced = false) }
        }
    }

    // ── LocationManager fallback (no Play Services) ──────────────────────────
    private val fallbackListener = LocationListener { loc -> enqueue(loc, forced = false) }

    // ── HTTP client for ping/attendance checks ───────────────────────────────
    private val pingClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // ── Satisfy the foreground-service contract FIRST, before any decision ──
        //
        // startForegroundService() starts a ~5 second timer. If startForeground()
        // has not been called before it expires the SYSTEM kills the entire
        // process with ForegroundServiceDidNotStartInTimeException. ActivityThread
        // throws it into the main looper, so no try/catch of ours can intercept
        // it and nothing reaches the JS error reporter — the app just vanishes,
        // leaving zero trace anywhere we can see.
        //
        // Every early return below used to skip startForeground(), and the
        // no-permission branch is the one that bit. The employee home screen
        // starts tracking the moment it mounts; on a fresh install the location
        // permission has not been granted yet; the service refused to start; and
        // the app died a few seconds later — on the first screen after login.
        //
        // So: promote unconditionally, decide afterwards, and if the decision is
        // "not now", demote and stop. A notification visible for a few hundred
        // milliseconds is a trivial price next to the app closing itself.
        val promoted = try {
            startForegroundCompat()
            true
        } catch (t: Throwable) {
            // Throwable rather than Exception: Android 12+ can raise
            // ForegroundServiceStartNotAllowedException here, and on 14+ a
            // missing FOREGROUND_SERVICE_LOCATION grant raises SecurityException.
            Log.e(TAG, "startForeground failed: ${t.javaClass.simpleName}: ${t.message}")
            TrackerEventLog.record(
                applicationContext, TrackerEventLog.FG_DENIED,
                mapOf("error" to t.javaClass.simpleName),
            )
            false
        }

        // The ONLY correct way out of onStartCommand once that timer is running.
        // Any future early return must go through here.
        fun standDown(why: String): Int {
            Log.i(TAG, "Standing down: $why")
            if (promoted) stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_STOP) {
            stopTrackingInternal()
            return standDown("stop requested")
        }

        if (!hasLocationPermission()) {
            // Recorded only when a session was supposed to be running. On a fresh
            // install this branch is simply "not set up yet", which is not a
            // fault and must not appear on the timeline as one; mid-session it
            // means the permission was revoked under us, which is the whole
            // answer to why that employee's tracking stopped.
            if (Prefs.isActive(applicationContext)) {
                TrackerEventLog.record(applicationContext, TrackerEventLog.PERMISSION_LOST)
            }
            // The UI asks for the permission on its own, and the JS watchdog
            // restarts the service within a minute of it being granted.
            return standDown("no location permission")
        }

        if (!promoted) return standDown("could not enter the foreground")

        // Admin forced fix (previously delivered via FCM; now via direct intent).
        if (intent?.action == ACTION_FORCE_FIX) {
            Log.i(TAG, "Forced fix requested")
            scope.launch {
                ensureLocationClients()
                val loc = requestSingleFix()
                if (loc != null) enqueue(loc, forced = true)
                else Log.w(TAG, "Forced fix: no location available")
            }
        }

        if (!started) {
            started = true
            isRunning = true

            TrackerEventLog.record(applicationContext, TrackerEventLog.SERVICE_START)
            deviceWatcher = DeviceStateWatcher(applicationContext).also {
                runCatching { it.start() }.onFailure { e ->
                    Log.w(TAG, "Device state watcher failed to start: ${e.message}")
                }
            }

            // Started alongside location, never as a precondition for it: if
            // activity recognition is unavailable the fixes must still flow,
            // they are simply labelled "speed" instead of "sensor".
            runCatching { ActivityRecognitionTracker.start(applicationContext) }
                .onFailure { e -> Log.w(TAG, "Activity recognition failed to start: ${e.message}") }

            startLocationUpdates()
            startPollLoop()   // covers heartbeat, ping-check, and attendance check
            startSyncLoop()

            // The only restart path that survives this process being killed.
            // Scheduled here rather than from the JS layer so it is tied to the
            // service actually running, not to someone remembering to call it.
            try {
                TrackerWatchdogWorker.schedule(applicationContext)
            } catch (t: Throwable) {
                // Throwable: a WorkManager linkage failure surfaces as
                // NoClassDefFoundError, which is an Error. Tracking itself is
                // already running by this point and must not be taken down by
                // the failure of something whose only job is to restart it.
                Log.w(TAG, "Could not schedule watchdog: ${t.javaClass.simpleName}: ${t.message}")
            }

            Log.i(TAG, "Tracking started (fallback=$usingFallback)")
        }

        return START_STICKY
    }

    // ── Location acquisition ─────────────────────────────────────────────────

    private fun startLocationUpdates() {
        if (!hasLocationPermission()) { Log.e(TAG, "No location perm"); return }
        usingFallback = !playServicesAvailable()

        if (!usingFallback) {
            try {
                fusedClient = LocationServices.getFusedLocationProviderClient(this)
                val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, MOVING_INTERVAL_MS)
                    .setMinUpdateDistanceMeters(15f)
                    .setMinUpdateIntervalMillis(MOVING_INTERVAL_MS)
                    .setWaitForAccurateLocation(false)
                    .build()
                fusedClient?.requestLocationUpdates(req, fusedCallback, Looper.getMainLooper())
                Log.i(TAG, "Using FusedLocationProvider")
            } catch (e: SecurityException) {
                Log.e(TAG, "Fused SecurityException: ${e.message}")
            }
        } else {
            try {
                locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
                locationManager?.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    MOVING_INTERVAL_MS,
                    15f,
                    fallbackListener,
                    Looper.getMainLooper()
                )
                Log.i(TAG, "Using LocationManager fallback (no Play Services)")
            } catch (e: SecurityException) {
                Log.e(TAG, "LocationManager SecurityException: ${e.message}")
            }
        }
    }

    private fun ensureLocationClients() {
        if (fusedClient == null && !usingFallback) {
            runCatching { fusedClient = LocationServices.getFusedLocationProviderClient(this) }
                .onFailure { Log.w(TAG, "Fused client unavailable: ${it.message}") }
        }
        if (locationManager == null) {
            locationManager = getSystemService(LOCATION_SERVICE) as? LocationManager
        }
    }

    private fun requestSingleFix(): Location? = try {
        if (!usingFallback && fusedClient != null) {
            val task = fusedClient!!.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            Tasks.await(task, 10, TimeUnit.SECONDS)
        } else {
            @Suppress("MissingPermission")
            locationManager?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
        }
    } catch (e: Exception) {
        Log.w(TAG, "requestSingleFix error: ${e.message}")
        null
    }

    // ── Combined poll loop (heartbeat + ping-check + attendance) ─────────────
    //
    // Runs every 30 s (POLL_INTERVAL_MS).
    //   1. GET /api/tracking/ping-check  — keeps the connection alive (constraint #2)
    //   2. GET /api/attendance/today     — if no open session → stopSelf (constraint #7)
    //   3. Force a heartbeat GPS fix (stationary employees still record)
    //
    // Network failure on either check keeps the service running.
    private fun startPollLoop() {
        scope.launch {
            while (isActive) {
                delay(POLL_INTERVAL_MS)

                // 1. ping-check (fire-and-forget; we don't need the response body)
                val token   = Prefs.token(applicationContext)
                val apiBase = Prefs.apiBase(applicationContext).trimEnd('/')
                if (token.isNotBlank() && apiBase.isNotBlank()) {
                    pingServer("$apiBase/api/tracking/ping-check", token)

                    // 2. Attendance check — stop if no open shift.
                    checkAttendanceAndMaybeStop(apiBase, token)
                }

                // 3. Heartbeat GPS fix.
                if (!hasLocationPermission()) continue
                try {
                    val loc = requestSingleFix()
                    if (loc != null) enqueue(loc, forced = true)
                } catch (e: Exception) {
                    Log.w(TAG, "Heartbeat fix failed: ${e.message}")
                }
            }
        }
    }

    /** Fire GET; ignore response body; just keep the TCP state alive. */
    private fun pingServer(url: String, token: String) {
        try {
            val req = Request.Builder()
                .url(url)
                .addHeader("Authorization", "Bearer $token")
                .get()
                .build()
            pingClient.newCall(req).execute().use { /* discard */ }
        } catch (_: Exception) { /* network down — keep running */ }
    }

    /**
     * GET /api/attendance/today → JSON with punchIn/punchOut/shifts.
     * If the response indicates no open session, stop the service.
     * Network errors are ignored — never stop on a failed check (constraint #7).
     */
    private fun checkAttendanceAndMaybeStop(apiBase: String, token: String) {
        try {
            val req = Request.Builder()
                .url("$apiBase/api/attendance/today")
                .addHeader("Authorization", "Bearer $token")
                .get()
                .build()
            pingClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return   // network/server issue — keep running
                val body = resp.body?.string() ?: return
                if (!hasOpenSession(body)) {
                    Log.i(TAG, "Attendance API: no open session — stopping service.")
                    Prefs.clearActive(applicationContext)
                    stopSelf()
                }
            }
        } catch (_: Exception) {
            // Network failure: keep running.
        }
    }

    /**
     * Parses the attendance response.
     * Returns true if there is a punchIn without a punchOut,
     * OR if any element in the "shifts" array is open (no punchOut).
     */
    private fun hasOpenSession(json: String): Boolean {
        return try {
            val obj = JSONObject(json)
            // Check top-level punchIn / punchOut
            val hasPunchIn  = obj.optString("punchIn", "").isNotBlank()
            val hasPunchOut = obj.optString("punchOut", "").isNotBlank()
            if (hasPunchIn && !hasPunchOut) return true
            // Check shifts array
            val shifts = obj.optJSONArray("shifts")
            if (shifts != null) {
                for (i in 0 until shifts.length()) {
                    val shift = shifts.optJSONObject(i) ?: continue
                    val sIn  = shift.optString("punchIn", "").isNotBlank()
                    val sOut = shift.optString("punchOut", "").isNotBlank()
                    if (sIn && !sOut) return true
                }
            }
            false
        } catch (_: Exception) {
            true  // parse error — assume still active (safe side)
        }
    }

    // ── Sync loop with exponential back-off ──────────────────────────────────
    private fun startSyncLoop() {
        scope.launch {
            // Drain any backlog from a previous session immediately.
            runSyncWithBackoff()
            while (isActive) {
                delay(SYNC_INTERVAL_MS)
                runSyncWithBackoff()
            }
        }
    }

    private suspend fun runSyncWithBackoff() {
        // Events ride the same tick but are never allowed to affect it: no
        // back-off, no auth handling, no result. Diagnostics must not be able to
        // delay or stop the upload of attendance evidence.
        runCatching { EventSyncer.sync(applicationContext) }

        var backoff = SYNC_INTERVAL_MS
        while (true) {
            val result = runCatching {
                LocationSyncer.sync(applicationContext)
            }.getOrElse {
                Log.w(TAG, "Sync threw: ${it.message}")
                LocationSyncer.Result.NETWORK_ERROR
            }

            // Say WHY the phone went quiet.
            //
            // The syncer already knew it was failing and told nobody, so a
            // 24-minute upload outage left no trace at all: no event, and a
            // 39-minute hole in the timeline that looked identical to a phone
            // that was simply idle. Recording it as a connectivity transition
            // reuses the existing pair, so it shows up in the admin's
            // Connectivity section as an outage WITH A DURATION rather than as
            // unexplained silence.
            //
            // recordTransition de-dupes, so a long back-off writes one row when
            // it starts failing and one when it recovers -- not one per retry.
            TrackerEventLog.recordTransition(
                applicationContext,
                "st_sync",
                result == LocationSyncer.Result.OK,
                TrackerEventLog.NETWORK_ON,
                TrackerEventLog.NETWORK_OFF,
                mapOf("cause" to result.name),
                // Arriving to find uploads already failing is worth a row;
                // arriving to find them working is not.
                false,
            )

            when (result) {
                LocationSyncer.Result.OK -> return
                LocationSyncer.Result.AUTH_FAIL -> {
                    Prefs.clearActive(applicationContext)
                    stopSelf()
                    return
                }
                LocationSyncer.Result.TENANT_FAIL -> {
                    stopSelf()
                    return
                }
                LocationSyncer.Result.SERVER_ERROR,
                LocationSyncer.Result.NETWORK_ERROR -> {
                    Log.w(TAG, "Sync back-off ${backoff}ms")
                    delay(backoff)
                    backoff = (backoff * 2).coerceAtMost(BACKOFF_MAX_MS)
                }
            }
        }
    }

    // ── Persist a fix ─────────────────────────────────────────────────────────

    private fun enqueue(location: Location, forced: Boolean) {
        val accuracy = if (location.hasAccuracy()) location.accuracy else 9999f
        if (!forced && accuracy > ACCURACY_THRESHOLD) {
            Log.d(TAG, "Drop low-accuracy stream fix (${accuracy}m > ${ACCURACY_THRESHOLD}m)")
            return
        }
        if (forced && accuracy > HEARTBEAT_ACCURACY) {
            Log.d(TAG, "Drop low-accuracy heartbeat fix (${accuracy}m > ${HEARTBEAT_ACCURACY}m)")
            return
        }
        val speed = if (location.hasSpeed()) location.speed else 0f

        // Sensors first. The GPS-speed rule stays as the fallback for handsets
        // where Play Services cannot report activity (permission refused, or no
        // recent reading), but it is labelled honestly so the server knows which
        // it is looking at. A guessed "stationary" and a measured "still" are
        // not the same claim and must not be stored as though they were.
        // Retry registration on every fix until it takes.
        //
        // start() is called once when the service starts, and it no-ops when the
        // permission is missing. On an UPDATE that is the normal case: the
        // employee granted location long ago, so the setup gate never reappears
        // and ACTIVITY_RECOGNITION is not held at boot -- which left the tracker
        // permanently on the GPS-speed fallback even after the permission was
        // later granted. Observed on the first three 1.9 installs: all three
        // kept reporting the old stationary/moving vocabulary.
        //
        // Cheap to repeat: start() returns immediately once registered, and
        // checks the permission itself before doing anything.
        ActivityRecognitionTracker.start(applicationContext)

        val sensorActivity = ActivityRecognitionTracker.current()
        val usingSensor    = sensorActivity != "unknown"
        val activityType   = if (usingSensor) sensorActivity
                             else if (speed > 0.5f) "moving" else "stationary"

        val entity = LocationEntity(
            lat               = location.latitude,
            lng               = location.longitude,
            accuracy          = accuracy,
            speed             = speed,
            batteryLevel      = batteryLevel(),
            activityType      = activityType,
            sessionId         = Prefs.sessionId(this).ifBlank { null },
            trackedAt         = System.currentTimeMillis(),  // capture time, never send time
            activitySource    = if (usingSensor) "sensor" else "speed",
            activityConfidence = if (usingSensor) ActivityRecognitionTracker.confidence() else 0
        )
        // A silence far longer than the capture interval is the symptom an
        // employee describes as "it stopped working". Recording it here gives
        // the gap a start, an end and a battery level, which together usually
        // identify the cause without anyone having to ask them.
        val prevFixAt = Prefs.lastFixAt(this)
        if (prevFixAt > 0) {
            val gapMs = entity.trackedAt - prevFixAt
            if (gapMs > FIX_GAP_THRESHOLD_MS) {
                TrackerEventLog.record(
                    applicationContext, TrackerEventLog.FIX_GAP,
                    mapOf("gapMinutes" to (gapMs / 60_000L), "sinceAt" to prevFixAt),
                )
            }
        }
        Prefs.setLastFixAt(this, entity.trackedAt)
        scope.launch {
            try {
                val dao = AppDatabase.get(applicationContext).locationDao()
                dao.insert(entity)
                // Age-based cleanup: drop points older than 3 days.
                dao.deleteOlderThan(System.currentTimeMillis() - 3L * 24 * 60 * 60 * 1000)
                Log.i(TAG, "Recorded lat=${entity.lat}, lng=${entity.lng}, acc=${accuracy}m, $activityType, queued=${dao.count()}")
                // Try to push right away (no-op if offline).
                LocationSyncer.sync(applicationContext)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to persist point: ${e.message}")
            }
        }
    }

    private fun batteryLevel(): Int = try {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
    } catch (e: Exception) { 100 }

    // ── Foreground notification ───────────────────────────────────────────────

    private fun startForegroundCompat() {
        createChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Attendance tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Records your location while you are punched in"
                setShowBadge(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentPi = launchIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Attendance tracking active")
            .setContentText("Recording your location while you are punched in.")
            .setSmallIcon(R.drawable.ic_tracking_notification)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentPi)
            .build()
    }

    // ── Kill resilience ───────────────────────────────────────────────────────

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (Prefs.isActive(this)) {
            TrackerEventLog.record(applicationContext, TrackerEventLog.TASK_REMOVED)
            val restart = Intent(applicationContext, LocationTrackingService::class.java)
                .apply { action = ACTION_START }
            val pi = PendingIntent.getService(
                this, 1, restart,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val at = System.currentTimeMillis() + 1_000

            // setExactAndAllowWhileIdle, not set(): a plain set() is deferred
            // by Doze and a "restart in one second" that fires an hour later is
            // not a restart. Guarded because SCHEDULE_EXACT_ALARM can be
            // revoked by the user on Android 12+.
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, at, pi)
                }
            } catch (e: SecurityException) {
                am.set(AlarmManager.RTC_WAKEUP, at, pi)
            }

            // Belt and braces: on Android 12+ the alarm above may not be
            // permitted to start a foreground service from the background at
            // all. The watchdog is the path that still works there.
            try {
                TrackerWatchdogWorker.schedule(applicationContext)
            } catch (_: Throwable) {}

            Log.i(TAG, "onTaskRemoved — restart scheduled in 1 s")
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun stopTrackingInternal() {
        // Was there actually a session to stop?
        //
        // ACTION_STOP reaches here whether or not the service was running, and
        // the JS watchdog re-checks status every 60s, so stopping something
        // already stopped is routine. Recording it anyway made a no-op the most
        // common entry on the timeline: one real device logged 136 service_stop
        // against 18 service_start, seconds apart, burying the network and GPS
        // events the log exists to show -- and burning both the 300-event
        // on-device cap and the server's per-employee budget to do it.
        //
        // Same rule the permission_lost branch above already applies: a
        // non-event must not appear on the timeline as an event.
        val wasRunning = started || isRunning

        started = false
        isRunning = false

        if (wasRunning) {
            TrackerEventLog.record(applicationContext, TrackerEventLog.SERVICE_STOP)
        }
        runCatching { deviceWatcher?.stop() }
        deviceWatcher = null
        Prefs.clearActive(this)

        // A deliberate stop must also stop the watchdog, or it would helpfully
        // restart tracking for somebody who has punched out.
        try {
            TrackerWatchdogWorker.cancel(applicationContext)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not cancel watchdog: ${t.javaClass.simpleName}: ${t.message}")
        }
        try { fusedClient?.removeLocationUpdates(fusedCallback) } catch (_: Exception) {}
        try { locationManager?.removeUpdates(fallbackListener) } catch (_: Exception) {}
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION") stopForeground(true)
        }
    }

    override fun onDestroy() {
        // Cleared here as well as in stopTrackingInternal: the system can
        // destroy the service without any deliberate stop, and a stale `true`
        // would convince the watchdog everything is fine while nothing runs.
        isRunning = false
        Log.i(TAG, "onDestroy")
        try { fusedClient?.removeLocationUpdates(fusedCallback) } catch (_: Exception) {}
        try { locationManager?.removeUpdates(fallbackListener) } catch (_: Exception) {}
        runCatching { ActivityRecognitionTracker.stop(applicationContext) }
        scope.cancel()
        super.onDestroy()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun hasLocationPermission(): Boolean =
        ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
        ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun playServicesAvailable(): Boolean =
        GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(this) == ConnectionResult.SUCCESS
}

