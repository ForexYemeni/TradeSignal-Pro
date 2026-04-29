import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSessionUserId } from "@/lib/admin-auth";
import { getAnnouncements, addAnnouncement, deleteAnnouncement, addNotificationForUsers, getUsers, getUserById } from "@/lib/store";
import { sendPushToAll, sendPushToUser } from "@/lib/push";
import { broadcastAnnouncementEmail } from "@/lib/email";
import { incrementGlobalVersion, setUserUpdateFlag } from "@/lib/store";

/**
 * GET /api/announcements
 * - List all announcements (admin only)
 * - ?action=count → return total count
 */
export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("action") === "count") {
      const announcements = await getAnnouncements();
      return NextResponse.json({ success: true, count: announcements.length });
    }

    const announcements = await getAnnouncements();
    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error("[Announcements GET] Error:", error);
    return NextResponse.json({ success: false, error: "فشل في جلب الإعلانات" }, { status: 500 });
  }
}

/**
 * POST /api/announcements
 * - Create new announcement (admin only)
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { title, message, type, priority, target, targetUserId, targetUserName, sendPush, sendEmail, expiresAt, link, linkText } = body;

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ success: false, error: "العنوان والرسالة مطلوبان" }, { status: 400 });
    }

    // Get admin user info
    const userId = getSessionUserId(request);
    const createdBy = userId || "admin";

    const announcement = await addAnnouncement({
      title: title.trim(),
      message: message.trim(),
      type: type || "info",
      priority: priority || "medium",
      target: target || "all",
      targetUserId: targetUserId || undefined,
      targetUserName: targetUserName || undefined,
      sendPush: !!sendPush,
      sendEmail: !!sendEmail,
      createdBy,
      expiresAt: expiresAt || undefined,
    });

    // Determine target users
    let targetUserIds: string[] = [];
    if (target === "specific" && targetUserId) {
      targetUserIds = [targetUserId];
    } else {
      // All active subscribers (not admin, not blocked, not pending)
      const allUsers = await getUsers();
      targetUserIds = allUsers
        .filter(u => u.role !== "admin" && u.status === "active")
        .map(u => u.id);
    }

    // Create user notifications for target users
    await addNotificationForUsers(announcement, targetUserIds);

    // Send push notifications
    if (sendPush) {
      try {
        const typeEmoji: Record<string, string> = {
          info: "ℹ️", warning: "⚠️", urgent: "🔴", maintenance: "🔧", promo: "🎁",
        };
        const pushTitle = `${typeEmoji[type] || "📢"} ${title}`;
        const pushPayload = {
          title: pushTitle,
          body: message.substring(0, 120) + (message.length > 120 ? "..." : ""),
          tag: `fy-announcement-${announcement.id}`,
          data: { type: "announcement", announcementId: announcement.id },
          urgency: priority === "high" ? "high" as const : priority === "urgent" ? "critical" as const : "normal" as const,
        };

        if (target === "specific" && targetUserId) {
          await sendPushToUser(targetUserId, pushPayload);
        } else {
          await sendPushToAll(pushPayload);
        }
      } catch (pushError) {
        console.error("[Announcements POST] Push error:", pushError);
      }
    }

    // Send email broadcast
    if (sendEmail) {
      try {
        const allUsers = await getUsers();
        const emailRecipients = target === "specific" && targetUserId
          ? (() => {
              const user = allUsers.find(u => u.id === targetUserId);
              return user ? [user.email] : [];
            })()
          : allUsers
              .filter(u => u.role !== "admin" && u.status === "active" && u.email)
              .map(u => u.email);

        await broadcastAnnouncementEmail(
          { title, message, type: type || "info", priority: priority || "medium", link: link || undefined, linkText: linkText || undefined },
          emailRecipients
        );
      } catch (emailError) {
        console.error("[Announcements POST] Email error:", emailError);
      }
    }

    // Set user update flags
    for (const uid of targetUserIds) {
      await setUserUpdateFlag(uid, "announcement", { announcementId: announcement.id });
    }

    // Increment global version
    await incrementGlobalVersion("announcements");

    return NextResponse.json({ success: true, announcement });
  } catch (error) {
    console.error("[Announcements POST] Error:", error);
    return NextResponse.json({ success: false, error: "فشل في إنشاء الإعلان" }, { status: 500 });
  }
}

/**
 * DELETE /api/announcements
 * - Delete announcement (admin only)
 */
export async function DELETE(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "معرف الإعلان مطلوب" }, { status: 400 });
    }

    const deleted = await deleteAnnouncement(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "الإعلان غير موجود" }, { status: 404 });
    }

    await incrementGlobalVersion("announcements");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Announcements DELETE] Error:", error);
    return NextResponse.json({ success: false, error: "فشل في حذف الإعلان" }, { status: 500 });
  }
}
