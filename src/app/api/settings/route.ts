import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings } from "@/lib/store";

export async function GET() {
  try {
    const settings = await getAppSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في جلب الإعدادات" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const updates = await request.json();
    const settings = await updateAppSettings(updates);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإعدادات" }, { status: 500 });
  }
}
