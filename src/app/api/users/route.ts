import { NextRequest, NextResponse } from "next/server";
import { getUsers, updateUser, deleteUser, getUserById, getPackageById, getAppSettings, enforceSubscriptions, getAdmin, setUserUpdateFlag } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Get the real super admin ID from the admin KV record.
 * The ID never changes even if the email is updated.
 */
async function getSuperAdminId(): Promise<string | null> {
  const admin = await getAdmin();
  return admin?.id || null;
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const superId = await getSuperAdminId();
  if (!superId) return false;
  return userId === superId;
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    await enforceSubscriptions();
    const users = await getUsers();
    // Hide the system admin from users list — identify by ID (never changes, unlike email)
    const superId = await getSuperAdminId();
    const visible = superId
      ? users.filter(u => u.id !== superId)
      : users;
    return NextResponse.json({ success: true, users: visible });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب المستخدمين" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

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

        // ── Check if same package is already active and not expired ──
        const existingUser = await getUserById(id);
        if (existingUser?.packageId === packageId && existingUser?.subscriptionExpiry) {
          const expiryDate = new Date(existingUser.subscriptionExpiry);
          if (expiryDate > new Date()) {
            const remainingDays = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
            return NextResponse.json({
              success: false,
              alreadyActive: true,
              error: `هذه الباقة مفعلة بالفعل لهذا المستخدم ولم تنتهِ بعد. متبقي ${remainingDays} يوم على الانتهاء.`,
              packageName: existingUser.packageName,
              subscriptionExpiry: existingUser.subscriptionExpiry,
              remainingDays,
            }, { status: 409 });
          }
        }

        // ── Free trial protection ──
        const settings = await getAppSettings();
        const isFreeTrialPkg = settings.freeTrialPackageId === packageId;
        if (isFreeTrialPkg) {
          if (existingUser && existingUser.hadFreeTrial) {
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
      case "extend_days": {
        const parsedDays = Number(days);
        if (!parsedDays || parsedDays < 1 || parsedDays > 3650) {
          return NextResponse.json({ success: false, error: "عدد الأيام غير صالح (1-3650)" }, { status: 400 });
        }
        const existingUser = await getUserById(id);
        if (!existingUser) return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
        if (!existingUser.subscriptionExpiry || new Date(existingUser.subscriptionExpiry) <= new Date()) {
          return NextResponse.json({ success: false, error: "لا يوجد اشتراك نشط لهذا المستخدم. قم بتعيين باقة أولاً." }, { status: 400 });
        }
        const currentExpiry = new Date(existingUser.subscriptionExpiry);
        currentExpiry.setDate(currentExpiry.getDate() + parsedDays);
        updates = {
          subscriptionExpiry: currentExpiry.toISOString(),
          status: "active",
        };
        break;
      }
      case "reset_trial":
        updates = { hadFreeTrial: false };
        break;
      default:
        return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
    }

    const user = await updateUser(id, updates);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // ── Real-time: notify affected user to refresh immediately ──
    setUserUpdateFlag(id, action, { action }).catch(() => {});

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
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "معرف المستخدم مطلوب" }, { status: 400 });
    }
    // Protect super admin from deletion — check by ID not email
    if (await isSuperAdmin(id)) {
      return NextResponse.json({ success: false, error: "لا يمكن حذف المدير الأعلى" }, { status: 403 });
    }
    // Fetch user info before deletion for notification
    const userToDelete = await getUserById(id);
    const deleted = await deleteUser(id); // deleteUser already sets force_logout flag
    if (!deleted) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }
    if (userToDelete) {
      sendPushToAdmins({ title: "تم حذف مستخدم", body: `${userToDelete.name} — ${userToDelete.email}`, tag: `user-${id}`, sound: 'sl_hit' }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف المستخدم" }, { status: 500 });
  }
}
