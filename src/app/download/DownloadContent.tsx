"use client";

export default function DownloadContent() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #070b14 0%, #0c1425 40%, #0f1a30 70%, #070b14 100%)",
        fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
        color: "#e2e8f0",
        direction: "rtl",
        overflowX: "hidden",
      }}
    >
      {/* Hero Section */}
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          padding: "40px 20px",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              width: "100px",
              height: "100px",
              margin: "0 auto 20px",
              borderRadius: "24px",
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(255, 215, 0, 0.3)",
              animation: "float 3s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: "48px" }}>&#x1F4C8;</span>
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "800",
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            ForexYemeni
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              marginTop: "6px",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            Trading Signals
          </p>
        </div>

        {/* Version Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            borderRadius: "20px",
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            marginBottom: "28px",
          }}
        >
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: "13px", color: "#60a5fa", fontWeight: "600" }}>الإصدار 3.3</span>
        </div>

        {/* App Title */}
        <h2
          style={{
            fontSize: "22px",
            fontWeight: "700",
            color: "#f1f5f9",
            marginBottom: "12px",
            lineHeight: 1.4,
          }}
        >
          إشارات تداول احترافية
          <br />
          <span style={{ color: "#FFD700" }}>للذهب والفوركس</span>
        </h2>

        <p
          style={{
            fontSize: "14px",
            color: "#94a3b8",
            lineHeight: 1.8,
            marginBottom: "36px",
            maxWidth: "340px",
            margin: "0 auto 36px",
          }}
        >
          تابع أفضل إشارات التداول من محللين محترفين
          <br />
          مع تنبيهات فورية وإدارة مخاطر متقدمة
        </p>

        {/* Features Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "40px",
          }}
        >
          {[
            { icon: "\u{1F4CA}", label: "إشارات فورية", color: "#3b82f6" },
            { icon: "\u{1F514}", label: "تنبيهات ذكية", color: "#22c55e" },
            { icon: "\u{1F4B0}", label: "إدارة مخاطر", color: "#f59e0b" },
            { icon: "\u{1F310}", label: "تحليل متقدم", color: "#8b5cf6" },
          ].map((feature, i) => (
            <div
              key={i}
              style={{
                padding: "16px 8px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "28px", display: "block", marginBottom: "6px" }}>{feature.icon}</span>
              <span style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: "600" }}>{feature.label}</span>
            </div>
          ))}
        </div>

        {/* Download Button */}
        <a
          href="/apk/ForexYemeni-v3.3.apk"
          download
          className="download-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            width: "100%",
            padding: "18px 24px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #FFD700, #FFA500)",
            color: "#070b14",
            fontSize: "18px",
            fontWeight: "800",
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(255, 215, 0, 0.35)",
            transition: "all 0.3s ease",
            cursor: "pointer",
            border: "none",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          تحميل التطبيق
        </a>

        {/* File Info */}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <span>APK — 4.9 MB</span>
          <span>&#x2022;</span>
          <span>Android 5.0+</span>
          <span>&#x2022;</span>
          <span>v3.3</span>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
            margin: "36px 0",
          }}
        />

        {/* What's New */}
        <div
          style={{
            textAlign: "right",
            marginBottom: "32px",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#f1f5f9",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            &#x2728; ما الجديد في الإصدار 3.3
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              "تنسيق احترافي لإشارات التليجرام مع تصاميم Unicode",
              "إصلاح تنبيهات تحقيق الأهداف (TP/SL) في التليجرام",
              "دعم ربط عدة بوتات تليجرام مع قنوات مختلفة",
              "قسم إدارة المخاطر المتقدم في الإشارات",
              "نافذة تأكيد قبل الحذف والتعديل والإيقاف",
              "تحسينات في الأداء والثبات",
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ color: "#22c55e", fontSize: "14px", marginTop: "2px", flexShrink: 0 }}>&#x2713;</span>
                <span style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Install Instructions */}
        <div
          style={{
            padding: "20px",
            borderRadius: "16px",
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.15)",
            marginBottom: "32px",
          }}
        >
          <h4
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "#60a5fa",
              marginBottom: "12px",
              textAlign: "center",
            }}
          >
            &#x1F4DD; طريقة التثبيت
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#94a3b8" }}>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: "#60a5fa", fontWeight: "700" }}>1.</span> اضغط على زر &quot;تحميل التطبيق&quot;
            </p>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: "#60a5fa", fontWeight: "700" }}>2.</span> انتظر اكتمال التحميل
            </p>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: "#60a5fa", fontWeight: "700" }}>3.</span> افتح ملف APK واضغط &quot;تثبيت&quot;
            </p>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: "#60a5fa", fontWeight: "700" }}>4.</span> إذا ظهر تحذير الأمان، اختر &quot;تثبيت من مصدر غير معروف&quot;
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            fontSize: "12px",
            color: "#475569",
            lineHeight: 1.8,
          }}
        >
          <p style={{ margin: 0 }}>
            &#x00A9; {new Date().getFullYear()} ForexYemeni Signals
          </p>
          <p style={{ margin: "4px 0 0" }}>
            جميع الحقوق محفوظة
          </p>
        </div>
      </div>

      {/* Global styles for animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .download-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(255, 215, 0, 0.5) !important;
        }
        .download-btn:active {
          transform: translateY(0px);
        }
      `}</style>
    </div>
  );
}
