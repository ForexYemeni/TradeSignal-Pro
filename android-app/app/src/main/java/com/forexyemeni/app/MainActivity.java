package com.forexyemeni.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
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
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * ForexYemeni VIP Trading Signals - Android App v3.0
 *
 * CRITICAL FIX: Token is now read DIRECTLY from WebView localStorage
 * instead of relying on the unreliable JavaScript bridge.
 *
 * The JS bridge (AndroidNotify.setSessionToken) was NOT working on some devices.
 * New approach: onPageFinished reads localStorage('adminSession') and extracts the user ID.
 * Also repeats this check every 15 seconds via Handler.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://trade-signal-pro.vercel.app";
    private static final int NOTIFICATION_PERMISSION_CODE = 100;
    private Handler tokenCheckHandler;
    private Runnable tokenCheckRunnable;

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

            // 2. Request notification permission
            requestNotificationPermission();

            // 3. Start signal service
            startSignalService();

            // 4. Setup WebView with token extraction
            webView = new WebView(this);
            configureWebView(webView);
            webView.addJavascriptInterface(new NativeBridge(this), "AndroidNotify");
            webView.setWebViewClient(new TokenExtractingWebViewClient());
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

            // 5. Start periodic token extraction (every 15 seconds)
            tokenCheckHandler = new Handler(Looper.getMainLooper());
            tokenCheckRunnable = new Runnable() {
                @Override
                public void run() {
                    if (webView != null) {
                        extractTokenFromWebView();
                    }
                    tokenCheckHandler.postDelayed(this, 15000);
                }
            };
            // Start after 5 seconds (give WebView time to load)
            tokenCheckHandler.postDelayed(tokenCheckRunnable, 5000);

            // 6. Request battery whitelist after 8 seconds
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    requestBatteryWhitelist();
                }
            }, 8000);

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
        s.setUserAgentString(s.getUserAgentString() + " ForexYemeni/App/3.0");
        wv.setBackgroundColor(Color.parseColor("#070b14"));
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    /**
     * CRITICAL FIX: Read the session token DIRECTLY from WebView's localStorage.
     * This bypasses the unreliable JavaScript bridge completely.
     *
     * JavaScript executed:
     *   var s = localStorage.getItem('adminSession');
     *   if (s) { var p = JSON.parse(s); return p.id || ''; }
     *   return '';
     */
    private void extractTokenFromWebView() {
        if (webView == null) return;
        try {
            webView.evaluateJavascript(
                "(function(){try{var s=localStorage.getItem('adminSession');if(s){var p=JSON.parse(s);if(p&&p.id){return p.id;}}return'';}catch(e){return'';}})()",
                new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        try {
                            if (value != null && !value.equals("null") && !value.equals("") && value.length() > 5) {
                                // Remove surrounding quotes
                                String token = value.replace("\"", "").trim();
                                if (token.length() > 10 && !token.startsWith("null")) {
                                    // Save token to native service
                                    String oldToken = getSharedPreferences("forexyemeni_signal_prefs", MODE_PRIVATE)
                                            .getString("fy_session_token", "");
                                    if (!token.equals(oldToken)) {
                                        SignalService.setSessionToken(MainActivity.this, token);
                                        Log.d("ForexYemeni", "TOKEN EXTRACTED FROM LOCALSTORAGE: " +
                                                token.substring(0, Math.min(12, token.length())) + "...");
                                    }
                                }
                            }
                        } catch (Exception e) {
                            Log.e("ForexYemeni", "extractToken error: " + e.getMessage());
                        }
                    }
                }
            );
        } catch (Exception e) {
            Log.e("ForexYemeni", "evaluateJavascript error: " + e.getMessage());
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                NotificationHelper.resetSignalChannels(this);
            } else {
                openNotificationSettings();
            }
        }
    }

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
        } catch (Exception ignored) {}
    }

    private void requestBatteryWhitelist() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM));
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception ignored) {}
    }

    private void startSignalService() {
        try {
            Intent serviceIntent = new Intent(this, SignalService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
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
        // Extract token when user returns to app
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                extractTokenFromWebView();
            }
        }, 2000);
        // Ensure service is alive
        try {
            if (!SignalService.isServiceAlive(this)) {
                startSignalService();
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (tokenCheckHandler != null && tokenCheckRunnable != null) {
            tokenCheckHandler.removeCallbacks(tokenCheckRunnable);
        }
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

    public class NativeBridge {
        private Context context;
        public NativeBridge(Context ctx) { this.context = ctx; }

        @JavascriptInterface
        public void sendNotification(final String title, final String body, final String soundType) {
            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    try {
                        NotificationHelper.showNotification(context, title, body, soundType);
                    } catch (Exception ignored) {}
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
                        Log.d("ForexYemeni", "Token from JS bridge: " +
                                (token.isEmpty() ? "EMPTY" : token.substring(0, Math.min(12, token.length())) + "..."));
                    } catch (Exception ignored) {}
                }
            }).start();
        }
    }

    /**
     * WebViewClient that extracts the session token after EVERY page load.
     * This is the PRIMARY mechanism for token sharing now.
     */
    private class TokenExtractingWebViewClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Log.d("ForexYemeni", "Page loaded: " + url);
            // Extract token from localStorage after page loads
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    extractTokenFromWebView();
                }
            }, 3000); // Wait 3s for React to render and set localStorage
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (url.startsWith(APP_URL)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {}
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
