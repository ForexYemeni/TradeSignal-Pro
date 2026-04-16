import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/signals/[id] - Update signal status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, hitTpIndex } = body;

    if (!status && hitTpIndex === undefined) {
      return NextResponse.json(
        { success: false, error: "البيانات مطلوبة" },
        { status: 400 }
      );
    }

    const validStatuses = ["ACTIVE", "HIT_TP", "HIT_SL", "EXPIRED", "MANUAL_CLOSE"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: "حالة غير صالحة" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (hitTpIndex !== undefined) updateData.hitTpIndex = hitTpIndex;

    const signal = await db.signal.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      signal: {
        ...signal,
        takeProfits: JSON.parse(signal.takeProfits),
      },
    });
  } catch (error) {
    console.error("Error updating signal:", error);
    return NextResponse.json(
      { success: false, error: "خطأ في تحديث الإشارة" },
      { status: 500 }
    );
  }
}

// DELETE /api/signals/[id] - Delete a signal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.signal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signal:", error);
    return NextResponse.json(
      { success: false, error: "خطأ في حذف الإشارة" },
      { status: 500 }
    );
  }
}
