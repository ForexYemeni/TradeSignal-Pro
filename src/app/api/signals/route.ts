import { NextRequest, NextResponse } from "next/server";
import { addSignal, getSignals, updateSignal, getUserById } from "@/lib/store";
import { parseTradingViewSignal, validateSignal } from "@/lib/signal-parser";
import { notifyNewSignal, notifyTpHit, notifySlHit } from "@/lib/push";
import { notifySignalEvent } from "./stream/route";

// ─── Auth Guard ───────────────────────────────────────
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

/**
 * Validates request auth: accepts either a session cookie (fy_session), a valid user token
 * (Authorization: Bearer <userId>), or a webhook secret (X-Webhook-Secret header).
 * Returns true if authorized, false otherwise.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  // 1. Check session cookie (set on login, sent automatically by browser)
  const sessionCookie = request.cookies.get('fy_session')?.value;
  if (sessionCookie) {
    const user = await getUserById(sessionCookie);
    if (user) return true;
  }

  // 2. Check webhook secret (for Google Apps Script)
  const webhookHeader = request.headers.get("x-webhook-secret");
  if (WEBHOOK_SECRET && webhookHeader === WEBHOOK_SECRET) return true;

  // 3. Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // If token matches webhook secret, allow
  if (WEBHOOK_SECRET && token === WEBHOOK_SECRET) return true;

  // If token matches a valid user/admin ID, allow
  if (token) {
    const user = await getUserById(token);
    if (user) return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check for signal creation/update
    const authed = await isAuthorized(request);
    if (!authed) {
      return NextResponse.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

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
    //  TP/SL/REENTRY/PYRAMID/BREAKEVEN updates → find parent & update in-place
    // ═══════════════════════════════════════════════════════════════
    if (!isEntry(cat)) {
      const updated = await handleUpdateSignal(parseResult.signal);
      if (updated) {
        // Send push notification for the update
        if (cat === "TP_HIT" || cat === "REENTRY_TP" || cat === "PYRAMID_TP") {
          notifyTpHit(parseResult.signal.pair, parseResult.signal.hitTpIndex ?? 0, undefined, cat).catch(() => {});
        } else if (cat === "BREAKEVEN") {
          // BE is informational — SL was moved to entry, no P&L change
          notifySignalEvent({ type: "breakeven", pair: parseResult.signal.pair, signalType: cat, timestamp: Date.now() });
        } else if (cat === "SL_HIT" || cat === "REENTRY_SL" || cat === "PYRAMID_SL") {
          // If it was a partial win (TPs hit before SL), send TP notification instead
          if (updated.partialWin && updated.status === "HIT_TP") {
            notifyTpHit(parseResult.signal.pair, updated.hitTpIndex ?? 0, undefined, cat).catch(() => {});
          } else {
            notifySlHit(parseResult.signal.pair).catch(() => {});
          }
        }
        return NextResponse.json({ success: true, signal: updated, updated: true, warnings: parseResult.warnings });
      }
      // No parent found — reject orphan TP/SL update to avoid creating stray signals
      return NextResponse.json({ success: false, error: "لم يتم العثور على الإشارة الأصلية لتحديثها", details: parseResult.warnings }, { status: 404 });
    }

    // ── Deduplication: skip if same signal already exists ──
    if (isEntry(cat)) {
      const validation = validateSignal(parseResult.signal);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: "بيانات غير صالحة", details: validation.errors }, { status: 400 });
      }

      const existing = await getSignals(50);
      const rawText = parseResult.signal.rawText.trim();
      const isDuplicate = existing.some(s => {
        if (s.rawText.trim() === rawText) return true;
        // Only deduplicate against ACTIVE signals with same pair + category
        // Closed signals (HIT_TP, HIT_SL, MANUAL_CLOSE) should NOT block new entries
        if (s.status === "ACTIVE" && String(s.pair).toUpperCase() === String(parseResult.signal.pair).toUpperCase() && s.signalCategory === cat) {
          return true;
        }
        return false;
      });
      if (isDuplicate) {
        return NextResponse.json({ success: true, duplicate: true, message: "إشارة مكررة - تم التجاهل", warnings: parseResult.warnings });
      }
    }

    // Non-entry deduplication: skip if same update already applied
    if (!isEntry(cat)) {
      const recent = await getSignals(20);
      const isDup = recent.some(s => {
        if (String(s.pair).toUpperCase() !== String(parseResult.signal.pair || "").toUpperCase()) return false;
        if (s.rawText.trim() === (parseResult.signal.rawText || "").trim()) return true;
        return false;
      });
      if (isDup) {
        return NextResponse.json({ success: true, duplicate: true, message: "تحديث مكرر - تم التجاهل", warnings: parseResult.warnings });
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
      pnlDollars: (typeof parseResult.signal.pnlDollar === "number" && isFinite(parseResult.signal.pnlDollar) && Math.abs(parseResult.signal.pnlDollar) < 50000)
        ? parseFloat(Math.min(Math.max(parseResult.signal.pnlDollar, -50000), 50000).toFixed(2)) : 0,
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

    // Notify SSE subscribers about new signal
    notifySignalEvent({ type: "signal", pair: parseResult.signal.pair, signalType: cat, timestamp: Date.now() });

    // Push notification for new entries
    if (isEntry(cat)) {
      notifyNewSignal(parseResult.signal.pair, parseResult.signal.type, parseResult.signal.entry, parseResult.signal.timeframe).catch(() => {});
    }

    return NextResponse.json({ success: true, signal: { ...signal, takeProfits: (() => { try { return JSON.parse(signal.takeProfits); } catch { return []; } })() }, warnings: parseResult.warnings });
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
  if (parsed.signalCategory === "TP_HIT" || parsed.signalCategory === "SL_HIT" || parsed.signalCategory === "BREAKEVEN") parentCat = "ENTRY";
  else if (parsed.signalCategory === "REENTRY_TP" || parsed.signalCategory === "REENTRY_SL") parentCat = "REENTRY";
  else if (parsed.signalCategory === "PYRAMID_TP" || parsed.signalCategory === "PYRAMID_SL") parentCat = "PYRAMID";
  else return null;

  // Pair alias mapping — GOLD/XAUUSD/XAUUSDUSD, SILVER/XAGUSD, BTC/BTCUSDT, etc.
  function normalizePair(p: string): string {
    const aliases: Record<string, string> = {
      "GOLD": "XAUUSD", "XAUUSDUSD": "XAUUSD", "XAU": "XAUUSD",
      "SILVER": "XAGUSD", "XAG": "XAGUSD",
      "BTCUSDT": "BTCUSD", "BTCUSD": "BTCUSDT",
      "ETHUSDT": "ETHUSD", "ETHUSD": "ETHUSDT",
    };
    return aliases[p] || p;
  }
  const normalizedPair = normalizePair(pair);

  // Find the most recent active signal matching pair + parent category
  const parent = allSignals
    .filter(s => {
      const sPair = normalizePair(String(s.pair || "").toUpperCase());
      return sPair === normalizedPair && s.signalCategory === parentCat && s.status === "ACTIVE";
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!parent) return null;

  const updateData: Record<string, unknown> = {};

  // Calculate P&L
  const entry = Number(parent.entry) || 0;
  const stopLoss = Number(parent.stopLoss) || 0;
  const slDist = Number(parent.slDistance) || Math.abs(entry - stopLoss);
  const lotSize = parent.lotSize ? parseFloat(String(parent.lotSize)) : 0;
  let balance = Number(parent.balance) || 0;

  // Fallback: if no lotSize and no balance, assume $1000 balance for P&L estimation
  const hasRiskData = lotSize > 0 || balance > 0;
  if (!hasRiskData) balance = 1000;
  let tps: { tp: number; rr: number }[] = [];
  try { tps = JSON.parse(String(parent.takeProfits || "[]")); } catch { tps = []; }

  // Pip value
  let pipVal = 10;
  if (pair.includes("XAU") || pair.includes("GOLD")) pipVal = 1;
  else if (pair.includes("XAG") || pair.includes("SILVER")) pipVal = 50;
  else if (pair.includes("BTC") || pair.includes("ETH")) pipVal = 1;
  else if (pair.includes("JPY")) pipVal = 6.5;

  // Cap function to prevent unrealistic P&L values
  const capPnL = (val: number) => {
    const clamped = Math.min(Math.max(val, -50000), 50000);
    return parseFloat(clamped.toFixed(2));
  };

  // Validate parsed pnlDollar from text - reject if unreasonable or zero (0 = not parsed)
  const validatedParsedDollar = (typeof parsed.pnlDollar === "number" && isFinite(parsed.pnlDollar) && parsed.pnlDollar !== 0 && Math.abs(parsed.pnlDollar) < 50000)
    ? parsed.pnlDollar : null;

  if (parsed.signalCategory === "BREAKEVEN") {
    // Breakeven: SL was moved to entry price, signal stays ACTIVE
    updateData.status = "ACTIVE";
    updateData.hitTpIndex = parsed.hitTpIndex ?? 0;
    updateData.stopLoss = parsed.entry || parent.stopLoss;
    updateData.tpStatusList = parsed.tpStatusList || "";
    updateData.totalTPs = parsed.totalTPs;
    updateData.partialWin = false;
  } else if (parsed.signalCategory === "TP_HIT" || parsed.signalCategory === "REENTRY_TP" || parsed.signalCategory === "PYRAMID_TP") {
    const tpNum = parsed.hitTpIndex ?? 0; // 1-indexed from parser
    const tpArrayIdx = tpNum > 0 ? tpNum - 1 : -1;
    const totalTPsCount = parsed.totalTPs || tps.length;
    const isFullClose = /إغلاق كامل بالربح/.test(String(parsed.rawText || ""));
    const isLastTP = isFullClose || tpNum >= totalTPsCount;

    // Keep ACTIVE for partial TP hits, only set HIT_TP on last/full close
    updateData.status = isLastTP ? "HIT_TP" : "ACTIVE";
    updateData.hitTpIndex = tpNum;
    // Do NOT change signalCategory — keep original (ENTRY/REENTRY/PYRAMID)
    // so subsequent TP hits can still find this parent signal
    // signalCategory stays as parentCat (the original entry type)

    // ── FIX: Calculate CUMULATIVE P&L across ALL hit TPs ──
    // Determine how many TPs to include in the cumulative sum
    const tpsToSum = isFullClose ? totalTPsCount : Math.max(tpNum, 1);
    let cumPoints = 0;
    let cumDollars = 0;
    for (let i = 0; i < Math.min(tpsToSum, tps.length); i++) {
      const tpPrice = tps[i].tp;
      const pts = Math.abs(tpPrice - entry);
      cumPoints += pts;
      if (lotSize > 0) {
        cumDollars += pts * pipVal * lotSize;
      } else if (balance > 0 && slDist > 0) {
        cumDollars += (pts / slDist) * (balance * 0.02) * tps[i].rr;
      } else if (balance > 0) {
        // Fallback: use R:R ratio directly with 2% risk per TP
        cumDollars += (balance * 0.02) * tps[i].rr;
      }
    }

    if (tpArrayIdx >= 0 && tps[tpArrayIdx]) {
      const tpPrice = tps[tpArrayIdx].tp;
      updateData.hitPrice = parsed.hitPrice || tpPrice;
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(cumPoints.toFixed(1));
      updateData.pnlDollars = validatedParsedDollar != null ? capPnL(validatedParsedDollar) : capPnL(cumDollars);
    } else {
      updateData.hitPrice = parsed.hitPrice || 0;
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(cumPoints.toFixed(1));
      updateData.pnlDollars = validatedParsedDollar != null ? capPnL(validatedParsedDollar) : capPnL(cumDollars);
    }

    updateData.totalTPs = totalTPsCount;
    updateData.tpStatusList = parsed.tpStatusList || "";
    updateData.partialWin = parsed.partialWin || false;

    // Full close: mark all TPs as hit
    if (isFullClose) {
      updateData.hitTpIndex = totalTPsCount;
    }
  }

  if (parsed.signalCategory === "SL_HIT" || parsed.signalCategory === "REENTRY_SL" || parsed.signalCategory === "PYRAMID_SL") {
    // ── KEY FIX: If TPs were already hit before SL, this is a PARTIAL WIN, not a loss ──
    const prevHitTp = Number(parent.hitTpIndex) || 0;
    const totalTPsCount = parsed.totalTPs || tps.length;
    const hadTpsBeforeSl = prevHitTp > 0;

    if (hadTpsBeforeSl) {
      // Signal already hit TP(s) before SL → mark as WIN with partial close
      updateData.status = "HIT_TP";
      updateData.partialWin = true;
      // Keep the existing hitTpIndex (number of TPs achieved before SL)
      updateData.hitTpIndex = prevHitTp;

      // Calculate NET P&L: sum of TP wins minus SL loss on remaining position
      let tpProfitDollars = 0;
      let tpProfitPoints = 0;
      for (let i = 0; i < Math.min(prevHitTp, tps.length); i++) {
        const tpPrice = tps[i].tp;
        const pts = Math.abs(tpPrice - entry);
        tpProfitPoints += pts;
        if (lotSize > 0) tpProfitDollars += pts * pipVal * lotSize;
        else if (balance > 0 && slDist > 0) tpProfitDollars += (pts / slDist) * (balance * 0.02) * tps[i].rr;
        else if (balance > 0) tpProfitDollars += (balance * 0.02) * tps[i].rr;
      }
      // SL loss on remaining fraction
      const slPoints = slDist;
      let slDollars = 0;
      if (lotSize > 0) slDollars = slPoints * pipVal * lotSize;
      else if (balance > 0) slDollars = balance * 0.02;
      // Approximate remaining position after partial closes
      const remainingFraction = Math.max(0, 1 - (prevHitTp / totalTPsCount));
      const netDollars = tpProfitDollars - (slDollars * remainingFraction);
      const netPoints = tpProfitPoints - (slPoints * remainingFraction);

      updateData.hitPrice = parsed.hitPrice || stopLoss;
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(netPoints.toFixed(1));
      updateData.pnlDollars = validatedParsedDollar != null ? capPnL(validatedParsedDollar) : capPnL(netDollars);
      updateData.totalTPs = totalTPsCount;
      // Mark TP status list to show which TPs were hit + SL on remainder
      updateData.tpStatusList = parsed.tpStatusList || "";
    } else {
      // No TPs were hit — pure SL loss
      const points = slDist;
      let dollars = 0;
      if (lotSize > 0) dollars = points * pipVal * lotSize;
      else if (balance > 0) dollars = balance * 0.02;

      updateData.status = "HIT_SL";
      updateData.partialWin = false;
      updateData.hitPrice = parsed.hitPrice || stopLoss;
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(points.toFixed(1));
      updateData.pnlDollars = validatedParsedDollar != null ? capPnL(validatedParsedDollar) : capPnL(-dollars);
      updateData.totalTPs = totalTPsCount;
      updateData.tpStatusList = parsed.tpStatusList || "";
    }
    // Do NOT change signalCategory — keep original entry type
  }

  const updated = await updateSignal(parent.id, updateData);
  if (!updated) return null;

  // Notify SSE subscribers about the update
  // For partial wins (SL after TPs), send tp_hit event instead of sl_hit
  const isPartialWin = parsed.signalCategory === "SL_HIT" || parsed.signalCategory === "REENTRY_SL" || parsed.signalCategory === "PYRAMID_SL";
  const isBeUpdate = parsed.signalCategory === "BREAKEVEN";
  let eventType: string;
  if (parsed.signalCategory === "TP_HIT" || parsed.signalCategory === "REENTRY_TP" || parsed.signalCategory === "PYRAMID_TP") {
    eventType = "tp_hit";
  } else if (isBeUpdate) {
    eventType = "breakeven";
  } else if (isPartialWin && updateData.partialWin && updateData.status === "HIT_TP") {
    eventType = "tp_hit"; // SL after TPs → treat as TP win event
  } else if (isPartialWin) {
    eventType = "sl_hit";
  } else {
    eventType = "signal";
  }
  notifySignalEvent({ type: eventType, pair: parsed.pair, signalType: parsed.signalCategory, tpIndex: parsed.hitTpIndex, timestamp: Date.now() });

  let parsedTps: { tp: number; rr: number }[] = [];
  try { parsedTps = JSON.parse(updated.takeProfits); } catch { parsedTps = []; }
  return { ...updated, takeProfits: parsedTps };
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
      signals: signals.map(s => {
        let tps: { tp: number; rr: number }[] = [];
        try { tps = JSON.parse(s.takeProfits); } catch { tps = []; }
        return { ...s, takeProfits: tps };
      }),
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشارات" }, { status: 500 });
  }
}
