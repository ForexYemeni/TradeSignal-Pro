import { NextRequest, NextResponse } from "next/server";
import { getPackages, addPackage, updatePackage, deletePackage, incrementGlobalVersion } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const packages = await getPackages();
    return NextResponse.json({ success: true, packages });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في جلب الباقات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { name, durationDays, price, type, description, isActive, order, features, maxSignals, prioritySupport, showEntryEarly, instruments } = await request.json();
    if (!name || durationDays === undefined || price === undefined) {
      return NextResponse.json({ success: false, error: "الاسم والمدة والسعر مطلوبة" }, { status: 400 });
    }
    const pkg = await addPackage({
      id: crypto.randomUUID(),
      name,
      durationDays: Number(durationDays),
      price: Number(price),
      type: type || "paid",
      description: description || "",
      isActive: isActive !== false,
      order: order ?? 99,
      createdAt: new Date().toISOString(),
      features: Array.isArray(features) ? features : [],
      maxSignals: Number(maxSignals) || 0,
      prioritySupport: !!prioritySupport,
      showEntryEarly: !!showEntryEarly,
      instruments: Array.isArray(instruments) ? instruments : undefined,
    });
    return NextResponse.json({ success: true, package: pkg });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في إنشاء الباقة" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("packages").catch(() => {});
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "معرف الباقة مطلوب" }, { status: 400 });
    if (updates.features !== undefined) updates.features = Array.isArray(updates.features) ? updates.features : [];
    if (updates.maxSignals !== undefined) updates.maxSignals = Number(updates.maxSignals) || 0;
    if (updates.prioritySupport !== undefined) updates.prioritySupport = !!updates.prioritySupport;
    if (updates.showEntryEarly !== undefined) updates.showEntryEarly = !!updates.showEntryEarly;
    const pkg = await updatePackage(id, updates);
    if (!pkg) return NextResponse.json({ success: false, error: "الباقة غير موجودة" }, { status: 404 });
    return NextResponse.json({ success: true, package: pkg });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في تحديث الباقة" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("packages").catch(() => {});
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "معرف الباقة مطلوب" }, { status: 400 });
    const deleted = await deletePackage(id);
    if (!deleted) return NextResponse.json({ success: false, error: "الباقة غير موجودة" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في حذف الباقة" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("packages").catch(() => {});
  }
}
