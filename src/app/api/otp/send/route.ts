import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail } from "@/lib/store";
import { sendOtpEmail } from "@/lib/email";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_LENGTH = 6;
const RATE_LIMIT_WINDOW = 60; // 1 minute
const MAX_OTP_PER_MINUTE = 3;

export async function POST(request: NextRequest) {
  try {
    const { email, type, name } = await request.json();

    if (!email || !type) {
      return NextResponse.json({ success: false, error: "البريد الإلكتروني والنوع مطلوبان" }, { status: 400 });
    }

    if (!["register", "login"].includes(type)) {
      return NextResponse.json({ success: false, error: "نوع غير صالح" }, { status: 400 });
    }

    const sanitizedEmail = String(email).trim().toLowerCase();

    const existingUser = await getUserByEmail(sanitizedEmail);

    if (type === "register" && existingUser) {
      return NextResponse.json({ success: false, error: "هذا البريد مسجل مسبقاً" }, { status: 409 });
    }

    if (type === "login" && !existingUser) {
      return NextResponse.json({ success: false, error: "البريد غير مسجل في النظام" }, { status: 404 });
    }

    // Rate limiting
    const rateLimitKey = `otp_rate:${sanitizedEmail}`;
    const rateLimitData = await kv.get<string>(rateLimitKey);
    if (rateLimitData) {
      const count = parseInt(rateLimitData, 10);
      if (count >= MAX_OTP_PER_MINUTE) {
        return NextResponse.json(
          { success: false, error: "تم إرسال الكثير من أكواد التحقق. حاول بعد دقيقة." },
          { status: 429 }
        );
      }
    }

    // Generate 6-digit OTP
    const otp = Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join("");

    // Store OTP in KV with expiry
    const otpKey = `otp:${type}:${sanitizedEmail}`;
    await kv.set(otpKey, otp, { ex: OTP_EXPIRY_SECONDS });

    // Update rate limit counter
    await kv.set(rateLimitKey, String((parseInt(rateLimitData || "0", 10)) + 1), {
      ex: RATE_LIMIT_WINDOW,
    });

    // Send OTP email
    const emailResult = await sendOtpEmail(sanitizedEmail, otp, type, name);
    console.log(`[OTP Send] email=${sanitizedEmail}, ok=${emailResult.ok}, error=${emailResult.error}`);

    if (!emailResult.ok) {
      // Only fail if email service is truly not configured
      if (emailResult.error?.includes('not configured')) {
        await kv.del(otpKey);
        return NextResponse.json({
          success: false,
          error: "خدمة الإيميل غير مفعلة. تواصل مع الإدارة.",
        }, { status: 503 });
      }

      // For other errors (timeout, response parsing, etc):
      // DON'T delete OTP — the email likely arrived since GAS executed
      // Just log the warning and return success
      console.warn(`[OTP Send] Email may have failed but OTP kept: ${emailResult.error}`);
    }

    return NextResponse.json({
      success: true,
      message: "تم إرسال كود التحقق إلى بريدك الإلكتروني",
    });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إرسال كود التحقق" }, { status: 500 });
  }
}
