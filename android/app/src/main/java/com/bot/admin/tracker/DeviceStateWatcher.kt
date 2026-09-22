package com.bot.admin.tracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Watches the handful of device settings that can stop background tracking, and
 * writes each change to TrackerEventLog.
 *
 * These are the things an employee changes without any idea it affects
 * attendance — switching GPS off to save battery, turning on battery saver at
 * 15%, flipping airplane mode on a train — and the things the system does on
 * their behalf, like entering Doze. None of them produce an error, a toast, or
 * anything at all on the server: location simply stops arriving, and later
 * somebody says the app is broken.
 *
 * Registered and unregistered with the tracking service, so it observes the
 * on-duty window and nothing else. That is the honest scope: we do not watch an
 * employee's phone settings when they are not working, and "GPS was off all
 * evening" is neither our business nor evidence of anything.
 *
 * Every registration is individually guarded. A receiver that cannot be
 * registered on some OEM build must cost us a missing event type, never the
 * tracking service.
 */
class DeviceStateWatcher(private val ctx: Context) {

    private var systemReceiver: BroadcastReceiver? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    fun start() {
        // Establish the baseline before subscribing, so the first real change is
        // recorded as a change rather than as an arrival.
        sampleAll()
        registerSystemReceiver()
        registerNetworkCallback()
    }

    fun stop() {
        try {
            systemReceiver?.let { ctx.applicationContext.unregisterReceiver(it) }
        } catch (t: Throwable) {
            Log.w(TAG, "receiver unregister: ${t.message}")
        }
        systemReceiver = null

        try {
            networkCallback?.let {
                (ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as ConnectivityManager).unregisterNetworkCallback(it)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "network callback unregister: ${t.message}")
        }
        networkCallback = null
    }

    // ── system settings ───────────────────────────────────────────────────────

    private fun registerSystemReceiver() {
        try {
            val filter = IntentFilter().apply {
                addAction(LocationManager.PROVIDERS_CHANGED_ACTION)
                addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
                }
            }

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    // Re-read the live state rather than trusting the intent's
                    // extras: PROVIDERS_CHANGED in particular carries nothing
                    // useful on several Android versions, and a stale extra
                    // would log the opposite of what happened.
                    sampleAll()
                }
            }

            // NOT_EXPORTED is mandatory on API 34+ for a runtime receiver with a
            // non-system filter, and correct everywhere else too: nothing here
            // needs to be reachable by another app. Via ContextCompat because
            // the raw three-argument overload means something different before
            // API 33.
            ContextCompat.registerReceiver(
                ctx.applicationContext, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            systemReceiver = receiver
        } catch (t: Throwable) {
            Log.w(TAG, "Could not register system receiver: ${t.message}")
        }
    }

    /**
     * Read every watched setting and log whatever changed.
     *
     * One sampler for all of them, called from every trigger, because the
     * broadcasts are unreliable individually — some OEMs never send
     * POWER_SAVE_MODE_CHANGED — and the de-duplication in recordTransition makes
     * over-sampling free.
     */
    fun sampleAll() {
        val app = ctx.applicationContext

        // GPS. `isLocationEnabled` is the master switch; the provider check is
        // the pre-P equivalent. This is the single most common cause of a
        // tracking gap, which is why it is first.
        try {
            val lm = app.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val on = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                lm.isLocationEnabled
            } else {
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            }
            TrackerEventLog.recordTransition(
                app, "st_gps", on, TrackerEventLog.GPS_ON, TrackerEventLog.GPS_OFF,
                // Starting a shift with location already switched off is the
                // single most useful thing this log can say.
                logFirstWhen = false,
            )
        } catch (t: Throwable) {
            Log.w(TAG, "gps sample: ${t.message}")
        }

        // Battery saver. Android aggressively throttles location updates in this
        // mode, so a device here is not broken but will report sparsely — a
        // distinction worth being able to make when reading a thin day.
        try {
            val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
            TrackerEventLog.recordTransition(
                app, "st_powersave", pm.isPowerSaveMode,
                TrackerEventLog.POWER_SAVE_ON, TrackerEventLog.POWER_SAVE_OFF,
                logFirstWhen = true,
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                TrackerEventLog.recordTransition(
                    app, "st_doze", pm.isDeviceIdleMode,
                    TrackerEventLog.DOZE_ON, TrackerEventLog.DOZE_OFF,
                    logFirstWhen = null,
                )
            }
        } catch (t: Throwable) {
            Log.w(TAG, "power sample: ${t.message}")
        }

        // Airplane mode. Logged separately from network_off because the cause is
        // deliberate rather than incidental, and the two want different advice.
        try {
            val on = Settings.Global.getInt(
                app.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0,
            ) != 0
            TrackerEventLog.recordTransition(
                app, "st_airplane", on,
                TrackerEventLog.AIRPLANE_ON, TrackerEventLog.AIRPLANE_OFF,
                logFirstWhen = true,
            )
        } catch (t: Throwable) {
            Log.w(TAG, "airplane sample: ${t.message}")
        }

        sampleBattery()
    }

    /**
     * Log battery only at 10% boundaries and on charger changes.
     *
     * Every percent would be ~100 rows a day per employee for a number that is
     * only ever read as "was it about to die". The boundary is crossed
     * downwards only — a phone on charge climbing back through 40% is not why
     * tracking stopped.
     */
    private fun sampleBattery() {
        try {
            val app = ctx.applicationContext
            val (level, charging) = TrackerEventLog.readBattery(app)
            if (level == null) return

            val prefs = app.getSharedPreferences("bot_tracker_events", Context.MODE_PRIVATE)
            val lastBucket = prefs.getInt("st_batt_bucket", -1)
            val lastCharging = if (prefs.contains("st_charging")) prefs.getBoolean("st_charging", false) else null
            val bucket = level / 10

            val chargingChanged = charging != null && lastCharging != null && charging != lastCharging
            val droppedABucket = lastBucket >= 0 && bucket < lastBucket

            prefs.edit()
                .putInt("st_batt_bucket", bucket)
                .apply {
                    if (charging != null) putBoolean("st_charging", charging)
                }
                .commit()

            if (droppedABucket || chargingChanged) {
                TrackerEventLog.record(app, TrackerEventLog.BATTERY)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "battery sample: ${t.message}")
        }
    }

    // ── connectivity ──────────────────────────────────────────────────────────

    private fun registerNetworkCallback() {
        try {
            val cm = ctx.applicationContext
                .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val transport = try {
                        val caps = cm.getNetworkCapabilities(network)
                        when {
                            caps == null -> "unknown"
                            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
                            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                            else -> "other"
                        }
                    } catch (t: Throwable) {
                        "unknown"
                    }

                    // Transport rides along in meta but is NOT part of the
                    // transition key: switching wifi -> mobile keeps the
                    // employee online, and logging that as a reconnection would
                    // bury the outages that actually matter. recordTransition
                    // is a no-op when we were already up.
                    TrackerEventLog.recordTransition(
                        ctx.applicationContext, "st_network", true,
                        TrackerEventLog.NETWORK_ON, TrackerEventLog.NETWORK_OFF,
                        mapOf("transport" to transport),
                        logFirstWhen = false,
                    )
                }

                override fun onLost(network: Network) {
                    // onLost fires per-network, so losing wifi while mobile data
                    // is up is not an outage. Ask the manager what is actually
                    // left rather than assuming this was the last one.
                    val stillUp = try {
                        val active = cm.activeNetwork
                        val caps = active?.let { cm.getNetworkCapabilities(it) }
                        caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                    } catch (t: Throwable) {
                        false
                    }
                    TrackerEventLog.recordTransition(
                        ctx.applicationContext, "st_network", stillUp,
                        TrackerEventLog.NETWORK_ON, TrackerEventLog.NETWORK_OFF,
                        logFirstWhen = false,
                    )
                }
            }

            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (t: Throwable) {
            Log.w(TAG, "Could not register network callback: ${t.message}")
        }
    }

    companion object {
        private const val TAG = "BgTracker/State"
    }
}
