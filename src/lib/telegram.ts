/**
 * Telegram Bot Integration Service
 *
 * Supports multiple bot+channel connections.
 * Signals are sent to ALL active connections simultaneously.
 * Uses the connections stored in app_settings.telegramConnections (KV store).
 * Also supports legacy single bot/channel (backward compatible).
 * All calls are fire-and-forget — errors are logged but never block the main flow.
 */

import { getAppSettings } from "@/lib/store";
import type { TelegramConnection } from "@/lib/store";

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
//  Normalize Chat ID
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a Telegram chat ID:
 *  - If it starts with @ (channel username), keep as-is.
 *  - If it's a plain numeric string (e.g. "2463619819"), prepend "-100".
 *  - If it already starts with "-" (e.g. "-1002463619819"), keep as-is.
 */
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

/**
 * Returns all active telegram configs (from connections array + legacy fields).
 */
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
        configs.push({
          enabled: true,
          botToken: token,
          chatId,
          label: conn.label || "",
          connectionId: conn.id,
        });
      }
    }
  }

  // Legacy: single bot/channel (backward compat — only if no connections defined)
  if (configs.length === 0) {
    const token = settings.telegramBotToken?.trim() || "";
    const chatId = normalizeTelegramChatId(settings.telegramChatId || "");
    if (token && chatId) {
      configs.push({ enabled: true, botToken: token, chatId });
    }
  }

  return configs;
}

// ═══════════════════════════════════════════════════════════════
//  Test Connection (single bot + channel)
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
//  Send Signal to Telegram (all active channels)
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
}): Promise<void> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) return;

  const isBuy = signal.type.toUpperCase() === "BUY";
  const directionEmoji = isBuy ? "🟢" : "🔴";
  const directionText = isBuy ? "شراء BUY" : "بيع SELL";
  const dirColor = isBuy ? "#00c853" : "#ff1744";

  const tpsHtml = signal.takeProfits
    .map((tp, i) => `  ${i + 1}. TP${i + 1}: <code>${tp.tp}</code>  (RR: <code>${tp.rr.toFixed(2)}</code>)`)
    .join("\n");

  const stars = "⭐".repeat(Math.round(signal.confidence / 20));

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

  // Send to ALL active channels in parallel
  await Promise.allSettled(
    configs.map(cfg =>
      sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text })
    )
  );
}

// ═══════════════════════════════════════════════════════════════
//  Send Signal Update to Telegram (all active channels)
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
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) return;

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

  await Promise.allSettled(
    configs.map(cfg =>
      sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text })
    )
  );
}

// ═══════════════════════════════════════════════════════════════
//  Send Custom Message to Telegram (all active channels)
// ═══════════════════════════════════════════════════════════════

export async function sendCustomTelegramMessage(message: string): Promise<boolean> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) return false;

  const results = await Promise.allSettled(
    configs.map(cfg =>
      sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text: message })
    )
  );

  return results.some(r => r.status === "fulfilled" && r.value === true);
}
