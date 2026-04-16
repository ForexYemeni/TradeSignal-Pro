import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/stats - Get trading statistics
export async function GET() {
  try {
    const totalSignals = await db.signal.count();
    const activeSignals = await db.signal.count({ where: { status: "ACTIVE" } });
    const hitTpSignals = await db.signal.count({ where: { status: "HIT_TP" } });
    const hitSlSignals = await db.signal.count({ where: { status: "HIT_SL" } });
    const expiredSignals = await db.signal.count({ where: { status: "EXPIRED" } });
    const manualCloseSignals = await db.signal.count({ where: { status: "MANUAL_CLOSE" } });

    const buySignals = await db.signal.count({ where: { type: "BUY" } });
    const sellSignals = await db.signal.count({ where: { type: "SELL" } });

    // Win rate calculation
    const closedSignals = hitTpSignals + hitSlSignals;
    const winRate = closedSignals > 0 ? Math.round((hitTpSignals / closedSignals) * 100) : 0;

    // Top pairs
    const signalsByPair = await db.signal.groupBy({
      by: ["pair"],
      _count: { pair: true },
      orderBy: { _count: { pair: "desc" } },
      take: 10,
    });

    // Recent signals stats (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSignals = await db.signal.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    // Average confidence
    const allSignals = await db.signal.findMany({
      select: { confidence: true },
    });
    const avgConfidence =
      allSignals.length > 0
        ? (allSignals.reduce((sum, s) => sum + s.confidence, 0) / allSignals.length).toFixed(1)
        : 0;

    return NextResponse.json({
      success: true,
      stats: {
        total: totalSignals,
        active: activeSignals,
        hitTp: hitTpSignals,
        hitSl: hitSlSignals,
        expired: expiredSignals,
        manualClose: manualCloseSignals,
        buyCount: buySignals,
        sellCount: sellSignals,
        winRate,
        recentWeek: recentSignals,
        avgConfidence: parseFloat(avgConfidence as string),
        topPairs: signalsByPair.map((p) => ({
          pair: p.pair,
          count: p._count.pair,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "خطأ في جلب الإحصائيات" },
      { status: 500 }
    );
  }
}
