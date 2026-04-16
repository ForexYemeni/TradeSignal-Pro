import { NextResponse } from "next/server";
import { getStats } from "@/lib/store";

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الإحصائيات" }, { status: 500 });
  }
}
