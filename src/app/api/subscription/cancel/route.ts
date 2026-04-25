import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUser } from "@/lib/store";

/**
 * POST /api/subscription/cancel
 * - User cancels their own active subscription
 *
 * Body: { userId }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: "معرف المستخدم مطلوب" }, { status: 400 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (user.role === "admin") {
      return NextResponse.json({ success: false, error: "المدير لا يمكنه إلغاء اشتراكه" }, { status: 403 });
    }

    if (user.subscriptionType === "none" || !user.subscriptionExpiry) {
      return NextResponse.json({ success: false, error: "لا يوجد اشتراك نشط للإلغاء" }, { status: 400 });
    }

    const updated = await updateUser(userId, {
      subscriptionType: "none",
      subscriptionExpiry: null,
      packageId: null,
      packageName: null,
      status: "expired",
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: "فشل تحديث بيانات المستخدم" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "تم إلغاء الاشتراك بنجاح",
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        subscriptionType: updated.subscriptionType,
        packageId: updated.packageId,
        packageName: updated.packageName,
      },
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إلغاء الاشتراك" }, { status: 500 });
  }
}
