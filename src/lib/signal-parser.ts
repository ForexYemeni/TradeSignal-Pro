/**
 * FOREXYEMENI-PRO Signal Parser
 * Parses signals from the FOREXYEMENI-PRO TradingView indicator
 * IMPORTANT: NEVER rejects a signal — always stores it with best-effort parsing
 * Supports ALL pairs: forex, crypto, gold, silver, oil, indices
 */

export interface TakeProfitDetail {
  tp: number;
  rr: number;
  hit?: boolean;
}

export interface RiskData {
  balance: number;
  lotSize: string;
  riskTarget: number;
  riskPercent: number;
  actualRisk: number;
  actualRiskPct: number;
  slDistance: number;
  maxRR: number;
  instrument: string;
}

export interface ParsedSignal {
  pair: string;
  type: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfits: TakeProfitDetail[];
  confidence: number;
  timeframe: string;
  htfTimeframe: string;
  htfTrend: string;
  smcTrend: string;
  riskData: RiskData;
  signalCategory: string;
  rawText: string;
  // For TP/SL hit alerts
  hitTpIndex?: number;
  hitPrice?: number;
  pnlPoints?: number;
  pnlDollar?: number;
  tpStatusList?: string;
  totalTPs?: number;
  partialWin?: boolean;
  // For reentry/pyramid
  reentrySignal?: string;
}

export interface ParseResult {
  success: boolean;
  signal?: ParsedSignal;
  error?: string;
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════
//  Main Parser — NEVER rejects a signal from the indicator
// ═══════════════════════════════════════════════════════════════
export function parseTradingViewSignal(rawText: string): ParseResult {
  const text = rawText.trim();

  if (!text) {
    return { success: false, error: "النص فارغ" };
  }

  // 1. Determine signal category first
  const category = detectSignalCategory(text);

  // 2. Parse based on category
  let result: ParseResult;
  switch (category) {
    case "ENTRY":
      result = parseEntrySignal(text); break;
    case "TP_HIT":
      result = parseTPHitAlert(text); break;
    case "SL_HIT":
      result = parseSLHitAlert(text); break;
    case "BREAKEVEN":
      result = parseBreakevenAlert(text); break;
    case "REENTRY":
      result = parseReentrySignal(text); break;
    case "REENTRY_TP":
      result = parseReentryTPAlert(text); break;
    case "REENTRY_SL":
      result = parseReentrySLAlert(text); break;
    case "PYRAMID":
      result = parsePyramidSignal(text); break;
    case "PYRAMID_TP":
      result = parsePyramidTPAlert(text); break;
    case "PYRAMID_SL":
      result = parsePyramidSLAlert(text); break;
    default:
      result = parseBasicSignal(text); break;
  }

  // ═══ CRITICAL CATCH-ALL: If ANY parser fails, create raw fallback signal ═══
  // The indicator is the single source of truth — never discard its output
  if (!result.success || !result.signal) {
    console.warn("[Parser] All parsers failed, creating raw fallback:", text.substring(0, 120));
    return {
      success: true,
      signal: {
        pair: extractPair(text) || "UNKNOWN",
        type: /🔴|SELL|بيع|Short|🔻/i.test(text) ? "SELL" : "BUY",
        entry: extractEntry(text) ?? 0,
        stopLoss: extractStopLoss(text) ?? 0,
        takeProfits: [],
        confidence: extractConfidence(text),
        signalCategory: "ENTRY",
        rawText: text,
        timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
        riskData: emptyRiskData(),
      },
      warnings: ["تنسيق غير معروف — تم تخزين الإشارة كبيانات أساسية"],
    };
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  Signal Category Detection
// ═══════════════════════════════════════════════════════════════
function detectSignalCategory(text: string): string {
  // BREAKEVEN: BE alert title "تأمين تلقائي ← الدخول" or body "سحب الوقف لنقطة الدخول تلقائياً"
  if (/تأمين تلقائي\s*←\s*الدخول/.test(text)) return "BREAKEVEN";
  if (/سحب الوقف لنقطة الدخول تلقائيا/.test(text)) return "BREAKEVEN";
  // BE exit: SL hit at entry price after BE was activated
  if (/ضرب الوقف عند الدخول/.test(text)) return "BREAKEVEN";

  if (/إغلاق كامل بالربح/.test(text) && /♻️/.test(text)) return "REENTRY_TP";
  if (/هدف التعويض/.test(text)) return "REENTRY_TP";
  if (/ضرب وقف التعويض/.test(text)) return "REENTRY_SL";
  if (/صفقة التعويض/.test(text) && /الدخول:/.test(text)) return "REENTRY";
  if (/تعزيز كامل بالربح/.test(text)) return "PYRAMID_TP";
  if (/هدف التعزيز/.test(text)) return "PYRAMID_TP";
  if (/ضرب وقف التعزيز/.test(text)) return "PYRAMID_SL";
  if (/تعزيز/.test(text) && /الدخول:/.test(text)) return "PYRAMID";
  if (/إغلاق كامل بالربح/.test(text)) return "TP_HIT";
  if (/قفزة سعرية/.test(text)) return "TP_HIT";
  if (/تحقق الهدف/.test(text)) return "TP_HIT";
  if (/ضرب الوقف/.test(text) && !/تعويض/.test(text) && !/تعزيز/.test(text)) return "SL_HIT";
  if (/الوقف الأساسي/.test(text) || /الوقف المتتبع/.test(text) || (/التأمين/.test(text) && !/تأمين تلقائي/.test(text))) return "SL_HIT";
  if (/إشارة شراء/.test(text) || /إشارة بيع/.test(text)) return "ENTRY";
  if (/🟢/.test(text) || /🔴/.test(text)) return "ENTRY";

  return "UNKNOWN";
}

// ═══════════════════════════════════════════════════════════════
//  Parse ENTRY Signal — NEVER fails
// ═══════════════════════════════════════════════════════════════
function parseEntrySignal(text: string): ParseResult {
  const warnings: string[] = [];

  // Signal type — NEVER fail, default to BUY
  let signalType = extractSignalType(text);
  if (!signalType) {
    signalType = /🔴|SELL|بيع|Short|🔻/i.test(text) ? "SELL" : "BUY";
    warnings.push("لم يتم التعرف على نوع الإشارة — تم افتراض شراء");
  }

  // Pair
  const pair = extractPair(text);
  if (!pair) warnings.push("لم يتم التعرف على الزوج");

  // Timeframes: "📌 XAUUSD │ 15 │ 1س" or "📌 GOLD │ 1 │ 15د"
  const { timeframe, htfTimeframe } = extractTimeframes(text);

  // Stars
  const confidence = extractConfidence(text);

  // Entry price — NEVER fail, use 0 if not found
  const entry = extractEntry(text) ?? 0;
  if (entry === 0) warnings.push("لم يتم العثور على سعر الدخول — تم التعيين 0");

  // Stop loss
  const stopLoss = extractStopLoss(text);
  if (stopLoss === null) warnings.push("لم يتم العثور على وقف الخسارة");

  // Take profits with R:R
  const takeProfits = extractTakeProfitsWithRR(text);

  // Risk management data
  const riskData = extractRiskData(text);

  // HTF & SMC trends
  const htfTrend = extractHTFTrend(text);
  const smcTrend = extractSMCTrend(text);

  return {
    success: true,
    signal: {
      pair: pair || "UNKNOWN",
      type: signalType,
      entry,
      stopLoss: stopLoss || 0,
      takeProfits,
      confidence,
      timeframe,
      htfTimeframe,
      htfTrend,
      smcTrend,
      riskData,
      signalCategory: "ENTRY",
      rawText: text,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Parse TP Hit Alert
// ═══════════════════════════════════════════════════════════════
function parseTPHitAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const tpNum = extractTPNumber(text);
  const hitPrice = extractHitPrice(text);
  const pnlPoints = extractPnLPoints(text);
  const pnlDollar = extractPnLDollar(text);
  const isFullClose = /إغلاق كامل بالربح/.test(text);

  const tpStatusList = extractTPStatusList(text);
  const totalTPs = extractTotalTPCount(text);

  return {
    success: true,
    signal: {
      pair,
      type: "BUY", // Will be determined by the existing trade
      entry: 0,
      stopLoss: 0,
      takeProfits: [],
      confidence: 0,
      signalCategory: "TP_HIT",
      rawText: text,
      hitTpIndex: tpNum,
      hitPrice: hitPrice || 0,
      pnlPoints: pnlPoints || 0,
      pnlDollar: pnlDollar ?? undefined,
      tpStatusList,
      totalTPs: totalTPs || undefined,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Parse SL Hit Alert
// ═══════════════════════════════════════════════════════════════
function parseSLHitAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const slPrice = extractStopLoss(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text) || 0;
  const tpStatusList = extractTPStatusList(text);
  const totalTPs = extractTotalTPCount(text);
  const partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair,
      type: "BUY",
      entry: 0,
      stopLoss: slPrice,
      takeProfits: [],
      confidence: 0,
      signalCategory: "SL_HIT",
      rawText: text,
      hitTpIndex: -1,
      tpStatusList,
      totalTPs: totalTPs || undefined,
      partialWin,
      hitPrice: slPrice,
      pnlPoints,
      pnlDollar: pnlDollar ?? undefined,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Parse Breakeven Alert
// ═══════════════════════════════════════════════════════════════
function parseBreakevenAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const entry = extractEntry(text) || 0;
  const tpsHit = text.match(/تم تحقيق\s+(\d+)/)?.[1] || text.match(/(\d+)\/\d+\s*أهداف محققة/)?.[1] || "0";

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry, stopLoss: entry,
      takeProfits: [], confidence: 0,
      signalCategory: "BREAKEVEN", rawText: text,
      hitTpIndex: parseInt(tpsHit) || 0,
      hitPrice: entry,
      pnlPoints: 0,
      pnlDollar: undefined,
      tpStatusList: extractTPStatusList(text),
      totalTPs: extractTotalTPCount(text),
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Parse Reentry Signals
// ═══════════════════════════════════════════════════════════════
function parseReentrySignal(text: string): ParseResult {
  const signalType = /شراء/.test(text) ? "BUY" as const : "SELL" as const;
  const pair = extractPair(text) || "";
  const entry = extractEntry(text) || 0;
  const stopLoss = extractStopLoss(text) || 0;
  const takeProfits = extractTakeProfitsWithRR(text, "♻️");
  const riskData = extractRiskData(text);

  return {
    success: true,
    signal: {
      pair,
      type: signalType,
      entry,
      stopLoss,
      takeProfits,
      confidence: 0,
      signalCategory: "REENTRY",
      rawText: text,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
      riskData,
    },
  };
}

function parseReentryTPAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const tpNum = extractTPNumber(text);
  const hitPrice = extractHitPrice(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text);
  const tpStatusList = extractTPStatusList(text);
  const totalTPs = extractTotalTPCount(text);

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_TP", rawText: text,
      hitTpIndex: tpNum,
      hitPrice, pnlPoints, pnlDollar: pnlDollar ?? undefined,
      tpStatusList,
      totalTPs: totalTPs || undefined,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

function parseReentrySLAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const slPrice = extractStopLoss(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text);
  const partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: slPrice,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_SL", rawText: text,
      partialWin, hitPrice: slPrice, pnlPoints, pnlDollar: pnlDollar ?? undefined,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Parse Pyramid Signals
// ═══════════════════════════════════════════════════════════════
function parsePyramidSignal(text: string): ParseResult {
  const signalType = /شراء/.test(text) ? "BUY" as const : "SELL" as const;
  const pair = extractPair(text) || "";
  const entry = extractEntry(text) || 0;
  const stopLoss = extractStopLoss(text) || 0;
  const takeProfits = extractTakeProfitsWithRR(text, "🔥");
  const riskData = extractRiskData(text);

  return {
    success: true,
    signal: {
      pair, type: signalType, entry, stopLoss, takeProfits,
      confidence: 0, signalCategory: "PYRAMID", rawText: text,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData,
    },
  };
}

function parsePyramidTPAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const tpNum = extractTPNumber(text);
  const hitPrice = extractHitPrice(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text);
  const tpStatusList = extractTPStatusList(text);
  const totalTPs = extractTotalTPCount(text);

  return {
    success: true,
    signal: {
      hitTpIndex: tpNum,
      tpStatusList,
      totalTPs: totalTPs || undefined,
      pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_TP", rawText: text,
      hitPrice, pnlPoints, pnlDollar: pnlDollar ?? undefined,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

function parsePyramidSLAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const slPrice = extractStopLoss(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text);
  const partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: slPrice,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_SL", rawText: text,
      partialWin, hitPrice: slPrice, pnlPoints, pnlDollar: pnlDollar ?? undefined,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Fallback Basic Parser — NEVER fails
// ═══════════════════════════════════════════════════════════════
function parseBasicSignal(text: string): ParseResult {
  const signalType = extractSignalType(text);
  if (!signalType) {
    // Last resort: try generic format detection
    return parseGenericAlert(text);
  }

  const pair = extractPair(text) || "UNKNOWN";
  const entry = extractEntry(text);
  const stopLoss = extractStopLoss(text);
  const takeProfits = extractTakeProfitsWithRR(text);
  const confidence = extractConfidence(text);
  const { timeframe, htfTimeframe } = extractTimeframes(text);
  const htfTrend = extractHTFTrend(text);
  const smcTrend = extractSMCTrend(text);
  const riskData = extractRiskData(text);

  // NEVER fail — use 0 if no entry price found
  const finalEntry = entry ?? extractFallbackPrice(text) ?? 0;
  const hasWarnings = finalEntry === 0 ? ["لم يتم العثور على سعر الدخول"] : undefined;

  return {
    success: true,
    signal: {
      pair, type: signalType, entry: finalEntry, stopLoss: stopLoss || 0,
      takeProfits, confidence, signalCategory: "ENTRY",
      rawText: text, timeframe, htfTimeframe, htfTrend, smcTrend, riskData,
    },
    ...(hasWarnings ? { warnings: hasWarnings } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Generic Alert Parser — NEVER fails
//  Handles: "Buy BTCUSDT @ 65000", "Sell signal on ETHUSDT",
//  "Long BTCUSD at 85000", or any unknown format
// ═══════════════════════════════════════════════════════════════
function parseGenericAlert(text: string): ParseResult {
  const warnings: string[] = [];

  // Detect direction — NEVER fail, default to BUY
  let type: "BUY" | "SELL" = "BUY";
  if (/\b(?:BUY|LONG)\b/i.test(text) || /(?:شراء|بايع)/.test(text)) type = "BUY";
  else if (/\b(?:SELL|SHORT)\b/i.test(text) || /(?:بيع|سال)/.test(text)) type = "SELL";
  else if (/🔴|🔻/.test(text)) type = "SELL";
  else warnings.push("لم يتم التعرف على نوع الإشارة — تم افتراض شراء");

  // Extract pair
  const pair = extractPair(text) || extractGenericPair(text) || "UNKNOWN";

  // Extract price — NEVER fail
  const entry = extractEntry(text) ?? extractFallbackPrice(text) ?? 0;
  if (entry === 0) warnings.push("لم يتم العثور على سعر الدخول");

  const stopLoss = extractStopLoss(text);

  return {
    success: true,
    signal: {
      pair, type, entry, stopLoss: stopLoss || 0,
      takeProfits: [],
      confidence: 0,
      signalCategory: "ENTRY",
      rawText: text,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Extract pair from generic text: "BTCUSDT", "ETH/USD", "GOLD", etc.
function extractGenericPair(text: string): string | null {
  const patterns = [
    /(?:on|for|ل)\s+([A-Z]{3,12}(?:\/[A-Z]{3})?)/i,
    /([A-Z]{3,10}(?:USDT?|USD|EUR|GBP|JPY))/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return normalizePairName(m[1].replace(/\s/g, "").toUpperCase());
  }
  return null;
}

// Extract price from generic patterns: "@ 65000", "at $85,000", "price: 65000"
function extractFallbackPrice(text: string): number | null {
  const patterns = [
    /[@\s]\s*[$€£¥]?\s*([\d,]+\.?\d*)\s*(?:USDT?|USD)?\s*$/im,
    /(?:at|عند|على|سعر)\s*[:\-–]?\s*[$€£¥]?\s*([\d,]+\.?\d*)/i,
    /(?:price|السعر)\s*[:\-–]?\s*[$€£¥]?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (val > 0 && val < 1000000) return val;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  Extraction Functions
// ═══════════════════════════════════════════════════════════════

function extractSignalType(text: string): "BUY" | "SELL" | null {
  if (/🟢/.test(text) && /إشارة شراء/.test(text)) return "BUY";
  if (/🔴/.test(text) && /إشارة بيع/.test(text)) return "SELL";
  if (/🟢/.test(text) && !/🔴/.test(text)) return "BUY";
  if (/🔴/.test(text) && !/🟢/.test(text)) return "SELL";
  if (/إشارة شراء/.test(text)) return "BUY";
  if (/إشارة بيع/.test(text)) return "SELL";
  if (/BUY/i.test(text)) return "BUY";
  if (/SELL/i.test(text)) return "SELL";
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  Normalize pair names — ensure consistent storage
// ═══════════════════════════════════════════════════════════════
function normalizePairName(pair: string): string {
  const aliases: Record<string, string> = {
    "GOLD": "XAUUSD", "XAU": "XAUUSD", "XAUUSDUSD": "XAUUSD",
    "SILVER": "XAGUSD", "XAG": "XAGUSD",
    "BTCUSDT": "BTCUSDT", "BTCUSD": "BTCUSDT",
    "ETHUSDT": "ETHUSDT", "ETHUSD": "ETHUSDT",
    "US30": "US30", "NAS100": "NAS100", "NASDAQ": "NAS100",
    "US500": "US500", "SPX500": "US500",
    "DAX": "DAX40", "DAX40": "DAX40",
    "UK100": "UK100", "GER40": "GER40", "JPN225": "JPN225",
  };
  return aliases[pair] || pair;
}

function extractPair(text: string): string | null {
  // Priority 1: After 📌 (most accurate — from FOREXYEMENI format)
  // Supports: GOLD, XAUUSD, BTCUSDT, SOLUSDT, NAS100, EUR/USD, etc.
  const pinMatch = text.match(/📌\s*([A-Za-z]{2,15}(?:\/[A-Za-z]{3})?)/i);
  if (pinMatch) return normalizePairName(pinMatch[1].replace(/\s/g, "").toUpperCase());

  // Remove links first to prevent matching words from URLs
  let cleanText = text.replace(/t\.me\/[^\s]*/gi, "").replace(/http[^\s]*/gi, "");

  // Priority 2: Any crypto pair ending in USDT (catches ALL crypto pairs automatically)
  const cryptoMatch = cleanText.match(/\b([A-Z]{2,12}USDT?)\b/);
  if (cryptoMatch) return normalizePairName(cryptoMatch[1]);

  // Priority 3: Known specific patterns
  const patterns = [
    /(?:XAU|GOLD)(?:USD)?/i,
    /(?:XAG|SILVER)(?:USD)?/i,
    /(?:USOIL|CRUDE|OIL|CL)/i,
    /(?:NAS|US30|DAX|US500|SPX|NDX|UK100|GER40|JPN225)\d*/i,
    /EUR\s*\/?\s*USD/i,
    /GBP\s*\/?\s*USD/i,
    /USD\s*\/?\s*JPY/i,
    /AUD\s*\/?\s*USD/i,
    /NZD\s*\/?\s*USD/i,
    /USD\s*\/?\s*CAD/i,
    /USD\s*\/?\s*CHF/i,
    /EUR\s*\/?\s*GBP/i,
    /EUR\s*\/?\s*JPY/i,
    /GBP\s*\/?\s*JPY/i,
    /BTC\s*\/?\s*USDT?/i,
    /ETH\s*\/?\s*USDT?/i,
  ];
  for (const p of patterns) {
    const m = cleanText.match(p);
    if (m) return normalizePairName(m[0].replace(/\s/g, "").toUpperCase());
  }

  // Priority 4: Any uppercase symbol (3-12 chars)
  const anyMatch = cleanText.match(/\b([A-Z]{3,12}(?:\/[A-Z]{3})?)\b/);
  if (anyMatch) return anyMatch[1];
  return null;
}

function extractTimeframes(text: string): { timeframe: string; htfTimeframe: string } {
  let timeframe = "";
  let htfTimeframe = "";

  // Pattern: "📌 XAUUSD │ 15 │ 1س" (old) or "📌 GOLD │ 1 │ 15د" (new)
  // The new format has the timeframe with Arabic suffix in the THIRD position
  const tfMatch = text.match(/│\s*(\d+\s*[سدشمdmhHWMwD]?)\s*│\s*(\d+\s*[سدشمdmhHWMwD]?)/);
  if (tfMatch) {
    const val1 = tfMatch[1].trim();
    const val2 = tfMatch[2].trim();
    // Check which value has a time suffix — that one is the timeframe
    const suffixOnly = (v: string) => v.replace(/[\d\s]/g, "");
    const hasSuffix1 = /[سدشمdmhHWMwD]/i.test(suffixOnly(val1));
    const hasSuffix2 = /[سدشمdmhHWMwD]/i.test(suffixOnly(val2));
    if (hasSuffix2 && !hasSuffix1) {
      // New format: "│ 1 │ 15د" -> TF=15د, HTF=1
      timeframe = val2;
      htfTimeframe = val1;
    } else {
      // Old format: "│ 15 │ 1س" -> TF=15, HTF=1س
      timeframe = val1;
      htfTimeframe = val2;
    }
  }

  // Also check trend line for actual timeframe: "📈 15د: هابط"
  const trendTfMatch = text.match(/📈\s*(\d+\s*[سدشم]?|[a-zA-Z]+|يومي|أسبوعي|شهري)\s*:/);
  if (trendTfMatch) {
    const trendTf = trendTfMatch[1].trim();
    // If trend line has a clear timeframe suffix, use it as the primary TF
    if (/[سدشم]/.test(trendTf) || /[mhdwMHDW]/i.test(trendTf)) {
      timeframe = trendTf;
    }
  }

  // Fallback: extract HTF from Arabic names
  if (!htfTimeframe) {
    if (/يومي/.test(text)) htfTimeframe = "يومي";
    else if (/أسبوعي/.test(text)) htfTimeframe = "أسبوعي";
    else if (/شهري/.test(text)) htfTimeframe = "شهري";
  }

  return { timeframe, htfTimeframe };
}

function extractConfidence(text: string): number {
  const stars = text.match(/⭐/g);
  const starCount = stars ? stars.length : 0;
  return Math.min(starCount, 5);
}

function extractEntry(text: string): number | null {
  const patterns = [
    /(?:الدخول|Entry)\s*[:\-–]?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ""));
  }
  return null;
}

function extractStopLoss(text: string): number | null {
  // Remove "مسافة الوقف: X نقطة" lines FIRST to avoid matching the distance as SL price
  const cleanText = text.replace(/مسافة الوقف\s*[:\-–]?\s*[\d,.]+(?:\s*نقطة)?/gi, "");

  const patterns = [
    // Primary: "الوقف : <price>" or "الوقف: <price>" or "الوقف :<price>"
    // Handles all Unicode colons/space variations from the indicator
    /(?:الوقف|وقف الخسارة|Stop\s*Loss|SL)\s*[:\u003A\uFF1A\uFE55\-–—]\s*([\d,]+\.?\d*)/i,
    // Fallback: just find "الوقف" and grab the FIRST number after it (within 30 chars)
    /الوقف[^\d]{0,30}([\d,]+\.?\d*)/i,
    // Fallback: "الوقف" followed by any separator then digits on the same line
    /الوقف[^\n]*?([\d,]+\.\d+)/i,
    // Fallback: "❌ <price> │" pattern from SL hit alerts
    /❌\s*([\d,]+\.?\d*)\s*[│|]/,
    // Fallback: 🔴 followed by digits near "وقف"
    /🔴[^\n]*?الوقف[^\d]*([\d,]+\.?\d*)/i,
  ];
  for (const p of patterns) {
    const m = cleanText.match(p);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (val > 0) return val;
    }
  }
  return null;
}

function extractTakeProfitsWithRR(text: string, prefix = "TP"): TakeProfitDetail[] {
  const tps: TakeProfitDetail[] = [];
  const allMatches: { index: number; tp: number; rr: number }[] = [];
  const seen = new Set<string>();

  // Pattern: "🎯 TP1: 2371.100 │ R:R 0.38" or "🎯 TP1: 2371.100 │ R:R 1:0.38"
  // Also: "♻️ TP1: ..." or "🔥 TP1: ..."
  const lineRegex = /(?:🎯|♻️|🔥)\s*TP\s*(\d+)\s*[:\-–]?\s*([\d,]+\.?\d*)\s*[│|]\s*R:?\s*R:?\s*([\d,.]+)/gi;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    const key = `${match[1]}-${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      allMatches.push({
        index: parseInt(match[1]),
        tp: parseFloat(match[2].replace(/,/g, "")),
        rr: parseFloat(match[3].replace(/,/g, "")),
      });
    }
  }

  // Fallback: TPs without R:R
  if (allMatches.length === 0) {
    const simplePatterns = [
      /(?:TP|tp|هدف)\s*(\d+)\s*[:\-–]?\s*([\d,]+\.?\d*)/g,
    ];
    for (const p of simplePatterns) {
      let m;
      while ((m = p.exec(text)) !== null) {
        const key = `${m[1]}-${m[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          allMatches.push({
            index: parseInt(m[1]),
            tp: parseFloat(m[2].replace(/,/g, "")),
            rr: 0,
          });
        }
      }
    }
  }

  allMatches.sort((a, b) => a.index - b.index);
  for (const item of allMatches) {
    tps.push({ tp: item.tp, rr: item.rr });
  }

  return tps;
}

function extractRiskData(text: string): RiskData {
  const data = emptyRiskData();

  // Balance
  const balMatch = text.match(/الرصيد\s*[:\-–]?\s*\$?\s*([\d,]+\.?\d*)/);
  if (balMatch) data.balance = parseFloat(balMatch[1].replace(/,/g, ""));

  // Lot size
  const lotMatch = text.match(/حجم اللوت\s*[:\-–]?\s*(.+?)(?:\n|$)/);
  if (lotMatch) data.lotSize = lotMatch[1].trim();

  // Risk target
  const riskMatch = text.match(/خطر مستهدف\s*[:\-–]?\s*\$?\s*([\d,.]+)\s*\(([\d,.]+)%\)/);
  if (riskMatch) {
    data.riskTarget = parseFloat(riskMatch[1].replace(/,/g, ""));
    data.riskPercent = parseFloat(riskMatch[2].replace(/,/g, ""));
  }

  // Actual risk
  const actualMatch = text.match(/(?:خسارة فعلية|خطر فعلي)\s*[:\-–]?\s*\$?\s*([\d,.]+)\s*\(([\d,.]+)%\)/);
  if (actualMatch) {
    data.actualRisk = parseFloat(actualMatch[1].replace(/,/g, ""));
    data.actualRiskPct = parseFloat(actualMatch[2].replace(/,/g, ""));
  }

  // SL distance
  const distMatch = text.match(/مسافة الوقف\s*[:\-–]?\s*([\d,.]+)/);
  if (distMatch) data.slDistance = parseFloat(distMatch[1].replace(/,/g, ""));

  // Max R:R
  const rrMatch = text.match(/R:R الأقصى\s*[:\-–]?\s*1:([\d,.]+)/);
  if (rrMatch) data.maxRR = parseFloat(rrMatch[1].replace(/,/g, ""));

  // Instrument — try both Arabic label and full format from Pine Script
  const instMatch = text.match(/(?:الأداة|instrument)\s*[:\-–]?\s*(.+?)(?:\n|$)/);
  if (instMatch) data.instrument = instMatch[1].trim();
  // Fallback: detect instrument from pair name if not found
  if (!data.instrument) {
    const upperPair = text.toUpperCase();
    if (/XAU|GOLD/.test(upperPair)) data.instrument = "الذهب (XAUUSD)";
    else if (/XAG|SILVER/.test(upperPair)) data.instrument = "الفضة (XAGUSD)";
    else if (/USDT/.test(upperPair)) data.instrument = "عملات رقمية";
    else if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK/.test(upperPair)) data.instrument = "عملات رقمية";
    else if (/NAS|US30|DAX|US500|SPX|NDX|UK100|GER40|JPN225/.test(upperPair)) data.instrument = "مؤشرات (NAS/DOW)";
    else if (/USOIL|CRUDE|OIL|CL/.test(upperPair)) data.instrument = "نفط";
    else data.instrument = "فوركس";
  }

  return data;
}

function extractHTFTrend(text: string): string {
  const match = text.match(/📈\s*\S+\s*:\s*(صاعد|هابط)\s*[🐂🐻]?/);
  if (match) return match[1];
  if (/صاعد/.test(text) && !/هابط/.test(text)) return "صاعد";
  if (/هابط/.test(text) && !/صاعد/.test(text)) return "هابط";
  return "";
}

function extractSMCTrend(text: string): string {
  const match = text.match(/SMC\s*[:\-–]?\s*(صاعد|هابط|محايد)/);
  if (match) return match[1];
  return "";
}

function extractTPNumber(text: string): number {
  // For "تحقق الهدف X إلى Y" or "الهدف X - Y" or "الهدف X → Y" (range pattern)
  // e.g. "تحقق الهدف 6 إلى 7" → return 7 (last hit target)
  const rangeMatch = text.match(/(?:تحقق\s+)?(?:هدف)\s*(?:التعويض|التعزيز)?\s*(\d+)\s*(?:إلى|الى|[-–—→>|])\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[2]); // Return the LAST number in range

  // For "تحقق الهدف X" or "الهدف X" (single target)
  const explicitMatch = text.match(/(?:تحقق\s+)?(?:هدف)\s*(?:التعويض|التعزيز)?\s*(\d+)/);
  if (explicitMatch) return parseInt(explicitMatch[1]);

  // For full close "إغلاق كامل بالربح" — find the HIGHEST TP number (all hit)
  if (/إغلاق كامل بالربح/.test(text)) {
    let maxTP = -1;
    const tpRegex = /TP\s*(\d+)/gi;
    let m;
    while ((m = tpRegex.exec(text)) !== null) {
      const n = parseInt(m[1]);
      if (n > maxTP) maxTP = n;
    }
    return maxTP;
  }

  // For "قفزة سعرية" (price jump) — count ONLY the HIT (✅) TPs, not pending (⏳)
  // This is CRITICAL: the signal lists ALL TPs (1-10), but only some are hit
  // We must return the LAST HIT TP, not the highest TP number in the text
  if (/قفزة سعرية/.test(text)) {
    let maxHitTP = -1;
    const hitRegex = /✅\s*TP\s*(\d+)/gi;
    let m;
    while ((m = hitRegex.exec(text)) !== null) {
      const n = parseInt(m[1]);
      if (n > maxHitTP) maxHitTP = n;
    }
    if (maxHitTP > 0) return maxHitTP;
    // Fallback: look for ← الآن marker on any TP
    const nowRegex = /TP\s*(\d+)[^\n]*←\s*الآن/gi;
    const nowMatch = nowRegex.exec(text);
    if (nowMatch) return parseInt(nowMatch[1]);
    // Last fallback for jump: highest TP number (old behavior)
    let maxTP = -1;
    const tpRegex = /TP\s*(\d+)/gi;
    while ((m = tpRegex.exec(text)) !== null) {
      const n = parseInt(m[1]);
      if (n > maxTP) maxTP = n;
    }
    return maxTP;
  }

  // Fallback: first TP number found
  const fallback = text.match(/TP\s*(\d+)/i);
  if (fallback) return parseInt(fallback[1]);

  return -1;
}

function extractHitPrice(text: string): number | null {
  const match = text.match(/🎯\s*([\d,]+\.?\d*)\s*│/);
  if (match) return parseFloat(match[1].replace(/,/g, ""));
  return null;
}

function extractPnLPoints(text: string): number | null {
  const match = text.match(/([+-]?[\d,.]+)\s*نقطة/);
  if (match) return parseFloat(match[1].replace(/,/g, ""));
  return null;
}

function extractPnLDollar(text: string): number | null {
  // Try matching specific patterns - require $ sign to avoid matching prices
  const patterns = [
    /(?:ربح تقريبي|ربح)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/,
    /(?:الخسارة|خسارة)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/,
    /\$\s*[+\-]?([\d,.]+)\s*(?:ربح|خسارة|نقطة)/,
    /(?:إجمالي الربح|الربح الإجمالي|إجمالي ربح)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/,
    /(?:الربح|ربح)\s*[:\s]*[+\-]?\$\s*([\d,.]+)/,
    /(?:Profit|P&L|PnL)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ""));
      if (!isFinite(val) || val === 0) continue;
      if (Math.abs(val) > 50000) continue;
      const isLoss = /الخسارة|خسارة|Loss/i.test(match[0]);
      const hasPlusSign = /\+/.test(match[0]);
      if (isLoss && !hasPlusSign) return -val;
      return val;
    }
  }
  return null;
}

function extractTPStatusList(text: string): string {
  // Extract lines like "✅ TP1: 2355 ← الآن" or "⏳ TP2: 2360" or "✅ TP1 2355"
  const lines: string[] = [];
  const regex = /[✅⏳]\s*TP\s*\d+\s*:\s*[\d,.]+(?:\s*←\s*الآن)?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lines.push(match[0].trim());
  }
  return lines.join("\n");
}

function extractTotalTPCount(text: string): number {
  // Count total TPs from the status list (both ✅ and ⏳)
  const regex = /[✅⏳]\s*TP\s*\d+\s*:\s*[\d,.]+/g;
  const matches = text.match(regex);
  if (matches && matches.length > 0) return matches.length;
  // Fallback: count TP patterns with prices
  const tpPatterns = text.match(/TP\s*\d+[:\s][\d,.]+/gi);
  return tpPatterns ? tpPatterns.length : 0;
}

function emptyRiskData(): RiskData {
  return {
    balance: 0, lotSize: "", riskTarget: 0, riskPercent: 0,
    actualRisk: 0, actualRiskPct: 0, slDistance: 0, maxRR: 0, instrument: "",
  };
}

export function validateSignal(signal: ParsedSignal): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // Only check for clearly invalid prices — entry=0 is acceptable (generic alerts)
  if (signal.entry > 0 && signal.entry < 0.00001) errors.push("سعر الدخول غير صالح");
  return { valid: errors.length === 0, errors };
}
