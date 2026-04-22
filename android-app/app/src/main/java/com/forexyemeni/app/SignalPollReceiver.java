package com.forexyemeni.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * SignalPollReceiver v8 — HEARTBEAT ONLY (no signal checking)
 *
 * CRITICAL CHANGE: Removed all signal checking from this receiver.
 * Only ONE component should detect and notify signals: SignalService.
 * This receiver's ONLY job is:
 * 1. Check if SignalService is alive (via heartbeat timestamp)
 * 2. Restart it if dead
 * 3. Schedule next heartbeat
 */
public class SignalPollReceiver extends BroadcastReceiver {

    private static final String TAG = "Heartbeat";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_LAST_SERVICE_HB = "service_last_heartbeat";
    private static final int REQUEST_CODE = 5001;
    private static final long HEARTBEAT_INTERVAL = 15_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Heartbeat triggered");

        // ALWAYS schedule next heartbeat FIRST (unbreakable chain)
        scheduleNext(context);

        // Check if service is alive, restart if dead
        if (!isServiceAlive(context)) {
            Log.w(TAG, "Service is DEAD — restarting");
            restartService(context);
        }
    }

    public static void startHeartbeat(Context context) {
        try {
            NotificationHelper.createAllChannels(context);
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, SignalPollReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context, REQUEST_CODE, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            long triggerAt = System.currentTimeMillis() + HEARTBEAT_INTERVAL;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }

            Log.d(TAG, "Heartbeat scheduled in 15s");
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule heartbeat", e);
        }
    }

    private void scheduleNext(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, SignalPollReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context, REQUEST_CODE, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            long nextTrigger = System.currentTimeMillis() + HEARTBEAT_INTERVAL;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule next", e);
        }
    }

    private boolean isServiceAlive(Context context) {
        try {
            long last = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getLong(KEY_LAST_SERVICE_HB, 0);
            return (System.currentTimeMillis() - last) < 20000;
        } catch (Exception e) { return false; }
    }

    private void restartService(Context context) {
        try {
            Intent serviceIntent = new Intent(context, SignalService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.d(TAG, "SignalService restarted");
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart", e);
        }
    }
}
