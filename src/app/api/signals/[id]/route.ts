import { NextRequest, NextResponse } from "next/server";
import { getSignalById, updateSignal, deleteSignal } from "@/lib/store";
import { notifyTpHit, notifySlHit } from "@/lib/push";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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
    const balance = Number(existing.balance) || 0;

    // Determine pip value based on pair
    const pair = String(existing.pair || "").toUpperCase();
    let pipValue = 10;
    if (pair.includes("XAU") || pair.includes("GOLD")) {
      pipValue = 1;
    } else if (pair.includes("XAG") || pair.includes("SILVER")) {
      pipValue = 50;
    } else if (pair.includes("BTC") || pair.includes("ETH") || pair.includes("CRYPTO")) {
      pipValue = 1;
    } else if (!pair.includes("JPY")) {
      pipValue = 10;
    } else {
      pipValue = 6.5;
    }

    if (status === "HIT_TP" && hitTpIndex !== undefined && hitTpIndex >= 0) {
      const tps: { tp: number; rr: number }[] = JSON.parse(String(existing.takeProfits));
      if (tps[hitTpIndex]) {
        const tpPrice = tps[hitTpIndex].tp;
        const points = Math.abs(tpPrice - entry);
        let dollars = 0;

        if (lotSize > 0) {
          dollars = points * pipValue * lotSize;
        } else if (balance > 0 && slDistance > 0) {
          const riskAmount = balance * 0.02;
          dollars = (points / slDistance) * riskAmount * tps[hitTpIndex].rr;
        }

        updateData.pnlPoints = parseFloat(points.toFixed(1));
        updateData.pnlDollars = parseFloat(dollars.toFixed(2));
        updateData.hitPrice = tpPrice;
      }
    }

    if (status === "HIT_SL") {
      const points = slDistance;
      let dollars = 0;

      if (lotSize > 0) {
        dollars = points * pipValue * lotSize;
      } else if (balance > 0) {
        dollars = balance * 0.02;
      }

      updateData.pnlPoints = parseFloat(points.toFixed(1));
      updateData.pnlDollars = parseFloat(-dollars.toFixed(2));
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
        hitTpIndex ?? 0,
        updateData.pnlDollars as number | undefined
      ).catch(() => {});
    } else if (status === "HIT_SL") {
      notifySlHit(
        existing.pair,
        updateData.pnlDollars as number | undefined
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      signal: { ...signal, takeProfits: JSON.parse(signal.takeProfits) },
    });
  } catch (error) {
    console.error("Error updating signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإشارة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteSignal(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف الإشارة" }, { status: 500 });
  }
}
