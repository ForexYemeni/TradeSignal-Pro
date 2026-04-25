import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, updateAppSettings, incrementGlobalVersion } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const settings = await getAppSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في جلب الإعدادات" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const updates = await request.json();
    const settings = await updateAppSettings(updates);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: "خطأ في تحديث الإعدادات" }, { status: 500 });
  }
  finally {
    await incrementGlobalVersion("settings").catch(() => {});
  }
}
