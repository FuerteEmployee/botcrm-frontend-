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
    val activityType: String,  // "moving" | "stationary"
    val sessionId: String?,
    val trackedAt: Long        // capture time, epoch milliseconds
)

