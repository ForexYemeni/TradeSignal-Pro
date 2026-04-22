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
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.view.LayoutInflater;

/**
 * NotificationHelper v1.10 - Creates and shows Android notifications with:
 * - App icon as notification icon
 * - Custom sounds per event type (buy/sell/tp_hit/sl_hit/admin)
 * - Gold VIP styling with large icons
 * - Full-screen intent for critical alerts
 */
public class NotificationHelper {

    public static final String CHANNEL_NEW_SIGNAL = "forexyemeni_new_signal";
    public static final String CHANNEL_TP_HIT = "forexyemeni_tp_hit";
    public static final String CHANNEL_SL_HIT = "forexyemeni_sl_hit";
    public static final String CHANNEL_ADMIN = "forexyemeni_admin";
    public static final String CHANNEL_SERVICE = "forexyemeni_service";

    private static int notificationCounter = 2000;

    public static void createAllChannels(Context context) {
        try {
            // New signal channel - HIGH importance with custom sound
            createChannel(context, CHANNEL_NEW_SIGNAL, "إشارات جديدة", "إشعارات الإشارات الجديدة - شراء وبيع",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // TP hit channel - HIGH importance with success sound
            createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف ربح", "إشعارات تحقيق الأرباح وأهداف الربح",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // SL hit channel - HIGH importance with alert sound
            createChannel(context, CHANNEL_SL_HIT, "وقف خسارة", "إشعارات وقف الخسارة",
                    NotificationManager.IMPORTANCE_HIGH, true);

            // Admin channel - DEFAULT importance
            createChannel(context, CHANNEL_ADMIN, "تنبيهات الإدارة", "إشعارات تسجيل الدخول والموافقات",
                    NotificationManager.IMPORTANCE_DEFAULT, true);

            // Service channel - LOW importance, no sound
            createChannel(context, CHANNEL_SERVICE, "خدمة المراقبة", "خدمة مراقبة الإشارات في الخلفية",
                    NotificationManager.IMPORTANCE_LOW, false);
        } catch (Exception e) {
            android.util.Log.e("ForexYemeni", "Create channels error", e);
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
            channel.setBypassDnd(true);

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

    public static void showNotification(Context context, String title, String body, String soundType) {
        try {
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
            } else {
                channelId = CHANNEL_NEW_SIGNAL;
                color = Color.parseColor("#FFD700");
            }

            notificationCounter++;

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Use app icon as large icon
            Bitmap largeIcon = BitmapFactory.decodeResource(context.getResources(), iconRes);
            if (largeIcon == null) {
                largeIcon = createColoredBitmap(color);
            }

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, channelId);
            } else {
                builder = new Notification.Builder(context);
                builder.setPriority(Notification.PRIORITY_HIGH);
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
                // Make notification show as heads-up
                builder.setPriority(Notification.PRIORITY_HIGH);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Set importance to HIGH for heads-up notification
                builder.setPriority(Notification.PRIORITY_MAX);
            }

            // Big text style for detailed notifications
            Notification.BigTextStyle bigTextStyle = new Notification.BigTextStyle();
            bigTextStyle.setBigContentTitle(title);
            bigTextStyle.bigText(body);
            bigTextStyle.setSummaryText("ForexYemeni VIP");
            builder.setStyle(bigTextStyle);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                Notification notification = builder.build();
                // Ensure heads-up display
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    notification.flags |= Notification.FLAG_INSISTENT;
                }
                manager.notify(notificationCounter, notification);
            }

            // Play custom tone based on event type
            playNotificationTone(context, soundType);
        } catch (Exception e) {
            android.util.Log.e("ForexYemeni", "Show notification error", e);
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

            // Draw "F" letter in center
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
     * Play distinctive notification tones per event type:
     * - buy: 3 ascending beeps (optimistic)
     * - sell: 3 descending beeps (cautious)
     * - tp_hit: triumphant melody (3 quick + 1 long ascending)
     * - sl_hit: urgent double warning tone
     * - admin: 2 short alert tones
     * - default: single prompt tone
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
                        // If completely silent, temporarily raise it
                        boolean wasSilent = currentVol == 0;
                        if (wasSilent && maxVol > 0) {
                            audioManager.setStreamVolume(streamType, Math.max(1, maxVol / 3), 0);
                        }
                    }

                    if ("buy".equals(soundType)) {
                        // Ascending 3-beep pattern for BUY signals
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 200);
                        Thread.sleep(250);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 350);
                        Thread.sleep(400);
                        toneGen.release();
                    } else if ("sell".equals(soundType)) {
                        // Descending 2-beep pattern for SELL signals
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 200);
                        Thread.sleep(250);
                        toneGen.release();
                    } else if ("tp_hit".equals(soundType)) {
                        // Triumphant ascending melody for TP HIT - most distinctive
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        // Quick ascending triplet
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 150);
                        Thread.sleep(200);
                        // Long triumphant note
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 600);
                        Thread.sleep(700);
                        toneGen.release();
                    } else if ("sl_hit".equals(soundType)) {
                        // Urgent double-warning for SL HIT
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                        Thread.sleep(700);
                        toneGen.release();
                    } else if ("admin".equals(soundType)) {
                        // Professional 2-tone admin alert
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_NETWORK_BUSY, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 300);
                        Thread.sleep(350);
                        toneGen.release();
                    } else {
                        // Default single notification tone
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 80);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 400);
                        Thread.sleep(450);
                        toneGen.release();
                    }
                } catch (Exception e) {
                    android.util.Log.e("ForexYemeni", "Tone error", e);
                }
            }
        }).start();
    }
}
