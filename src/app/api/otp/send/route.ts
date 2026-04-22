import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getUserByEmail } from "@/lib/store";
import { sendOtpEmail } from "@/lib/email";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_LENGTH = 6;
const RATE_LIMIT_WINDOW = 60;
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

    // Store OTP in KV FIRST (guaranteed before response)
    const otpKey = `otp:${type}:${sanitizedEmail}`;
    await kv.set(otpKey, otp, { ex: OTP_EXPIRY_SECONDS });

    // Update rate limit counter
    await kv.set(rateLimitKey, String((parseInt(rateLimitData || "0", 10)) + 1), {
      ex: RATE_LIMIT_WINDOW,
    });

    console.log(`[OTP] Generated for ${sanitizedEmail} type=${type} code=${otp}`);

    // Send email in background — don't block the response
    // The OTP is already stored in KV, so user can verify even if email is slow
    sendOtpEmail(sanitizedEmail, otp, type, name)
      .then(result => {
        console.log(`[OTP] Email result for ${sanitizedEmail}: ok=${result.ok}`);
      })
      .catch(err => {
        console.error(`[OTP] Email error for ${sanitizedEmail}:`, err);
      });

    // Return success immediately — OTP is in KV and email is sending
    return NextResponse.json({
      success: true,
      message: "تم إرسال كود التحقق إلى بريدك الإلكتروني",
    });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إرسال كود التحقق" }, { status: 500 });
  }
}
