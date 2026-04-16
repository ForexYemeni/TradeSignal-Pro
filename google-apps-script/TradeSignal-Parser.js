// FOREXYEMENI-PRO Google Apps Script v5.0
// Webhook مستقبل إشارات TradingView
// بدون Google Sheets - تسجيل داخلي فقط
// يكتشف الأهداف المتخطاة ويعبئها تلقائياً
//
// بيانات الاتصال:
// - رابط التطبيق: https://trade-signal-pro.vercel.app

var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";

// ═══════════════════════════════════════════════════════════════
//  استقبال التنبيهات من TradingView
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  saveLog("doPost", "START", "تم استلام طلب");
  
  try {
    Logger.log("=== doPost استلام طلب جديد ===");
    
    if (e.postData) {
      Logger.log("postData.type: " + e.postData.type);
      Logger.log("postData.contents (أول 300): " + (e.postData.contents || "").substring(0, 300));
    }
    
    var rawText = extractRawText(e);
    Logger.log("النص المستخرج (أول 200): " + (rawText || "").substring(0, 200));
    
    if (!rawText || !rawText.trim()) {
      saveLog("doPost", "ERROR", "النص فارغ");
      return jsonResponse({ success: false, error: "النص فارغ" }, 400);
    }
    
    var category = detectCategory(rawText);
    Logger.log("الفئة: " + category);
    
    // إرسال الإشارة الأصلية
    Logger.log("إرسال للتطبيق...");
    var result = sendToApp(rawText);
    Logger.log("نتيجة التطبيق: " + JSON.stringify(result));
    
    // ── كشف وتعبئة الأهداف المتخطاة ──
    if (category === "TP_HIT") {
      var missed = fillMissedTPs(rawText);
      if (missed > 0) {
        Logger.log("تم تعبئة " + missed + " أهداف متخطاة");
        saveLog("FILL_GAP", "SUCCESS", "تم تعبئة " + missed + " أهداف متخطاة");
      }
    }
    
    // ── حفظ حالة آخر ENTRY لكل زوج ──
    if (category === "ENTRY") {
      saveEntryState(rawText);
    }
    
    var status = (result && result.success) ? "SUCCESS" : "APP_ERROR";
    saveLog("doPost", status, rawText.substring(0, 100));
    
    return jsonResponse({ success: true, appResult: result, missedTPsFilled: category === "TP_HIT" ? "checked" : "n/a" });
    
  } catch (error) {
    Logger.log("خطأ في doPost: " + error.message);
    saveLog("doPost", "EXCEPTION", error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  
  if (action === "logs") return jsonResponse(getLogs());
  if (action === "state") return jsonResponse(getAllState());
  if (action === "clear") {
    clearLogs();
    clearAllState();
    return jsonResponse({ success: true, message: "تم مسح السجلات والحالة" });
  }
  
  return jsonResponse({
    success: true,
    status: "running",
    app: "FOREXYEMENI-PRO",
    version: "5.0",
    appUrl: APP_URL
  });
}

// ═══════════════════════════════════════════════════════════════
//  استخراج النص من الطلب
// ═══════════════════════════════════════════════════════════════

function extractRawText(e) {
  if (!e.postData) return "";
  var contents = e.postData.contents;
  if (!contents) return "";
  
  try {
    var parsed = JSON.parse(contents);
    Logger.log("JSON keys: " + JSON.stringify(Object.keys(parsed)));
    if (parsed.text) return parsed.text;
    if (parsed.message) return parsed.message;
    if (parsed.signal) return parsed.signal;
    if (parsed.alert_message) return parsed.alert_message;
    return contents;
  } catch (err) {}
  
  if (e.postData.type === "application/x-www-form-urlencoded") {
    var params = contents.split("&");
    for (var i = 0; i < params.length; i++) {
      var kv = params[i].split("=");
      if (kv.length === 2) {
        var key = decodeURIComponent(kv[0]);
        var val = decodeURIComponent(kv[1].replace(/\+/g, " "));
        if (key === "text" || key === "message" || key === "signal" || key === "alert_message") return val;
      }
    }
  }
  
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
    var code = response.getResponseCode();
    var text = response.getContentText();
    
    Logger.log("استجابة التطبيق - الكود: " + code);
    
    if (code >= 200 && code < 300) {
      return JSON.parse(text);
    } else {
      return { success: false, error: "HTTP " + code };
    }
  } catch (error) {
    Logger.log("خطأ في sendToApp: " + error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  كشف وتعبئة الأهداف المتخطاة
// ═══════════════════════════════════════════════════════════════

function fillMissedTPs(tpAlertText) {
  var pair = extractPairFromText(tpAlertText);
  if (!pair) return 0;
  
  // استخراج رقم الهدف الحالي الذي وصل
  var currentTP = extractTPNumberFromText(tpAlertText);
  if (currentTP <= 0) return 0;
  
  // استخراج قائمة حالة الأهداف من التنبيه
  // مثل: ✅ TP1: 2343.94  ✅ TP2: 2345.13  ✅ TP3: 2345.98 ← الآن
  var tpStatuses = extractTPStatusesFromText(tpAlertText);
  Logger.log("حالة الأهداف: " + JSON.stringify(tpStatuses));
  
  // استخراج آخر TP تم إرساله لهذا الزوج
  var lastTP = getLastTPForPair(pair);
  Logger.log("آخر TP مسجل لـ " + pair + ": " + lastTP);
  
  // الأهداف التي تحققت (✅) في التنبيه الحالي
  var confirmedTPs = [];
  for (var i = 0; i < tpStatuses.length; i++) {
    if (tpStatuses[i].hit) confirmedTPs.push(tpStatuses[i].index);
  }
  Logger.log("الأهداف المتحققة: " + JSON.stringify(confirmedTPs));
  
  // الأهداف المفقودة: بين lastTP+1 و currentTP-1
  var missed = [];
  for (var tp = lastTP + 1; tp < currentTP; tp++) {
    // تحقق أنه فعلاً تحقق (✅ في القائمة)
    if (confirmedTPs.indexOf(tp) !== -1) {
      missed.push(tp);
    }
  }
  
  if (missed.length === 0) {
    // تحديث آخر TP
    updateLastTPForPair(pair, currentTP);
    return 0;
  }
  
  Logger.log("أهداف متخطاة لـ " + pair + ": " + JSON.stringify(missed));
  
  // بناء وإرسال إشارات للأهداف المفقودة
  var filledCount = 0;
  for (var j = 0; j < missed.length; j++) {
    var missedTPNum = missed[j];
    // البحث عن بيانات الهدف المفقود
    var tpData = getTPDataFromStatus(tpStatuses, missedTPNum);
    if (tpData) {
      // حساب النقاط والربح
      var points = calculatePoints(tpStatuses, missedTPNum, pair);
      var profit = calculateProfit(points, pair);
      
      var missedSignal = buildMissedTPSignal(pair, missedTPNum, tpData.price, points, profit, tpStatuses, currentTP);
      Logger.log("إرسال هدف متخطى TP" + missedTPNum + ": " + missedSignal.substring(0, 100));
      
      var result = sendToApp(missedSignal);
      Logger.log("نتيجة TP" + missedTPNum + ": " + JSON.stringify(result));
      filledCount++;
    }
  }
  
  // تحديث آخر TP
  updateLastTPForPair(pair, currentTP);
  
  return filledCount;
}

function extractPairFromText(text) {
  var match = text.match(/📌\s*([A-Za-z]{3,12}(?:\/[A-Za-z]{3})?)/i);
  if (match) return match[1].replace(/\s/g, "").toUpperCase();
  return null;
}

function extractTPNumberFromText(text) {
  // "تحقق الهدف 6" أو "تحقق الهدف 1"
  var match = text.match(/تحقق الهدف\s*(\d+)/);
  if (match) return parseInt(match[1]);
  
  // "إغلاق كامل بالربح" - نبحث عن أعلى TP متحقق
  var fullCloseMatch = text.match(/إغلاق كامل بالربح/);
  if (fullCloseMatch) {
    var highest = 0;
    var tpMatches = text.matchAll(/TP\s*(\d+)/g);
    while (true) {
      var m = tpMatches.next();
      if (m.done) break;
      var idx = parseInt(m.value[1]);
      if (idx > highest) highest = idx;
    }
    return highest;
  }
  
  return -1;
}

function extractTPStatusesFromText(text) {
  var statuses = [];
  // نمط: ✅ TP1: 2343.94 أو ⏳ TP2: 2345.13 أو ✅ TP3: 2345.98 ← الآن
  var regex = /([✅⏳])\s*TP\s*(\d+)\s*[:\s]\s*([\d,.]+)/g;
  var match;
  while ((match = regex.exec(text)) !== null) {
    statuses.push({
      hit: match[1] === "✅",
      index: parseInt(match[2]),
      price: parseFloat(match[3].replace(/,/g, ""))
    });
  }
  return statuses;
}

function getTPDataFromStatus(tpStatuses, tpIndex) {
  for (var i = 0; i < tpStatuses.length; i++) {
    if (tpStatuses[i].index === tpIndex) return tpStatuses[i];
  }
  return null;
}

function calculatePoints(tpStatuses, tpIndex, pair) {
  // نبحث عن TP1 لنحسب النقاط منه
  var tp1Price = null;
  var currentTPPrice = null;
  var entryPrice = null;
  
  for (var i = 0; i < tpStatuses.length; i++) {
    if (tpStatuses[i].index === 1) tp1Price = tpStatuses[i].price;
    if (tpStatuses[i].index === tpIndex) currentTPPrice = tpStatuses[i].price;
  }
  
  if (tp1Price && currentTPPrice) {
    return Math.round((currentTPPrice - tp1Price) * 100) / 100;
  }
  return 0;
}

function calculateProfit(points, pair) {
  // حساب تقريبي بناءً على نوع الأداة
  // هذه قيم افتراضية - التطبيق سيستخدم بيانات ENTRY الأصلية
  return Math.round(points * 100) / 100;
}

function buildMissedTPSignal(pair, tpNum, price, points, profit, allStatuses, latestTP) {
  // بناء نص تنبيه TP متخطاة
  var signal = "✅ تحقق الهدف " + tpNum + "\n";
  signal += "\n";
  signal += "📌 " + pair + "\n";
  signal += "🎯 " + price.toFixed(2) + " │ " + (points >= 0 ? "+" : "") + points.toFixed(2) + " نقطة\n";
  signal += "💰 ربح تقريبي: +$" + profit.toFixed(2) + "\n";
  signal += "\n";
  
  for (var i = 0; i < allStatuses.length; i++) {
    var tp = allStatuses[i];
    var icon = tp.hit ? "✅" : "⏳";
    var arrow = "";
    if (tp.index === tpNum) arrow = " ← الآن (متخطى)";
    signal += icon + " TP" + tp.index + ": " + tp.price.toFixed(2) + arrow + "\n";
  }
  
  return signal;
}

// ═══════════════════════════════════════════════════════════════
//  إدارة حالة الأهداف لكل زوج
// ═══════════════════════════════════════════════════════════════

function getLastTPForPair(pair) {
  var props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty("tp_state") || "{}");
  return (state[pair] && state[pair].lastTP) ? state[pair].lastTP : 0;
}

function updateLastTPForPair(pair, tpNum) {
  var props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty("tp_state") || "{}");
  if (!state[pair]) state[pair] = {};
  state[pair].lastTP = tpNum;
  state[pair].updatedAt = new Date().toISOString();
  props.setProperty("tp_state", JSON.stringify(state));
}

function saveEntryState(rawText) {
  var pair = extractPairFromText(rawText);
  if (!pair) return;
  
  // عند إشارة دخول جديدة، نعيد تعيين عداد TP
  var props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty("tp_state") || "{}");
  state[pair] = {
    lastTP: 0,
    entryAt: new Date().toISOString(),
    rawEntry: rawText.substring(0, 200)
  };
  props.setProperty("tp_state", JSON.stringify(state));
  Logger.log("تم حفظ حالة ENTRY جديدة لـ " + pair);
}

function getAllState() {
  var props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty("tp_state") || "{}");
  return { success: true, state: state };
}

function clearAllState() {
  PropertiesService.getScriptProperties().deleteProperty("tp_state");
}

// ═══════════════════════════════════════════════════════════════
//  نظام التسجيل الداخلي
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

function jsonResponse(data) {
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

  Logger.log("-- الخطوة 3: تحقق TP3 (تخطى TP2) --");
  var tp3Signal = "✅ تحقق الهدف 3\n"
    + "\n"
    + "📌 XAUUSD\n"
    + "🎯 2661.0 | +10.5 نقطة\n"
    + "💰 ربح تقريبي: +$21.0\n"
    + "\n"
    + "✅ TP1: 2653.0\n"
    + "✅ TP2: 2656.5\n"
    + "✅ TP3: 2661.0 ← الآن";
  var r3 = sendToApp(tp3Signal);
  Logger.log("TP3: " + JSON.stringify(r3));

  Logger.log("انتهى السيناريو الكامل");
  return { step1: r1, step2: r2, step3: r3 };
}

// اختبار محدد: محاكاة تخطي أهداف
function testMissedTPs() {
  Logger.log("=== اختبار تعبئة الأهداف المتخطاة ===");
  
  // الخطوة 1: إشارة دخول
  Logger.log("-- دخول ETHUSDT --");
  var entry = "🟢 إشارة شراء 🚀\n\n📌 ETHUSDT\n\n📊 الصفقة\n🔵 الدخول: 2342.02\n🔴 الوقف : 2340.0\n\n🎯 الأهداف\n🎯 TP1: 2343.94\n🎯 TP2: 2345.13\n🎯 TP3: 2345.98\n🎯 TP4: 2347.05\n🎯 TP5: 2348.42\n🎯 TP6: 2350.17";
  sendToApp(entry);
  saveEntryState(entry);
  
  // الخطوة 2: TP1 يصل عادي
  Logger.log("-- TP1 وصل --");
  var tp1 = "✅ تحقق الهدف 1\n\n📌 ETHUSDT\n🎯 2343.94 │ +1.92 نقطة\n💰 ربح تقريبي: +$1.92\n\n✅ TP1: 2343.94 ← الآن\n⏳ TP2: 2345.13\n⏳ TP3: 2345.98\n⏳ TP4: 2347.05\n⏳ TP5: 2348.42\n⏳ TP6: 2350.17";
  fillMissedTPs(tp1);
  
  // الخطوة 3: TP3 يصل (تخطى TP2!)
  Logger.log("-- TP3 وصل (تخطى TP2) --");
  var tp3 = "✅ تحقق الهدف 3\n\n📌 ETHUSDT\n🎯 2345.98 │ +3.96 نقطة\n💰 ربح تقريبي: +$3.96\n\n✅ TP1: 2343.94\n✅ TP2: 2345.13\n✅ TP3: 2345.98 ← الآن\n⏳ TP4: 2347.05\n⏳ TP5: 2348.42\n⏳ TP6: 2350.17";
  var filled = fillMissedTPs(tp3);
  Logger.log("عدد الأهداف المتخطاة المعبأة: " + filled);
  
  // الخطوة 4: TP6 يصل (تخطى TP4 و TP5!)
  Logger.log("-- TP6 وصل (تخطى TP4 و TP5) --");
  var tp6 = "✅ تحقق الهدف 6\n\n📌 ETHUSDT\n🎯 2350.17 │ +8.15 نقطة\n💰 ربح تقريبي: +$8.15\n\n✅ TP1: 2343.94\n✅ TP2: 2345.13\n✅ TP3: 2345.98\n✅ TP4: 2347.05\n✅ TP5: 2348.42\n✅ TP6: 2350.17 ← الآن";
  var filled2 = fillMissedTPs(tp6);
  Logger.log("عدد الأهداف المتخطاة المعبأة: " + filled2);
  
  Logger.log("=== انتهى اختبار الأهداف المتخطاة ===");
  return { tp3_filled: filled, tp6_filled: filled2 };
}
