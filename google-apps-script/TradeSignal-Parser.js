// FOREXYEMENI-PRO Google Apps Script v4.0
// Webhook مستقبل إشارات TradingView
// بدون Google Sheets - تسجيل داخلي فقط
//
// بيانات الاتصال:
// - رابط التطبيق: https://trade-signal-pro.vercel.app

var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";

// ═══════════════════════════════════════════════════════════════
//  استقبال التنبيهات من TradingView
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  var logId = saveLog("doPost", "START", "تم استلام طلب");
  
  try {
    // تسجيل معلومات الطلب
    Logger.log("=== doPost استلام طلب جديد ===");
    Logger.log("postData موجود: " + (e.postData ? "نعم" : "لا"));
    
    if (e.postData) {
      Logger.log("postData.type: " + e.postData.type);
      Logger.log("postData.contents (أول 300 حرف): " + (e.postData.contents || "").substring(0, 300));
      Logger.log("postData.length: " + (e.postData.contents || "").length);
    }
    
    // استخراج النص
    var rawText = extractRawText(e);
    Logger.log("النص المستخرج (أول 200 حرف): " + (rawText || "").substring(0, 200));
    
    if (!rawText || !rawText.trim()) {
      saveLog("doPost", "ERROR", "النص فارغ - لم يتم استخراج أي نص");
      return jsonResponse({ success: false, error: "النص فارغ" }, 400);
    }
    
    Logger.log("الفئة: " + detectCategory(rawText));
    
    // إرسال للتطبيق
    Logger.log("إرسال للتطبيق...");
    var result = sendToApp(rawText);
    Logger.log("نتيجة التطبيق: " + JSON.stringify(result));
    
    var status = (result && result.success) ? "SUCCESS" : "APP_ERROR";
    saveLog("doPost", status, rawText.substring(0, 100));
    
    return jsonResponse({ success: true, appResult: result });
    
  } catch (error) {
    Logger.log("خطأ في doPost: " + error.message);
    Logger.log("Stack: " + error.stack);
    saveLog("doPost", "EXCEPTION", error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  
  if (action === "logs") {
    return jsonResponse(getLogs());
  }
  
  return jsonResponse({
    success: true,
    status: "running",
    app: "FOREXYEMENI-PRO",
    version: "4.0",
    appUrl: APP_URL
  });
}

// ═══════════════════════════════════════════════════════════════
//  استخراج النص من الطلب
// ═══════════════════════════════════════════════════════════════

function extractRawText(e) {
  // الحالة 1: لا يوجد postData أصلاً
  if (!e.postData) {
    Logger.log("تنبيه: لا يوجد postData في الطلب");
    return "";
  }
  
  var contents = e.postData.contents;
  
  // الحالة 2: محتوى فارغ
  if (!contents) {
    Logger.log("تنبيه: postData.contents فارغ");
    return "";
  }
  
  // الحالة 3: محاولة تحليل كـ JSON
  try {
    var parsed = JSON.parse(contents);
    Logger.log("تم تحليل المحتوى كـ JSON بنجاح");
    Logger.log("مفاتيح JSON: " + JSON.stringify(Object.keys(parsed)));
    
    if (parsed.text) return parsed.text;
    if (parsed.message) return parsed.message;
    if (parsed.signal) return parsed.signal;
    if (parsed.alert_message) return parsed.alert_message;
    
    // لو JSON ما فيه حقل معروف، نرجع المحتوى كاملاً
    Logger.log("JSON لا يحتوي على حقل text/message/signal - استخدام المحتوى الكامل");
    return contents;
  } catch (err) {
    // ليس JSON - نستخدم المحتوى كما هو (نص خام)
    Logger.log("المحتوى ليس JSON - استخدامه كنص خام");
  }
  
  // الحالة 4: form-urlencoded
  if (e.postData.type === "application/x-www-form-urlencoded") {
    Logger.log("نوع المحتوى: form-urlencoded");
    var params = contents.split("&");
    for (var i = 0; i < params.length; i++) {
      var kv = params[i].split("=");
      if (kv.length === 2) {
        var key = decodeURIComponent(kv[0]);
        var val = decodeURIComponent(kv[1].replace(/\+/g, " "));
        Logger.log("معامل: " + key + " = " + val.substring(0, 100));
        if (key === "text" || key === "message" || key === "signal" || key === "alert_message") {
          return val;
        }
      }
    }
  }
  
  // الحالة 5: نص خام
  Logger.log("استخدام المحتوى كنص خام");
  return contents;
}

// ═══════════════════════════════════════════════════════════════
//  إرسال للتطبيق
// ═══════════════════════════════════════════════════════════════

function sendToApp(rawText) {
  try {
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ text: rawText }),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(APP_URL, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log("استجابة التطبيق - الكود: " + responseCode);
    Logger.log("استجابة التطبيق - المحتوى: " + responseText.substring(0, 500));
    
    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(responseText);
    } else {
      return { success: false, error: "HTTP " + responseCode, body: responseText.substring(0, 200) };
    }
  } catch (error) {
    Logger.log("خطأ في sendToApp: " + error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  نظام التسجيل الداخلي (بدون Google Sheets)
// ═══════════════════════════════════════════════════════════════

function saveLog(source, status, message) {
  try {
    var props = PropertiesService.getScriptProperties();
    var logs = JSON.parse(props.getProperty("webhook_logs") || "[]");
    logs.unshift({
      time: new Date().toISOString(),
      source: source,
      status: status,
      message: message.substring(0, 500)
    });
    // الاحتفاظ بآخر 50 سجل فقط
    if (logs.length > 50) logs = logs.slice(0, 50);
    props.setProperty("webhook_logs", JSON.stringify(logs));
    return logs.length;
  } catch (e) {
    return -1;
  }
}

function getLogs() {
  try {
    var props = PropertiesService.getScriptProperties();
    var logs = JSON.parse(props.getProperty("webhook_logs") || "[]");
    return { success: true, count: logs.length, logs: logs };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function clearLogs() {
  PropertiesService.getScriptProperties().deleteProperty("webhook_logs");
  return { success: true, message: "تم مسح السجلات" };
}

// ═══════════════════════════════════════════════════════════════
//  تصنيف الإشارة
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  مساعدات
// ═══════════════════════════════════════════════════════════════

function jsonResponse(data, code) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ═══════════════════════════════════════════════════════════════
//  دوال الاختبار
// ═══════════════════════════════════════════════════════════════

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
