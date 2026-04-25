import { NextRequest, NextResponse } from "next/server";
import { parseTradingViewSignal } from "@/lib/signal-parser";

function getInstrumentCategory(pair: string): string {
  const p = (pair || "").toUpperCase();
  if (/XAU|GOLD/.test(p)) return "gold";
  if (/XAG|SILVER/.test(p)) return "metals";
  if (/USOIL|CRUDE|OIL|CL/.test(p)) return "oil";
  if (/USDT$/.test(p)) return "crypto";
  if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK/.test(p)) return "crypto";
  if (/NAS|US30|DAX|US500|SPX|NDX|UK100|GER40|JPN225/.test(p)) return "indices";
  if (/[A-Z]{3,6}(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)/.test(p)) return "currencies";
  return "other";
}

/**
 * POST /api/test-signal
 * Diagnostic endpoint — sends a test signal text through the parser
 * and returns the full parsed result without storing it.
 * Usage: POST { "text": "signal text here" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ success: false, error: "النص مطلوب" }, { status: 400 });
    }

    const result = parseTradingViewSignal(text);

    // Also determine instrument category
    const instrumentCategory = result.signal?.pair ? getInstrumentCategory(result.signal.pair) : "unknown";

    return NextResponse.json({
      success: true,
      parsed: result.success,
      signal: result.signal ? {
        pair: result.signal.pair,
        type: result.signal.type,
        entry: result.signal.entry,
        stopLoss: result.signal.stopLoss,
        takeProfits: result.signal.takeProfits,
        confidence: result.signal.confidence,
        timeframe: result.signal.timeframe,
        htfTimeframe: result.signal.htfTimeframe,
        htfTrend: result.signal.htfTrend,
        smcTrend: result.signal.smcTrend,
        signalCategory: result.signal.signalCategory,
        instrumentCategory,
        riskData: result.signal.riskData,
      } : null,
      warnings: result.warnings,
      error: result.error,
      rawTextPreview: text.substring(0, 200),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/test-signal
 * Returns a simple status check and available test examples.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "نقطة اختبار الإشارات — أرسل POST مع { text: 'نص الإشارة' }",
    examples: [
      {
        name: "إشارة ذهب شراء",
        text: "🟢 إشارة شراء 🚀\n\n📌 GOLD │ 1 │ 15د\n⭐ ⭐⭐\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 الدخول: 4705.71\n🔴 الوقف : 4712.71\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 إدارة المخاطر\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💵 الرصيد : $100\n🎯 خطر مستهدف : $1 (1%)\n📦 حجم اللوت : 0.01 لوت (1 مايكرو)\n💸 خسارة فعلية : $7 (7%)\n📏 مسافة الوقف : 7\n📊 R:R الأقصى : 1:4.32\n🏦 الأداة : الذهب (XAUUSD)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 TP1: 4700.21 │ R:R 0.79\n🎯 TP2: 4697.47 │ R:R 1.18\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📈 15د: هابط 🐻 │ SMC: صاعد\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      },
      {
        name: "إشارة بيتكوين بيع",
        text: "🔴 إشارة بيع 📉\n\n📌 BTCUSDT │ 1 │ 15د\n⭐ ⭐⭐\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 الدخول: 85000.00\n🔴 الوقف : 85500.00\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 إدارة المخاطر\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💵 الرصيد : $500\n🎯 خطر مستهدف : $5 (1%)\n📦 حجم اللوت : 0.05 لوت\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 TP1: 84500 │ R:R 0.50\n🎯 TP2: 84000 │ R:R 1.00\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Crypto",
      },
    ],
  });
}
