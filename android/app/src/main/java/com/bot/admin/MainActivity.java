package com.bot.admin;

import android.os.Bundle;
import com.bot.admin.tracker.BackgroundTrackerPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
