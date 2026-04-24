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
                ForexYemeni Signals &copy; ${new Date().getFullYear()}
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

/**
 * Map signal pair name to instrument category.
 * Used for per-user package filtering in email broadcasts.
 */
function getInstrumentCategory(pair: string): string {
  const p = (pair || '').toUpperCase();
  if (/XAU|GOLD/.test(p)) return 'gold';
  if (/XAG|SILVER/.test(p)) return 'metals';
  if (/USOIL|CRUDE|OIL/.test(p)) return 'oil';
  if (/BTC|ETH|SOL|BNB|XRP|ADA|DOGE/.test(p)) return 'crypto';
  if (/NAS|US30|DAX|US500|SPX|NDX/.test(p)) return 'indices';
  if (/[A-Z]{3,6}(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF)/.test(p)) return 'currencies';
  return 'other';
}

/**
 * Get Arabic instrument name for display in email.
 */
function getInstrumentArabic(pair: string): string {
  const p = (pair || '').toUpperCase();
  if (/XAU|GOLD/.test(p)) return 'الذهب';
  if (/XAG|SILVER/.test(p)) return 'الفضة';
  if (/USOIL|CRUDE|OIL/.test(p)) return 'النفط';
  if (/BTC/.test(p)) return 'بيتكوين';
  if (/ETH/.test(p)) return 'إيثريوم';
  if (/SOL/.test(p)) return 'سولانا';
  if (/BNB/.test(p)) return 'بينانس';
  if (/XRP/.test(p)) return 'ريبل';
  if (/NAS|NDX/.test(p)) return 'ناسداك';
  if (/US30|DOW/.test(p)) return 'داو جونز';
  if (/DAX/.test(p)) return 'داكس';
  if (/US500|SPX/.test(p)) return 'إس آند بي';
  if (/JPY/.test(p)) return 'ين ياباني';
  if (/EUR|USD|GBP|AUD|NZD|CAD|CHF/.test(p)) return 'عملات';
  return 'أدوات';
}

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
  const directionEmoji = isBuy ? '&#9650;' : '&#9660;';
  const instrumentAr = getInstrumentArabic(signal.pair);

  // Calculate SL distance
  const slDistance = signal.entry > 0 && signal.stopLoss > 0
    ? Math.abs(signal.entry - signal.stopLoss).toFixed(signal.entry > 100 ? 2 : signal.entry > 10 ? 3 : 5)
    : '—';

  // Build TP rows with better styling
  const tpRows = signal.takeProfits.map((tp, i) => `
                        <tr>
                          <td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.6);font-weight:600;">الهدف ${i + 1}</td>
                          <td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:15px;color:#FFD700;font-weight:700;font-family:'Courier New',monospace;text-align:center;">${tp.tp}</td>
                          <td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;color:rgba(255,255,255,0.45);text-align:left;">${tp.rr.toFixed(2)} :R</td>
                        </tr>`).join('');

  const confPct = signal.confidence;
  const confColor = confPct >= 75 ? '#00E676' : confPct >= 50 ? '#FFD700' : '#FF5252';
  const confText = confPct >= 75 ? 'ثقة عالية' : confPct >= 50 ? 'ثقة متوسطة' : 'ثقة منخفضة';

  // Current date/time in Arabic
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const subject = `${directionEmoji} ${directionText} ${signal.pair} | ${instrumentAr} | ${signal.timeframe || 'H4'}`;

  // Determine SL display - if no valid SL, show warning
  const hasValidSl = signal.stopLoss > 0;
  const slDisplay = hasValidSl ? String(signal.stopLoss) : 'غير محدد';
  const slColor = hasValidSl ? '#FF5252' : '#FF9800';

  return {
    subject,
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إشارة تداول جديدة - ${escapeHtml(signal.pair)}</title>
</head>
<body style="margin:0;padding:0;background-color:#050a15;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050a15;min-height:100vh;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Header: Logo + Badge -->
          <tr>
            <td style="padding-bottom:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="right" style="vertical-align:middle;">
                    <div style="width:50px;height:50px;border-radius:14px;background:linear-gradient(135deg,#FFD700,#FFA500);display:inline-flex;align-items:center;justify-content:center;">
                      <span style="font-size:20px;font-weight:900;color:#050a15;">FY</span>
                    </div>
                  </td>
                  <td align="left" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:10px;font-weight:700;color:#FFD700;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.15);letter-spacing:1px;">
                      FOREXYEMENI VIP
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Signal Card -->
          <tr>
            <td>
              <div style="background:linear-gradient(180deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.01) 100%);border:1px solid rgba(255,255,255,0.07);border-radius:20px;overflow:hidden;">

                <!-- Pair Header -->
                <div style="background:linear-gradient(135deg,${directionColor}12,${directionColor}05);padding:22px 24px;border-bottom:1px solid rgba(255,255,255,0.05);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <table role="presentation" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="vertical-align:middle;">
                              <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:4px;">${instrumentAr} &bull; ${signal.timeframe || 'H4'}</div>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${escapeHtml(signal.pair)}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td align="left" style="vertical-align:middle;">
                        <div style="width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,${directionColor}20,${directionColor}08);border:1.5px solid ${directionColor}30;text-align:center;line-height:60px;">
                          <span style="font-size:20px;color:${directionColor};font-weight:900;letter-spacing:1px;">${directionText}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Prices Section -->
                <div style="padding:20px 24px 16px;">

                  <!-- Entry Price -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                    <tr>
                      <td style="width:50%;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px 0 0 12px;">
                        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px;font-weight:600;">&#128200; سعر الدخول</div>
                        <div style="font-size:24px;font-weight:700;color:#ffffff;font-family:'Courier New',monospace;letter-spacing:0.5px;">${signal.entry}</div>
                      </td>

                      <!-- Stop Loss -->
                      <td style="width:50%;padding:10px 14px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.12);border-radius:0 12px 12px 0;">
                        <div style="font-size:11px;color:rgba(255,82,82,0.6);margin-bottom:6px;font-weight:600;">&#128308; وقف الخسارة</div>
                        <div style="font-size:24px;font-weight:700;color:${slColor};font-family:'Courier New',monospace;letter-spacing:0.5px;">${slDisplay}</div>
                      </td>
                    </tr>
                  </table>

                  ${hasValidSl ? `
                  <!-- SL Distance Info -->
                  <div style="margin-top:8px;margin-bottom:16px;padding:8px 14px;background:rgba(255,82,82,0.04);border-radius:8px;border:1px solid rgba(255,82,82,0.06);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:11px;color:rgba(255,255,255,0.3);">مسافة الوقف</td>
                        <td style="font-size:11px;color:rgba(255,255,255,0.5);font-weight:600;font-family:'Courier New',monospace;text-align:center;">${slDistance}</td>
                        <td style="font-size:11px;color:rgba(255,255,255,0.3);text-align:right;">${confText}</td>
                        <td style="font-size:12px;color:${confColor};font-weight:700;text-align:left;">${confPct}%</td>
                      </tr>
                    </table>
                  </div>` : `
                  <div style="margin-top:8px;margin-bottom:16px;"></div>`}

                  <!-- Take Profits Table -->
                  ${signal.takeProfits.length > 0 ? `
                  <div style="border:1px solid rgba(255,215,0,0.1);border-radius:14px;overflow:hidden;">
                    <!-- TP Header -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr style="background:linear-gradient(90deg,rgba(255,215,0,0.08),rgba(255,215,0,0.03));">
                        <th style="padding:10px 16px;font-size:10px;font-weight:700;color:rgba(255,215,0,0.5);text-align:right;border-bottom:1px solid rgba(255,215,0,0.08);letter-spacing:1px;">&#127919; الهدف</th>
                        <th style="padding:10px 16px;font-size:10px;font-weight:700;color:rgba(255,215,0,0.5);text-align:center;border-bottom:1px solid rgba(255,215,0,0.08);letter-spacing:1px;">&#128176; السعر</th>
                        <th style="padding:10px 16px;font-size:10px;font-weight:700;color:rgba(255,215,0,0.5);text-align:left;border-bottom:1px solid rgba(255,215,0,0.08);letter-spacing:1px;">نسبة الربح</th>
                      </tr>
                      ${tpRows}
                    </table>
                  </div>` : ''}
                </div>

                <!-- Footer inside card -->
                <div style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.04);background:rgba(255,255,255,0.01);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:10px;color:rgba(255,255,255,0.2);">
                        ${dateStr} &bull; ${timeStr}
                      </td>
                      <td style="font-size:10px;color:rgba(255,255,255,0.2);text-align:left;">
                        ForexYemeni VIP
                      </td>
                    </tr>
                  </table>
                </div>
              </div>
            </td>
          </tr>

          <!-- Risk Disclaimer -->
          <tr>
            <td align="center" style="padding-top:20px;">
              <div style="max-width:420px;padding:12px 18px;background:rgba(255,152,0,0.04);border:1px solid rgba(255,152,0,0.08);border-radius:10px;">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.25);line-height:1.8;text-align:center;">
                  &#9888;&#65039; تنبيه: التداول ينطوي على مخاطر عالية وقد لا يكون مناسباً لجميع المستثمرين. يرجى إدارة المخاطر بحكمة وعدم المخاطرة بأكثر مما يمكنك تحمل خسارته.
                </p>
              </div>
            </td>
          </tr>

          <!-- Bottom Footer -->
          <tr>
            <td align="center" style="padding-top:16px;">
              <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.12);">
                ForexYemeni Signals &copy; ${new Date().getFullYear()}
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
  signalId?: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const { getUsers, getPackageById, getSignals } = await import('@/lib/store');
  const users = await getUsers();

  // Filter to active non-admin users with emails
  const activeSubscribers = users.filter(u =>
    u.status === 'active' &&
    u.role !== 'admin' &&
    u.email
  );

  if (activeSubscribers.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // Determine the instrument category of this signal
  const signalInstrument = getInstrumentCategory(signal.pair);

  // ── Pre-fetch today's entry signals for maxSignals filtering ──
  // This signal is already in the store, so it will be included in the count.
  // We use the same logic as GET /api/signals to ensure email matches the app.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();
  let todayAllSignals: { id: string; pair: string; signalCategory: string; createdAt: string }[] = [];
  try {
    const allSignals = await getSignals(9999);
    todayAllSignals = allSignals
      .filter(s => {
        const cat = String(s.signalCategory || '');
        return (cat === 'ENTRY' || cat === 'REENTRY' || cat === 'PYRAMID') && s.createdAt >= todayISO;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    // If signal fetch fails, skip maxSignals filtering (fail-open)
  }

  // Build per-user email list, filtering by instrument + maxSignals
  const emailRecipients: string[] = [];
  let skippedInstrument = 0;
  let skippedMaxSignals = 0;

  for (const user of activeSubscribers) {
    if (!user.packageId) {
      // No package → no filtering, send email
      emailRecipients.push(user.email);
      continue;
    }

    try {
      const pkg = await getPackageById(user.packageId);
      if (!pkg) {
        emailRecipients.push(user.email);
        continue;
      }

      // 1. Filter by instruments
      if (pkg.instruments && pkg.instruments.length > 0) {
        const allowedInstruments = new Set(pkg.instruments);
        if (!allowedInstruments.has(signalInstrument)) {
          skippedInstrument++;
          continue;
        }
      }

      // 2. Filter by maxSignals
      // Replicate the exact same logic as GET /api/signals:
      // - Start from todayAllSignals (all entry signals today, sorted oldest-first)
      // - Filter by user's allowed instruments
      // - If count > maxSignals, only first N are allowed
      // - Check if this signal is within the allowed set
      if (pkg.maxSignals > 0 && todayAllSignals.length > 0) {
        // Filter today's entries by this user's allowed instruments
        const userTodayEntries = pkg.instruments && pkg.instruments.length > 0
          ? todayAllSignals.filter(s => {
              const cat = getInstrumentCategory(s.pair);
              return pkg.instruments.includes(cat);
            })
          : todayAllSignals;

        if (userTodayEntries.length > pkg.maxSignals) {
          // Only the first maxSignals entries are allowed
          const allowedIds = new Set(
            userTodayEntries.slice(0, pkg.maxSignals).map(s => s.id)
          );
          // Check if this signal is in the allowed set
          if (signal.signalId && !allowedIds.has(signal.signalId)) {
            skippedMaxSignals++;
            continue;
          }
        }
      }

      emailRecipients.push(user.email);
    } catch {
      // If package lookup fails, still send the email (fail-open)
      emailRecipients.push(user.email);
    }
  }

  if (emailRecipients.length === 0) {
    console.log(`Broadcast signal ${signal.pair}: 0 recipients (${skippedInstrument} by instruments, ${skippedMaxSignals} by maxSignals)`);
    return { sent: 0, failed: 0, skipped: skippedInstrument + skippedMaxSignals };
  }

  const { subject, html } = buildSignalEmail(signal);
  const batchEmails = emailRecipients.map(email => ({ to: email, subject, html }));

  let totalSent = 0;
  let totalFailed = 0;
  const batchSize = 50;

  for (let i = 0; i < batchEmails.length; i += batchSize) {
    const batch = batchEmails.slice(i, i + batchSize);
    const result = await sendBatchViaGAS(batch);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  console.log(`Broadcast signal ${signal.pair} (${signalInstrument}): ${totalSent} sent, ${totalFailed} failed, ${skippedInstrument} by instruments, ${skippedMaxSignals} by maxSignals out of ${activeSubscribers.length} subscribers`);
  return { sent: totalSent, failed: totalFailed, skipped: skippedInstrument + skippedMaxSignals };
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
ForexYemeni Signals &copy; ${new Date().getFullYear()} &mdash; Security System
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
