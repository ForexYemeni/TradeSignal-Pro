package com.forexyemeni.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.Gravity;

public class SplashActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen setup
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().setStatusBarColor(Color.parseColor("#070b14"));
        getWindow().setNavigationBarColor(Color.parseColor("#070b14"));

        // Create splash layout programmatically (no XML needed)
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.parseColor("#070b14"));
        layout.setGravity(Gravity.CENTER);

        // App icon (using built-in launcher icon)
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        icon.setLayoutParams(new LinearLayout.LayoutParams(
            (int)(120 * getResources().getDisplayMetrics().density),
            (int)(120 * getResources().getDisplayMetrics().density)
        ));
        layout.addView(icon);

        // Space
        View space = new View(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (int)(30 * getResources().getDisplayMetrics().density)
        ));
        layout.addView(space);

        // App name
        TextView title = new TextView(this);
        title.setText("ForexYemeni PRO");
        title.setTextColor(Color.parseColor("#eab308")); // gold
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        layout.addView(title);

        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("ForexYemeni Signals");
        subtitle.setTextColor(Color.parseColor("#94a3b8"));
        subtitle.setTextSize(14);
        subtitle.setGravity(Gravity.CENTER);
        layout.addView(subtitle);

        // Loading dots text
        TextView loading = new TextView(this);
        loading.setText("جاري التحميل...");
        loading.setTextColor(Color.parseColor("#64748b"));
        loading.setTextSize(12);
        loading.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams loadingParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        loadingParams.topMargin = (int)(40 * getResources().getDisplayMetrics().density);
        loading.setLayoutParams(loadingParams);
        layout.addView(loading);

        setContentView(layout);

        // Transition to MainActivity after 3 seconds
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                Intent intent = new Intent(SplashActivity.this, MainActivity.class);
                startActivity(intent);
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                finish();
            }
        }, 3000);
    }
}
