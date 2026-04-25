import { NextRequest, NextResponse } from "next/server";
import { getUserUpdateFlag } from "@/lib/store";

/**
 * GET /api/user-events?userId=xxx
 *
 * Lightweight polling endpoint (call every 5s from client).
 * Returns any pending update event for the user (package change, block, etc.)
 * Events are consumed (deleted) after being read.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ dirty: false }, { status: 400 });
    }

    const event = await getUserUpdateFlag(userId);
    if (event) {
      return NextResponse.json({ dirty: true, event });
    }

    return NextResponse.json({ dirty: false });
  } catch {
    return NextResponse.json({ dirty: false });
  }
}
