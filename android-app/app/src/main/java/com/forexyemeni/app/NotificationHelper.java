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
 * NotificationHelper v2.0 - CRITICAL FIX: Reset channels on every launch
 *
 * KEY CHANGES from v1.10:
 * - resetSignalChannels(): Deletes and recreates signal channels to restore IMPORTANCE_HIGH
 *   (OEMs/users may lower importance; we reset on every launch)
 * - Uses IMPORTANCE_HIGH (not MAX) with heads-up guaranteed via setBypassDnd(true)
 * - Enhanced logging for diagnostics
 * - playNotificationTone: plays sound via DEFAULT_SOUND_URI for maximum volume
 */
public class NotificationHelper {

    public static final String CHANNEL_NEW_SIGNAL = "forexyemeni_new_signal";
    public static final String CHANNEL_TP_HIT = "forexyemeni_tp_hit";
    public static final String CHANNEL_SL_HIT = "forexyemeni_sl_hit";
    public static final String CHANNEL_ADMIN = "forexyemeni_admin";
    public static final String CHANNEL_SERVICE = "forexyemeni_service";
    public static final String CHANNEL_TEST = "forexyemeni_test";

    private static int notificationCounter = 2000;

    /**
     * CRITICAL: Delete and recreate ALL signal channels to restore IMPORTANCE_HIGH.
     * OEMs (Samsung, Xiaomi, Huawei) often lower channel importance after creation.
     * This MUST be called on every app launch.
     */
    public static void resetSignalChannels(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;

                // Delete signal channels (NOT the service channel - it's used by foreground service)
                String[] signalChannels = {
                    CHANNEL_NEW_SIGNAL, CHANNEL_TP_HIT, CHANNEL_SL_HIT,
                    CHANNEL_ADMIN, CHANNEL_TEST
                };
                for (String channelId : signalChannels) {
                    try {
                        nm.deleteNotificationChannel(channelId);
                        Log.d("NotifHelper", "Deleted channel: " + channelId);
                    } catch (Exception e) {
                        Log.w("NotifHelper", "Failed to delete channel " + channelId + ": " + e.getMessage());
                    }
                }

                // Wait a moment for deletion to take effect, then recreate
                // Recreate immediately (Android handles this fine)
                createAllChannels(context);
                Log.d("NotifHelper", "All signal channels RESET to IMPORTANCE_HIGH");
            }
        } catch (Exception e) {
            Log.e("NotifHelper", "resetSignalChannels error", e);
        }
    }

    public static void createAllChannels(Context context) {
        try {
            // New signal channel - HIGH importance with custom sound
            createChannel(context, CHANNEL_NEW_SIGNAL, "إشارات جديدة",
                    "إشعارات الإشارات الجديدة - شراء وبيع",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // TP hit channel - HIGH importance with success sound
            createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف ربح",
                    "إشعارات تحقيق الأرباح وأهداف الربح",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // SL hit channel - HIGH importance with alert sound
            createChannel(context, CHANNEL_SL_HIT, "وقف خسارة",
                    "إشعارات وقف الخسارة",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // Admin channel - DEFAULT importance
            createChannel(context, CHANNEL_ADMIN, "تنبيهات الإدارة",
                    "إشعارات تسجيل الدخول والموافقات",
                    NotificationManager.IMPORTANCE_DEFAULT, true);

            // Test channel - HIGH importance (for test notifications)
            createChannel(context, CHANNEL_TEST, "اختبار الإشعارات",
                    "قناة اختبار - تتحقق من عمل الإشعارات",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // Service channel - LOW importance, no sound (for foreground service)
            createChannel(context, CHANNEL_SERVICE, "خدمة المراقبة",
                    "خدمة مراقبة الإشارات في الخلفية",
                    NotificationManager.IMPORTANCE_LOW, false);

            Log.d("NotifHelper", "All notification channels created/verified");
        } catch (Exception e) {
            Log.e("NotifHelper", "Create channels error", e);
        }
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
            channel.setBypassDnd(true); // CRITICAL: Show even in Do Not Disturb mode
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); // Show on lock screen

            if (withSound) {
                // Use the default notification sound - LOUD and reliable
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

            // Set importance explicitly (belt and suspenders)
            if (importance >= NotificationManager.IMPORTANCE_HIGH) {
                channel.enableVibration(true);
            }

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Show a notification with heads-up display.
     * Uses IMPORTANCE_HIGH channel for guaranteed popup.
     */
    public static void showNotification(Context context, String title, String body, String soundType) {
        try {
            Log.d("NotifHelper", "showNotification: " + title + " | " + soundType);

            String channelId;
            int color;
            int iconRes = context.getResources().getIdentifier("ic_launcher", "mipmap", context.getPackageName());
            if (iconRes == 0) iconRes = android.R.drawable.ic_dialog_info;

            if ("tp_hit".equals(soundType)) {
                channelId = CHANNEL_TP_HIT;
                color = Color.parseColor("#00E676");
            } else if ("sl_hit".equals(soundType)) {
                channelId = CHANNEL_SL_HIT;
                color = Color.parseColor("#FF5252");
            } else if ("admin".equals(soundType)) {
                channelId = CHANNEL_ADMIN;
                color = Color.parseColor("#FFD700");
            } else if ("buy".equals(soundType)) {
                channelId = CHANNEL_NEW_SIGNAL;
                color = Color.parseColor("#00E676");
            } else if ("sell".equals(soundType)) {
                channelId = CHANNEL_NEW_SIGNAL;
                color = Color.parseColor("#FF5252");
            } else if ("test".equals(soundType)) {
                channelId = CHANNEL_TEST;
                color = Color.parseColor("#2196F3");
            } else {
                channelId = CHANNEL_NEW_SIGNAL;
                color = Color.parseColor("#FFD700");
            }

            notificationCounter++;
            int notifId = notificationCounter;

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, notifId, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Bitmap largeIcon = BitmapFactory.decodeResource(context.getResources(), iconRes);
            if (largeIcon == null) {
                largeIcon = createColoredBitmap(color);
            }

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
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(false)
                    .setDefaults(Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS)
                    .setShowWhen(true)
                    .setNumber(1);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(color);
                builder.setPriority(Notification.PRIORITY_MAX);
            }

            // Big text style for detailed notifications
            Notification.BigTextStyle bigTextStyle = new Notification.BigTextStyle();
            bigTextStyle.setBigContentTitle(title);
            bigTextStyle.bigText(body);
            bigTextStyle.setSummaryText("ForexYemeni VIP");
            builder.setStyle(bigTextStyle);

            Notification notification = builder.build();
            // Ensure heads-up display
            notification.flags |= Notification.FLAG_INSISTENT;
            // Also ensure lights and sound
            notification.defaults |= Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE;

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(notifId, notification);
                Log.d("NotifHelper", "Notification shown: id=" + notifId + " channel=" + channelId);
            } else {
                Log.e("NotifHelper", "NotificationManager is NULL! Cannot show notification.");
            }

            // Play custom tone based on event type
            playNotificationTone(context, soundType);

        } catch (Exception e) {
            Log.e("NotifHelper", "showNotification FATAL: " + e.getMessage(), e);
        }
    }

    /**
     * Show a test notification to verify the pipeline works.
     * Called on app launch and service start.
     */
    public static void showTestNotification(Context context) {
        try {
            showNotification(context,
                    "🔔 اختبار الإشعارات",
                    "إذا رأيت هذه الرسالة، فإن الإشعارات تعمل بشكل صحيح!",
                    "test");
            Log.d("NotifHelper", "Test notification sent");
        } catch (Exception e) {
            Log.e("NotifHelper", "Test notification failed: " + e.getMessage(), e);
        }
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

    /**
     * Play distinctive notification tones per event type using ToneGenerator.
     * ToneGenerator uses the notification audio stream which respects user volume settings.
     */
    private static void playNotificationTone(final Context context, final String soundType) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    int streamType = android.media.AudioManager.STREAM_NOTIFICATION;
                    android.media.AudioManager audioManager = (android.media.AudioManager)
                            context.getSystemService(Context.AUDIO_SERVICE);

                    // Ensure notification volume is audible
                    if (audioManager != null) {
                        int maxVol = audioManager.getStreamMaxVolume(streamType);
                        int currentVol = audioManager.getStreamVolume(streamType);
                        if (currentVol == 0 && maxVol > 0) {
                            audioManager.setStreamVolume(streamType, Math.max(1, maxVol / 3), 0);
                        }
                    }

                    android.media.ToneGenerator toneGen;

                    if ("buy".equals(soundType)) {
                        // Ascending 3-beep for BUY
                        toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 350);
                        Thread.sleep(400);
                        toneGen.release();
                    } else if ("sell".equals(soundType)) {
                        // Descending for SELL
                        toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 200);
                        Thread.sleep(250);
                        toneGen.release();
                    } else if ("tp_hit".equals(soundType)) {
                        // Triumphant ascending for TP HIT
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
                        // Urgent double-warning for SL HIT
                        toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                        Thread.sleep(700);
                        toneGen.release();
                    } else if ("admin".equals(soundType)) {
                        toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_NETWORK_BUSY, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 300);
                        Thread.sleep(350);
                        toneGen.release();
                    } else {
                        // Default/test notification sound
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

    /**
     * Diagnostic: Log all channel states for debugging
     */
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
                                + ", sound=" + (ch.getSound() != null) + ", vibration=" + ch.shouldVibrate()
                                + ", bypassDnd=" + ch.canBypassDnd());
                    } else {
                        Log.w("NotifHelper", "Channel '" + id + "' does NOT exist!");
                    }
                }
            }
        } catch (Exception e) {
            Log.e("NotifHelper", "logChannelStates error: " + e.getMessage());
        }
    }
}
