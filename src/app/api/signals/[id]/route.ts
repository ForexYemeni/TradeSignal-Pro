import { NextRequest, NextResponse } from "next/server";
import { getSignalById, updateSignal, deleteSignal, getUserById } from "@/lib/store";
import { notifyTpHit, notifySlHit } from "@/lib/push";
import { notifySignalEvent } from "../stream/route";

// ─── Auth Guard ───────────────────────────────────────
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Auth check
    const authed = await isAuthorized(request);
    if (!authed) {
      return NextResponse.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, hitTpIndex } = body;

    if (!status && hitTpIndex === undefined) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    // Get existing signal to calculate P&L
    const existing = await getSignalById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "الإشارة غير موجودة" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (hitTpIndex !== undefined) updateData.hitTpIndex = hitTpIndex;

    // ── Auto-calculate P&L ──
    const entry = Number(existing.entry);
    const stopLoss = Number(existing.stopLoss);
    const slDistance = Number(existing.slDistance) || Math.abs(entry - stopLoss);
    const lotSize = existing.lotSize ? parseFloat(String(existing.lotSize)) : 0;
    let balance = Number(existing.balance) || 0;

    // Fallback: if no lotSize and no balance, assume $1000 balance for P&L estimation
    const hasRiskData = lotSize > 0 || balance > 0;
    if (!hasRiskData) balance = 1000;

    // Determine pip value based on pair (per lot multiplier: $ per 1 price unit per 1 lot)
    // Gold: 100 oz/lot → $100 per $1 move | Silver: 5000 oz/lot → $5000 per $1 move
    // Forex 5-digit: 100,000 units/lot → $100,000 per 1.0 move | JPY: ~$1000 per 1.0 move
    // Crypto: $1 per $1 move | Indices: $1 per $1 move
    const pair = String(existing.pair || "").toUpperCase();
    let pipValue = 100000; // default: forex (EURUSD, GBPUSD, etc.)
    if (pair.includes("XAU") || pair.includes("GOLD")) {
      pipValue = 100;       // 100 oz per lot
    } else if (pair.includes("XAG") || pair.includes("SILVER")) {
      pipValue = 5000;      // 5000 oz per lot
    } else if (pair.includes("BTC") || pair.includes("ETH") || pair.includes("CRYPTO")) {
      pipValue = 1;
    } else if (pair.includes("US30") || pair.includes("NAS") || pair.includes("DOW") || pair.includes("SPX") || pair.includes("US500")) {
      pipValue = 1;         // Indices: $1 per point per lot
    } else if (pair.includes("JPY")) {
      pipValue = 1000;      // JPY pairs (3 decimals)
    } else if (pair.includes("OIL") || pair.includes("WTI") || pair.includes("CL")) {
      pipValue = 1000;      // Oil: 1000 barrels per lot
    }

    if (status === "HIT_TP" && hitTpIndex !== undefined && hitTpIndex >= 0) {
      let tps: { tp: number; rr: number }[] = [];
      try { tps = JSON.parse(String(existing.takeProfits)); } catch { tps = []; }
      // hitTpIndex from admin is 0-indexed array position; convert to 1-indexed for consistency with parser
      const tpArrayIdx = hitTpIndex;
      const tpDisplayNum = hitTpIndex + 1;
      const totalTPs = tps.length;
      const isLastTP = tpArrayIdx >= totalTPs - 1;

      if (tps[tpArrayIdx]) {
        const tpPrice = tps[tpArrayIdx].tp;
        const points = Math.abs(tpPrice - entry);
        let dollars = 0;

        if (lotSize > 0) {
          dollars = points * pipValue * lotSize;
        } else if (balance > 0 && slDistance > 0) {
          const riskAmount = balance * 0.02;
          dollars = (points / slDistance) * riskAmount * tps[tpArrayIdx].rr;
        } else if (balance > 0) {
          // Fallback: use R:R ratio with 2% risk
          dollars = (balance * 0.02) * tps[tpArrayIdx].rr;
        }

        updateData.pnlPoints = parseFloat(points.toFixed(1));
        updateData.pnlDollars = parseFloat(dollars.toFixed(2));
        updateData.hitPrice = tpPrice;
        updateData.hitTpIndex = tpDisplayNum; // Store as 1-indexed
        updateData.totalTPs = totalTPs;

        // Only close the trade if this is the LAST TP
        if (isLastTP) {
          updateData.status = "HIT_TP";
        } else {
          // Partial TP hit — keep signal ACTIVE
          updateData.status = "ACTIVE";
        }
      }
    }

    if (status === "HIT_SL") {
      const points = slDistance;
      let dollars = 0;

      // ── KEY FIX: If TPs were already hit before SL, this is a PARTIAL WIN ──
      const prevHitTp = Number(existing.hitTpIndex) || 0;
      let tps: { tp: number; rr: number }[] = [];
      try { tps = JSON.parse(String(existing.takeProfits)); } catch { tps = []; }
      const totalTPsCount = tps.length;

      if (prevHitTp > 0) {
        // Partial win: TPs were hit before SL
        let tpProfitDollars = 0;
        let tpProfitPoints = 0;
        for (let i = 0; i < Math.min(prevHitTp, tps.length); i++) {
          const tpPrice = tps[i].tp;
          const pts = Math.abs(tpPrice - entry);
          tpProfitPoints += pts;
          if (lotSize > 0) tpProfitDollars += pts * pipValue * lotSize;
          else if (balance > 0 && slDistance > 0) tpProfitDollars += (pts / slDistance) * (balance * 0.02) * tps[i].rr;
        }
        // SL loss on remaining fraction
        const slDollars = lotSize > 0 ? points * pipValue * lotSize : balance > 0 ? balance * 0.02 : 0;
        const remainingFraction = Math.max(0, 1 - (prevHitTp / totalTPsCount));
        const netDollars = tpProfitDollars - (slDollars * remainingFraction);
        const netPoints = tpProfitPoints - (points * remainingFraction);

        updateData.status = "HIT_TP";
        updateData.partialWin = true;
        updateData.hitTpIndex = prevHitTp;
        updateData.pnlPoints = parseFloat(netPoints.toFixed(1));
        updateData.pnlDollars = parseFloat(netDollars.toFixed(2));
        updateData.totalTPs = totalTPsCount;
      } else {
        // Pure SL loss
        if (lotSize > 0) {
          dollars = points * pipValue * lotSize;
        } else if (balance > 0) {
          dollars = balance * 0.02;
        }
        updateData.status = "HIT_SL";
        updateData.partialWin = false;
        updateData.hitPrice = stopLoss;
        updateData.pnlPoints = parseFloat(points.toFixed(1));
        updateData.pnlDollars = parseFloat(-dollars.toFixed(2));
      }
      updateData.hitPrice = stopLoss;
    }

    const signal = await updateSignal(id, updateData);
    if (!signal) {
      return NextResponse.json({ success: false, error: "الإشارة غير موجودة" }, { status: 404 });
    }

    // ── Send Push Notification on status change ──
    if (status === "HIT_TP") {
      notifyTpHit(
        existing.pair,
        (hitTpIndex ?? 0) + 1,
        updateData.pnlDollars as number | undefined,
        existing.signalCategory === "REENTRY" ? "REENTRY_TP"
          : existing.signalCategory === "PYRAMID" ? "PYRAMID_TP"
          : "TP_HIT"
      ).catch(() => {});
    } else if (status === "HIT_SL" || (status === "HIT_SL" && updateData.partialWin)) {
      // Partial win (SL after TPs) → send TP notification instead
      if (updateData.partialWin && updateData.status === "HIT_TP") {
        notifyTpHit(
          existing.pair,
          Number(existing.hitTpIndex) || 0,
          updateData.pnlDollars as number | undefined,
          existing.signalCategory === "REENTRY" ? "REENTRY_TP"
            : existing.signalCategory === "PYRAMID" ? "PYRAMID_TP"
            : "TP_HIT"
        ).catch(() => {});
      } else {
        notifySlHit(
          existing.pair,
          updateData.pnlDollars as number | undefined
        ).catch(() => {});
      }
    }

    // Notify SSE subscribers
    if (status === "HIT_TP" || status === "HIT_SL") {
      const isPartialWin = updateData.partialWin && updateData.status === "HIT_TP";
      notifySignalEvent({
        type: isPartialWin ? "tp_hit" : status === "HIT_TP" ? "tp_hit" : "sl_hit",
        pair: existing.pair,
        signalType: status,
        tpIndex: updateData.hitTpIndex as number | undefined,
        timestamp: Date.now(),
      });
    }

    let parsedTps: { tp: number; rr: number }[] = [];
    try { parsedTps = JSON.parse(signal.takeProfits); } catch { parsedTps = []; }
    return NextResponse.json({
      success: true,
      signal: { ...signal, takeProfits: parsedTps },
    });
  } catch (error) {
    console.error("Error updating signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإشارة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Auth check
    const authed = await isAuthorized(request);
    if (!authed) {
      return NextResponse.json({ success: false, error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;
    await deleteSignal(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف الإشارة" }, { status: 500 });
  }
}
