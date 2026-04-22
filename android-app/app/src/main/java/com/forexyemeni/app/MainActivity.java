package com.forexyemeni.app;

import android.Manifest;
import android.app.Activity;
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
 * ForexYemeni VIP Trading Signals - Android App v1.10
 *
 * Architecture:
 * - WebView wraps the Next.js PWA (primary UI + real-time SSE)
 * - SignalService: foreground service, 2s polling, survives background
 * - SignalPollReceiver: heartbeat every 15s, restarts service if killed
 * - BootReceiver: restarts everything after reboot/update
 * - NativeBridge: JS → native notifications + session token sharing
 */
public class MainActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://trade-signal-pro.vercel.app";

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

            // 1. Create notification channels
            NotificationHelper.createAllChannels(this);

            // 2. Request notification permission (Android 13+)
            requestNotificationPermission();

            // 3. Request battery optimization whitelist (CRITICAL for background service)
            requestBatteryWhitelist();

            // 4. Start foreground service + heartbeat
            startSignalService();

            // 5. Setup WebView
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
        s.setUserAgentString(s.getUserAgentString() + " ForexYemeni/App/1.10");
        wv.setBackgroundColor(Color.parseColor("#070b14"));
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    /**
     * Request POST_NOTIFICATIONS permission (Android 13+)
     */
    private void requestNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
                }
            }
        } catch (Exception e) {
            Log.e("ForexYemeni", "Notification permission error", e);
        }
    }

    /**
     * CRITICAL: Request battery optimization whitelist
     * Without this, Android will kill the service when the app is swiped away.
     * Opens the system settings page where user can select "Don't optimize".
     */
    private void requestBatteryWhitelist() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    // Show a gentle prompt to the user
                    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                // Check if notification permission is granted before showing dialog
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                        return; // Don't show battery dialog before notification permission
                                    }
                                }

                                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                                intent.setData(Uri.parse("package:" + getPackageName()));
                                startActivity(intent);
                            } catch (Exception e) {
                                // Some devices don't support this intent — silently ignore
                                Log.w("ForexYemeni", "Battery whitelist dialog not supported");
                            }
                        }
                    }, 3000); // Show 3 seconds after app launch
                }
            }

            // Also request SCHEDULE_EXACT_ALARM on Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception e) {
                        Log.w("ForexYemeni", "Exact alarm permission dialog not supported");
                    }
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
            Log.d("ForexYemeni", "SignalService started");
        } catch (Exception e) {
            Log.e("ForexYemeni", "Failed to start service, starting heartbeat only", e);
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
        // Ensure service is still running when user returns
        try {
            SignalService.setSessionToken(this, ""); // Will be set by WebView
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Do NOT stop the service or heartbeat — they keep running
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        Log.d("ForexYemeni", "Activity destroyed — service + heartbeat continue");
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

    /**
     * JavaScript Bridge — WebView ↔ Native communication
     *
     * Methods callable from JS:
     * - AndroidNotify.sendNotification(title, body, soundType)
     * - AndroidNotify.setSessionToken(token)
     */
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
                        Log.d("ForexYemeni", "Session token shared with service");
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
