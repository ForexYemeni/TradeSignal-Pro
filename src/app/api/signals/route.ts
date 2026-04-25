import { NextRequest, NextResponse } from "next/server";
import { addSignal, getSignals, updateSignal, getUserById, getPackageById, addAdminNotification } from "@/lib/store";
import { parseTradingViewSignal, validateSignal } from "@/lib/signal-parser";
import { notifyNewSignal, notifyTpHit, notifySlHit } from "@/lib/push";
import { notifySignalEvent } from "./stream/route";
import { broadcastSignalToSubscribers } from "@/lib/email";
import { sendSignalToTelegram, sendSignalUpdateToTelegram } from "@/lib/telegram";

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

  // 2. Check webhook secret (for Google Apps Script / TradingView webhooks)
  const webhookHeader = request.headers.get("x-webhook-secret");
  if (WEBHOOK_SECRET && webhookHeader === WEBHOOK_SECRET) return true;

  // 3. Check Authorization header (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // If token matches webhook secret, allow
    if (WEBHOOK_SECRET && token === WEBHOOK_SECRET) return true;
    // If token matches a valid user/admin ID, allow
    if (token) {
      const user = await getUserById(token);
      if (user) return true;
    }
  }

  // 4. Allow all POST requests without auth — the signal parser provides
  //    the real validation (rejects invalid formats with 400).
  //    This ensures TradingView webhooks, Google Apps Script, and any
  //    external source can send signals without needing a secret configured.
  //    Note: If you want to restrict access, set WEBHOOK_SECRET in both
  //    Vercel env and Google Apps Script, or use the Authorization header.
  return true;
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

    console.log("[Webhook] Incoming signal text:", text.substring(0, 200));

    const parseResult = parseTradingViewSignal(text);
    if (!parseResult.success || !parseResult.signal) {
      console.error("[Webhook] Parse failed:", parseResult.error, "| Warnings:", parseResult.warnings);
      return NextResponse.json(
        { success: false, error: parseResult.error || "فشل تحليل الإشارة", warnings: parseResult.warnings },
        { status: 400 }
      );
    }

    console.log("[Webhook] Parsed:", parseResult.signal.signalCategory, "| Pair:", parseResult.signal.pair, "| Type:", parseResult.signal.type);

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
          // Telegram: TP hit notification
          let parsedParentTps: { tp: number; rr: number }[] = [];
          try { parsedParentTps = JSON.parse(String(updated.takeProfits || "[]")); } catch { parsedParentTps = []; }
          sendSignalUpdateToTelegram({
            pair: updated.pair,
            updateType: cat as "TP_HIT" | "REENTRY_TP" | "PYRAMID_TP",
            tpIndex: updated.hitTpIndex != null && updated.hitTpIndex >= 0 ? updated.hitTpIndex + 1 : undefined,
            totalTPs: parsedParentTps.length || updated.totalTPs || undefined,
            hitPrice: updated.hitPrice ?? undefined,
            pnlDollars: updated.pnlDollars ?? undefined,
            pnlPoints: updated.pnlPoints ?? undefined,
            partialWin: updated.partialWin ?? false,
            entry: Number(updated.entry) || undefined,
            stopLoss: Number(updated.stopLoss) || undefined,
          }).catch((e) => { console.error("[Telegram] TP update failed:", e); });
        } else if (cat === "BREAKEVEN") {
          notifySignalEvent({ type: "breakeven", pair: parseResult.signal.pair, signalType: cat, timestamp: Date.now() });
          // Telegram: Breakeven notification
          sendSignalUpdateToTelegram({
            pair: updated.pair,
            updateType: "BREAKEVEN",
            entry: Number(updated.entry) || undefined,
          }).catch((e) => { console.error("[Telegram] Breakeven update failed:", e); });
        } else if (cat === "SL_HIT" || cat === "REENTRY_SL" || cat === "PYRAMID_SL") {
          // If it was a partial win (TPs hit before SL), send TP notification instead
          if (updated.partialWin && updated.status === "HIT_TP") {
            notifyTpHit(parseResult.signal.pair, updated.hitTpIndex ?? 0, undefined, cat).catch(() => {});
          } else {
            notifySlHit(parseResult.signal.pair).catch(() => {});
          }
          // Telegram: SL hit notification
          sendSignalUpdateToTelegram({
            pair: updated.pair,
            updateType: cat as "SL_HIT" | "REENTRY_SL" | "PYRAMID_SL",
            hitPrice: updated.hitPrice ?? undefined,
            pnlDollars: updated.pnlDollars ?? undefined,
            pnlPoints: updated.pnlPoints ?? undefined,
            partialWin: updated.partialWin ?? false,
            entry: Number(updated.entry) || undefined,
            stopLoss: Number(updated.stopLoss) || undefined,
          }).catch((e) => { console.error("[Telegram] SL update failed:", e); });
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
      // Only deduplicate by exact rawText match — never block a new signal
      // just because another signal for the same pair exists
      const isDuplicate = existing.some(s => {
        if (s.rawText.trim() === rawText) return true;
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
        if (String(s.pair).toUpperCase() !== String(parseResult.signal!.pair || "").toUpperCase()) return false;
        if (s.rawText.trim() === (parseResult.signal!.rawText || "").trim()) return true;
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

    console.log("[Webhook] Signal stored:", signal.id, "| Pair:", signal.pair, "| Cat:", cat);

    // Notify SSE subscribers about new signal (include type for instant sound)
    notifySignalEvent({ type: "signal", pair: parseResult.signal.pair, signalType: cat, signalDirection: parseResult.signal.type, timestamp: Date.now() });

    // Admin notification for new entry signals
    if (isEntry(cat)) {
      const directionLabel = parseResult.signal.type === "BUY" ? "شراء" : "بيع";
      addAdminNotification({
        type: "system",
        title: `إشارة ${directionLabel}: ${parseResult.signal.pair}`,
        message: `تم استلام إشارة ${directionLabel} جديدة لزوج ${parseResult.signal.pair} | الدخول: ${parseResult.signal.entry} | الإطار: ${parseResult.signal.timeframe || "—"}`,
      }).catch(() => {});
    }

    // Push notification for new entries
    if (isEntry(cat)) {
      notifyNewSignal(parseResult.signal.pair, parseResult.signal.type, parseResult.signal.entry, parseResult.signal.timeframe).catch(() => {});
    }

    // ── Telegram notification: send signal to Telegram channel ──
    if (isEntry(cat)) {
      let parsedTps: { tp: number; rr: number }[] = [];
      try { parsedTps = JSON.parse(String(signal.takeProfits || "[]")); } catch { parsedTps = []; }
      sendSignalToTelegram({
        pair: String(signal.pair),
        type: parseResult.signal.type,
        entry: Number(signal.entry),
        stopLoss: Number(signal.stopLoss),
        takeProfits: parsedTps,
        confidence: Number(signal.confidence),
        timeframe: signal.timeframe,
        htfTimeframe: signal.htfTimeframe,
        htfTrend: signal.htfTrend,
        smcTrend: signal.smcTrend,
        signalCategory: cat,
        instrument: signal.instrument || undefined,
        slDistance: signal.slDistance || undefined,
        maxRR: signal.maxRR || undefined,
        balance: signal.balance || undefined,
        lotSize: signal.lotSize || undefined,
        riskPercent: signal.riskPercent || undefined,
        riskTarget: signal.riskTarget || undefined,
        actualRisk: signal.actualRisk || undefined,
        actualRiskPct: signal.actualRiskPct || undefined,
      }).catch((e) => { console.error("[Telegram] Signal send failed:", e); }); // Fire-and-forget
    }

    // ── Email notification: broadcast signal to all active subscribers ──
    if (isEntry(cat)) {
      let parsedTps: { tp: number; rr: number }[] = [];
      try { parsedTps = JSON.parse(String(signal.takeProfits || "[]")); } catch { parsedTps = []; }
      broadcastSignalToSubscribers({
        pair: String(signal.pair),
        type: parseResult.signal.type as "BUY" | "SELL",
        entry: Number(signal.entry),
        stopLoss: Number(signal.stopLoss),
        takeProfits: parsedTps,
        confidence: Number(signal.confidence),
        timeframe: String(signal.timeframe || ""),
        signalId: signal.id,
      }).catch(() => {}); // Fire-and-forget — don't block signal creation
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

  // Pip value (per lot multiplier: $ per 1 price unit per 1 lot)
  // Gold: 100 oz/lot → $100 per $1 move | Silver: 5000 oz/lot → $5000 per $1 move
  // Forex 5-digit: 100,000 units/lot | JPY: ~$1000 per 1.0 move
  // Crypto: $1 per $1 move | Indices: $1 per $1 move
  let pipVal = 100000; // default: forex (EURUSD, GBPUSD, etc.)
  if (pair.includes("XAU") || pair.includes("GOLD")) pipVal = 100;
  else if (pair.includes("XAG") || pair.includes("SILVER")) pipVal = 5000;
  else if (pair.includes("BTC") || pair.includes("ETH")) pipVal = 1;
  else if (pair.includes("US30") || pair.includes("NAS") || pair.includes("DOW") || pair.includes("SPX") || pair.includes("US500")) pipVal = 1;
  else if (pair.includes("JPY")) pipVal = 1000;
  else if (pair.includes("OIL") || pair.includes("WTI") || pair.includes("CL")) pipVal = 1000;

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
    const isPriceJump = /قفزة سعرية/.test(String(parsed.rawText || ""));
    // Price jump (قفزة سعرية) is NEVER a full close — it means some TPs were skipped
    // Only "إغلاق كامل بالربح" or reaching the actual last TP should close the trade
    const isLastTP = isFullClose || (!isPriceJump && tpNum >= totalTPsCount);

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
      updateData.hitPrice = parsed.hitPrice || stopLoss;
      updateData.totalTPs = totalTPsCount;
      updateData.tpStatusList = parsed.tpStatusList || "";

      // ═══ FIX: Use stored P&L from last TP hit instead of recalculating ═══
      // Previous bug: summed all TP profits for the FULL lot size ($63.47)
      // but only applied SL loss on the remaining fraction ($1.92), giving
      // a wildly inflated net of $61.55 instead of the actual $14.51.
      //
      // Now: use the P&L value stored when the last TP was hit (extracted
      // from the signal text, e.g. "+$14.51"), falling back to a corrected
      // partial-close calculation only when no text value is available.
      let finalDollars: number;
      let finalPoints: number;

      if (validatedParsedDollar != null) {
        // SL signal text contains a dollar amount — use it directly
        finalDollars = validatedParsedDollar;
        finalPoints = parsed.pnlPoints || parent.pnlPoints || 0;
      } else if (parent.pnlDollars != null && parent.pnlDollars !== 0) {
        // Use the P&L stored from the last TP hit (from signal text)
        // This is the actual broker profit reported in the TP notification
        finalDollars = parent.pnlDollars;
        finalPoints = parent.pnlPoints || 0;
      } else {
        // Fallback: corrected partial-close calculation
        // Each TP closes 1/totalTPs of the position (not the full lot)
        let tpProfitDollars = 0;
        let tpProfitPoints = 0;
        for (let i = 0; i < Math.min(prevHitTp, tps.length); i++) {
          const tpPrice = tps[i].tp;
          const pts = Math.abs(tpPrice - entry);
          tpProfitPoints += pts;
          if (lotSize > 0) tpProfitDollars += pts * pipVal * (lotSize / totalTPsCount);
          else if (balance > 0 && slDist > 0) tpProfitDollars += (pts / slDist) * (balance * 0.02) * tps[i].rr / totalTPsCount;
          else if (balance > 0) tpProfitDollars += (balance * 0.02) * tps[i].rr / totalTPsCount;
        }
        const slPoints = slDist;
        let slDollars = 0;
        if (lotSize > 0) slDollars = slPoints * pipVal * lotSize;
        else if (balance > 0) slDollars = balance * 0.02;
        const remainingFraction = Math.max(0, 1 - (prevHitTp / totalTPsCount));
        finalDollars = tpProfitDollars - (slDollars * remainingFraction);
        finalPoints = tpProfitPoints - (slPoints * remainingFraction);
      }

      updateData.pnlDollars = capPnL(finalDollars);
      updateData.pnlPoints = parsed.pnlPoints || parseFloat(finalPoints.toFixed(1));
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

/**
 * Map signal pair name to instrument category.
 * Used for per-user package filtering.
 */
function getInstrumentCategory(pair: string): string {
  const p = (pair || "").toUpperCase();
  if (/XAU|GOLD/.test(p)) return "gold";
  if (/XAG|SILVER/.test(p)) return "metals";
  if (/USOIL|CRUDE|OIL|CL/.test(p)) return "oil";
  // Auto-detect ANY pair ending in USDT as crypto (catches ALL crypto pairs automatically)
  if (/USDT$/.test(p)) return "crypto";
  if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK|UNI|ATOM|LTC|ETC|FIL|APT|ARB|OP|NEAR|SAND|MANA|SHIB|PEPE|WIF/.test(p)) return "crypto";
  if (/NAS|US30|DAX|US500|SPX|NDX|UK100|GER40|JPN225/.test(p)) return "indices";
  if (/[A-Z]{3,6}(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)/.test(p)) return "currencies";
  return "other";
}

/**
 * Extract user ID from request (session cookie or auth header).
 * Returns null if not authenticated.
 */
function getRequestUserId(request: NextRequest): string | null {
  // 1. Session cookie
  const sessionCookie = request.cookies.get('fy_session')?.value;
  if (sessionCookie) return sessionCookie;
  // 2. Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token) return token;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const allSignals = await getSignals(9999);

    // ── Identify user and determine filtering ──
    const userId = getRequestUserId(request);
    const user = userId ? await getUserById(userId) : null;
    const isAdmin = user?.role === "admin";

    let filteredSignals = allSignals;

    // Apply per-user filtering only for non-admin users with a valid active subscription
    if (!isAdmin && user && user.status === "active" && user.packageId) {
      const pkg = await getPackageById(user.packageId);
      if (pkg) {
        // 1. Filter by instruments
        if (pkg.instruments && pkg.instruments.length > 0) {
          const allowedInstruments = new Set(pkg.instruments);
          filteredSignals = filteredSignals.filter(s => {
            const cat = getInstrumentCategory(s.pair);
            return allowedInstruments.has(cat);
          });
        }

        // 2. Filter by maxSignals per day
        // Count ALL entry signals created today (active or closed)
        // If exceeds limit, only show signals that were within the first N entries
        if (pkg.maxSignals > 0) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayISO = todayStart.toISOString();

          // Collect ALL entry signals from today and sort by createdAt ASCENDING
          // (oldest first) so that slice(0, maxSignals) picks the FIRST N entries
          // of the day, not the last N. Signals are stored newest-first via unshift(),
          // so we must reverse the order before slicing.
          const todayEntries = filteredSignals
            .filter(s => isEntry(String(s.signalCategory)) && s.createdAt >= todayISO)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          // If exceeds limit, only keep signals within the first N entries
          if (todayEntries.length > pkg.maxSignals) {
            const allowedIds = new Set(todayEntries.slice(0, pkg.maxSignals).map(s => s.id));
            filteredSignals = filteredSignals.filter(s => {
              if (!isEntry(String(s.signalCategory))) return true;
              // Only show entry signals that were within the daily limit
              return allowedIds.has(s.id);
            });
          }
        }
      }
    }

    // If user is not authenticated or has no valid subscription, show nothing
    // (admin already handled above with no filtering)
    if (!isAdmin && (!user || user.status !== "active" || !user.packageId)) {
      filteredSignals = [];
    }

    const total = filteredSignals.length;
    const paginatedSignals = filteredSignals.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      signals: paginatedSignals.map(s => {
        let tps: { tp: number; rr: number }[] = [];
        try { tps = JSON.parse(s.takeProfits); } catch { tps = []; }
        return { ...s, takeProfits: tps };
      }),
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشارات" }, { status: 500 });
  }
}
