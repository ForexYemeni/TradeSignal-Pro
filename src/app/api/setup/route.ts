import { NextResponse } from "next/server";
import { getAdmin, setAdmin, getSignals, addSignal, isReady } from "@/lib/store";

export async function POST() {
  try {
    const ready = await isReady();
    if (!ready) {
      return NextResponse.json({
        success: false,
        error: "KV Store غير متصل. أنشئ KV Store من Vercel Dashboard → Storage → Create → KV",
      }, { status: 500 });
    }

    let admin = await getAdmin();
    if (admin) {
      return NextResponse.json({ success: true, message: "جاهز بالفعل", alreadySetup: true, adminEmail: admin.email });
    }

    admin = {
      id: crypto.randomUUID(),
      email: "admin@forexyemeni.com",
      passwordHash: "admin123",
      name: "مدير النظام",
      mustChangePwd: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setAdmin(admin);

    return NextResponse.json({ success: true, message: "تم إعداد النظام", alreadySetup: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ready = await isReady();
    if (!ready) {
      return NextResponse.json({
        success: false,
        isReady: false,
        error: "KV Store غير متصل. أنشئ KV Store من: Vercel → Storage → Create → KV",
      }, { status: 500 });
    }

    const admin = await getAdmin();
    const signals = await getSignals(1);

    return NextResponse.json({
      success: true,
      isReady: true,
      adminCount: admin ? 1 : 0,
      signalCount: signals.length,
    });
  } catch (error) {
    return NextResponse.json({ success: false, isReady: false, error: String(error) }, { status: 500 });
  }
}
