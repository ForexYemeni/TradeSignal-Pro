package com.forexyemeni.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
 * ForexYemeni VIP Trading Signals - Android App v5.0
 * - WebView wrapping the Next.js PWA
 * - NO foreground service (battery-friendly, no crash on Android 14+)
 * - AlarmManager-based background polling every 30 seconds
 * - State-based signal change detection (no duplicate notifications)
 * - Native notification bridge for JS -> Android notifications
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

            // Create notification channels
            NotificationHelper.createAllChannels(this);

            // Request notification permission for Android 13+
            requestNotificationPermission();

            // Start background polling via AlarmManager (NO foreground service)
            SignalPollReceiver.startPolling(this);

            // Setup WebView
            webView = new WebView(this);
            configureWebView(webView);

            // Add JavaScript interface for native notifications
            webView.addJavascriptInterface(new NativeNotificationInterface(this), "AndroidNotify");

            webView.setWebViewClient(new AppWebViewClient());
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage cm) {
                    android.util.Log.d("WebView", cm.message());
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
            android.util.Log.e("ForexYemeni", "onCreate error", e);
            android.widget.Toast.makeText(this, "Error: " + e.getMessage(), android.widget.Toast.LENGTH_LONG).show();
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
        s.setUserAgentString(s.getUserAgentString() + " ForexYemeni/App/5.0");
        wv.setBackgroundColor(Color.parseColor("#070b14"));
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    private void requestNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
                }
            }
        } catch (Exception e) {
            android.util.Log.e("ForexYemeni", "Permission request error", e);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Do NOT stop polling - it should keep running in background
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
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

    // JavaScript Interface for Native Notifications
    public class NativeNotificationInterface {
        private Context context;

        public NativeNotificationInterface(Context ctx) {
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
                        android.util.Log.e("ForexYemeni", "Notification error", e);
                    }
                }
            });
        }
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (url.startsWith(APP_URL)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)));
            } catch (Exception e) {
                android.util.Log.e("ForexYemeni", "Cannot open URL", e);
            }
            return true;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.proceed();
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            android.util.Log.e("ForexYemeni", "WebView error: " + errorCode + " " + description);
        }
    }
}
