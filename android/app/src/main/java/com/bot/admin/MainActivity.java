package com.bot.admin;

import android.os.Bundle;
import com.bot.admin.tracker.BackgroundTrackerPlugin;
import com.bot.admin.tracker.CrashReporter;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // First statement in the app's life, deliberately: a crash during
        // Capacitor's own startup is the hardest kind to diagnose and the one
        // least likely to leave any other trace.
        CrashReporter.install(getApplicationContext());
        registerPlugin(BackgroundTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
