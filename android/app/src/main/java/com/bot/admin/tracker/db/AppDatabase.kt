package com.bot.admin.tracker.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [LocationEntity::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun locationDao(): LocationDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        /**
         * v1 -> v2: activitySource / activityConfidence.
         *
         * A real migration rather than the destructive fallback, because this
         * table is an OUTBOX. Anything still queued is a fix that has not
         * reached the server yet -- typically because the phone has been offline
         * -- so dropping the table on upgrade would silently delete exactly the
         * attendance evidence that was hardest to collect.
         *
         * Existing rows default to "speed": they were labelled by the old
         * GPS-speed rule, and saying so is what lets the server know not to
         * trust them.
         */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE location_queue ADD COLUMN activitySource TEXT NOT NULL DEFAULT 'speed'")
                db.execSQL("ALTER TABLE location_queue ADD COLUMN activityConfidence INTEGER NOT NULL DEFAULT 0")
            }
        }

        fun get(context: Context): AppDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "bot_tracker.db"
                )
                .addMigrations(MIGRATION_1_2)
                // Retained as a last resort only: a queue that cannot be opened
                // at all is worse than one that has been emptied.
                .fallbackToDestructiveMigration(true)
                .build()
                .also { INSTANCE = it }
            }
    }
}

