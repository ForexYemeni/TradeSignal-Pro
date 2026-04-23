import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getAdmin, setAdmin, getUserByEmail, migrateAdminToUsers, comparePassword, hashPassword, getUserById, updateUser, trackLoginAttempt, getLoginAttempts, resetLoginAttempts, getUserByDeviceId, getUsers } from "@/lib/store";
import { validateEmail, validatePassword, validateAction, validateUUID } from "@/lib/validation";
import { sendDuplicateAccountAlert } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "login") return handleLogin(body);
    if (action === "change-password") return handleChangePassword(body);

    const actionVal = validateAction(action, ["login", "change-password"]);
    if (!actionVal.valid) return NextResponse.json({ success: false, error: actionVal.error }, { status: 400 });
  } catch (error) {
    console.error("Admin API error:", error);
    return NextResponse.json({ success: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}

async function handleLogin(body: Record<string, unknown>) {
  const { email, password, verifyToken, deviceId } = body as { email: string; password: string; verifyToken?: string; deviceId?: string };

  // Validate inputs
  const emailVal = validateEmail(email);
  if (!emailVal.valid) return NextResponse.json({ success: false, error: emailVal.error }, { status: 400 });
  const pwdVal = validatePassword(password);
  if (!pwdVal.valid) return NextResponse.json({ success: false, error: pwdVal.error }, { status: 400 });

  // Ensure admin is migrated to users
  await migrateAdminToUsers();

  // ── OTP Verification ──
  // If user already verified their email before, skip OTP requirement.
  // emailVerified !== false means: true (verified) OR undefined (field doesn't exist yet
  // for legacy accounts → treat as verified since they were created before this feature).
  const existingUser = await getUserByEmail(emailVal.sanitized);
  if (existingUser && existingUser.emailVerified !== false) {
    // Skip OTP — user is already verified or is a legacy account (pre-OTP feature)
    // Also backfill the field for legacy accounts
    if (!existingUser.emailVerified) {
      await updateUser(existingUser.id, { emailVerified: true });
    }
  } else if (!verifyToken) {
    return NextResponse.json({ success: false, error: "يجب التحقق من البريد الإلكتروني أولاً", needOtp: true }, { status: 403 });
  } else {
    // Verify the token
    const verifyKey = `otp_verified:login:${emailVal.sanitized}`;
    let storedToken = await kv.get<string>(verifyKey);
    if (!storedToken) {
      const regKey = `otp_verified:register:${emailVal.sanitized}`;
      storedToken = await kv.get<string>(regKey);
      if (storedToken) await kv.del(regKey);
    }
    // Use String() to handle KV auto-deserialization (numbers vs strings)
    if (!storedToken || String(storedToken) !== String(verifyToken)) {
      return NextResponse.json({ success: false, error: "رمز التحقق غير صالح أو انتهت صلاحيته", needOtp: true }, { status: 403 });
    }
    await kv.del(verifyKey);
  }

  // Check if account is currently locked
  const attemptStatus = await getLoginAttempts(email);
  if (attemptStatus.locked) {
    const lockedUntil = attemptStatus.lockedUntil!;
    const remainingMs = new Date(lockedUntil).getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return NextResponse.json({
      success: false,
      error: "account_locked",
      locked: true,
      lockedUntil,
      retryAfterMinutes: remainingMin,
    }, { status: 423 });
  }

  // Use the user we already fetched above
  const user = existingUser;

  if (user) {
    // Check if user account has a status block
    if (user.status === "pending") {
      return NextResponse.json({ success: false, error: "حسابك قيد المراجعة. في انتظار موافقة الإدارة.", pending: true }, { status: 403 });
    }
    if (user.status === "blocked") {
      return NextResponse.json({ success: false, error: "حسابك محظور. تواصل مع الإدارة.", blocked: true }, { status: 403 });
    }

    const pwdResult = await comparePassword(password, user.passwordHash);
    if (!pwdResult.match) {
      // Track failed attempt
      const attempt = await trackLoginAttempt(email);
      return NextResponse.json({
        success: false,
        error: "wrong_password",
        attemptsLeft: attempt.attemptsLeft,
        maxAttempts: 5,
        locked: attempt.locked,
        lockedUntil: attempt.lockedUntil,
      }, { status: 401 });
    }

    // Auto-rehash legacy plaintext passwords on successful login
    if (pwdResult.needsRehash) {
      await updateUser(user.id, { passwordHash: await hashPassword(password) });
    }

    // Reset login attempts on success
    await resetLoginAttempts(email);

    // Mark email as verified after first OTP login (so OTP won't be required again)
    if (!user.emailVerified) {
      await updateUser(user.id, { emailVerified: true });
    }

    // ── Device ID Check: prevent multiple accounts from same device ──
    if (deviceId && deviceId.trim() && user.role === "user") {
      const existingDeviceUser = await getUserByDeviceId(deviceId.trim());

      if (existingDeviceUser && existingDeviceUser.id !== user.id) {
        // Another user already registered with this device → block both
        const now = new Date().toISOString();

        // Block the existing device user
        await updateUser(existingDeviceUser.id, {
          status: "blocked",
          subscriptionType: "none",
          subscriptionExpiry: null,
          packageId: null,
          packageName: null,
        });

        // Block the current user too
        await updateUser(user.id, {
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
            detectedAt: "login",
            user1: {
              name: existingDeviceUser.name,
              email: existingDeviceUser.email,
              createdAt: existingDeviceUser.createdAt,
              status: "blocked",
            },
            user2: {
              name: user.name,
              email: user.email,
              createdAt: user.createdAt,
              status: "blocked",
            },
            deviceId: deviceId.trim(),
          }).catch(err => console.error("[Duplicate Account Login] Failed to send alert email:", err));
        }

        console.log(`[Duplicate Account Login] Blocked both accounts. Device: ${deviceId.slice(0, 8)}... | Account 1: ${existingDeviceUser.email} | Account 2: ${user.email}`);

        return NextResponse.json({
          success: false,
          error: "تم حظرك بسبب وجود حساب آخر مسجل من نفس الجهاز. تم حظر جميع الحسابات المرتبطة بهذا الجهاز تلقائياً.",
          deviceBlocked: true,
        }, { status: 403 });
      }

      // First time this device logs in — save deviceId to user
      if (!user.deviceId && deviceId.trim()) {
        await updateUser(user.id, { deviceId: deviceId.trim() });
      }
    }

    // Check subscription expiry for regular users
    if (user.role === "user" && user.subscriptionType !== "none" && user.subscriptionExpiry) {
      const now = new Date().toISOString();
      if (user.subscriptionExpiry < now) {
        await updateUser(user.id, {
          subscriptionType: "none",
          subscriptionExpiry: null,
          packageId: null,
          packageName: null,
          status: "expired",
        });
        return NextResponse.json({ success: false, error: "انتهت مدة اشتراكك. يرجى التواصل مع الإدارة لتجديد الاشتراك.", expired: true }, { status: 403 });
      }
    }

    const response = NextResponse.json({
      success: true,
      admin: {
        id: user.id,
        email: user.email,
        name: user.name,
        mustChangePwd: user.mustChangePwd,
        role: user.role,
        status: user.status,
        subscriptionType: user.subscriptionType,
        subscriptionExpiry: user.subscriptionExpiry,
        packageName: user.packageName,
        packageId: user.packageId,
      },
      token: user.id,
    });
    response.cookies.set('fy_session', user.id, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 });
    return response;
  }

  // Fallback to legacy admin
  let admin = await getAdmin();
  if (!admin) {
    admin = {
      id: crypto.randomUUID(),
      email: "admin@forexyemeni.com",
      passwordHash: "admin123",
      name: "مدير النظام",
      mustChangePwd: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setAdmin(admin);
  }

  if (admin.email.toLowerCase() !== email.toLowerCase()) {
    // Email not found in users list and doesn't match legacy admin
    return NextResponse.json({
      success: false,
      error: "email_not_found",
      email: email,
    }, { status: 404 });
  }

  // Legacy admin found but wrong password
  const adminPwdResult = await comparePassword(password, admin.passwordHash);
  if (!adminPwdResult.match) {
    const attempt = await trackLoginAttempt(email);
    return NextResponse.json({
      success: false,
      error: "wrong_password",
      attemptsLeft: attempt.attemptsLeft,
      maxAttempts: 5,
      locked: attempt.locked,
      lockedUntil: attempt.lockedUntil,
    }, { status: 401 });
  }

  // Auto-rehash legacy plaintext admin password
  if (adminPwdResult.needsRehash) {
    await setAdmin({ ...admin, passwordHash: await hashPassword(password) });
  }

  // Reset login attempts on success
  await resetLoginAttempts(email);

  const response = NextResponse.json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      mustChangePwd: admin.mustChangePwd,
      role: "admin",
    },
    token: admin.id,
  });
  response.cookies.set('fy_session', admin.id, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 });
  return response;
}

async function handleChangePassword(body: Record<string, unknown>) {
  const { id, currentPassword, newEmail, newPassword } = body as {
    id: string; currentPassword: string; newEmail?: string; newPassword: string;
  };

  // Validate inputs
  const idVal = validateUUID(id);
  if (!idVal.valid) return NextResponse.json({ success: false, error: idVal.error }, { status: 400 });

  // newEmail is optional (only for admin)
  if (newEmail) {
    const emailVal = validateEmail(newEmail);
    if (!emailVal.valid) return NextResponse.json({ success: false, error: emailVal.error }, { status: 400 });
  }

  const curPwd = validatePassword(currentPassword);
  if (!curPwd.valid) return NextResponse.json({ success: false, error: curPwd.error }, { status: 400 });
  const newPwd = validatePassword(newPassword);
  if (!newPwd.valid) return NextResponse.json({ success: false, error: newPwd.error }, { status: 400 });

  const userById = await getUserById(id);
  const admin = await getAdmin();
  let valid = false;

  // Check against both user list and legacy admin
  if (admin && admin.id === id) {
    const pwdResult = await comparePassword(currentPassword, admin.passwordHash);
    if (pwdResult.match) valid = true;
  }
  if (userById) {
    const pwdResult2 = await comparePassword(currentPassword, userById.passwordHash);
    if (pwdResult2.match) valid = true;
  }

  if (!valid) {
    return NextResponse.json({ success: false, error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
  }

  // Hash the new password before storing
  const hashedNewPwd = await hashPassword(newPassword);

  if (admin && admin.id === id) {
    const updated = { ...admin, passwordHash: hashedNewPwd, email: newEmail || admin.email, mustChangePwd: false, updatedAt: new Date().toISOString() };
    await setAdmin(updated);
    return NextResponse.json({ success: true, admin: { id: updated.id, email: updated.email, name: updated.name, mustChangePwd: false } });
  }

  if (userById) {
    const updateFields: Record<string, unknown> = { passwordHash: hashedNewPwd, mustChangePwd: false };
    // Update email if it changed
    if (newEmail && newEmail.toLowerCase() !== userById.email.toLowerCase()) {
      updateFields.email = newEmail;
    }
    const updated = await updateUser(id, updateFields);
    if (!updated) return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    return NextResponse.json({ success: true, admin: { id: updated.id, email: updated.email, name: updated.name, mustChangePwd: false } });
  }

  return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
}

export async function GET() {
  try {
    const admin = await getAdmin();
    if (!admin) return NextResponse.json({ exists: false, mustChangePwd: false });
    return NextResponse.json({ exists: true, mustChangePwd: admin.mustChangePwd });
  } catch {
    return NextResponse.json({ exists: false, mustChangePwd: false });
  }
}
