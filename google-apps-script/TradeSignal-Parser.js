// FOREXYEMENI-PRO Google Apps Script v3.0
// Webhook مستقبل إشارات TradingView
//
// بيانات الاتصال:
// - رابط التطبيق: https://trade-signal-pro.vercel.app
// - كلمة مرور الأدمن: admin123
// - البريد: admin@forexyemeni.com

var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";
var ADMIN_PASSWORD = "admin123";
var ADMIN_EMAIL = "admin@forexyemeni.com";
var SHEET_NAME = "Signals";

function doPost(e) {
  try {
    var rawText = extractRawText(e);
    if (!rawText || !rawText.trim()) {
      return jsonResponse({ success: false, error: "النص فارغ" }, 400);
    }
    logToSheet(rawText);
    var result = sendToApp(rawText);
    return jsonResponse({ success: true, appResult: result });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function doGet(e) {
  return jsonResponse({
    success: true,
    status: "running",
    app: "FOREXYEMENI-PRO",
    version: "3.0",
    appUrl: APP_URL
  });
}

function extractRawText(e) {
  if (!e.postData) return "";
  if (e.postData.contents) {
    try {
      var parsed = JSON.parse(e.postData.contents);
      if (parsed.text) return parsed.text;
      if (parsed.message) return parsed.message;
      if (parsed.signal) return parsed.signal;
    } catch (err) {}
    return e.postData.contents;
  }
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

function logToSheet(rawText) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([["التاريخ", "الفئة", "النص"]])
      .setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#e2e8f0");
  }
  var category = detectCategory(rawText);
  sheet.appendRow([new Date().toLocaleString("ar-SA"), category, rawText.substring(0, 500)]);
  var row = sheet.getLastRow();
  var colors = { "ENTRY": "#0f2922", "TP_HIT": "#0f2240", "SL_HIT": "#2d1517", "OTHER": "#1a1a2e" };
  sheet.getRange(row, 1, 1, 3).setBackground(colors[category] || colors["OTHER"]).setFontColor("#e2e8f0");
}

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

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// =========================================
// دوال الاختبار
// =========================================

function testBuySignal() {
  var signal = "🟢 إشارة شراء 🚀\n"
    + "\n"
    + "📌 XAUUSD | 15 | 1س\n"
    + "⭐ ⭐⭐⭐\n"
    + "\n"
    + "📊 الصفقة\n"
    + "🔵 الدخول: 2650.5\n"
    + "🔴 الوقف : 2645.0\n"
    + "\n"
    + "💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000\n"
    + "🎯 خطر مستهدف : $10 (1.0%)\n"
    + "📦 حجم اللوت : 0.20 لوت\n"
    + "💸 خسارة فعلية : $11 (1.1%)\n"
    + "📏 مسافة الوقف : 5.5\n"
    + "📊 R:R الأقصى : 1:6.17\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n"
    + "🎯 الأهداف\n"
    + "🎯 TP1: 2653.0 | R:R 0.45\n"
    + "🎯 TP2: 2656.5 | R:R 1.09\n"
    + "🎯 TP3: 2661.0 | R:R 1.91\n"
    + "\n"
    + "📈 1س: صاعد 🐂 | SMC: صاعد";

  Logger.log("إرسال إشارة شراء...");
  var result = sendToApp(signal);
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testSellSignal() {
  var signal = "🔴 إشارة بيع 📉\n"
    + "\n"
    + "📌 EURUSD | 5 | 30د\n"
    + "⭐ ⭐⭐⭐⭐\n"
    + "\n"
    + "📊 الصفقة\n"
    + "🔵 الدخول: 1.0850\n"
    + "🔴 الوقف : 1.0875\n"
    + "\n"
    + "💰 إدارة المخاطر\n"
    + "💵 الرصيد : $2000\n"
    + "🎯 خطر مستهدف : $20 (1.0%)\n"
    + "📦 حجم اللوت : 0.08 لوت\n"
    + "💸 خسارة فعلية : $20 (1.0%)\n"
    + "📏 مسافة الوقف : 25.0\n"
    + "📊 R:R الأقصى : 1:3.80\n"
    + "\n"
    + "🎯 الأهداف\n"
    + "🎯 TP1: 1.0830 | R:R 0.80\n"
    + "🎯 TP2: 1.0800 | R:R 2.00\n"
    + "🎯 TP3: 1.0770 | R:R 3.20\n"
    + "\n"
    + "📈 30د: هابط 🐻 | SMC: هابط";

  Logger.log("إرسال إشارة بيع...");
  var result = sendToApp(signal);
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testTPHit() {
  var signal = "✅ تحقق الهدف 2\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2656.5 | +6.0 نقطة\n"
    + "💰 ربح تقريبي: +$12.0\n"
    + "\n"
    + "✅ TP1: 2653.0\n"
    + "✅ TP2: 2656.5 ← الآن\n"
    + "⏳ TP3: 2661.0";

  Logger.log("إرسال تحقق هدف TP2...");
  var result = sendToApp(signal);
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testSLHit() {
  var signal = "❌ ضرب الوقف\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "❌ 2645.0 | -5.5 نقطة\n"
    + "💰 خسارة: -$11.0\n"
    + "\n"
    + "⏳ TP1: 2653.0\n"
    + "⏳ TP2: 2656.5\n"
    + "⏳ TP3: 2661.0";

  Logger.log("إرسال ضرب وقف...");
  var result = sendToApp(signal);
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testFullClose() {
  var signal = "🏆 إغلاق كامل بالربح\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2661.0 | +10.5 نقطة\n"
    + "💰 ربح تقريبي: +$21.0\n"
    + "\n"
    + "✅ TP1: 2653.0\n"
    + "✅ TP2: 2656.5\n"
    + "✅ TP3: 2661.0 ← الآن";

  Logger.log("إرسال إغلاق كامل...");
  var result = sendToApp(signal);
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testFullScenario() {
  Logger.log("بدء السيناريو الكامل");

  // الخطوة 1: إشارة شراء
  Logger.log("-- الخطوة 1: إشارة شراء --");
  var entrySignal = "🟢 إشارة شراء 🚀\n"
    + "\n"
    + "📌 XAUUSD | 15 | 1س\n"
    + "⭐ ⭐⭐\n"
    + "\n"
    + "📊 الصفقة\n"
    + "🔵 الدخول: 2650.5\n"
    + "🔴 الوقف : 2645.0\n"
    + "\n"
    + "💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000\n"
    + "🎯 خطر مستهدف : $10 (1.0%)\n"
    + "📦 حجم اللوت : 0.20 لوت\n"
    + "💸 خسارة فعلية : $11 (1.1%)\n"
    + "📏 مسافة الوقف : 5.5\n"
    + "📊 R:R الأقصى : 1:6.17\n"
    + "\n"
    + "🎯 الأهداف\n"
    + "🎯 TP1: 2653.0 | R:R 0.45\n"
    + "🎯 TP2: 2656.5 | R:R 1.09\n"
    + "🎯 TP3: 2661.0 | R:R 1.91\n"
    + "\n"
    + "📈 1س: صاعد 🐂 | SMC: صاعد";
  var r1 = sendToApp(entrySignal);
  Logger.log("دخول: " + JSON.stringify(r1));

  // الخطوة 2: تحقق TP1
  Logger.log("-- الخطوة 2: تحقق TP1 --");
  var tp1Signal = "✅ تحقق الهدف 1\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2653.0 | +2.5 نقطة\n"
    + "💰 ربح تقريبي: +$5.0\n"
    + "\n"
    + "✅ TP1: 2653.0 ← الآن\n"
    + "⏳ TP2: 2656.5\n"
    + "⏳ TP3: 2661.0";
  var r2 = sendToApp(tp1Signal);
  Logger.log("TP1: " + JSON.stringify(r2));

  // الخطوة 3: تحقق TP2
  Logger.log("-- الخطوة 3: تحقق TP2 --");
  var tp2Signal = "✅ تحقق الهدف 2\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2656.5 | +6.0 نقطة\n"
    + "💰 ربح تقريبي: +$12.0\n"
    + "\n"
    + "✅ TP1: 2653.0\n"
    + "✅ TP2: 2656.5 ← الآن\n"
    + "⏳ TP3: 2661.0";
  var r3 = sendToApp(tp2Signal);
  Logger.log("TP2: " + JSON.stringify(r3));

  // الخطوة 4: إغلاق كامل بالربح
  Logger.log("-- الخطوة 4: إغلاق كامل بالربح --");
  var closeSignal = "🏆 إغلاق كامل بالربح\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2661.0 | +10.5 نقطة\n"
    + "💰 ربح تقريبي: +$21.0\n"
    + "\n"
    + "✅ TP1: 2653.0\n"
    + "✅ TP2: 2656.5\n"
    + "✅ TP3: 2661.0 ← الآن";
  var r4 = sendToApp(closeSignal);
  Logger.log("إغلاق: " + JSON.stringify(r4));

  Logger.log("انتهى السيناريو الكامل");
  return { step1: r1, step2: r2, step3: r3, step4: r4 };
}
