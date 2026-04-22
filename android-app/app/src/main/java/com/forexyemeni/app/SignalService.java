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
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * SignalService v7 — Bulletproof foreground service for signal monitoring
 *
 * KEY CHANGES FROM v6:
 * - File-based logging (survives app restart, viewable via adb)
 * - Token validation: checks if API returns data, shows status in notification
 * - Smart initialization: resets if token was missing during first run
 * - Reliable restart: uses AlarmManager only (no direct restartService from onDestroy)
 * - onTaskRemoved: just updates notification, relies on heartbeat for restart
 * - WakeLock auto-refresh every 9 minutes
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "service_signal_states_v7";
    private static final String KEY_INITIALIZED = "service_initialized_v7";
    private static final String KEY_SESSION_TOKEN = "fy_session_token";
    private static final String KEY_LAST_HEARTBEAT = "service_last_heartbeat";
    private static final String KEY_TOKEN_VERIFIED = "service_token_verified";
    private static final String API_BASE = "https://trade-signal-pro.vercel.app";
    private static final String UPDATES_URL = API_BASE + "/api/signals/updates";
    private static final String SIGNALS_URL = API_BASE + "/api/signals";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;
    private static final int POLL_INTERVAL_MS = 3000; // 3s for stability
    private static final String WAKE_LOCK_TAG = "ForexYemeni:SignalPoll";

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;
    private PowerManager.WakeLock wakeLock;

    // ── File Logger ──
    private File logFile;
    private PrintStream logStream;

    private void initLogger() {
        try {
            File dir = new File(getFilesDir(), "logs");
            if (!dir.exists()) dir.mkdirs();
            logFile = new File(dir, "service_log.txt");
            // Keep only last 50KB
            if (logFile.length() > 50000) logFile.delete();
            logStream = new PrintStream(new FileOutputStream(logFile, true));
        } catch (Exception e) {
            logFile = null;
            logStream = null;
        }
    }

    private void log(String msg) {
        String ts = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
        String line = "[" + ts + "] " + msg;
        Log.d(TAG, line);
        if (logStream != null) {
            try {
                logStream.println(line);
                logStream.flush();
            } catch (Exception ignored) {}
        }
    }

    private void closeLogger() {
        if (logStream != null) {
            try { logStream.close(); } catch (Exception ignored) {}
            logStream = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SERVICE LIFECYCLE
    // ═══════════════════════════════════════════════════════════════

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        initLogger();

        NotificationHelper.createAllChannels(this);
        createServiceChannel();
        startForeground(NOTIFICATION_ID, buildServiceNotification("جاري التهيئة..."));

        // Acquire WakeLock
        acquireWakeLock();

        handler = new Handler(Looper.getMainLooper());

        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning) return;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            updateHeartbeat();
                            refreshWakeLock();
                            checkSignalsFast();
                        } catch (Exception e) {
                            log("Poll error: " + e.getMessage());
                        }
                    }
                }).start();
                if (isRunning) {
                    handler.postDelayed(pollRunnable, POLL_INTERVAL_MS);
                }
            }
        };

        handler.post(pollRunnable);
        SignalPollReceiver.startHeartbeat(this);

        String token = getSessionToken();
        log("Service v7 started. Token: " + (token.isEmpty() ? "EMPTY (waiting for WebView)" : token.substring(0, 8) + "..."));
        updateServiceNotification();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        updateHeartbeat();
        refreshWakeLock();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        log("onDestroy called — AlarmManager will restart within 15s");
        isRunning = false;
        if (handler != null && pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
        }
        releaseWakeLock();
        closeLogger();

        // DO NOT call restartService() here — Android 12+ blocks foreground service
        // starts from background. AlarmManager heartbeat will handle restart.
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        log("onTaskRemoved — user swiped app away");
        // Update notification to reassure user
        updateServiceNotification();
        // DO NOT restart here — heartbeat handles it
    }

    // ═══════════════════════════════════════════════════════════════
    //  WAKE LOCK MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(10 * 60 * 1000L); // 10 min
            }
        } catch (Exception e) {
            log("WakeLock acquire error: " + e.getMessage());
        }
    }

    private void refreshWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try {
                acquireWakeLock();
            } catch (Exception ignored) {}
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  HEARTBEAT & TOKEN MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    private void updateHeartbeat() {
        try {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit().putLong(KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply();
        } catch (Exception ignored) {}
    }

    public static boolean isServiceAlive(Context context) {
        try {
            long last = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong(KEY_LAST_HEARTBEAT, 0);
            return (System.currentTimeMillis() - last) < 20000;
        } catch (Exception e) {
            return false;
        }
    }

    public static void setSessionToken(Context context, String token) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SESSION_TOKEN, token)
                .putBoolean(KEY_TOKEN_VERIFIED, false) // Reset verification
                .apply();
            Log.d(TAG, "Session token saved: " + (token.isEmpty() ? "EMPTY" : token.substring(0, 8) + "..."));

            // If service was initialized without token, reset so it re-initializes with token
            boolean wasInit = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_INITIALIZED, false);
            boolean oldToken = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_SESSION_TOKEN, "").isEmpty();
            if (wasInit && oldToken && !token.isEmpty()) {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_INITIALIZED, false)
                    .putString(KEY_KNOWN_STATES, "")
                    .apply();
                Log.d(TAG, "Token arrived! Reset initialization to re-sync with server");
            }
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

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFICATION CHANNEL & UI
    // ═══════════════════════════════════════════════════════════════

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

    private void updateServiceNotification() {
        String token = getSessionToken();
        String statusText;
        if (token.isEmpty()) {
            statusText = "⚠️ في انتظار تسجيل الدخول...";
        } else {
            boolean verified = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getBoolean(KEY_TOKEN_VERIFIED, false);
            statusText = verified ? "✅ جاري مراقبة الإشارات" : "🔄 جاري التحقق من الجلسة...";
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildServiceNotification(statusText));
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

    // ═══════════════════════════════════════════════════════════════
    //  SIGNAL CHECKING (CORE LOGIC)
    // ═══════════════════════════════════════════════════════════════

    private void checkSignalsFast() {
        try {
            String token = getSessionToken();

            // ALWAYS fetch all signals to detect both new and updated signals
            String sinceParam = "?since=0";
            URL url = new URL(UPDATES_URL + sinceParam);
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
                log("API error: HTTP " + code + (token.isEmpty() ? " [no token]" : ""));
                conn.disconnect();
                updateServiceNotification();
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
            int totalSignals = json.optInt("totalSignals", 0);

            // ── Token verification ──
            if (!token.isEmpty() && totalSignals > 0) {
                // Token works — API returned signals
                if (!getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_TOKEN_VERIFIED, false)) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putBoolean(KEY_TOKEN_VERIFIED, true).apply();
                    log("Token VERIFIED — API returned " + totalSignals + " signals");
                    updateServiceNotification();
                }
            } else if (!token.isEmpty() && totalSignals == 0) {
                // Token sent but API returned nothing — token might be invalid
                log("WARNING: Token sent but API returned 0 signals. Token may be invalid or expired");
                // Don't mark as verified
            } else {
                // No token at all
                if (System.currentTimeMillis() % 30000 < 3000) { // Log every ~30s
                    log("No token available — waiting for WebView to share session");
                }
            }

            if (!hasNew || totalSignals == 0) return;

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
                double entry = signal.optDouble("entry", 0);

                // TP hit: FULL (HIT_TP) OR PARTIAL (hitTpIndex > 0 with ACTIVE status)
                boolean isTpHit = "HIT_TP".equals(status) || "TP_HIT".equals(category)
                        || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category)
                        || hitTpIndex > 0;
                boolean isSlHit = "HIT_SL".equals(status) || "SL_HIT".equals(category)
                        || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category);

                if (isFirstRun) {
                    // First run: silently track all signals
                    if (notifiedCount == 0) log("First run — tracking " + newSignals.length() + " signals silently");
                } else if (!knownStates.containsKey(id)) {
                    // Brand new signal (not in our state map)
                    log("NEW signal detected: " + pair + " " + type + " @" + entry);
                    if (isTpHit) { showTpNotification(pair, hitTpIndex, category); notifiedCount++; }
                    else if (isSlHit) { showSlNotification(pair); notifiedCount++; }
                    else { showEntryNotification(pair, type, entry); notifiedCount++; }
                } else {
                    // Existing signal — check for state changes
                    String oldState = knownStates.get(id);
                    if (!state.equals(oldState)) {
                        log("STATE CHANGE: " + pair + " [" + oldState + " → " + state + "]");
                        if (isTpHit) { showTpNotification(pair, hitTpIndex, category); notifiedCount++; }
                        else if (isSlHit) { showSlNotification(pair); notifiedCount++; }
                        else { showEntryNotification(pair, type, entry); notifiedCount++; }
                    }
                }
                newStates.put(id, state);
            }

            if (isFirstRun) {
                markInitialized();
                // Also load full states from main API for complete coverage
                Map<String, String> fullStates = loadFullSignalStates(token);
                newStates.putAll(fullStates);
                log("Initialized with " + newStates.size() + " signal states tracked");
            }

            saveKnownStates(newStates, 100);

            if (notifiedCount > 0) {
                final int count = notifiedCount;
                log("Showed " + count + " notification(s)");
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.notify(NOTIFICATION_ID, buildServiceNotification(count + " إشعارات جديدة"));
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (isRunning) {
                                nm.notify(NOTIFICATION_ID, buildServiceNotification("✅ جاري مراقبة الإشارات"));
                            }
                        }
                    }, 5000);
                }
            }

        } catch (Exception e) {
            log("FATAL: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFICATION HELPERS
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    //  STATE PERSISTENCE
    // ═══════════════════════════════════════════════════════════════

    private boolean isInitialized() {
        try { return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_INITIALIZED, false); }
        catch (Exception e) { return false; }
    }

    private void markInitialized() {
        try { getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putBoolean(KEY_INITIALIZED, true).apply(); }
        catch (Exception e) { log("markInitialized error: " + e.getMessage()); }
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
        } catch (Exception e) { log("loadStates error: " + e.getMessage()); }
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
        } catch (Exception e) { log("saveStates error: " + e.getMessage()); }
    }

    private Map<String, String> loadFullSignalStates(String token) {
        try {
            URL url = new URL(SIGNALS_URL + "?limit=20");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/1.10");
            conn.setRequestProperty("Accept", "application/json");
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
            for (int i = 0; i < Math.min(signals.length(), 20); i++) {
                JSONObject s = signals.getJSONObject(i);
                states.put(s.getString("id"),
                    s.optString("status") + "|" + s.optString("signalCategory") + "|" + s.optInt("hitTpIndex", -1));
            }
            log("Loaded " + states.size() + " full states from API");
            return states;
        } catch (Exception e) {
            log("loadFullStates error: " + e.getMessage());
            return new HashMap<>();
        }
    }
}
