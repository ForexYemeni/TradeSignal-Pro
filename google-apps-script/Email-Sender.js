// ═══════════════════════════════════════════════════════════════
//  ForexYemeni VIP — Email Sender via Google Apps Script
//  إرسال الإيميلات عبر Gmail (مجاني، بدون API keys مدفوعة)
//
//  📋 خطوات النشر:
//  1. انسخ هذا الكود إلى Google Apps Script الجديد
//  2. Deploy → New deployment → Web app
//  3. Execute as: Me | Who has access: Anyone
//  4. انسخ رابط Web app URL وضعه في Vercel env:
//     GOOGLE_APPS_SCRIPT_EMAIL_URL=https://script.google.com/macros/s/XXXXX/exec
// ═══════════════════════════════════════════════════════════════

var FROM_NAME = 'ForexYemeni VIP';

// ── Security: API Key for authentication ──
// ضع نفس القيمة في Vercel env: GOOGLE_APPS_SCRIPT_EMAIL_KEY
// إذا فارغ = بدون حماية (للتطوير فقط)
var API_KEY = '';

/**
 * doPost — Endpoint الرئيسي لإرسال الإيميلات
 *
 * Body JSON:
 *   { action: "send", to: "email", subject: "...", html: "...", key: "..." }
 *   { action: "batch", emails: [{to, subject, html}], key: "..." }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Authentication check
    if (API_KEY && body.key !== API_KEY) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    if (body.action === 'send') {
      return handleSendSingle(body);
    }

    if (body.action === 'batch') {
      return handleSendBatch(body);
    }

    return jsonResponse({ success: false, error: 'Invalid action. Use "send" or "batch"' }, 400);

  } catch (error) {
    logError('doPost', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

/**
 * doGet — Health check + stats
 */
function doGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : '';
  if (action === 'stats') return jsonResponse(getEmailStats());
  if (action === 'logs') return jsonResponse(getErrorLogs());
  if (action === 'test') return handleTestEmail(e.parameter.to);
  return jsonResponse({
    success: true,
    status: 'running',
    service: 'ForexYemeni Email Sender',
    version: '1.0',
    quota: getGmailQuota()
  });
}

// ═══════════════════════════════════════════════════════════════
//  إرسال إيميل واحد
// ═══════════════════════════════════════════════════════════════

function handleSendSingle(body) {
  var to = body.to;
  var subject = body.subject;
  var html = body.html;

  if (!to || !subject || !html) {
    return jsonResponse({ success: false, error: 'Missing required fields: to, subject, html' }, 400);
  }

  try {
    var result = GmailApp.sendEmail(to, subject, '', {
      htmlBody: html,
      name: FROM_NAME,
      replyTo: Session.getActiveUser().getEmail()
    });

    incrementSentCount();
    logSuccess(to, subject);

    return jsonResponse({ success: true, messageId: result.getId(), to: to });
  } catch (error) {
    logError('handleSendSingle', error);
    incrementFailedCount();
    return jsonResponse({ success: false, error: error.message, to: to }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════
//  إرسال مجموعة إيميلات (لإشارات التداول)
// ═══════════════════════════════════════════════════════════════

function handleSendBatch(body) {
  var emails = body.emails;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return jsonResponse({ success: false, error: 'emails array is required' }, 400);
  }

  var results = [];
  var sent = 0;
  var failed = 0;

  // Gmail quota: 500 emails/day for regular accounts, 2000 for Workspace
  // Process in small batches with delays to avoid rate limiting
  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];

    if (!email.to || !email.subject || !email.html) {
      results.push({ success: false, error: 'Missing fields', to: email.to });
      failed++;
      continue;
    }

    try {
      var result = GmailApp.sendEmail(email.to, email.subject, '', {
        htmlBody: email.html,
        name: FROM_NAME,
        replyTo: Session.getActiveUser().getEmail()
      });

      results.push({ success: true, to: email.to, messageId: result.getId() });
      sent++;
      logSuccess(email.to, email.subject);
    } catch (error) {
      results.push({ success: false, error: error.message, to: email.to });
      failed++;
      logError('batch-send-' + i, error);
    }

    // Small delay between emails to avoid Gmail rate limits
    if (i < emails.length - 1) {
      Utilities.sleep(100); // 100ms between emails
    }
  }

  // Batch stats
  incrementSentCount(sent);
  incrementFailedCount(failed);

  return jsonResponse({
    success: true,
    batch: {
      total: emails.length,
      sent: sent,
      failed: failed
    },
    results: results
  });
}

// ═══════════════════════════════════════════════════════════════
//  اختبار الإيميل
// ═══════════════════════════════════════════════════════════════

function handleTestEmail(toEmail) {
  if (!toEmail) {
    return jsonResponse({ success: false, error: 'Add ?to=email@example.com to the URL' }, 400);
  }

  try {
    var testHtml = buildTestEmailHtml();
    GmailApp.sendEmail(toEmail, 'ForexYemeni VIP — Test Email', '', {
      htmlBody: testHtml,
      name: FROM_NAME
    });

    return jsonResponse({ success: true, message: 'Test email sent to ' + toEmail });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function buildTestEmailHtml() {
  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;min-height:100vh;">' +
    '<tr><td align="center" style="padding:40px 16px;">' +
    '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">' +
    '<tr><td align="center" style="padding-bottom:32px;">' +
    '<div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#FFD700,#FFA500);display:inline-flex;align-items:center;justify-content:center;">' +
    '<span style="font-size:28px;font-weight:900;color:#070b14;">FY</span></div></td></tr>' +
    '<tr><td align="center" style="padding-bottom:24px;">' +
    '<h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">تم الاتصال بنجاح</h1>' +
    '<p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">خدمة الإيميلات تعمل بشكل طبيعي</p></td></tr>' +
    '<tr><td align="center" style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">' +
    '<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">ForexYemeni VIP &copy; ' + new Date().getFullYear() + '</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

// ═══════════════════════════════════════════════════════════════
//  إحصائيات وLogging
// ═══════════════════════════════════════════════════════════════

function getGmailQuota() {
  // Regular Gmail: 500/day, Google Workspace: 2,000/day
  return {
    dailyLimit: 500,
    description: 'Gmail daily sending limit'
  };
}

function getEmailStats() {
  var props = PropertiesService.getScriptProperties();
  return {
    success: true,
    sentToday: parseInt(props.getProperty('email_sent_today') || '0'),
    failedToday: parseInt(props.getProperty('email_failed_today') || '0'),
    quota: getGmailQuota(),
    lastSent: props.getProperty('email_last_sent') || 'never'
  };
}

function incrementSentCount(count) {
  var n = count || 1;
  var props = PropertiesService.getScriptProperties();
  var current = parseInt(props.getProperty('email_sent_today') || '0');
  props.setProperty('email_sent_today', String(current + n));
  props.setProperty('email_last_sent', new Date().toISOString());
}

function incrementFailedCount(count) {
  var n = count || 1;
  var props = PropertiesService.getScriptProperties();
  var current = parseInt(props.getProperty('email_failed_today') || '0');
  props.setProperty('email_failed_today', String(current + n));
}

function logSuccess(to, subject) {
  try {
    var props = PropertiesService.getScriptProperties();
    var logs = JSON.parse(props.getProperty('email_logs') || '[]');
    logs.unshift({
      time: new Date().toISOString(),
      status: 'sent',
      to: to,
      subject: subject.substring(0, 80)
    });
    if (logs.length > 30) logs = logs.slice(0, 30);
    props.setProperty('email_logs', JSON.stringify(logs));
  } catch (e) {}
}

function logError(source, error) {
  try {
    var props = PropertiesService.getScriptProperties();
    var logs = JSON.parse(props.getProperty('email_error_logs') || '[]');
    logs.unshift({
      time: new Date().toISOString(),
      source: source,
      error: error.message || String(error)
    });
    if (logs.length > 20) logs = logs.slice(0, 20);
    props.setProperty('email_error_logs', JSON.stringify(logs));
  } catch (e) {}
}

function getErrorLogs() {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      success: true,
      logs: JSON.parse(props.getProperty('email_error_logs') || '[]'),
      sentLogs: JSON.parse(props.getProperty('email_logs') || '[]')
    };
  } catch (e) {
    return { success: false };
  }
}

// ═══════════════════════════════════════════════════════════════
//  Reset counts (يمكن تشغيلها يدوياً كل يوم)
// ═══════════════════════════════════════════════════════════════

function resetDailyCounts() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('email_sent_today', '0');
  props.setProperty('email_failed_today', '0');
  return { success: true, message: 'Daily counts reset' };
}

// Create daily trigger to auto-reset
function setupDailyReset() {
  ScriptApp.newTrigger('resetDailyCounts')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
  return { success: true, message: 'Daily reset trigger created at midnight' };
}

// ═══════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════

function jsonResponse(data, statusCode) {
  var code = statusCode || 200;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
