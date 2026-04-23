import { NextResponse } from "next/server";
import { getAdmin, setAdmin, addSignal, getPackages, addPackage, updateAppSettings } from "@/lib/store";

export async function POST(request?: Request) {
  try {
    // Protect against production data wipe
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: "Seed endpoint is disabled in production" }, { status: 403 });
    }

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
        passwordHash: "$2b$12$6uk84yxl7XWMW5XDNpUfseP5RyihrD3hV1qut6MgPWHHnJdhS6aqC",
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
          description: "جرّب الخدمة مجاناً لمدة 7 أيام — إشارات الذهب فقط",
          isActive: true,
          createdAt: now.toISOString(),
          order: 1,
          features: [
            "إشارات الذهب (XAUUSD) فقط",
            "جميع الأهداف والربح والوقف كما هي من المؤشر",
            "إشعارات فورية بدون أي تأخير",
            "تحديثات وقف الخسارة والتراجع والتعويض",
            "تحليل فني مع اتجاه الإطار الزمني الأعلى",
          ],
          maxSignals: 0,
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
          description: "ذهب + أزواج العملات — تغطية شاملة للمبتدئين",
          isActive: true,
          createdAt: now.toISOString(),
          order: 2,
          features: [
            "إشارات الذهب (XAUUSD) + جميع أزواج العملات",
            "جميع الأهداف والربح والوقف كما هي من المؤشر",
            "إشعارات فورية بدون أي تأخير",
            "تحديثات وقف الخسارة والتراجع والتعويض",
            "إعادة الدخول (Reentry) والتعزيز (Pyramid)",
            "تحليل فني مع SMC واتجاه الإطار الأعلى",
          ],
          maxSignals: 0,
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
          description: "ذهب + عملات + مؤشرات — للمتداولين المحترفين",
          isActive: true,
          createdAt: now.toISOString(),
          order: 3,
          features: [
            "إشارات الذهب + العملات + المؤشرات (US30, NAS100)",
            "جميع الأهداف والربح والوقف كما هي من المؤشر",
            "إشعارات فورية بدون أي تأخير",
            "تحديثات مباشرة: وقف، تراجع، تعويض، تعزيز",
            "إعادة الدخول (Reentry) والتعزيز (Pyramid)",
            "تحليل متقدم (SMC + اتجاه الإطار الأعلى)",
            "دعم عبر Telegram",
          ],
          maxSignals: 0,
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
          description: "تغطية كاملة — ذهب + عملات + مؤشرات + نفط + كريبتو",
          isActive: true,
          createdAt: now.toISOString(),
          order: 4,
          features: [
            "جميع الأدوات: ذهب، عملات، مؤشرات، نفط، كريبتو",
            "جميع الأهداف والربح والوقف كما هي من المؤشر",
            "إشعارات فورية بدون أي تأخير",
            "تحديثات مباشرة لحظياً لكل التغييرات",
            "إعادة الدخول (Reentry) والتعزيز (Pyramid)",
            "تحليل شامل (SMC + ICT)",
            "دعم أولوي عبر Telegram",
            "تقارير أداء أسبوعية",
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
          description: "الباقة الحصرية — جميع الأدوات + مميزات VIP حصرية",
          isActive: true,
          createdAt: now.toISOString(),
          order: 5,
          features: [
            "جميع الأدوات: ذهب، فضة، عملات، مؤشرات، نفط، كريبتو",
            "جميع الأهداف والربح والوقف كما هي من المؤشر",
            "إشعارات فورية بدون أي تأخير",
            "تحديثات مباشرة لحظياً لكل التغييرات",
            "إعادة الدخول (Reentry) والتعزيز (Pyramid)",
            "تحليل متقدم (SMC + ICT + Wyckoff)",
            "دعم أولوي 24/7 عبر Telegram و WhatsApp",
            "تقارير أداء يومية وأسبوعية",
            "دخول مبكر للإشارات",
            "استشارات تداول شخصية أسبوعية",
            "دخول لغرفة التحليل الحية",
            "محتوى تعليمي حصري",
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
