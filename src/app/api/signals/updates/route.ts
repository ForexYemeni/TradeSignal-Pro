import { NextResponse } from "next/server";
import { getSignals } from "@/lib/store";

/**
 * Lightweight Updates Check
 * GET /api/signals/updates?since=<timestamp>
 * Returns only new signal IDs since the given timestamp
 * This is very fast - just checks the latest signals without full data
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const since = parseInt(searchParams.get("since") || "0");

    const signals = await getSignals(10);

    // Find signals created after 'since' timestamp
    const newSignals = signals.filter((s: { createdAt: string; id: string; pair: string; type: string; signalCategory: string; hitTpIndex: number }) => {
      const created = new Date(s.createdAt).getTime();
      return created > since;
    }).map((s: { id: string; pair: string; type: string; signalCategory: string; hitTpIndex: number; createdAt: string; status: string }) => ({
      id: s.id,
      pair: s.pair,
      type: s.type,
      signalCategory: s.signalCategory,
      hitTpIndex: s.hitTpIndex,
      createdAt: s.createdAt,
      status: s.status,
    }));

    // Also return the latest timestamp for next check
    const latestTime = signals.length > 0
      ? new Date(signals[0].createdAt).getTime()
      : Date.now();

    return NextResponse.json({
      success: true,
      hasNew: newSignals.length > 0,
      newSignals,
      latestTime,
      totalSignals: signals.length,
    });
  } catch (error) {
    console.error("Updates check error:", error);
    return NextResponse.json({ success: false, error: "خطأ" }, { status: 500 });
  }
}
