import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail, addUser, migrateAdminToUsers, getAppSettings, getPackageById } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";
import { validateText, validateEmail, validatePassword } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    await migrateAdminToUsers();

    const { name, email, password, verifyToken } = await request.json();

    // Validate inputs
    const nameVal = validateText(name, "الاسم", 100);
    if (!nameVal.valid) return NextResponse.json({ success: false, error: nameVal.error }, { status: 400 });
    const emailVal = validateEmail(email);
    if (!emailVal.valid) return NextResponse.json({ success: false, error: emailVal.error }, { status: 400 });
    const pwdVal = validatePassword(password);
    if (!pwdVal.valid) return NextResponse.json({ success: false, error: pwdVal.error }, { status: 400 });

    // ── OTP Verification: verifyToken must be valid ──
    if (!verifyToken) {
      return NextResponse.json({ success: false, error: "يجب التحقق من البريد الإلكتروني أولاً" }, { status: 403 });
    }

    const verifyKey = `otp_verified:register:${emailVal.sanitized}`;
    const storedToken = await kv.get<string>(verifyKey);

    if (!storedToken || String(storedToken) !== String(verifyToken)) {
      return NextResponse.json({ success: false, error: "رمز التحقق غير صالح أو انتهت صلاحيته. أعد المحاولة." }, { status: 403 });
    }

    // Delete the verify token (one-time use)
    await kv.del(verifyKey);

    // Check duplicate
    const existing = await getUserByEmail(emailVal.sanitized);
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
      name: nameVal.sanitized,
      email: emailVal.sanitized,
      passwordHash: password,
      role: "user",
      status: settings.autoApproveOnRegister ? "active" : "pending",
      mustChangePwd: false,
      hadFreeTrial: !!trialExpiry,
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
      body: `${nameVal.sanitized} — ${emailVal.sanitized}${trialPkgName ? ` | تجربة: ${trialPkgName}` : ""}`,
      tag: `new-user-${user.id}`,
      sound: 'new_signal',
      requireInteraction: true,
      urgency: 'high',
      data: { type: 'new_registration', userName: nameVal.sanitized, userEmail: emailVal.sanitized, userId: user.id },
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
