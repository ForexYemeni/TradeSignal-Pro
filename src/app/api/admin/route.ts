import { NextRequest, NextResponse } from "next/server";
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

// Ensure tables exist before any DB operation
async function ensureTables() {
  await db.$executeRawUnsafe(CREATE_TABLES_SQL);
}

// POST /api/admin
export async function POST(request: NextRequest) {
  try {
    // Always ensure tables exist first
    await ensureTables();

    const body = await request.json();
    const { action } = body;

    if (action === "login") {
      return handleLogin(body);
    }

    if (action === "change-password") {
      return handleChangePassword(body);
    }

    return NextResponse.json({ success: false, error: "Action not found" }, { status: 400 });
  } catch (error) {
    console.error("Admin API error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: "خطأ في الاتصال بقاعدة البيانات",
      detail: msg,
    }, { status: 500 });
  }
}

async function handleLogin(body: Record<string, unknown>) {
  const { email, password } = body as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "البريد وكلمة المرور مطلوبان" }, { status: 400 });
  }

  // Auto-create default admin if none exists (first-time setup)
  const adminCount = await db.admin.count();
  if (adminCount === 0) {
    await db.admin.create({
      data: {
        email: "admin@forexyemeni.com",
        passwordHash: "admin123",
        name: "مدير النظام",
        mustChangePwd: true,
      },
    });
  }

  const admin = await db.admin.findUnique({ where: { email } });

  if (!admin) {
    return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  if (admin.passwordHash !== password) {
    return NextResponse.json({ success: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      mustChangePwd: admin.mustChangePwd,
    },
    token: admin.id,
  });
}

async function handleChangePassword(body: Record<string, unknown>) {
  const { id, currentPassword, newEmail, newPassword } = body as {
    id: string;
    currentPassword: string;
    newEmail: string;
    newPassword: string;
  };

  if (!id || !currentPassword || !newEmail || !newPassword) {
    return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
  }

  const admin = await db.admin.findUnique({ where: { id } });

  if (!admin) {
    return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
  }

  if (admin.passwordHash !== currentPassword) {
    return NextResponse.json({ success: false, error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
  }

  if (newEmail !== admin.email) {
    const existing = await db.admin.findUnique({ where: { email: newEmail } });
    if (existing) {
      return NextResponse.json({ success: false, error: "البريد الإلكتروني مستخدم بالفعل" }, { status: 400 });
    }
  }

  const updated = await db.admin.update({
    where: { id },
    data: {
      email: newEmail,
      passwordHash: newPassword,
      mustChangePwd: false,
    },
  });

  return NextResponse.json({
    success: true,
    admin: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      mustChangePwd: updated.mustChangePwd,
    },
  });
}

// GET /api/admin/check
export async function GET() {
  try {
    await ensureTables();
    const admin = await db.admin.findFirst();

    if (!admin) {
      return NextResponse.json({ exists: false, mustChangePwd: false });
    }

    return NextResponse.json({
      exists: true,
      mustChangePwd: admin.mustChangePwd,
    });
  } catch (error) {
    console.error("Admin check error:", error);
    return NextResponse.json({ exists: false, mustChangePwd: false });
  }
}
