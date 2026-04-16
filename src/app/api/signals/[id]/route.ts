import { NextRequest, NextResponse } from "next/server";
import { getSignalById, updateSignal, deleteSignal } from "@/lib/store";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, hitTpIndex } = body;

    if (!status && hitTpIndex === undefined) {
      return NextResponse.json({ success: false, error: "البيانات مطلوبة" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (hitTpIndex !== undefined) updateData.hitTpIndex = hitTpIndex;

    const signal = await updateSignal(id, updateData);
    if (!signal) {
      return NextResponse.json({ success: false, error: "الإشارة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      signal: { ...signal, takeProfits: JSON.parse(signal.takeProfits) },
    });
  } catch (error) {
    console.error("Error updating signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإشارة" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteSignal(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signal:", error);
    return NextResponse.json({ success: false, error: "خطأ في حذف الإشارة" }, { status: 500 });
  }
}
