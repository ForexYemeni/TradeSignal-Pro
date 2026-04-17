import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, addUser, migrateAdminToUsers, getAppSettings, getPackageById } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    await migrateAdminToUsers();

    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ success: false, error: "كلمة المرور يجب أن تكون 4 أحرف على الأقل" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "البريد الإلكتروني غير صالح" }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ success: false, error: "هذا البريد مسجل مسبقا" }, { status: 409 });
    }

    // ── Get app settings for auto-trial ──
    const settings = await getAppSettings();
    let trialExpiry: string | null = null;
    let trialPkgId: string | null = null;
    let trialPkgName: string | null = null;

    if (settings.freeTrialPackageId) {
      const trialPkg = await getPackageById(settings.freeTrialPackageId);
      if (trialPkg && trialPkg.isActive) {
        trialPkgId = trialPkg.id;
        trialPkgName = trialPkg.name;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + trialPkg.durationDays);
        trialExpiry = expiry.toISOString();
      }
    }

    const user = await addUser({
      id: crypto.randomUUID(),
      name,
      email: email.toLowerCase(),
      passwordHash: password,
      role: "user",
      status: settings.autoApproveOnRegister ? "active" : "pending",
      mustChangePwd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subscriptionType: trialExpiry ? "subscriber" : "none",
      subscriptionExpiry: trialExpiry,
      packageId: trialPkgId,
      packageName: trialPkgName,
    });

    // ── Notify admins about new registration ──
    sendPushToAdmins({
      title: `👤 مستخدم جديد${settings.autoApproveOnRegister ? " (تم التفعيل)" : " بانتظار الموافقة"}`,
      body: `${name} — ${email.toLowerCase()}${trialPkgName ? ` | تجربة: ${trialPkgName}` : ""}`,
      tag: `new-user-${user.id}`,
      sound: 'new_signal',
      requireInteraction: true,
      urgency: 'high',
      data: { type: 'new_registration', userName: name, userEmail: email.toLowerCase(), userId: user.id },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: settings.autoApproveOnRegister
        ? `تم إنشاء الحساب وتفعيل الباقة ${trialPkgName || ""} بنجاح!`
        : "تم إنشاء الحساب بنجاح. في انتظار موافقة الإدارة.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        subscriptionType: user.subscriptionType,
        subscriptionExpiry: user.subscriptionExpiry,
        packageName: user.packageName,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء الحساب" }, { status: 500 });
  }
}
