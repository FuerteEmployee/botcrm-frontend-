package com.bot.admin.tracker.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One queued GPS point, persisted to native SQLite (Room).
 * Survives WebView death, process kill, and reboot.
 * Rows are deleted only after the backend confirms receipt.
 */
@Entity(tableName = "location_queue")
data class LocationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lat: Double,
    val lng: Double,
    val accuracy: Float,       // metres; 9999f if unavailable
    val speed: Float,          // m/s
    val batteryLevel: Int,     // 0..100
    val activityType: String,  // "still" | "walking" | "running" | "vehicle" | "cycling" | "moving" | "stationary"
    val sessionId: String?,
    val trackedAt: Long,       // capture time, epoch milliseconds

    // ── How activityType was arrived at ──────────────────────────────────────
    //
    // "sensor" means Activity Recognition read the accelerometer. "speed" means
    // it was inferred from the GPS speed field, which on a stationary handset is
    // computed from the same drifting positions it is meant to explain -- a desk
    // phone reported 87 km/h that way.
    //
    // Recorded rather than assumed because BOTH will be arriving at the server
    // at once: every APK already in the field sends speed-derived labels, and
    // will keep doing so until it is replaced. Without this the server cannot
    // tell a measured "still" from a guessed one, and would have to distrust
    // both -- which would waste the new signal entirely.
    val activitySource: String = "speed",
    val activityConfidence: Int = 0   // 0-100; 0 when unknown
)

