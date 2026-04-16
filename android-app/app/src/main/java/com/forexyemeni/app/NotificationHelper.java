package com.forexyemeni.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * NotificationHelper - Creates and shows Android notifications with custom sounds
 */
public class NotificationHelper {

    public static final String CHANNEL_NEW_SIGNAL = "forexyemeni_new_signal";
    public static final String CHANNEL_TP_HIT = "forexyemeni_tp_hit";
    public static final String CHANNEL_SL_HIT = "forexyemeni_sl_hit";
    public static final String CHANNEL_ADMIN = "forexyemeni_admin";

    private static int notificationCounter = 2000;

    public static void createAllChannels(Context context) {
        createChannel(context, CHANNEL_NEW_SIGNAL, "اشارات جديدة", "اشعارات الاشارات الجديدة",
                NotificationManager.IMPORTANCE_HIGH);
        createChannel(context, CHANNEL_TP_HIT, "تحقيق هدف", "اشعارات تحقيق الارباح",
                NotificationManager.IMPORTANCE_HIGH);
        createChannel(context, CHANNEL_SL_HIT, "وقف خسارة", "اشعارات وقف الخسارة",
                NotificationManager.IMPORTANCE_HIGH);
        createChannel(context, CHANNEL_ADMIN, "تنبيهات الادارة", "اشعارات تسجيل الدخول والموافقات",
                NotificationManager.IMPORTANCE_DEFAULT);
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
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS)
                .setShowWhen(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setColor(color);
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            Notification notification = builder.build();
            notification.flags |= Notification.FLAG_INSISTENT;
            manager.notify(notificationCounter, notification);
        }

        // Play custom tone using ToneGenerator
        playNotificationTone(soundType);
    }

    private static void playNotificationTone(String soundType) {
        try {
            int streamType = android.media.AudioManager.STREAM_NOTIFICATION;
            int toneDuration;

            if ("buy".equals(soundType)) {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                toneGen.release();
            } else if ("sell".equals(soundType)) {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 300);
                try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                toneGen.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 300);
                try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                toneGen.release();
            } else if ("tp_hit".equals(soundType)) {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_PIP, 800);
                try { Thread.sleep(850); } catch (InterruptedException ignored) {}
                toneGen.release();
            } else if ("sl_hit".equals(soundType)) {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_ABBR_ALERT, 600);
                try { Thread.sleep(650); } catch (InterruptedException ignored) {}
                toneGen.release();
            } else if ("admin".equals(soundType)) {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_CDMA_NETWORK_BUSY, 400);
                try { Thread.sleep(450); } catch (InterruptedException ignored) {}
                toneGen.release();
            } else {
                android.media.ToneGenerator toneGen = new android.media.ToneGenerator(streamType, 100);
                toneGen.startTone(android.media.ToneGenerator.TONE_PROP_PROMPT, 500);
                try { Thread.sleep(550); } catch (InterruptedException ignored) {}
                toneGen.release();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
