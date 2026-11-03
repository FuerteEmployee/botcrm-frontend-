package com.bot.admin.tracker

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Records the stack trace of a fatal native crash so the next launch can upload
 * it through the existing /client/error pipeline.
 *
 * WHY THIS EXISTS
 *
 * The people who use this app are warehouse and field staff, not engineers.
 * They will never produce a logcat, and the only report that reaches us is "it
 * closed". That was survivable while every fault was a JavaScript fault, because
 * client-telemetry.ts catches those. It stopped being survivable the first time
 * the SYSTEM killed the process: a foreground-service contract violation in
 * LocationTrackingService took the app down on the first screen after login and
 * left **zero** evidence anywhere — no JS error, no server log, nothing. The
 * cause had to be found by reading code and reasoning about Android's service
 * contract, which took a whole build cycle. Once is enough.
 *
 * Note what this does NOT do: it does not try to keep the app alive. A process
 * that has thrown out of its main handler is in an undefined state and pressing
 * on is worse than dying. It records, then it lets the platform finish.
 *
 * Deliberately tiny and dependency-free — this runs inside a process that is
 * already dying, so anything clever is just a second crash on top of the first.
 */
object CrashReporter {
    private const val TAG = "BgTracker/Crash"
    private const val PREFS = "bot_crash"
    private const val KEY = "last"

    @Volatile
    private var installed = false

    /**
     * Idempotent, and safe to call before Capacitor has started. Install it as
     * early in onCreate as possible: a crash during startup is exactly the kind
     * that is hardest to diagnose by any other means.
     */
    @JvmStatic
    fun install(ctx: Context) {
        if (installed) return
        installed = true

        val previous = Thread.getDefaultUncaughtExceptionHandler()
        val app = ctx.applicationContext

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val sw = StringWriter()
                error.printStackTrace(PrintWriter(sw))

                val payload = JSONObject()
                    .put("at", System.currentTimeMillis())
                    .put("thread", thread.name)
                    .put("type", error.javaClass.name)
                    .put("message", error.message ?: "")
                    .put("stack", sw.toString().take(8000))

                // commit(), not apply(): apply() is asynchronous and this process
                // will not be alive long enough to flush it.
                app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY, payload.toString())
                    .commit()

                Log.e(TAG, "Fatal on ${thread.name}: ${error.javaClass.name}: ${error.message}")
            } catch (t: Throwable) {
                // Nothing useful left to do. Never let the recorder become the
                // reason the crash handler itself fails.
            }

            // Always hand back to the platform so the process dies the normal
            // way. If there is no previous handler, end it ourselves rather than
            // leaving a half-dead process sitting on the user's screen.
            if (previous != null) {
                previous.uncaughtException(thread, error)
            } else {
                android.os.Process.killProcess(android.os.Process.myPid())
                System.exit(10)
            }
        }
    }

    /**
     * Returns the stored crash as a JSON string and clears it, so one crash is
     * reported exactly once. Null when there is nothing — the normal case.
     */
    @JvmStatic
    fun takeLast(ctx: Context): String? {
        return try {
            val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val stored = prefs.getString(KEY, null) ?: return null
            prefs.edit().remove(KEY).apply()
            stored
        } catch (t: Throwable) {
            Log.w(TAG, "Could not read stored crash: ${t.message}")
            null
        }
    }
}
