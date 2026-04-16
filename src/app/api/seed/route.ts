import { NextResponse } from "next/server";
import { getAdmin, setAdmin, addSignal, getSignals } from "@/lib/store";

export async function POST() {
  try {
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

    return NextResponse.json({ success: true, message: `تم إنشاء ${testSignals.length} إشارة تجريبية`, count: testSignals.length });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء البيانات التجريبية" }, { status: 500 });
  }
}
