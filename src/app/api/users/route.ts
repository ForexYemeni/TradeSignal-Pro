import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, deleteUser, getUserById, getPackageById, getAppSettings, enforceSubscriptions } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";

const SUPER_ADMIN_EMAIL = "admin@forexyemeni.com";

async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return !!user && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export async function GET() {
  try {
    await enforceSubscriptions();
    const users = await getUsers();
    // Hide system admin from users list — only show regular users and promoted admins
    const visible = users.filter(u => u.email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase());
    return NextResponse.json({ success: true, users: visible });
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

    // Protect super admin from being demoted, blocked, or removed
    if (await isSuperAdmin(id)) {
      if (action === "remove_admin" || action === "block") {
        return NextResponse.json({ success: false, error: "لا يمكن تعديل صلاحيات المدير الأعلى" }, { status: 403 });
      }
    }

    let updates: Record<string, unknown> = {};
    let warning: string | null = null;

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

        // ── Free trial protection ──
        const settings = await getAppSettings();
        const isFreeTrialPkg = settings.freeTrialPackageId === packageId;
        if (isFreeTrialPkg) {
          const user = await getUserById(id);
          if (user && user.hadFreeTrial) {
            return NextResponse.json({
              success: false,
              error: "هذا المستخدم سبق له الاستفادة من الخطة المجانية. لا يمكن تفعيلها مرة أخرى.",
              hadFreeTrial: true,
            }, { status: 403 });
          }
          updates.hadFreeTrial = true;
        }

        const duration = days ?? pkg.durationDays;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + duration);
        updates = {
          ...updates,
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
      sendPushToAdmins({ title: "تم قبول مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'tp_hit' }).catch(() => {});
    } else if (action === "block") {
      sendPushToAdmins({ title: "تم حظر مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    } else if (action === "make_admin") {
      sendPushToAdmins({ title: "تم ترقية مستخدم لمدير", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'tp_hit' }).catch(() => {});
    } else if (action === "remove_admin") {
      sendPushToAdmins({ title: "تم إزالة صلاحية مدير", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      warning,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, status: user.status,
        subscriptionType: user.subscriptionType,
        subscriptionExpiry: user.subscriptionExpiry,
        packageId: user.packageId,
        packageName: user.packageName,
        hadFreeTrial: user.hadFreeTrial,
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
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }
    // Protect super admin from deletion
    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ success: false, error: "لا يمكن حذف المدير الأعلى" }, { status: 403 });
    }
    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }
    if (user) {
      sendPushToAdmins({ title: "تم حذف مستخدم", body: `${user.name} — ${user.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف المستخدم" }, { status: 500 });
  }
}
