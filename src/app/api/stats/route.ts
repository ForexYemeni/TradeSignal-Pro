import { NextRequest, NextResponse } from "next/server";
import { getStats } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const stats = await getStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإحصائيات" }, { status: 500 });
  }
}
