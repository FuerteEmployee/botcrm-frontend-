package com.bot.admin.tracker.sync

import android.content.Context
import android.util.Log
import com.bot.admin.BuildConfig
import com.bot.admin.tracker.Prefs
import com.bot.admin.tracker.TrackerEventLog
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Drains TrackerEventLog to POST /api/client/events.
 *
 * Kept separate from LocationSyncer, which it otherwise closely resembles,
 * because the two have opposite failure postures. A location fix is attendance
 * evidence: it is retried hard and kept for days rather than lost. A device
 * event is a diagnostic: it must never delay, block or fail a location sync,
 * and dropping one is a smaller loss than letting its retry interfere with the
 * data payroll is computed from.
 *
 * That difference is why this never reports auth failure upward and never asks
 * the caller to back off. Whatever happens here, tracking carries on.
 */
object EventSyncer {
    private const val TAG = "BgTracker/EventSync"

    /**
     * Sent per request. The server caps a batch at 500 and budgets 400 events
     * per ten minutes, so a smaller batch than the location syncer's keeps a
     * device that queued a long offline spell from spending its whole
     * allowance in one request and losing the remainder.
     */
    private const val BATCH = 100

    private val mutex = Mutex()

    // Its own client with tighter timeouts than LocationSyncer's. Diagnostics
    // do not deserve a 20-second wait on a bad connection while the location
    // queue is behind them.
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val JSON_MT = "application/json; charset=utf-8".toMediaType()

    /**
     * Upload one batch, dropping it locally only once the server has it.
     *
     * Returns quietly on every failure. The rows stay queued and the next sync
     * tick tries again; the queue's own cap is what stops that growing forever.
     */
    suspend fun sync(context: Context) = mutex.withLock {
        try {
            val token = Prefs.token(context)
            val apiBase = Prefs.apiBase(context).trimEnd('/')
            if (token.isBlank() || apiBase.isBlank()) return@withLock

            val queued = TrackerEventLog.peek(context)
            if (queued.length() == 0) return@withLock

            val take = minOf(BATCH, queued.length())
            val events = JSONArray()
            for (i in 0 until take) events.put(queued.get(i))

            val body = JSONObject()
                .put("events", events)
                // Ties the timeline to one install. A reinstall mints a new id,
                // which is correct: it is a different device history.
                .put("installId", Prefs.installId(context))
                .put("appVersion", BuildConfig.VERSION_NAME)
                .toString()

            val request = Request.Builder()
                .url("$apiBase/api/client/events")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(JSON_MT))
                .build()

            client.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> {
                        // Drop the batch whether or not every row was accepted:
                        // the server rejects a row for being malformed or out of
                        // budget, and both are permanent for that row. Retrying
                        // it would block the queue behind something that can
                        // never succeed.
                        TrackerEventLog.drop(context, take)
                        Log.i(TAG, "flushed $take event(s)")
                    }

                    // 401/403 deliberately do NOT stop the service here, unlike
                    // LocationSyncer. A diagnostics endpoint refusing us is not
                    // evidence the employee's session is dead, and ending their
                    // tracking over it would be a far worse outcome than losing
                    // some events. LocationSyncer owns that decision.
                    resp.code == 401 || resp.code == 403 -> {
                        Log.w(TAG, "auth rejected (${resp.code}) — leaving tracking alone")
                    }

                    resp.code in 400..499 -> {
                        // Our payload is wrong and will stay wrong. Drop it
                        // rather than wedge the queue.
                        TrackerEventLog.drop(context, take)
                        Log.w(TAG, "dropped $take event(s) on ${resp.code}")
                    }

                    else -> Log.w(TAG, "server error ${resp.code} — keeping events queued")
                }
            }
        } catch (t: Throwable) {
            // Network down, DNS failure, anything. Keep the rows and try later.
            Log.w(TAG, "event sync failed: ${t.message}")
        }
    }
}
