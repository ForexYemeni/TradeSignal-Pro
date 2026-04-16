import { NextResponse } from "next/server";

// GET /api/setup - Check database status and auto-create tables
export async function GET() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    // Step 1: Try to create tables with raw SQL
    await prisma.$executeRawUnsafe(`
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
    `);

    await prisma.$executeRawUnsafe(`
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
    `);

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Signal_status_idx" ON "Signal"("status");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Signal_pair_idx" ON "Signal"("pair");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Signal_createdAt_idx" ON "Signal"("createdAt");`);

    // Step 2: Create default admin if needed
    const adminCount = await prisma.admin.count();
    if (adminCount === 0) {
      await prisma.admin.create({
        data: {
          email: "admin@forexyemeni.com",
          passwordHash: "admin123",
          name: "مدير النظام",
          mustChangePwd: true,
        },
      });
    }

    await prisma.$disconnect();

    return NextResponse.json({ success: true, message: "Database ready" });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: msg,
    }, { status: 500 });
  }
}

// POST /api/setup - Same logic for POST
export async function POST() {
  return GET();
}
