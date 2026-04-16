import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseTradingViewSignal, validateSignal } from "@/lib/signal-parser";

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

    const signal = await db.signal.create({
      data: {
        pair: parseResult.signal.pair,
        type: parseResult.signal.type,
        entry: parseResult.signal.entry,
        stopLoss: parseResult.signal.stopLoss,
        takeProfits: JSON.stringify(parseResult.signal.takeProfits),
        confidence: parseResult.signal.confidence,
        status: parseResult.signal.signalCategory === "SL_HIT" ? "HIT_SL" :
                parseResult.signal.signalCategory === "TP_HIT" ? "HIT_TP" : "ACTIVE",
        signalCategory: parseResult.signal.signalCategory,
        rawText: parseResult.signal.rawText,
        timeframe: parseResult.signal.timeframe,
        htfTimeframe: parseResult.signal.htfTimeframe,
        htfTrend: parseResult.signal.htfTrend,
        smcTrend: parseResult.signal.smcTrend,
        hitTpIndex: parseResult.signal.hitTpIndex ?? -1,
        balance: parseResult.signal.riskData.balance,
        lotSize: parseResult.signal.riskData.lotSize,
        riskTarget: parseResult.signal.riskData.riskTarget,
        riskPercent: parseResult.signal.riskData.riskPercent,
        actualRisk: parseResult.signal.riskData.actualRisk,
        actualRiskPct: parseResult.signal.riskData.actualRiskPct,
        slDistance: parseResult.signal.riskData.slDistance,
        maxRR: parseResult.signal.riskData.maxRR,
        instrument: parseResult.signal.riskData.instrument,
      },
    });

    return NextResponse.json({
      success: true,
      signal: {
        ...signal,
        takeProfits: JSON.parse(signal.takeProfits),
      },
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error("Error processing signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في معالجة الإشارة" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (category) where.signalCategory = category;

    const signals = await db.signal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const formattedSignals = signals.map((s) => ({
      ...s,
      takeProfits: JSON.parse(s.takeProfits),
    }));

    return NextResponse.json({ success: true, signals: formattedSignals });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشارات" }, { status: 500 });
  }
}
