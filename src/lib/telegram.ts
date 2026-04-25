/**
 * Telegram Bot Integration Service
 *
 * Supports multiple bot+channel connections.
 * Signals are sent to ALL active connections simultaneously.
 * Uses the connections stored in app_settings.telegramConnections (KV store).
 * Also supports legacy single bot/channel (backward compatible).
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
      signal: AbortSignal.timeout(15000),
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
  instrument?: string;
  slDistance?: number;
  maxRR?: number;
}): Promise<void> {
  const configs = await getAllTelegramConfigs();
  if (configs.length === 0) {
    console.log("[Telegram] No active connections configured — skipping signal send");
    return;
  }

  const isBuy = signal.type.toUpperCase() === "BUY";
  const dirEmoji = isBuy ? "🟢" : "🔴";
  const dirText = isBuy ? "شراء BUY ▲" : "بيع SELL ▼";
  const catLabel = signal.signalCategory === "REENTRY" ? "🔄 إعادة دخول" : signal.signalCategory === "PYRAMID" ? "📈 إضافة صفقة" : "";

  // Confidence as visual bar
  const conf = signal.confidence || 0;
  const filledBlocks = Math.round(conf / 20);
  const emptyBlocks = 5 - filledBlocks;
  const confBar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);

  // TPs list
  const tpsList = signal.takeProfits && signal.takeProfits.length > 0
    ? signal.takeProfits.map((tp, i) => `  🎯 TP${i + 1}: <code>${tp.tp}</code>  │  R:R <code>${tp.rr.toFixed(2)}</code>`).join("\n")
    : "  — لا توجد أهداف محددة";

  // Additional info
  const slDist = signal.slDistance ? `\n📏 مسافة الوقف: <code>${signal.slDistance}</code>` : "";
  const maxRR = signal.maxRR ? `\n📊 R:R الأقصى: <code>1:${signal.maxRR}</code>` : "";
  const instrument = signal.instrument ? `\n🏦 الأداة: ${signal.instrument}` : "";

  // Trend info
  let trendInfo = "";
  if (signal.htfTimeframe || signal.htfTrend || signal.smcTrend) {
    const htf = signal.htfTimeframe ? `${signal.htfTimeframe}` : "";
    const htfTrend = signal.htfTrend || "—";
    const smc = signal.smcTrend || "—";
    trendInfo = `\n\n━━━━━━━━━━━━━━━━━━━━\n📈 <b>التحليل</b>\n━━━━━━━━━━━━━━━━━━━━\n📊 ${htf}: ${htfTrend}\n🏆 SMC: ${smc}`;
  }

  const text =
    `╔════════════════════════════════╗\n` +
    `║ ${dirEmoji} ${dirText} ${catLabel} ║\n` +
    `╚════════════════════════════════╝\n\n` +
    `📌 <b>${signal.pair}</b> │ ${signal.timeframe || "—"}\n` +
    `${confBar} ${conf}%\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 <b>الصفقة</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔵 الدخول: <code>${signal.entry}</code>\n` +
    `🔴 الوقف: <code>${signal.stopLoss}</code>${slDist}${maxRR}${instrument}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 <b>الأهداف</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tpsList}` +
    `${trendInfo}\n\n` +
    `<i>ForexYemeni Signals</i>`;

  // Send to ALL active channels in parallel + log
  console.log(`[Telegram] Sending signal ${signal.pair} ${signal.type} to ${configs.length} channel(s)`);
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
//  Send Signal Update to Telegram (all active channels)
// ═══════════════════════════════════════════════════════════════

export async function sendSignalUpdateToTelegram(params: {
  pair: string;
  updateType: "TP_HIT" | "SL_HIT" | "BREAKEVEN" | "REENTRY_TP" | "REENTRY_SL" | "PYRAMID_TP" | "PYRAMID_SL";
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

  let emoji = "";
  let title = "";
  let detailsLines: string[] = [];

  switch (updateType) {
    case "TP_HIT":
    case "REENTRY_TP":
    case "PYRAMID_TP": {
      const tpNum = tpIndex ?? 0;
      const total = totalTPs ?? 0;
      emoji = "🎯";
      title = partialWin ? "ربح جزئي + إيقاف خسارة" : "تحقق هدف الربح!";
      detailsLines = [
        `📌 <b>${pair}</b>`,
        ``,
        `📍 تم تحقق <b>TP${tpNum}</b>${total > 0 ? ` من ${total}` : ""}`,
        hitPrice != null && hitPrice > 0 ? `💰 عند السعر: <code>${hitPrice}</code>` : "",
        entry != null && entry > 0 ? `🔵 سعر الدخول: <code>${entry}</code>` : "",
        stopLoss != null && stopLoss > 0 ? `🔴 وقف الخسارة: <code>${stopLoss}</code>` : "",
        ``,
        pnlDollars != null && pnlDollars !== 0 ? (pnlDollars > 0
          ? `💵 الربح: <code>+$${pnlDollars.toFixed(2)}</code>`
          : `💵 الخسارة: <code>-$${Math.abs(pnlDollars).toFixed(2)}</code>`)
          : "",
        pnlPoints != null && pnlPoints !== 0 ? `📊 النقاط: <code>${pnlPoints > 0 ? "+" : ""}${pnlPoints.toFixed(1)}</code>` : "",
      ].filter(Boolean);
      break;
    }

    case "SL_HIT":
    case "REENTRY_SL":
    case "PYRAMID_SL": {
      emoji = "🛑";
      if (partialWin) {
        title = "إشارة مغلقة — ربح جزئي ثم خسارة";
        detailsLines = [
          `📌 <b>${pair}</b>`,
          ``,
          `⚠️ تم ضرب وقف الخسارة بعد تحقيق أرباح جزئية`,
          pnlDollars != null ? `💵 النتيجة النهائية: <code>${pnlDollars >= 0 ? "+" : "-"}$${Math.abs(pnlDollars).toFixed(2)}</code>` : "",
          pnlPoints != null ? `📊 النقاط: <code>${pnlPoints.toFixed(1)}</code>` : "",
          hitPrice != null && hitPrice > 0 ? `💰 عند السعر: <code>${hitPrice}</code>` : "",
        ].filter(Boolean);
      } else {
        title = "ضرب وقف الخسارة!";
        detailsLines = [
          `📌 <b>${pair}</b>`,
          ``,
          hitPrice != null && hitPrice > 0 ? `💰 عند السعر: <code>${hitPrice}</code>` : "",
          entry != null && entry > 0 ? `🔵 سعر الدخول: <code>${entry}</code>` : "",
          pnlDollars != null && pnlDollars !== 0 ? `💵 الخسارة: <code>-$${Math.abs(pnlDollars).toFixed(2)}</code>` : "",
          pnlPoints != null && pnlPoints !== 0 ? `📊 النقاط: <code>${pnlPoints.toFixed(1)}</code>` : "",
        ].filter(Boolean);
      }
      break;
    }

    case "BREAKEVEN":
      emoji = "🔄";
      title = "نقل الوقف إلى نقطة الدخول";
      detailsLines = [
        `📌 <b>${pair}</b>`,
        ``,
        `✅ تم تعديل وقف الخسارة إلى سعر الدخول لتأمين الصفقة`,
        entry != null && entry > 0 ? `🔵 نقطة الدخول: <code>${entry}</code>` : "",
      ].filter(Boolean);
      break;
  }

  const text =
    `${emoji} <b>${title}</b>\n\n` +
    detailsLines.join("\n") +
    `\n\n<i>ForexYemeni Signals</i>`;

  console.log(`[Telegram] Sending update ${updateType} for ${pair} to ${configs.length} channel(s)`);
  await Promise.allSettled(
    configs.map(cfg => sendTelegramMessage({ token: cfg.botToken, chatId: cfg.chatId, text }))
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
