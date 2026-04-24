import { NextRequest, NextResponse } from "next/server";
import { getUserById, enforceSubscriptions } from "@/lib/store";

/**
 * GET /api/session/refresh?userId=xxx
 * Returns the latest session data for the given user.
 * Used by the client to periodically refresh session (subscription, status, etc.)
 * without requiring re-login.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ success: false, error: "معرف المستخدم مطلوب" }, { status: 400 });
    }

    // Enforce subscriptions (expire any that are past due)
    await enforceSubscriptions();

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      session: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        mustChangePwd: user.mustChangePwd,
        subscriptionType: user.subscriptionType,
        subscriptionExpiry: user.subscriptionExpiry,
        packageId: user.packageId,
        packageName: user.packageName,
      },
    });
  } catch (error) {
    console.error("Session refresh error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الجلسة" }, { status: 500 });
  }
}
