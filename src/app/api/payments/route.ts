import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequests, getPaymentRequestsByUser, getPendingPaymentRequests, addPaymentRequest, updatePaymentRequest } from "@/lib/store";
import { getPackageById, getUserById, updateUser, getAppSettings } from "@/lib/store";

/**
 * GET /api/payments?userId=xxx&pending=true
 * - List payment requests (admin: all, user: own)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const pendingOnly = searchParams.get("pending") === "true";

    if (userId) {
      const requests = await getPaymentRequestsByUser(userId);
      return NextResponse.json({ success: true, requests });
    }

    if (pendingOnly) {
      const requests = await getPendingPaymentRequests();
      return NextResponse.json({ success: true, requests });
    }

    const requests = await getPaymentRequests();
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("GET payments error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الطلبات" }, { status: 500 });
  }
}

/**
 * POST /api/payments
 * - Create a new payment request (subscription purchase)
 *
 * Body: { userId, packageId, paymentMethod, txId?, localAmount? }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, packageId, paymentMethod, txId, localAmount } = await request.json();

    if (!userId || !packageId || !paymentMethod) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (!["usdt", "local"].includes(paymentMethod)) {
      return NextResponse.json({ success: false, error: "طريقة الدفع غير صالحة" }, { status: 400 });
    }

    // Get user
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Get package
    const pkg = await getPackageById(packageId);
    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ success: false, error: "الباقة غير موجودة أو غير مفعلة" }, { status: 404 });
    }

    // Validate method-specific fields
    if (paymentMethod === "usdt" && !txId) {
      return NextResponse.json({ success: false, error: "معرف المعاملة (TXID) مطلوب للدفع عبر USDT" }, { status: 400 });
    }

    if (paymentMethod === "local") {
      if (!localAmount || localAmount <= 0) {
        return NextResponse.json({ success: false, error: "المبلغ مطلوب للدفع بالعملة المحلية" }, { status: 400 });
      }
    }

    // Check for existing pending request for same user + package
    const existingRequests = await getPaymentRequestsByUser(userId);
    const existingPending = existingRequests.find(
      r => r.status === "pending" && r.packageId === packageId && r.paymentMethod === paymentMethod
    );
    if (existingPending) {
      return NextResponse.json({ success: false, error: "لديك طلب معلق لنفس الباقة وطريقة الدفع. انتظر المراجعة." }, { status: 409 });
    }

    const paymentRequest = await addPaymentRequest({
      id: crypto.randomUUID(),
      userId,
      userName: user.name,
      userEmail: user.email,
      packageId,
      packageName: pkg.name,
      packagePrice: pkg.price,
      paymentMethod,
      status: paymentMethod === "usdt" ? "approved" : "pending",
      txId: txId || undefined,
      localAmount: localAmount || undefined,
      createdAt: new Date().toISOString(),
    });

    // For USDT: auto-activate subscription immediately
    if (paymentMethod === "usdt") {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + pkg.durationDays);
      await updateUser(userId, {
        subscriptionType: "subscriber",
        subscriptionExpiry: expiry.toISOString(),
        packageId: pkg.id,
        packageName: pkg.name,
        status: "active",
      });

      return NextResponse.json({
        success: true,
        message: "تم تفعيل الاشتراك بنجاح عبر USDT!",
        autoActivated: true,
        request: paymentRequest,
      });
    }

    // For local currency: pending review
    return NextResponse.json({
      success: true,
      message: "تم إرسال طلب الاشتراك. سيتم المراجعة بعد رفع إثبات الدفع.",
      autoActivated: false,
      request: paymentRequest,
    });
  } catch (error) {
    console.error("POST payment error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء طلب الاشتراك" }, { status: 500 });
  }
}

/**
 * PUT /api/payments
 * - Admin: approve/reject a payment request
 *
 * Body: { requestId, action: "approve" | "reject", rejectReason? }
 */
export async function PUT(request: NextRequest) {
  try {
    const { requestId, action, rejectReason, adminId } = await request.json();

    if (!requestId || !action) {
      return NextResponse.json({ success: false, error: "معرف الطلب والإجراء مطلوبان" }, { status: 400 });
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, error: "إجراء غير صالح" }, { status: 400 });
    }

    const { updatePaymentRequest: updateReq, getPaymentRequests: getReqs } = await import("@/lib/store");
    const allReqs = await getReqs();
    const req = allReqs.find(r => r.id === requestId);

    if (!req) {
      return NextResponse.json({ success: false, error: "الطلب غير موجود" }, { status: 404 });
    }

    if (req.status !== "pending") {
      return NextResponse.json({ success: false, error: "هذا الطلب تم مراجعته مسبقاً" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status: action === "approve" ? "approved" : "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminId || "admin",
    };

    if (action === "reject") {
      updates.rejectReason = rejectReason || "تم رفض الطلب";
    }

    const updated = await updateReq(requestId, updates);

    // If approved: activate subscription
    if (action === "approve" && updated) {
      const pkg = await getPackageById(req.packageId);
      if (pkg) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + pkg.durationDays);
        await updateUser(req.userId, {
          subscriptionType: "subscriber",
          subscriptionExpiry: expiry.toISOString(),
          packageId: pkg.id,
          packageName: pkg.name,
          status: "active",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "تم قبول الطلب وتفعيل الاشتراك" : "تم رفض الطلب",
      request: updated,
    });
  } catch (error) {
    console.error("PUT payment error:", error);
    return NextResponse.json({ success: false, error: "خطأ في مراجعة الطلب" }, { status: 500 });
  }
}
