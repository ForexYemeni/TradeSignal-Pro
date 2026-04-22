/**
 * Email Service — Resend integration
 *
 * Handles all email operations:
 * - OTP verification codes (registration + login)
 * - Signal notifications to subscribers
 *
 * Uses Resend (https://resend.com) for reliable email delivery.
 * Free tier: 3,000 emails/month, 100 emails/day.
 */

import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '');
  }
  return _resend;
}

const FROM_NAME = 'ForexYemeni VIP';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@forexyemeni.com';

// ═══════════════════════════════════════════════════════════════
//  OTP EMAIL
// ═══════════════════════════════════════════════════════════════

export function buildOtpEmail(otp: string, type: 'register' | 'login', name?: string): {
  subject: string;
  html: string;
} {
  const title = type === 'register' ? 'تأكيد إنشاء الحساب' : 'تسجيل الدخول';
  const subtitle = type === 'register'
    ? 'شكراً لك على التسجيل في ForexYemeni VIP. أدخل الكود التالي لإكمال إنشاء حسابك.'
    : `مرحباً ${name || ''}، أدخل الكود التالي لتسجيل الدخول إلى حسابك.`;

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
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#FFD700,#FFA500);display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;font-weight:900;color:#070b14;">FY</span>
              </div>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${title}</h1>
            </td>
          </tr>
          <!-- Subtitle -->
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8;text-align:center;">${subtitle}</p>
            </td>
          </tr>
          <!-- OTP Box -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,215,0,0.2);border-radius:16px;padding:28px 24px;text-align:center;">
                <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:2px;">كود التحقق</p>
                <p style="margin:0;font-size:40px;font-weight:900;color:#FFD700;letter-spacing:12px;font-family:'Courier New',monospace;">${otp}</p>
                <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.35;">صالح لمدة 5 دقائق</p>
              </div>
            </td>
          </tr>
          <!-- Warning -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
                إذا لم تكن أنشأت هذا الطلب، يمكنك تجاهل هذا البريد بأمان.
              </p>
            </td>
          </tr>
          <!-- Footer -->
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

export async function sendOtpEmail(to: string, otp: string, type: 'register' | 'login', name?: string): Promise<boolean> {
  try {
    const { subject, html } = buildOtpEmail(otp, type, name);
    const { data, error } = await getResend().emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    console.log(`OTP email sent to ${to} (id: ${data?.id})`);
    return true;
  } catch (error) {
    console.error('sendOtpEmail error:', error);
    return false;
  }
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
  const directionIcon = isBuy ? '&#9650;' : '&#9660;';

  // Build TP rows
  const tpRows = signal.takeProfits.map((tp, i) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.5);">TP${i + 1}</td>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:14px;color:#FFD700;font-weight:600;font-family:'Courier New',monospace;">${tp.tp}</td>
      <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.4);">${tp.rr.toFixed(2)} R:R</td>
    </tr>`).join('');

  // Confidence bar
  const confPct = signal.confidence;
  const confColor = confPct >= 75 ? '#00E676' : confPct >= 50 ? '#FFD700' : '#FF5252';

  const subject = `${isBuy ? '&#9650;' : '&#9660;'} ${directionText} ${signal.pair} @ ${signal.entry} — ForexYemeni VIP`;

  return {
    subject: `${isBuy ? '▲' : '▼'} ${directionText} ${signal.pair} @ ${signal.entry}`,
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

          <!-- Header: Logo + Badge -->
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

          <!-- Signal Card -->
          <tr>
            <td>
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
                <!-- Direction Banner -->
                <div style="background:linear-gradient(135deg,${directionColor}15,${directionColor}08);padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.04);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:6px;">${signal.timeframe || 'H4'}</div>
                        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${signal.pair}</div>
                      </td>
                      <td align="left" style="vertical-align:middle;">
                        <div style="width:56px;height:56px;border-radius:16px;background:${directionColor}18;border:1px solid ${directionColor}35;display:flex;align-items:center;justify-content:center;text-align:center;line-height:56px;">
                          <span style="font-size:22px;color:${directionColor};font-weight:900;">${directionText}</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Signal Details -->
                <div style="padding:24px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <!-- Entry -->
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
                        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
                          <span style="font-size:18px;font-weight:700;color:${confColor};">${confPct}%</span>
                          <div style="width:48px;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;">
                            <div style="width:${confPct}%;height:100%;border-radius:3px;background:${confColor};"></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- Take Profits Table -->
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

          <!-- Disclaimer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);line-height:1.6;text-align:center;max-width:400px;">
                تنبيه: التداول ينطوي على مخاطر عالية. هذه الإشارة لأغراض تعليمية فقط وليست نصيحة مالية.
              </p>
            </td>
          </tr>

          <!-- Footer -->
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
  try {
    const { subject, html } = buildSignalEmail(signal);
    const { data, error } = await getResend().emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error('Resend signal email error:', error);
      return false;
    }
    console.log(`Signal email sent to ${to} (id: ${data?.id})`);
    return true;
  } catch (error) {
    console.error('sendSignalEmail error:', error);
    return false;
  }
}

/**
 * Send signal notification to all active subscribers (fire-and-forget).
 * Returns the number of emails successfully sent.
 */
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

  let sent = 0;
  let failed = 0;

  // Send in parallel (max 10 at a time)
  const batchSize = 10;
  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(u => sendSignalEmail(u.email, signal))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++;
      else failed++;
    }
  }

  console.log(`Broadcast signal email: ${sent} sent, ${failed} failed to ${subscribers.length} subscribers`);
  return { sent, failed };
}
