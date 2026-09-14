package com.bot.admin.tracker.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface LocationDao {

    @Insert
    suspend fun insert(location: LocationEntity): Long

    /** Oldest-first batch so points sync in chronological order. */
    @Query("SELECT * FROM location_queue ORDER BY trackedAt ASC LIMIT :limit")
    suspend fun nextBatch(limit: Int): List<LocationEntity>

    @Query("DELETE FROM location_queue WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("SELECT COUNT(*) FROM location_queue")
    suspend fun count(): Int

    /** Drop the oldest rows so the queue never exceeds :maxRows. */
    @Query(
        "DELETE FROM location_queue WHERE id IN " +
        "(SELECT id FROM location_queue ORDER BY trackedAt ASC LIMIT :excess)"
    )
    suspend fun deleteOldest(excess: Int)

    /** Drop points older than the cutoff. */
    @Query("DELETE FROM location_queue WHERE trackedAt < :cutoff")
    suspend fun deleteOlderThan(cutoff: Long)

    /** Used by the cap check. */
    @Query("SELECT MAX(0, COUNT(*) - :maxRows) FROM location_queue")
    suspend fun countExcess(maxRows: Int): Int
}

