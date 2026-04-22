import { NextResponse } from "next/server";
import { getAdmin, setAdmin, addSignal, getPackages, addPackage, updateAppSettings } from "@/lib/store";

export async function POST(request?: Request) {
  try {
    // Check for force reset
    let forceReset = false;
    try {
      if (request) {
        const body = await request.json();
        forceReset = !!body.force;
      }
    } catch { /* no body */ }

    // Ensure admin exists
    let admin = await getAdmin();
    if (!admin) {
      admin = {
        id: crypto.randomUUID(),
        email: "admin@forexyemeni.com",
        passwordHash: "admin123",
        name: "مدير النظام",
        mustChangePwd: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setAdmin(admin);
    }

    const now = new Date();
    const testSignals = [
      {
        id: crypto.randomUUID(), pair: "XAUUSD", type: "BUY",
        entry: 2650.5, stopLoss: 2645.0,
        takeProfits: JSON.stringify([{ tp: 2660.0, rr: 1.73 }, { tp: 2671.1, rr: 3.75 }, { tp: 2684.41, rr: 6.17 }]),
        confidence: 4, status: "ACTIVE", signalCategory: "ENTRY",
        rawText: "🟢 إشارة شراء XAUUSD", timeframe: "15", htfTimeframe: "1س",
        htfTrend: "صاعد", smcTrend: "صاعد", hitTpIndex: -1,
        balance: 1000, lotSize: "0.02", riskTarget: 10, riskPercent: 1,
        actualRisk: 11, actualRiskPct: 1.1, slDistance: 5.5, maxRR: 6.17,
        instrument: "ذهب", createdAt: new Date(now.getTime() - 12 * 60000).toISOString(),
      },
      {
        id: crypto.randomUUID(), pair: "EURUSD", type: "SELL",
        entry: 1.085, stopLoss: 1.0875,
        takeProfits: JSON.stringify([{ tp: 1.082, rr: 1.2 }, { tp: 1.0795, rr: 2.2 }]),
        confidence: 3, status: "ACTIVE", signalCategory: "ENTRY",
        rawText: "🔴 إشارة بيع EURUSD", timeframe: "5", htfTimeframe: "30د",
        htfTrend: "هابط", smcTrend: "هابط", hitTpIndex: -1,
        balance: 2000, lotSize: "0.04", riskTarget: 20, riskPercent: 1,
        actualRisk: 20, actualRiskPct: 1, slDistance: 25, maxRR: 2.2,
        instrument: "عملات", createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
      },
      {
        id: crypto.randomUUID(), pair: "GBPUSD", type: "BUY",
        entry: 1.272, stopLoss: 1.269,
        takeProfits: JSON.stringify([{ tp: 1.275, rr: 1.0 }, { tp: 1.278, rr: 2.0 }, { tp: 1.282, rr: 3.33 }]),
        confidence: 5, status: "HIT_TP", signalCategory: "TP_HIT",
        rawText: "✅ تحقق الهدف 1 GBPUSD", timeframe: "15", htfTimeframe: "4س",
        htfTrend: "صاعد", smcTrend: "صاعد", hitTpIndex: 0,
        hitPrice: 1.275, pnlPoints: 30, pnlDollars: 30,
        balance: 1500, lotSize: "0.1", riskTarget: 15, riskPercent: 1,
        actualRisk: 15, actualRiskPct: 1, slDistance: 30, maxRR: 3.33,
        instrument: "عملات", partialClose: false,
        createdAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
      },
      {
        id: crypto.randomUUID(), pair: "XAUUSD", type: "SELL",
        entry: 2670.0, stopLoss: 2675.5,
        takeProfits: JSON.stringify([{ tp: 2660.0, rr: 1.82 }, { tp: 2652.0, rr: 3.27 }]),
        confidence: 3, status: "HIT_SL", signalCategory: "SL_HIT",
        rawText: "❌ ضرب الوقف XAUUSD", timeframe: "15", htfTimeframe: "1س",
        htfTrend: "هابط", smcTrend: "محايد", hitTpIndex: -1,
        hitPrice: 2675.5, pnlPoints: -55, pnlDollars: -11,
        balance: 1000, lotSize: "0.02", riskTarget: 10, riskPercent: 1,
        actualRisk: 11, actualRiskPct: 1.1, slDistance: 5.5, maxRR: 3.27,
        instrument: "ذهب", createdAt: new Date(now.getTime() - 5 * 3600000).toISOString(),
      },
    ];

    for (const signal of testSignals) {
      await addSignal(signal);
    }

    // Seed default packages with real features
    const existing = await getPackages();
    if (existing.length === 0 || forceReset) {
      const defaultPackages = [
        {
          id: crypto.randomUUID(),
          name: "تجربة مجانية",
          durationDays: 7,
          price: 0,
          type: "trial" as const,
          description: "جرّب الخدمة مجاناً لمدة 7 أيام واستمتع بتجربة فريدة",
          isActive: true,
          createdAt: now.toISOString(),
          order: 1,
          features: [
            "إشارات ذهب (XAUUSD) فقط",
            "حد أقصى 3 إشارات يومياً",
            "أهداف ربح واحدة لكل إشارة",
            "الوصول للإشارات بعد 5 دقائق من النشر",
            "تحليل فني أساسي",
          ],
          maxSignals: 3,
          prioritySupport: false,
          showEntryEarly: false,
          instruments: ["gold"],
        },
        {
          id: crypto.randomUUID(),
          name: "الباقة الأساسية",
          durationDays: 30,
          price: 25,
          type: "paid" as const,
          description: "باقة مثالية للمبتدئين مع تغطية الأزواج الرئيسية",
          isActive: true,
          createdAt: now.toISOString(),
          order: 2,
          features: [
            "جميع أزواج العملات الرئيسية",
            "إشارات ذهب (XAUUSD)",
            "حد أقصى 5 إشارات يومياً",
            "3 أهداف ربح لكل إشارة",
            "تحليل فني متوسط",
            "تحديثات وقف الخسارة",
            "إشعارات فورية",
          ],
          maxSignals: 5,
          prioritySupport: false,
          showEntryEarly: false,
          instruments: ["gold", "currencies"],
        },
        {
          id: crypto.randomUUID(),
          name: "الباقة الاحترافية",
          durationDays: 30,
          price: 50,
          type: "paid" as const,
          description: "للمتداولين المحترفين مع مميزات متقدمة وتغطية شاملة",
          isActive: true,
          createdAt: now.toISOString(),
          order: 3,
          features: [
            "جميع أزواج العملات الرئيسية والثانوية",
            "إشارات ذهب (XAUUSD)",
            "إشارات المؤشرات (Indices)",
            "حد أقصى 10 إشارات يومياً",
            "5 أهداف ربح لكل إشارة",
            "تحليل فني متقدم مع SMC",
            "تحديثات وقف الخسارة والتراجع",
            "دعم عبر Telegram",
            "تقارير أسبوعية للأداء",
          ],
          maxSignals: 10,
          prioritySupport: true,
          showEntryEarly: false,
          instruments: ["gold", "currencies", "indices"],
        },
        {
          id: crypto.randomUUID(),
          name: "الباقة الذهبية",
          durationDays: 90,
          price: 120,
          type: "paid" as const,
          description: "أفضل قيمة للمتداولين الجادين مع وصول كامل لجميع الخدمات",
          isActive: true,
          createdAt: now.toISOString(),
          order: 4,
          features: [
            "جميع الأزواج والمؤشرات والمعادن",
            "إشارات نفط خام (Crude Oil)",
            "إشارات العملات الرقمية (BTC, ETH)",
            "إشارات غير محدودة يومياً",
            "5+ أهداف ربح لكل إشارة",
            "تحليل فني شامل (SMC + ICT)",
            "تحديثات مباشرة لوقف الخسارة",
            "دعم أولوي عبر Telegram",
            "تقارير أداء يومية",
            "دخول مبكر للإشارات",
            "استشارات تداول شخصية",
          ],
          maxSignals: 0,
          prioritySupport: true,
          showEntryEarly: true,
          instruments: ["gold", "currencies", "indices", "oil", "crypto"],
        },
        {
          id: crypto.randomUUID(),
          name: "VIP Diamond",
          durationDays: 365,
          price: 299,
          type: "paid" as const,
          description: "الباقة الحصرية للأعضاء VIP مع جميع المميزات والامتيازات الخاصة",
          isActive: true,
          createdAt: now.toISOString(),
          order: 5,
          features: [
            "جميع الأزواج والمؤشرات والمعادن والعملات الرقمية",
            "إشارات حصرية VIP",
            "إشارات غير محدودة يومياً",
            "أهداف ربح متعددة غير محدودة",
            "تحليل فني متقدم (SMC + ICT + Wyckoff)",
            "تحديثات مباشرة لحظياً",
            "دعم أولوي 24/7 عبر Telegram و WhatsApp",
            "تقارير أداء يومية وأسبوعية",
            "دخول مبكر للإشارات (قبل النشر العام)",
            "استشارات تداول شخصية أسبوعية",
            "دخول لغرفة التحليل الحية",
            "محتوى تعليمي حصري",
            "توصيات إدارة المخاطر المخصصة",
            "أولوية في طلبات التحليل",
          ],
          maxSignals: 0,
          prioritySupport: true,
          showEntryEarly: true,
          instruments: ["gold", "currencies", "indices", "oil", "crypto", "metals"],
        },
      ];

      let trialPackageId: string | null = null;
      for (const pkg of defaultPackages) {
        await addPackage(pkg);
        if (pkg.type === "trial") {
          trialPackageId = pkg.id;
        }
      }

      // Set the trial package as default free trial
      if (trialPackageId) {
        await updateAppSettings({ freeTrialPackageId: trialPackageId, autoApproveOnRegister: true });
      }
    }

    return NextResponse.json({ success: true, message: `تم إنشاء ${testSignals.length} إشارة تجريبية`, count: testSignals.length });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء البيانات التجريبية" }, { status: 500 });
  }
}
