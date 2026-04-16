import { NextRequest, NextResponse } from "next/server";
import { getAdmin, setAdmin, getUserByEmail, migrateAdminToUsers } from "@/lib/store";

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
    if (user.passwordHash !== password) {
      return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    if (user.status === "pending") {
      return NextResponse.json({ success: false, error: "حسابك قيد المراجعة. في انتظار موافقة الإدارة.", pending: true }, { status: 403 });
    }

    if (user.status === "blocked") {
      return NextResponse.json({ success: false, error: "حسابك محظور. تواصل مع الإدارة.", blocked: true }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: user.id,
        email: user.email,
        name: user.name,
        mustChangePwd: user.mustChangePwd,
        role: user.role,
      },
      token: user.id,
    });
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

  if (admin.email !== email || admin.passwordHash !== password) {
    return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  return NextResponse.json({
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
}

async function handleChangePassword(body: Record<string, unknown>) {
  const { id, currentPassword, newEmail, newPassword } = body as {
    id: string; currentPassword: string; newEmail: string; newPassword: string;
  };

  if (!id || !currentPassword || !newEmail || !newPassword) {
    return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
  }

  const user = await getUserByEmail((await import("@/lib/store")).getUserById(id).then(u => u?.email || newEmail));
  const admin = await getAdmin();

  // Check against both user list and legacy admin
  let valid = false;
  if (admin && admin.id === id && admin.passwordHash === currentPassword) valid = true;
  const userById = await (await import("@/lib/store")).getUserById(id);
  if (userById && userById.passwordHash === currentPassword) valid = true;

  if (!valid) {
    return NextResponse.json({ success: false, error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
  }

  if (admin && admin.id === id) {
    const updated = { ...admin, email: newEmail, passwordHash: newPassword, mustChangePwd: false, updatedAt: new Date().toISOString() };
    await setAdmin(updated);
    return NextResponse.json({ success: true, admin: { id: updated.id, email: updated.email, name: updated.name, mustChangePwd: false } });
  }

  if (userById) {
    const { updateUser } = await import("@/lib/store");
    const updated = await updateUser(id, { email: newEmail, passwordHash: newPassword, mustChangePwd: false });
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
