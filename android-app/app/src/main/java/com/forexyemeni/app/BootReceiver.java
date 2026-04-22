package com.forexyemeni.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BootReceiver — Survives device reboot and app update
 *
 * When the device reboots or the app is updated:
 * 1. Resets notification channels (OEMs may have lowered importance)
 * 2. Restarts SignalService (foreground service)
 * 3. Starts heartbeat alarm (backup monitoring + service restart)
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        Log.d(TAG, "Received: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {

            try {
                // 1. Reset notification channels (CRITICAL - OEMs lower importance after reboot)
                NotificationHelper.resetSignalChannels(context);
                Log.d(TAG, "Notification channels reset on boot");

                // 2. Start the foreground service
                Intent serviceIntent = new Intent(context, SignalService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }

                // 3. Start heartbeat alarm as safety net
                SignalPollReceiver.startHeartbeat(context);

                Log.d(TAG, "Service + heartbeat started after " + action);
            } catch (Exception e) {
                Log.e(TAG, "Failed to restart after " + action, e);
                // Ultimate fallback: heartbeat only
                SignalPollReceiver.startHeartbeat(context);
            }
        }
    }
}
