import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/setup - Initialize database & seed default admin
export async function POST() {
  try {
    // Try to access DB - tables should exist from build step (prisma db push)
    const adminCount = await db.admin.count();

    if (adminCount > 0) {
      const existingAdmin = await db.admin.findFirst();
      return NextResponse.json({
        success: true,
        message: "قاعدة البيانات جاهزة بالفعل",
        alreadySetup: true,
        adminEmail: existingAdmin?.email,
      });
    }

    // Create default admin
    const admin = await db.admin.create({
      data: {
        email: "admin@forexyemeni.com",
        passwordHash: "admin123",
        name: "مدير النظام",
        mustChangePwd: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "تم إعداد قاعدة البيانات بنجاح",
      alreadySetup: false,
      admin: {
        email: admin.email,
        name: admin.name,
        mustChangePwd: admin.mustChangePwd,
      },
    });
  } catch (error) {
    console.error("Setup error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "فشل الاتصال بقاعدة البيانات",
        detail: msg,
      },
      { status: 500 }
    );
  }
}

// GET /api/setup - Check if database is ready
export async function GET() {
  try {
    const adminCount = await db.admin.count();
    const signalCount = await db.signal.count();

    return NextResponse.json({
      success: true,
      isReady: true,
      adminCount,
      signalCount,
    });
  } catch (error) {
    console.error("Setup check error:", error);
    return NextResponse.json(
      {
        success: false,
        isReady: false,
        error: "قاعدة البيانات غير متصلة",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
