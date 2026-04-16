/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║            FOREXYEMENI-PRO — Google Apps Script v2.0                    ║
 * ║     محلل إشارات TradingView الذكي (نص ← JSON ← التطبيق)              ║
 * ║                                                                        ║
 * ║  الاستخدام:                                                            ║
 * ║  1. انسخ هذا الكود إلى Google Apps Script (script.google.com)           ║
 * ║  2. غيّر APP_URL إلى رابط تطبيقك Next.js                               ║
 * ║  3. Deploy > New deployment > Web app                                  ║
 * ║  4. استخدم رابط Web App كـ Webhook URL في TradingView                   ║
 * ║                                                                        ║
 * ║  الاختبار:                                                             ║
 * ║  - شغّل الدوال يدوياً من قائمة "FOREXYEMENI PRO"                       ║
 * ║  - أو افتح الرابط: ?action=test_entry                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════
//  ⚙️ الإعدادات — غيّر هذه القيم
// ═══════════════════════════════════════════════════════
var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";
var SHEET_NAME = "Signals";
var SHEET_NAME_LOG = "SignalLog";

// ═══════════════════════════════════════════════════════
//  🌐 نقطة النهاية الرئيسية (Webhook — POST)
// ═══════════════════════════════════════════════════════
function doPost(e) {
  try {
    var rawText = "";

    // استقبال النص من TradingView
    if (e.postData) {
      if (e.postData.contents) {
        rawText = e.postData.contents;
      } else if (e.postData.type === "application/x-www-form-urlencoded") {
        var params = e.postData.contents.split("&");
        for (var i = 0; i < params.length; i++) {
          var kv = params[i].split("=");
          if (kv[0] === "text" || kv[0] === "message" || kv[0] === "signal") {
            rawText = decodeURIComponent(kv[1].replace(/\+/g, " "));
            break;
          }
        }
      }
    }

    if (!rawText.trim()) {
      return jsonResponse({ success: false, error: "النص فارغ" }, 400);
    }

    // تحليل الإشارة
    var parseResult = parseSignal(rawText);

    if (!parseResult.success) {
      return jsonResponse({ success: false, error: parseResult.error }, 400);
    }

    // تسجيل في Google Sheets
    var rowId = logToSheet(parseResult);

    // إرسال لتطبيق Next.js
    var appResult = sendToApp(parseResult);

    return jsonResponse({
      success: true,
      signal: parseResult.signal,
      sheetRow: rowId,
      appResult: appResult,
      warnings: parseResult.warnings
    });

  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════
//  🌐 نقطة نهاية GET (اختبار من المتصفح)
// ═══════════════════════════════════════════════════════
function doGet(e) {
  var action = e.parameter.action || "";

  switch(action) {
    case "test_entry":
      return testEntrySignal();
    case "test_tp":
      return testTPHitSignal();
    case "test_tp_full":
      return testTPFullCloseSignal();
    case "test_tp_jump":
      return testTPJumpSignal();
    case "test_sl":
      return testSLHitSignal();
    case "test_sl_breakeven":
      return testSLBreakevenSignal();
    case "test_sl_trailing":
      return testSLTrailingSignal();
    case "test_sl_insurance":
      return testSLInsuranceSignal();
    case "test_reentry":
      return testReentrySignal();
    case "test_reentry_tp":
      return testReentryTPSignal();
    case "test_reentry_sl":
      return testReentrySLSignal();
    case "test_pyramid":
      return testPyramidSignal();
    case "test_pyramid_tp":
      return testPyramidTPSignal();
    case "test_pyramid_sl":
      return testPyramidSLSignal();
    case "test_sell":
      return testSellEntrySignal();
    case "test_all":
      return testAllSignals();
    case "list":
      var signals = getAllSignalsFromSheet();
      return jsonResponse({ success: true, count: signals.length, signals: signals });
    default:
      return jsonResponse({
        success: true,
        message: "FOREXYEMENI-PRO Webhook is running ✅",
        version: "2.0",
        testEndpoints: {
          test_entry: "إشارة شراء (BUY)",
          test_tp: "تحقق هدف",
          test_tp_full: "إغلاق كامل بالربح",
          test_tp_jump: "قفزة سعرية",
          test_sl: "ضرب الوقف",
          test_sl_breakeven: "الوقف الأساسي (تعادل)",
          test_sl_trailing: "الوقف المتتبع",
          test_sl_insurance: "التأمين",
          test_reentry: "صفقة تعويض",
          test_reentry_tp: "هدف تعويض",
          test_reentry_sl: "وقف تعويض",
          test_pyramid: "صفقة تعزيز",
          test_pyramid_tp: "هدف تعزيز",
          test_pyramid_sl: "وقف تعزيز",
          test_sell: "إشارة بيع (SELL)",
          test_all: "جميع الإشارات"
        }
      });
  }
}

// ═══════════════════════════════════════════════════════
//  🔍 محرك تحليل الإشارات الرئيسي
// ═══════════════════════════════════════════════════════
function parseSignal(rawText) {
  var warnings = [];
  var text = rawText.trim();

  if (!text) return { success: false, error: "النص فارغ" };

  // 1. تحديد فئة الإشارة
  var category = detectCategory(text);

  // 2. التحليل حسب الفئة
  switch (category) {
    case "ENTRY": return parseEntry(text);
    case "TP_HIT": return parseTPHit(text);
    case "SL_HIT": return parseSLHit(text);
    case "REENTRY": return parseReentry(text);
    case "REENTRY_TP": return parseReentryTP(text);
    case "REENTRY_SL": return parseReentrySL(text);
    case "PYRAMID": return parsePyramid(text);
    case "PYRAMID_TP": return parsePyramidTP(text);
    case "PYRAMID_SL": return parsePyramidSL(text);
    default: return { success: false, error: "نوع إشارة غير معروف" };
  }
}

// ═══════════════════════════════════════════════════════
//  📋 تحديد فئة الإشارة
// ═══════════════════════════════════════════════════════
function detectCategory(text) {
  // Reentry TP — يجب فحصها قبل TP_HIT العام
  if (/إغلاق كامل بالربح/.test(text) && /♻️/.test(text)) return "REENTRY_TP";
  if (/هدف التعويض/.test(text)) return "REENTRY_TP";
  if (/ضرب وقف التعويض/.test(text)) return "REENTRY_SL";

  // Reentry Entry
  if (/صفقة التعويض/.test(text) && /الدخول:/.test(text)) return "REENTRY";

  // Pyramid TP — يجب فحصها قبل TP_HIT العام
  if (/إغلاق كامل بالربح/.test(text) && /تعزيز/.test(text)) return "PYRAMID_TP";
  if (/هدف التعزيز/.test(text)) return "PYRAMID_TP";
  if (/ضرب وقف التعزيز/.test(text)) return "PYRAMID_SL";

  // Pyramid Entry
  if (/تعزيز/.test(text) && /الدخول:/.test(text)) return "PYRAMID";

  // TP Hit variants
  if (/إغلاق كامل بالربح/.test(text)) return "TP_HIT";
  if (/قفزة سعرية/.test(text)) return "TP_HIT";
  if (/تحقق الهدف/.test(text)) return "TP_HIT";

  // SL Hit variants
  if (/ضرب الوقف/.test(text) && !/تعويض/.test(text) && !/تعزيز/.test(text)) return "SL_HIT";
  if (/الوقف الأساسي/.test(text) || /الوقف المتتبع/.test(text) || /التأمين/.test(text)) return "SL_HIT";

  // Entry
  if (/إشارة شراء/.test(text) || /إشارة بيع/.test(text)) return "ENTRY";
  if (/🟢/.test(text) || /🔴/.test(text)) return "ENTRY";

  return "UNKNOWN";
}

// ═══════════════════════════════════════════════════════
//  🟢 تحليل إشارة الدخول (ENTRY)
// ═══════════════════════════════════════════════════════
function parseEntry(text) {
  var warnings = [];
  var signalType = extractSignalType(text);
  if (!signalType) return { success: false, error: "لم يتم التعرف على نوع الإشارة" };

  var pair = extractPair(text);
  if (!pair) warnings.push("لم يتم التعرف على الزوج");

  var tf = extractTimeframes(text);
  var confidence = extractConfidence(text);
  var entry = extractEntry(text);
  if (entry === null) return { success: false, error: "لم يتم العثور على سعر الدخول" };

  var stopLoss = extractStopLoss(text);
  if (stopLoss === null) warnings.push("لم يتم العثور على وقف الخسارة");

  var takeProfits = extractTPsWithRR(text);
  var risk = extractRiskData(text);
  var htfTrend = extractHTFTrend(text);
  var smcTrend = extractSMCTrend(text);

  return {
    success: true,
    signal: {
      pair: pair || "UNKNOWN",
      type: signalType,
      entry: entry,
      stopLoss: stopLoss || 0,
      takeProfits: takeProfits,
      confidence: confidence,
      timeframe: tf.timeframe,
      htfTimeframe: tf.htfTimeframe,
      htfTrend: htfTrend,
      smcTrend: smcTrend,
      riskData: risk,
      signalCategory: "ENTRY",
      rawText: text
    },
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ═══════════════════════════════════════════════════════
//  ✅ تحليل تحقق الهدف (TP_HIT)
// ═══════════════════════════════════════════════════════
function parseTPHit(text) {
  var pair = extractPair(text) || "";
  var tpNum = extractTPNumber(text);
  var hitPrice = extractHitPrice(text);
  var pnlPoints = extractPnLPoints(text);
  var pnlDollar = extractPnLDollar(text);
  var isFullClose = /إغلاق كامل بالربح/.test(text);
  var isJump = /قفزة سعرية/.test(text);

  return {
    success: true,
    signal: {
      pair: pair,
      type: "BUY",
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
      partialClose: !isFullClose,
      isFullClose: isFullClose,
      isJump: isJump,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

// ═══════════════════════════════════════════════════════
//  ❌ تحليل ضرب الوقف (SL_HIT)
// ═══════════════════════════════════════════════════════
function parseSLHit(text) {
  var pair = extractPair(text) || "";
  var tpStatusList = extractTPStatusList(text);
  var partialWin = /ربح جزئي/.test(text);

  // تحديد نوع الوقف
  var slType = "وقف أولي";
  if (/الوقف الأساسي/.test(text) || /التعادل/.test(text)) slType = "وقف أساسي (تعادل)";
  if (/الوقف المتتبع/.test(text)) slType = "وقف متتبع";
  if (/التأمين/.test(text)) slType = "تأمين";

  return {
    success: true,
    signal: {
      pair: pair,
      type: "BUY",
      entry: 0,
      stopLoss: 0,
      takeProfits: [],
      confidence: 0,
      signalCategory: "SL_HIT",
      rawText: text,
      hitTpIndex: -1,
      tpStatusList: tpStatusList,
      partialWin: partialWin,
      slType: slType,
      timeframe: "",
      htfTimeframe: "",
      htfTrend: "",
      smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

// ═══════════════════════════════════════════════════════
//  ♻️ تحليل صفقة التعويض (REENTRY)
// ═══════════════════════════════════════════════════════
function parseReentry(text) {
  var signalType = /شراء/.test(text) ? "BUY" : "SELL";
  var pair = extractPair(text) || "";
  var entry = extractEntry(text) || 0;
  var stopLoss = extractStopLoss(text) || 0;
  var takeProfits = extractTPsWithRR(text);
  var risk = extractRiskData(text);

  return {
    success: true,
    signal: {
      pair: pair, type: signalType, entry: entry, stopLoss: stopLoss,
      takeProfits: takeProfits, confidence: 0,
      signalCategory: "REENTRY", rawText: text,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: risk
    }
  };
}

function parseReentryTP(text) {
  var pair = extractPair(text) || "";
  var hitPrice = extractHitPrice(text) || 0;
  var pnlPoints = extractPnLPoints(text) || 0;
  var pnlDollar = extractPnLDollar(text) || 0;

  return {
    success: true,
    signal: {
      pair: pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_TP", rawText: text,
      hitPrice: hitPrice, pnlPoints: pnlPoints, pnlDollar: pnlDollar,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

function parseReentrySL(text) {
  var pair = extractPair(text) || "";
  var partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair: pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "REENTRY_SL", rawText: text,
      partialWin: partialWin,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

// ═══════════════════════════════════════════════════════
//  🔥 تحليل صفقة التعزيز (PYRAMID)
// ═══════════════════════════════════════════════════════
function parsePyramid(text) {
  var signalType = /شراء/.test(text) ? "BUY" : "SELL";
  var pair = extractPair(text) || "";
  var entry = extractEntry(text) || 0;
  var stopLoss = extractStopLoss(text) || 0;
  var takeProfits = extractTPsWithRR(text);
  var risk = extractRiskData(text);

  return {
    success: true,
    signal: {
      pair: pair, type: signalType, entry: entry, stopLoss: stopLoss,
      takeProfits: takeProfits, confidence: 0,
      signalCategory: "PYRAMID", rawText: text,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: risk
    }
  };
}

function parsePyramidTP(text) {
  var pair = extractPair(text) || "";
  var hitPrice = extractHitPrice(text) || 0;
  var pnlPoints = extractPnLPoints(text) || 0;
  var pnlDollar = extractPnLDollar(text) || 0;

  return {
    success: true,
    signal: {
      pair: pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_TP", rawText: text,
      hitPrice: hitPrice, pnlPoints: pnlPoints, pnlDollar: pnlDollar,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

function parsePyramidSL(text) {
  var pair = extractPair(text) || "";
  var partialWin = /ربح جزئي/.test(text);

  return {
    success: true,
    signal: {
      pair: pair, type: "BUY", entry: 0, stopLoss: 0,
      takeProfits: [], confidence: 0,
      signalCategory: "PYRAMID_SL", rawText: text,
      partialWin: partialWin,
      timeframe: "", htfTimeframe: "", htfTrend: "", smcTrend: "",
      riskData: emptyRisk()
    }
  };
}

// ═══════════════════════════════════════════════════════
//  🔧 دوال الاستخراج (Extraction Functions)
// ═══════════════════════════════════════════════════════

function extractSignalType(text) {
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

function extractPair(text) {
  var patterns = [
    /(?:XAU|GOLD)(?:USD)?/i,
    /(?:XAG|SILVER)(?:USD)?/i,
    /EUR\s*\/?\s*USD/i,
    /GBP\s*\/?\s*USD/i,
    /USD\s*\/?\s*JPY/i,
    /BTC\s*\/?\s*USDT?/i,
    /ETH\s*\/?\s*USDT?/i,
    /US30/i, /NAS100/i, /SPX500/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = text.match(patterns[i]);
    if (m) return m[0].replace(/\s/g, "").toUpperCase();
  }
  var pinMatch = text.match(/📌\s*([A-Za-z0-9]{3,12}(?:\/[A-Za-z]{3})?)/i);
  if (pinMatch) return pinMatch[1].replace(/\s/g, "").toUpperCase();
  return null;
}

function extractTimeframes(text) {
  var tfMatch = text.match(/│\s*(\d+[sdmHWM]?)\s*│\s*(\d+\s*[سدشم]?)\s*│/);
  if (tfMatch) return { timeframe: tfMatch[1].trim(), htfTimeframe: tfMatch[2].trim() };
  return { timeframe: "", htfTimeframe: "" };
}

function extractConfidence(text) {
  var stars = text.match(/⭐/g);
  return stars ? Math.min(stars.length, 5) : 0;
}

function extractEntry(text) {
  var m = text.match(/(?:الدخول|Entry)\s*[:\-–]?\s*([\d,]+\.?\d*)/i);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractStopLoss(text) {
  var m = text.match(/(?:الوقف|وقف الخسارة|Stop\s*Loss|SL)\s*[:\-–]?\s*([\d,]+\.?\d*)/i);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractTPsWithRR(text) {
  var tps = [];
  var seen = {};
  var lineRegex = /(?:🎯|♻️|🔥)\s*TP\s*(\d+)\s*[:\-–]?\s*([\d,]+\.?\d*)\s*[│|]\s*R:?\s*R:?\s*([\d,.]+)/gi;
  var match;
  while ((match = lineRegex.exec(text)) !== null) {
    var key = match[1] + "-" + match[2];
    if (!seen[key]) {
      seen[key] = true;
      tps.push({
        tp: parseFloat(match[2].replace(/,/g, "")),
        rr: parseFloat(match[3].replace(/,/g, ""))
      });
    }
  }

  // Fallback: بدون R:R
  if (tps.length === 0) {
    var simpleRegex = /(?:TP|tp|هدف)\s*(\d+)\s*[:\-–]?\s*([\d,]+\.?\d*)/g;
    while ((match = simpleRegex.exec(text)) !== null) {
      var key2 = match[1] + "-" + match[2];
      if (!seen[key2]) {
        seen[key2] = true;
        tps.push({ tp: parseFloat(match[2].replace(/,/g, "")), rr: 0 });
      }
    }
  }

  return tps;
}

function extractRiskData(text) {
  var data = emptyRisk();

  var balMatch = text.match(/الرصيد\s*[:\-–]?\s*\$?\s*([\d,]+\.?\d*)/);
  if (balMatch) data.balance = parseFloat(balMatch[1].replace(/,/g, ""));

  var lotMatch = text.match(/حجم اللوت\s*[:\-–]?\s*(.+?)(?:\n|$)/);
  if (lotMatch) data.lotSize = lotMatch[1].trim();

  var riskMatch = text.match(/خطر مستهدف\s*[:\-–]?\s*\$?\s*([\d,.]+)\s*\(([\d,.]+)%\)/);
  if (riskMatch) {
    data.riskTarget = parseFloat(riskMatch[1].replace(/,/g, ""));
    data.riskPercent = parseFloat(riskMatch[2].replace(/,/g, ""));
  }

  var actualMatch = text.match(/(?:خسارة فعلية|خطر فعلي)\s*[:\-–]?\s*\$?\s*([\d,.]+)\s*\(([\d,.]+)%\)/);
  if (actualMatch) {
    data.actualRisk = parseFloat(actualMatch[1].replace(/,/g, ""));
    data.actualRiskPct = parseFloat(actualMatch[2].replace(/,/g, ""));
  }

  var distMatch = text.match(/مسافة الوقف\s*[:\-–]?\s*([\d,.]+)/);
  if (distMatch) data.slDistance = parseFloat(distMatch[1].replace(/,/g, ""));

  var rrMatch = text.match(/R:R الأقصى\s*[:\-–]?\s*1:([\d,.]+)/);
  if (rrMatch) data.maxRR = parseFloat(rrMatch[1].replace(/,/g, ""));

  var instMatch = text.match(/(?:الأداة|instrument)\s*[:\-–]?\s*(.+?)(?:\n|$)/);
  if (instMatch) data.instrument = instMatch[1].trim();

  return data;
}

function extractHTFTrend(text) {
  var m = text.match(/📈\s*\S+\s*:\s*(صاعد|هابط)\s*[🐂🐻]?/);
  return m ? m[1] : "";
}

function extractSMCTrend(text) {
  var m = text.match(/SMC\s*[:\-–]?\s*(صاعد|هابط|محايد)/);
  return m ? m[1] : "";
}

function extractTPNumber(text) {
  var m = text.match(/(?:الهدف|تحقق الهدف)\s*(\d+)/);
  return m ? parseInt(m[1]) : -1;
}

function extractHitPrice(text) {
  var m = text.match(/🎯\s*([\d,]+\.?\d*)\s*│/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractPnLPoints(text) {
  var m = text.match(/[+-]?\s*([\d,.]+)\s*نقطة/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractPnLDollar(text) {
  var m = text.match(/(?:ربح تقريبي|ربح|خسارة)[s:]?\s*[:\-–]?\s*[+-]?\s*\$?\s*([\d,.]+)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractTPStatusList(text) {
  var lines = [];
  var regex = /[✅⏳]\s*TP\d+[:\s][\d,.]+(?:\s*←\s*الآن)?/g;
  var match;
  while ((match = regex.exec(text)) !== null) {
    lines.push(match[0].trim());
  }
  return lines.join("\n");
}

function emptyRisk() {
  return {
    balance: 0, lotSize: "", riskTarget: 0, riskPercent: 0,
    actualRisk: 0, actualRiskPct: 0, slDistance: 0, maxRR: 0, instrument: ""
  };
}

// ═══════════════════════════════════════════════════════
//  📤 إرسال الإشارة لتطبيق Next.js
// ═══════════════════════════════════════════════════════
function sendToApp(parseResult) {
  if (!APP_URL || APP_URL === "https://your-app.vercel.app/api/signals") {
    return { skipped: true, reason: "APP_URL not configured" };
  }

  try {
    var signal = parseResult.signal;

    // بناء payload متوافق مع API
    var payload = {
      text: signal.rawText
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(APP_URL, options);
    var result = JSON.parse(response.getContentText());
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
//  📊 تسجيل في Google Sheets
// ═══════════════════════════════════════════════════════
function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_NAME) {
      sheet.getRange(1, 1, 1, 8).setValues([[
        "التاريخ", "الفئة", "الزوج", "النوع", "الدخول", "الوقف", "الأهداف", "النص"
      ]]).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#e2e8f0");
    }
  }
  return sheet;
}

function logToSheet(parseResult) {
  var sheet = getSheet(SHEET_NAME);
  var s = parseResult.signal;
  var tpStr = "";
  if (s.takeProfits && s.takeProfits.length > 0) {
    tpStr = s.takeProfits.map(function(tp) { return tp.tp + "(" + (tp.rr || 0) + ")"; }).join(", ");
  }

  sheet.appendRow([
    new Date().toLocaleString("ar-SA"),
    s.signalCategory,
    s.pair,
    s.type,
    s.entry || s.hitPrice || 0,
    s.stopLoss || 0,
    tpStr,
    s.rawText.substring(0, 500)
  ]);

  // تلوين الصف
  var row = sheet.getLastRow();
  var colors = {
    "ENTRY": "#0f2922",
    "TP_HIT": "#0f2240",
    "SL_HIT": "#2d1517",
    "REENTRY": "#0f2d2d",
    "PYRAMID": "#1f0f2d"
  };
  sheet.getRange(row, 1, 1, 8).setBackground(colors[s.signalCategory] || "#1a1a2e").setFontColor("#e2e8f0");

  return row;
}

function getAllSignalsFromSheet() {
  var sheet = getSheet(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var signals = [];
  for (var i = 1; i < data.length; i++) {
    signals.push({
      date: data[i][0],
      category: data[i][1],
      pair: data[i][2],
      type: data[i][3],
      entry: data[i][4],
      sl: data[i][5],
      tps: data[i][6]
    });
  }
  return signals.reverse();
}

// ═══════════════════════════════════════════════════════
//  🧪 نصوص الاختبار — كل أنواع الإشارات
// ═══════════════════════════════════════════════════════

function TEST_ENTRY_BUY() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🟢 إشارة شراء 🚀 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD │ 15 │ 1س",
    "⭐ ⭐⭐",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 الصفقة",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔵 الدخول: 2350.5",
    "🔴 الوقف : 2345.0",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $1000",
    "🎯 خطر مستهدف : $10 (1.0%)",
    "📦 حجم اللوت : 0.20 لوت",
    "💸 خسارة فعلية : $11 (1.1%)",
    "📏 مسافة الوقف : 5.5",
    "📊 R:R الأقصى : 1:4.23",
    "🏦 الأداة : الذهب (XAUUSD)",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 الأهداف",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 TP1: 2352.1 │ R:R 0.30",
    "🎯 TP2: 2353.4 │ R:R 0.53",
    "🎯 TP3: 2355.0 │ R:R 0.82",
    "🎯 TP4: 2357.2 │ R:R 1.22",
    "🎯 TP5: 2360.0 │ R:R 1.73",
    "🎯 TP6: 2363.5 │ R:R 2.36",
    "🎯 TP7: 2367.8 │ R:R 3.15",
    "🎯 TP8: 2372.0 │ R:R 3.91",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📈 1س: صاعد 🐂 │ SMC: صاعد",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📱 t.me/forexYemeni_Gold"
  ].join("\n");
}

function TEST_ENTRY_SELL() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🔴 إشارة بيع 📉 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 EURUSD │ 5 │ 30د",
    "⭐ ⭐⭐⭐⭐",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 الصفقة",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔵 الدخول: 1.0850",
    "🔴 الوقف : 1.0875",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $2000",
    "🎯 خطر مستهدف : $20 (1.0%)",
    "📦 حجم اللوت : 0.08 لوت",
    "💸 خسارة فعلية : $20 (1.0%)",
    "📏 مسافة الوقف : 25.0",
    "📊 R:R الأقصى : 1:3.80",
    "🏦 الأداة : عملات",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 الأهداف",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 TP1: 1.0830 │ R:R 0.80",
    "🎯 TP2: 1.0800 │ R:R 2.00",
    "🎯 TP3: 1.0770 │ R:R 3.20",
    "🎯 TP4: 1.0755 │ R:R 3.80",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📈 30د: هابط 🐻 │ SMC: هابط",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📱 t.me/forexYemeni_Gold"
  ].join("\n");
}

function TEST_TP_HIT() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ✅ تحقق الهدف 3 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2355.0 │ +4.5 نقطة",
    "💰 ربح تقريبي: +$9.0",
    "",
    "✅ TP1: 2352.1",
    "✅ TP2: 2353.4",
    "✅ TP3: 2355.0 ← الآن",
    "⏳ TP4: 2357.2",
    "⏳ TP5: 2360.0"
  ].join("\n");
}

function TEST_TP_FULL_CLOSE() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🏆 إغلاق كامل بالربح ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2367.8 │ +17.3 نقطة",
    "💰 ربح تقريبي: +$34.6",
    "",
    "✅ TP1: 2352.1",
    "✅ TP2: 2353.4",
    "✅ TP3: 2355.0",
    "✅ TP4: 2357.2",
    "✅ TP5: 2360.0",
    "✅ TP6: 2363.5",
    "✅ TP7: 2367.8 ← الآن",
    "✅ TP8: 2372.0"
  ].join("\n");
}

function TEST_TP_JUMP() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🚀 قفزة سعرية ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2372.0 │ +21.5 نقطة",
    "💰 ربح تقريبي: +$43.0",
    "",
    "✅ TP1: 2352.1",
    "✅ TP2: 2353.4",
    "✅ TP3: 2355.0",
    "✅ TP4: 2357.2",
    "✅ TP5: 2360.0",
    "✅ TP6: 2363.5",
    "✅ TP7: 2367.8",
    "✅ TP8: 2372.0 ← الآن (قفزة!)"
  ].join("\n");
}

function TEST_SL_HIT() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ❌ ضرب الوقف ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "❌ 2345.0 │ -5.5 نقطة",
    "💰 خسارة: -$11.0",
    "",
    "⏳ TP1: 2352.1",
    "⏳ TP2: 2353.4",
    "⏳ TP3: 2355.0"
  ].join("\n");
}

function TEST_SL_BREAKEVEN() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ⚠️ الوقف الأساسي ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🔒 2350.5 │ 0.0 نقطة (التعادل)",
    "💰 ربح جزئي: +$5.4",
    "",
    "✅ TP1: 2352.1",
    "✅ TP2: 2353.4",
    "⏳ TP3: 2355.0"
  ].join("\n");
}

function TEST_SL_TRAILING() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🔒 الوقف المتتبع ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🔒 2358.0 │ +7.5 نقطة",
    "💰 ربح جزئي: +$19.6",
    "",
    "✅ TP1: 2352.1",
    "✅ TP2: 2353.4",
    "✅ TP3: 2355.0",
    "✅ TP4: 2357.2",
    "⏳ TP5: 2360.0"
  ].join("\n");
}

function TEST_SL_INSURANCE() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🛡️ التأمين ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🔒 2351.0 │ +0.5 نقطة",
    "💰 ربح جزئي: +$2.7",
    "",
    "✅ TP1: 2352.1",
    "⏳ TP2: 2353.4",
    "⏳ TP3: 2355.0"
  ].join("\n");
}

function TEST_REENTRY() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ♻️ صفقة التعويض — شراء ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 الصفقة",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔵 الدخول: 2348.0",
    "🔴 الوقف : 2343.0",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $1000",
    "📦 حجم اللوت : 0.20 لوت",
    "📏 مسافة الوقف : 5.0",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 أهداف التعويض",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "♻️ TP1: 2350.0 │ R:R 0.40",
    "♻️ TP2: 2352.1 │ R:R 0.82",
    "♻️ TP3: 2355.0 │ R:R 1.40",
    "♻️ TP4: 2360.0 │ R:R 2.40"
  ].join("\n");
}

function TEST_REENTRY_TP() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ✅ هدف التعويض 2 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2352.1 │ +4.1 نقطة",
    "💰 ربح تقريبي: +$8.2",
    "",
    "✅ TP1: 2350.0",
    "✅ TP2: 2352.1 ← الآن",
    "⏳ TP3: 2355.0",
    "⏳ TP4: 2360.0"
  ].join("\n");
}

function TEST_REENTRY_SL() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ❌ ضرب وقف التعويض ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "❌ 2343.0 │ -5.0 نقطة",
    "💰 خسارة: -$10.0",
    "",
    "⏳ TP1: 2350.0",
    "⏳ TP2: 2352.1",
    "⏳ TP3: 2355.0"
  ].join("\n");
}

function TEST_PYRAMID() {
  return [
    "╔══════════════════════════════════════╗",
    "║ 🔥 تعزيز — شراء ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 BTCUSD",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 الصفقة",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔵 الدخول: 104500",
    "🔴 الوقف : 103200",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $5000",
    "📦 حجم اللوت : 0.04 لوت",
    "📏 مسافة الوقف : 1300",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 أهداف التعزيز",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔥 TP1: 105500 │ R:R 0.77",
    "🔥 TP2: 106800 │ R:R 1.77",
    "🔥 TP3: 108500 │ R:R 3.08"
  ].join("\n");
}

function TEST_PYRAMID_TP() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ✅ هدف التعزيز 1 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 BTCUSD",
    "🎯 105500 │ +1000 نقطة",
    "💰 ربح تقريبي: +$40.0",
    "",
    "✅ TP1: 105500 ← الآن",
    "⏳ TP2: 106800",
    "⏳ TP3: 108500"
  ].join("\n");
}

function TEST_PYRAMID_SL() {
  return [
    "╔══════════════════════════════════════╗",
    "║ ❌ ضرب وقف التعزيز ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 BTCUSD",
    "❌ 103200 │ -1300 نقطة",
    "💰 خسارة: -$52.0",
    "",
    "⏳ TP1: 105500",
    "⏳ TP2: 106800",
    "⏳ TP3: 108500"
  ].join("\n");
}

// ═══════════════════════════════════════════════════════
//  🧪 دوال الاختبار (يمكن تشغيلها يدوياً)
// ═══════════════════════════════════════════════════════

function testEntrySignal() {
  var text = TEST_ENTRY_BUY();
  var result = parseSignal(text);
  return jsonResponse({ test: "ENTRY BUY", result: result });
}

function testSellEntrySignal() {
  var text = TEST_ENTRY_SELL();
  var result = parseSignal(text);
  return jsonResponse({ test: "ENTRY SELL", result: result });
}

function testTPHitSignal() {
  var text = TEST_TP_HIT();
  var result = parseSignal(text);
  return jsonResponse({ test: "TP_HIT", result: result });
}

function testTPFullCloseSignal() {
  var text = TEST_TP_FULL_CLOSE();
  var result = parseSignal(text);
  return jsonResponse({ test: "TP_FULL_CLOSE", result: result });
}

function testTPJumpSignal() {
  var text = TEST_TP_JUMP();
  var result = parseSignal(text);
  return jsonResponse({ test: "TP_JUMP", result: result });
}

function testSLHitSignal() {
  var text = TEST_SL_HIT();
  var result = parseSignal(text);
  return jsonResponse({ test: "SL_HIT", result: result });
}

function testSLBreakevenSignal() {
  var text = TEST_SL_BREAKEVEN();
  var result = parseSignal(text);
  return jsonResponse({ test: "SL_BREAKEVEN", result: result });
}

function testSLTrailingSignal() {
  var text = TEST_SL_TRAILING();
  var result = parseSignal(text);
  return jsonResponse({ test: "SL_TRAILING", result: result });
}

function testSLInsuranceSignal() {
  var text = TEST_SL_INSURANCE();
  var result = parseSignal(text);
  return jsonResponse({ test: "SL_INSURANCE", result: result });
}

function testReentrySignal() {
  var text = TEST_REENTRY();
  var result = parseSignal(text);
  return jsonResponse({ test: "REENTRY", result: result });
}

function testReentryTPSignal() {
  var text = TEST_REENTRY_TP();
  var result = parseSignal(text);
  return jsonResponse({ test: "REENTRY_TP", result: result });
}

function testReentrySLSignal() {
  var text = TEST_REENTRY_SL();
  var result = parseSignal(text);
  return jsonResponse({ test: "REENTRY_SL", result: result });
}

function testPyramidSignal() {
  var text = TEST_PYRAMID();
  var result = parseSignal(text);
  return jsonResponse({ test: "PYRAMID", result: result });
}

function testPyramidTPSignal() {
  var text = TEST_PYRAMID_TP();
  var result = parseSignal(text);
  return jsonResponse({ test: "PYRAMID_TP", result: result });
}

function testPyramidSLSignal() {
  var text = TEST_PYRAMID_SL();
  var result = parseSignal(text);
  return jsonResponse({ test: "PYRAMID_SL", result: result });
}

// ═══════════════════════════════════════════════════════
//  🧪 اختبار جميع الإشارات مرة واحدة
// ═══════════════════════════════════════════════════════
function testAllSignals() {
  var tests = [
    { name: "ENTRY BUY", fn: TEST_ENTRY_BUY },
    { name: "ENTRY SELL", fn: TEST_ENTRY_SELL },
    { name: "TP HIT", fn: TEST_TP_HIT },
    { name: "TP FULL CLOSE", fn: TEST_TP_FULL_CLOSE },
    { name: "TP JUMP", fn: TEST_TP_JUMP },
    { name: "SL HIT", fn: TEST_SL_HIT },
    { name: "SL BREAKEVEN", fn: TEST_SL_BREAKEVEN },
    { name: "SL TRAILING", fn: TEST_SL_TRAILING },
    { name: "SL INSURANCE", fn: TEST_SL_INSURANCE },
    { name: "REENTRY", fn: TEST_REENTRY },
    { name: "REENTRY TP", fn: TEST_REENTRY_TP },
    { name: "REENTRY SL", fn: TEST_REENTRY_SL },
    { name: "PYRAMID", fn: TEST_PYRAMID },
    { name: "PYRAMID TP", fn: TEST_PYRAMID_TP },
    { name: "PYRAMID SL", fn: TEST_PYRAMID_SL }
  ];

  var results = [];
  for (var i = 0; i < tests.length; i++) {
    var text = tests[i].fn();
    var result = parseSignal(text);
    results.push({
      name: tests[i].name,
      success: result.success,
      category: result.signal ? result.signal.signalCategory : "ERROR",
      error: result.error || null
    });
  }

  var passed = results.filter(function(r) { return r.success; }).length;
  var failed = results.filter(function(r) { return !r.success; }).length;

  return jsonResponse({
    total: tests.length,
    passed: passed,
    failed: failed,
    results: results
  });
}

// ═══════════════════════════════════════════════════════
//  🧪 إرسال كل الإشارات للتطبيق (اختبار متكامل)
// ═══════════════════════════════════════════════════════
function sendAllTestSignals() {
  var tests = [
    TEST_ENTRY_BUY(),
    TEST_TP_HIT(),
    TEST_SL_TRAILING(),
    TEST_REENTRY(),
    TEST_REENTRY_TP(),
    TEST_PYRAMID(),
    TEST_ENTRY_SELL()
  ];

  var results = [];
  for (var i = 0; i < tests.length; i++) {
    var parseResult = parseSignal(tests[i]);
    var appResult = sendToApp(parseResult);
    results.push({
      name: parseResult.signal.signalCategory,
      pair: parseResult.signal.pair,
      parsed: parseResult.success,
      sent: appResult
    });

    // تأخير 500ms بين كل إشارة
    Utilities.sleep(500);
  }

  return jsonResponse({ success: true, sent: results.length, results: results });
}

// ═══════════════════════════════════════════════════════
//  📋 قائمة التنفيذ المخصصة (Custom Menu)
// ═══════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🔀 FOREXYEMENI PRO")
    .addItem("📋 اختبار جميع الإشارات", "testAllSignalsMenu")
    .addSeparator()
    .addItem("🟢 إشارة شراء", "sendTestEntryBuy")
    .addItem("🔴 إشارة بيع", "sendTestEntrySell")
    .addSeparator()
    .addItem("✅ تحقق هدف", "sendTestTP")
    .addItem("🏆 إغلاق كامل بالربح", "sendTestTPFull")
    .addItem("🚀 قفزة سعرية", "sendTestTPJump")
    .addSeparator()
    .addItem("❌ ضرب الوقف", "sendTestSL")
    .addItem("⚠️ وقف أساسي (تعادل)", "sendTestSLBreakeven")
    .addItem("🔒 وقف متتبع", "sendTestSLTrailing")
    .addItem("🛡️ تأمين", "sendTestSLInsurance")
    .addSeparator()
    .addItem("♻️ صفقة تعويض", "sendTestReentry")
    .addItem("♻️ هدف تعويض", "sendTestReentryTP")
    .addItem("♻️ وقف تعويض", "sendTestReentrySL")
    .addSeparator()
    .addItem("🔥 صفقة تعزيز", "sendTestPyramid")
    .addItem("🔥 هدف تعزيز", "sendTestPyramidTP")
    .addItem("🔥 وقف تعزيز", "sendTestPyramidSL")
    .addSeparator()
    .addItem("🚀 إرسال كل الإشارات للتطبيق", "sendAllTestSignalsMenu")
    .addToUi();
}

// ═══════════════════════════════════════════════════════
//  📋 دوال القائمة (مع رسائل تأكيد)
// ═══════════════════════════════════════════════════════

function sendAndShowResult(name, textFn) {
  var text = textFn();
  var result = parseSignal(text);

  // تسجيل في الورقة
  if (result.success) logToSheet(result);

  // إرسال للتطبيق
  var appResult = sendToApp(result);

  var ui = SpreadsheetApp.getUi();
  if (result.success) {
    var s = result.signal;
    var msg = "✅ " + name + "\n\n";
    msg += "الفئة: " + s.signalCategory + "\n";
    msg += "الزوج: " + s.pair + "\n";
    if (s.entry) msg += "الدخول: " + s.entry + "\n";
    if (s.stopLoss) msg += "الوقف: " + s.stopLoss + "\n";
    if (s.hitPrice) msg += "السعر: " + s.hitPrice + "\n";
    if (s.pnlDollar) msg += "الربح/الخسارة: $" + s.pnlDollar + "\n";
    msg += "\n📤 إرسال للتطبيق: " + (appResult.success ? "نجاح ✅" : "تخطي (لم يتم إعداد الرابط)");
    ui.alert(msg);
  } else {
    ui.alert("❌ فشل: " + result.error);
  }
}

function testAllSignalsMenu() {
  var text = TEST_ENTRY_BUY();
  var result = testAllSignals();
  var ui = SpreadsheetApp.getUi();
  ui.alert("🧪 نتائج الاختبار\n\n" +
    "الإجمالي: " + result.total + "\n" +
    "ناجح: ✅ " + result.passed + "\n" +
    "فاشل: ❌ " + result.failed + "\n\n" +
    result.results.map(function(r) {
      return (r.success ? "✅" : "❌") + " " + r.name + " → " + r.category;
    }).join("\n")
  );
}

function sendAllTestSignalsMenu() {
  var result = sendAllTestSignals();
  var ui = SpreadsheetApp.getUi();
  ui.alert("🚀 تم إرسال " + result.sent + " إشارة للتطبيق\n\n" +
    result.results.map(function(r) {
      return (r.sent && r.sent.success ? "✅" : "⏭️") + " " + r.name + " (" + r.pair + ")";
    }).join("\n")
  );
}

function sendTestEntryBuy() { sendAndShowResult("🟢 إشارة شراء", TEST_ENTRY_BUY); }
function sendTestEntrySell() { sendAndShowResult("🔴 إشارة بيع", TEST_ENTRY_SELL); }
function sendTestTP() { sendAndShowResult("✅ تحقق هدف", TEST_TP_HIT); }
function sendTestTPFull() { sendAndShowResult("🏆 إغلاق كامل بالربح", TEST_TP_FULL_CLOSE); }
function sendTestTPJump() { sendAndShowResult("🚀 قفزة سعرية", TEST_TP_JUMP); }
function sendTestSL() { sendAndShowResult("❌ ضرب الوقف", TEST_SL_HIT); }
function sendTestSLBreakeven() { sendAndShowResult("⚠️ وقف أساسي (تعادل)", TEST_SL_BREAKEVEN); }
function sendTestSLTrailing() { sendAndShowResult("🔒 وقف متتبع", TEST_SL_TRAILING); }
function sendTestSLInsurance() { sendAndShowResult("🛡️ تأمين", TEST_SL_INSURANCE); }
function sendTestReentry() { sendAndShowResult("♻️ صفقة تعويض", TEST_REENTRY); }
function sendTestReentryTP() { sendAndShowResult("♻️ هدف تعويض", TEST_REENTRY_TP); }
function sendTestReentrySL() { sendAndShowResult("♻️ وقف تعويض", TEST_REENTRY_SL); }
function sendTestPyramid() { sendAndShowResult("🔥 صفقة تعزيز", TEST_PYRAMID); }
function sendTestPyramidTP() { sendAndShowResult("🔥 هدف تعزيز", TEST_PYRAMID_TP); }
function sendTestPyramidSL() { sendAndShowResult("🔥 وقف تعزيز", TEST_PYRAMID_SL); }

// ═══════════════════════════════════════════════════════
//  🔧 مساعدات
// ═══════════════════════════════════════════════════════
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
