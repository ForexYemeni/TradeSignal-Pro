/**
 * Telegram Bot Integration Service
 *
 * Supports multiple bot+channel connections.
 * Signals are sent to ALL active connections simultaneously.
 * Uses the connections stored in app_settings.telegramConnections (KV store).
 * Also supports legacy single bot/channel (backward compatible).
 *
 * v2 Improvements:
 * - Retry logic with exponential backoff (3 attempts)
 * - Message splitting for messages > 4000 chars (Telegram limit)
 * - Better logging for debugging
 */

import { getAppSettings } from "@/lib/store";
import type { TelegramConnection } from "@/lib/store";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_TELEGRAM_MSG_LENGTH = 4000; // Telegram limit is 4096, leave some margin
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 3000, 5000]; // 1s, 3s, 5s

// ═══════════════════════════════════════════════════════════════
//  Core: Send a message via Telegram Bot API (with retry)
// ═══════════════════════════════════════════════════════════════

interface TelegramSendOptions {
  token: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  retryAttempts?: number;
}

async function sendTelegramMessage(opts: TelegramSendOptions): Promise<boolean> {
  const { token, chatId, text, parseMode = "HTML", disableWebPagePreview = true, retryAttempts = MAX_RETRY_ATTEMPTS } = opts;
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      // Split message if too long
      const messages = splitTelegramMessage(text);
      
      for (let i = 0; i < messages.length; i++) {
        const msgText = messages[i];
        const isLast = i === messages.length - 1;
        const isFirst = i === 0;

        // Only use parse_mode on the first part (subsequent parts are plain text)
        const currentParseMode = isFirst ? parseMode : undefined;
        
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: msgText,
            ...(currentParseMode ? { parse_mode: currentParseMode } : {}),
            disable_web_page_preview: disableWebPagePreview,
          }),
          signal: AbortSignal.timeout(20000), // Increased to 20s
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "unknown");
          const errJson = (() => { try { return JSON.parse(errText); } catch { return null; } })();
          const errDesc = errJson?.description || errText;
          
          console.error(`[Telegram] API error (attempt ${attempt + 1}/${retryAttempts}):`, res.status, errDesc);

          // If HTML parse error, retry without parse_mode immediately
          if (parseMode === "HTML" && (errDesc?.includes("can't parse entities") || errDesc?.includes("Bad Request"))) {
            console.log("[Telegram] Parse error detected, retrying without HTML...");
            const plainText = msgText
              .replace(/<b>/g, "").replace(/<\/b>/g, "")
              .replace(/<i>/g, "").replace(/<\/i>/g, "")
              .replace(/<code>/g, "").replace(/<\/code>/g, "")
              .replace(/<pre>/g, "").replace(/<\/pre>/g, "");
            const retryRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: plainText,
                disable_web_page_preview: disableWebPagePreview,
              }),
              signal: AbortSignal.timeout(20000),
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData.ok === true) continue; // Success for this part
            }
          }

          // If 429 (rate limit) or 5xx (server error), wait and retry
          if ((res.status === 429 || res.status >= 500) && attempt < retryAttempts - 1) {
            const delay = RETRY_DELAYS[attempt] || 5000;
            // Extract retry_after from 429 response if available
            const retryAfter = errJson?.parameters?.retry_after;
            const waitTime = retryAfter ? Math.max(retryAfter * 1000, delay) : delay;
            console.log(`[Telegram] Rate limit / server error, waiting ${waitTime}ms before retry...`);
            await sleep(waitTime);
            break; // Break inner loop to restart all parts
          }

          return false; // Non-retryable error
        }

        const data = await res.json();
        if (!data.ok) {
          console.error(`[Telegram] Response not ok (attempt ${attempt + 1}):`, data.description);
          if (attempt < retryAttempts - 1) {
            await sleep(RETRY_DELAYS[attempt] || 5000);
            break;
          }
          return false;
        }

        // Small delay between message parts to avoid rate limiting
        if (!isLast) await sleep(500);
      }

      return true; // All parts sent successfully
    } catch (err) {
      console.error(`[Telegram] Send failed (attempt ${attempt + 1}/${retryAttempts}):`, err);
      if (attempt < retryAttempts - 1) {
        await sleep(RETRY_DELAYS[attempt] || 5000);
        continue;
      }
      return false;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  Split long messages for Telegram
// ═══════════════════════════════════════════════════════════════

function splitTelegramMessage(text: string): string[] {
  if (text.length <= MAX_TELEGRAM_MSG_LENGTH) return [text];
  
  const parts: string[] = [];
  const lines = text.split("\n");
  let currentPart = "";
  
  for (const line of lines) {
    // If adding this line would exceed the limit, start a new part
    if (currentPart.length + line.length + 1 > MAX_TELEGRAM_MSG_LENGTH && currentPart.length > 0) {
      parts.push(currentPart.trim());
      currentPart = line + "\n";
    } else {
      currentPart += line + "\n";
    }
  }
  
  if (currentPart.trim()) parts.push(currentPart.trim());
  return parts;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
//  Normalize Chat ID
// ═══════════════════════════════════════════════════════════════

export function normalizeTelegramChatId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed;
  if (trimmed.startsWith("-")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `-100${trimmed}`;
  return trimmed;
}

// ═══════════════════════════════════════════════════════════════
//  Get All Active Telegram Configs
// ═══════════════════════════════════════════════════════════════

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  label?: string;
  connectionId?: string;
}

async function getAllTelegramConfigs(): Promise<TelegramConfig[]> {
  const settings = await getAppSettings();
  const configs: TelegramConfig[] = [];

  // New: multiple connections
  if (settings.telegramConnections && settings.telegramConnections.length > 0) {
    for (const conn of settings.telegramConnections) {
      if (!conn.isActive) continue;
      const token = conn.botToken?.trim() || "";
      const chatId = normalizeTelegramChatId(conn.chatId || "");
      if (token && chatId) {
        configs.push({ enabled: true, botToken: token, chatId, label: conn.label || "", connectionId: conn.id });
      }
    }
  }

  // Legacy: single bot/channel (backward compat)
  // CRITICAL: Only use legacy if NO connections were ever configured (not just all disabled).
  // When admin explicitly disables all connections, we must NOT fall back to legacy settings.
  const hasAnyConnection = settings.telegramConnections && settings.telegramConnections.length > 0;
  if (!hasAnyConnection) {
    const token = settings.telegramBotToken?.trim() || "";
    const chatId = normalizeTelegramChatId(settings.telegramChatId || "");
    if (token && chatId) {
      configs.push({ enabled: true, botToken: token, chatId });
    }
  }

  return configs;
}

// ═══════════════════════════════════════════════════════════════
//  Test Connection
// ═══════════════════════════════════════════════════════════════

export async function testTelegramConnection(
  token: string,
  chatId: string
): Promise<{ success: boolean; message: string; botName?: string }> {
  const trimmedToken = token.trim();
  const trimmedChatId = normalizeTelegramChatId(chatId);

  if (!trimmedToken || !trimmedChatId) {
    return { success: false, message: "يرجى إدخال توكن البوت ومعرف القناة" };
  }

  try {
    const meRes = await fetch(`${TELEGRAM_API}/bot${trimmedToken}/getMe`, { signal: AbortSignal.timeout(10000) });
    if (!meRes.ok) return { success: false, message: `توكن البوت غير صالح (${meRes.status})` };
    const meData = await meRes.json();
    if (!meData.ok) return { success: false, message: `توكن البوت غير صالح: ${meData.description || "خطأ"}` };

    const sendResult = await sendTelegramMessage({
      token: trimmedToken,
      chatId: trimmedChatId,
      text: `✅ <b>تم ربط القناة بنجاح</b>\n\n🔍 تم التحقق من الاتصال بنجاح\nسيتم إرسال الإشارات تلقائياً إلى هذه القناة\n\n<i>ForexYemeni Signals</i>`,
      retryAttempts: 1,
    });

    if (sendResult) {
      return { success: true, message: `تم الاتصال بنجاح!`, botName: meData.result?.username };
    } else {
      return { success: false, message: "تم التحقق من البوت لكن فشل إرسال الرسالة — تأكد من إضافة البوت كمدير في القناة" };
    }
  } catch {
    return { success: false, message: "فشل الاتصال بخوادم تلجرام" };
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helper: Format number with commas
// ═══════════════════════════════════════════════════════════════

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ═══════════════════════════════════════════════════════════════
//  Send Signal to Telegram (all active channels) — PROFESSIONAL FORMAT
// ═══════════════════════════════════════════════════════════════

export async function sendSignalToTelegram(signal: {
  pair: string;
  type: string;
  entry: number;
  stopLoss: number;
  takeProfits: { tp: number; rr: number }[];
  confidence: number;
  timeframe?: string;
  htfTimeframe?: string;
  htfTrend?: string;
  smcTrend?: string;
  signalCategory?: string;
  instrument?: string;
  slDistance?: number;
  maxRR?: number;
  balance?: number;
  lotSize?: string;
  riskPercent?: number;
  riskTarget?: number;
  actualRisk?: number;
  actualRiskPct?: number;
}): Promise<void> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) {
    console.log("[Telegram] No active connections configured — skipping signal send");
    return;
  }

  const isBuy = signal.type.toUpperCase() === "BUY";
  const dirEmoji = isBuy ? "🟢" : "🔴";
  const dirText = isBuy ? "شراء BUY" : "بيع SELL";
  const dirArrow = isBuy ? "▲" : "▼";

  // Category label
  let catLabel = "";
  if (signal.signalCategory === "REENTRY") catLabel = "  🔄 إعادة دخول";
  else if (signal.signalCategory === "PYRAMID") catLabel = "  📈 إضافة صفقة";

  // Confidence as visual bar
  const conf = signal.confidence || 0;
  const totalBars = 10;
  const filledBars = Math.round((conf / 100) * totalBars);
  const emptyBars = totalBars - filledBars;
  const confBar = "█".repeat(filledBars) + "░".repeat(emptyBars);

  // ── Section: Trade Details ──
  const tradeDetails = [
    `🔵 الدخول:  <code>${fmtNum(signal.entry, signal.entry > 100 ? 2 : 5)}</code>`,
    `🔴 الوقف:  <code>${fmtNum(signal.stopLoss, signal.stopLoss > 100 ? 2 : 5)}</code>`,
  ];
  if (signal.slDistance && signal.slDistance > 0) {
    tradeDetails.push(`📏 المسافة:  <code>${fmtNum(signal.slDistance, 1)} نقطة</code>`);
  }
  if (signal.instrument) {
    tradeDetails.push(`🏦 الأداة:  ${signal.instrument}`);
  }

  // ── Section: Targets ──
  let targetsSection = "";
  if (signal.takeProfits && signal.takeProfits.length > 0) {
    const tpLines = signal.takeProfits.map((tp, i) => {
      const tpPrice = fmtNum(tp.tp, tp.tp > 100 ? 2 : 5);
      const rrLabel = tp.rr > 0 ? `R:R 1:${tp.rr.toFixed(2)}` : "";
      return `  🎯 TP${i + 1}:  <code>${tpPrice}</code>   ${rrLabel}`;
    });
    targetsSection =
      `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>الأهداف</b> (${signal.takeProfits.length})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      tpLines.join("\n");

    // Add max R:R at bottom of targets
    if (signal.maxRR && signal.maxRR > 0) {
      targetsSection += `\n  📊 R:R الأقصى:  <code>1:${signal.maxRR.toFixed(2)}</code>`;
    }
  }

  // ── Section: Risk Management ──
  let riskSection = "";
  const hasRisk = signal.balance || signal.lotSize || signal.riskPercent || signal.riskTarget;
  if (hasRisk) {
    const riskLines: string[] = [];
    if (signal.balance && signal.balance > 0) {
      riskLines.push(`💰 الرصيد:  <code>$${fmtNum(signal.balance, 0)}</code>`);
    }
    if (signal.lotSize) {
      riskLines.push(`📊 حجم اللوت:  <code>${signal.lotSize}</code>`);
    }
    if (signal.riskPercent && signal.riskPercent > 0) {
      riskLines.push(`⚠️ المخاطرة:  <code>${signal.riskPercent.toFixed(1)}%</code>`);
    }
    if (signal.riskTarget && signal.riskTarget > 0) {
      riskLines.push(`🎯 هدف المخاطرة:  <code>$${fmtNum(signal.riskTarget, 0)}</code>`);
    }
    if (signal.actualRisk && signal.actualRisk > 0) {
      riskLines.push(`📉 المخاطرة الفعلية:  <code>$${fmtNum(signal.actualRisk, 0)}</code>`);
    }
    if (riskLines.length > 0) {
      riskSection =
        `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛡️ <b>إدارة المخاطر</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        riskLines.join("\n");
    }
  }

  // ── Section: Trend Analysis ──
  let trendSection = "";
  if (signal.htfTimeframe || signal.htfTrend || signal.smcTrend) {
    const trendLines: string[] = [];
    if (signal.htfTimeframe && signal.htfTrend) {
      trendLines.push(`📊 ${signal.htfTimeframe}:  ${signal.htfTrend}`);
    }
    if (signal.smcTrend) {
      trendLines.push(`🏆 SMC:  ${signal.smcTrend}`);
    }
    if (trendLines.length > 0) {
      trendSection =
        `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 <b>التحليل</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        trendLines.join("\n");
    }
  }

  // ── Build final message ──
  const text =
    `╔══════════════════════════════════╗\n` +
    `║  ${dirEmoji} ${dirText} ${dirArrow}${catLabel}  ║\n` +
    `║  ${signal.pair}  │  ${signal.timeframe || "—"}  ║\n` +
    `╚══════════════════════════════════╝\n\n` +
    `المصداقية  ${confBar}  ${conf}%\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>تفاصيل الصفقة</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    tradeDetails.join("\n") +
    `${targetsSection}` +
    `${riskSection}` +
    `${trendSection}\n\n` +
    `<i>— ForexYemeni Signals —</i>`;

  // Send to ALL active channels in parallel + log
  console.log(`[Telegram] Sending signal ${signal.pair} ${signal.type} to ${configs.length} channel(s)`);
  console.log(`[Telegram] Message length: ${text.length} chars`);
  const results = await Promise.allSettled(
    configs.map(async (cfg) => {
      const ok = await sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text });
      if (ok) console.log(`[Telegram] ✅ Sent to ${cfg.label || cfg.chatId}`);
      else console.error(`[Telegram] ❌ Failed to send to ${cfg.label || cfg.chatId}`);
      return ok;
    })
  );
  const succeeded = results.filter(r => r.status === "fulfilled" && r.value).length;
  console.log(`[Telegram] Signal sent: ${succeeded}/${configs.length} channels succeeded`);
}

// ═══════════════════════════════════════════════════════════════
//  Send Signal Update to Telegram (all active channels) — PROFESSIONAL FORMAT
// ═══════════════════════════════════════════════════════════════

export async function sendSignalUpdateToTelegram(params: {
  pair: string;
  updateType: "TP_HIT" | "HIT_TP" | "SL_HIT" | "HIT_SL" | "BREAKEVEN" | "REENTRY_TP" | "REENTRY_SL" | "PYRAMID_TP" | "PYRAMID_SL";
  tpIndex?: number;
  totalTPs?: number;
  hitPrice?: number;
  pnlDollars?: number;
  pnlPoints?: number;
  partialWin?: boolean;
  entry?: number;
  stopLoss?: number;
}): Promise<void> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) {
    console.log("[Telegram] No active connections — skipping update");
    return;
  }

  const { pair, updateType, tpIndex, totalTPs, hitPrice, pnlDollars, pnlPoints, partialWin, entry, stopLoss } = params;

  // Helper to safely format price
  const fmtPrice = (n: number | undefined | null) => {
    if (n == null || !isFinite(n) || n <= 0) return null;
    return fmtNum(n, n > 100 ? 2 : 5);
  };

  // Validate tpIndex: ensure it's within totalTPs range
  // FIX: Cap tpIndex to never exceed totalTPs to prevent showing wrong target numbers
  const validatedTpIndex = (() => {
    const tp = tpIndex ?? 0;
    const total = totalTPs ?? 0;
    if (total > 0 && tp > total) {
      console.warn(`[Telegram] tpIndex ${tp} exceeds totalTPs ${total} — capping to ${total}`);
      return total;
    }
    return tp;
  })();

  let text = "";

  switch (updateType) {
    case "TP_HIT":
    case "HIT_TP": // fallback — some routes use status values
    case "REENTRY_TP":
    case "PYRAMID_TP": {
      const tpNum = validatedTpIndex;
      const total = (totalTPs ?? 0);
      const remaining = total > tpNum ? total - tpNum : 0;
      const isFullClose = remaining === 0;

      const titleEmoji = isFullClose ? "🏆" : "🎯";
      const titleText = partialWin
        ? "ربح جزئي + وقف خسارة"
        : isFullClose
          ? "إغلاق كامل بالربح!"
          : "تحقق هدف الربح!";

      // Build details
      const lines: string[] = [];
      lines.push(`📌 <b>${pair}</b>`);
      lines.push("");
      lines.push(`📍 تم تحقق <b>TP${tpNum}</b>${total > 0 ? ` من ${total}` : ""}`);

      // Price info
      const hp = fmtPrice(hitPrice);
      if (hp) lines.push(`💰 عند السعر:  <code>${hp}</code>`);
      const ep = fmtPrice(entry);
      if (ep) lines.push(`🔵 الدخول:  <code>${ep}</code>`);
      const sp = fmtPrice(stopLoss);
      if (sp) lines.push(`🔴 الوقف:  <code>${sp}</code>`);

      lines.push("");

      // P&L info
      if (pnlDollars != null && isFinite(pnlDollars) && pnlDollars !== 0) {
        if (pnlDollars > 0) {
          lines.push(`💵 الربح:  <code>+$${fmtNum(pnlDollars)}</code>`);
        } else {
          lines.push(`💵 الخسارة:  <code>-$${fmtNum(Math.abs(pnlDollars))}</code>`);
        }
      }
      if (pnlPoints != null && isFinite(pnlPoints) && pnlPoints !== 0) {
        const sign = pnlPoints > 0 ? "+" : "";
        lines.push(`📊 النقاط:  <code>${sign}${fmtNum(pnlPoints, 1)}</code>`);
      }

      // Remaining targets
      if (remaining > 0) {
        lines.push("");
        lines.push(`🟢 ${remaining} أهداف متبقية`);
      }

      text =
        `╔══════════════════════════════════╗\n` +
        `║  ${titleEmoji} ${titleText}  ║\n` +
        `║  ${pair}  │  TP${tpNum}${total > 0 ? "/" + total : ""}  ║\n` +
        `╚══════════════════════════════════╝\n\n` +
        lines.join("\n") +
        `\n\n<i>— ForexYemeni Signals —</i>`;
      break;
    }

    case "SL_HIT":
    case "HIT_SL": // fallback — some routes use status values
    case "REENTRY_SL":
    case "PYRAMID_SL": {
      if (partialWin) {
        const tpNum = validatedTpIndex;
        const lines: string[] = [];
        lines.push(`📌 <b>${pair}</b>`);
        lines.push("");
        lines.push(`⚠️ تم ضرب وقف الخسارة بعد تحقيق أرباح جزئية`);
        if (tpNum > 0) lines.push(`📍 تم تحقق <b>${tpNum}</b> أهداف سابقاً`);

        const hp = fmtPrice(hitPrice);
        if (hp) lines.push(`💰 عند السعر:  <code>${hp}</code>`);

        lines.push("");

        if (pnlDollars != null && isFinite(pnlDollars)) {
          const sign = pnlDollars >= 0 ? "+" : "-";
          lines.push(`💵 النتيجة النهائية:  <code>${sign}$${fmtNum(Math.abs(pnlDollars))}</code>`);
        }
        if (pnlPoints != null && isFinite(pnlPoints)) {
          const sign = pnlPoints >= 0 ? "+" : "";
          lines.push(`📊 النقاط:  <code>${sign}${fmtNum(pnlPoints, 1)}</code>`);
        }

        text =
          `╔══════════════════════════════════╗\n` +
          `║  ⚠️ إشارة مغلقة  ║\n` +
          `║  ربح جزئي + وقف خسارة  ║\n` +
          `║  ${pair}  ║\n` +
          `╚══════════════════════════════════╝\n\n` +
          lines.join("\n") +
          `\n\n<i>— ForexYemeni Signals —</i>`;
      } else {
        const lines: string[] = [];
        lines.push(`📌 <b>${pair}</b>`);
        lines.push("");
        lines.push(`🛑 تم ضرب وقف الخسارة`);

        const hp = fmtPrice(hitPrice);
        if (hp) lines.push(`💰 عند السعر:  <code>${hp}</code>`);
        const ep = fmtPrice(entry);
        if (ep) lines.push(`🔵 الدخول:  <code>${ep}</code>`);

        lines.push("");

        if (pnlDollars != null && isFinite(pnlDollars) && pnlDollars !== 0) {
          lines.push(`💵 الخسارة:  <code>-$${fmtNum(Math.abs(pnlDollars))}</code>`);
        }
        if (pnlPoints != null && isFinite(pnlPoints) && pnlPoints !== 0) {
          lines.push(`📊 النقاط:  <code>${fmtNum(pnlPoints, 1)}</code>`);
        }

        text =
          `╔══════════════════════════════════╗\n` +
          `║  🛑 ضرب وقف الخسارة!  ║\n` +
          `║  ${pair}  ║\n` +
          `╚══════════════════════════════════╝\n\n` +
          lines.join("\n") +
          `\n\n<i>— ForexYemeni Signals —</i>`;
      }
      break;
    }

    case "BREAKEVEN": {
      const ep = fmtPrice(entry);
      text =
        `╔══════════════════════════════════╗\n` +
        `║  🔄 نقل الوقف للتعادل  ║\n` +
        `║  ${pair}  ║\n` +
        `╚══════════════════════════════════╝\n\n` +
        `📌 <b>${pair}</b>\n\n` +
        `✅ تم تعديل وقف الخسارة إلى سعر الدخول لتأمين الصفقة` +
        (ep ? `\n🔵 نقطة الدخول:  <code>${ep}</code>` : "") +
        `\n\n<i>— ForexYemeni Signals —</i>`;
      break;
    }
  }

  if (!text.trim()) {
    console.warn(`[Telegram] Empty message generated for ${updateType} ${pair} — skipping`);
    return;
  }

  console.log(`[Telegram] Sending update ${updateType} for ${pair} to ${configs.length} channel(s)`);
  console.log(`[Telegram] Update message length: ${text.length} chars`);
  await Promise.allSettled(
    configs.map(async (cfg) => {
      const ok = await sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text });
      if (ok) console.log(`[Telegram] ✅ Update sent to ${cfg.label || cfg.chatId}`);
      else console.error(`[Telegram] ❌ Update failed for ${cfg.label || cfg.chatId}`);
      return ok;
    })
  );
}

// ═══════════════════════════════════════════════════════════════
//  Send Custom Message to Telegram (all active channels)
// ═══════════════════════════════════════════════════════════════

export async function sendCustomTelegramMessage(message: string): Promise<boolean> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) return false;

  const results = await Promise.allSettled(
    configs.map(cfg => sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text: message }))
  );
  return results.some(r => r.status === "fulfilled" && r.value === true);
}
