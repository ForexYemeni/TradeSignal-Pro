import { NextRequest, NextResponse } from "next/server";
import { getAdmin, setAdmin, getUserByEmail, migrateAdminToUsers, comparePassword, hashPassword, getUserById, updateUser } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "login") return handleLogin(body);
    if (action === "change-password") return handleChangePassword(body);

    return NextResponse.json({ success: false, error: "Action not found" }, { status: 400 });
  } catch (error) {
    console.error("Admin API error:", error);
    return NextResponse.json({ success: false, error: "خطأ في الخادم" }, { status: 500 });
  }
}

async function handleLogin(body: Record<string, unknown>) {
  const { email, password } = body as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "البريد وكلمة المرور مطلوبان" }, { status: 400 });
  }

  // Ensure admin is migrated to users
  await migrateAdminToUsers();

  // Try to find user in users list
  const user = await getUserByEmail(email);

  if (user) {
    const pwdResult = await comparePassword(password, user.passwordHash);
    if (!pwdResult.match) {
      return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }
    // Auto-rehash legacy plaintext passwords on successful login
    if (pwdResult.needsRehash) {
      const { updateUser: upUser } = await import("@/lib/store");
      await upUser(user.id, { passwordHash: await hashPassword(password) });
    }

    if (user.status === "pending") {
      return NextResponse.json({ success: false, error: "حسابك قيد المراجعة. في انتظار موافقة الإدارة.", pending: true }, { status: 403 });
    }

    if (user.status === "blocked") {
      return NextResponse.json({ success: false, error: "حسابك محظور. تواصل مع الإدارة.", blocked: true }, { status: 403 });
    }

    // Check subscription expiry for regular users
    if (user.role === "user" && user.subscriptionType !== "none" && user.subscriptionExpiry) {
      const now = new Date().toISOString();
      if (user.subscriptionExpiry < now) {
        const { updateUser } = await import("@/lib/store");
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
    // Set session cookie so browser sends it automatically with API calls
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

  if (admin.email !== email) {
    return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  const adminPwdResult = await comparePassword(password, admin.passwordHash);
  if (!adminPwdResult.match) {
    return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  // Auto-rehash legacy plaintext admin password
  if (adminPwdResult.needsRehash) {
    await setAdmin({ ...admin, passwordHash: await hashPassword(password) });
  }

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
  // Set session cookie so browser sends it automatically with API calls
  response.cookies.set('fy_session', admin.id, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 });
  return response;
}

async function handleChangePassword(body: Record<string, unknown>) {
  const { id, currentPassword, newEmail, newPassword } = body as {
    id: string; currentPassword: string; newEmail: string; newPassword: string;
  };

  if (!id || !currentPassword || !newEmail || !newPassword) {
    return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
  }

  const user = await getUserByEmail(newEmail || (await getUserById(id))?.email || "");
  const admin = await getAdmin();

  // Check against both user list and legacy admin
  if (admin && admin.id === id) {
    const pwdResult = await comparePassword(currentPassword, admin.passwordHash);
    if (pwdResult.match) valid = true;
  }
  const userById = await getUserById(id);
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
    const updated = { ...admin, passwordHash: hashedNewPwd, mustChangePwd: false, updatedAt: new Date().toISOString() };
    await setAdmin(updated);
    return NextResponse.json({ success: true, admin: { id: updated.id, email: updated.email, name: updated.name, mustChangePwd: false } });
  }

  if (userById) {
    const updated = await updateUser(id, { passwordHash: hashedNewPwd, mustChangePwd: false });
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
