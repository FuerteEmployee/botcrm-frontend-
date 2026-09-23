package com.bot.admin.tracker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * A small durable queue of device-state transitions, drained to the server by
 * EventSyncer.
 *
 * WHY NOT ROOM, like the location queue?
 *
 * Because most of what is worth recording happens at moments when a database is
 * the wrong tool: inside a BroadcastReceiver with a ~10 second budget, in
 * onTaskRemoved as the app is being swiped away, in BootReceiver before
 * anything else is up. SharedPreferences.commit() is synchronous, needs no
 * schema, and is already open. Volume is a few dozen rows a day per device
 * rather than the thousands the location queue carries, so the cost of a
 * read-modify-write of the whole array is irrelevant.
 *
 * It is also deliberately independent of the location queue's lifecycle: an
 * employee whose tracking has stopped is precisely the one whose events matter,
 * and events must survive being recorded when there is nothing else running.
 *
 * WHAT IT IS NOT: this is diagnostics, not an audit trail. It records what the
 * phone reported about itself. A device with a wrong clock produces events with
 * a wrong `at`, which is why the server keeps its own receive time alongside.
 */
object TrackerEventLog {
    private const val TAG = "BgTracker/Events"
    private const val FILE = "bot_tracker_events"
    private const val KEY = "queue"

    /**
     * Oldest are dropped past this. Sized for a device offline for a couple of
     * days: well beyond any realistic burst, still far too small to matter to
     * SharedPreferences. A cap is not optional — a phone flapping between wifi
     * and mobile in a lift would otherwise write until storage filled.
     */
    private const val MAX_QUEUED = 300

    // Event names. Must match the enum in backend/src/models/TrackerEvent.js —
    // anything else is counted as rejected there and silently dropped.
    const val GPS_ON            = "gps_on"
    const val GPS_OFF           = "gps_off"
    const val NETWORK_ON        = "network_on"
    const val NETWORK_OFF       = "network_off"
    const val POWER_SAVE_ON     = "power_save_on"
    const val POWER_SAVE_OFF    = "power_save_off"
    const val DOZE_ON           = "doze_on"
    const val DOZE_OFF          = "doze_off"
    const val AIRPLANE_ON       = "airplane_on"
    const val AIRPLANE_OFF      = "airplane_off"
    const val SERVICE_START     = "service_start"
    const val SERVICE_STOP      = "service_stop"
    const val TASK_REMOVED      = "task_removed"
    const val BOOT_RESTART      = "boot_restart"
    const val WATCHDOG_RESTART  = "watchdog_restart"
    const val PERMISSION_LOST   = "permission_lost"
    const val FG_DENIED         = "fg_denied"
    /**
     * start() was asked for and the service did not come up.
     *
     * Its absence is what made a whole missing afternoon unexplainable: the
     * plugin rejected the call, the TS wrapper turned that into a console
     * warning nobody sees, and the only remaining trace was a 20-hour hole in
     * the fixes. Carries `stage` (dispatch | confirm) and, when there is one,
     * the exception class -- "which of the two ways did it fail" is the whole
     * question.
     */
    const val START_FAILED      = "start_failed"
    const val FIX_GAP           = "fix_gap"
    const val BATTERY           = "battery"

    private fun sp(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private fun iso(ms: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(ms))

    /**
     * Append one event. Never throws: every caller is either a receiver on a
     * deadline or a service in the middle of something more important, and none
     * of them can do anything useful with a failure here.
     *
     * Battery is attached to every event rather than only to battery events,
     * because "what was the charge doing at the time" is the follow-up question
     * for almost all of them.
     */
    @JvmStatic
    @JvmOverloads
    fun record(ctx: Context, type: String, meta: Map<String, Any?>? = null) {
        try {
            val (level, charging) = readBattery(ctx)

            val row = JSONObject()
                .put("type", type)
                .put("at", iso(System.currentTimeMillis()))
            if (level != null) row.put("batteryLevel", level)
            if (charging != null) row.put("charging", charging)
            if (!meta.isNullOrEmpty()) {
                val m = JSONObject()
                for ((k, v) in meta) if (v != null) m.put(k, v)
                row.put("meta", m)
            }

            synchronized(this) {
                val arr = readQueue(ctx)
                arr.put(row)

                // Drop from the front once over cap. Oldest-first because the
                // recent transitions are the ones that explain a complaint
                // being made now.
                val trimmed = if (arr.length() > MAX_QUEUED) {
                    val out = JSONArray()
                    for (i in (arr.length() - MAX_QUEUED) until arr.length()) out.put(arr.get(i))
                    out
                } else arr

                sp(ctx).edit().putString(KEY, trimmed.toString()).commit()
            }

            Log.i(TAG, "recorded $type")
        } catch (t: Throwable) {
            Log.w(TAG, "Could not record $type: ${t.message}")
        }
    }

    /**
     * Records only when the value actually changed since the last call.
     *
     * PROVIDERS_CHANGED and the connectivity callback both fire repeatedly for
     * a single user action — toggling GPS once can deliver four broadcasts —
     * and a timeline showing "GPS off" four times in the same second is worse
     * than useless, because it hides the one that was real.
     */
    @JvmStatic
    @JvmOverloads
    fun recordTransition(
        ctx: Context,
        stateKey: String,
        on: Boolean,
        onType: String,
        offType: String,
        meta: Map<String, Any?>? = null,
        logFirstWhen: Boolean? = null,
    ) {
        try {
            val prefs = sp(ctx)
            val prev = if (prefs.contains(stateKey)) prefs.getBoolean(stateKey, false) else null
            if (prev != null && prev == on) return
            prefs.edit().putBoolean(stateKey, on).commit()

            // FIRST OBSERVATION IS NOT A TRANSITION.
            //
            // On a fresh install there is no previous value, so every watched
            // setting looks like it "just changed" to whatever it already was.
            // The first version of this suppressed that only when the value was
            // `on`, which was wrong for half the callers: airplane mode, battery
            // saver and Doze are all normally OFF, so a brand new install logged
            // airplane_off + power_save_off + doze_off in the same second as
            // service_start. Three events, nothing happened, and they sat at the
            // top of the timeline above the ones that meant something.
            //
            // `on` cannot decide this by itself because it means opposite things
            // to different callers -- true is GOOD for GPS and BAD for battery
            // saver. So the caller declares which first-sight value is worth a
            // row: normally the state that harms tracking, since arriving to
            // find GPS already off does explain a missing day, while arriving to
            // find airplane mode already off explains nothing.
            if (prev == null && on != logFirstWhen) return

            record(ctx, if (on) onType else offType, meta)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not record transition $stateKey: ${t.message}")
        }
    }

    /** Everything queued, as the JSON the batch endpoint expects. Does not clear. */
    @JvmStatic
    fun peek(ctx: Context): JSONArray = synchronized(this) { readQueue(ctx) }

    /**
     * Drop the first [count] rows — called only after the server has accepted
     * them.
     *
     * Count-based rather than "clear everything", because a flush and a new
     * event can race: clearing wholesale would silently discard anything
     * recorded while the upload was in flight.
     */
    @JvmStatic
    fun drop(ctx: Context, count: Int) {
        if (count <= 0) return
        synchronized(this) {
            try {
                val arr = readQueue(ctx)
                val out = JSONArray()
                for (i in count until arr.length()) out.put(arr.get(i))
                sp(ctx).edit().putString(KEY, out.toString()).commit()
            } catch (t: Throwable) {
                Log.w(TAG, "Could not drop $count: ${t.message}")
            }
        }
    }

    private fun readQueue(ctx: Context): JSONArray =
        try {
            JSONArray(sp(ctx).getString(KEY, "[]") ?: "[]")
        } catch (t: Throwable) {
            // Corrupt store. Starting clean loses diagnostics; refusing to
            // start loses them permanently and wedges every future write.
            JSONArray()
        }

    /**
     * Battery without registering anything: ACTION_BATTERY_CHANGED is sticky,
     * so a null receiver returns the last broadcast immediately.
     */
    @JvmStatic
    fun readBattery(ctx: Context): Pair<Int?, Boolean?> = try {
        val intent: Intent? = ctx.applicationContext
            .registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

        if (intent == null) null to null
        else {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val pct = if (level >= 0 && scale > 0) (level * 100) / scale else null

            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val charging = when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
                BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
                else -> null
            }
            pct to charging
        }
    } catch (t: Throwable) {
        null to null
    }
}
