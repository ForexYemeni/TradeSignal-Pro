import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, deleteUser, getUserById, getPackageById, enforceSubscriptions } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";

export async function GET() {
  try {
    await enforceSubscriptions();
    const users = await getUsers();
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب المستخدمين" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, action, packageId, days, subscriptionType } = await request.json();

    if (!id || !action) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    let updates: Record<string, unknown> = {};

    switch (action) {
      case "approve":
        updates = { status: "active" };
        break;
      case "block":
        updates = { status: "blocked", subscriptionType: "none", subscriptionExpiry: null, packageId: null, packageName: null };
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
      case "assign_package": {
        if (!packageId) return NextResponse.json({ success: false, error: "معرف الباقة مطلوب" }, { status: 400 });
        const pkg = await getPackageById(packageId);
        if (!pkg) return NextResponse.json({ success: false, error: "الباقة غير موجودة" }, { status: 404 });
        const duration = days ?? pkg.durationDays;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + duration);
        updates = {
          status: "active",
          subscriptionType: "subscriber",
          subscriptionExpiry: expiry.toISOString(),
          packageId: pkg.id,
          packageName: pkg.name,
        };
        break;
      }
      case "set_agency": {
        updates = {
          subscriptionType: "agency",
          status: "active",
          subscriptionExpiry: null,
          packageId: null,
          packageName: "مسجل تحت وكالة",
        };
        break;
      }
      case "set_subscriber":
        updates = { subscriptionType: "subscriber" };
        break;
      case "remove_subscription":
        updates = { subscriptionType: "none", subscriptionExpiry: null, packageId: null, packageName: null, status: "expired" };
        break;
      default:
        return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
    }

    const user = await updateUser(id, updates);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // ── Notify admins about important actions ──
    if (action === "approve") {
      sendPushToAdmins({ title: "✅ تم قبول مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'tp_hit' }).catch(() => {});
    } else if (action === "block") {
      sendPushToAdmins({ title: "🚫 تم حظر مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, status: user.status,
        subscriptionType: user.subscriptionType,
        subscriptionExpiry: user.subscriptionExpiry,
        packageId: user.packageId,
        packageName: user.packageName,
      },
    });
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
    const user = await getUserById(id);
    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }
    if (user) {
      sendPushToAdmins({ title: "🗑 تم حذف مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف المستخدم" }, { status: 500 });
  }
}
