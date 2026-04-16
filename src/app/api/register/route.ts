import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, addUser, migrateAdminToUsers } from "@/lib/store";

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

    const user = await addUser({
      id: crypto.randomUUID(),
      name,
      email: email.toLowerCase(),
      passwordHash: password,
      role: "user",
      status: "pending",
      mustChangePwd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "تم إنشاء الحساب بنجاح. في انتظار موافقة الإدارة.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء الحساب" }, { status: 500 });
  }
}
