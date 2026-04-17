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
import java.util.HashMap;
import java.util.Map;

/**
 * SignalPollReceiver v4 - Background polling for new signals
 * - Uses AlarmManager with inexact repeating (no special permission needed)
 * - Tracks full signal state: id -> "status|category|hitTpIndex"
 * - FIRST RUN: silently records all existing signals (NO notifications)
 * - SUBSEQUENT RUNS: detects new signals AND state changes
 * - Checks BOTH status AND category for correct TP/SL detection
 */
public class SignalPollReceiver extends BroadcastReceiver {

    private static final String TAG = "SignalPoll";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "known_signal_states";
    private static final String KEY_INITIALIZED = "poll_initialized_v4";
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
                    URL url = new URL(API_URL + "?limit=10");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("User-Agent", "ForexYemeni/App/5.0");
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

                    // Check if this is the FIRST run
                    boolean isFirstRun = !isInitialized(context);

                    // Load known states: id -> "status|category|hitTpIndex"
                    Map<String, String> knownStates = loadKnownStates(context);

                    // Track new states to save
                    Map<String, String> newStates = new HashMap<>();
                    int notifiedCount = 0;

                    for (int i = 0; i < Math.min(signals.length(), 10); i++) {
                        JSONObject signal = signals.getJSONObject(i);
                        String id = signal.getString("id");
                        String status = signal.optString("status", "ACTIVE");
                        String category = signal.optString("signalCategory", "ENTRY");
                        int hitTpIndex = signal.optInt("hitTpIndex", -1);

                        // Create state key: "status|category|hitTpIndex"
                        String state = status + "|" + category + "|" + hitTpIndex;

                        String pair = signal.optString("pair", "N/A");
                        String type = signal.optString("type", "BUY");
                        double entry = signal.optDouble("entry", 0);

                        // Determine event type from BOTH status AND category
                        boolean isTpHit = "HIT_TP".equals(status) || "TP_HIT".equals(category)
                                || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category);
                        boolean isSlHit = "HIT_SL".equals(status) || "SL_HIT".equals(category)
                                || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category);

                        if (isFirstRun) {
                            // FIRST RUN: silently record all signals, do NOT notify
                            Log.d(TAG, "FIRST RUN - silently tracking: " + pair + " [" + state + "]");
                        } else if (!knownStates.containsKey(id)) {
                            // Brand new signal (not seen before after initialization)
                            if (isTpHit) {
                                showTpNotification(context, pair, hitTpIndex, category);
                                Log.d(TAG, "NEW TP signal: " + pair + " TP" + hitTpIndex + " [" + category + "]");
                            } else if (isSlHit) {
                                showSlNotification(context, pair);
                                Log.d(TAG, "NEW SL signal: " + pair);
                            } else {
                                showNewSignalNotification(context, pair, type, entry);
                                Log.d(TAG, "NEW signal: " + pair + " (" + category + ")");
                            }
                            notifiedCount++;
                        } else {
                            // Existing signal - check if state changed
                            String oldState = knownStates.get(id);
                            if (!state.equals(oldState)) {
                                // State changed! Check category to detect partial TP hits
                                if (isTpHit) {
                                    showTpNotification(context, pair, hitTpIndex, category);
                                    Log.d(TAG, "TP HIT: " + pair + " TP" + hitTpIndex + " [" + category + "] from [" + oldState + "]");
                                } else if (isSlHit) {
                                    showSlNotification(context, pair);
                                    Log.d(TAG, "SL HIT: " + pair + " from [" + oldState + "]");
                                } else {
                                    showNewSignalNotification(context, pair, type, entry);
                                    Log.d(TAG, "STATE CHANGED: " + pair + " from [" + oldState + "] to [" + state + "]");
                                }
                                notifiedCount++;
                            }
                        }

                        newStates.put(id, state);
                    }

                    // Mark as initialized after first poll completes
                    if (isFirstRun) {
                        markInitialized(context);
                        Log.d(TAG, "Polling initialized with " + newStates.size() + " existing signals (no notifications sent)");
                    }

                    // Save new states (keep max 50)
                    saveKnownStates(context, newStates, 50);

                    Log.d(TAG, "Poll complete. Notifications sent: " + notifiedCount);

                } catch (Exception e) {
                    Log.e(TAG, "Error fetching signals", e);
                }
            }
        }).start();
    }

    private void showNewSignalNotification(Context context, String pair, String type, double entry) {
        String typeAr = type.equals("BUY") ? "شراء" : "بيع";
        NotificationHelper.showNotification(context,
                "📊 إشارة جديدة — " + pair,
                typeAr + " @" + entry,
                type.equals("BUY") ? "buy" : "sell");
    }

    private void showTpNotification(Context context, String pair, int hitTpIndex, String category) {
        String catIcon, catLabel;
        if ("REENTRY_TP".equals(category)) {
            catIcon = "♻️"; catLabel = "تعويض";
        } else if ("PYRAMID_TP".equals(category)) {
            catIcon = "🔥"; catLabel = "تعزيز";
        } else {
            catIcon = "🎯"; catLabel = "هدف";
        }
        NotificationHelper.showNotification(context,
                catIcon + " " + catLabel + " محقق — " + pair,
                catLabel + " " + hitTpIndex + " تم تحقيقه بنجاح!",
                "tp_hit");
    }

    private void showSlNotification(Context context, String pair) {
        NotificationHelper.showNotification(context,
                "🛑 وقف خسارة — " + pair,
                "تم ضرب وقف الخسارة!",
                "sl_hit");
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

            Log.d(TAG, "Signal polling started (inexact, 30s interval)");
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

    private boolean isInitialized(Context context) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getBoolean(KEY_INITIALIZED, false);
        } catch (Exception e) {
            return false;
        }
    }

    private void markInitialized(Context context) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(KEY_INITIALIZED, true).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error marking initialized", e);
        }
    }

    /**
     * Load known signal states from SharedPreferences
     * Format: "id1=state1,id2=state2,..."
     */
    private Map<String, String> loadKnownStates(Context context) {
        Map<String, String> states = new HashMap<>();
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String stored = prefs.getString(KEY_KNOWN_STATES, "");
            if (!stored.isEmpty()) {
                String[] entries = stored.split(",");
                for (String entry : entries) {
                    int eq = entry.indexOf('=');
                    if (eq > 0) {
                        states.put(entry.substring(0, eq), entry.substring(eq + 1));
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading states", e);
        }
        return states;
    }

    /**
     * Save signal states to SharedPreferences
     */
    private void saveKnownStates(Context context, Map<String, String> states, int maxEntries) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            StringBuilder sb = new StringBuilder();
            int count = 0;
            for (Map.Entry<String, String> entry : states.entrySet()) {
                if (count >= maxEntries) break;
                if (sb.length() > 0) sb.append(",");
                sb.append(entry.getKey()).append("=").append(entry.getValue());
                count++;
            }
            prefs.edit().putString(KEY_KNOWN_STATES, sb.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error saving states", e);
        }
    }
}
