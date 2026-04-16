import { NextRequest, NextResponse } from "next/server";
import { addSignal, getSignals, getSignalById, updateSignal, deleteSignal } from "@/lib/store";
import { parseTradingViewSignal, validateSignal } from "@/lib/signal-parser";
import { notifyNewSignal, notifyTpHit, notifySlHit } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ success: false, error: "النص مطلوب" }, { status: 400 });
    }

    const parseResult = parseTradingViewSignal(text);
    if (!parseResult.success || !parseResult.signal) {
      return NextResponse.json(
        { success: false, error: parseResult.error || "فشل تحليل الإشارة", warnings: parseResult.warnings },
        { status: 400 }
      );
    }

    if (parseResult.signal.signalCategory === "ENTRY") {
      const validation = validateSignal(parseResult.signal);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: "بيانات غير صالحة", details: validation.errors }, { status: 400 });
      }
    }

    const signal = {
      id: crypto.randomUUID(),
      pair: parseResult.signal.pair,
      type: parseResult.signal.type,
      entry: parseResult.signal.entry,
      stopLoss: parseResult.signal.stopLoss,
      takeProfits: JSON.stringify(parseResult.signal.takeProfits),
      confidence: parseResult.signal.confidence,
      status: ["SL_HIT", "REENTRY_SL", "PYRAMID_SL"].includes(parseResult.signal.signalCategory) ? "HIT_SL" :
              ["TP_HIT", "REENTRY_TP", "PYRAMID_TP"].includes(parseResult.signal.signalCategory) ? "HIT_TP" : "ACTIVE",
      signalCategory: parseResult.signal.signalCategory,
      rawText: parseResult.signal.rawText,
      timeframe: parseResult.signal.timeframe,
      htfTimeframe: parseResult.signal.htfTimeframe,
      htfTrend: parseResult.signal.htfTrend,
      smcTrend: parseResult.signal.smcTrend,
      hitTpIndex: parseResult.signal.hitTpIndex ?? -1,
      hitPrice: parseResult.signal.hitPrice ?? 0,
      pnlPoints: parseResult.signal.pnlPoints ?? 0,
      pnlDollars: parseResult.signal.pnlDollar ?? 0,
      tpStatusList: parseResult.signal.tpStatusList ?? "",
      totalTPs: parseResult.signal.totalTPs,
      partialWin: parseResult.signal.partialWin ?? false,
      balance: parseResult.signal.riskData.balance,
      lotSize: parseResult.signal.riskData.lotSize,
      riskTarget: parseResult.signal.riskData.riskTarget,
      riskPercent: parseResult.signal.riskData.riskPercent,
      actualRisk: parseResult.signal.riskData.actualRisk,
      actualRiskPct: parseResult.signal.riskData.actualRiskPct,
      slDistance: parseResult.signal.riskData.slDistance,
      maxRR: parseResult.signal.riskData.maxRR,
      instrument: parseResult.signal.riskData.instrument,
      createdAt: new Date().toISOString(),
    };

    await addSignal(signal);

    // ── Send Push Notification for new signals ──
    // Don't await - send in background
    if (isEntry(parseResult.signal.signalCategory)) {
      notifyNewSignal(
        parseResult.signal.pair,
        parseResult.signal.type,
        parseResult.signal.entry,
        parseResult.signal.timeframe
      ).catch(() => {});
    } else if (parseResult.signal.signalCategory === "TP_HIT" || parseResult.signal.signalCategory === "REENTRY_TP" || parseResult.signal.signalCategory === "PYRAMID_TP") {
      notifyTpHit(
        parseResult.signal.pair,
        parseResult.signal.hitTpIndex ?? 0
      ).catch(() => {});
    } else if (parseResult.signal.signalCategory === "SL_HIT" || parseResult.signal.signalCategory === "REENTRY_SL" || parseResult.signal.signalCategory === "PYRAMID_SL") {
      notifySlHit(parseResult.signal.pair).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      signal: { ...signal, takeProfits: JSON.parse(signal.takeProfits) },
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error("Error processing signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في معالجة الإشارة" }, { status: 500 });
  }
}

function isEntry(cat: string) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const signals = await getSignals(limit);
    return NextResponse.json({
      success: true,
      signals: signals.map(s => ({ ...s, takeProfits: JSON.parse(s.takeProfits) })),
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشارات" }, { status: 500 });
  }
}
