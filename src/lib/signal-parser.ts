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
  if (/الوقف الأساسي/.test(text) || /الوقف المتتبع/.test(text) || /التأمين/.test(text)) return "SL_HIT";
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
      pnlDollar: pnlDollar || 0,
      tpStatusList,
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
      partialWin,
      hitPrice: slPrice,
      pnlPoints,
      pnlDollar,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
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
  const hitPrice = extractHitPrice(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text) || 0;

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_TP", rawText: text,
      hitPrice, pnlPoints, pnlDollar,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

function parseReentrySLAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const slPrice = extractStopLoss(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text) || 0;
  const partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: slPrice,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_SL", rawText: text,
      partialWin, hitPrice: slPrice, pnlPoints, pnlDollar,
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
  const hitPrice = extractHitPrice(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text) || 0;

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_TP", rawText: text,
      hitPrice, pnlPoints, pnlDollar,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRiskData(),
    },
  };
}

function parsePyramidSLAlert(text: string): ParseResult {
  const pair = extractPair(text) || "";
  const slPrice = extractStopLoss(text) || 0;
  const pnlPoints = extractPnLPoints(text) || 0;
  const pnlDollar = extractPnLDollar(text) || 0;
  const partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair, type: "BUY", entry: 0, stopLoss: slPrice,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_SL", rawText: text,
      partialWin, hitPrice: slPrice, pnlPoints, pnlDollar,
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
  if (!signalType) return { success: false, error: "لم يتم التعرف على نوع الإشارة" };

  const pair = extractPair(text) || "UNKNOWN";
  const entry = extractEntry(text);
  const stopLoss = extractStopLoss(text);
  const takeProfits = extractTakeProfitsWithRR(text);
  const confidence = extractConfidence(text);
  const { timeframe, htfTimeframe } = extractTimeframes(text);
  const htfTrend = extractHTFTrend(text);
  const smcTrend = extractSMCTrend(text);
  const riskData = extractRiskData(text);

  if (entry === null) return { success: false, error: "لم يتم العثور على سعر الدخول" };

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

function extractPair(text: string): string | null {
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
    const m = text.match(p);
    if (m) return m[0].replace(/\s/g, "").toUpperCase();
  }
  // After 📌
  const pinMatch = text.match(/📌\s*([A-Za-z]{3,12}(?:\/[A-Za-z]{3})?)/i);
  if (pinMatch) return pinMatch[1].replace(/\s/g, "").toUpperCase();

  const anyMatch = text.match(/\b([A-Z]{3,10}(?:\/[A-Z]{3})?)\b/);
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

  // Fallback HTF from trend line
  if (!htfTimeframe) {
    const htfMatch = text.match(/📈\s*(\d+\s*[سدشم]?|[a-zA-Z]+)\s*:/);
    if (htfMatch) htfTimeframe = htfMatch[1].trim();
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
  const patterns = [
    /(?:الوقف|وقف الخسارة|Stop\s*Loss|SL)\s*[:\-–]?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
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

  // Instrument
  const instMatch = text.match(/(?:الأداة|instrument)\s*[:\-–]?\s*(.+?)(?:\n|$)/);
  if (instMatch) data.instrument = instMatch[1].trim();

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
  const match = text.match(/(?:الهدف|تحقق الهدف)\s*(\d+)/);
  if (match) return parseInt(match[1]);
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
  const match = text.match(/(?:ربح تقريبي|ربح|الخسارة|خسارة)[s:]?\s*[:\-–]?\s*[+-]?\$?([\d,.]+)/);
  if (match) {
    const val = parseFloat(match[1].replace(/,/g, ""));
    return /الخسارة|خسارة/.test(match[0]) && !/\+/.test(match[0]) ? -val : val;
  }
  return null;
}

function extractTPStatusList(text: string): string {
  // Extract lines like "✅ TP1: 2355 ← الآن" or "⏳ TP2: 2360"
  const lines: string[] = [];
  const regex = /[✅⏳]\s*TP\d+[:\s][\d,.]+(?:\s*←\s*الآن)?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lines.push(match[0].trim());
  }
  return lines.join("\n");
}

function emptyRiskData(): RiskData {
  return {
    balance: 0, lotSize: "", riskTarget: 0, riskPercent: 0,
    actualRisk: 0, actualRiskPct: 0, slDistance: 0, maxRR: 0, instrument: "",
  };
}

export function validateSignal(signal: ParsedSignal): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (signal.entry <= 0) errors.push("سعر الدخول غير صالح");
  if (signal.stopLoss <= 0 && signal.signalCategory === "ENTRY") errors.push("وقف الخسارة غير صالح");
  return { valid: errors.length === 0, errors };
}
