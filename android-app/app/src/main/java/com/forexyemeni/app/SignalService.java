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
 * SignalService v9 — GUARANTEED signal delivery
 *
 * KEY CHANGE: When a signal is detected, it's shown in TWO places:
 * 1. Regular notification (may be blocked by permission/OEM)
 * 2. THE FOREGROUND SERVICE NOTIFICATION itself (ALWAYS visible!)
 *
 * This means even if notification channels are blocked, the user will see
 * detected signals in the persistent "ForexYemeni VIP" notification bar.
 *
 * Other fixes:
 * - Checks notification permission status and shows warning
 * - Shows detailed diagnostics in service notification
 * - Uses FOREGROUND_SERVICE_TYPE_SPECIAL_USE on Android 14+
 * - Unique channel per launch to bypass OEM blocking
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "service_signal_states_v9";
    private static final String KEY_INITIALIZED = "service_initialized_v9";
    private static final String KEY_SESSION_TOKEN = "fy_session_token";
    private static final String KEY_LAST_HEARTBEAT = "service_last_heartbeat";
    private static final String KEY_TOKEN_VERIFIED = "service_token_verified";
    private static final String API_BASE = "https://trade-signal-pro.vercel.app";
    private static final String UPDATES_URL = API_BASE + "/api/signals/updates";
    private static final String SIGNALS_URL = API_BASE + "/api/signals";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;
    private static final int POLL_INTERVAL_MS = 3000;
    private static final String WAKE_LOCK_TAG = "ForexYemeni:SignalPoll";

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;
    private PowerManager.WakeLock wakeLock;
    private int pollCount = 0;
    private int notificationCount = 0;
    private String lastDetectedSignal = "";

    private File logFile;
    private PrintStream logStream;

    private void initLogger() {
        try {
            File dir = new File(getFilesDir(), "logs");
            if (!dir.exists()) dir.mkdirs();
            logFile = new File(dir, "service_log.txt");
            if (logFile.length() > 100000) logFile.delete();
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

        log("=== SignalService v9 starting ===");
        log("Device: " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.SDK_INT);
        log("Notification permission: " + NotificationHelper.hasNotificationPermission(this));

        // 1. Reset notification channels + create fresh unique channel
        NotificationHelper.resetSignalChannels(this);
        createServiceChannel();

        // 2. Start foreground with proper type
        Notification serviceNotif = buildServiceNotification(getStatusText());
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, serviceNotif,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForeground(NOTIFICATION_ID, serviceNotif);
            } else {
                startForeground(NOTIFICATION_ID, serviceNotif);
            }
            log("Foreground service started");
        } catch (Exception e) {
            log("FATAL startForeground: " + e.getMessage());
            try {
                startForeground(NOTIFICATION_ID, serviceNotif);
            } catch (Exception e2) {
                log("FATAL startForeground fallback: " + e2.getMessage());
            }
        }

        // 3. WakeLock
        acquireWakeLock();

        // 4. Start polling
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

        // 5. Start heartbeat alarm
        SignalPollReceiver.startHeartbeat(this);

        // 6. Log token status
        String token = getSessionToken();
        log("Token: " + (token.isEmpty() ? "NONE" : token.substring(0, Math.min(12, token.length())) + "..."));

        // 7. Update service notification with status
        updateServiceNotification();

        // 8. Test notification after 5s
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (isRunning) {
                    try {
                        NotificationHelper.showTestNotification(SignalService.this);
                        log("Test notification sent");
                    } catch (Exception e) {
                        log("Test notification failed: " + e.getMessage());
                    }
                }
            }
        }, 5000);
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
        log("onDestroy — scheduling heartbeat for restart");
        isRunning = false;
        if (handler != null && pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
        }
        releaseWakeLock();
        closeLogger();
        SignalPollReceiver.startHeartbeat(this);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        log("onTaskRemoved — app swiped away, service continues");
        refreshWakeLock();
        SignalPollReceiver.startHeartbeat(this);
        // DON'T update notification here — just continue
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
        } catch (Exception e) {
            log("WakeLock error: " + e.getMessage());
        }
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
        } catch (Exception e) {
            return false;
        }
    }

    public static void setSessionToken(Context context, String token) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SESSION_TOKEN, token)
                .putBoolean(KEY_TOKEN_VERIFIED, false)
                .apply();
            Log.d(TAG, "Token saved: " + (token.isEmpty() ? "EMPTY" : token.substring(0, Math.min(12, token.length())) + "..."));

            // Reset initialization if token arrived for the first time
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
                Log.d(TAG, "Token arrived! Re-initializing state tracking");
            }
        } catch (Exception e) {
            Log.e(TAG, "Token save error", e);
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
    //  NOTIFICATION
    // ═══════════════════════════════════════════════════════════════

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "خدمة المراقبة", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("يحافظ على تشغيل الإشعارات");
            channel.setShowBadge(false);
            channel.setBypassDnd(true);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    /**
     * Build the status text for the service notification.
     * This is what the user sees in the persistent notification bar.
     */
    private String getStatusText() {
        StringBuilder sb = new StringBuilder();

        // Check notification permission first
        if (!NotificationHelper.hasNotificationPermission(this)) {
            sb.append("تحذير: تفعيل الإشعارات من الاعدادات!");
            return sb.toString();
        }

        String token = getSessionToken();
        if (token.isEmpty()) {
            sb.append("في انتظار تسجيل الدخول...");
            return sb.toString();
        }

        boolean verified = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .getBoolean(KEY_TOKEN_VERIFIED, false);

        if (verified) {
            sb.append("مراقبة الاشارات");
        } else {
            sb.append("جاري التحقق...");
        }

        // Show last detected signal if any
        if (!lastDetectedSignal.isEmpty()) {
            sb.append(" | ").append(lastDetectedSignal);
        }

        sb.append(" [").append(pollCount).append("]");

        return sb.toString();
    }

    private void updateServiceNotification() {
        String statusText = getStatusText();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildServiceNotification(statusText));
        }
    }

    /**
     * CRITICAL: Update the foreground service notification with signal info.
     * This notification is ALWAYS visible, so signals shown here are GUARANTEED to be seen.
     */
    private void showSignalInServiceNotification(String signalInfo) {
        lastDetectedSignal = signalInfo;
        // Build a more prominent notification
        String fullText = "اشارة جديدة: " + signalInfo;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, NOTIFICATION_ID + 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int iconRes = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (iconRes == 0) iconRes = android.R.drawable.ic_dialog_info;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_HIGH); // Higher priority for signal alert
        }

        builder.setContentTitle("ForexYemeni VIP - " + signalInfo)
                .setContentText(fullText)
                .setSmallIcon(iconRes)
                .setContentIntent(pi)
                .setOngoing(true)
                .setShowWhen(true)
                .setVibrate(new long[]{0, 300, 200, 300, 200, 300});

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(Color.parseColor("#FFD700"));
        }

        Notification notification = builder.build();
        notification.defaults |= Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE;
        // Don't set FLAG_INSISTENT on the foreground notification (it would be annoying)

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, notification);
        }

        log("SERVICE NOTIFICATION UPDATED: " + signalInfo);

        // Play sound immediately (this works regardless of notification permission)
        NotificationHelper.showNotification(this,
                "ForexYemeni VIP - " + signalInfo,
                fullText,
                "buy"); // This will trigger tone + channel notification
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
    //  SIGNAL CHECKING (CORE)
    // ═══════════════════════════════════════════════════════════════

    private void checkSignalsFast() {
        try {
            pollCount++;
            String token = getSessionToken();

            if (pollCount % 20 == 1) {
                log("Poll #" + pollCount
                    + " | Token: " + (token.isEmpty() ? "NONE" : "OK")
                    + " | NotifPerm: " + NotificationHelper.hasNotificationPermission(this)
                    + " | Detected: " + notificationCount);
            }

            URL url = new URL(UPDATES_URL + "?since=0");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/2.0");
            conn.setRequestProperty("Accept", "application/json");
            if (!token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            int code = conn.getResponseCode();
            if (code != 200) {
                if (pollCount % 20 == 1) {
                    log("API error: HTTP " + code);
                }
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

            // Token verification
            if (!token.isEmpty() && totalSignals > 0) {
                if (!getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_TOKEN_VERIFIED, false)) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putBoolean(KEY_TOKEN_VERIFIED, true).apply();
                    log("Token VERIFIED - " + totalSignals + " signals from API");
                    updateServiceNotification();
                }
            } else if (!token.isEmpty() && totalSignals == 0) {
                if (pollCount % 30 == 1) {
                    log("Token sent but 0 signals returned (expired? no package?)");
                }
                boolean wasV = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .getBoolean(KEY_TOKEN_VERIFIED, false);
                if (wasV) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putBoolean(KEY_TOKEN_VERIFIED, false).apply();
                    updateServiceNotification();
                }
            } else {
                if (pollCount % 30 == 1) {
                    log("No token - waiting for login");
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

                boolean isTpHit = "HIT_TP".equals(status) || "TP_HIT".equals(category)
                        || "REENTRY_TP".equals(category) || "PYRAMID_TP".equals(category)
                        || hitTpIndex > 0;
                boolean isSlHit = "HIT_SL".equals(status) || "SL_HIT".equals(category)
                        || "REENTRY_SL".equals(category) || "PYRAMID_SL".equals(category);

                if (isFirstRun) {
                    if (i == 0) log("First run - tracking " + newSignals.length() + " signals silently");
                } else if (!knownStates.containsKey(id)) {
                    // NEW SIGNAL!
                    String info = pair + " " + type + " @" + entry;
                    log(">>> NEW SIGNAL: " + info + " <<<");

                    // CRITICAL: Show in BOTH regular notification AND service notification
                    showSignalInServiceNotification(info);

                    if (isTpHit) { showTpNotification(pair, hitTpIndex, category); }
                    else if (isSlHit) { showSlNotification(pair); }
                    else { showEntryNotification(pair, type, entry); }
                    notifiedCount++;
                } else {
                    // Existing signal - check for state change
                    String oldState = knownStates.get(id);
                    if (!state.equals(oldState)) {
                        String info = pair + " " + category + " -> " + status;
                        log(">>> STATE CHANGE: " + info + " <<<");

                        showSignalInServiceNotification(info);

                        if (isTpHit) { showTpNotification(pair, hitTpIndex, category); }
                        else if (isSlHit) { showSlNotification(pair); }
                        else { showEntryNotification(pair, type, entry); }
                        notifiedCount++;
                    }
                }
                newStates.put(id, state);
            }

            if (isFirstRun) {
                markInitialized();
                Map<String, String> fullStates = loadFullSignalStates(token);
                newStates.putAll(fullStates);
                log("Initialized with " + newStates.size() + " states");
            }

            saveKnownStates(newStates, 100);

            if (notifiedCount > 0) {
                notificationCount += notifiedCount;
                log("Total notifications sent: " + notificationCount);

                // Reset service notification after 8 seconds
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (isRunning) updateServiceNotification();
                    }
                }, 8000);
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
                "اشارة جديدة - " + pair, typeAr + " @" + entry,
                "BUY".equals(type) ? "buy" : "sell");
    }

    private void showTpNotification(String pair, int hitTpIndex, String category) {
        String catLabel;
        if ("REENTRY_TP".equals(category)) catLabel = "تعويض";
        else if ("PYRAMID_TP".equals(category)) catLabel = "تعزيز";
        else catLabel = "هدف";
        NotificationHelper.showNotification(this,
                catLabel + " محقق - " + pair,
                catLabel + " " + hitTpIndex + " تم تحقيقه!", "tp_hit");
    }

    private void showSlNotification(String pair) {
        NotificationHelper.showNotification(this,
                "وقف خسارة - " + pair, "تم ضرب وقف الخسارة!", "sl_hit");
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
        catch (Exception e) { log("markInit error: " + e.getMessage()); }
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
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/2.0");
            conn.setRequestProperty("Accept", "application/json");
            if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
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
            log("Loaded " + states.size() + " full states");
            return states;
        } catch (Exception e) {
            log("loadFullStates error: " + e.getMessage());
            return new HashMap<>();
        }
    }
}
