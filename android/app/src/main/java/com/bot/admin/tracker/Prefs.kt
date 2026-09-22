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
    private const val KEY_INSTALL_ID  = "installId"
    private const val KEY_BOOT_PROOF  = "bootRestartAt"

    private fun sp(ctx: Context) =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun save(
        ctx: Context,
        token: String,
        apiBase: String,
        sessionId: String,
        employeeId: String,
        installId: String = ""
    ) {
        val e = sp(ctx).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_API_BASE, apiBase)
            .putString(KEY_SESSION_ID, sessionId)
            .putString(KEY_EMPLOYEE_ID, employeeId)
            .putBoolean(KEY_ACTIVE, true)
        // Only overwrite when the caller actually knows it. An older web bundle
        // does not send installId, and blanking a known one would orphan the
        // device's whole event timeline.
        if (installId.isNotBlank()) e.putString(KEY_INSTALL_ID, installId)
        e.apply()
    }

    /**
     * Remember that BootReceiver successfully resumed tracking after a reboot.
     *
     * This is the ONLY hard evidence that the OEM autostart permission is
     * granted. No Android API exposes that setting, so the alternative is asking
     * the employee and believing the answer — which is how an admin ends up
     * looking at "Auto-start: granted" for a phone that has never once come back
     * from a reboot. A timestamp here means we watched it happen.
     */
    fun markBootRestart(ctx: Context) {
        sp(ctx).edit().putLong(KEY_BOOT_PROOF, System.currentTimeMillis()).apply()
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
    fun installId(ctx: Context): String  = sp(ctx).getString(KEY_INSTALL_ID, "") ?: ""
    /** 0 when we have never observed a successful restart after a reboot. */
    fun bootRestartAt(ctx: Context): Long = sp(ctx).getLong(KEY_BOOT_PROOF, 0L)
}

