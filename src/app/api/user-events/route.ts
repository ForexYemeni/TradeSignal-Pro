import { NextRequest, NextResponse } from "next/server";
import { getUserUpdateFlag, getGlobalVersion } from "@/lib/store";

/**
 * GET /api/user-events?userId=xxx&clientVersion=<number>
 *
 * Lightweight polling endpoint (call every 5s from client).
 * Returns TWO types of events:
 *   1. User-specific events (package change, block, approve, etc.) — consumed after read
 *   2. Global data changes (packages, payment methods, coupons, settings) — version-based
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    const clientVersion = Number(request.nextUrl.searchParams.get("clientVersion") || "0");

    // ── Check user-specific event ──
    let userEvent: { type: string; ts: number; [key: string]: unknown } | null = null;
    if (userId) {
      userEvent = await getUserUpdateFlag(userId);
    }

    // ── Check global data version ──
    const { version: serverVersion, lastUpdate } = await getGlobalVersion();
    const globalChanged = clientVersion > 0 && serverVersion > clientVersion;

    // If either user-specific or global event exists, return dirty
    if (userEvent || globalChanged) {
      return NextResponse.json({
        dirty: true,
        event: userEvent,
        globalChanged,
        serverVersion,
        lastUpdate: globalChanged ? lastUpdate : null,
      });
    }

    return NextResponse.json({ dirty: false, serverVersion });
  } catch {
    return NextResponse.json({ dirty: false });
  }
}
