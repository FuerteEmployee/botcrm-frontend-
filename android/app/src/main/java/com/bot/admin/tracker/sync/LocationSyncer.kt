package com.bot.admin.tracker.sync

import android.content.Context
import android.util.Log
import com.bot.admin.tracker.Prefs
import com.bot.admin.tracker.db.AppDatabase
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Drains the Room queue to POST /api/tracking/update/batch.
 *
 * Back-off state is NOT held between sync() calls — the service coroutine loop
 * manages when to call sync(), keeping the syncer itself simple.
 *
 * HTTP contract (constraint #3):
 *   POST /api/tracking/update/batch
 *   Authorization: Bearer <token>
 *   Body: { "points": [ { lat, lng, accuracy, trackedAt (ISO), speed, batteryLevel, activityType, sessionId } ] }
 *   Response: { accepted, duplicates, rejected }
 *   Delete when accepted + duplicates covers the batch (duplicate = server already has it, safe to drop).
 *
 * Error handling (constraint #4):
 *   401 → stop the service + clear Prefs
 *   403 → stop the service
 *   other 4xx → drop those rows (don't retry)
 *   5xx / network → keep rows, caller applies back-off
 *
 * Queue cap (constraint #4):
 *   5000 rows max; oldest dropped first on insert.
 */
object LocationSyncer {
    private const val TAG   = "BgTracker/Syncer"
    private const val BATCH = 50
    private const val MAX_QUEUE = 5_000

    /** Returned by sync() to tell the caller how to react. */
    enum class Result { OK, AUTH_FAIL, TENANT_FAIL, SERVER_ERROR, NETWORK_ERROR }

    private val mutex = Mutex()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private val JSON_MT = "application/json; charset=utf-8".toMediaType()

    private fun iso(): SimpleDateFormat =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

    /**
     * Drains the queue, batch by batch.
     * @return [Result] describing the outcome of the last HTTP call.
     */
    suspend fun sync(context: Context): Result = mutex.withLock {
        val token   = Prefs.token(context)
        val apiBase = Prefs.apiBase(context).trimEnd('/')
        if (token.isBlank() || apiBase.isBlank()) {
            Log.w(TAG, "Skip sync — missing token/apiBase")
            return Result.OK
        }

        val dao = AppDatabase.get(context).locationDao()
        val url = "$apiBase/api/tracking/update/batch"

        // Enforce queue cap — drop oldest first.
        val excess = dao.countExcess(MAX_QUEUE)
        if (excess > 0) {
            dao.deleteOldest(excess)
            Log.w(TAG, "Queue cap hit — dropped $excess oldest row(s)")
        }

        while (true) {
            val batch = dao.nextBatch(BATCH)
            if (batch.isEmpty()) return Result.OK

            val isoFmt = iso()
            val points = JSONArray()
            for (loc in batch) {
                points.put(JSONObject().apply {
                    put("lat",          loc.lat)
                    put("lng",          loc.lng)
                    put("accuracy",     loc.accuracy.toDouble())
                    put("trackedAt",    isoFmt.format(Date(loc.trackedAt)))  // capture time, not send time
                    put("speed",        loc.speed.toDouble())
                    put("batteryLevel", loc.batteryLevel)
                    put("activityType", loc.activityType)
                    // How the label was obtained, so the server can trust a
                    // sensor reading and discount a speed-derived guess.
                    put("activitySource",     loc.activitySource)
                    put("activityConfidence", loc.activityConfidence)
                    put("sessionId",    loc.sessionId ?: JSONObject.NULL)
                })
            }
            val body = JSONObject().put("points", points).toString()

            val request = Request.Builder()
                .url(url)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(JSON_MT))
                .build()

            try {
                client.newCall(request).execute().use { resp ->
                    when {
                        resp.isSuccessful -> {
                            // Parse accepted + duplicates from response body.
                            val respBody = runCatching { resp.body?.string() }.getOrNull() ?: ""
                            val accepted   = parseIntField(respBody, "accepted")
                            val duplicates = parseIntField(respBody, "duplicates")
                            if (accepted + duplicates >= batch.size) {
                                // Server confirmed all rows in this batch — delete them.
                                for (loc in batch) dao.deleteById(loc.id)
                                Log.i(TAG, "Batch of ${batch.size} accepted; ${dao.count()} remaining.")
                            } else {
                                // Partial response — keep rows to be safe; log and stop.
                                Log.w(TAG, "Partial batch ack (accepted=$accepted dup=$duplicates of ${batch.size}); keeping rows.")
                                return Result.OK
                            }
                        }
                        resp.code == 401 -> {
                            Log.w(TAG, "401 — token dead. Stopping service.")
                            Prefs.clearActive(context)
                            return Result.AUTH_FAIL
                        }
                        resp.code == 403 -> {
                            Log.w(TAG, "403 — tenant lacks module. Stopping service.")
                            return Result.TENANT_FAIL
                        }
                        resp.code in 400..499 -> {
                            // Other 4xx: malformed rows — drop them, don't retry.
                            Log.w(TAG, "${resp.code} client error — dropping batch of ${batch.size}")
                            for (loc in batch) dao.deleteById(loc.id)
                        }
                        else -> {
                            // 5xx or unexpected
                            Log.w(TAG, "Server ${resp.code} — stopping sync, caller will back off.")
                            return Result.SERVER_ERROR
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Network error: ${e.message}")
                return Result.NETWORK_ERROR
            }

            if (batch.size < BATCH) return Result.OK  // queue drained
        }

        @Suppress("UNREACHABLE_CODE")
        return Result.OK
    }

    private fun parseIntField(json: String, field: String): Int = try {
        JSONObject(json).optInt(field, 0)
    } catch (_: Exception) { 0 }
}

