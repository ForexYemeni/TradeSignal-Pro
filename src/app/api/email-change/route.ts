import { NextRequest, NextResponse } from "next/server";
import { getUserById, getUserByEmail, addEmailChangeRequest, getEmailChangeRequests, updateEmailChangeRequest, updateUser } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const { userId, newEmail } = await request.json();

    if (!userId || !newEmail) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ success: false, error: "البريد الإلكتروني الجديد غير صالح" }, { status: 400 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      return NextResponse.json({ success: false, error: "البريد الجديد نفس البريد الحالي" }, { status: 400 });
    }

    const existing = await getUserByEmail(newEmail);
    if (existing) {
      return NextResponse.json({ success: false, error: "هذا البريد مسجل مسبقا" }, { status: 409 });
    }

    const req = await addEmailChangeRequest({
      id: crypto.randomUUID(),
      userId,
      userName: user.name,
      oldEmail: user.email,
      newEmail: newEmail.toLowerCase(),
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "تم إرسال طلب تغيير البريد. في انتظار موافقة الإدارة.",
      requestId: req.id,
    });
  } catch (error) {
    console.error("Email change request error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إرسال الطلب" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const requests = await getEmailChangeRequests();
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("Get email requests error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الطلبات" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, action } = await request.json();

    if (!id || !action) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    const requests = await getEmailChangeRequests();
    const req = requests.find(r => r.id === id && r.status === "pending");
    if (!req) {
      return NextResponse.json({ success: false, error: "الطلب غير موجود أو تم معالجته" }, { status: 404 });
    }

    if (action === "approve") {
      const user = await getUserById(req.userId);
      if (user) {
        await updateUser(user.id, { email: req.newEmail });
      }
      await updateEmailChangeRequest(id, { status: "approved" });
      return NextResponse.json({ success: true, message: "تم قبول تغيير البريد بنجاح" });
    }

    if (action === "reject") {
      await updateEmailChangeRequest(id, { status: "rejected" });
      return NextResponse.json({ success: true, message: "تم رفض طلب تغيير البريد" });
    }

    return NextResponse.json({ success: false, error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("Update email request error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الطلب" }, { status: 500 });
  }
}
