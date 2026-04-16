package com.forexyemeni.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.view.LayoutInflater;
import android.view.View;

/**
 * NotificationHelper - Creates and shows Android notifications with custom sounds and gold VIP styling
 */
public class NotificationHelper {

    public static final String CHANNEL_NEW_SIGNAL = "forexyemeni_new_signal";
    public static final String CHANNEL_TP_HIT = "forexyemeni_tp_hit";
    public static final String CHANNEL_SL_HIT = "forexyemeni_sl_hit";
    public static final String CHANNEL_ADMIN = "forexyemeni_admin";

    private static int notificationCounter = 2000;

    public static void createAllChannels(Context context) {
        try {
            createChannel(context, CHANNEL_NEW_SIGNAL, "اشارات جديدة", "اشعارات الاشارات الجديدة",
                    NotificationManager.IMPORTANCE_HIGH);
            createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف", "اشعارات تحقيق الارباح",
                    NotificationManager.IMPORTANCE_HIGH);
            createChannel(context, CHANNEL_SL_HIT, "وقف خسارة", "اشعارات وقف الخسارة",
                    NotificationManager.IMPORTANCE_HIGH);
            createChannel(context, CHANNEL_ADMIN, "تنبيهات الادارة", "اشعارات تسجيل الدخول والموافقات",
                    NotificationManager.IMPORTANCE_DEFAULT);
        } catch (Exception e) {
            android.util.Log.e("ForexYemeni", "Create channels error", e);
        }
    }

    private static void createChannel(Context context, String channelId, String channelName,
                                      String description, int importance) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            channel.setDescription(description);
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#FFD700"));
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{200, 100, 200, 100, 200});
            channel.setBypassDnd(true);

            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
            channel.setSound(soundUri, audioAttributes);

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

            if ("tp_hit".equals(soundType)) {
                channelId = CHANNEL_TP_HIT;
                color = Color.parseColor("#00E676");
            } else if ("sl_hit".equals(soundType)) {
                channelId = CHANNEL_SL_HIT;
                color = Color.parseColor("#FF5252");
            } else if ("admin".equals(soundType)) {
                channelId = CHANNEL_ADMIN;
                color = Color.parseColor("#FFD700");
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

            // Create a gold-colored large icon
            Bitmap largeIcon = createColoredBitmap(color);

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, channelId);
            } else {
                builder = new Notification.Builder(context);
                builder.setPriority(Notification.PRIORITY_HIGH);
            }

            builder.setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setLargeIcon(largeIcon)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(false)
                    .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS)
                    .setShowWhen(true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(color);
            }

            // Big text style for detailed notifications
            Notification.BigTextStyle bigTextStyle = new Notification.BigTextStyle();
            bigTextStyle.setBigContentTitle(title);
            bigTextStyle.bigText(body);
            builder.setStyle(bigTextStyle);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                Notification notification = builder.build();
                manager.notify(notificationCounter, notification);
            }

            // Play custom tone
            playNotificationTone(soundType);
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

    private static void playNotificationTone(final String soundType) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    int streamType = android.media.AudioManager.STREAM_NOTIFICATION;

                    if ("buy".equals(soundType)) {
                        // Ascending tone for buy signals
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 300);
                        Thread.sleep(350);
                        toneGen.release();
                    } else if ("sell".equals(soundType)) {
                        // Descending tone for sell signals
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                        Thread.sleep(350);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 300);
                        Thread.sleep(350);
                        toneGen.release();
                    } else if ("tp_hit".equals(soundType)) {
                        // Success melody for TP hit
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 800);
                        Thread.sleep(850);
                        toneGen.release();
                    } else if ("sl_hit".equals(soundType)) {
                        // Warning tone for SL hit
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                        Thread.sleep(650);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                        Thread.sleep(650);
                        toneGen.release();
                    } else if ("admin".equals(soundType)) {
                        // Admin alert tone
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_NETWORK_BUSY, 400);
                        Thread.sleep(450);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 400);
                        Thread.sleep(450);
                        toneGen.release();
                    } else {
                        // Default notification tone
                        android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                        toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 500);
                        Thread.sleep(550);
                        toneGen.release();
                    }
                } catch (Exception e) {
                    android.util.Log.e("ForexYemeni", "Tone error", e);
                }
            }
        }).start();
    }
}
