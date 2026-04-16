-- CreateTable
CREATE TABLE "Signal" (
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

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'مدير النظام',
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_pair_idx" ON "Signal"("pair");

-- CreateIndex
CREATE INDEX "Signal_signalCategory_idx" ON "Signal"("signalCategory");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
