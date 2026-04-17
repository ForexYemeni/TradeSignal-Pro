import { NextRequest, NextResponse } from "next/server";
import { getPackages, addPackage, updatePackage, deletePackage } from "@/lib/store";

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
    const { name, durationDays, price, type, description, isActive, order } = await request.json();
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
    });
    return NextResponse.json({ success: true, package: pkg });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في إنشاء الباقة" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "معرف الباقة مطلوب" }, { status: 400 });
    const pkg = await updatePackage(id, updates);
    if (!pkg) return NextResponse.json({ success: false, error: "الباقة غير موجودة" }, { status: 404 });
    return NextResponse.json({ success: true, package: pkg });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في تحديث الباقة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "معرف الباقة مطلوب" }, { status: 400 });
    const deleted = await deletePackage(id);
    if (!deleted) return NextResponse.json({ success: false, error: "الباقة غير موجودة" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في حذف الباقة" }, { status: 500 });
  }
}
