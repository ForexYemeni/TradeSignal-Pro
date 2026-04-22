package com.forexyemeni.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
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
 * SignalPollReceiver v6 — Heartbeat + Fallback Signal Monitor
 *
 * TWO CRITICAL JOBS:
 * 1. HEARTBEAT: Checks if SignalService is alive. If dead → RESTARTS it.
 *    Fires every 15 seconds. This ensures the service NEVER stays dead.
 *
 * 2. SIGNAL CHECK: If the service is dead, this receiver checks for signals
 *    directly so the user never misses an alert.
 *
 * Uses EXACT alarms (Android 12+ SCHEDULE_EXACT_ALARM) for precise timing.
 * Uses WAKE_LOCK to wake CPU from doze mode.
 */
public class SignalPollReceiver extends BroadcastReceiver {

    private static final String TAG = "Heartbeat";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_POLL_STATES = "heartbeat_signal_states_v6";
    private static final String KEY_POLL_INIT = "heartbeat_initialized_v6";
    private static final String KEY_LAST_SERVICE_HB = "service_last_heartbeat";
    private static final String KEY_SESSION_TOKEN = "fy_session_token";
    private static final String API_UPDATES = "https://trade-signal-pro.vercel.app/api/signals/updates";
    private static final String API_SIGNALS = "https://trade-signal-pro.vercel.app/api/signals";
    private static final int REQUEST_CODE = 5001;
    private static final long HEARTBEAT_INTERVAL = 15_000; // 15 seconds

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Heartbeat triggered");

        // ── JOB 1: Check if service is alive, restart if dead ──
        if (!isServiceAlive(context)) {
            Log.w(TAG, "Service is DEAD — restarting immediately");
            restartService(context);
        }

        // ── JOB 2: Check for new signals (as backup) ──
        try {
            checkForSignals(context);
        } catch (Exception e) {
            Log.e(TAG, "Error checking signals", e);
        }
    }

    /**
     * Start the heartbeat alarm — fires every 15 seconds
     */
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (am.canScheduleExactAlarms()) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    } else {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    }
                } else {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }

            Log.d(TAG, "Heartbeat started — next in 15s");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start heartbeat", e);
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
                }
            } else {
                am.set(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule next heartbeat", e);
        }
    }

    private boolean isServiceAlive(Context context) {
        try {
            long last = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getLong(KEY_LAST_SERVICE_HB, 0);
            return (System.currentTimeMillis() - last) < 20000;
        } catch (Exception e) {
            return false;
        }
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
            Log.e(TAG, "Failed to restart service", e);
        }
    }

    private void checkForSignals(final Context context) {
        scheduleNext(context);

        new Thread(new Runnable() {
            @Override
            public void run() {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                PowerManager.WakeLock wl = null;
                if (pm != null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ForexYemeni:HeartbeatPoll");
                    wl.setReferenceCounted(false);
                    try { wl.acquire(15000); } catch (Exception ignored) {}
                }

                try {
                    String token = getSessionToken(context);
                    String sinceParam = "?since=0"; // Always check all signals
                    URL url = new URL(API_UPDATES + sinceParam);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("User-Agent", "ForexYemeni/App/1.10");
                    conn.setRequestProperty("Accept", "application/json");
                    if (!token.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + token);
                    }
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);

                    int code = conn.getResponseCode();
                    if (code != 200) {
                        Log.w(TAG, "API returned " + code);
                        conn.disconnect();
                        return;
                    }

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) response.append(line);
                    reader.close();
                    conn.disconnect();

                    JSONObject json = new JSONObject(response.toString());
                    boolean hasNew = json.optBoolean("hasNew", false);
                    int totalSignals = json.optInt("totalSignals", 0);

                    if (!hasNew || totalSignals == 0) return;

                    JSONArray signals = json.optJSONArray("newSignals");
                    if (signals == null || signals.length() == 0) return;

                    boolean isFirstRun = !isPollInitialized(context);
                    Map<String, String> knownStates = loadStates(context);
                    Map<String, String> newStates = new HashMap<>();
                    int notified = 0;

                    for (int i = 0; i < signals.length(); i++) {
                        JSONObject sig = signals.getJSONObject(i);
                        String id = sig.getString("id");
                        String status = sig.optString("status", "ACTIVE");
                        String category = sig.optString("signalCategory", "ENTRY");
                        int hitTpIndex = sig.optInt("hitTpIndex", -1);
                        String state = status + "|" + category + "|" + hitTpIndex;

                        String pair = sig.optString("pair", "N/A");
                        String type = sig.optString("type", "BUY");
                        double entry = sig.optDouble("entry", 0);

                        // TP detection: includes FULL TP and PARTIAL TP
                        boolean isTp = "HIT_TP".equals(status) || "TP_HIT".equals(category)
                                || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category)
                                || hitTpIndex > 0;
                        boolean isSl = "HIT_SL".equals(status) || "SL_HIT".equals(category)
                                || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category);

                        if (isFirstRun) {
                            // Silent — just track
                        } else if (!knownStates.containsKey(id)) {
                            if (isTp) { showTp(context, pair, hitTpIndex, category); notified++; }
                            else if (isSl) { showSl(context, pair); notified++; }
                            else { showEntry(context, pair, type, entry); notified++; }
                        } else if (!state.equals(knownStates.get(id))) {
                            if (isTp) { showTp(context, pair, hitTpIndex, category); notified++; }
                            else if (isSl) { showSl(context, pair); notified++; }
                            else { showEntry(context, pair, type, entry); notified++; }
                        }
                        newStates.put(id, state);
                    }

                    if (isFirstRun) {
                        markPollInitialized(context);
                        Log.d(TAG, "Heartbeat initialized with " + newStates.size() + " signals");
                    }
                    saveStates(context, newStates, 100);

                    if (notified > 0) {
                        Log.d(TAG, "Heartbeat detected " + notified + " new signals");
                    }

                } catch (Exception e) {
                    Log.e(TAG, "Error in signal check", e);
                } finally {
                    if (wl != null && wl.isHeld()) {
                        try { wl.release(); } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    // ── Notification helpers ──

    private void showEntry(Context ctx, String pair, String type, double entry) {
        String ar = "BUY".equals(type) ? "شراء" : "بيع";
        NotificationHelper.showNotification(ctx, "📊 إشارة جديدة — " + pair, ar + " @" + entry, "BUY".equals(type) ? "buy" : "sell");
    }

    private void showTp(Context ctx, String pair, int idx, String cat) {
        String icon, label;
        if ("REENTRY_TP".equals(cat)) { icon = "♻️"; label = "تعويض"; }
        else if ("PYRAMID_TP".equals(cat)) { icon = "🔥"; label = "تعزيز"; }
        else { icon = "🎯"; label = "هدف"; }
        NotificationHelper.showNotification(ctx, icon + " " + label + " محقق — " + pair, label + " " + idx + " تم تحقيقه!", "tp_hit");
    }

    private void showSl(Context ctx, String pair) {
        NotificationHelper.showNotification(ctx, "🛑 وقف خسارة — " + pair, "تم ضرب وقف الخسارة!", "sl_hit");
    }

    // ── State helpers ──

    private String getSessionToken(Context ctx) {
        try { return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_SESSION_TOKEN, ""); }
        catch (Exception e) { return ""; }
    }

    private boolean isPollInitialized(Context ctx) {
        try { return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_POLL_INIT, false); }
        catch (Exception e) { return false; }
    }

    private void markPollInitialized(Context ctx) {
        try { ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putBoolean(KEY_POLL_INIT, true).apply(); }
        catch (Exception e) {}
    }

    private Map<String, String> loadStates(Context ctx) {
        Map<String, String> states = new HashMap<>();
        try {
            String stored = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_POLL_STATES, "");
            if (!stored.isEmpty()) {
                for (String entry : stored.split(",")) {
                    int eq = entry.indexOf('=');
                    if (eq > 0) states.put(entry.substring(0, eq), entry.substring(eq + 1));
                }
            }
        } catch (Exception e) {}
        return states;
    }

    private void saveStates(Context ctx, Map<String, String> states, int max) {
        try {
            StringBuilder sb = new StringBuilder();
            int c = 0;
            for (Map.Entry<String, String> e : states.entrySet()) {
                if (c >= max) break;
                if (sb.length() > 0) sb.append(",");
                sb.append(e.getKey()).append("=").append(e.getValue());
                c++;
            }
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putString(KEY_POLL_STATES, sb.toString()).apply();
        } catch (Exception e) {}
    }

    public static void startPolling(Context context) {
        startHeartbeat(context);
    }

    public static void stopPolling(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(context, SignalPollReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.cancel(pi);
        } catch (Exception e) {}
    }
}
