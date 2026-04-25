import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { requireAdmin } from "@/lib/admin-auth";

// ─── Types ───────────────────────────────────────────────
interface Coupon {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

// ─── Helper: get all coupons ────────────────────────────
async function getCoupons(): Promise<Coupon[]> {
  const data = await kv.get<Coupon[]>("coupons_list");
  return data || [];
}

async function saveCoupons(coupons: Coupon[]): Promise<void> {
  await kv.set("coupons_list", coupons);
}

// ─── GET: List all coupons (admin) or validate (public) ─
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // Validate coupon action (public)
    if (action === "validate") {
      const code = searchParams.get("code");
      const userId = searchParams.get("userId");
      if (!code || !userId) {
        return NextResponse.json({ success: false, error: "الكود ومعرف المستخدم مطلوبان" }, { status: 400 });
      }
      return handleValidate(code.trim().toUpperCase(), userId);
    }

    // Admin: list all coupons
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const coupons = await getCoupons();
    return NextResponse.json({ success: true, coupons });
  } catch (error) {
    console.error("GET coupons error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الكوبونات" }, { status: 500 });
  }
}

// ─── POST: Create coupon (admin) or validate (public) ───
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Validate coupon (public endpoint)
    if (action === "validate") {
      const { code, userId } = body;
      if (!code || !userId) {
        return NextResponse.json({ success: false, error: "الكود ومعرف المستخدم مطلوبان" }, { status: 400 });
      }
      return handleValidate(code.trim().toUpperCase(), userId);
    }

    // Admin: create coupon
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { code, discountPercent, maxUses, expiresAt } = body;
    if (!code || discountPercent === undefined || !maxUses) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (discountPercent < 1 || discountPercent > 100) {
      return NextResponse.json({ success: false, error: "نسبة الخصم يجب أن تكون بين 1 و 100" }, { status: 400 });
    }

    const couponCode = code.trim().toUpperCase();
    const coupons = await getCoupons();

    // Check for duplicate code
    if (coupons.find(c => c.code === couponCode)) {
      return NextResponse.json({ success: false, error: "هذا الكود موجود مسبقاً" }, { status: 409 });
    }

    const newCoupon: Coupon = {
      code: couponCode,
      discountPercent: Number(discountPercent),
      maxUses: Number(maxUses),
      currentUses: 0,
      isActive: true,
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString(),
    };

    coupons.push(newCoupon);
    await saveCoupons(coupons);

    return NextResponse.json({ success: true, coupon: newCoupon });
  } catch (error) {
    console.error("POST coupon error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء الكوبون" }, { status: 500 });
  }
}

// ─── PUT: Update coupon (admin) ────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { code, ...updates } = await request.json();
    if (!code) {
      return NextResponse.json({ success: false, error: "معرف الكوبون مطلوب" }, { status: 400 });
    }

    const coupons = await getCoupons();
    const idx = coupons.findIndex(c => c.code === code);
    if (idx === -1) {
      return NextResponse.json({ success: false, error: "الكوبون غير موجود" }, { status: 404 });
    }

    if (updates.discountPercent !== undefined) {
      updates.discountPercent = Number(updates.discountPercent);
      if (updates.discountPercent < 1 || updates.discountPercent > 100) {
        return NextResponse.json({ success: false, error: "نسبة الخصم يجب أن تكون بين 1 و 100" }, { status: 400 });
      }
    }
    if (updates.maxUses !== undefined) updates.maxUses = Number(updates.maxUses);
    if (updates.isActive !== undefined) updates.isActive = !!updates.isActive;

    coupons[idx] = { ...coupons[idx], ...updates };
    await saveCoupons(coupons);

    return NextResponse.json({ success: true, coupon: coupons[idx] });
  } catch (error) {
    console.error("PUT coupon error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الكوبون" }, { status: 500 });
  }
}

// ─── DELETE: Delete coupon (admin) ─────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ success: false, error: "معرف الكوبون مطلوب" }, { status: 400 });
    }

    const coupons = await getCoupons();
    const filtered = coupons.filter(c => c.code !== code);
    if (filtered.length === coupons.length) {
      return NextResponse.json({ success: false, error: "الكوبون غير موجود" }, { status: 404 });
    }
    await saveCoupons(filtered);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE coupon error:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف الكوبون" }, { status: 500 });
  }
}

// ─── Validate Coupon ────────────────────────────────────
async function handleValidate(code: string, userId: string): Promise<NextResponse> {
  const coupons = await getCoupons();
  const coupon = coupons.find(c => c.code === code);

  if (!coupon) {
    return NextResponse.json({ success: false, error: "كوبون غير صالح" });
  }

  if (!coupon.isActive) {
    return NextResponse.json({ success: false, error: "هذا الكوبون غير مفعل حالياً" });
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return NextResponse.json({ success: false, error: "انتهت صلاحية هذا الكوبون" });
  }

  if (coupon.currentUses >= coupon.maxUses) {
    return NextResponse.json({ success: false, error: "تم استنفاد عدد استخدامات هذا الكوبون" });
  }

  // Check if user already used this coupon
  const usedKey = `coupon_used:${userId}:${code}`;
  const alreadyUsed = await kv.get<boolean>(usedKey);
  if (alreadyUsed) {
    return NextResponse.json({ success: false, error: "لقد استخدمت هذا الكوبون مسبقاً" });
  }

  return NextResponse.json({
    success: true,
    coupon: {
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      maxUses: coupon.maxUses,
      currentUses: coupon.currentUses,
      expiresAt: coupon.expiresAt,
    },
  });
}

// ─── Increment coupon usage (called from payments route) ──
export async function useCoupon(code: string, userId: string): Promise<boolean> {
  try {
    const coupons = await getCoupons();
    const idx = coupons.findIndex(c => c.code === code);
    if (idx === -1) return false;

    coupons[idx].currentUses += 1;
    await saveCoupons(coupons);

    // Mark as used by this user
    const usedKey = `coupon_used:${userId}:${code}`;
    await kv.set(usedKey, true);
    return true;
  } catch (error) {
    console.error("useCoupon error:", error);
    return false;
  }
}
