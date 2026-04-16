// FOREXYEMENI-PRO Google Apps Script v5.0
// Webhook مستقبل إشارات TradingView
// يكتشف الأهداف المتخطاة ويعبئها تلقائياً
// يحتوي على دوال اختبار شاملة لكل نوع إشارة

var APP_URL = "https://trade-signal-pro.vercel.app/api/signals";

// ═══════════════════════════════════════════════════════════════
//  بيانات الاختبار الأساسية - XAUUSD
// ═══════════════════════════════════════════════════════════════

var PAIR = "XAUUSD";
var ENTRY_PRICE = 2650.5;
var SL_PRICE = 2645.0;
var BALANCE = 1000;
var LOT_SIZE = "0.20 لوت";
var RISK_TARGET = 10;
var RISK_PCT = 1.0;
var ACTUAL_RISK = 11;
var ACTUAL_RISK_PCT = 1.1;
var SL_DISTANCE = 5.5;
var MAX_RR = 9.0;
var INSTRUMENT = "الذهب (XAUUSD)";

// بيانات الأهداف العشرة
var TPS = [
  { num: 1,  price: 2653.0, points: 2.5,  rr: 0.45, profit: 5.0  },
  { num: 2,  price: 2656.5, points: 6.0,  rr: 1.09, profit: 12.0 },
  { num: 3,  price: 2661.0, points: 10.5, rr: 1.91, profit: 21.0 },
  { num: 4,  price: 2665.5, points: 15.0, rr: 2.73, profit: 30.0 },
  { num: 5,  price: 2670.0, points: 19.5, rr: 3.55, profit: 39.0 },
  { num: 6,  price: 2675.5, points: 25.0, rr: 4.55, profit: 50.0 },
  { num: 7,  price: 2681.0, points: 30.5, rr: 5.55, profit: 61.0 },
  { num: 8,  price: 2687.0, points: 36.5, rr: 6.64, profit: 73.0 },
  { num: 9,  price: 2693.0, points: 42.5, rr: 7.73, profit: 85.0 },
  { num: 10, price: 2700.0, points: 49.5, rr: 9.00, profit: 99.0 },
];

// ═══════════════════════════════════════════════════════════════
//  ربط الأهداف - استقبال التنبيهات
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  saveLog("doPost", "START", "تم استلام طلب");
  try {
    var rawText = extractRawText(e);
    if (!rawText || !rawText.trim()) {
      saveLog("doPost", "ERROR", "النص فارغ");
      return jsonResponse({ success: false, error: "النص فارغ" }, 400);
    }
    var category = detectCategory(rawText);
    var result = sendToApp(rawText);
    if (category === "TP_HIT") {
      var missed = fillMissedTPs(rawText);
      if (missed > 0) saveLog("FILL_GAP", "SUCCESS", "تم تعبئة " + missed + " أهداف متخطاة");
    }
    if (category === "ENTRY") saveEntryState(rawText);
    var status = (result && result.success) ? "SUCCESS" : "APP_ERROR";
    saveLog("doPost", status, rawText.substring(0, 100));
    return jsonResponse({ success: true, appResult: result });
  } catch (error) {
    saveLog("doPost", "EXCEPTION", error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "logs") return jsonResponse(getLogs());
  if (action === "state") return jsonResponse(getAllState());
  if (action === "clear") { clearLogs(); clearAllState(); return jsonResponse({ success: true }); }
  return jsonResponse({ success: true, status: "running", app: "FOREXYEMENI-PRO", version: "5.0", appUrl: APP_URL });
}

// ═══════════════════════════════════════════════════════════════
//  استخراج النص وإرساله
// ═══════════════════════════════════════════════════════════════

function extractRawText(e) {
  if (!e.postData || !e.postData.contents) return "";
  var contents = e.postData.contents;
  try {
    var parsed = JSON.parse(contents);
    return parsed.text || parsed.message || parsed.signal || parsed.alert_message || contents;
  } catch (err) {}
  if (e.postData.type === "application/x-www-form-urlencoded") {
    var params = contents.split("&");
    for (var i = 0; i < params.length; i++) {
      var kv = params[i].split("=");
      if (kv.length === 2) {
        var key = decodeURIComponent(kv[0]);
        var val = decodeURIComponent(kv[1].replace(/\+/g, " "));
        if (key === "text" || key === "message" || key === "signal") return val;
      }
    }
  }
  return contents;
}

function sendToApp(rawText) {
  try {
    var options = { method: "post", contentType: "application/json", payload: JSON.stringify({ text: rawText }), muteHttpExceptions: true };
    var response = UrlFetchApp.fetch(APP_URL, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    if (code >= 200 && code < 300) return JSON.parse(text);
    return { success: false, error: "HTTP " + code };
  } catch (error) { return { success: false, error: error.message }; }
}

// ═══════════════════════════════════════════════════════════════
//  كشف وتعبئة الأهداف المتخطاة
// ═══════════════════════════════════════════════════════════════

function fillMissedTPs(tpAlertText) {
  var pair = extractPairFromText(tpAlertText);
  if (!pair) return 0;
  var currentTP = extractTPNumberFromText(tpAlertText);
  if (currentTP <= 0) return 0;
  var tpStatuses = extractTPStatusesFromText(tpAlertText);
  var lastTP = getLastTPForPair(pair);
  var confirmedTPs = [];
  for (var i = 0; i < tpStatuses.length; i++) { if (tpStatuses[i].hit) confirmedTPs.push(tpStatuses[i].index); }
  var missed = [];
  for (var tp = lastTP + 1; tp < currentTP; tp++) { if (confirmedTPs.indexOf(tp) !== -1) missed.push(tp); }
  if (missed.length === 0) { updateLastTPForPair(pair, currentTP); return 0; }
  var filledCount = 0;
  for (var j = 0; j < missed.length; j++) {
    var missedTPNum = missed[j];
    var tpData = getTPDataFromStatus(tpStatuses, missedTPNum);
    if (tpData) {
      var points = calculatePoints(tpStatuses, missedTPNum);
      var missedSignal = buildMissedTPSignal(pair, missedTPNum, tpData.price, points, tpStatuses);
      sendToApp(missedSignal);
      filledCount++;
    }
  }
  updateLastTPForPair(pair, currentTP);
  return filledCount;
}

function extractPairFromText(t) { var m = t.match(/📌\s*([A-Za-z]{3,12}(?:\/[A-Za-z]{3})?)/i); return m ? m[1].replace(/\s/g, "").toUpperCase() : null; }
function extractTPNumberFromText(t) { var m = t.match(/تحقق الهدف\s*(\d+)/); if (m) return parseInt(m[1]); if (/إغلاق كامل بالربح/.test(t)) { var h=0,r=/TP\s*(\d+)/g,n; while((n=r.exec(t))!==null){var x=parseInt(n[1]);if(x>h)h=x;} return h; } return -1; }
function extractTPStatusesFromText(t) { var s=[],r=/([✅⏳])\s*TP\s*(\d+)\s*[:\s]\s*([\d,.]+)/g,m; while((m=r.exec(t))!==null) s.push({hit:m[1]==="✅",index:parseInt(m[2]),price:parseFloat(m[3].replace(/,/g,""))}); return s; }
function getTPDataFromStatus(s,i) { for(var k=0;k<s.length;k++) if(s[k].index===i) return s[k]; return null; }
function calculatePoints(s,i) { var p1=null,ci=null; for(var k=0;k<s.length;k++){if(s[k].index===1)p1=s[k].price;if(s[k].index===i)ci=s[k].price;} return(p1&&ci)?Math.round((ci-p1)*100)/100:0; }
function buildMissedTPSignal(pair,num,price,pts,all) { var t="✅ تحقق الهدف "+num+"\n\n📌 "+pair+"\n🎯 "+price.toFixed(2)+" │ "+(pts>=0?"+":"")+pts.toFixed(2)+" نقطة\n\n"; for(var i=0;i<all.length;i++){var tp=all[i]; t+=(tp.hit?"✅":"⏳")+" TP"+tp.index+": "+tp.price.toFixed(2)+(tp.index===num?" ← الآن (متخطى)":"")+"\n"; } return t; }

// ═══════════════════════════════════════════════════════════════
//  إدارة الحالة والتسجيل
// ═══════════════════════════════════════════════════════════════

function getLastTPForPair(p) { var s=JSON.parse(PropertiesService.getScriptProperties().getProperty("tp_state")||"{}"); return(s[p]&&s[p].lastTP)?s[p].lastTP:0; }
function updateLastTPForPair(p,n) { var pr=PropertiesService.getScriptProperties(); var s=JSON.parse(pr.getProperty("tp_state")||"{}"); if(!s[p])s[p]={}; s[p].lastTP=n; s[p].updatedAt=new Date().toISOString(); pr.setProperty("tp_state",JSON.stringify(s)); }
function saveEntryState(t) { var p=extractPairFromText(t); if(!p)return; var pr=PropertiesService.getScriptProperties(); var s=JSON.parse(pr.getProperty("tp_state")||"{}"); s[p]={lastTP:0,entryAt:new Date().toISOString()}; pr.setProperty("tp_state",JSON.stringify(s)); }
function getAllState() { return {success:true,state:JSON.parse(PropertiesService.getScriptProperties().getProperty("tp_state")||"{}")}; }
function clearAllState() { PropertiesService.getScriptProperties().deleteProperty("tp_state"); }

function saveLog(src,status,msg) { try{var pr=PropertiesService.getScriptProperties(); var l=JSON.parse(pr.getProperty("webhook_logs")||"[]"); l.unshift({time:new Date().toISOString(),source:src,status:status,message:msg.substring(0,500)}); if(l.length>50)l=l.slice(0,50); pr.setProperty("webhook_logs",JSON.stringify(l)); }catch(e){} }
function getLogs() { try{return{success:true,count:JSON.parse(PropertiesService.getScriptProperties().getProperty("webhook_logs")||"[]").length,logs:JSON.parse(PropertiesService.getScriptProperties().getProperty("webhook_logs")||"[]")};}catch(e){return{success:false};} }
function clearLogs() { PropertiesService.getScriptProperties().deleteProperty("webhook_logs"); }

function detectCategory(text) {
  if (/إغلاق كامل بالربح/.test(text)&&/♻️/.test(text)) return "TP_HIT";
  if (/هدف التعويض/.test(text)) return "TP_HIT";
  if (/تعزيز كامل بالربح/.test(text)) return "TP_HIT";
  if (/هدف التعزيز/.test(text)) return "TP_HIT";
  if (/إغلاق كامل بالربح/.test(text)) return "TP_HIT";
  if (/قفزة سعرية/.test(text)) return "TP_HIT";
  if (/تحقق الهدف/.test(text)) return "TP_HIT";
  if (/ضرب وقف التعويض/.test(text)) return "SL_HIT";
  if (/ضرب وقف التعزيز/.test(text)) return "SL_HIT";
  if (/ضرب الوقف/.test(text)) return "SL_HIT";
  if (/إشارة شراء/.test(text)||/إشارة بيع/.test(text)) return "ENTRY";
  if (/صفقة التعويض/.test(text)) return "ENTRY";
  if (/تعزيز/.test(text)&&/الدخول:/.test(text)) return "ENTRY";
  return "OTHER";
}

function jsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

// ═══════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🔧 أدوات بناء الإشارات - لا تعدل هذه القسم                                                  
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function buildEntryText(type) {
  var arrow = type === "BUY" ? "🟢 إشارة شراء 🚀" : "🔴 إشارة بيع 📉";
  var tps = "";
  for (var i = 0; i < TPS.length; i++) {
    tps += "🎯 TP" + TPS[i].num + ": " + TPS[i].price.toFixed(1) + " | R:R " + TPS[i].rr.toFixed(2) + "\n";
  }
  return arrow + "\n\n📌 " + PAIR + " | 15 | 1س\n⭐ ⭐⭐⭐\n\n"
    + "📊 الصفقة\n🔵 الدخول: " + ENTRY_PRICE.toFixed(1) + "\n🔴 الوقف : " + SL_PRICE.toFixed(1) + "\n\n"
    + "💰 إدارة المخاطر\n💵 الرصيد : $" + BALANCE + "\n🎯 خطر مستهدف : $" + RISK_TARGET + " (" + RISK_PCT + "%)\n"
    + "📦 حجم اللوت : " + LOT_SIZE + "\n💸 خسارة فعلية : $" + ACTUAL_RISK + " (" + ACTUAL_RISK_PCT + "%)\n"
    + "📏 مسافة الوقف : " + SL_DISTANCE + "\n📊 R:R الأقصى : 1:" + MAX_RR.toFixed(2) + "\n🏦 الأداة : " + INSTRUMENT + "\n\n"
    + "🎯 الأهداف\n" + tps + "\n📈 1س: صاعد 🐂 | SMC: صاعد";
}

function buildTPListText(upTo) {
  var lines = "";
  for (var i = 0; i < TPS.length; i++) {
    var icon = (i < upTo) ? "✅" : "⏳";
    var arrow = (i === upTo - 1) ? " ← الآن" : "";
    lines += icon + " TP" + TPS[i].num + ": " + TPS[i].price.toFixed(1) + arrow + "\n";
  }
  return lines.trim();
}

function buildTPHitText(tpNum) {
  var tp = TPS[tpNum - 1];
  return "✅ تحقق الهدف " + tpNum + "\n\n📌 " + PAIR + "\n"
    + "🎯 " + tp.price.toFixed(1) + " │ +" + tp.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + tp.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildTPListText(tpNum) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildFullCloseText() {
  var last = TPS[TPS.length - 1];
  return "🏆 إغلاق كامل بالربح\n\n📌 " + PAIR + "\n"
    + "🎯 " + last.price.toFixed(1) + " │ +" + last.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + last.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildTPListText(TPS.length) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildSLHitText() {
  return "❌ ضرب الوقف\n\n📌 " + PAIR + "\n"
    + "❌ " + SL_PRICE.toFixed(1) + " │ -" + SL_DISTANCE.toFixed(1) + " نقطة\n"
    + "💰 خسارة: -$" + ACTUAL_RISK.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildTPListText(0) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

// ── أدوات بناء إشارات التعويض ♻️ ──

var REENTRY_ENTRY = 2656.5;
var REENTRY_SL = 2645.0;
var REENTRY_TPS = [
  { num: 1, price: 2659.0, points: 2.5, rr: 0.45, profit: 5.0 },
  { num: 2, price: 2662.5, points: 6.0, rr: 1.09, profit: 12.0 },
  { num: 3, price: 2667.0, points: 10.5, rr: 1.91, profit: 21.0 },
  { num: 4, price: 2672.0, points: 15.5, rr: 2.82, profit: 31.0 },
  { num: 5, price: 2678.0, points: 21.5, rr: 3.91, profit: 43.0 },
];

function buildReentryEntryText(type) {
  var dir = type === "BUY" ? "شراء" : "بيع";
  var tps = "";
  for (var i = 0; i < REENTRY_TPS.length; i++) {
    tps += "♻️ TP" + REENTRY_TPS[i].num + ": " + REENTRY_TPS[i].price.toFixed(1) + " │ R:R " + REENTRY_TPS[i].rr.toFixed(2) + "\n";
  }
  return "♻️ صفقة التعويض\n\n📌 " + PAIR + "\n\n"
    + "📊 الصفقة\n🔵 الدخول: " + REENTRY_ENTRY.toFixed(1) + "\n🔴 الوقف : " + REENTRY_SL.toFixed(1) + "\n\n"
    + "💰 إدارة المخاطر\n💵 الرصيد : $" + BALANCE + "\n📦 حجم اللوت : " + LOT_SIZE + "\n"
    + "💸 خسارة فعلية : $" + (Math.abs(REENTRY_ENTRY - REENTRY_SL) * 2).toFixed(1) + "\n\n"
    + "🎯 الأهداف\n" + tps;
}

function buildReentryTPListText(upTo) {
  var lines = "";
  for (var i = 0; i < REENTRY_TPS.length; i++) {
    var icon = (i < upTo) ? "✅" : "⏳";
    var arrow = (i === upTo - 1) ? " ← الآن" : "";
    lines += icon + " TP" + REENTRY_TPS[i].num + ": " + REENTRY_TPS[i].price.toFixed(1) + arrow + "\n";
  }
  return lines.trim();
}

function buildReentryTPText(tpNum) {
  var tp = REENTRY_TPS[tpNum - 1];
  return "♻️ هدف التعويض " + tpNum + "\n\n📌 " + PAIR + "\n"
    + "🎯 " + tp.price.toFixed(1) + " │ +" + tp.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + tp.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildReentryTPListText(tpNum) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildReentryFullCloseText() {
  var last = REENTRY_TPS[REENTRY_TPS.length - 1];
  return "🏆 إغلاق كامل بالربح\n♻️ تعويض\n\n📌 " + PAIR + "\n"
    + "🎯 " + last.price.toFixed(1) + " │ +" + last.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + last.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildReentryTPListText(REENTRY_TPS.length) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildReentrySLText() {
  var loss = Math.abs(REENTRY_ENTRY - REENTRY_SL) * 2;
  return "❌ ضرب وقف التعويض\n\n📌 " + PAIR + "\n"
    + "❌ " + REENTRY_SL.toFixed(1) + " │ -" + Math.abs(REENTRY_ENTRY - REENTRY_SL).toFixed(1) + " نقطة\n"
    + "💰 خسارة: -$" + loss.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildReentryTPListText(0) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

// ── أدوات بناء إشارات التعزيز 🔥 ──

var PYRAMID_ENTRY = 2653.0;
var PYRAMID_SL = 2648.0;
var PYRAMID_TPS = [
  { num: 1, price: 2656.0, points: 3.0, rr: 0.60, profit: 6.0 },
  { num: 2, price: 2660.0, points: 7.0, rr: 1.40, profit: 14.0 },
  { num: 3, price: 2665.0, points: 12.0, rr: 2.40, profit: 24.0 },
  { num: 4, price: 2671.0, points: 18.0, rr: 3.60, profit: 36.0 },
  { num: 5, price: 2678.0, points: 25.0, rr: 5.00, profit: 50.0 },
];

function buildPyramidEntryText(type) {
  var dir = type === "BUY" ? "شراء" : "بيع";
  var tps = "";
  for (var i = 0; i < PYRAMID_TPS.length; i++) {
    tps += "🔥 TP" + PYRAMID_TPS[i].num + ": " + PYRAMID_TPS[i].price.toFixed(1) + " │ R:R " + PYRAMID_TPS[i].rr.toFixed(2) + "\n";
  }
  return "🔥 تعزيز - إشارة " + dir + "\n\n📌 " + PAIR + "\n\n"
    + "📊 الصفقة\n🔵 الدخول: " + PYRAMID_ENTRY.toFixed(1) + "\n🔴 الوقف : " + PYRAMID_SL.toFixed(1) + "\n\n"
    + "💰 إدارة المخاطر\n💵 الرصيد : $" + BALANCE + "\n📦 حجم اللوت : " + LOT_SIZE + "\n"
    + "💸 خسارة فعلية : $" + (Math.abs(PYRAMID_ENTRY - PYRAMID_SL) * 2).toFixed(1) + "\n\n"
    + "🎯 الأهداف\n" + tps;
}

function buildPyramidTPListText(upTo) {
  var lines = "";
  for (var i = 0; i < PYRAMID_TPS.length; i++) {
    var icon = (i < upTo) ? "✅" : "⏳";
    var arrow = (i === upTo - 1) ? " ← الآن" : "";
    lines += icon + " TP" + PYRAMID_TPS[i].num + ": " + PYRAMID_TPS[i].price.toFixed(1) + arrow + "\n";
  }
  return lines.trim();
}

function buildPyramidTPText(tpNum) {
  var tp = PYRAMID_TPS[tpNum - 1];
  return "🔥 هدف التعزيز " + tpNum + "\n\n📌 " + PAIR + "\n"
    + "🎯 " + tp.price.toFixed(1) + " │ +" + tp.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + tp.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildPyramidTPListText(tpNum) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildPyramidFullCloseText() {
  var last = PYRAMID_TPS[PYRAMID_TPS.length - 1];
  return "🔥 تعزيز كامل بالربح\n\n📌 " + PAIR + "\n"
    + "🎯 " + last.price.toFixed(1) + " │ +" + last.points.toFixed(1) + " نقطة\n"
    + "💰 ربح تقريبي: +$" + last.profit.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildPyramidTPListText(PYRAMID_TPS.length) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

function buildPyramidSLText() {
  var loss = Math.abs(PYRAMID_ENTRY - PYRAMID_SL) * 2;
  return "❌ ضرب وقف التعزيز\n\n📌 " + PAIR + "\n"
    + "❌ " + PYRAMID_SL.toFixed(1) + " │ -" + Math.abs(PYRAMID_ENTRY - PYRAMID_SL).toFixed(1) + " نقطة\n"
    + "💰 خسارة: -$" + loss.toFixed(1) + "\n\n"
    + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + buildPyramidTPListText(0) + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
}

// ═══════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - إشارات الدخول                                                               
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function testBuySignal() {
  Logger.log("=== إشارة شراء ===");
  var result = sendToApp(buildEntryText("BUY"));
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

function testSellSignal() {
  Logger.log("=== إشارة بيع ===");
  var result = sendToApp(buildEntryText("SELL"));
  Logger.log("النتيجة: " + JSON.stringify(result));
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - تحقق الأهداف (1 إلى 10)                                                     
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function testTP1() {
  Logger.log("=== تحقق الهدف 1 | +2.5 نقطة | +$5.0 ===");
  var r = sendToApp(buildTPHitText(1));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP2() {
  Logger.log("=== تحقق الهدف 2 | +6.0 نقطة | +$12.0 ===");
  var r = sendToApp(buildTPHitText(2));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP3() {
  Logger.log("=== تحقق الهدف 3 | +10.5 نقطة | +$21.0 ===");
  var r = sendToApp(buildTPHitText(3));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP4() {
  Logger.log("=== تحقق الهدف 4 | +15.0 نقطة | +$30.0 ===");
  var r = sendToApp(buildTPHitText(4));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP5() {
  Logger.log("=== تحقق الهدف 5 | +19.5 نقطة | +$39.0 ===");
  var r = sendToApp(buildTPHitText(5));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP6() {
  Logger.log("=== تحقق الهدف 6 | +25.0 نقطة | +$50.0 ===");
  var r = sendToApp(buildTPHitText(6));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP7() {
  Logger.log("=== تحقق الهدف 7 | +30.5 نقطة | +$61.0 ===");
  var r = sendToApp(buildTPHitText(7));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP8() {
  Logger.log("=== تحقق الهدف 8 | +36.5 نقطة | +$73.0 ===");
  var r = sendToApp(buildTPHitText(8));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP9() {
  Logger.log("=== تحقق الهدف 9 | +42.5 نقطة | +$85.0 ===");
  var r = sendToApp(buildTPHitText(9));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testTP10() {
  Logger.log("=== تحقق الهدف 10 | +49.5 نقطة | +$99.0 ===");
  var r = sendToApp(buildTPHitText(10));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - إغلاق كامل وضرب وقف                                                         
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function testFullClose() {
  Logger.log("=== إغلاق كامل بالربح | +49.5 نقطة | +$99.0 ===");
  var r = sendToApp(buildFullCloseText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testSLHit() {
  Logger.log("=== ضرب وقف الخسارة | -5.5 نقطة | -$11.0 ===");
  var r = sendToApp(buildSLHitText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - صفقة التعويض ♻️                                                             
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function testReentryEntry() {
  Logger.log("=== ♻️ صفقة تعويض - دخول ===");
  var r = sendToApp(buildReentryEntryText("BUY"));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryTP1() {
  Logger.log("=== ♻️ هدف تعويض 1 | +2.5 نقطة | +$5.0 ===");
  var r = sendToApp(buildReentryTPText(1));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryTP2() {
  Logger.log("=== ♻️ هدف تعويض 2 | +6.0 نقطة | +$12.0 ===");
  var r = sendToApp(buildReentryTPText(2));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryTP3() {
  Logger.log("=== ♻️ هدف تعويض 3 | +10.5 نقطة | +$21.0 ===");
  var r = sendToApp(buildReentryTPText(3));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryTP4() {
  Logger.log("=== ♻️ هدف تعويض 4 | +15.5 نقطة | +$31.0 ===");
  var r = sendToApp(buildReentryTPText(4));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryTP5() {
  Logger.log("=== ♻️ هدف تعويض 5 | +21.5 نقطة | +$43.0 ===");
  var r = sendToApp(buildReentryTPText(5));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentryFullClose() {
  Logger.log("=== ♻️ إغلاق تعويض كامل | +21.5 نقطة | +$43.0 ===");
  var r = sendToApp(buildReentryFullCloseText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testReentrySL() {
  Logger.log("=== ♻️ ضرب وقف التعويض | -11.5 نقطة | -$23.0 ===");
  var r = sendToApp(buildReentrySLText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - صفقة التعزيز 🔥                                                             
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function testPyramidEntry() {
  Logger.log("=== 🔥 تعزيز - دخول ===");
  var r = sendToApp(buildPyramidEntryText("BUY"));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidTP1() {
  Logger.log("=== 🔥 هدف تعزيز 1 | +3.0 نقطة | +$6.0 ===");
  var r = sendToApp(buildPyramidTPText(1));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidTP2() {
  Logger.log("=== 🔥 هدف تعزيز 2 | +7.0 نقطة | +$14.0 ===");
  var r = sendToApp(buildPyramidTPText(2));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidTP3() {
  Logger.log("=== 🔥 هدف تعزيز 3 | +12.0 نقطة | +$24.0 ===");
  var r = sendToApp(buildPyramidTPText(3));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidTP4() {
  Logger.log("=== 🔥 هدف تعزيز 4 | +18.0 نقطة | +$36.0 ===");
  var r = sendToApp(buildPyramidTPText(4));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidTP5() {
  Logger.log("=== 🔥 هدف تعزيز 5 | +25.0 نقطة | +$50.0 ===");
  var r = sendToApp(buildPyramidTPText(5));
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidFullClose() {
  Logger.log("=== 🔥 إغلاق تعزيز كامل | +25.0 نقطة | +$50.0 ===");
  var r = sendToApp(buildPyramidFullCloseText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

function testPyramidSL() {
  Logger.log("=== 🔥 ضرب وقف التعزيز | -5.0 نقطة | -$10.0 ===");
  var r = sendToApp(buildPyramidSLText());
  Logger.log("النتيجة: " + JSON.stringify(r));
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//                                                                                                  
//  🧪 دوال الاختبار - سيناريوهات كاملة                                                             
//                                                                                                  
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

// سيناريو: صفقة كاملة - دخول ثم 10 أهداف بالترتيب
function testFullWin() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: صفقة رابحة كاملة (10 TP)  ║");
  Logger.log("╚════════════════════════════════════╝");
  
  var results = [];
  results.push(testBuySignal());
  for (var i = 1; i <= 10; i++) results.push(testTP["" + i] ? null : sendToApp(buildTPHitText(i)));
  Logger.log("انتهى السيناريو - إجمالي الربح: +$99.0");
  return { success: true, message: "صفقة كاملة - 10 أهداف", totalProfit: 99.0 };
}

// سيناريو: دخول + TP1 + TP3 (تخطى TP2) + TP6 (تخطى TP4 و TP5)
function testMissedTPs() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: أهداف متخطاة             ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testBuySignal();
  testTP1();
  Logger.log("-- تخطى TP2 --");
  testTP3();
  Logger.log("-- تخطى TP4 و TP5 --");
  testTP6();
  Logger.log("انتهى");
  return { success: true };
}

// سيناريو: دخول + ضرب وقف
function testFullLoss() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: صفقة خاسرة               ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testBuySignal();
  testSLHit();
  Logger.log("انتهى - الخسارة: -$11.0");
  return { success: true };
}

// سيناريو: تعويض كامل
function testReentryScenario() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: صفقة تعويض كاملة        ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testReentryEntry();
  testReentryTP1();
  testReentryTP2();
  testReentryTP3();
  testReentryFullClose();
  Logger.log("انتهى - ربح التعويض: +$43.0");
  return { success: true };
}

// سيناريو: تعويض مع ضرب وقف
function testReentryLoss() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: تعويض خاسر              ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testReentryEntry();
  testReentrySL();
  Logger.log("انتهى - خسارة التعويض: -$23.0");
  return { success: true };
}

// سيناريو: تعزيز كامل
function testPyramidScenario() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: تعزيز كامل               ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testPyramidEntry();
  testPyramidTP1();
  testPyramidTP2();
  testPyramidTP3();
  testPyramidFullClose();
  Logger.log("انتهى - ربح التعزيز: +$50.0");
  return { success: true };
}

// سيناريو: تعزيز مع ضرب وقف
function testPyramidLoss() {
  Logger.log("╔════════════════════════════════════╗");
  Logger.log("║  سيناريو: تعزيز خاسر              ║");
  Logger.log("╚════════════════════════════════════╝");
  
  testPyramidEntry();
  testPyramidSL();
  Logger.log("انتهى - خسارة التعزيز: -$10.0");
  return { success: true };
}
