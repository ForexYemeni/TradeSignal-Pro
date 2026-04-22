import { NextRequest, NextResponse } from "next/server";
import { getSignals, getUserById, getPackageById } from "@/lib/store";

/**
 * Lightweight Updates Check
 * GET /api/signals/updates?since=<timestamp>
 * Returns only new signal IDs since the given timestamp
 * Filters by user's package (instruments + maxSignals)
 */

function getInstrumentCategory(pair: string): string {
  const p = (pair || "").toUpperCase();
  if (/XAU|GOLD/.test(p)) return "gold";
  if (/XAG|SILVER/.test(p)) return "metals";
  if (/USOIL|CRUDE|OIL/.test(p)) return "oil";
  if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE/.test(p)) return "crypto";
  if (/NAS|US30|DAX|US500|SPX|NDX/.test(p)) return "indices";
  if (/[A-Z]{3,6}(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)/.test(p)) return "currencies";
  return "other";
}

function isEntry(cat: string) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const since = parseInt(searchParams.get("since") || "0");

    const allSignals = await getSignals(50);

    // ── Identify user ──
    const sessionCookie = request.cookies.get('fy_session')?.value;
    const authHeader = request.headers.get("authorization");
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;
    const userId = sessionCookie || token;
    const user = userId ? await getUserById(userId) : null;
    const isAdmin = user?.role === "admin";

    let signals = allSignals;

    // Apply same filtering as main GET endpoint
    if (!isAdmin && user && user.status === "active" && user.packageId) {
      const pkg = await getPackageById(user.packageId);
      if (pkg) {
        // Filter by instruments — ALL signals (including TP/SL/BE)
        if (pkg.instruments && pkg.instruments.length > 0) {
          const allowed = new Set(pkg.instruments);
          signals = signals.filter(s => allowed.has(getInstrumentCategory(s.pair)));
        }
        // Filter by maxSignals per day
        if (pkg.maxSignals > 0) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayISO = todayStart.toISOString();
          const todayEntryIds: string[] = [];
          for (const s of signals) {
            if (isEntry(String(s.signalCategory)) && s.createdAt >= todayISO) {
              todayEntryIds.push(s.id);
            }
          }
          if (todayEntryIds.length > pkg.maxSignals) {
            const allowed = new Set(todayEntryIds.slice(0, pkg.maxSignals));
            signals = signals.filter(s => {
              if (!isEntry(String(s.signalCategory))) return true;
              return allowed.has(s.id);
            });
          }
        }
      }
    } else if (!isAdmin) {
      signals = [];
    }

    // Find signals created after 'since' timestamp
    const newSignals = signals.filter((s: any) => {
      const created = new Date(s.createdAt).getTime();
      return created > since;
    }).map((s: any) => ({
      id: s.id,
      pair: s.pair,
      type: s.type,
      signalCategory: s.signalCategory,
      hitTpIndex: s.hitTpIndex,
      createdAt: s.createdAt,
      status: s.status,
    }));

    // Also return the latest timestamp for next check
    const latestTime = allSignals.length > 0
      ? new Date(allSignals[0].createdAt).getTime()
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
