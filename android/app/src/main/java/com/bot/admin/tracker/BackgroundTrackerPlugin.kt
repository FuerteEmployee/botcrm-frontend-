package com.bot.admin.tracker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.bot.admin.tracker.db.AppDatabase
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Capacitor plugin bridge for the BOT HRMS background GPS tracker.
 *
 * JS API (constraint #10):
 *   start({ token, apiBase, employeeId, sessionId })
 *   stop()
 *   getStatus()  → { active, queued, lastFixAt, permissionState }
 *   requestPermissions() → { fine, background, notifications }
 *   event "trackerStatus" emitted with same shape as getStatus
 *
 * getStatus() MUST NOT use runBlocking on the bridge thread (constraint #10).
 * We use a coroutine + notifyListeners to return the value asynchronously
 * while still resolving the call synchronously with a snapshot.
 */
@CapacitorPlugin(
    name = "BackgroundTracker",
    permissions = [
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ]
        ),
        Permission(
            alias = "background",
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION]
        ),
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        )
    ]
)
class BackgroundTrackerPlugin : Plugin() {

    companion object {
        private const val TAG = "BgTracker/Plugin"
    }

    // Coroutine scope for off-thread DB access (count query for getStatus).
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // ── start ─────────────────────────────────────────────────────────────────

    @PluginMethod
    fun start(call: PluginCall) {
        val token      = call.getString("token") ?: ""
        val apiBase    = call.getString("apiBase") ?: ""
        val employeeId = call.getString("employeeId") ?: ""
        val sessionId  = call.getString("sessionId") ?: ""

        if (token.isBlank() || apiBase.isBlank()) {
            call.reject("token and apiBase are required")
            return
        }

        Prefs.save(context, token, apiBase, sessionId, employeeId)

        val intent = Intent(context, LocationTrackingService::class.java)
            .apply { action = LocationTrackingService.ACTION_START }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            Log.i(TAG, "start() dispatched (session=$sessionId)")
            call.resolve(JSObject().put("started", true))
        } catch (e: Exception) {
            Log.e(TAG, "start() failed: ${e.message}")
            call.reject("Failed to start tracking service: ${e.message}")
        }
    }

    // ── stop ──────────────────────────────────────────────────────────────────

    @PluginMethod
    fun stop(call: PluginCall) {
        Prefs.clearActive(context)
        val intent = Intent(context, LocationTrackingService::class.java)
            .apply { action = LocationTrackingService.ACTION_STOP }
        try { context.startService(intent) } catch (_: Exception) {}
        Log.i(TAG, "stop() dispatched")
        call.resolve()
    }

    // ── getStatus ─────────────────────────────────────────────────────────────
    //
    // Must NOT use runBlocking on the bridge thread (constraint #10).
    // We resolve immediately with what we can read synchronously (active,
    // lastFixAt, permissionState) and fill in "queued" via a coroutine.
    // The event "trackerStatus" is emitted once the coroutine finishes so the
    // TS layer can update after the promise resolves.
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val active    = Prefs.isActive(context)
        val lastFixAt = Prefs.lastFixAt(context).let { if (it == 0L) null else it }
        val permState = buildPermissionState()

        // Resolve immediately with a -1 placeholder for queued so the call
        // doesn't hang. A follow-up event carries the real count.
        val snapshot = JSObject()
            .put("active",          active)
            .put("queued",         -1)
            .put("lastFixAt",       lastFixAt)
            .put("permissionState", permState)
        call.resolve(snapshot)

        // Async: fetch real queued count and emit as event.
        pluginScope.launch {
            val queued = runCatching {
                AppDatabase.get(context).locationDao().count()
            }.getOrElse { -1 }

            val event = JSObject()
                .put("active",          active)
                .put("queued",          queued)
                .put("lastFixAt",       lastFixAt)
                .put("permissionState", permState)
            notifyListeners("trackerStatus", event)
        }
    }

    // ── requestPermissions ────────────────────────────────────────────────────

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    override fun requestPermissions(call: PluginCall) {
        // Request fine location first (must be held before requesting background).
        requestPermissionForAlias("location", call, "afterLocationPerm")
    }

    @PermissionCallback
    private fun afterLocationPerm(call: PluginCall) {
        // If API ≥ Q, now ask for background location.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            requestPermissionForAlias("background", call, "afterBackgroundPerm")
        } else {
            afterBackgroundPerm(call)
        }
    }

    @PermissionCallback
    private fun afterBackgroundPerm(call: PluginCall) {
        // If API ≥ 33, ask for notifications.
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("notifications", call, "afterNotifPerm")
        } else {
            call.resolve(buildPermResult())
        }
    }

    @PermissionCallback
    private fun afterNotifPerm(call: PluginCall) {
        call.resolve(buildPermResult())
    }

    private fun buildPermResult(): JSObject {
        val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val background = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
        } else true
        val notifications = if (Build.VERSION.SDK_INT >= 33) {
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
        } else true

        return JSObject()
            .put("fine",          fine)
            .put("background",    background)
            .put("notifications", notifications)
    }

    private fun buildPermissionState(): String {
        val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        val background = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
        } else true

        return when {
            fine && background -> "always"
            fine || coarse     -> "foreground"
            else               -> "denied"
        }
    }

    /**
     * Read every readiness signal WITHOUT prompting for anything.
     *
     * Separate from requestPermissions() because the setup screen has to be
     * able to re-check after the user returns from a Settings page. Calling the
     * requesting variant to find out the current state would re-prompt on every
     * poll, which on Android 11+ silently burns the user's two "deny" strikes
     * and permanently blocks the dialog.
     *
     * `precise` is its own field on purpose: Android 12 lets someone grant
     * location as "Approximate", which reports as GRANTED while returning
     * kilometre-fuzzed coordinates. A geofence built on that would be nonsense,
     * so the setup gate has to be able to reject it specifically.
     */
    @PluginMethod
    fun checkAllPermissions(call: PluginCall) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val batteryUnrestricted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                pm.isIgnoringBatteryOptimizations(context.packageName) else true

            val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
            val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
                    
            val background = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
                        PackageManager.PERMISSION_GRANTED
            } else true
            
            val notifications = if (Build.VERSION.SDK_INT >= 33) {
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                        PackageManager.PERMISSION_GRANTED
            } else true

            call.resolve(
                JSObject()
                    .put("fine",                fine)
                    .put("coarse",              coarse)
                    // Approximate-only is NOT good enough for a geofence.
                    .put("precise",             fine)
                    .put("background",          background)
                    .put("notifications",       notifications)
                    .put("batteryUnrestricted", batteryUnrestricted)
                    .put("locationState",       buildPermissionState())
                    .put("manufacturer",        Build.MANUFACTURER ?: "")
                    // Whether an OEM autostart screen exists to send the user to.
                    // Autostart itself cannot be READ -- no public API exposes it --
                    // so the setup flow can only take the user there and ask.
                    .put("hasAutostartScreen",  resolveAutostartIntent() != null)
            )
        } catch (e: Exception) {
            Log.e(TAG, "checkAllPermissions failed: ${e.message}", e)
            call.reject("Permission check failed: ${e.message}", e)
        }
    }

    /**
     * OEM auto-start / background-launch whitelists.
     *
     * On stock Android a foreground service survives. On MIUI, ColorOS, Funtouch
     * and One UI it does not: the OEM kills it on screen-off or reboot unless
     * the app is whitelisted on a settings screen that is not part of AOSP and
     * has no public API. This is the single most common reason background
     * tracking "works on my phone" and fails on half the workforce.
     *
     * There is no way to check the state -- only to open the screen. So the
     * setup flow opens it and asks the employee to confirm they enabled it,
     * which is why that one step is self-declared rather than verified.
     */
    private fun resolveAutostartIntent(): Intent? {
        val candidates = listOf(
            "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
            "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.asus.mobilemanager" to "com.asus.mobilemanager.entry.FunctionActivity",
            "com.htc.pitroad" to "com.htc.pitroad.landingpage.activity.LandingPageActivity",
            "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
            "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
        )
        for ((pkg, cls) in candidates) {
            val intent = Intent().apply {
                component = android.content.ComponentName(pkg, cls)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent.resolveActivity(context.packageManager) != null) return intent
        }
        return null
    }

    // ── Developer Options Check ──────────────────────────────────────────────

    @PluginMethod
    fun isDeveloperOptionsEnabled(call: PluginCall) {
        val enabled = try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0
        } catch (e: Exception) {
            false
        }
        val ret = JSObject()
        ret.put("enabled", enabled)
        call.resolve(ret)
    }

    @PluginMethod
    fun openAutostartSettings(call: PluginCall) {
        val intent = resolveAutostartIntent()
        if (intent == null) {
            // No OEM screen on this device (stock Android): fall back to the
            // app details page rather than rejecting, so the button always
            // leads somewhere useful.
            openAppDetailsSettings(call)
            return
        }
        launchOrFallback(intent, call)
    }

    // ── Battery optimization helpers ──────────────────────────────────────────

    @PluginMethod
    fun isIgnoringBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ignoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            pm.isIgnoringBatteryOptimizations(context.packageName) else true
        call.resolve(JSObject().put("ignoring", ignoring))
    }

    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            launchOrFallback(intent, call)
        } else call.resolve()
    }

    @PluginMethod
    fun openAppDetailsSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        launchOrFallback(intent, call)
    }

    private fun launchOrFallback(intent: Intent, call: PluginCall) {
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            Log.w(TAG, "Could not launch intent: ${e.message}")
            try {
                context.startActivity(
                    Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                call.resolve()
            } catch (e2: Exception) {
                call.reject("No settings activity available: ${e2.message}")
            }
        }
    }
}

