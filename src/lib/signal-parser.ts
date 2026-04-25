/**
 * FOREXYEMENI-PRO Signal Parser
 * Parses signals from the FOREXYEMENI-PRO-v1.10 TradingView indicator
 * Handles full format including risk management, HTF, SMC, and all alert types
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
//  Main Parser
// ═══════════════════════════════════════════════════════════════
export function parseTradingViewSignal(rawText: string): ParseResult {
  const warnings: string[] = [];
  const text = rawText.trim();

  if (!text) {
    return { success: false, error: "النص فارغ" };
  }

  // 1. Determine signal category first
  const category = detectSignalCategory(text);

  // 2. Parse based on category
  switch (category) {
    case "ENTRY":
      return parseEntrySignal(text);
    case "TP_HIT":
      return parseTPHitAlert(text);
    case "SL_HIT":
      return parseSLHitAlert(text);
    case "BREAKEVEN":
      return parseBreakevenAlert(text);
    case "REENTRY":
      return parseReentrySignal(text);
    case "REENTRY_TP":
      return parseReentryTPAlert(text);
    case "REENTRY_SL":
      return parseReentrySLAlert(text);
    case "PYRAMID":
      return parsePyramidSignal(text);
    case "PYRAMID_TP":
      return parsePyramidTPAlert(text);
    case "PYRAMID_SL":
      return parsePyramidSLAlert(text);
    default:
      // Fallback to basic parser
      return parseBasicSignal(text);
  }
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
//  Parse ENTRY Signal (Full FOREXYEMENI Format)
// ═══════════════════════════════════════════════════════════════
function parseEntrySignal(text: string): ParseResult {
  const warnings: string[] = [];

  // Signal type
  const signalType = extractSignalType(text);
  if (!signalType) {
    return { success: false, error: "لم يتم التعرف على نوع الإشارة" };
  }

  // Pair
  const pair = extractPair(text);
  if (!pair) warnings.push("لم يتم التعرف على الزوج");

  // Timeframes: "📌 XAUUSD │ 15 │ 1س"
  const { timeframe, htfTimeframe } = extractTimeframes(text);

  // Stars
  const confidence = extractConfidence(text);

  // Entry price
  const entry = extractEntry(text);
  if (entry === null) return { success: false, error: "لم يتم العثور على سعر الدخول" };

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
//  Fallback Basic Parser
// ═══════════════════════════════════════════════════════════════
function parseBasicSignal(text: string): ParseResult {
  const signalType = extractSignalType(text);
  if (!signalType) {
    // Last resort: try generic format detection
    // Supports: "Buy BTCUSDT @ 65000" / "Sell ETHUSDT 3000" / "BUY XAUUSD 2650"
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

  if (entry === null) {
    // Last resort: try extracting price from text patterns like "@ 65000" or "at 65000"
    const fallbackEntry = extractFallbackPrice(text);
    if (fallbackEntry !== null) {
      return {
        success: true,
        signal: {
          pair, type: signalType, entry: fallbackEntry, stopLoss: stopLoss || 0,
          takeProfits, confidence, signalCategory: "ENTRY",
          rawText: text, timeframe, htfTimeframe, htfTrend, smcTrend, riskData,
        },
      };
    }
    return { success: false, error: "لم يتم العثور على سعر الدخول" };
  }

  return {
    success: true,
    signal: {
      pair, type: signalType, entry, stopLoss: stopLoss || 0,
      takeProfits, confidence, signalCategory: "ENTRY",
      rawText: text, timeframe, htfTimeframe, htfTrend, smcTrend, riskData,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Generic Alert Parser (for non-FOREXYEMENI formats)
//  Handles: "Buy BTCUSDT @ 65000", "Sell signal on ETHUSDT",
//  "Long BTCUSD at 85000", etc.
// ═══════════════════════════════════════════════════════════════
function parseGenericAlert(text: string): ParseResult {
  const upper = text.toUpperCase();

  // Detect direction — no \b for Arabic (word boundary doesn't work with Arabic chars)
  let type: "BUY" | "SELL" | null = null;
  if (/\b(?:BUY|LONG)\b/i.test(text) || /(?:شراء|بايع)/.test(text)) type = "BUY";
  else if (/\b(?:SELL|SHORT)\b/i.test(text) || /(?:بيع|سال)/.test(text)) type = "SELL";

  if (!type) {
    return { success: false, error: "لم يتم التعرف على نوع الإشارة — يجب أن يحتوي على Buy/Sell/شراء/بيع" };
  }

  // Extract pair (prefer this since we already know it's a generic format)
  const pair = extractPair(text) || extractGenericPair(text) || "UNKNOWN";

  // Extract price from various patterns
  const entry = extractEntry(text) || extractFallbackPrice(text);
  if (entry === null) {
    // Even without a price, still create the signal (some alerts are just notifications)
    return {
      success: true,
      signal: {
        pair, type,
        entry: 0,
        stopLoss: 0,
        takeProfits: [],
        confidence: 0,
        signalCategory: "ENTRY",
        rawText: text,
        timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
        riskData: emptyRiskData(),
      },
      warnings: ["لم يتم العثور على سعر الدخول — تم إنشاء إشارة بدون سعر"],
    };
  }

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
    warnings: ["إشارة بتنسيق عام — بعض البيانات غير متوفرة"],
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
    "US30": "US30", "NAS100": "NAS100",
  };
  return aliases[pair] || pair;
}

function extractPair(text: string): string | null {
  // الأولوية 1: بعد 📌 (الأكثر دقة - من تنسيق FOREXYEMENI)
  const pinMatch = text.match(/📌\s*([A-Za-z]{3,12}(?:\/[A-Za-z]{3})?)/i);
  if (pinMatch) return normalizePairName(pinMatch[1].replace(/\s/g, "").toUpperCase());

  // الأولوية 2: أنماط محددة (نبحث في النص ما عدا الروابط)
  // نزيل الروابط أولاً لمنع تطابق كلمة GOLD من رابط تليجرام
  let cleanText = text.replace(/t\.me\/[^\s]*/gi, "").replace(/http[^\s]*/gi, "");

  const patterns = [
    /(?:XAU|GOLD)(?:USD)?/i,
    /(?:XAG|SILVER)(?:USD)?/i,
    /EUR\s*\/?\s*USD/i,
    /GBP\s*\/?\s*USD/i,
    /USD\s*\/?\s*JPY/i,
    /BTC\s*\/?\s*USDT?/i,
    /ETH\s*\/?\s*USDT?/i,
  ];
  for (const p of patterns) {
    const m = cleanText.match(p);
    if (m) return normalizePairName(m[0].replace(/\s/g, "").toUpperCase());
  }

  // الأولوية 3: أي رمز أزواج
  const anyMatch = cleanText.match(/\b([A-Z]{3,10}(?:\/[A-Z]{3})?)\b/);
  if (anyMatch) return anyMatch[1];
  return null;
}

function extractTimeframes(text: string): { timeframe: string; htfTimeframe: string } {
  let timeframe = "";
  let htfTimeframe = "";

  // Pattern: "📌 XAUUSD │ 15 │ 1س"
  // Pattern: "📌 XAUUSD │ 15 │ 1س" (2 separators, not 3)
  const tfMatch = text.match(/│\s*(\d+[sdmHWM]?)\s*│\s*(\d+\s*[سدشم]?)/);
  if (tfMatch) {
    timeframe = tfMatch[1].trim();
    htfTimeframe = tfMatch[2].trim();
  }

  // Fallback HTF from trend line (supports Arabic names: يومي, أسبوعي, شهري)
  if (!htfTimeframe) {
    const htfMatch = text.match(/📈\s*(\d+\s*[سدشم]?|[a-zA-Z]+|يومي|أسبوعي|شهري|شهري)\s*:/);
    if (htfMatch) htfTimeframe = htfMatch[1].trim();
  }

  // Fallback: extract HTF from text containing Arabic timeframe names
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
  // Also remove "مسافة الوقف: X" without "نقطة" (some formats omit it)
  const cleanText = text.replace(/مسافة الوقف\s*[:\-–]?\s*[\d,.]+(?:\s*نقطة)?/gi, "");

  const patterns = [
    // Primary: "الوقف : <price>" or "الوقف: <price>"
    /(?:الوقف|وقف الخسارة|Stop\s*Loss|SL)\s*[:\-–]?\s*([\d,]+\.?\d*)/i,
    // Fallback: "الوقف: <price>" with space before colon (Pine Script format)
    /الوقف\s*:\s*([\d,]+\.?\d*)/i,
    // Fallback: "❌ <price> │" pattern from SL hit alerts
    /❌\s*([\d,]+\.?\d*)\s*[│|]/,
  ];
  for (const p of patterns) {
    const m = cleanText.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ""));
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
    else if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE/.test(upperPair)) data.instrument = "عملات رقمية";
    else if (/NAS|US30|DAX|US500|SPX|NDX/.test(upperPair)) data.instrument = "مؤشرات (NAS/DOW)";
    else if (/USOIL|CRUDE|OIL/.test(upperPair)) data.instrument = "نفط";
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
  // For "تحقق الهدف X" or "الهدف X"
  const explicitMatch = text.match(/(?:تحقق\s+)?(?:هدف)\s*(?:التعويض|التعزيز)?\s*(\d+)/);
  if (explicitMatch) return parseInt(explicitMatch[1]);

  // For full close "إغلاق كامل بالربح" or jump "قفزة سعرية" — find the HIGHEST TP number
  if (/إغلاق كامل بالربح/.test(text) || /قفزة سعرية/.test(text)) {
    let maxTP = -1;
    const tpRegex = /TP\s*(\d+)/gi;
    let m;
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
  // v4.0 format: "ربح تقريبي: +$20.00" or "الخسارة: $5.00"
  const patterns = [
    /(?:ربح تقريبي|ربح)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/,
    /(?:الخسارة|خسارة)\s*[:\s\-–]*[+\-]?\$\s*([\d,.]+)/,
    /\$\s*[+\-]?([\d,.]+)\s*(?:ربح|خسارة|نقطة)/,
    // Extra patterns for various TP hit alert formats
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
      // Loss patterns return negative, profit patterns return positive
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
  // Only require entry > 0 for signals that have a price
  // Generic alerts (without price) set entry=0, which is acceptable
  if (signal.entry > 0 && signal.entry < 0.00001) errors.push("سعر الدخول غير صالح");
  // Stop loss is optional — many signals don't include it
  return { valid: errors.length === 0, errors };
}
