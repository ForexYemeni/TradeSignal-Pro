import { NextResponse } from "next/server";

/**
 * Test Notification API
 * POST /api/test-notification
 * Used by admin to trigger a test signal for verifying notifications work
 * Creates a temporary test signal that will be picked up by the app's polling
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type = "buy" } = body || {};

    // Create a test signal entry via the signals API
    const testTexts: Record<string, string> = {
      buy: "🟢 BUY EURUSD\nEntry: 1.0850\nSL: 1.0820\nTP1: 1.0880 (1:1)\nTP2: 1.0910 (2:1)\nTP3: 1.0950 (3:1)\nConfidence: ⭐⭐⭐⭐\nTimeframe: H1\nHTF: D1 | صاعد\nSMC: صاعد\nBalance: $1000\nRisk: $20 (2%)\nLot: 0.20\n--- TEST SIGNAL ---",
      sell: "🔴 SELL GBPUSD\nEntry: 1.2650\nSL: 1.2680\nTP1: 1.2620 (1:1)\nTP2: 1.2590 (2:1)\nConfidence: ⭐⭐⭐⭐\nTimeframe: M15\n--- TEST SIGNAL ---",
      tp: "🟢 EURUSD TP1 HIT ✅\nEntry: 1.0850\nHit TP1: 1.0880\nPnL: +$60 (30 points)\n--- TEST SIGNAL ---",
      sl: "🔴 EURUSD SL HIT ❌\nEntry: 1.0850\nHit SL: 1.0820\nPnL: -$60 (30 points)\n--- TEST SIGNAL ---",
    };

    const text = testTexts[type] || testTexts.buy;

    // Forward to signals API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://trade-signal-pro.vercel.app";
    const signalRes = await fetch(`${baseUrl}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const signalData = await signalRes.json();

    return NextResponse.json({
      success: true,
      message: "تم إرسال إشارة اختبار",
      signalId: signalData.signal?.id,
      type,
    });
  } catch (error) {
    console.error("Test notification error:", error);
    return NextResponse.json({ success: false, error: "فشل إرسال إشارة الاختبار" }, { status: 500 });
  }
}
