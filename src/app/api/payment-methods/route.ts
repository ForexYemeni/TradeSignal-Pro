import { NextRequest, NextResponse } from "next/server";
import {
  getLocalPaymentMethods,
  getActiveLocalPaymentMethods,
  addLocalPaymentMethod,
  updateLocalPaymentMethod,
  deleteLocalPaymentMethod,
  incrementGlobalVersion,
} from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/payment-methods?active=true
 * - List local payment methods (admin: all, user: active only)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    const methods = activeOnly
      ? await getActiveLocalPaymentMethods()
      : await getLocalPaymentMethods();

    return NextResponse.json({ success: true, methods });
  } catch (error) {
    console.error("GET payment-methods error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب طرق الدفع" }, { status: 500 });
  }
}

/**
 * POST /api/payment-methods
 * - Create a new local payment method (admin only)
 *
 * Body: { name, walletAddress, walletName, currencyName, currencyCode, exchangeRate }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { name, walletAddress, walletName, currencyName, currencyCode, exchangeRate } = await request.json();

    if (!name || !walletAddress || !walletName || !currencyName || !currencyCode || !exchangeRate) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (exchangeRate <= 0) {
      return NextResponse.json({ success: false, error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const methods = await getLocalPaymentMethods();
    const method = await addLocalPaymentMethod({
      id: crypto.randomUUID(),
      name: name.trim(),
      walletAddress: walletAddress.trim(),
      walletName: walletName.trim(),
      currencyName: currencyName.trim(),
      currencyCode: currencyCode.trim().toUpperCase(),
      exchangeRate: Number(exchangeRate),
      isActive: true,
      order: methods.length,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, method });
  } catch (error) {
    console.error("POST payment-methods error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إضافة طريقة الدفع" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("payment_methods").catch(() => {});
  }
}

/**
 * PUT /api/payment-methods
 * - Update a local payment method (admin only)
 *
 * Body: { id, name?, walletAddress?, walletName?, currencyName?, currencyCode?, exchangeRate?, isActive? }
 */
export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id, ...updates } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "معرف طريقة الدفع مطلوب" }, { status: 400 });
    }

    if (updates.exchangeRate !== undefined && updates.exchangeRate <= 0) {
      return NextResponse.json({ success: false, error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    // Clean up string fields
    if (updates.name) updates.name = updates.name.trim();
    if (updates.walletAddress) updates.walletAddress = updates.walletAddress.trim();
    if (updates.walletName) updates.walletName = updates.walletName.trim();
    if (updates.currencyName) updates.currencyName = updates.currencyName.trim();
    if (updates.currencyCode) updates.currencyCode = updates.currencyCode.trim().toUpperCase();
    if (updates.exchangeRate !== undefined) updates.exchangeRate = Number(updates.exchangeRate);

    const method = await updateLocalPaymentMethod(id, updates);

    if (!method) {
      return NextResponse.json({ success: false, error: "طريقة الدفع غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ success: true, method });
  } catch (error) {
    console.error("PUT payment-methods error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث طريقة الدفع" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("payment_methods").catch(() => {});
  }
}

/**
 * DELETE /api/payment-methods?id=xxx
 * - Delete a local payment method (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "معرف طريقة الدفع مطلوب" }, { status: 400 });
    }

    const deleted = await deleteLocalPaymentMethod(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: "طريقة الدفع غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "تم حذف طريقة الدفع" });
  } catch (error) {
    console.error("DELETE payment-methods error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف طريقة الدفع" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("payment_methods").catch(() => {});
  }
}
