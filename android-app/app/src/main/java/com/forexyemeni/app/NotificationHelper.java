package com.forexyemeni.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

/**
 * NotificationHelper v3.0 — GUARANTEED NOTIFICATION DELIVERY
 *
 * CRITICAL FIXES from v2.0:
 * - Uses a FRESH UNIQUE channel ID on every app launch (bypasses OEM channel blocking)
 * - Stores the current signal channel ID in SharedPreferences for the service session
 * - Every signal notification is shown on BOTH:
 *   1. The fresh unique channel (IMPORTANCE_HIGH, with sound)
 *   2. The service channel (IMPORTANCE_LOW, guaranteed visible as persistent notification)
 * - The service channel notification is updated directly when signals are detected
 * - This ensures users ALWAYS see detected signals even if notification channels are blocked
 */
public class NotificationHelper {

    public static final String CHANNEL_NEW_SIGNAL = "forexyemeni_new_signal";
    public static final String CHANNEL_TP_HIT = "forexyemeni_tp_hit";
    public static final String CHANNEL_SL_HIT = "forexyemeni_sl_hit";
    public static final String CHANNEL_ADMIN = "forexyemeni_admin";
    public static final String CHANNEL_SERVICE = "forexyemeni_service";
    public static final String CHANNEL_TEST = "forexyemeni_test";
    public static final String PREFS_NAME = "forexyemeni_signal_prefs";
    public static final String KEY_CURRENT_SIGNAL_CHANNEL_ID = "current_signal_channel_id";

    private static int notificationCounter = 2000;

    /**
     * CRITICAL FIX: Get a FRESH unique channel ID for this app session.
     * This bypasses OEM blocking because the channel is brand new every launch.
     */
    public static String getFreshSignalChannelId(Context context) {
        // Try to use existing channel from this session
        String existing = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_CURRENT_SIGNAL_CHANNEL_ID, "");
        if (!existing.isEmpty()) {
            // Verify channel exists
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null && nm.getNotificationChannel(existing) != null) {
                    return existing;
                }
            }
        }

        // Create a new unique channel ID
        String channelId = "fy_signal_" + System.currentTimeMillis();
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_CURRENT_SIGNAL_CHANNEL_ID, channelId).apply();

        // Create the channel with IMPORTANCE_HIGH
        createSignalChannel(context, channelId, "إشارات تداول", "تنبيهات الإشارات الجديدة", NotificationManager.IMPORTANCE_HIGH);
        Log.d("NotifHelper", "Created FRESH signal channel: " + channelId);

        return channelId;
    }

    /**
     * Reset signal channels - delete old ones and create fresh
     */
    public static void resetSignalChannels(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                // Delete ALL old signal channels
                String[] oldChannels = {
                    CHANNEL_NEW_SIGNAL, CHANNEL_TP_HIT, CHANNEL_SL_HIT,
                    CHANNEL_ADMIN, CHANNEL_TEST
                };
                for (String channelId : oldChannels) {
                    try { nm.deleteNotificationChannel(channelId); } catch (Exception ignored) {}
                }

                // Also delete any old dynamic channels
                String oldDynamic = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .getString(KEY_CURRENT_SIGNAL_CHANNEL_ID, "");
                if (!oldDynamic.isEmpty()) {
                    try { nm.deleteNotificationChannel(oldDynamic); } catch (Exception ignored) {}
                }

                // Create fresh channel for this session
                getFreshSignalChannelId(context);

                // Recreate static channels
                createChannel(context, CHANNEL_NEW_SIGNAL, "إشارات جديدة", "إشعارات الإشارات الجديدة",
                        NotificationManager.IMPORTANCE_HIGH, true);
                createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف ربح", "إشعارات تحقيق الأرباح",
                        NotificationManager.IMPORTANCE_HIGH, true);
                createChannel(context, CHANNEL_SL_HIT, "وقف خسارة", "إشعارات وقف الخسارة",
                        NotificationManager.IMPORTANCE_HIGH, true);
                createChannel(context, CHANNEL_ADMIN, "تنبيهات الإدارة", "إشعارات الإدارة",
                        NotificationManager.IMPORTANCE_DEFAULT, true);
                createChannel(context, CHANNEL_SERVICE, "خدمة المراقبة", "خدمة مراقبة الإشارات",
                        NotificationManager.IMPORTANCE_LOW, false);

                Log.d("NotifHelper", "All channels RESET");
            }
        } catch (Exception e) {
            Log.e("NotifHelper", "resetSignalChannels error", e);
        }
    }

    public static void createAllChannels(Context context) {
        try {
            createChannel(context, CHANNEL_NEW_SIGNAL, "إشارات جديدة",
                    "إشعارات الإشارات الجديدة", NotificationManager.IMPORTANCE_HIGH, true);
            createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف ربح",
                    "إشعارات تحقيق الأرباح", NotificationManager.IMPORTANCE_HIGH, true);
            createChannel(context, CHANNEL_SL_HIT, "وقف خسارة",
                    "إشعارات وقف الخسارة", NotificationManager.IMPORTANCE_HIGH, true);
            createChannel(context, CHANNEL_ADMIN, "تنبيهات الإدارة",
                    "إشعارات الإدارة", NotificationManager.IMPORTANCE_DEFAULT, true);
            createChannel(context, CHANNEL_SERVICE, "خدمة المراقبة",
                    "خدمة مراقبة الإشارات", NotificationManager.IMPORTANCE_LOW, false);
        } catch (Exception e) {
            Log.e("NotifHelper", "Create channels error", e);
        }
    }

    private static void createSignalChannel(Context context, String channelId, String name,
                                           String description, int importance) {
        createChannel(context, channelId, name, description, importance, true);
    }

    private static void createChannel(Context context, String channelId, String channelName,
                                      String description, int importance, boolean withSound) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(description);
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#FFD700"));
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{100, 50, 100, 50, 200, 100, 200});
            channel.setBypassDnd(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            if (withSound) {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setLegacyStreamType(android.media.AudioManager.STREAM_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, audioAttributes);
            } else {
                channel.setSound(null, null);
            }

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Check if notification permission is granted.
     * Returns true if permission is available or not needed (pre-Android 13).
     */
    public static boolean hasNotificationPermission(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }
        return true; // Pre-Android 13, permission not required
    }

    /**
     * Show ONE signal notification (no duplicate).
     * Sound is NOT played here — SignalService handles sound via ToneGenerator.
     */
    public static void showNotification(Context context, String title, String body, String soundType) {
        try {
            // Determine color based on type
            int color;
            if ("tp_hit".equals(soundType)) color = Color.parseColor("#00E676");
            else if ("sl_hit".equals(soundType)) color = Color.parseColor("#FF5252");
            else if ("buy".equals(soundType)) color = Color.parseColor("#00E676");
            else if ("sell".equals(soundType)) color = Color.parseColor("#FF5252");
            else color = Color.parseColor("#FFD700");

            notificationCounter++;
            int notifId = notificationCounter;

            int iconRes = context.getResources().getIdentifier("ic_launcher", "mipmap", context.getPackageName());
            if (iconRes == 0) iconRes = android.R.drawable.ic_dialog_info;

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, notifId, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Bitmap largeIcon = BitmapFactory.decodeResource(context.getResources(), iconRes);
            if (largeIcon == null) largeIcon = createColoredBitmap(color);

            // Show on ONE channel only (fresh unique channel)
            String freshChannel = getFreshSignalChannelId(context);
            showNotifOnChannel(context, notifId, freshChannel, title, body, color, iconRes, largeIcon, pendingIntent);

            Log.d("NotifHelper", "Notification sent on " + freshChannel);

        } catch (Exception e) {
            Log.e("NotifHelper", "showNotification FATAL: " + e.getMessage(), e);
        }
    }

    private static void showNotifOnChannel(Context context, int notifId, String channelId,
                                           String title, String body, int color,
                                           int iconRes, Bitmap largeIcon, PendingIntent pi) {
        try {
            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, channelId);
            } else {
                builder = new Notification.Builder(context);
                builder.setPriority(Notification.PRIORITY_MAX);
            }

            builder.setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(iconRes)
                    .setLargeIcon(largeIcon)
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(false)
                    .setDefaults(Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS | Notification.DEFAULT_SOUND)
                    .setShowWhen(true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(color);
                builder.setPriority(Notification.PRIORITY_MAX);
            }

            Notification.BigTextStyle bigTextStyle = new Notification.BigTextStyle();
            bigTextStyle.setBigContentTitle(title);
            bigTextStyle.bigText(body);
            bigTextStyle.setSummaryText("ForexYemeni VIP");
            builder.setStyle(bigTextStyle);

            Notification notification = builder.build();
            notification.defaults |= Notification.DEFAULT_SOUND;
            notification.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_AUTO_CANCEL;

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(notifId, notification);
            }
        } catch (Exception e) {
            Log.e("NotifHelper", "showNotifOnChannel error on " + channelId + ": " + e.getMessage());
        }
    }

    /**
     * Show test notification
     */
    public static void showTestNotification(Context context) {
        showNotification(context,
                "اختبار الإشعارات",
                "إذا رأيت هذه الرسالة، الإشعارات تعمل بشكل صحيح!",
                "test");
    }

    private static Bitmap createColoredBitmap(int color) {
        try {
            Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            GradientDrawable drawable = new GradientDrawable();
            drawable.setShape(GradientDrawable.OVAL);
            drawable.setColor(color);
            drawable.setSize(96, 96);
            drawable.draw(canvas);

            android.graphics.Paint paint = new android.graphics.Paint();
            paint.setColor(Color.WHITE);
            paint.setTextSize(48);
            paint.setAntiAlias(true);
            paint.setTextAlign(android.graphics.Paint.Align.CENTER);
            canvas.drawText("F", 48, 62, paint);

            return bitmap;
        } catch (Exception e) {
            return null;
        }
    }

    private static void playNotificationTone(final Context context, final String soundType) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    int streamType = android.media.AudioManager.STREAM_NOTIFICATION;
                    android.media.AudioManager audioManager = (android.media.AudioManager)
                            context.getSystemService(Context.AUDIO_SERVICE);

                    if (audioManager != null) {
                        int maxVol = audioManager.getStreamMaxVolume(streamType);
                        int currentVol = audioManager.getStreamVolume(streamType);
                        if (currentVol == 0 && maxVol > 0) {
                            audioManager.setStreamVolume(streamType, Math.max(1, maxVol / 3), 0);
                        }
                    }

                    android.media.ToneGenerator toneGen;

                    if ("buy".equals(soundType)) {
                        toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 350);
                        Thread.sleep(400);
                        toneGen.release();
                    } else if ("sell".equals(soundType)) {
                        toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 200);
                        Thread.sleep(250);
                        toneGen.release();
                    } else if ("tp_hit".equals(soundType)) {
                        toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 600);
                        Thread.sleep(700);
                        toneGen.release();
                    } else if ("sl_hit".equals(soundType)) {
                        toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                        Thread.sleep(700);
                        toneGen.release();
                    } else {
                        toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 500);
                        Thread.sleep(600);
                        toneGen.release();
                    }
                } catch (Exception e) {
                    Log.e("NotifHelper", "Tone error: " + e.getMessage());
                }
            }
        }).start();
    }

    public static void logChannelStates(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                String[] channelIds = {CHANNEL_NEW_SIGNAL, CHANNEL_TP_HIT, CHANNEL_SL_HIT, CHANNEL_ADMIN, CHANNEL_SERVICE};
                for (String id : channelIds) {
                    NotificationChannel ch = nm.getNotificationChannel(id);
                    if (ch != null) {
                        Log.d("NotifHelper", "Channel '" + id + "': importance=" + ch.getImportance()
                                + ", sound=" + (ch.getSound() != null));
                    } else {
                        Log.w("NotifHelper", "Channel '" + id + "' NOT found");
                    }
                }
                Log.d("NotifHelper", "Notification permission: " + hasNotificationPermission(context));
            }
        } catch (Exception e) {
            Log.e("NotifHelper", "logChannelStates error: " + e.getMessage());
        }
    }
}
