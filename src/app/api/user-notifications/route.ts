import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/admin-auth";
import { getUserNotifications, markUserNotificationRead, markAllUserNotificationsRead, clearUserNotifications, getUnreadUserNotificationCount } from "@/lib/store";

/**
 * GET /api/user-notifications
 * - ?action=count → return unread count (lightweight)
 * - No action → return user's notifications (last 50)
 */
export async function GET(request: NextRequest) {
  const userId = getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("action") === "count") {
      const count = await getUnreadUserNotificationCount(userId);
      return NextResponse.json({ success: true, count });
    }

    const notifications = await getUserNotifications(userId, 50);
    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("[UserNotifications GET] Error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشعارات" }, { status: 500 });
  }
}

/**
 * POST /api/user-notifications
 * - { action: "mark_read", notificationId } → mark single notification read
 * - { action: "mark_all_read" } → mark all as read
 * - { action: "clear" } → clear all notifications
 */
export async function POST(request: NextRequest) {
  const userId = getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "يرجى تسجيل الدخول" }, { status: 401 });
  }

  try {
    const { action, notificationId } = await request.json();

    if (action === "mark_read" && notificationId) {
      await markUserNotificationRead(userId, notificationId);
      return NextResponse.json({ success: true });
    }

    if (action === "mark_all_read") {
      await markAllUserNotificationsRead(userId);
      return NextResponse.json({ success: true });
    }

    if (action === "clear") {
      await clearUserNotifications(userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[UserNotifications POST] Error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإشعارات" }, { status: 500 });
  }
}
