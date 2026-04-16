import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, deleteUser, getUserById } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب المستخدمين" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, action } = await request.json();

    if (!id || !action) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    let updates: Record<string, unknown> = {};

    switch (action) {
      case "approve":
        updates = { status: "active" };
        break;
      case "block":
        updates = { status: "blocked" };
        break;
      case "unblock":
        updates = { status: "active" };
        break;
      case "make_admin":
        updates = { role: "admin", status: "active" };
        break;
      case "remove_admin":
        updates = { role: "user" };
        break;
      default:
        return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
    }

    const user = await updateUser(id, updates);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // ── Notify admins about user status change ──
    if (action === "approve") {
      sendPushToAdmins({
        title: `✅ تم قبول مستخدم`,
        body: `${user.name} — ${user.email}`,
        tag: `user-approved-${id}`,
        sound: 'tp_hit',
        requireInteraction: false,
        urgency: 'normal',
        data: { type: 'user_approved', userName: user.name },
      }).catch(() => {});
    } else if (action === "block") {
      sendPushToAdmins({
        title: `🚫 تم حظر مستخدم`,
        body: `${user.name} — ${user.email}`,
        tag: `user-blocked-${id}`,
        sound: 'sl_hit',
        requireInteraction: false,
        urgency: 'normal',
        data: { type: 'user_blocked', userName: user.name },
      }).catch(() => {});
    } else if (action === "make_admin") {
      sendPushToAdmins({
        title: `👑 تم ترقية مستخدم لأدمن`,
        body: `${user.name} — ${user.email}`,
        tag: `user-admin-${id}`,
        sound: 'tp_hit',
        requireInteraction: false,
        urgency: 'normal',
        data: { type: 'user_made_admin', userName: user.name },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث المستخدم" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "معرف المستخدم مطلوب" }, { status: 400 });
    }

    // Get user info before deleting for notification
    const user = await getUserById(id);
    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Notify admins
    if (user) {
      sendPushToAdmins({
        title: `🗑 تم حذف مستخدم`,
        body: `${user.name} — ${user.email}`,
        tag: `user-deleted-${id}`,
        sound: 'sl_hit',
        requireInteraction: false,
        urgency: 'normal',
        data: { type: 'user_deleted', userName: user.name },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف المستخدم" }, { status: 500 });
  }
}
