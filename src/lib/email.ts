/**
 * Email Service — Google Apps Script integration
 *
 * Uses Google Apps Script + GmailApp for FREE email delivery.
 * Setup: Deploy google-apps-script/Email-Sender.js as Web App
 * Set GOOGLE_APPS_SCRIPT_EMAIL_URL in Vercel env
 */

/** Escape HTML special characters to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const EMAIL_URL = process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL || '';
const EMAIL_KEY = process.env.GOOGLE_APPS_SCRIPT_EMAIL_KEY || '';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a single email via Google Apps Script.
 * Handles GAS redirect responses and parsing issues.
 */
async function sendViaGAS(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  if (!EMAIL_URL) {
    return { ok: false, error: 'GOOGLE_APPS_SCRIPT_EMAIL_URL is not configured' };
  }

  try {
    const body: Record<string, string> = {
      action: 'send',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    };
    if (EMAIL_KEY) body.key = EMAIL_KEY;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Read response as text first (GAS may return HTML redirect page)
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[GAS Email] HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    // Try to parse as JSON — GAS may return HTML redirect page instead
    try {
      const data = JSON.parse(responseText);
      if (data.success) {
        console.log(`[GAS Email] Sent to ${payload.to}`);
        return { ok: true };
      }
      console.error(`[GAS Email] API error: ${JSON.stringify(data)}`);
      return { ok: false, error: data.error || 'GAS returned failure' };
    } catch {
      // Response is not JSON — likely a redirect HTML page
      console.error(`[GAS Email] Non-JSON response: ${responseText.substring(0, 200)}`);
      return { ok: false, error: 'Invalid response from Google Apps Script' };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.error(`[GAS Email] Timeout sending to ${payload.to}`);
      return { ok: false, error: 'timeout' };
    }
    console.error(`[GAS Email] Error: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Send batch emails via Google Apps Script
 */
async function sendBatchViaGAS(emails: EmailPayload[]): Promise<{ sent: number; failed: number }> {
  if (!EMAIL_URL) {
    return { sent: 0, failed: emails.length };
  }

  try {
    const body: Record<string, unknown> = {
      action: 'batch',
      emails: emails.map(e => ({ to: e.to, subject: e.subject, html: e.html })),
    };
    if (EMAIL_KEY) (body as Record<string, string>).key = EMAIL_KEY;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseText = await response.text();

    try {
      const data = JSON.parse(responseText);
      return {
        sent: data.batch?.sent || 0,
        failed: data.batch?.failed || emails.length,
      };
    } catch {
      return { sent: 0, failed: emails.length };
    }
  } catch {
    return { sent: 0, failed: emails.length };
  }
}

// ═══════════════════════════════════════════════════════════════
//  OTP EMAIL
// ═══════════════════════════════════════════════════════════════

export function buildOtpEmail(otp: string, type: 'register' | 'login' | 'reset', name?: string): {
  subject: string;
  html: string;
} {
  const titleMap = { register: 'تأكيد إنشاء الحساب', login: 'تسجيل الدخول', reset: 'إعادة تعيين كلمة المرور' };
  const subtitleMap = {
    register: 'شكراً لك على التسجيل في ForexYemeni VIP. أدخل الكود التالي لإكمال إنشاء حسابك.',
    login: `مرحباً ${escapeHtml(name || '')}، أدخل الكود التالي لتسجيل الدخول إلى حسابك.`,
    reset: `مرحباً ${escapeHtml(name || '')}، أدخل الكود التالي لإعادة تعيين كلمة مرور حسابك.`,
  };
  const title = titleMap[type];
  const subtitle = subtitleMap[type];

  return {
    subject: `ForexYemeni — كود التحقق: ${otp}`,
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#070b14;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#FFD700,#FFA500);display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;font-weight:900;color:#070b14;">FY</span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8;text-align:center;">${subtitle}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,215,0,0.2);border-radius:16px;padding:28px 24px;text-align:center;">
                <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;">كود التحقق</p>
                <p style="margin:0;font-size:40px;font-weight:900;color:#FFD700;letter-spacing:12px;font-family:'Courier New',monospace;">${otp}</p>
                <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.35);">صالح لمدة 5 دقائق</p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
                إذا لم تكن أنشأت هذا الطلب، يمكنك تجاهل هذا البريد بأمان.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
                ForexYemeni VIP Trading Signals &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export async function sendOtpEmail(to: string, otp: string, type: 'register' | 'login' | 'reset', name?: string): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = buildOtpEmail(otp, type, name);
  return await sendViaGAS({ to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL NOTIFICATION EMAIL
// ═══════════════════════════════════════════════════════════════

export function buildSignalEmail(signal: {
  pair: string;
  type: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfits: { tp: number; rr: number }[];
  confidence: number;
  timeframe: string;
  instrument?: string;
}): {
  subject: string;
  html: string;
} {
  const isBuy = signal.type === 'BUY';
  const directionColor = isBuy ? '#00E676' : '#FF5252';
  const directionText = isBuy ? 'شراء' : 'بيع';

  const tpRows = signal.takeProfits.map((tp, i) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.5);">TP${i + 1}</td>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:14px;color:#FFD700;font-weight:600;font-family:'Courier New',monospace;">${tp.tp}</td>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.4);">${tp.rr.toFixed(2)} R:R</td>
    </tr>`).join('');

  const confPct = signal.confidence;
  const confColor = confPct >= 75 ? '#00E676' : confPct >= 50 ? '#FFD700' : '#FF5252';

  const subject = `${isBuy ? '▲' : '▼'} ${directionText} ${signal.pair} @ ${signal.entry}`;

  return {
    subject,
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إشارة تداول جديدة</title>
</head>
<body style="margin:0;padding:0;background-color:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#070b14;min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding-bottom:28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="right">
                    <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#FFD700,#FFA500);display:inline-flex;align-items:center;justify-content:center;">
                      <span style="font-size:20px;font-weight:900;color:#070b14;">FY</span>
                    </div>
                  </td>
                  <td align="left">
                    <span style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;color:#FFD700;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.2);letter-spacing:1px;">
                      إشارة جديدة
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,${directionColor}15,${directionColor}08);padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.04);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:6px;">${signal.timeframe || 'H4'}</div>
                        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${signal.pair}</div>
                      </td>
                      <td align="left" style="vertical-align:middle;">
                        <div style="width:56px;height:56px;border-radius:16px;background:${directionColor}18;border:1px solid ${directionColor}35;text-align:center;line-height:56px;">
                          <span style="font-size:22px;color:${directionColor};font-weight:900;">${directionText}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="padding:24px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:12px;color:rgba(255,255,255,0.35);display:block;margin-bottom:4px;">Entry</span>
                        <span style="font-size:22px;font-weight:700;color:#ffffff;font-family:'Courier New',monospace;">${signal.entry}</span>
                      </td>
                      <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;">
                        <span style="font-size:12px;color:rgba(255,255,255,0.35);display:block;margin-bottom:4px;">SL</span>
                        <span style="font-size:22px;font-weight:700;color:#FF5252;font-family:'Courier New',monospace;">${signal.stopLoss}</span>
                      </td>
                      <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-align:right;">
                        <span style="font-size:12px;color:rgba(255,255,255,0.35);display:block;margin-bottom:4px;">Confidence</span>
                        <div style="text-align:right;">
                          <span style="font-size:18px;font-weight:700;color:${confColor};">${confPct}%</span>
                          <div style="width:48px;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:4px;">
                            <div style="width:${confPct}%;height:100%;border-radius:3px;background:${confColor};"></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </table>
                  ${signal.takeProfits.length > 0 ? `
                  <div style="margin-top:20px;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr style="background:rgba(255,215,0,0.05);">
                        <th style="padding:10px 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-align:right;border-bottom:1px solid rgba(255,215,0,0.1);">الهدف</th>
                        <th style="padding:10px 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-align:center;border-bottom:1px solid rgba(255,215,0,0.1);">السعر</th>
                        <th style="padding:10px 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-align:left;border-bottom:1px solid rgba(255,215,0,0.1);">R:R</th>
                      </tr>
                      ${tpRows}
                    </table>
                  </div>` : ''}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);line-height:1.6;text-align:center;max-width:400px;">
                تنبيه: التداول ينطوي على مخاطر عالية. هذه الإشارة لأغراض تعليمية فقط وليست نصيحة مالية.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.15);">
                ForexYemeni VIP Trading Signals &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export async function sendSignalEmail(to: string, signal: {
  pair: string;
  type: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfits: { tp: number; rr: number }[];
  confidence: number;
  timeframe: string;
  instrument?: string;
}): Promise<boolean> {
  const { subject, html } = buildSignalEmail(signal);
  const result = await sendViaGAS({ to, subject, html });
  return result.ok;
}

export async function broadcastSignalToSubscribers(signal: {
  pair: string;
  type: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfits: { tp: number; rr: number }[];
  confidence: number;
  timeframe: string;
  instrument?: string;
}): Promise<{ sent: number; failed: number }> {
  const { getUsers } = await import('@/lib/store');
  const users = await getUsers();

  const subscribers = users.filter(u =>
    u.status === 'active' &&
    u.role !== 'admin' &&
    u.email
  );

  if (subscribers.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const { subject, html } = buildSignalEmail(signal);
  const batchEmails = subscribers.map(u => ({ to: u.email, subject, html }));

  let totalSent = 0;
  let totalFailed = 0;
  const batchSize = 50;

  for (let i = 0; i < batchEmails.length; i += batchSize) {
    const batch = batchEmails.slice(i, i + batchSize);
    const result = await sendBatchViaGAS(batch);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  console.log(`Broadcast signal: ${totalSent} sent, ${totalFailed} failed to ${subscribers.length} subscribers`);
  return { sent: totalSent, failed: totalFailed };
}

// ═══════════════════════════════════════════════════════════════
//  DUPLICATE ACCOUNT ALERT EMAIL
// ═══════════════════════════════════════════════════════════════

export function buildDuplicateAccountEmail(data: {
  detectedAt: 'register' | 'login';
  user1: { name: string; email: string; createdAt: string; status: string; subscriptionType?: string; subscriptionExpiry?: string | null; packageName?: string | null };
  user2: { name: string; email: string; createdAt: string; status: string; subscriptionType?: string; subscriptionExpiry?: string | null; packageName?: string | null };
  deviceId: string;
}): {
  subject: string;
  html: string;
} {
  const { user1, user2, deviceId, detectedAt } = data;
  const actionText = detectedAt === 'register' ? 'محاولة تسجيل حساب جديد' : 'محاولة تسجيل دخول';
  const detectionType = detectedAt === 'register' ? 'تسجيل حساب جديد' : 'تسجيل دخول';
  const timestamp = new Date().toISOString();
  const timeFormatted = new Date(timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function formatSubscription(u: typeof user1): string {
    if (u.subscriptionType === 'subscriber' && u.packageName) {
      const expiry = u.subscriptionExpiry ? new Date(u.subscriptionExpiry).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'غير محدد';
      return u.packageName + ' &mdash; تنتهي: ' + expiry;
    }
    return 'لا يوجد اشتراك';
  }

  const user1Created = new Date(user1.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const user2Created = new Date(user2.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    subject: '[ForexYemeni] تنبيه: كشف حسابين من نفس الجهاز - تم الحظر',
    html: `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>تنبيه أمني</title></head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;min-height:100vh;"><tr><td align="center" style="padding:32px 12px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

<!-- Top border accent -->
<tr><td style="height:4px;background:linear-gradient(90deg,#dc2626,#ef4444,#dc2626);border-radius:8px 8px 0 0;"></td></tr>

<!-- Dark card wrapper -->
<tr><td style="background:#111827;border:1px solid #1f2937;border-top:none;border-radius:0 0 16px 16px;overflow:hidden;">

<!-- Branding header -->
<tr><td style="padding:28px 28px 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);display:inline-block;text-align:center;line-height:44px;">
<span style="font-size:16px;font-weight:900;color:#111827;">FY</span>
</div>
</td>
<td style="text-align:left;vertical-align:middle;">
<span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:10px;font-weight:700;color:#dc2626;background:#dc262618;border:1px solid #dc262640;letter-spacing:0.5px;">SECURITY ALERT</span>
</td>
</tr></table>
</td></tr>

<!-- Alert icon -->
<tr><td align="center" style="padding:20px 0 12px;">
<div style="width:64px;height:64px;border-radius:50%;background:#dc262612;border:2px solid #dc262630;display:inline-block;text-align:center;line-height:60px;">
<span style="font-size:28px;color:#dc2626;font-weight:900;">!</span>
</div>
</td></tr>

<!-- Title -->
<tr><td align="center" style="padding:0 0 6px;">
<h1 style="margin:0;font-size:20px;font-weight:800;color:#f87171;letter-spacing:0.3px;">كشف حسابات مكررة</h1>
</td></tr>

<!-- Subtitle -->
<tr><td align="center" style="padding:0 28px 24px;">
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:2;text-align:center;">
تم اكتشاف <strong style="color:#e5e7eb;">${actionText}</strong> من جهاز مسجل مسبقاً بحساب آخر.<br>
تم حظر الحسابين تلقائياً لحماية النظام.
</p>
</td></tr>

<!-- Detection info strip -->
<tr><td style="padding:0 28px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:10px;border:1px solid #374151;">
<tr>
<td style="padding:10px 14px;font-size:10px;color:#6b7280;border-bottom:1px solid #374151;">نوع الكشف</td>
<td style="padding:10px 14px;font-size:10px;color:#d1d5db;text-align:left;font-weight:600;">${detectionType}</td>
</tr>
<tr>
<td style="padding:10px 14px;font-size:10px;color:#6b7280;border-bottom:1px solid #374151;">وقت الكشف</td>
<td style="padding:10px 14px;font-size:10px;color:#d1d5db;text-align:left;direction:ltr;" dir="ltr">${timeFormatted}</td>
</tr>
<tr>
<td style="padding:10px 14px;font-size:10px;color:#6b7280;">معرف الجهاز</td>
<td style="padding:10px 14px;font-size:9px;color:#9ca3af;text-align:left;font-family:'Courier New',monospace;direction:ltr;word-break:break-all;" dir="ltr">${escapeHtml(deviceId)}</td>
</tr>
</table>
</td></tr>

<!-- Account 1 -->
<tr><td style="padding:0 28px 10px;">
<div style="background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden;">
<div style="padding:12px 16px;background:#dc26260a;border-bottom:1px solid #374151;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><p style="margin:0;font-size:11px;font-weight:700;color:#fca5a5;">الحساب الاول - الحساب القديم</p></td>
<td style="text-align:left;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;color:#dc2626;background:#dc262615;border:1px solid #dc262630;">BLOCKED</span></td>
</tr></table>
</div>
<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 16px;">
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">الاسم</td><td style="padding:8px 16px;font-size:12px;color:#f3f4f6;font-weight:600;text-align:left;" dir="ltr">${escapeHtml(user1.name)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">البريد</td><td style="padding:8px 16px;font-size:11px;color:#fbbf24;font-weight:600;text-align:left;font-family:monospace;direction:ltr;" dir="ltr">${escapeHtml(user1.email)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">الاشتراك</td><td style="padding:8px 16px;font-size:11px;color:#d1d5db;text-align:left;">${formatSubscription(user1)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">تاريخ التسجيل</td><td style="padding:8px 16px;font-size:10px;color:#9ca3af;text-align:left;direction:ltr;" dir="ltr">${user1Created}</td></tr>
</table>
</div>
</td></tr>

<!-- Account 2 -->
<tr><td style="padding:0 28px 20px;">
<div style="background:#111827;border:1px solid #374151;border-radius:12px;overflow:hidden;">
<div style="padding:12px 16px;background:#dc26260a;border-bottom:1px solid #374151;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><p style="margin:0;font-size:11px;font-weight:700;color:#fca5a5;">الحساب الثاني - ${detectedAt === 'register' ? 'محاولة التسجيل' : 'محاولة تسجيل الدخول'}</p></td>
<td style="text-align:left;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;color:#dc2626;background:#dc262615;border:1px solid #dc262630;">BLOCKED</span></td>
</tr></table>
</div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">الاسم</td><td style="padding:8px 16px;font-size:12px;color:#f3f4f6;font-weight:600;text-align:left;" dir="ltr">${escapeHtml(user2.name)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">البريد</td><td style="padding:8px 16px;font-size:11px;color:#fbbf24;font-weight:600;text-align:left;font-family:monospace;direction:ltr;" dir="ltr">${escapeHtml(user2.email)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">الاشتراك</td><td style="padding:8px 16px;font-size:11px;color:#d1d5db;text-align:left;">${formatSubscription(user2)}</td></tr>
<tr><td style="padding:8px 16px;font-size:10px;color:#6b7280;">تاريخ التسجيل</td><td style="padding:8px 16px;font-size:10px;color:#9ca3af;text-align:left;direction:ltr;" dir="ltr">${user2Created}</td></tr>
</table>
</div>
</td></tr>

<!-- Admin note -->
<tr><td style="padding:0 28px 28px;">
<div style="background:#fbbf240a;border:1px solid #fbbf2430;border-radius:10px;padding:14px 16px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:top;padding-left:12px;width:20px;">
<div style="width:18px;height:18px;border-radius:50%;background:#fbbf2430;display:inline-block;text-align:center;line-height:18px;"><span style="font-size:10px;font-weight:900;color:#fbbf24;">i</span></div>
</td>
<td>
<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.9;">
<strong style="color:#fbbf24;">للإدارة:</strong> تم حظر الحسابين تلقائياً مع الحفاظ على بيانات الاشتراك. يمكنك فك الحظر يدوياً من لوحة تحكم الإدارة إذا لزم الأمر.
</p>
</td>
</tr></table>
</div>
</td></tr>

</td></tr><!-- end card -->

<!-- Footer -->
<tr><td align="center" style="padding:24px 12px 0;">
<p style="margin:0;font-size:10px;color:#374151;">
ForexYemeni VIP Trading Signals &copy; ${new Date().getFullYear()} &mdash; Security System
</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`,
  };
}

export async function sendDuplicateAccountAlert(adminEmail: string, data: {
  detectedAt: 'register' | 'login';
  user1: { name: string; email: string; createdAt: string; status: string; subscriptionType?: string; subscriptionExpiry?: string | null; packageName?: string | null };
  user2: { name: string; email: string; createdAt: string; status: string; subscriptionType?: string; subscriptionExpiry?: string | null; packageName?: string | null };
  deviceId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = buildDuplicateAccountEmail(data);
  return await sendViaGAS({ to: adminEmail, subject, html });
}
