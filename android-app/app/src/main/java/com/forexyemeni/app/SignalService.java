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
import java.util.HashSet;
import java.util.Set;

/**
 * SignalService - Foreground Service that polls for new signals every 5 seconds
 * Shows instant notifications when new signals are detected
 * Works even when the app is closed or in background
 */
public class SignalService extends Service {

    private static final String TAG = "SignalService";
    private static final String PREFS_NAME = "forexyemeni_signal_prefs";
    private static final String KEY_KNOWN_SIGNALS = "known_signal_ids";
    private static final String API_URL = "https://trade-signal-pro.vercel.app/api/signals/updates";
    private static final String CHANNEL_ID = "forexyemeni_service";
    private static final int NOTIFICATION_ID = 9999;

    private Handler handler;
    private Runnable pollRunnable;
    private volatile boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;

        // Create notification channels
        NotificationHelper.createAllChannels(this);
        createServiceChannel();

        // Start as foreground service
        startForeground(NOTIFICATION_ID, buildServiceNotification("جاري مراقبة الإشارات..."));

        handler = new Handler(Looper.getMainLooper());

        // Poll every 5 seconds
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isRunning) return;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        checkForUpdates();
                    }
                }).start();
                // Schedule next poll
                if (isRunning) {
                    handler.postDelayed(pollRunnable, 5000);
                }
            }
        };

        // Start polling immediately
        handler.post(pollRunnable);
        Log.d(TAG, "SignalService started - polling every 5 seconds");
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
                    CHANNEL_ID,
                    "خدمة مراقبة الإشارات",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("يحافظ على تشغيل الإشعارات");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildServiceNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

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
                .setContentIntent(pendingIntent)
                .setOngoing(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(Color.parseColor("#FFD700"));
        }

        return builder.build();
    }

    private long lastKnownTime = 0;

    /**
     * Check for new signals using the lightweight updates API
     * This API only returns signal IDs and timestamps - very fast
     */
    private void checkForUpdates() {
        try {
            String urlStr = API_URL + "?since=" + lastKnownTime;
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/3.0");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                Log.w(TAG, "Updates API returned " + responseCode);
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
            boolean hasNew = json.optBoolean("hasNew", false);
            long latestTime = json.optLong("latestTime", 0);

            if (latestTime > lastKnownTime) {
                lastKnownTime = latestTime;
            }

            if (hasNew) {
                // New signals detected! Fetch full signal details
                fetchAndNotifyNewSignals();
            }

        } catch (Exception e) {
            Log.e(TAG, "Error checking updates", e);
        }
    }

    /**
     * Fetch full signal details and show notifications for new ones
     */
    private void fetchAndNotifyNewSignals() {
        try {
            URL url = new URL("https://trade-signal-pro.vercel.app/api/signals?limit=5");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("User-Agent", "ForexYemeni/App/3.0");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) return;

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
            if (signals == null || signals.length() == 0) return;

            Set<String> knownIds = getKnownSignalIds();

            for (int i = 0; i < Math.min(signals.length(), 5); i++) {
                JSONObject signal = signals.getJSONObject(i);
                String id = signal.getString("id");
                String category = signal.optString("signalCategory", "ENTRY");

                if (!knownIds.contains(id)) {
                    String pair = signal.optString("pair", "N/A");
                    String type = signal.optString("type", "BUY");
                    double entry = signal.optDouble("entry", 0);
                    int hitTpIndex = signal.optInt("hitTpIndex", -1);

                    // Show notification based on category
                    if (category.equals("TP_HIT") || category.equals("REENTRY_TP") || category.equals("PYRAMID_TP")) {
                        String tpNum = "TP" + (hitTpIndex + 1);
                        NotificationHelper.showNotification(this,
                                "🎯 هدف محقق — " + pair,
                                tpNum + " تم تحقيقه بنجاح!",
                                "tp_hit");
                    } else if (category.equals("SL_HIT") || category.equals("REENTRY_SL") || category.equals("PYRAMID_SL")) {
                        NotificationHelper.showNotification(this,
                                "🛑 وقف خسارة — " + pair,
                                "تم ضرب وقف الخسارة!",
                                "sl_hit");
                    } else if (category.equals("ENTRY") || category.equals("REENTRY") || category.equals("PYRAMID")) {
                        String typeAr = type.equals("BUY") ? "شراء" : "بيع";
                        NotificationHelper.showNotification(this,
                                "📊 إشارة جديدة — " + pair,
                                typeAr + " @" + entry,
                                type.equals("BUY") ? "buy" : "sell");
                    }

                    // Update service notification
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify(NOTIFICATION_ID, buildServiceNotification("إشارة جديدة: " + pair));
                    }

                    Log.d(TAG, "NOTIFICATION shown for: " + pair + " (" + category + ")");
                }
            }

            // Update known IDs
            Set<String> newKnownIds = new HashSet<>();
            for (int i = 0; i < Math.min(signals.length(), 50); i++) {
                newKnownIds.add(signals.getJSONObject(i).getString("id"));
            }
            saveKnownSignalIds(newKnownIds);

        } catch (Exception e) {
            Log.e(TAG, "Error fetching signals", e);
        }
    }

    private Set<String> getKnownSignalIds() {
        Set<String> ids = new HashSet<>();
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
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

    private void saveKnownSignalIds(Set<String> ids) {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
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
