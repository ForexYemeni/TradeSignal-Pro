package com.forexyemeni.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * SignalPollReceiver - Background polling for new signals
 * Uses AlarmManager to periodically check for signal updates
 * Shows notifications when new signals are detected
 */
public class SignalPollReceiver extends BroadcastReceiver {

    private static final String TAG = "SignalPoll";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_SIGNALS = "known_signal_ids";
    private static final String EXTRA_FORCE_CHECK = "force_check";
    private static final String API_URL = "https://trade-signal-pro.vercel.app/api/signals";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "SignalPollReceiver triggered");
        boolean forceCheck = intent != null && intent.getBooleanExtra(EXTRA_FORCE_CHECK, false);

        // Run network call in a thread
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    checkForNewSignals(context);
                } catch (Exception e) {
                    Log.e(TAG, "Error checking signals", e);
                }
            }
        }).start();

        // Schedule next poll
        scheduleNextPoll(context);
    }

    /**
     * Check the signals API for new signals
     */
    private void checkForNewSignals(Context context) {
        try {
            URL url = new URL(API_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                Log.w(TAG, "API returned " + responseCode);
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();
            conn.disconnect();

            JSONObject json = new JSONObject(response.toString());
            JSONArray signals = json.optJSONArray("signals");
            if (signals == null || signals.length() == 0) {
                Log.d(TAG, "No signals found");
                return;
            }

            // Get previously known signal IDs
            Set<String> knownIds = getKnownSignalIds(context);

            // Check for new signals (most recent first)
            int newCount = 0;
            for (int i = 0; i < Math.min(signals.length(), 5); i++) {
                JSONObject signal = signals.getJSONObject(i);
                String id = signal.getString("id");
                String status = signal.optString("status", "ACTIVE");
                String category = signal.optString("signalCategory", "ENTRY");

                if (!knownIds.contains(id)) {
                    newCount++;
                    String pair = signal.optString("pair", "N/A");
                    String type = signal.optString("type", "BUY");
                    double entry = signal.optDouble("entry", 0);
                    int hitTpIndex = signal.optInt("hitTpIndex", -1);

                    // Determine notification type based on category
                    if (category.equals("TP_HIT") || category.equals("REENTRY_TP") || category.equals("PYRAMID_TP")) {
                        String tpNum = "TP" + (hitTpIndex + 1);
                        NotificationHelper.showNotification(context,
                                "🎯 هدف محقق — " + pair,
                                tpNum + " تم تحقيقه بنجاح!",
                                "tp_hit");
                    } else if (category.equals("SL_HIT") || category.equals("REENTRY_SL") || category.equals("PYRAMID_SL")) {
                        NotificationHelper.showNotification(context,
                                "🛑 وقف خسارة — " + pair,
                                "تم ضرب وقف الخسارة!",
                                "sl_hit");
                    } else if (category.equals("ENTRY") || category.equals("REENTRY") || category.equals("PYRAMID")) {
                        String typeAr = type.equals("BUY") ? "شراء" : "بيع";
                        NotificationHelper.showNotification(context,
                                "📊 إشارة جديدة — " + pair,
                                typeAr + " @" + entry,
                                type.equals("BUY") ? "buy" : "sell");
                    }

                    // Only notify for the first 2 new signals to avoid spam
                    if (newCount >= 2) break;
                }
            }

            // Update known IDs with current signals (keep last 50)
            Set<String> newKnownIds = new HashSet<>();
            for (int i = 0; i < Math.min(signals.length(), 50); i++) {
                newKnownIds.add(signals.getJSONObject(i).getString("id"));
            }
            saveKnownSignalIds(context, newKnownIds);

            Log.d(TAG, "Poll complete. New signals: " + newCount);

        } catch (Exception e) {
            Log.e(TAG, "Error fetching signals", e);
        }
    }

    /**
     * Schedule the next polling alarm
     */
    public static void scheduleNextPoll(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, SignalPollReceiver.class);
        // Use REQUEST_CODE = 5001 for signal polling
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 5001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long intervalMillis = 30 * 1000; // 30 seconds
        long triggerAtMillis = System.currentTimeMillis() + intervalMillis;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else {
            alarmManager.setRepeating(AlarmManager.RTC_WAKEUP, triggerAtMillis, intervalMillis, pendingIntent);
        }
    }

    /**
     * Start periodic polling
     */
    public static void startPolling(Context context) {
        // Create notification channels first
        NotificationHelper.createAllChannels(context);

        // Schedule first poll
        scheduleNextPoll(context);
        Log.d(TAG, "Signal polling started");
    }

    /**
     * Stop periodic polling
     */
    public static void stopPolling(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, SignalPollReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 5001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "Signal polling stopped");
    }

    private Set<String> getKnownSignalIds(Context context) {
        Set<String> ids = new HashSet<>();
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String stored = prefs.getString(KEY_KNOWN_SIGNALS, "");
            if (!stored.isEmpty()) {
                String[] arr = stored.split(",");
                for (String s : arr) {
                    if (!s.isEmpty()) ids.add(s);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error reading known signals", e);
        }
        return ids;
    }

    private void saveKnownSignalIds(Context context, Set<String> ids) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            StringBuilder sb = new StringBuilder();
            for (String id : ids) {
                if (sb.length() > 0) sb.append(",");
                sb.append(id);
            }
            prefs.edit().putString(KEY_KNOWN_SIGNALS, sb.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error saving known signals", e);
        }
    }
}
