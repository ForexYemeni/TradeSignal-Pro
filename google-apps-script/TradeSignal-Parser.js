/**
 * ════════════════════════════════════════════════════
 *  FOREXYEMENI-PRO — Google Apps Script v3.0
 *  Webhook مستقبل إشارات TradingView
 * ════════════════════════════════════════════════════
 *
 *  الإعداد:
 *  1. انسخ إلى Google Apps Script (script.google.com)
 *  2. Deploy > New deployment > Web app
 *  3. ضع رابط Web App في TradingView Webhook URL
 *
 *  بيانات الاتصال:
 *  - رابط التطبيق: https://trade-signal-pro.vercel.app
 *  - كلمة مرور الأدمن: admin123
 *  - البريد: admin@forexyemeni.com
 * ════════════════════════════════════════════════════
 */

// ── الإعدادات ──
var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";
var ADMIN_PASSWORD = "admin123";
var ADMIN_EMAIL = "admin@forexyemeni.com";
var SHEET_NAME = "Signals";

// ═══════════════════════════════════════════════════
//  doPost — استقبال الإشارات من TradingView (POST)
// ═══════════════════════════════════════════════════
function doPost(e) {
  try {
    var rawText = extractRawText(e);

    if (!rawText || !rawText.trim()) {
      return json({ success: false, error: "النص فارغ" }, 400);
    }

    // تسجيل في Google Sheets
    logToSheet(rawText);

    // إرسال إلى تطبيق Next.js
    var result = sendToApp(rawText);

    return json({ success: true, appResult: result });
  } catch (error) {
    return json({ success: false, error: error.message }, 500);
  }
}

// ═══════════════════════════════════════════════════
//  doGet — فحص حالة الويب هوك (GET)
// ═══════════════════════════════════════════════════
function doGet(e) {
  return json({
    success: true,
    status: "running",
    app: "FOREXYEMENI-PRO",
    version: "3.0",
    appUrl: APP_URL
  });
}

// ═══════════════════════════════════════════════════
//  استخراج النص من طلب TradingView
// ═══════════════════════════════════════════════════
function extractRawText(e) {
  if (!e.postData) return "";

  // JSON body: {"text": "..."}
  if (e.postData.contents) {
    try {
      var parsed = JSON.parse(e.postData.contents);
      if (parsed.text) return parsed.text;
      if (parsed.message) return parsed.message;
      if (parsed.signal) return parsed.signal;
    } catch (err) {
      // ليس JSON — نستخدم النص الخام
    }
    return e.postData.contents;
  }

  // Form URL-encoded
  if (e.postData.type === "application/x-www-form-urlencoded") {
    var params = e.postData.contents.split("&");
    for (var i = 0; i < params.length; i++) {
      var kv = params[i].split("=");
      if (kv[0] === "text" || kv[0] === "message" || kv[0] === "signal") {
        return decodeURIComponent(kv[1].replace(/\+/g, " "));
      }
    }
  }

  return "";
}

// ═══════════════════════════════════════════════════
//  إرسال الإشارة إلى تطبيق Next.js
// ═══════════════════════════════════════════════════
function sendToApp(rawText) {
  try {
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ text: rawText }),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(APP_URL, options);
    return JSON.parse(response.getContentText());
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════
//  تسجيل الإشارة في Google Sheets
// ═══════════════════════════════════════════════════
function logToSheet(rawText) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([["التاريخ", "الفئة", "النص"]])
      .setFontWeight("bold")
      .setBackground("#1a1a2e")
      .setFontColor("#e2e8f0");
  }

  // تحديد الفئة
  var category = detectCategory(rawText);

  sheet.appendRow([
    new Date().toLocaleString("ar-SA"),
    category,
    rawText.substring(0, 500)
  ]);

  // تلوين الصف حسب الفئة
  var row = sheet.getLastRow();
  var colors = {
    "ENTRY": "#0f2922",
    "TP_HIT": "#0f2240",
    "SL_HIT": "#2d1517",
    "OTHER": "#1a1a2e"
  };
  sheet.getRange(row, 1, 1, 3)
    .setBackground(colors[category] || colors["OTHER"])
    .setFontColor("#e2e8f0");
}

// ═══════════════════════════════════════════════════
//  تحديد فئة الإشارة
// ═══════════════════════════════════════════════════
function detectCategory(text) {
  if (/إغلاق كامل بالربح/.test(text)) return "TP_HIT";
  if (/قفزة سعرية/.test(text)) return "TP_HIT";
  if (/تحقق الهدف/.test(text)) return "TP_HIT";
  if (/هدف التعويض/.test(text)) return "TP_HIT";
  if (/هدف التعزيز/.test(text)) return "TP_HIT";
  if (/ضرب الوقف/.test(text)) return "SL_HIT";
  if (/الوقف الأساسي/.test(text)) return "SL_HIT";
  if (/الوقف المتتبع/.test(text)) return "SL_HIT";
  if (/التأمين/.test(text)) return "SL_HIT";
  if (/إشارة شراء/.test(text) || /إشارة بيع/.test(text)) return "ENTRY";
  if (/صفقة التعويض/.test(text)) return "ENTRY";
  if (/تعزيز/.test(text) && /الدخول:/.test(text)) return "ENTRY";
  if (/🟢/.test(text) || /🔴/.test(text)) return "ENTRY";
  return "OTHER";
}

// ═══════════════════════════════════════════════════
//  استجابة JSON
// ═══════════════════════════════════════════════════
function json(data, status) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
//  🧪 دوال الاختبار — شغّلها يدوياً من محرر Google Apps Script
//  (شريط الأعلى > تشغيل > اختر الدالة)
// ═══════════════════════════════════════════════════════════════

// ── 1. إشارة شراء BUY ──
function testBuySignal() {
  var signal = [
    "╔══════════════════════════════════════╗",
    "║ 🟢 إشارة شراء 🚀 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD │ 15 │ 1س",
    "⭐ ⭐⭐⭐",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📊 الصفقة",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🔵 الدخول: 2650.5",
    "🔴 الوقف : 2645.0",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $1000",
    "🎯 خطر مستهدف : $10 (1.0%)",
    "📦 حجم اللوت : 0.20 لوت",
    "💸 خسارة فعلية : $11 (1.1%)",
    "📏 مسافة الوقف : 5.5",
    "📊 R:R الأقصى : 1:6.17",
    "🏦 الأداة : الذهب (XAUUSD)",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 الأهداف",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 TP1: 2653.0 │ R:R 0.45",
    "🎯 TP2: 2656.5 │ R:R 1.09",
    "🎯 TP3: 2661.0 │ R:R 1.91",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📈 1س: صاعد 🐂 │ SMC: صاعد",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  Logger.log("📤 إرسال إشارة شراء...");
  var result = sendToApp(signal);
  Logger.log("📥 النتيجة: " + JSON.stringify(result));
  return result;
}

// ── 2. إشارة بيع SELL ──
function testSellSignal() {
  var signal = [
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
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 الأهداف",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 TP1: 1.0830 │ R:R 0.80",
    "🎯 TP2: 1.0800 │ R:R 2.00",
    "🎯 TP3: 1.0770 │ R:R 3.20",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📈 30د: هابط 🐻 │ SMC: هابط",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  Logger.log("📤 إرسال إشارة بيع...");
  var result = sendToApp(signal);
  Logger.log("📥 النتيجة: " + JSON.stringify(result));
  return result;
}

// ── 3. تحقق هدف TP ──
function testTPHit() {
  var signal = [
    "╔══════════════════════════════════════╗",
    "║ ✅ تحقق الهدف 2 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2656.5 │ +6.0 نقطة",
    "💰 ربح تقريبي: +$12.0",
    "",
    "✅ TP1: 2653.0",
    "✅ TP2: 2656.5 ← الآن",
    "⏳ TP3: 2661.0"
  ].join("\n");

  Logger.log("📤 إرسال تحقق هدف TP2...");
  var result = sendToApp(signal);
  Logger.log("📥 النتيجة: " + JSON.stringify(result));
  return result;
}

// ── 4. ضرب وقف الخسارة SL ──
function testSLHit() {
  var signal = [
    "╔══════════════════════════════════════╗",
    "║ ❌ ضرب الوقف ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "❌ 2645.0 │ -5.5 نقطة",
    "💰 خسارة: -$11.0",
    "",
    "⏳ TP1: 2653.0",
    "⏳ TP2: 2656.5",
    "⏳ TP3: 2661.0"
  ].join("\n");

  Logger.log("📤 إرسال ضرب وقف...");
  var result = sendToApp(signal);
  Logger.log("📥 النتيجة: " + JSON.stringify(result));
  return result;
}

// ── 5. إغلاق كامل بالربح ──
function testFullClose() {
  var signal = [
    "╔══════════════════════════════════════╗",
    "║ 🏆 إغلاق كامل بالربح ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2661.0 │ +10.5 نقطة",
    "💰 ربح تقريبي: +$21.0",
    "",
    "✅ TP1: 2653.0",
    "✅ TP2: 2656.5",
    "✅ TP3: 2661.0 ← الآن"
  ].join("\n");

  Logger.log("📤 إرسال إغلاق كامل...");
  var result = sendToApp(signal);
  Logger.log("📥 النتيجة: " + JSON.stringify(result));
  return result;
}

// ── 6. سيناريو كامل: دخول ← هدف ← إغلاق ──
function testFullScenario() {
  Logger.log("═══════════════════════════════════");
  Logger.log("🚀 بدء السيناريو الكامل");
  Logger.log("═══════════════════════════════════");

  // الخطوة 1: إشارة شراء
  Logger.log("\n── الخطوة 1: إشارة شراء ──");
  var entrySignal = [
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
    "🔵 الدخول: 2650.5",
    "🔴 الوقف : 2645.0",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💰 إدارة المخاطر",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "💵 الرصيد : $1000",
    "🎯 خطر مستهدف : $10 (1.0%)",
    "📦 حجم اللوت : 0.20 لوت",
    "💸 خسارة فعلية : $11 (1.1%)",
    "📏 مسافة الوقف : 5.5",
    "📊 R:R الأقصى : 1:6.17",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 الأهداف",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🎯 TP1: 2653.0 │ R:R 0.45",
    "🎯 TP2: 2656.5 │ R:R 1.09",
    "🎯 TP3: 2661.0 │ R:R 1.91",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📈 1س: صاعد 🐂 │ SMC: صاعد",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");
  var r1 = sendToApp(entrySignal);
  Logger.log("✅ دخول: " + JSON.stringify(r1));

  // الخطوة 2: تحقق TP1
  Logger.log("\n── الخطوة 2: تحقق TP1 ──");
  var tp1Signal = [
    "╔══════════════════════════════════════╗",
    "║ ✅ تحقق الهدف 1 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2653.0 │ +2.5 نقطة",
    "💰 ربح تقريبي: +$5.0",
    "",
    "✅ TP1: 2653.0 ← الآن",
    "⏳ TP2: 2656.5",
    "⏳ TP3: 2661.0"
  ].join("\n");
  var r2 = sendToApp(tp1Signal);
  Logger.log("✅ TP1: " + JSON.stringify(r2));

  // الخطوة 3: تحقق TP2
  Logger.log("\n── الخطوة 3: تحقق TP2 ──");
  var tp2Signal = [
    "╔══════════════════════════════════════╗",
    "║ ✅ تحقق الهدف 2 ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2656.5 │ +6.0 نقطة",
    "💰 ربح تقريبي: +$12.0",
    "",
    "✅ TP1: 2653.0",
    "✅ TP2: 2656.5 ← الآن",
    "⏳ TP3: 2661.0"
  ].join("\n");
  var r3 = sendToApp(tp2Signal);
  Logger.log("✅ TP2: " + JSON.stringify(r3));

  // الخطوة 4: إغلاق كامل بالربح
  Logger.log("\n── الخطوة 4: إغلاق كامل بالربح ──");
  var closeSignal = [
    "╔══════════════════════════════════════╗",
    "║ 🏆 إغلاق كامل بالربح ║",
    "╚══════════════════════════════════════╝",
    "",
    "📌 XAUUSD",
    "🎯 2661.0 │ +10.5 نقطة",
    "💰 ربح تقريبي: +$21.0",
    "",
    "✅ TP1: 2653.0",
    "✅ TP2: 2656.5",
    "✅ TP3: 2661.0 ← الآن"
  ].join("\n");
  var r4 = sendToApp(closeSignal);
  Logger.log("✅ إغلاق: " + JSON.stringify(r4));

  Logger.log("\n═══════════════════════════════════");
  Logger.log("🏁 انتهى السيناريو الكامل");
  Logger.log("═══════════════════════════════════");

  return { step1: r1, step2: r2, step3: r3, step4: r4 };
}
