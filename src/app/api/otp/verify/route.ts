import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

/**
 * POST /api/otp/verify
 * Body: { email, otp, type: "register" | "login" }
 *
 * Verifies the OTP code stored in KV.
 * Returns success + a temporary verification token that must be passed
 * to the register/login endpoint to complete the flow.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, otp, type } = await request.json();

    if (!email || !otp || !type) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (!["register", "login"].includes(type)) {
      return NextResponse.json({ success: false, error: "نوع غير صالح" }, { status: 400 });
    }

    const sanitizedEmail = String(email).trim().toLowerCase();
    const sanitizedOtp = String(otp).trim();

    if (sanitizedOtp.length !== 6 || !/^\d{6}$/.test(sanitizedOtp)) {
      return NextResponse.json({ success: false, error: "كود التحقق يجب أن يكون 6 أرقام" }, { status: 400 });
    }

    // Retrieve OTP from KV
    const otpKey = `otp:${type}:${sanitizedEmail}`;
    const storedOtp = await kv.get<string>(otpKey);

    if (!storedOtp) {
      return NextResponse.json({ success: false, error: "انتهت صلاحية الكود. أعد إرسال كود جديد." }, { status: 410 });
    }

    if (storedOtp !== sanitizedOtp) {
      return NextResponse.json({ success: false, error: "كود التحقق غير صحيح" }, { status: 401 });
    }

    // OTP verified — delete it (one-time use)
    await kv.del(otpKey);

    // Generate a temporary verification token (valid for 10 minutes)
    const verifyToken = `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const verifyKey = `otp_verified:${type}:${sanitizedEmail}`;
    await kv.set(verifyKey, verifyToken, { ex: 600 }); // 10 minutes

    return NextResponse.json({
      success: true,
      message: "تم التحقق بنجاح",
      verifyToken,
    });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json({ success: false, error: "خطأ في التحقق من الكود" }, { status: 500 });
  }
}
