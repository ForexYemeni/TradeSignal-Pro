/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FOREXYEMENI-PRO — Google Apps Script Webhook v5.0         ║
 * ║  الوسيط بين TradingView وتطبيق الويب                     ║
 * ║  متوافق مع Pine Script v3.7 + signal-parser.ts            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ▸ الاستقبال: TradingView Alert → doGet/doPost
 * ▸ الإرسال: fetch() → Web App API (/api/signals)
 * ▸ الاختبار: دوال test* في المحرر مباشرة
 * ▸ السجل: PropertiesService (محدود 9KB)
 *
 * ⚙️ الإعداد:
 *   1. غيّر APP_URL أدناه إلى عنوان تطبيقك
 *   2. غيّر WEBHOOK_SECRET (اختياري — يجب أن يتطابق مع .env)
 *   3. انشر كـ Web App > Execute as: Me > Access: Anyone
 *   4. انسخ رابط Web App إلى TradingView Alert Webhook URL
 */

// ═══════════════════════════════════════════════════
//  ⚙️ الإعدادات — غيّر هذه القيم
// ═══════════════════════════════════════════════════

var APP_URL = "https://your-domain.vercel.app/api/signals";
var WEBHOOK_SECRET = "";  // اتركه فارغاً إذا لم تُفعّله في Vercel

// ═══════════════════════════════════════════════════
//  🔧 دوال أساسية
// ═══════════════════════════════════════════════════

/**
 * doGet — فحص صحي + عرض السجلات
 * استخدم: https://script.google.com/macros/s/.../exec?action=logs
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    if (action === "logs") {
      var logs = getLogs();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        count: logs.length,
        logs: logs
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "state") {
      var state = getState();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        state: state
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "clear") {
      clearState();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم مسح كل السجلات والحالة"
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "test") {
      var testResult = sendToApp("test connection");
      return ContentService.createTextOutput(JSON.stringify({
        success: testResult.success,
        app: "FOREXYEMENI-PRO",
        version: "5.0",
        appResponse: testResult
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }

    // فحص صحي افتراضي
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      status: "running",
      app: "FOREXYEMENI-PRO",
      version: "5.0",
      endpoint: APP_URL,
      hint: "استخدم ?action=logs أو ?action=state أو ?action=clear أو ?action=test"
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * doPost — استقبال التنبيهات من TradingView
 * TradingView يرسل POST مع alert_message في body
 */
function doPost(e) {
  try {
    var alertText = "";

    // استخراج نص التنبيه من طلب TradingView
    if (e && e.postData) {
      var contentType = e.postData.type || "";
      var contents = e.postData.contents || "";

      if (contentType.indexOf("json") !== -1) {
        // JSON format
        try {
          var json = JSON.parse(contents);
          alertText = json.alert_message || json.message || json.text || contents;
        } catch (parseErr) {
          alertText = contents;
        }
      } else {
        // form-urlencoded أو نص عادي
        alertText = contents;
      }
    }

    // تنظيف النص
    alertText = alertText.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (!alertText || alertText.length < 10) {
      addLog("REJECTED", "نص التنبيه قصير جداً (" + alertText.length + " حرف)");
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "نص التنبيه قصير جداً"
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }

    // كشف نوع التنبيه
    var category = detectCategory(alertText);
    addLog("RECEIVED", "[" + category + "] " + alertText.substring(0, 80) + "...");

    // إرسال للتطبيق
    var result = sendToApp(alertText);
    addLog("FORWARDED", category + " → " + (result.success ? "OK" : "FAILED: " + (result.error || "")));

    // تحديث الحالة
    updateState(category, result.success);

    return ContentService.createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    addLog("ERROR", error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * إرسال النص للتطبيق
 */
function sendToApp(text) {
  try {
    var payload = JSON.stringify({ text: text });

    var headers = {
      "Content-Type": "application/json"
    };

    if (WEBHOOK_SECRET && WEBHOOK_SECRET.length > 0) {
      headers["X-Webhook-Secret"] = WEBHOOK_SECRET;
    }

    var options = {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true
    };

    var response = UrlFetchApp.fetch(APP_URL, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      try {
        return JSON.parse(responseText);
      } catch (e) {
        return { success: true, raw: responseText };
      }
    } else {
      return {
        success: false,
        error: "HTTP " + responseCode + ": " + responseText.substring(0, 200),
        statusCode: responseCode
      };
    }

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ═══════════════════════════════════════════════════
//  📋 كشف نوع التنبيه (يطابق signal-parser.ts)
// ═══════════════════════════════════════════════════

function detectCategory(text) {
  if (/تأمين تلقائي/.test(text) && /الدخول/.test(text)) return "BREAKEVEN";
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

// ═══════════════════════════════════════════════════
//  📊 إدارة السجلات والحالة (PropertiesService)
// ═══════════════════════════════════════════════════

function addLog(type, message) {
  try {
    var props = PropertiesService.getScriptProperties();
    var logs = [];
    try { logs = JSON.parse(props.getProperty("logs") || "[]"); } catch(e) { logs = []; }

    logs.unshift({
      time: new Date().toISOString(),
      type: type,
      message: message.substring(0, 150)
    });

    // الاحتفاظ بآخر 50 سجل فقط
    if (logs.length > 50) logs = logs.slice(0, 50);

    props.setProperty("logs", JSON.stringify(logs));
  } catch(e) {
    // تجاهل أخطاء السجل
  }
}

function getLogs() {
  try {
    var props = PropertiesService.getScriptProperties();
    return JSON.parse(props.getProperty("logs") || "[]");
  } catch(e) { return []; }
}

function updateState(category, success) {
  try {
    var props = PropertiesService.getScriptProperties();
    var state = {};
    try { state = JSON.parse(props.getProperty("state") || "{}"); } catch(e) { state = {}; }

    if (!state.counts) state.counts = {};
    if (!state.counts[category]) state.counts[category] = { success: 0, fail: 0 };

    if (success) {
      state.counts[category].success++;
    } else {
      state.counts[category].fail++;
    }

    state.lastUpdate = new Date().toISOString();
    state.lastCategory = category;
    state.totalForwarded = (state.totalForwarded || 0) + 1;

    props.setProperty("state", JSON.stringify(state));
  } catch(e) {}
}

function getState() {
  try {
    var props = PropertiesService.getScriptProperties();
    return JSON.parse(props.getProperty("state") || "{}");
  } catch(e) { return {}; }
}

function clearState() {
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty("logs");
    props.deleteProperty("state");
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
//                                                                      ║
//  🧪 دوال الاختبار — شغّلها من محرر Apps Script مباشرة        ║
//                                                                      ║
//  الطريقة: اختر الدالة من القائمة المنسدلة أعلاه → اضغط ▶ تشغيل    ║
//  النتيجة: افتح "التنفيذ" (Executions) لرؤية التفاصيل                ║
//                                                                      ║
// ═══════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────
//  📌 إشارات الدخول (ENTRY)
// ─────────────────────────────────────────────

function testBuySignal() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🟢 إشارة شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD │ 15 │ 1س\n"
    + "⭐ ⭐⭐ | 📈تقاطع\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2345.100\n"
    + "🔴 الوقف : 2340.500 | تأمين تلقائي TP1\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.20 لوت\n"
    + "💸 خسارة فعلية : $9.20 (0.9%)\n"
    + "📏 مسافة الوقف : 4.60\n"
    + "📊 R:R الأقصى : 1:3.26\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎯 TP1: 2346.76 │ R:R 0.36\n"
    + "🎯 TP2: 2347.84 │ R:R 0.59\n"
    + "🎯 TP3: 2348.68 │ R:R 0.78\n"
    + "🎯 TP4: 2349.73 │ R:R 1.01\n"
    + "🎯 TP5: 2351.50 │ R:R 1.39\n"
    + "🎯 TP6: 2354.04 │ R:R 1.95\n"
    + "🎯 TP7: 2356.85 │ R:R 2.57\n"
    + "🎯 TP8: 2360.98 │ R:R 3.46\n"
    + "🎯 TP9: 2368.03 │ R:R 4.99\n"
    + "🎯 TP10: 2378.40 │ R:R 7.24\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "📈 1س: صاعد 🐂 | SMC: صاعد\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  addLog("TEST", "testBuySignal → " + JSON.stringify(result));
  Logger.log("=== testBuySignal ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testSellSignal() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🔴 إشارة بيع 🔻 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD │ 15 │ 1س\n"
    + "⭐ ⭐ | 🔄سحب\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2350.300\n"
    + "🔴 الوقف : 2355.100 | تأمين تلقائي TP1\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.21 لوت\n"
    + "💸 خسارة فعلية : $10.08 (1.0%)\n"
    + "📏 مسافة الوقف : 4.80\n"
    + "📊 R:R الأقصى : 1:2.50\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎯 TP1: 2348.54 │ R:R 0.37\n"
    + "🎯 TP2: 2347.04 │ R:R 0.68\n"
    + "🎯 TP3: 2345.81 │ R:R 0.93\n"
    + "🎯 TP4: 2344.00 │ R:R 1.31\n"
    + "🎯 TP5: 2342.10 │ R:R 1.71\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "📈 1س: صاعد 🐂 | SMC: صاعد\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  addLog("TEST", "testSellSignal → " + JSON.stringify(result));
  Logger.log("=== testSellSignal ===");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  🎯 أهداف الصفقة الرئيسية (TP_HIT)
// ─────────────────────────────────────────────

function testTP1() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ✅ تحقق الهدف 1 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🎯 2346.76 │ +1.66 نقطة\n"
    + "💰 ربح تقريبي: +$3.32\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76 ← الآن\n"
    + "⏳ TP2: 2347.84\n"
    + "⏳ TP3: 2348.68\n"
    + "⏳ TP4: 2349.73\n"
    + "⏳ TP5: 2351.50\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🛡️ التأمين مفعّل\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testTP1 ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testTP3() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ✅ تحقق الهدف 3 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🎯 2348.68 │ +3.58 نقطة\n"
    + "💰 ربح تقريبي: +$7.16\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76\n"
    + "✅ TP2: 2347.84\n"
    + "✅ TP3: 2348.68 ← الآن\n"
    + "⏳ TP4: 2349.73\n"
    + "⏳ TP5: 2351.50\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testTP3 ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testTP5() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ✅ تحقق الهدف 5 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🎯 2351.50 │ +6.40 نقطة\n"
    + "💰 ربح تقريبي: +$12.80\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76\n"
    + "✅ TP2: 2347.84\n"
    + "✅ TP3: 2348.68\n"
    + "✅ TP4: 2349.73\n"
    + "✅ TP5: 2351.50 ← الآن\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testTP5 ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testFullClose() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🏆 إغلاق كامل بالربح! ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🎯 2378.40 │ +33.30 نقطة\n"
    + "💰 ربح تقريبي: +$66.60\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76\n"
    + "✅ TP2: 2347.84\n"
    + "✅ TP3: 2348.68\n"
    + "✅ TP4: 2349.73\n"
    + "✅ TP5: 2351.50\n"
    + "✅ TP6: 2354.04\n"
    + "✅ TP7: 2356.85\n"
    + "✅ TP8: 2360.98\n"
    + "✅ TP9: 2368.03\n"
    + "✅ TP10: 2378.40 ← الآن\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎊 جميع الأهداف محققة!\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testFullClose ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testPriceJump() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🚀 قفزة سعرية! ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "⚡ الأهداف 2 ← 4 معاً!\n"
    + "✅ تحقق الهدف 4\n"
    + "🎯 2349.73 │ +4.63 نقطة\n"
    + "💰 ربح تقريبي: +$9.26\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76\n"
    + "✅ TP2: 2347.84\n"
    + "✅ TP3: 2348.68\n"
    + "✅ TP4: 2349.73 ← الآن\n"
    + "⏳ TP5: 2351.50\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testPriceJump ===\n" + JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  ❌ ضرب الوقف (SL_HIT)
// ─────────────────────────────────────────────

function testSLHit() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب الوقف — خسارة كاملة ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "❌ الوقف: 2340.500 | -4.60 نقطة\n"
    + "💰 الخسارة: -$9.20\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ TP1: 2346.76\n"
    + "⏳ TP2: 2347.84\n"
    + "⏳ TP3: 2348.68\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "♻️ جاري البحث عن صفقة بديلة...\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testSLHit ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testSLAfterTPs() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🛡️ التأمين ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76\n"
    + "✅ TP2: 2347.84\n"
    + "✅ TP3: 2348.68\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ 3/10 أهداف\n"
    + "💰 ربح جزئي ✅\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testSLAfterTPs ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testSLAtEntry() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ⚖️ ضرب الوقف عند الدخول ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n\n"
    + "⚖️ تم تحقيق هدف واحد ثم عاد السعر\n"
    + "🛡️ تم الخروج عند نقطة الدخول (بدون خسارة)\n"
    + "✅ 1/10 أهداف محققة\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76 ← الآن\n"
    + "⏳ TP2: 2347.84\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testSLAtEntry ===\n" + JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  🛡️ التأمين (BREAKEVEN)
// ─────────────────────────────────────────────

function testBreakeven() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🛡️ تأمين تلقائي ← الدخول ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🛡️ تم سحب الوقف لنقطة الدخول تلقائياً\n"
    + "🔵 الدخول: 2345.100\n"
    + "✅ تم تحقيق 1 أهداف\n"
    + "💰 الصفقة الآن محمية بدون خسارة\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76 ← الآن\n"
    + "⏳ TP2: 2347.84\n"
    + "⏳ TP3: 2348.68\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testBreakeven ===\n" + JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  🔥 التعزيز (PYRAMID)
// ─────────────────────────────────────────────

function testPyramidEntry() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🔥 تعزيز شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 3 أهداف محققة\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 التعزيز\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2349.500\n"
    + "🔴 الوقف : 2347.200\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.43 لوت\n"
    + "💸 خسارة فعلية : $9.89 (1.0%)\n"
    + "📏 مسافة الوقف : 2.30\n"
    + "📊 R:R الأقصى : 1:1.96\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 أهداف التعزيز\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔥 TP1: 2352.95 │ R:R 1.50\n"
    + "🔥 TP2: 2356.40 │ R:R 3.00\n"
    + "🔥 TP3: 2359.85 │ R:R 4.50\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testPyramidEntry ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testPyramidTP1() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ✅ هدف التعزيز 1 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 🔥 التعزيز\n"
    + "🎯 2352.95 │ +3.45 نقطة\n"
    + "💰 ربح تقريبي: +$14.85\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ 🔥TP1: 2352.95 ← الآن\n"
    + "⏳ 🔥TP2: 2356.40\n"
    + "⏳ 🔥TP3: 2359.85\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testPyramidTP1 ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testPyramidFullClose() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🏆 تعزيز كامل بالربح! 🎊 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 🔥 التعزيز\n"
    + "🎯 2359.85 │ +10.35 نقطة\n"
    + "💰 ربح تقريبي: +$44.51\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ 🔥TP1: 2352.95\n"
    + "✅ 🔥TP2: 2356.40\n"
    + "✅ 🔥TP3: 2359.85 ← الآن\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎊 جميع أهداف التعزيز!\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testPyramidFullClose ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testPyramidSL() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب وقف التعزيز ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 🔥 التعزيز\n"
    + "❌ الوقف: 2347.200 | -2.30 نقطة\n"
    + "💰 الخسارة: -$9.89\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ 🔥TP1: 2352.95\n"
    + "⏳ 🔥TP2: 2356.40\n"
    + "⏳ 🔥TP3: 2359.85\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testPyramidSL ===\n" + JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  ♻️ التعويض (REENTRY)
// ─────────────────────────────────────────────

function testReentryEntry() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ♻️ صفقة التعويض شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | الاتجاه يدعم الدخول!\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2342.800\n"
    + "🔴 الوقف : 2338.100\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.21 لوت\n"
    + "💸 خسارة فعلية : $9.87 (1.0%)\n"
    + "📏 مسافة الوقف : 4.70\n"
    + "📊 R:R الأقصى : 1:2.13\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "♻️ TP1: 2352.20 │ R:R 2.00\n"
    + "♻️ TP2: 2361.60 │ R:R 4.00\n"
    + "♻️ TP3: 2371.00 │ R:R 6.00\n"
    + "♻️ TP4: 2380.40 │ R:R 8.00\n"
    + "♻️ TP5: 2389.80 │ R:R 10.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testReentryEntry ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testReentryTP1() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ✅ هدف التعويض 1 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "🎯 2352.20 │ +9.40 نقطة\n"
    + "💰 ربح تقريبي: +$19.74\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ ♻️TP1: 2352.20 ← الآن\n"
    + "⏳ ♻️TP2: 2361.60\n"
    + "⏳ ♻️TP3: 2371.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testReentryTP1 ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testReentryFullClose() {
  var text = "╔════════════════════════════════╗\n"
    + "║ 🏆 إغلاق كامل بالربح! ♻️ 🎊 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "🎯 2389.80 │ +47.00 نقطة\n"
    + "💰 ربح تقريبي: +$98.70\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ ♻️TP1: 2352.20\n"
    + "✅ ♻️TP2: 2361.60\n"
    + "✅ ♻️TP3: 2371.00\n"
    + "✅ ♻️TP4: 2380.40\n"
    + "✅ ♻️TP5: 2389.80 ← الآن\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎊 جميع أهداف التعويض!\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testReentryFullClose ===\n" + JSON.stringify(result, null, 2));
  return result;
}

function testReentrySL() {
  var text = "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب وقف التعويض ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "❌ الوقف: 2338.100 | -4.70 نقطة\n"
    + "💰 الخسارة: -$9.87\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ ♻️TP1: 2352.20\n"
    + "⏳ ♻️TP2: 2361.60\n"
    + "⏳ ♻️TP3: 2371.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";

  var result = sendToApp(text);
  Logger.log("=== testReentrySL ===\n" + JSON.stringify(result, null, 2));
  return result;
}


// ─────────────────────────────────────────────
//  🎬 سيناريوهات كاملة (اختبار شامل)
// ─────────────────────────────────────────────

/**
 * صفقة رابحة كاملة: شراء → تأمين → TP1 → TP2 → TP3 → ... → TP10 إغلاق كامل
 * شغّل هذه الدالة فقط — ترسل كل التنبيهات بالتتابع
 */
function testFullWinScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو صفقة رابحة كاملة");
  Logger.log("========================================");

  var delay = 500;

  // 1. إشارة شراء
  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  var r1 = sendToApp(testBuySignalText());
  Logger.log("  النتيجة: " + JSON.stringify(r1));
  Utilities.sleep(delay);

  // 2. تأمين تلقائي عند TP1
  Logger.log("\n▶ الخطوة 2: تأمين تلقائي...");
  var r2 = sendToApp(testBreakevenText());
  Logger.log("  النتيجة: " + JSON.stringify(r2));
  Utilities.sleep(delay);

  // 3. تحقق TP1
  Logger.log("\n▶ الخطوة 3: تحقق TP1...");
  var r3 = sendToApp(testTPText(1));
  Logger.log("  النتيجة: " + JSON.stringify(r3));
  Utilities.sleep(delay);

  // 4. تحقق TP3
  Logger.log("\n▶ الخطوة 4: تحقق TP3...");
  var r4 = sendToApp(testTPText(3));
  Logger.log("  النتيجة: " + JSON.stringify(r4));
  Utilities.sleep(delay);

  // 5. تحقق TP5
  Logger.log("\n▶ الخطوة 5: تحقق TP5...");
  var r5 = sendToApp(testTPText(5));
  Logger.log("  النتيجة: " + JSON.stringify(r5));
  Utilities.sleep(delay);

  // 6. إغلاق كامل (TP10)
  Logger.log("\n▶ الخطوة 6: إغلاق كامل بالربح!...");
  var r6 = sendToApp(testFullCloseText());
  Logger.log("  النتيجة: " + JSON.stringify(r6));

  Logger.log("\n========================================");
  Logger.log("  ✅ انتهى السيناريو");
  Logger.log("========================================");

  return { steps: [r1, r2, r3, r4, r5, r6] };
}

/**
 * صفقة خاسرة: شراء → ضرب وقف مباشر (بدون أهداف)
 */
function testFullLossScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو صفقة خاسرة");
  Logger.log("========================================");

  // 1. إشارة شراء
  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  var r1 = sendToApp(testBuySignalText());
  Logger.log("  النتيجة: " + JSON.stringify(r1));
  Utilities.sleep(500);

  // 2. ضرب وقف مباشر
  Logger.log("\n▶ الخطوة 2: ضرب وقف (خسارة كاملة)...");
  var r2 = sendToApp(testSLHitText());
  Logger.log("  النتيجة: " + JSON.stringify(r2));

  Logger.log("\n========================================");
  Logger.log("  ❌ انتهى السيناريو");
  Logger.log("========================================");

  return { steps: [r1, r2] };
}

/**
 * سيناريو تعويض: شراء → خسارة → دخول تعويض → ربح كامل
 */
function testReentryScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو تعويض كامل");
  Logger.log("========================================");

  // 1. إشارة شراء
  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  var r1 = sendToApp(testBuySignalText());
  Logger.log("  النتيجة: " + JSON.stringify(r1));
  Utilities.sleep(500);

  // 2. ضرب وقف (يُفعّل التعويض)
  Logger.log("\n▶ الخطوة 2: ضرب وقف...");
  var r2 = sendToApp(testSLHitText());
  Logger.log("  النتيجة: " + JSON.stringify(r2));
  Utilities.sleep(500);

  // 3. دخول تعويض
  Logger.log("\n▶ الخطوة 3: دخول تعويض...");
  var r3 = sendToApp(testReentryEntryText());
  Logger.log("  النتيجة: " + JSON.stringify(r3));
  Utilities.sleep(500);

  // 4. تحقق هدف تعويض 1
  Logger.log("\n▶ الخطوة 4: هدف تعويض 1...");
  var r4 = sendToApp(testReentryTP1Text());
  Logger.log("  النتيجة: " + JSON.stringify(r4));
  Utilities.sleep(500);

  // 5. إغلاق تعويض كامل
  Logger.log("\n▶ الخطوة 5: إغلاق تعويض كامل!");
  var r5 = sendToApp(testReentryFullCloseText());
  Logger.log("  النتيجة: " + JSON.stringify(r5));

  Logger.log("\n========================================");
  Logger.log("  ♻️ انتهى السيناريو");
  Logger.log("========================================");

  return { steps: [r1, r2, r3, r4, r5] };
}

/**
 * سيناريو تعويض خاسر
 */
function testReentryLossScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو تعويض خاسر");
  Logger.log("========================================");

  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  sendToApp(testBuySignalText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 2: ضرب وقف...");
  sendToApp(testSLHitText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 3: دخول تعويض...");
  sendToApp(testReentryEntryText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 4: ضرب وقف التعويض...");
  var r4 = sendToApp(testReentrySLText());
  Logger.log("  النتيجة: " + JSON.stringify(r4));

  Logger.log("\n========================================");
  Logger.log("  ❌ انتهى السيناريو");
  Logger.log("========================================");
}

/**
 * سيناريو تعزيز: شراء → TP3 → تعزيز → هدف تعزيز 1 → هدف تعزيز 2 → ضرب وقف
 */
function testPyramidScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو تعزيز كامل");
  Logger.log("========================================");

  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  sendToApp(testBuySignalText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 2: تحقق TP1...");
  sendToApp(testTPText(1));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 3: تحقق TP2...");
  sendToApp(testTPText(2));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 4: تحقق TP3...");
  sendToApp(testTPText(3));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 5: دخول تعزيز...");
  sendToApp(testPyramidEntryText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 6: هدف تعزيز 1...");
  sendToApp(testPyramidTP1Text());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 7: ضرب وقف التعزيز...");
  var r7 = sendToApp(testPyramidSLText());
  Logger.log("  النتيجة: " + JSON.stringify(r7));

  Logger.log("\n========================================");
  Logger.log("  🔥 انتهى السيناريو");
  Logger.log("========================================");
}

/**
 * سيناريو تعزيز خاسر
 */
function testPyramidLossScenario() {
  Logger.log("========================================");
  Logger.log("  🎬 سيناريو تعزيز خاسر");
  Logger.log("========================================");

  Logger.log("\n▶ الخطوة 1: إشارة شراء...");
  sendToApp(testBuySignalText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 2: تحقق TP1...");
  sendToApp(testTPText(1));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 3: تحقق TP2...");
  sendToApp(testTPText(2));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 4: تحقق TP3...");
  sendToApp(testTPText(3));
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 5: دخول تعزيز...");
  sendToApp(testPyramidEntryText());
  Utilities.sleep(500);

  Logger.log("\n▶ الخطوة 6: ضرب وقف التعزيز مباشرة...");
  var r6 = sendToApp(testPyramidSLText());
  Logger.log("  النتيجة: " + JSON.stringify(r6));

  Logger.log("\n========================================");
  Logger.log("  ❌ انتهى السيناريو");
  Logger.log("========================================");
}


// ─────────────────────────────────────────────
//  🔧 دوال مساعدة لتوليد النصوص
// ─────────────────────────────────────────────

function testBuySignalText() {
  return "╔════════════════════════════════╗\n"
    + "║ 🟢 إشارة شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD │ 15 │ 1س\n"
    + "⭐ ⭐⭐ | 📈تقاطع\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2345.100\n"
    + "🔴 الوقف : 2340.500 | تأمين تلقائي TP1\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.20 لوت\n"
    + "💸 خسارة فعلية : $9.20 (0.9%)\n"
    + "📏 مسافة الوقف : 4.60\n"
    + "📊 R:R الأقصى : 1:3.26\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎯 TP1: 2346.76 │ R:R 0.36\n"
    + "🎯 TP2: 2347.84 │ R:R 0.59\n"
    + "🎯 TP3: 2348.68 │ R:R 0.78\n"
    + "🎯 TP4: 2349.73 │ R:R 1.01\n"
    + "🎯 TP5: 2351.50 │ R:R 1.39\n"
    + "🎯 TP6: 2354.04 │ R:R 1.95\n"
    + "🎯 TP7: 2356.85 │ R:R 2.57\n"
    + "🎯 TP8: 2360.98 │ R:R 3.46\n"
    + "🎯 TP9: 2368.03 │ R:R 4.99\n"
    + "🎯 TP10: 2378.40 │ R:R 7.24\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "📈 1س: صاعد 🐂 | SMC: صاعد\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testBreakevenText() {
  return "╔════════════════════════════════╗\n"
    + "║ 🛡️ تأمين تلقائي ← الدخول ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🛡️ تم سحب الوقف لنقطة الدخول تلقائياً\n"
    + "🔵 الدخول: 2345.100\n"
    + "✅ تم تحقيق 1 أهداف\n"
    + "💰 الصفقة الآن محمية بدون خسارة\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ TP1: 2346.76 ← الآن\n"
    + "⏳ TP2: 2347.84\n"
    + "⏳ TP3: 2348.68\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testTPText(n) {
  var tps = [
    { n: 1, p: "2346.76", pts: "1.66", usd: "3.32" },
    { n: 2, p: "2347.84", pts: "2.74", usd: "5.48" },
    { n: 3, p: "2348.68", pts: "3.58", usd: "7.16" },
    { n: 4, p: "2349.73", pts: "4.63", usd: "9.26" },
    { n: 5, p: "2351.50", pts: "6.40", usd: "12.80" },
    { n: 6, p: "2354.04", pts: "8.94", usd: "17.88" },
    { n: 7, p: "2356.85", pts: "11.75", usd: "23.50" },
    { n: 8, p: "2360.98", pts: "15.88", usd: "31.76" },
    { n: 9, p: "2368.03", pts: "22.93", usd: "45.86" },
    { n: 10, p: "2378.40", pts: "33.30", usd: "66.60" }
  ];

  var tp = tps[Math.min(n - 1, 9)];
  var statusList = "";
  for (var i = 0; i < 10; i++) {
    if (i < n) {
      statusList += "✅ TP" + (i + 1) + ": " + tps[i].p + (i === n - 1 ? " ← الآن" : "") + "\n";
    } else {
      statusList += "⏳ TP" + (i + 1) + ": " + tps[i].p + "\n";
    }
  }

  var header = n === 10
    ? "║ 🏆 إغلاق كامل بالربح! ║"
    : "║ ✅ تحقق الهدف " + n + " ║";

  var footer = n === 10
    ? "🎊 جميع الأهداف محققة!\n"
    : "🛡️ التأمين مفعّل\n";

  return "╔════════════════════════════════╗\n"
    + header + "\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "🎯 " + tp.p + " │ +" + tp.pts + " نقطة\n"
    + "💰 ربح تقريبي: +$" + tp.usd + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + statusList
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + footer
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testFullCloseText() {
  return testTPText(10);
}

function testSLHitText() {
  return "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب الوقف — خسارة كاملة ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD\n"
    + "❌ الوقف: 2340.500 | -4.60 نقطة\n"
    + "💰 الخسارة: -$9.20\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ TP1: 2346.76\n"
    + "⏳ TP2: 2347.84\n"
    + "⏳ TP3: 2348.68\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "♻️ جاري البحث عن صفقة بديلة...\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testPyramidEntryText() {
  return "╔════════════════════════════════╗\n"
    + "║ 🔥 تعزيز شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 3 أهداف محققة\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 التعزيز\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2349.500\n"
    + "🔴 الوقف : 2347.200\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.43 لوت\n"
    + "💸 خسارة فعلية : $9.89 (1.0%)\n"
    + "📏 مسافة الوقف : 2.30\n"
    + "📊 R:R الأقصى : 1:1.96\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 أهداف التعزيز\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔥 TP1: 2352.95 │ R:R 1.50\n"
    + "🔥 TP2: 2356.40 │ R:R 3.00\n"
    + "🔥 TP3: 2359.85 │ R:R 4.50\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testPyramidTP1Text() {
  return "╔════════════════════════════════╗\n"
    + "║ ✅ هدف التعزيز 1 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 🔥 التعزيز\n"
    + "🎯 2352.95 │ +3.45 نقطة\n"
    + "💰 ربح تقريبي: +$14.85\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ 🔥TP1: 2352.95 ← الآن\n"
    + "⏳ 🔥TP2: 2356.40\n"
    + "⏳ 🔥TP3: 2359.85\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testPyramidSLText() {
  return "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب وقف التعزيز ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | 🔥 التعزيز\n"
    + "❌ الوقف: 2347.200 | -2.30 نقطة\n"
    + "💰 الخسارة: -$9.89\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ 🔥TP1: 2352.95\n"
    + "⏳ 🔥TP2: 2356.40\n"
    + "⏳ 🔥TP3: 2359.85\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testReentryEntryText() {
  return "╔════════════════════════════════╗\n"
    + "║ ♻️ صفقة التعويض شراء 🚀 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | الاتجاه يدعم الدخول!\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 الصفقة\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🔵 الدخول: 2342.800\n"
    + "🔴 الوقف : 2338.100\n"
    + "\n💰 إدارة المخاطر\n"
    + "💵 الرصيد : $1000.00\n"
    + "🎯 خطر مستهدف : $10.00 (1.0%)\n"
    + "📦 حجم اللوت : 0.21 لوت\n"
    + "💸 خسارة فعلية : $9.87 (1.0%)\n"
    + "📏 مسافة الوقف : 4.70\n"
    + "📊 R:R الأقصى : 1:2.13\n"
    + "🏦 الأداة : الذهب (XAUUSD)\n"
    + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎯 الأهداف\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "♻️ TP1: 2352.20 │ R:R 2.00\n"
    + "♻️ TP2: 2361.60 │ R:R 4.00\n"
    + "♻️ TP3: 2371.00 │ R:R 6.00\n"
    + "♻️ TP4: 2380.40 │ R:R 8.00\n"
    + "♻️ TP5: 2389.80 │ R:R 10.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testReentryTP1Text() {
  return "╔════════════════════════════════╗\n"
    + "║ ✅ هدف التعويض 1 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "🎯 2352.20 │ +9.40 نقطة\n"
    + "💰 ربح تقريبي: +$19.74\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ ♻️TP1: 2352.20 ← الآن\n"
    + "⏳ ♻️TP2: 2361.60\n"
    + "⏳ ♻️TP3: 2371.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testReentryFullCloseText() {
  return "╔════════════════════════════════╗\n"
    + "║ 🏆 إغلاق كامل بالربح! ♻️ 🎊 ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "🎯 2389.80 │ +47.00 نقطة\n"
    + "💰 ربح تقريبي: +$98.70\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "✅ ♻️TP1: 2352.20\n"
    + "✅ ♻️TP2: 2361.60\n"
    + "✅ ♻️TP3: 2371.00\n"
    + "✅ ♻️TP4: 2380.40\n"
    + "✅ ♻️TP5: 2389.80 ← الآن\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "🎊 جميع أهداف التعويض!\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

function testReentrySLText() {
  return "╔════════════════════════════════╗\n"
    + "║ ❌ ضرب وقف التعويض ║\n"
    + "╚════════════════════════════════════════════╝\n\n"
    + "📌 XAUUSD | ♻️ التعويض\n"
    + "❌ الوقف: 2338.100 | -4.70 نقطة\n"
    + "💰 الخسارة: -$9.87\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    + "⏳ ♻️TP1: 2352.20\n"
    + "⏳ ♻️TP2: 2361.60\n"
    + "⏳ ♻️TP3: 2371.00\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 t.me/forexYemeni_Gold";
}

/**
 * اختبار اتصال مباشر — بدون إشارة
 * يرسل طلب ping للتأكد من وصوله للتطبيق
 */
function testConnection() {
  try {
    var result = UrlFetchApp.fetch(APP_URL, {
      method: "get",
      muteHttpExceptions: true,
      followRedirects: true
    });

    var code = result.getResponseCode();
    var body = result.getContentText();

    Logger.log("=== testConnection ===");
    Logger.log("HTTP Status: " + code);
    Logger.log("Response: " + body.substring(0, 500));

    addLog("TEST", "testConnection → HTTP " + code);

    return {
      success: code >= 200 && code < 300,
      httpStatus: code,
      responseBody: body.substring(0, 200)
    };

  } catch (error) {
    Logger.log("=== testConnection ERROR ===");
    Logger.log(error.toString());
    addLog("ERROR", "testConnection → " + error.toString());

    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * اختبار مع WEBOOOK_SECRET — يتحقق أن المصادقة تعمل
 */
function testAuth() {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length === 0) {
    Logger.log("⚠️ WEBHOOK_SECRET غير مضبوط — لن يتم اختبار المصادقة");
    return { warning: "WEBOOOK_SECRET غير مضبوط في الكود" };
  }

  // إرسال بدون Secret (يجب أن يُرفض)
  var r1 = UrlFetchApp.fetch(APP_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: "test without secret" }),
    muteHttpExceptions: true
  });

  // إرسال مع Secret (يجب أن يُقبل)
  var r2 = UrlFetchApp.fetch(APP_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Webhook-Secret": WEBHOOK_SECRET },
    payload: JSON.stringify({ text: "test with secret" }),
    muteHttpExceptions: true
  });

  Logger.log("=== testAuth ===");
  Logger.log("بدون Secret: HTTP " + r1.getResponseCode());
  Logger.log("مع Secret: HTTP " + r2.getResponseCode());

  return {
    withoutSecret: { status: r1.getResponseCode(), shouldFail: r1.getResponseCode() === 401 },
    withSecret: { status: r2.getResponseCode(), shouldPass: r2.getResponseCode() < 300 }
  };
}
