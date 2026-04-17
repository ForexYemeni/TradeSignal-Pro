import { NextRequest, NextResponse } from "next/server";
import { addSignal, getSignals, updateSignal } from "@/lib/store";
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

    const cat = parseResult.signal.signalCategory;

    // ═══════════════════════════════════════════════════════════════
    //  TP/SL/REENTRY/PYRAMID updates → find parent & update in-place
    // ═══════════════════════════════════════════════════════════════
    if (!isEntry(cat)) {
      const updated = await handleUpdateSignal(parseResult.signal);
      if (updated) {
        // Send push notification for the update
        if (cat === "TP_HIT" || cat === "REENTRY_TP" || cat === "PYRAMID_TP") {
          notifyTpHit(parseResult.signal.pair, parseResult.signal.hitTpIndex ?? 0, undefined, cat).catch(() => {});
        } else if (cat === "SL_HIT" || cat === "REENTRY_SL" || cat === "PYRAMID_SL") {
          notifySlHit(parseResult.signal.pair).catch(() => {});
        }
        return NextResponse.json({ success: true, signal: updated, updated: true, warnings: parseResult.warnings });
      }
      // Fallback: if no parent found, create as new signal (backward compat)
    }

    if (cat === "ENTRY") {
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
      status: isSlLike(cat) ? "HIT_SL" : isTpLike(cat) ? "HIT_TP" : "ACTIVE",
      signalCategory: cat,
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

    // Push notification for new entries
    if (isEntry(cat)) {
      notifyNewSignal(parseResult.signal.pair, parseResult.signal.type, parseResult.signal.entry, parseResult.signal.timeframe).catch(() => {});
    }

    return NextResponse.json({ success: true, signal: { ...signal, takeProfits: JSON.parse(signal.takeProfits) }, warnings: parseResult.warnings });
  } catch (error) {
    console.error("Error processing signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في معالجة الإشارة" }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════
   Find parent signal & update in-place instead of creating new
   ═══════════════════════════════════════════════════════════════ */
async function handleUpdateSignal(parsed: any) {
  const pair = String(parsed.pair || "").toUpperCase();
  if (!pair) return null;

  const allSignals = await getSignals(9999);

  // Map update category → parent category to search
  let parentCat: string;
  if (parsed.signalCategory === "TP_HIT" || parsed.signalCategory === "SL_HIT") parentCat = "ENTRY";
  else if (parsed.signalCategory === "REENTRY_TP" || parsed.signalCategory === "REENTRY_SL") parentCat = "REENTRY";
  else if (parsed.signalCategory === "PYRAMID_TP" || parsed.signalCategory === "PYRAMID_SL") parentCat = "PYRAMID";
  else return null;

  // Find the most recent active signal matching pair + parent category
  const parent = allSignals
    .filter(s => {
      const sPair = String(s.pair || "").toUpperCase();
      return sPair === pair && s.signalCategory === parentCat && s.status === "ACTIVE";
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!parent) return null;

  const updateData: Record<string, unknown> = {};

  // Calculate P&L
  const entry = Number(parent.entry) || 0;
  const stopLoss = Number(parent.stopLoss) || 0;
  const slDist = Number(parent.slDistance) || Math.abs(entry - stopLoss);
  const lotSize = parent.lotSize ? parseFloat(String(parent.lotSize)) : 0;
  const balance = Number(parent.balance) || 0;
  const tps: { tp: number; rr: number }[] = JSON.parse(String(parent.takeProfits || "[]"));

  // Pip value
  let pipVal = 10;
  if (pair.includes("XAU") || pair.includes("GOLD")) pipVal = 1;
  else if (pair.includes("XAG") || pair.includes("SILVER")) pipVal = 50;
  else if (pair.includes("BTC") || pair.includes("ETH")) pipVal = 1;
  else if (pair.includes("JPY")) pipVal = 6.5;

  if (parsed.signalCategory === "TP_HIT" || parsed.signalCategory === "REENTRY_TP" || parsed.signalCategory === "PYRAMID_TP") {
    const tpNum = parsed.hitTpIndex ?? 0; // 1-indexed from parser
    const tpArrayIdx = tpNum > 0 ? tpNum - 1 : -1;

    updateData.status = "HIT_TP";
    updateData.hitTpIndex = tpNum;
    updateData.signalCategory = parentCat === "REENTRY" ? "REENTRY_TP" : parentCat === "PYRAMID" ? "PYRAMID_TP" : "TP_HIT";

    if (tpArrayIdx >= 0 && tps[tpArrayIdx]) {
      const tpPrice = tps[tpArrayIdx].tp;
      const points = Math.abs(tpPrice - entry);
      let dollars = 0;
      if (lotSize > 0) dollars = points * pipVal * lotSize;
      else if (balance > 0 && slDist > 0) dollars = (points / slDist) * (balance * 0.02) * tps[tpArrayIdx].rr;

      updateData.hitPrice = parsed.hitPrice || tpPrice;
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(points.toFixed(1));
      updateData.pnlDollars = parsed.pnlDollar || parseFloat(dollars.toFixed(2));
    } else {
      updateData.hitPrice = parsed.hitPrice || 0;
      updateData.pnlPoints = parsed.pnlPoints || 0;
      updateData.pnlDollars = parsed.pnlDollar || 0;
    }

    updateData.totalTPs = parsed.totalTPs || tps.length;
    updateData.tpStatusList = parsed.tpStatusList || "";
    updateData.partialWin = parsed.partialWin || false;

    // If full close (all TPs hit), keep status HIT_TP but signal is done
    const isFullClose = /إغلاق كامل بالربح/.test(String(parsed.rawText || ""));
    if (isFullClose) {
      updateData.hitTpIndex = parsed.totalTPs || tps.length;
    }
  }

  if (parsed.signalCategory === "SL_HIT" || parsed.signalCategory === "REENTRY_SL" || parsed.signalCategory === "PYRAMID_SL") {
    const points = slDist;
    let dollars = 0;
    if (lotSize > 0) dollars = points * pipVal * lotSize;
    else if (balance > 0) dollars = balance * 0.02;

    updateData.status = "HIT_SL";
    updateData.signalCategory = parentCat === "REENTRY" ? "REENTRY_SL" : parentCat === "PYRAMID" ? "PYRAMID_SL" : "SL_HIT";
    updateData.hitPrice = parsed.hitPrice || stopLoss;
    updateData.pnlPoints = parsed.pnlPoints || parseFloat(points.toFixed(1));
    updateData.pnlDollars = parsed.pnlDollar || parseFloat((-dollars).toFixed(2));
    updateData.totalTPs = parsed.totalTPs;
    updateData.tpStatusList = parsed.tpStatusList || "";
    updateData.partialWin = parsed.partialWin || false;
  }

  const updated = await updateSignal(parent.id, updateData);
  if (!updated) return null;

  return { ...updated, takeProfits: JSON.parse(updated.takeProfits) };
}

function isEntry(cat: string) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}
function isTpLike(cat: string) {
  return cat === "TP_HIT" || cat === "REENTRY_TP" || cat === "PYRAMID_TP";
}
function isSlLike(cat: string) {
  return cat === "SL_HIT" || cat === "REENTRY_SL" || cat === "PYRAMID_SL";
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
