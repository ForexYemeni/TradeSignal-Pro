import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail, getUserByDeviceId, addUser, updateUser, migrateAdminToUsers, getAppSettings, getPackageById, getUsers } from "@/lib/store";
import { sendPushToAdmins } from "@/lib/push";
import { validateText, validateEmail, validatePassword } from "@/lib/validation";
import { sendDuplicateAccountAlert } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    await migrateAdminToUsers();

    const { name, email, password, verifyToken, deviceId } = await request.json();

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

    // Check duplicate email
    const existing = await getUserByEmail(emailVal.sanitized);
    if (existing) {
      return NextResponse.json({ success: false, error: "هذا البريد مسجل مسبقا" }, { status: 409 });
    }

    // ── Device ID Check: prevent multiple accounts from same device ──
    if (deviceId && deviceId.trim()) {
      const existingDeviceUser = await getUserByDeviceId(deviceId.trim());
      if (existingDeviceUser) {
        // Found another account with the same device ID → block both
        const now = new Date().toISOString();

        // Block the existing account
        await updateUser(existingDeviceUser.id, {
          status: "blocked",
          subscriptionType: "none",
          subscriptionExpiry: null,
          packageId: null,
          packageName: null,
        });

        // Send email alert to admin
        const users = await getUsers();
        const adminUser = users.find(u => u.role === "admin");

        if (adminUser) {
          sendDuplicateAccountAlert(adminUser.email, {
            detectedAt: "register",
            user1: {
              name: existingDeviceUser.name,
              email: existingDeviceUser.email,
              createdAt: existingDeviceUser.createdAt,
              status: "blocked",
            },
            user2: {
              name: nameVal.sanitized,
              email: emailVal.sanitized,
              createdAt: now,
              status: "blocked",
            },
            deviceId: deviceId.trim(),
          }).catch(err => console.error("[Duplicate Account] Failed to send alert email:", err));
        }

        // Push notification to admin
        sendPushToAdmins({
          title: "🚨 حسابان من نفس الجهاز — تم الحظر",
          body: `محاولة تسجيل جديد: ${emailVal.sanitized} | الحساب القديم: ${existingDeviceUser.email}`,
          tag: `duplicate-device-${deviceId.slice(0, 8)}`,
          sound: 'new_signal',
          requireInteraction: true,
          urgency: 'high',
        }).catch(() => {});

        console.log(`[Duplicate Account] Blocked both accounts. Device: ${deviceId.slice(0, 8)}... | Existing: ${existingDeviceUser.email} | New attempt: ${emailVal.sanitized}`);

        return NextResponse.json({
          success: false,
          error: "تم حظرك بسبب محاولة إنشاء حساب ثانٍ من نفس الجهاز. تم حظر جميع الحسابات المرتبطة بهذا الجهاز تلقائياً.",
          deviceBlocked: true,
        }, { status: 403 });
      }
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
      emailVerified: true,
      hadFreeTrial: !!trialExpiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subscriptionType: trialExpiry ? "subscriber" : "none",
      subscriptionExpiry: trialExpiry,
      packageId: trialPkgId,
      packageName: trialPkgName,
      deviceId: deviceId?.trim() || null,
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
