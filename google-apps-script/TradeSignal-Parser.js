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
