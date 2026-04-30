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
      link: link?.trim() || undefined,
      linkText: linkText?.trim() || undefined,
      createdBy,
      expiresAt: expiresAt || undefined,
    });

    // Determine target users based on targeting option
    let targetUserIds: string[] = [];
    const allUsers = await getUsers();

    if (target === "specific" && targetUserId) {
      targetUserIds = [targetUserId];
    } else if (target === "active") {
      // Only users with active subscription (status=active + has packageId)
      targetUserIds = allUsers
        .filter(u => u.role !== "admin" && u.status === "active" && u.packageId)
        .map(u => u.id);
    } else if (target === "expired") {
      // Users whose subscription has expired
      targetUserIds = allUsers
        .filter(u => u.role !== "admin" && u.status === "expired")
        .map(u => u.id);
    } else if (target === "blocked") {
      // Blocked users only
      targetUserIds = allUsers
        .filter(u => u.role !== "admin" && u.status === "blocked")
        .map(u => u.id);
    } else {
      // "all" — all users regardless of subscription status (except admin)
      targetUserIds = allUsers
        .filter(u => u.role !== "admin")
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
        } else if (target === "all") {
          // Only use sendPushToAll for "all" target
          await sendPushToAll(pushPayload);
        } else {
          // Targeted group (active/expired/blocked) — send to each user individually
          let pushSent = 0;
          for (const uid of targetUserIds) {
            const sent = await sendPushToUser(uid, pushPayload).catch(() => false);
            if (sent) pushSent++;
          }
          console.log(`[Announcements POST] Push sent to ${pushSent}/${targetUserIds.length} targeted users (target: ${target})`);
        }
      } catch (pushError) {
        console.error("[Announcements POST] Push error:", pushError);
      }
    }

    // Send email broadcast
    if (sendEmail) {
      try {
        const emailRecipients = target === "specific" && targetUserId
          ? (() => {
              const user = allUsers.find(u => u.id === targetUserId);
              return user && user.email ? [user.email] : [];
            })()
          : targetUserIds
              .map(uid => allUsers.find(u => u.id === uid))
              .filter((u): u is NonNullable<typeof u> => !!u && !!u.email)
              .map(u => u.email);

        // Log skipped users (no email in record)
        const usersWithoutEmail = targetUserIds.filter(uid => {
          const u = allUsers.find(x => x.id === uid);
          return !u || !u.email;
        });
        if (usersWithoutEmail.length > 0) {
          console.warn(`[Announcements POST] ${usersWithoutEmail.length} users skipped (no email): ${usersWithoutEmail.map(uid => allUsers.find(x => x.id === uid)?.name || uid).join(', ')}`);
        }

        if (emailRecipients.length > 0) {
          await broadcastAnnouncementEmail(
            { title, message, type: type || "info", priority: priority || "medium", link: link || undefined, linkText: linkText || undefined },
            emailRecipients
          );
          console.log(`[Announcements POST] Email sent to ${emailRecipients.length}/${targetUserIds.length} users (target: ${target})`);
        } else {
          console.warn(`[Announcements POST] No email recipients (target: ${target}, total targeted: ${targetUserIds.length})`);
        }
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
