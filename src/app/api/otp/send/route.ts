import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail } from "@/lib/store";
import { sendOtpEmail } from "@/lib/email";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_LENGTH = 6;
const RATE_LIMIT_WINDOW = 60; // 1 minute
const MAX_OTP_PER_MINUTE = 3;

/**
 * POST /api/otp/send
 * Body: { email, type: "register" | "login", name? }
 *
 * - For register: checks email not already taken, sends OTP
 * - For login: checks email exists, sends OTP
 * - Rate limited: max 3 OTPs per email per minute
 */
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

    // Check user existence based on type
    const existingUser = await getUserByEmail(sanitizedEmail);

    if (type === "register" && existingUser) {
      return NextResponse.json({ success: false, error: "هذا البريد مسجل مسبقاً" }, { status: 409 });
    }

    if (type === "login" && !existingUser) {
      return NextResponse.json({ success: false, error: "البريد غير مسجل في النظام" }, { status: 404 });
    }

    // Check if email service is configured
    if (!process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL) {
      return NextResponse.json({
        success: false,
        error: "خدمة الإيميل غير مفعلة. تواصل مع الإدارة.",
        emailNotConfigured: true,
      }, { status: 503 });
    }

    // Rate limiting: check how many OTPs were sent to this email in the last minute
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

    // Send OTP email — MUST succeed, otherwise return error
    const emailSent = await sendOtpEmail(sanitizedEmail, otp, type, name);

    if (!emailSent) {
      // Delete the stored OTP since email failed
      await kv.del(otpKey);
      console.error(`OTP email FAILED to send to ${sanitizedEmail}`);
      return NextResponse.json({
        success: false,
        error: "فشل إرسال كود التحقق. تأكد من إعدادات خدمة الإيميل.",
        emailFailed: true,
      }, { status: 500 });
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
