import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// GET /api/test-db - Test database connection and show detailed info
export async function GET() {
  try {
    const url = process.env.DATABASE_URL || "NOT SET";
    
    // Show safe parts of the URL (hide password)
    let safeUrl = "";
    try {
      const urlObj = new URL(url.replace("postgresql://", "https://"));
      safeUrl = `postgresql://postgres:***@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}${urlObj.search}`;
    } catch {
      safeUrl = "INVALID URL FORMAT";
    }

    // Try to connect
    const testClient = new PrismaClient({
      log: ["error"],
    });

    const result = await testClient.$queryRaw`SELECT 1 as test`;
    
    await testClient.$disconnect();

    return NextResponse.json({
      success: true,
      message: "تم الاتصال بقاعدة البيانات بنجاح ✅",
      dbUrl: safeUrl,
      testQuery: result,
    });
  } catch (error) {
    const url = process.env.DATABASE_URL || "NOT SET";
    let safeUrl = "";
    try {
      const urlObj = new URL(url.replace("postgresql://", "https://"));
      safeUrl = `postgresql://postgres:***@${urlObj.hostname}:${urlObj.port}${urlObj.pathname}${urlObj.search}`;
    } catch {
      safeUrl = "INVALID URL FORMAT";
    }

    const msg = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json({
      success: false,
      message: "فشل الاتصال ❌",
      dbUrl: safeUrl,
      error: msg,
      hint: "تأكد من: 1) الرابط صحيح 2) كلمة المرور مشفرة 3) مشروع Supabase غير متوقف",
    });
  }
}
