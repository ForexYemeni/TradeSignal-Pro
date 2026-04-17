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
 * SignalService v3 - Foreground Service for real-time signal monitoring
 * - Polls every 5 seconds for new signals AND status changes (TP/SL hits)
 * - Tracks full signal state: id -> "status|category|hitTpIndex"
 * - On FIRST RUN: silently records all existing signals (NO notifications)
 * - On STATE CHANGE: uses STATUS (not category) to determine notification type
 *   - ACTIVE + ENTRY category -> "new signal" notification
 *   - HIT_TP status -> "TP hit" notification (with correct TP number)
 *   - HIT_SL status -> "SL hit" notification
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_STATES = "known_signal_states";
    private static final String KEY_INITIALIZED = "service_initialized_v3";
    private static final String API_URL = "https://trade-signal-pro.vercel.app/api/signals";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;

        NotificationHelper.createAllChannels(this);
        createServiceChannel();
        startForeground(NOTIFICATION_ID, buildServiceNotification("جاري مراقبة الإشارات..."));

        handler = new Handler(Looper.getMainLooper());

        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning) return;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        checkSignals();
                    }
                }).start();
                if (isRunning) {
                    handler.postDelayed(pollRunnable, 5000);
                }
            }
        };

        handler.post(pollRunnable);
        Log.d(TAG, "SignalService v3 started - polling every 5s");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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
        Log.d(TAG, "SignalService destroyed");
    }

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "خدمة مراقبة الإشارات", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("يحافظ على تشغيل الإشعارات");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildServiceNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_LOW);
        }
        builder.setContentTitle("ForexYemeni VIP")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pi)
                .setOngoing(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(Color.parseColor("#FFD700"));
        }
        return builder.build();
    }

    /**
     * Fetch latest signals and compare with known states
     * FIRST RUN: silently save all existing signals (no notifications)
     * SUBSEQUENT RUNS: detect new signals AND status changes
     */
    private void checkSignals() {
        try {
            URL url = new URL(API_URL + "?limit=10");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/4.2");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            int code = conn.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "API returned " + code);
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            JSONObject json = new JSONObject(sb.toString());
            JSONArray signals = json.optJSONArray("signals");
            if (signals == null || signals.length() == 0) return;

            // Check if this is the FIRST run (never initialized before)
            boolean isFirstRun = !isInitialized();

            // Load known states: id -> "status|category|hitTpIndex"
            Map<String, String> knownStates = loadKnownStates();

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
                        showTpNotification(pair, hitTpIndex, category);
                        Log.d(TAG, "NEW TP signal: " + pair + " TP" + hitTpIndex + " [" + category + "]");
                    } else if (isSlHit) {
                        showSlNotification(pair);
                        Log.d(TAG, "NEW SL signal: " + pair);
                    } else {
                        showNewSignalNotification(pair, type, entry);
                        Log.d(TAG, "NEW signal: " + pair + " (" + category + ")");
                    }
                    notifiedCount++;
                } else {
                    // Existing signal - check if state changed
                    String oldState = knownStates.get(id);
                    if (!state.equals(oldState)) {
                        // State changed! Determine what changed
                        // Check category change to detect partial TP hits (status stays ACTIVE)
                        if (isTpHit) {
                            showTpNotification(pair, hitTpIndex, category);
                            Log.d(TAG, "TP HIT: " + pair + " TP" + hitTpIndex + " [" + category + "] from [" + oldState + "]");
                        } else if (isSlHit) {
                            showSlNotification(pair);
                            Log.d(TAG, "SL HIT: " + pair + " from [" + oldState + "]");
                        } else {
                            showNewSignalNotification(pair, type, entry);
                            Log.d(TAG, "STATE CHANGED: " + pair + " from [" + oldState + "] to [" + state + "]");
                        }
                        notifiedCount++;
                    }
                }

                newStates.put(id, state);
            }

            // Mark as initialized after first poll completes
            if (isFirstRun) {
                markInitialized();
                Log.d(TAG, "Service initialized with " + newStates.size() + " existing signals (no notifications sent)");
            }

            // Save new states (keep max 50)
            saveKnownStates(newStates, 50);

            if (notifiedCount > 0) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.notify(NOTIFICATION_ID, buildServiceNotification(notifiedCount + " إشعارات جديدة"));
                    // Reset service notification after 5 seconds
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (isRunning) {
                                nm.notify(NOTIFICATION_ID, buildServiceNotification("جاري مراقبة الإشارات..."));
                            }
                        }
                    }, 5000);
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Error checking signals", e);
        }
    }

    /**
     * Show "New Signal" notification (BUY or SELL)
     */
    private void showNewSignalNotification(String pair, String type, double entry) {
        String typeAr = type.equals("BUY") ? "شراء" : "بيع";
        NotificationHelper.showNotification(this,
                "📊 إشارة جديدة — " + pair,
                typeAr + " @" + entry,
                type.equals("BUY") ? "buy" : "sell");
    }

    /**
     * Show "TP Hit" notification with correct TP number
     */
    private void showTpNotification(String pair, int hitTpIndex, String category) {
        String catIcon, catLabel;
        if ("REENTRY_TP".equals(category)) {
            catIcon = "♻️"; catLabel = "تعويض";
        } else if ("PYRAMID_TP".equals(category)) {
            catIcon = "🔥"; catLabel = "تعزيز";
        } else {
            catIcon = "🎯"; catLabel = "هدف";
        }
        String tpNum = catLabel + " " + hitTpIndex;
        NotificationHelper.showNotification(this,
                catIcon + " " + catLabel + " محقق — " + pair,
                tpNum + " تم تحقيقه بنجاح!",
                "tp_hit");
    }

    /**
     * Show "SL Hit" notification
     */
    private void showSlNotification(String pair) {
        NotificationHelper.showNotification(this,
                "🛑 وقف خسارة — " + pair,
                "تم ضرب وقف الخسارة!",
                "sl_hit");
    }

    /**
     * Check if service has been initialized before
     * First run = no saved states and never initialized
     */
    private boolean isInitialized() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getBoolean(KEY_INITIALIZED, false);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Mark service as initialized - won't send notifications for existing signals
     */
    private void markInitialized() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putBoolean(KEY_INITIALIZED, true).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error marking initialized", e);
        }
    }

    /**
     * Load known signal states from SharedPreferences
     * Format: "id1=state1,id2=state2,..."
     */
    private Map<String, String> loadKnownStates() {
        Map<String, String> states = new HashMap<>();
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
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
     * Format: "id1=state1,id2=state2,..."
     * Keeps only the last 'maxEntries' signals
     */
    private void saveKnownStates(Map<String, String> states, int maxEntries) {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
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
