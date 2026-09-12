package com.bot.admin.tracker

import android.content.Context

/**
 * Tiny SharedPreferences wrapper holding everything the foreground service
 * and BootReceiver need to keep tracking WITHOUT the WebView.
 * The JS layer pushes values in via start(); the service reads them back
 * even after the app process is gone.
 */
object Prefs {
    private const val FILE = "bot_tracker_prefs"

    private const val KEY_TOKEN       = "token"
    private const val KEY_API_BASE    = "apiBase"
    private const val KEY_SESSION_ID  = "sessionId"
    private const val KEY_EMPLOYEE_ID = "employeeId"
    private const val KEY_ACTIVE      = "trackingActive"
    private const val KEY_LAST_FIX_AT = "lastFixAt"

    private fun sp(ctx: Context) =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun save(
        ctx: Context,
        token: String,
        apiBase: String,
        sessionId: String,
        employeeId: String
    ) {
        sp(ctx).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_API_BASE, apiBase)
            .putString(KEY_SESSION_ID, sessionId)
            .putString(KEY_EMPLOYEE_ID, employeeId)
            .putBoolean(KEY_ACTIVE, true)
            .apply()
    }

    fun clearActive(ctx: Context) {
        sp(ctx).edit().putBoolean(KEY_ACTIVE, false).apply()
    }

    fun setLastFixAt(ctx: Context, epochMs: Long) {
        sp(ctx).edit().putLong(KEY_LAST_FIX_AT, epochMs).apply()
    }

    fun token(ctx: Context): String      = sp(ctx).getString(KEY_TOKEN, "") ?: ""
    fun apiBase(ctx: Context): String    = sp(ctx).getString(KEY_API_BASE, "") ?: ""
    fun sessionId(ctx: Context): String  = sp(ctx).getString(KEY_SESSION_ID, "") ?: ""
    fun employeeId(ctx: Context): String = sp(ctx).getString(KEY_EMPLOYEE_ID, "") ?: ""
    fun isActive(ctx: Context): Boolean  = sp(ctx).getBoolean(KEY_ACTIVE, false)
    fun lastFixAt(ctx: Context): Long    = sp(ctx).getLong(KEY_LAST_FIX_AT, 0L)
}

