package com.forexyemeni.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
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
 * SignalService v6 — Bulletproof foreground service for signal monitoring
 *
 * KEY FEATURES:
 * - Polls every 2s via lightweight /api/signals/updates?since=T
 * - WAKE_LOCK during each poll to prevent CPU sleep
 * - stopWithTask=false: survives app swipe on most devices
 * - Auto-restart: if killed, AlarmManager heartbeat restarts it within 15s
 * - Auth token received from WebView for user-specific signal filtering
 * - Deduplicates with WebView to prevent double alerts
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "service_signal_states";
    private static final String KEY_INITIALIZED = "service_initialized_v6";
    private static final String KEY_SESSION_TOKEN = "fy_session_token";
    private static final String KEY_LAST_HEARTBEAT = "service_last_heartbeat";
    private static final String API_BASE = "https://trade-signal-pro.vercel.app";
    private static final String UPDATES_URL = API_BASE + "/api/signals/updates";
    private static final String SIGNALS_URL = API_BASE + "/api/signals";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;
    private static final int POLL_INTERVAL_MS = 2000;
    private static final String WAKE_LOCK_TAG = "ForexYemeni:SignalPoll";

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;
    private long lastCheckTime = 0;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;

        NotificationHelper.createAllChannels(this);
        createServiceChannel();
        startForeground(NOTIFICATION_ID, buildServiceNotification("جاري مراقبة الإشارات..."));

        // Acquire WakeLock to prevent CPU sleep during polls
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(10 * 60 * 1000L); // 10 min max, will re-acquire
        }

        handler = new Handler(Looper.getMainLooper());

        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning) return;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        // Update heartbeat timestamp so AlarmManager knows we're alive
                        updateHeartbeat();
                        checkSignalsFast();
                    }
                }).start();
                if (isRunning) {
                    handler.postDelayed(pollRunnable, POLL_INTERVAL_MS);
                }
            }
        };

        handler.post(pollRunnable);

        // Also start alarm-based heartbeat as safety net
        SignalPollReceiver.startHeartbeat(this);

        Log.d(TAG, "SignalService v6 started — 2s poll + WakeLock + heartbeat");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        updateHeartbeat();
        // If called by AlarmManager restart, re-acquire wake lock
        if (wakeLock != null && !wakeLock.isHeld()) {
            try { wakeLock.acquire(10 * 60 * 1000L); } catch (Exception ignored) {}
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (handler != null && pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        Log.d(TAG, "SignalService destroyed — AlarmManager will restart within 15s");
    }

    /** Update heartbeat so AlarmManager knows the service is alive */
    private void updateHeartbeat() {
        try {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit().putLong(KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply();
        } catch (Exception ignored) {}
    }

    /** Check if the service heartbeat is recent */
    public static boolean isServiceAlive(Context context) {
        try {
            long last = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong(KEY_LAST_HEARTBEAT, 0);
            // If heartbeat was in the last 20 seconds, service is alive
            return (System.currentTimeMillis() - last) < 20000;
        } catch (Exception e) {
            return false;
        }
    }

    /** Set auth token from WebView */
    public static void setSessionToken(Context context, String token) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_SESSION_TOKEN, token).apply();
            Log.d(TAG, "Session token saved");
        } catch (Exception e) {
            Log.e(TAG, "Error saving token", e);
        }
    }

    private String getSessionToken() {
        try {
            return getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getString(KEY_SESSION_TOKEN, "");
        } catch (Exception e) {
            return "";
        }
    }

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "خدمة مراقبة الإشارات", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("يحافظ على تشغيل الإشعارات");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            channel.setBypassDnd(true);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildServiceNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int iconRes = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (iconRes == 0) iconRes = android.R.drawable.ic_dialog_info;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_LOW);
        }
        builder.setContentTitle("ForexYemeni VIP")
                .setContentText(text)
                .setSmallIcon(iconRes)
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(Color.parseColor("#FFD700"));
        }
        return builder.build();
    }

    /**
     * Ultra-fast signal check using /api/signals/updates?since=T
     */
    private void checkSignalsFast() {
        try {
            String token = getSessionToken();
            String sinceParam = lastCheckTime > 0 ? "?since=" + lastCheckTime : "?since=0";
            URL url = new URL(UPDATES_URL + sinceParam);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/1.10");
            if (!token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            int code = conn.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "Updates API returned " + code);
                conn.disconnect();
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            JSONObject json = new JSONObject(sb.toString());
            boolean hasNew = json.optBoolean("hasNew", false);
            long latestTime = json.optLong("latestTime", 0);
            if (latestTime > 0) lastCheckTime = latestTime;

            if (!hasNew) return;

            JSONArray newSignals = json.optJSONArray("newSignals");
            if (newSignals == null || newSignals.length() == 0) return;

            boolean isFirstRun = !isInitialized();
            Map<String, String> knownStates = loadKnownStates();
            Map<String, String> newStates = new HashMap<>();
            int notifiedCount = 0;

            for (int i = 0; i < newSignals.length(); i++) {
                JSONObject signal = newSignals.getJSONObject(i);
                String id = signal.getString("id");
                String status = signal.optString("status", "ACTIVE");
                String category = signal.optString("signalCategory", "ENTRY");
                int hitTpIndex = signal.optInt("hitTpIndex", -1);
                String state = status + "|" + category + "|" + hitTpIndex;
                String pair = signal.optString("pair", "N/A");
                String type = signal.optString("type", "BUY");
                double entry = signal.optDouble("entry, 0");

                boolean isTpHit = "HIT_TP".equals(status) || "TP_HIT".equals(category)
                        || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category);
                boolean isSlHit = "HIT_SL".equals(status) || "SL_HIT".equals(category)
                        || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category);

                if (isFirstRun) {
                    Log.d(TAG, "FIRST RUN - tracking: " + pair);
                } else if (!knownStates.containsKey(id)) {
                    if (isTpHit) { showTpNotification(pair, hitTpIndex, category); notifiedCount++; }
                    else if (isSlHit) { showSlNotification(pair); notifiedCount++; }
                    else { showEntryNotification(pair, type, entry); notifiedCount++; }
                } else {
                    String oldState = knownStates.get(id);
                    if (!state.equals(oldState)) {
                        if (isTpHit) { showTpNotification(pair, hitTpIndex, category); notifiedCount++; }
                        else if (isSlHit) { showSlNotification(pair); notifiedCount++; }
                        else { showEntryNotification(pair, type, entry); notifiedCount++; }
                    }
                }
                newStates.put(id, state);
            }

            if (isFirstRun) {
                markInitialized();
                newStates.putAll(loadFullSignalStates(token));
                Log.d(TAG, "Initialized with " + newStates.size() + " signals");
            }

            saveKnownStates(newStates, 50);

            if (notifiedCount > 0) {
                final int count = notifiedCount;
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.notify(NOTIFICATION_ID, buildServiceNotification(count + " إشعارات جديدة"));
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (isRunning) nm.notify(NOTIFICATION_ID, buildServiceNotification("جاري مراقبة الإشارات..."));
                        }
                    }, 5000);
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Error checking signals", e);
        }
    }

    private void showEntryNotification(String pair, String type, double entry) {
        String typeAr = "BUY".equals(type) ? "شراء" : "بيع";
        NotificationHelper.showNotification(this,
                "📊 إشارة جديدة — " + pair, typeAr + " @" + entry,
                "BUY".equals(type) ? "buy" : "sell");
    }

    private void showTpNotification(String pair, int hitTpIndex, String category) {
        String catIcon, catLabel;
        if ("REENTRY_TP".equals(category)) { catIcon = "♻️"; catLabel = "تعويض"; }
        else if ("PYRAMID_TP".equals(category)) { catIcon = "🔥"; catLabel = "تعزيز"; }
        else { catIcon = "🎯"; catLabel = "هدف"; }
        NotificationHelper.showNotification(this,
                catIcon + " " + catLabel + " محقق — " + pair,
                catLabel + " " + hitTpIndex + " تم تحقيقه بنجاح!", "tp_hit");
    }

    private void showSlNotification(String pair) {
        NotificationHelper.showNotification(this,
                "🛑 وقف خسارة — " + pair, "تم ضرب وقف الخسارة!", "sl_hit");
    }

    private boolean isInitialized() {
        try { return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_INITIALIZED, false); }
        catch (Exception e) { return false; }
    }

    private void markInitialized() {
        try { getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putBoolean(KEY_INITIALIZED, true).apply(); }
        catch (Exception e) { Log.e(TAG, "Error marking initialized", e); }
    }

    private Map<String, String> loadKnownStates() {
        Map<String, String> states = new HashMap<>();
        try {
            String stored = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(KEY_KNOWN_STATES, "");
            if (!stored.isEmpty()) {
                for (String entry : stored.split(",")) {
                    int eq = entry.indexOf('=');
                    if (eq > 0) states.put(entry.substring(0, eq), entry.substring(eq + 1));
                }
            }
        } catch (Exception e) { Log.e(TAG, "Error loading states", e); }
        return states;
    }

    private void saveKnownStates(Map<String, String> states, int maxEntries) {
        try {
            StringBuilder sb = new StringBuilder();
            int count = 0;
            for (Map.Entry<String, String> entry : states.entrySet()) {
                if (count >= maxEntries) break;
                if (sb.length() > 0) sb.append(",");
                sb.append(entry.getKey()).append("=").append(entry.getValue());
                count++;
            }
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_KNOWN_STATES, sb.toString()).apply();
        } catch (Exception e) { Log.e(TAG, "Error saving states", e); }
    }

    private Map<String, String> loadFullSignalStates(String token) {
        try {
            URL url = new URL(SIGNALS_URL + "?limit=15");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/1.10");
            if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) { conn.disconnect(); return new HashMap<>(); }
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();
            JSONObject json = new JSONObject(sb.toString());
            JSONArray signals = json.optJSONArray("signals");
            if (signals == null) return new HashMap<>();
            Map<String, String> states = new HashMap<>();
            for (int i = 0; i < Math.min(signals.length(), 15); i++) {
                JSONObject s = signals.getJSONObject(i);
                states.put(s.getString("id"), s.optString("status") + "|" + s.optString("signalCategory") + "|" + s.optInt("hitTpIndex", -1));
            }
            return states;
        } catch (Exception e) { return new HashMap<>(); }
    }
}
