import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail, updateUser, hashPassword } from "@/lib/store";
import { validateEmail, validatePassword } from "@/lib/validation";

/**
 * POST /api/forgot-password
 * Resets a user's password after OTP verification.
 *
 * Expects: { email, verifyToken, newPassword }
 *
 * Flow:
 * 1. User visits "Forgot Password" page
 * 2. Enters email → /api/otp/send { type: "reset" }
 * 3. Receives OTP email → enters code → /api/otp/verify { type: "reset" }
 * 4. Gets verifyToken → enters new password → /api/forgot-password { verifyToken, newPassword }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, verifyToken, newPassword } = await request.json();

    // Validate inputs
    const emailVal = validateEmail(email);
    if (!emailVal.valid) return NextResponse.json({ success: false, error: emailVal.error }, { status: 400 });

    const pwdVal = validatePassword(newPassword);
    if (!pwdVal.valid) return NextResponse.json({ success: false, error: pwdVal.error }, { status: 400 });

    if (!verifyToken) {
      return NextResponse.json({ success: false, error: "يجب التحقق من البريد الإلكتروني أولاً" }, { status: 403 });
    }

    // Check verify token — try both "reset" and fallback types
    const resetKey = `otp_verified:reset:${emailVal.sanitized}`;
    let storedToken = await kv.get<string>(resetKey);

    if (!storedToken) {
      // Fallback: check login and register types too
      const loginKey = `otp_verified:login:${emailVal.sanitized}`;
      storedToken = await kv.get<string>(loginKey);
      if (storedToken) await kv.del(loginKey);

      if (!storedToken) {
        const regKey = `otp_verified:register:${emailVal.sanitized}`;
        storedToken = await kv.get<string>(regKey);
        if (storedToken) await kv.del(regKey);
      }
    }

    // Use String() to handle KV auto-deserialization (numbers vs strings)
    if (!storedToken || String(storedToken) !== String(verifyToken)) {
      return NextResponse.json({ success: false, error: "رمز التحقق غير صالح أو انتهت صلاحيته. أعد المحاولة." }, { status: 403 });
    }

    // Delete the verify token (one-time use)
    await kv.del(resetKey);

    // Find user
    const user = await getUserByEmail(emailVal.sanitized);
    if (!user) {
      return NextResponse.json({ success: false, error: "البريد غير مسجل في النظام" }, { status: 404 });
    }

    // Update password
    const newPasswordHash = await hashPassword(newPassword);
    await updateUser(user.id, {
      passwordHash: newPasswordHash,
      mustChangePwd: false,
    });

    console.log(`[Forgot Password] Password reset successfully for ${emailVal.sanitized}`);

    return NextResponse.json({
      success: true,
      message: "تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إعادة تعيين كلمة المرور" }, { status: 500 });
  }
}
