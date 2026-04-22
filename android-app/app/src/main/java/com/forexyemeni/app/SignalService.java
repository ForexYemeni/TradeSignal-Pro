package com.forexyemeni.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
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
 * SignalService v3.1 — CLEAN & RELIABLE
 *
 * Based on v3.0 token-from-localStorage approach (which works!).
 * Fixes from v3.0:
 * - Fixed TP/SL notifications not being sent (dedup was using signalId only,
 *   blocking re-notification on state change)
 * - Dedup key is now signalId + ":" + state (allows same signal to notify
 *   on entry, then again on TP hit, SL hit, etc.)
 * - Uses commit() instead of apply() for critical state saves (prevents
 *   race condition where next poll reads stale state)
 * - Removed Poll # counter from notification (cleaner UX)
 * - Increased poll interval to 10s (reduces API load, more reliable)
 * - Clean, professional notification text
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "service_signal_states_v31";
    private static final String KEY_INITIALIZED = "service_initialized_v31";
    private static final String KEY_NOTIFIED_IDS = "service_notified_ids_v31";
    private static final String KEY_SESSION_TOKEN = "fy_session_token";
    private static final String KEY_LAST_HEARTBEAT = "service_last_heartbeat";
    private static final String KEY_TOKEN_VERIFIED = "service_token_verified";
    private static final String API_BASE = "https://trade-signal-pro.vercel.app";
    private static final String UPDATES_URL = API_BASE + "/api/signals/updates";
    private static final String SIGNALS_URL = API_BASE + "/api/signals";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;
    private static final int POLL_INTERVAL_MS = 10000; // 10 seconds — reliable, not too fast
    private static final String WAKE_LOCK_TAG = "ForexYemeni:SignalPoll";

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;
    private PowerManager.WakeLock wakeLock;

    // Diagnostics (internal only, not shown in notification)
    private int pollCount = 0;
    private int signalsFound = 0;
    private int notificationsSent = 0;
    private int lastApiCode = 0;
    private String lastApiError = "";
    private String lastSignalDetected = "";
    private boolean tokenVerified = false;

    // In-memory dedup cache (survives between polls within same session)
    private final java.util.Set<String> notifiedThisSession = new java.util.HashSet<>();

    private File logFile;
    private PrintStream logStream;

    private void initLogger() {
        try {
            File dir = new File(getFilesDir(), "logs");
            if (!dir.exists()) dir.mkdirs();
            logFile = new File(dir, "service_log.txt");
            if (logFile.length() > 200000) logFile.delete();
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
            try { logStream.println(line); logStream.flush(); } catch (Exception ignored) {}
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

        log("═══════ SignalService v3.1 STARTING ═══════");
        log("Device: " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.SDK_INT);

        // 1. Create service channel with HIGH importance + SOUND
        createServiceChannel();

        // 2. Reset signal notification channels
        NotificationHelper.resetSignalChannels(this);

        // 3. Start foreground IMMEDIATELY
        Notification notif = buildServiceNotification("ForexYemeni VIP", "جاري التهيئة...", false);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notif);
            }
            log("Foreground service started");
        } catch (Exception e) {
            log("FATAL startForeground: " + e.getMessage());
            try { startForeground(NOTIFICATION_ID, notif); } catch (Exception e2) { log("FATAL fallback: " + e2.getMessage()); }
        }

        // 4. WakeLock
        acquireWakeLock();

        // 5. Start polling thread
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
                            pollAndCheck();
                        } catch (Exception e) {
                            log("Poll error: " + e.getMessage());
                        }
                    }
                }).start();
                if (isRunning) handler.postDelayed(pollRunnable, POLL_INTERVAL_MS);
            }
        };
        handler.post(pollRunnable);

        // 6. Start heartbeat alarm
        SignalPollReceiver.startHeartbeat(this);

        // 7. Log token
        String token = getSessionToken();
        log("Token: " + (token.isEmpty() ? "NONE!" : token.substring(0, Math.min(12, token.length())) + "..."));

        // 8. Log ready
        log("═══════ Service v3.1 READY ═══════");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        updateHeartbeat();
        refreshWakeLock();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        log("onDestroy — heartbeat will restart");
        isRunning = false;
        if (handler != null && pollRunnable != null) handler.removeCallbacks(pollRunnable);
        releaseWakeLock();
        closeLogger();
        SignalPollReceiver.startHeartbeat(this);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        log("onTaskRemoved — app swiped, service continues");
        refreshWakeLock();
        SignalPollReceiver.startHeartbeat(this);
    }

    // ═══════════════════════════════════════════════════════════════
    //  WAKE LOCK
    // ═══════════════════════════════════════════════════════════════

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(10 * 60 * 1000L);
            }
        } catch (Exception e) { log("WakeLock error: " + e.getMessage()); }
    }

    private void refreshWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            try { acquireWakeLock(); } catch (Exception ignored) {}
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFICATION CHANNEL — HIGH IMPORTANCE WITH SOUND
    // ═══════════════════════════════════════════════════════════════

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "تنبيهات فوري Yemeni", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("تنبيهات الإشارات والمتابعة");
            channel.setShowBadge(true);
            channel.setBypassDnd(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{100, 200, 100, 200, 100, 200});

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audio = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setLegacyStreamType(android.media.AudioManager.STREAM_NOTIFICATION)
                    .build();
            channel.setSound(soundUri, audio);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.deleteNotificationChannel(CHANNEL_ID);
                nm.createNotificationChannel(channel);
            }
            log("Service channel created: IMPORTANCE_HIGH with SOUND");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFICATION BUILDING
    // ═══════════════════════════════════════════════════════════════

    private Notification buildServiceNotification(String title, String text, boolean isSignalAlert) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, NOTIFICATION_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int iconRes = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (iconRes == 0) iconRes = android.R.drawable.ic_dialog_info;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_MAX);
        }

        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(iconRes)
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(true);

        if (isSignalAlert) {
            builder.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(Color.parseColor("#FFD700"));
                builder.setVibrate(new long[]{0, 300, 200, 300, 200, 500});
            }
        } else {
            // Normal mode — silent
            builder.setDefaults(0);
            builder.setSound(null, null);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(Color.parseColor("#1a1a2e"));
            }
        }

        return builder.build();
    }

    /**
     * Update the foreground notification with clean, professional text.
     * NO Poll #, NO technical diagnostics visible to user.
     */
    private void updateServiceNotification(String text) {
        Notification notif = buildServiceNotification("ForexYemeni VIP", text, false);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, notif);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SIGNAL ALERT — ONE NOTIFICATION PER SIGNAL+STATE COMBINATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * CRITICAL: Dedup key is now signalId + ":" + signalState.
     * This allows the same signal to be re-notified when its state changes
     * (e.g., entry → TP1 hit → TP2 hit → SL hit).
     * Previously, only signalId was used, which blocked ALL notifications
     * after the first one for a given signal (TP/SL never worked!).
     *
     * Returns true if notification was actually sent (not duplicate).
     */
    private boolean alertSignalDetected(String signalId, String signalState, String signalInfo) {
        // Build composite dedup key
        String dedupKey = signalId + ":" + signalState;

        // Check in-memory cache first (fast, no I/O)
        if (notifiedThisSession.contains(dedupKey)) {
            return false;
        }

        // Check persistent storage (survives service restarts)
        if (wasAlreadyNotified(dedupKey)) {
            notifiedThisSession.add(dedupKey); // Cache it
            return false;
        }

        // NEW notification — send it!
        lastSignalDetected = signalInfo;
        notificationsSent++;
        markAsNotified(dedupKey);
        notifiedThisSession.add(dedupKey); // Cache in memory

        log(">>>>>>> SIGNAL: " + signalInfo + " (state=" + signalState + ") <<<<<<<<");

        // 1. Build alert message
        String time = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
        String title = "اشارة جديدة! " + signalInfo;
        String text = "تم اكتشاف: " + signalInfo + " — " + time;

        // 2. Update foreground service notification (visual only, no sound from this)
        Notification alertNotif = buildServiceNotification(title, text, false);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, alertNotif);
        }

        // 3. Send regular notification (with sound from channel)
        NotificationHelper.showNotification(this, title, text, "buy");

        // 4. Play distinctive sound via ToneGenerator
        playSignalSound();

        return true;
    }

    // ── Deduplication helpers (persistent storage) ──

    private boolean wasAlreadyNotified(String dedupKey) {
        try {
            String notified = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(KEY_NOTIFIED_IDS, "");
            return notified.contains("[" + dedupKey + "]");
        } catch (Exception e) { return false; }
    }

    private void markAsNotified(String dedupKey) {
        try {
            String notified = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getString(KEY_NOTIFIED_IDS, "");
            notified += "[" + dedupKey + "]";
            // Keep last 200 entries max
            // Each entry format: [signalId:state]
            int maxLen = 15000; // ~200 entries of ~75 chars each
            if (notified.length() > maxLen) {
                notified = notified.substring(notified.length() - maxLen);
            }
            // Use commit() — CRITICAL: synchronous write prevents race condition
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit().putString(KEY_NOTIFIED_IDS, notified).commit();
        } catch (Exception e) {}
    }

    /**
     * Play a distinctive sound pattern for signal alerts.
     * 3 quick ascending beeps + 1 long final beep.
     */
    private void playSignalSound() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    ToneGenerator tg = new ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 100);
                    tg.startTone(ToneGenerator.TONE_CDMA_PIP, 200);
                    Thread.sleep(250);
                    tg.startTone(ToneGenerator.TONE_CDMA_PIP, 200);
                    Thread.sleep(250);
                    tg.startTone(ToneGenerator.TONE_CDMA_PIP, 200);
                    Thread.sleep(250);
                    tg.startTone(ToneGenerator.TONE_CDMA_PIP, 600);
                    Thread.sleep(700);
                    tg.release();
                } catch (Exception e) {
                    log("Sound error: " + e.getMessage());
                }
            }
        }).start();
    }

    // ═══════════════════════════════════════════════════════════════
    //  HEARTBEAT & TOKEN
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
        } catch (Exception e) { return false; }
    }

    public static void setSessionToken(Context context, String token) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SESSION_TOKEN, token)
                .putBoolean(KEY_TOKEN_VERIFIED, false)
                .apply();

            Log.d(TAG, "Token saved: " + (token.isEmpty() ? "EMPTY" : token.substring(0, Math.min(12, token.length())) + "..."));

            // Reset initialization if we got a new token (need to re-learn signal states)
            boolean wasInit = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_INITIALIZED, false);
            boolean oldToken = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_SESSION_TOKEN, "").isEmpty();
            if (wasInit && oldToken && !token.isEmpty()) {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_INITIALIZED, false)
                    .putString(KEY_KNOWN_STATES, "")
                    .commit();
                Log.d(TAG, "Token arrived — re-initializing");
            }
        } catch (Exception e) {
            Log.e(TAG, "Token error", e);
        }
    }

    private String getSessionToken() {
        try {
            return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(KEY_SESSION_TOKEN, "");
        } catch (Exception e) { return ""; }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN POLLING & SIGNAL DETECTION
    // ═══════════════════════════════════════════════════════════════

    private void pollAndCheck() {
        try {
            pollCount++;
            String token = getSessionToken();

            // Show status in foreground notification (clean text, no Poll #)
            if (token.isEmpty()) {
                updateServiceNotification("في انتظار تسجيل الدخول...");
                return;
            }

            // Call API
            URL url = new URL(UPDATES_URL + "?since=0");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/3.1");
            conn.setRequestProperty("Accept", "application/json");
            if (!token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            lastApiCode = conn.getResponseCode();

            if (lastApiCode != 200) {
                lastApiError = "HTTP_" + lastApiCode;
                conn.disconnect();
                if (pollCount <= 3 || pollCount % 10 == 0) {
                    log("API error: " + lastApiCode + " token=" + (token.isEmpty() ? "NONE" : "OK"));
                    updateServiceNotification("جاري الاتصال...");
                }
                return;
            }

            lastApiError = "";

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            JSONObject json = new JSONObject(sb.toString());
            boolean hasNew = json.optBoolean("hasNew", false);
            int totalSignals = json.optInt("totalSignals", 0);

            // Token verification
            if (!tokenVerified && totalSignals > 0) {
                tokenVerified = true;
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit().putBoolean(KEY_TOKEN_VERIFIED, true).apply();
                log("TOKEN VERIFIED — " + totalSignals + " signals from API");
            }

            if (!hasNew || totalSignals == 0) {
                // No new signals — show clean status
                if (!tokenVerified) {
                    updateServiceNotification("جاري التحقق...");
                } else if (lastSignalDetected.isEmpty()) {
                    updateServiceNotification("مراقبة الاشارات");
                }
                // else keep last signal info visible
                if (pollCount <= 3) log("No new signals (total=" + totalSignals + ")");
                return;
            }

            JSONArray newSignals = json.optJSONArray("newSignals");
            if (newSignals == null || newSignals.length() == 0) {
                return;
            }

            signalsFound = newSignals.length();
            boolean isFirstRun = !isInitialized();
            Map<String, String> knownStates = loadKnownStates();
            Map<String, String> newStates = new HashMap<>();

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

                if (isFirstRun) {
                    if (i == 0) log("FIRST RUN — tracking " + newSignals.length() + " signals (no alert)");
                } else if (!knownStates.containsKey(id)) {
                    // BRAND NEW SIGNAL DETECTED!
                    String info = pair + " " + ("BUY".equals(type) ? "شراء" : "بيع") + " @" + entry;
                    alertSignalDetected(id, state, info);
                } else if (!state.equals(knownStates.get(id))) {
                    // STATE CHANGE (TP hit, SL hit, etc.)
                    String info;
                    if ("HIT_TP".equals(status) || "TP_HIT".equals(category)
                            || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category)
                            || hitTpIndex > 0) {
                        info = pair + " هدف " + hitTpIndex + " محقق!";
                    } else if ("HIT_SL".equals(status) || "SL_HIT".equals(category)
                            || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category)) {
                        info = pair + " وقف خسارة!";
                    } else {
                        info = pair + " تحديث: " + status;
                    }
                    alertSignalDetected(id, state, info);
                }
                newStates.put(id, state);
            }

            if (isFirstRun) {
                markInitialized();
                Map<String, String> fullStates = loadFullSignalStates(token);
                newStates.putAll(fullStates);
                log("Initialized: tracking " + newStates.size() + " signal states");
            }

            // Use commit() — CRITICAL: synchronous write prevents race condition
            // where the next poll reads stale states and re-notifies the same signals
            saveKnownStates(newStates, 200);

            // Return notification to clean status after 8 seconds
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (isRunning) {
                        if (lastSignalDetected.isEmpty()) {
                            updateServiceNotification("مراقبة الاشارات");
                        }
                    }
                }
            }, 8000);

        } catch (Exception e) {
            lastApiError = e.getClass().getSimpleName();
            log("FATAL: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATE PERSISTENCE
    // ═══════════════════════════════════════════════════════════════

    private boolean isInitialized() {
        try { return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_INITIALIZED, false); }
        catch (Exception e) { return false; }
    }

    private void markInitialized() {
        try {
            // Use commit() — must be synchronous so next poll sees initialized=true
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putBoolean(KEY_INITIALIZED, true).commit();
        } catch (Exception e) { log("markInit error: " + e.getMessage()); }
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
        } catch (Exception e) { log("loadStates: " + e.getMessage()); }
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
            // Use commit() — CRITICAL: synchronous write prevents race condition
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_KNOWN_STATES, sb.toString()).commit();
        } catch (Exception e) { log("saveStates: " + e.getMessage()); }
    }

    private Map<String, String> loadFullSignalStates(String token) {
        try {
            URL url = new URL(SIGNALS_URL + "?limit=20");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/3.1");
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
            return states;
        } catch (Exception e) { return new HashMap<>(); }
    }
}
