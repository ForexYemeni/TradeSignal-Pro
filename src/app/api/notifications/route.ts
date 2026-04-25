import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminNotifications, addAdminNotification, markNotificationRead, markAllNotificationsRead, clearNotifications, getUnreadNotificationCount } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // Unread count - lightweight, no full admin check needed
    if (action === "count") {
      const count = await getUnreadNotificationCount();
      return NextResponse.json({ success: true, count });
    }

    const authError = await requireAdmin(request);
    if (authError) return authError;

    const notifications = await getAdminNotifications();
    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("GET notifications error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإشعارات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { action, notificationId } = await request.json();

    if (action === "mark_read" && notificationId) {
      await markNotificationRead(notificationId);
      return NextResponse.json({ success: true });
    }

    if (action === "mark_all_read") {
      await markAllNotificationsRead();
      return NextResponse.json({ success: true });
    }

    if (action === "clear") {
      await clearNotifications();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("POST notifications error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإشعارات" }, { status: 500 });
  }
}
