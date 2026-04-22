package com.forexyemeni.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.http.SslError;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.SslErrorHandler;

/**
 * ForexYemeni VIP Trading Signals - Android App v2.1
 *
 * CRITICAL FIXES from v2.0:
 * 1. Removed onResume() token clearing bug
 * 2. Added notification permission result handler
 * 3. Battery whitelist request only after notification permission confirmed
 * 4. If notification permission denied, opens app settings directly
 * 5. Channels reset on every launch
 */
public class MainActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://trade-signal-pro.vercel.app";
    private static final int NOTIFICATION_PERMISSION_CODE = 100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            );
            getWindow().setStatusBarColor(Color.parseColor("#070b14"));
            getWindow().setNavigationBarColor(Color.parseColor("#070b14"));

            // 1. Reset notification channels
            NotificationHelper.resetSignalChannels(this);
            NotificationHelper.logChannelStates(this);

            // 2. Request notification permission
            requestNotificationPermission();

            // 3. Start signal service
            startSignalService();

            // 4. Setup WebView
            webView = new WebView(this);
            configureWebView(webView);
            webView.addJavascriptInterface(new NativeBridge(this), "AndroidNotify");
            webView.setWebViewClient(new AppWebViewClient());
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage cm) {
                    Log.d("WebView", cm.message());
                    return true;
                }
            });

            setContentView(webView);

            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }

            // 5. Show test notification after permission is likely granted (5s delay)
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (NotificationHelper.hasNotificationPermission(MainActivity.this)) {
                        NotificationHelper.showTestNotification(MainActivity.this);
                        Log.d("ForexYemeni", "Test notification sent (permission granted)");
                        // Now request battery whitelist
                        requestBatteryWhitelist();
                    } else {
                        Log.w("ForexYemeni", "Notification permission DENIED - opening settings");
                        openNotificationSettings();
                    }
                }
            }, 5000);

        } catch (Exception e) {
            Log.e("ForexYemeni", "onCreate error", e);
        }
    }

    private void configureWebView(WebView wv) {
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " ForexYemeni/App/2.1");
        wv.setBackgroundColor(Color.parseColor("#070b14"));
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_CODE);
                Log.d("ForexYemeni", "Requesting notification permission");
            } else {
                Log.d("ForexYemeni", "Notification permission already granted");
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d("ForexYemeni", "Notification permission GRANTED!");
                // Reset channels now that we have permission
                NotificationHelper.resetSignalChannels(this);
                // Show test notification immediately
                NotificationHelper.showTestNotification(this);
                // Request battery whitelist
                requestBatteryWhitelist();
            } else {
                Log.w("ForexYemeni", "Notification permission DENIED!");
                // Open notification settings for the user
                openNotificationSettings();
            }
        }
    }

    /**
     * Open app notification settings so user can enable notifications manually
     */
    private void openNotificationSettings() {
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(intent);
            Log.d("ForexYemeni", "Opened notification settings for user");
        } catch (Exception e) {
            Log.e("ForexYemeni", "Failed to open settings", e);
        }
    }

    private void requestBatteryWhitelist() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                                intent.setData(Uri.parse("package:" + getPackageName()));
                                startActivity(intent);
                            } catch (Exception e) {
                                Log.w("ForexYemeni", "Battery whitelist not supported");
                            }
                        }
                    }, 2000);
                }
            }

            // Request exact alarm permission on Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception e) {
            Log.e("ForexYemeni", "Battery whitelist error", e);
        }
    }

    private void startSignalService() {
        try {
            Intent serviceIntent = new Intent(this, SignalService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            Log.d("ForexYemeni", "SignalService start requested");
        } catch (Exception e) {
            Log.e("ForexYemeni", "Failed to start service", e);
            SignalPollReceiver.startHeartbeat(this);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // DO NOT clear token! Just ensure service is alive.
        try {
            if (!SignalService.isServiceAlive(this)) {
                startSignalService();
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        Log.d("ForexYemeni", "Activity destroyed — service continues");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    public class NativeBridge {
        private Context context;

        public NativeBridge(Context ctx) {
            this.context = ctx;
        }

        @JavascriptInterface
        public void sendNotification(final String title, final String body, final String soundType) {
            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    try {
                        NotificationHelper.showNotification(context, title, body, soundType);
                    } catch (Exception e) {
                        Log.e("ForexYemeni", "Notification error", e);
                    }
                }
            });
        }

        @JavascriptInterface
        public void setSessionToken(final String token) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        SignalService.setSessionToken(context, token);
                        Log.d("ForexYemeni", "Token shared: " +
                                (token.isEmpty() ? "EMPTY" : token.substring(0, Math.min(12, token.length())) + "..."));
                    } catch (Exception e) {
                        Log.e("ForexYemeni", "Token error", e);
                    }
                }
            }).start();
        }
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (url.startsWith(APP_URL)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Log.e("ForexYemeni", "Cannot open URL", e);
            }
            return true;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.proceed();
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.e("ForexYemeni", "WebView error: " + errorCode + " " + description);
        }
    }
}
