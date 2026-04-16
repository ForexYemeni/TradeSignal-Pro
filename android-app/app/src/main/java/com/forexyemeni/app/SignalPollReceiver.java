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
 * Uses AlarmManager with inexact repeating to avoid permission issues
 * Shows notifications when new signals are detected
 */
public class SignalPollReceiver extends BroadcastReceiver {

    private static final String TAG = "SignalPoll";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_SIGNALS = "known_signal_ids";
    private static final String API_URL = "https://trade-signal-pro.vercel.app/api/signals";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "SignalPollReceiver triggered");
        try {
            checkForNewSignals(context);
        } catch (Exception e) {
            Log.e(TAG, "Error in onReceive", e);
        }
    }

    private void checkForNewSignals(final Context context) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL(API_URL);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("User-Agent", "ForexYemeni/App/3.0");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(15000);

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

                    Set<String> knownIds = getKnownSignalIds(context);

                    int newCount = 0;
                    for (int i = 0; i < Math.min(signals.length(), 5); i++) {
                        JSONObject signal = signals.getJSONObject(i);
                        String id = signal.getString("id");
                        String category = signal.optString("signalCategory", "ENTRY");

                        if (!knownIds.contains(id)) {
                            newCount++;
                            String pair = signal.optString("pair", "N/A");
                            String type = signal.optString("type", "BUY");
                            double entry = signal.optDouble("entry", 0);
                            int hitTpIndex = signal.optInt("hitTpIndex", -1);

                            if (category.equals("TP_HIT") || category.equals("REENTRY_TP") || category.equals("PYRAMID_TP")) {
                                String tpNum = "TP" + hitTpIndex;
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

                            if (newCount >= 2) break;
                        }
                    }

                    // Update known IDs
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
        }).start();
    }

    /**
     * Start periodic polling using inexact repeating alarm (no special permission needed)
     */
    public static void startPolling(Context context) {
        try {
            NotificationHelper.createAllChannels(context);

            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, SignalPollReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context, 5001, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Use setInexactRepeating - no SCHEDULE_EXACT_ALARM permission needed
            long intervalMillis = 30 * 1000; // 30 seconds
            alarmManager.setInexactRepeating(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    System.currentTimeMillis() + intervalMillis,
                    intervalMillis,
                    pendingIntent
            );

            Log.d(TAG, "Signal polling started (inexact, 60s interval)");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start polling", e);
        }
    }

    /**
     * Stop periodic polling
     */
    public static void stopPolling(Context context) {
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, SignalPollReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context, 5001, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            alarmManager.cancel(pendingIntent);
            Log.d(TAG, "Signal polling stopped");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop polling", e);
        }
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
