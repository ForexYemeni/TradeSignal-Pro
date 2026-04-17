import { NextRequest, NextResponse } from "next/server";
import { addPushSubscription, removePushSubscription, getUserById } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, keys, userId } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth || !userId) {
      return NextResponse.json({ success: false, error: "بيانات الاشتراك غير مكتملة" }, { status: 400 });
    }

    // Validate that userId corresponds to a real user
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "معرف المستخدم غير صالح" }, { status: 403 });
    }

    await addPushSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userId,
      userAgent: request.headers.get("user-agent") || "unknown",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: "تم تسجيل الإشعارات بنجاح" });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ success: false, error: "فشل تسجيل الإشعارات" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ success: false, error: "endpoint مطلوب" }, { status: 400 });
    }

    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true, message: "تم إلغاء الاشتراك" });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json({ success: false, error: "فشل إلغاء الاشتراك" }, { status: 500 });
  }
}
