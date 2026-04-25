import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { testTelegramConnection } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const { token, chatId } = await request.json();

    if (!token || !chatId) {
      return NextResponse.json(
        { success: false, message: "يرجى إدخال توكن البوت ومعرف القناة" },
        { status: 400 }
      );
    }

    const result = await testTelegramConnection(token, chatId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Telegram test error:", error);
    return NextResponse.json(
      { success: false, message: "خطأ في اختبار الاتصال" },
      { status: 500 }
    );
  }
}
