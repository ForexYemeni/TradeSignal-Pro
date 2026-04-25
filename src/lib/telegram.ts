/**
 * Telegram Bot Integration Service
 *
 * Provides functions to:
 *  1. Send trading signals to a Telegram channel/group
 *  2. Send signal status updates (TP hit, SL hit, etc.)
 *  3. Test the connection to the bot/channel
 *
 * Uses the Bot Token + Chat ID stored in app_settings (KV store).
 * All calls are fire-and-forget — errors are logged but never block the main flow.
 */

import { getAppSettings } from "@/lib/store";

const TELEGRAM_API = "https://api.telegram.org";

// ═══════════════════════════════════════════════════════════════
//  Core: Send a message via Telegram Bot API
// ═══════════════════════════════════════════════════════════════

interface TelegramSendOptions {
  token: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disableWebPagePreview?: boolean;
}

async function sendTelegramMessage(opts: TelegramSendOptions): Promise<boolean> {
  const { token, chatId, text, parseMode = "HTML", disableWebPagePreview = true } = opts;
  try {
    const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
      }),
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] API error:", res.status, err);
      return false;
    }
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    console.error("[Telegram] Send failed:", err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helpers: Load settings & check if Telegram is configured
// ═══════════════════════════════════════════════════════════════

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

async function getTelegramConfig(): Promise<TelegramConfig> {
  const settings = await getAppSettings();
  const token = settings.telegramBotToken?.trim() || "";
  const chatId = normalizeTelegramChatId(settings.telegramChatId || "");
  return {
    enabled: token.length > 0 && chatId.length > 0,
    botToken: token,
    chatId,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Test Connection
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a Telegram chat ID:
 *  - If it starts with @ (channel username), keep as-is.
 *  - If it's a plain numeric string (e.g. "2463619819"), prepend "-100" so it becomes a supergroup ID.
 *  - If it already starts with "-" (e.g. "-1002463619819"), keep as-is.
 */
export function normalizeTelegramChatId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed;
  if (trimmed.startsWith("-")) return trimmed;
  // Plain number — treat as supergroup ID and prepend -100
  if (/^\d+$/.test(trimmed)) return `-100${trimmed}`;
  return trimmed;
}

export async function testTelegramConnection(
  token: string,
  chatId: string
): Promise<{ success: boolean; message: string; botName?: string }> {
  const trimmedToken = token.trim();
  const trimmedChatId = normalizeTelegramChatId(chatId);

  if (!trimmedToken || !trimmedChatId) {
    return { success: false, message: "يرجى إدخال توكن البوت ومعرف القناة" };
  }

  // 1. Verify bot token by calling getMe
  try {
    const meRes = await fetch(`${TELEGRAM_API}/bot${trimmedToken}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!meRes.ok) {
      const errText = await meRes.text();
      return { success: false, message: `توكن البوت غير صالح (${meRes.status})` };
    }
    const meData = await meRes.json();
    if (!meData.ok) {
      return { success: false, message: `توكن البوت غير صالح: ${meData.description || "خطأ غير معروف"}` };
    }
    const botName = meData.result?.username || meData.result?.first_name || "البوت";

    // 2. Try sending a test message to the chat
    const sendResult = await sendTelegramMessage({
      token: trimmedToken,
      chatId: trimmedChatId,
      text: `✅ <b>تم ربط القناة بنجاح</b>\n\n🔍 تم التحقق من الاتصال بنجاح\nسيتم إرسال الإشارات تلقائياً إلى هذه القناة\n\n<i>ForexYemeni Signals</i>`,
    });

    if (sendResult) {
      return { success: true, message: `تم الاتصال بنجاح!`, botName };
    } else {
      return { success: false, message: "تم التحقق من البوت لكن فشل إرسال الرسالة — تأكد من إضافة البوت كمدير في القناة مع صلاحية الإرسال" };
    }
  } catch (err) {
    return { success: false, message: "فشل الاتصال بخوادم تلجرام — تحقق من اتصال الإنترنت" };
  }
}

// ═══════════════════════════════════════════════════════════════
//  Send Signal to Telegram
// ═══════════════════════════════════════════════════════════════

export async function sendSignalToTelegram(signal: {
  pair: string;
  type: string;        // BUY or SELL
  entry: number;
  stopLoss: number;
  takeProfits: { tp: number; rr: number }[];
  confidence: number;
  timeframe?: string;
  htfTimeframe?: string;
  htfTrend?: string;
  smcTrend?: string;
  signalCategory?: string;
}): Promise<void> {
  const config = await getTelegramConfig();
  if (!config.enabled) return;

  const isBuy = signal.type.toUpperCase() === "BUY";
  const directionEmoji = isBuy ? "🟢" : "🔴";
  const directionText = isBuy ? "شراء BUY" : "بيع SELL";
  const dirColor = isBuy ? "#00c853" : "#ff1744";

  // Build TP list
  const tpsHtml = signal.takeProfits
    .map((tp, i) => `  ${i + 1}. TP${i + 1}: <code>${tp.tp}</code>  (RR: <code>${tp.rr.toFixed(2)}</code>)`)
    .join("\n");

  // Confidence stars
  const stars = "⭐".repeat(Math.round(signal.confidence / 20));

  // HTF info
  const htfSection = signal.htfTimeframe || signal.htfTrend
    ? `\n📊 <b>الإطار الأعلى</b>: ${signal.htfTimeframe || "—"} | ${signal.htfTrend || "—"}`
    : "";
  const smcSection = signal.smcTrend
    ? `\n🏆 <b>SMC Trend</b>: ${signal.smcTrend}`
    : "";

  const categoryEmoji = signal.signalCategory === "REENTRY"
    ? "🔄" : signal.signalCategory === "PYRAMID" ? "📈" : "📊";

  const text =
    `${directionEmoji} <b>إشارة تداول جديدة</b> ${categoryEmoji}\n\n` +
    `<b>${signal.pair}</b>  |  <span style="color:${dirColor}"><b>${directionText}</b></span>\n` +
    `⏱ الإطار: <code>${signal.timeframe || "—"}</code>\n` +
    `${htfSection}${smcSection}\n\n` +
    `📍 <b>الدخول (Entry)</b>: <code>${signal.entry}</code>\n` +
    `🛑 <b>وقف الخسارة (SL)</b>: <code>${signal.stopLoss}</code>\n\n` +
    `🎯 <b>جمع الأرباح (TP)</b>:\n${tpsHtml}\n\n` +
    `💪 <b>الثقة</b>: ${stars} ${signal.confidence}%\n\n` +
    `<i>ForexYemeni Signals</i>`;

  await sendTelegramMessage({
    token: config.botToken,
    chatId: config.chatId,
    text,
  });
}

// ═══════════════════════════════════════════════════════════════
//  Send Signal Update to Telegram (TP Hit, SL Hit, Breakeven)
// ═══════════════════════════════════════════════════════════════

export async function sendSignalUpdateToTelegram(params: {
  pair: string;
  updateType: "TP_HIT" | "SL_HIT" | "BREAKEVEN" | "REENTRY_TP" | "REENTRY_SL" | "PYRAMID_TP" | "PYRAMID_SL";
  tpIndex?: number;
  hitPrice?: number;
  pnlDollars?: number;
  pnlPoints?: number;
  partialWin?: boolean;
}): Promise<void> {
  const config = await getTelegramConfig();
  if (!config.enabled) return;

  const { pair, updateType, tpIndex, hitPrice, pnlDollars, pnlPoints, partialWin } = params;

  let emoji = "";
  let title = "";
  let details = "";

  switch (updateType) {
    case "TP_HIT":
    case "REENTRY_TP":
    case "PYRAMID_TP":
      emoji = "🎯";
      title = partialWin ? "ربح جزئي + إيقاف خسارة" : "جمع ربح!";
      details = [
        tpIndex ? `📍 TP${tpIndex} تم الوصول` : "",
        hitPrice ? `💰 عند السعر: <code>${hitPrice}</code>` : "",
        pnlDollars ? `💵 الربح: <code>$${pnlDollars.toFixed(2)}</code>` : "",
        pnlPoints ? `📊 النقاط: <code>${pnlPoints.toFixed(1)}</code>` : "",
      ].filter(Boolean).join("\n");
      break;

    case "SL_HIT":
    case "REENTRY_SL":
    case "PYRAMID_SL":
      if (partialWin) {
        emoji = "⚠️";
        title = "إشارة مغلقة — ربح جزئي ثم خسارة";
        details = [
          pnlDollars ? `💵 النتيجة النهائية: <code>$${pnlDollars.toFixed(2)}</code>` : "",
          pnlPoints ? `📊 النقاط: <code>${pnlPoints.toFixed(1)}</code>` : "",
        ].filter(Boolean).join("\n");
      } else {
        emoji = "🛑";
        title = "وقف خسارة!";
        details = [
          hitPrice ? `💰 عند السعر: <code>${hitPrice}</code>` : "",
          pnlDollars ? `💵 الخسارة: <code>$${Math.abs(pnlDollars).toFixed(2)}</code>` : "",
          pnlPoints ? `📊 النقاط: <code>${pnlPoints.toFixed(1)}</code>` : "",
        ].filter(Boolean).join("\n");
      }
      break;

    case "BREAKEVEN":
      emoji = "🔄";
      title = "نقل وقف الخسارة إلى نقطة الدخول (Breakeven)";
      details = "تم تعديل SL إلى سعر الدخول لتأمين الصفقة";
      break;
  }

  const text =
    `${emoji} <b>${title}</b>\n\n` +
    `<b>${pair}</b>\n\n` +
    `${details}\n\n` +
    `<i>ForexYemeni Signals</i>`;

  await sendTelegramMessage({
    token: config.botToken,
    chatId: config.chatId,
    text,
  });
}

// ═══════════════════════════════════════════════════════════════
//  Send Custom Message to Telegram (admin broadcast, etc.)
// ═══════════════════════════════════════════════════════════════

export async function sendCustomTelegramMessage(message: string): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config.enabled) return false;

  return sendTelegramMessage({
    token: config.botToken,
    chatId: config.chatId,
    text: message,
  });
}
