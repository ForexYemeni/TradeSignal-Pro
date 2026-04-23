import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

/**
 * POST /api/otp/verify
 * Verifies OTP code stored in KV.
 * Tries both 'login' and 'register' type keys for robustness.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, otp, type } = await request.json();

    if (!email || !otp || !type) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    const sanitizedEmail = String(email).trim().toLowerCase();
    const sanitizedOtp = String(otp).trim();

    if (sanitizedOtp.length !== 6 || !/^\d{6}$/.test(sanitizedOtp)) {
      return NextResponse.json({ success: false, error: "كود التحقق يجب أن يكون 6 أرقام" }, { status: 400 });
    }

    // Try to find OTP — check the specified type first, then the other type
    let otpKey = `otp:${type}:${sanitizedEmail}`;
    let storedOtp = await kv.get<string>(otpKey);

    // If not found, try the other type (in case of mix-up)
    if (!storedOtp) {
      const otherType = type === "login" ? "register" : "login";
      const otherKey = `otp:${otherType}:${sanitizedEmail}`;
      const otherOtp = await kv.get<string>(otherKey);
      if (otherOtp) {
        console.log(`[OTP Verify] Found OTP under type '${otherType}' instead of '${type}'`);
        otpKey = otherKey;
        storedOtp = otherOtp;
      }
    }

    // CRITICAL FIX: @vercel/kv uses @upstash/redis which JSON-parses values.
    // A string "123456" becomes number 123456 after kv.get().
    // We must convert both sides to strings before comparison.
    const storedStr = String(storedOtp || "").trim();
    const inputStr = sanitizedOtp.trim();

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP Verify] email=${sanitizedEmail}, type=${type}, key=${otpKey}, stored="${storedStr}" (raw type: ${typeof storedOtp}), input="${inputStr}", match=${storedStr === inputStr}`);
    }

    if (!storedStr) {
      return NextResponse.json({ success: false, error: "انتهت صلاحية الكود. أعد إرسال كود جديد." }, { status: 410 });
    }

    if (storedStr !== inputStr) {
      return NextResponse.json({ success: false, error: "كود التحقق غير صحيح" }, { status: 401 });
    }

    // OTP verified — delete it (one-time use)
    await kv.del(otpKey);

    // Generate verification token (valid 10 minutes)
    const verifyToken = `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const verifyKey = `otp_verified:${type}:${sanitizedEmail}`;
    await kv.set(verifyKey, verifyToken, { ex: 600 });

    console.log(`[OTP Verify] SUCCESS for ${sanitizedEmail}`);

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
