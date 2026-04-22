package com.forexyemeni.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BootReceiver - Restarts SignalService after device reboot
 * Ensures notifications continue working even after the phone is restarted
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device booted — restarting SignalService");
            try {
                Intent serviceIntent = new Intent(context, SignalService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
                Log.d(TAG, "SignalService restarted after boot");
            } catch (Exception e) {
                Log.e(TAG, "Failed to restart SignalService after boot", e);
                // Fallback to alarm polling
                SignalPollReceiver.startPolling(context);
            }
        }
    }
}
