package com.forexyemeni.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.http.SslError;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * ForexYemeni VIP Trading Signals - Android App v3.2
 *
 * v3.2 CHANGES:
 * - Added file chooser support (onShowFileChooser) so users can upload
 *   payment proof images from gallery or camera inside the WebView.
 * - Enabled file access and content access for file uploads to work.
 *
 * v3.0 CHANGES:
 * - Token is now read DIRECTLY from WebView localStorage.
 * - onPageFinished reads localStorage('adminSession') and extracts the user ID.
 * - Also repeats this check every 15 seconds via Handler.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://trade-signal-pro.vercel.app";
    private static final int NOTIFICATION_PERMISSION_CODE = 100;
    private static final int FILECHOOSER_RESULTCODE = 1;
    private static final int CAMERA_REQUEST_CODE = 2;
    private static final int STORAGE_PERMISSION_CODE = 200;
    private Handler tokenCheckHandler;
    private Runnable tokenCheckRunnable;

    // File chooser callbacks
    private ValueCallback<Uri[]> mFilePathCallback;
    private ValueCallback<Uri> mUploadMessage;
    private String mCameraPhotoPath;

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

            // 3. Request storage permissions for file picker
            requestStoragePermission();

            // 4. Start signal service
            startSignalService();

            // 5. Setup WebView with token extraction + file chooser
            webView = new WebView(this);
            configureWebView(webView);
            webView.addJavascriptInterface(new NativeBridge(this), "AndroidNotify");
            webView.setWebViewClient(new TokenExtractingWebViewClient());
            webView.setWebChromeClient(new FileChooserWebChromeClient());

            setContentView(webView);

            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }

            // 6. Start periodic token extraction (every 15 seconds)
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

            // 7. Request battery whitelist after 8 seconds
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
        // IMPORTANT: Must be true for file upload to work in WebView
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " ForexYemeni/App/3.2");
        wv.setBackgroundColor(Color.parseColor("#070b14"));
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    /**
     * WebChromeClient with full file chooser support.
     * Opens a chooser dialog with options: Gallery, Camera, Files.
     */
    private class FileChooserWebChromeClient extends WebChromeClient {

        @Override
        public boolean onConsoleMessage(ConsoleMessage cm) {
            Log.d("WebView", cm.message());
            return true;
        }

        // For Android 5.0+ (API 21+)
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                         WebChromeClient.FileChooserParams fileChooserParams) {
            // Cancel any pending file chooser
            if (mFilePathCallback != null) {
                mFilePathCallback.onReceiveValue(null);
            }
            mFilePathCallback = filePathCallback;

            // Check accept types from the web page
            String[] acceptTypes = fileChooserParams.getAcceptTypes();
            boolean acceptImages = false;
            if (acceptTypes != null) {
                for (String type : acceptTypes) {
                    if (type != null && (type.startsWith("image/") || type.equals("image/*"))) {
                        acceptImages = true;
                        break;
                    }
                }
            }

            // Show picker dialog
            showImagePickerDialog(acceptImages);
            return true;
        }

        // For Android 4.1-4.4 (legacy, kept as fallback)
        public void openFileChooser(ValueCallback<Uri> uploadMsg, String acceptType, String capture) {
            if (mUploadMessage != null) {
                mUploadMessage.onReceiveValue(null);
            }
            mUploadMessage = uploadMsg;
            showImagePickerDialog(true);
        }

        public void openFileChooser(ValueCallback<Uri> uploadMsg) {
            openFileChooser(uploadMsg, "", "");
        }

        public void openFileChooser(ValueCallback<Uri> uploadMsg, String acceptType) {
            openFileChooser(uploadMsg, acceptType, "");
        }
    }

    /**
     * Shows a dialog with options to pick from Gallery, Camera, or File Manager.
     */
    private void showImagePickerDialog(boolean acceptImages) {
        try {
            Intent galleryIntent = new Intent(Intent.ACTION_PICK,
                    android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            galleryIntent.setType("image/*");

            // Camera intent
            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cameraIntent.resolveActivity(getPackageManager()) != null) {
                File photoFile = createImageFile();
                if (photoFile != null) {
                    mCameraPhotoPath = photoFile.getAbsolutePath();
                    cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, Uri.fromFile(photoFile));
                } else {
                    mCameraPhotoPath = null;
                }
            }

            // File manager intent (for any file type)
            Intent fileIntent = new Intent(Intent.ACTION_GET_CONTENT);
            fileIntent.setType("*/*");
            fileIntent.addCategory(Intent.CATEGORY_OPENABLE);

            // Create chooser with gallery + camera
            Intent chooserIntent = Intent.createChooser(galleryIntent, "اختر صورة إثبات الدفع");

            // Add camera option as extra
            if (mCameraPhotoPath != null) {
                Intent[] extraIntents = { cameraIntent };
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents);
            }

            try {
                startActivityForResult(chooserIntent, FILECHOOSER_RESULTCODE);
            } catch (Exception e) {
                // Fallback: if chooser fails, try file manager directly
                Log.w("ForexYemeni", "Chooser failed, trying file manager fallback", e);
                try {
                    startActivityForResult(fileIntent, FILECHOOSER_RESULTCODE);
                } catch (Exception e2) {
                    Log.e("ForexYemeni", "File picker failed", e2);
                    if (mFilePathCallback != null) {
                        mFilePathCallback.onReceiveValue(null);
                        mFilePathCallback = null;
                    }
                }
            }
        } catch (Exception e) {
            Log.e("ForexYemeni", "showImagePickerDialog error", e);
            if (mFilePathCallback != null) {
                mFilePathCallback.onReceiveValue(null);
                mFilePathCallback = null;
            }
        }
    }

    /**
     * Creates a temporary file for the camera to save the photo.
     */
    private File createImageFile() {
        try {
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            String imageFileName = "JPEG_" + timeStamp + "_";
            File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (storageDir != null) {
                File image = File.createTempFile(imageFileName, ".jpg", storageDir);
                return image;
            }
        } catch (IOException e) {
            Log.e("ForexYemeni", "createImageFile error", e);
        }
        return null;
    }

    /**
     * Handles the result from gallery/camera/file picker.
     */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != FILECHOOSER_RESULTCODE) {
            // Handle camera result separately if needed
            if (requestCode == CAMERA_REQUEST_CODE && resultCode == RESULT_OK) {
                if (mFilePathCallback != null && mCameraPhotoPath != null) {
                    File cameraFile = new File(mCameraPhotoPath);
                    if (cameraFile.exists()) {
                        // Compress and return
                        Uri compressedUri = compressImage(cameraFile);
                        mFilePathCallback.onReceiveValue(new Uri[]{compressedUri});
                    } else {
                        mFilePathCallback.onReceiveValue(new Uri[]{Uri.fromFile(cameraFile)});
                    }
                    mFilePathCallback = null;
                    mCameraPhotoPath = null;
                } else if (mUploadMessage != null && mCameraPhotoPath != null) {
                    mUploadMessage.onReceiveValue(Uri.fromFile(new File(mCameraPhotoPath)));
                    mUploadMessage = null;
                    mCameraPhotoPath = null;
                }
            }
            return;
        }

        if (resultCode != RESULT_OK) {
            // User cancelled or error
            if (mFilePathCallback != null) {
                mFilePathCallback.onReceiveValue(null);
                mFilePathCallback = null;
            }
            if (mUploadMessage != null) {
                mUploadMessage.onReceiveValue(null);
                mUploadMessage = null;
            }
            return;
        }

        Uri[] results = null;

        if (data == null || data.getData() == null) {
            // Check if camera photo was taken
            if (mCameraPhotoPath != null) {
                File cameraFile = new File(mCameraPhotoPath);
                if (cameraFile.exists()) {
                    results = new Uri[]{Uri.fromFile(cameraFile)};
                }
            }
        } else {
            String dataString = data.getDataString();
            if (dataString != null) {
                results = new Uri[]{Uri.parse(dataString)};
            }
        }

        // Handle API 21+ callback
        if (mFilePathCallback != null) {
            if (results != null) {
                // Compress large images to prevent OOM
                Uri finalUri = compressImageUri(results[0]);
                mFilePathCallback.onReceiveValue(new Uri[]{finalUri});
            } else {
                mFilePathCallback.onReceiveValue(null);
            }
            mFilePathCallback = null;
        }

        // Handle legacy callback
        if (mUploadMessage != null) {
            if (results != null) {
                mUploadMessage.onReceiveValue(results[0]);
            } else {
                mUploadMessage.onReceiveValue(null);
            }
            mUploadMessage = null;
        }

        mCameraPhotoPath = null;
    }

    /**
     * Compresses an image from a Uri to reduce file size.
     * Prevents OutOfMemoryError on large photos.
     */
    private Uri compressImageUri(Uri uri) {
        try {
            ContentResolver cr = getContentResolver();
            InputStream inputStream = cr.openInputStream(uri);
            if (inputStream == null) return uri;

            // Decode with sample size
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(inputStream, null, options);
            inputStream.close();

            // Calculate sample size (max 1024px on longest side)
            int reqSize = 1024;
            int width = options.outWidth;
            int height = options.outHeight;
            int sampleSize = 1;

            if (height > reqSize || width > reqSize) {
                int halfHeight = height / 2;
                int halfWidth = width / 2;
                while ((halfHeight / sampleSize) >= reqSize
                        && (halfWidth / sampleSize) >= reqSize) {
                    sampleSize *= 2;
                }
            }

            options.inJustDecodeBounds = false;
            options.inSampleSize = sampleSize;

            inputStream = cr.openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(inputStream, null, options);
            inputStream.close();

            if (bitmap == null) return uri;

            // Save compressed image to cache
            File cacheDir = getExternalCacheDir();
            if (cacheDir == null) cacheDir = getCacheDir();
            File outFile = new File(cacheDir, "upload_" + System.currentTimeMillis() + ".jpg");
            FileOutputStream out = new FileOutputStream(outFile);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out);
            out.flush();
            out.close();
            bitmap.recycle();

            Log.d("ForexYemeni", "Image compressed: " + outFile.length() / 1024 + "KB");
            return Uri.fromFile(outFile);
        } catch (Exception e) {
            Log.e("ForexYemeni", "compressImageUri error", e);
            return uri;
        }
    }

    /**
     * Compresses a File (for camera photos).
     */
    private Uri compressImage(File file) {
        Uri uri = Uri.fromFile(file);
        return compressImageUri(uri);
    }

    private void requestStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+: Request READ_MEDIA_IMAGES
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO
                }, STORAGE_PERMISSION_CODE);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Android 6-12: Request READ_EXTERNAL_STORAGE
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                }, STORAGE_PERMISSION_CODE);
            }
        }
    }

    /**
     * CRITICAL FIX: Read the session token DIRECTLY from WebView's localStorage.
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
                                String token = value.replace("\"", "").trim();
                                if (token.length() > 10 && !token.startsWith("null")) {
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
        } else if (requestCode == STORAGE_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] != PackageManager.PERMISSION_GRANTED) {
                Log.w("ForexYemeni", "Storage permission denied - file upload may not work");
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
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                extractTokenFromWebView();
            }
        }, 2000);
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

    private class TokenExtractingWebViewClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Log.d("ForexYemeni", "Page loaded: " + url);
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    extractTokenFromWebView();
                }
            }, 3000);
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
            handler.cancel();
            Log.e("ForexYemeni", "SSL Error: " + error.getPrimaryError());
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.e("ForexYemeni", "WebView error: " + errorCode + " " + description);
        }
    }
}
