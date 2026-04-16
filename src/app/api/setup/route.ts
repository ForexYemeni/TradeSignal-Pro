import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// SQL to create tables if they don't exist
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "Signal" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUY',
    "entry" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stopLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "takeProfits" TEXT NOT NULL DEFAULT '[]',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "signalCategory" TEXT NOT NULL DEFAULT 'ENTRY',
    "rawText" TEXT NOT NULL DEFAULT '',
    "timeframe" TEXT NOT NULL DEFAULT '',
    "htfTimeframe" TEXT NOT NULL DEFAULT '',
    "htfTrend" TEXT NOT NULL DEFAULT '',
    "smcTrend" TEXT NOT NULL DEFAULT '',
    "hitTpIndex" INTEGER NOT NULL DEFAULT -1,
    "hitPrice" DOUBLE PRECISION,
    "pnlPoints" DOUBLE PRECISION,
    "pnlDollars" DOUBLE PRECISION,
    "partialClose" BOOLEAN,
    "balance" DOUBLE PRECISION,
    "lotSize" TEXT,
    "riskTarget" DOUBLE PRECISION,
    "riskPercent" DOUBLE PRECISION,
    "actualRisk" DOUBLE PRECISION,
    "actualRiskPct" DOUBLE PRECISION,
    "slDistance" DOUBLE PRECISION,
    "maxRR" DOUBLE PRECISION,
    "instrument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'مدير النظام',
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email");
CREATE INDEX IF NOT EXISTS "Signal_status_idx" ON "Signal"("status");
CREATE INDEX IF NOT EXISTS "Signal_pair_idx" ON "Signal"("pair");
CREATE INDEX IF NOT EXISTS "Signal_createdAt_idx" ON "Signal"("createdAt");
`;

// POST /api/setup - Initialize database & seed default admin
export async function POST() {
  try {
    // 1. Create tables if they don't exist
    await db.$executeRawUnsafe(CREATE_TABLES_SQL);

    // 2. Check if admin already exists
    const existingAdmin = await db.admin.findFirst();

    if (existingAdmin) {
      return NextResponse.json({
        success: true,
        message: "قاعدة البيانات جاهزة بالفعل",
        alreadySetup: true,
        adminEmail: existingAdmin.email,
      });
    }

    // 3. Create default admin
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
    return NextResponse.json(
      {
        success: false,
        error: "خطأ في إعداد قاعدة البيانات. تأكد من صحة DATABASE_URL",
        detail: error instanceof Error ? error.message : String(error),
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
        error: "قاعدة البيانات غير متصلة. تأكد من إعداد DATABASE_URL",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
