"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Star, Target, ShieldAlert, Clock,
  Activity, Zap, DollarSign, Trash2, Crown, CheckCircle2, XCircle,
  ChevronDown, ArrowUpRight, Timer, Radio, CircleDot,
  Check, X, Info, RotateCcw, Flame, ChevronUp,
  Gauge, Crosshair,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Signal, SignalCategory, TakeProfit } from "@/lib/types";
import { timeAgo, isEntry, entryAccent, isTpLike, isSlLike, formatCountdown } from "@/lib/utils";
import { Stars, Glass, Div, useOnlineStatus } from "@/components/shared";

/* ── Helper: Map pair name to Arabic instrument label ── */
function getInstrumentLabel(pair: string): string {
  const p = (pair || "").toUpperCase();
  if (/XAU|GOLD/.test(p)) return "الذهب";
  if (/XAG|SILVER/.test(p)) return "الفضة";
  if (/USOIL|CRUDE|OIL/.test(p)) return "النفط";
  if (/BTC/.test(p)) return "بيتكوين";
  if (/ETH/.test(p)) return "إيثريوم";
  if (/SOL/.test(p)) return "سولانا";
  if (/BNB/.test(p)) return "بينانس";
  if (/XRP/.test(p)) return "ريبل";
  if (/ADA/.test(p)) return "كاردانو";
  if (/DOGE/.test(p)) return "دوج";
  if (/NAS|NDX/.test(p)) return "ناسداك";
  if (/US30|DOW/.test(p)) return "داو جونز";
  if (/DAX/.test(p)) return "داكس";
  if (/US500|SPX/.test(p)) return "إس آند بي";
  if (/JPY/.test(p)) return "ين ياباني";
  if (/[A-Z]{3,6}(USD|EUR|GBP|AUD|NZD|CAD|CHF)/.test(p)) return "فوركس";
  return "";
}

/* ═══════════════════════════════════════════════════════════════
   1. CATEGORY CONFIG
   ═══════════════════════════════════════════════════════════════ */
export const catCfg: Record<SignalCategory, {
  label: string; accent: string; border: string;
  bg: string; text: string; iconBg: string;
}> = {
  ENTRY:       { label: "إشارة دخول",   accent: "from-emerald-400 to-emerald-600", border: "border-emerald-500/20",  bg: "bg-emerald-500/[0.08]",  text: "text-emerald-400", iconBg: "bg-emerald-500/15" },
  TP_HIT:      { label: "هدف محقق",     accent: "from-cyan-400 to-cyan-600",       border: "border-cyan-500/20",    bg: "bg-cyan-500/[0.08]",     text: "text-cyan-400",    iconBg: "bg-cyan-500/15" },
  SL_HIT:      { label: "وقف محقق",     accent: "from-red-400 to-red-600",         border: "border-red-500/20",     bg: "bg-red-500/[0.08]",      text: "text-red-400",     iconBg: "bg-red-500/15" },
  REENTRY:     { label: "إعادة دخول",   accent: "from-blue-400 to-blue-600",       border: "border-blue-500/20",    bg: "bg-blue-500/[0.08]",     text: "text-blue-400",    iconBg: "bg-blue-500/15" },
  REENTRY_TP:  { label: "تعويض - هدف",  accent: "from-cyan-400 to-cyan-600",       border: "border-cyan-500/20",    bg: "bg-cyan-500/[0.08]",     text: "text-cyan-400",    iconBg: "bg-cyan-500/15" },
  REENTRY_SL:  { label: "تعويض - وقف",  accent: "from-cyan-400 to-red-500",        border: "border-cyan-500/20",    bg: "bg-cyan-500/[0.08]",     text: "text-cyan-400",    iconBg: "bg-cyan-500/15" },
  PYRAMID:     { label: "تدرج",         accent: "from-purple-400 to-purple-600",   border: "border-purple-500/20",  bg: "bg-purple-500/[0.08]",   text: "text-purple-400",  iconBg: "bg-purple-500/15" },
  PYRAMID_TP:  { label: "تدرج - هدف",  accent: "from-cyan-400 to-cyan-600",       border: "border-purple-500/20",  bg: "bg-purple-500/[0.08]",   text: "text-purple-400",  iconBg: "bg-purple-500/15" },
  PYRAMID_SL:  { label: "تدرج - وقف",  accent: "from-purple-400 to-red-500",      border: "border-purple-500/20",  bg: "bg-purple-500/[0.08]",   text: "text-purple-400",  iconBg: "bg-purple-500/15" },
};

/* ═══════════════════════════════════════════════════════════════
   2. TP MINI CARD
   ═══════════════════════════════════════════════════════════════ */
export function TpMiniCard({ tp, index, isHit, isLastHit, entry, type }: {
  tp: TakeProfit; index: number; isHit: boolean; isLastHit: boolean; entry: number; type: "BUY" | "SELL";
}) {
  const [expanded, setExpanded] = useState(false);
  const diff = Math.abs(tp.tp - entry).toFixed(1);
  const direction = (type === "BUY" && tp.tp > entry) || (type === "SELL" && tp.tp < entry) ? "+" : "";
  const pctFromEntry = ((Math.abs(tp.tp - entry) / entry) * 100).toFixed(3);

  return (
    <div>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-right rounded-xl border transition-all duration-300 overflow-hidden card-transition-premium ${
          isHit
            ? "bg-emerald-500/[0.06] border-emerald-500/20 hover-glow-emerald"
            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]"
        }`}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {/* Hit / Unhit indicator */}
          {isHit ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                isLastHit
                  ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30"
                  : "bg-emerald-500/15"
              }`}
            >
              <Check className="w-3.5 h-3.5 text-emerald-300" strokeWidth={3} />
            </motion.div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-[10px] text-muted-foreground font-bold tabular-nums">{index + 1}</span>
            </div>
          )}

          {/* Price info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2" dir="ltr">
              <span className={`text-xs font-bold font-mono tabular-nums ${isHit ? "text-emerald-300 line-through decoration-emerald-500/40" : "text-foreground/90"}`}>
                {tp.tp}
              </span>
              <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                isHit ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-muted-foreground"
              }`}>
                {direction}{diff}
              </span>
            </div>
          </div>

          {/* R:R badge */}
          <div className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg tabular-nums ${
            isHit ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/[0.08] text-amber-400/80"
          }`}>
            {tp.rr.toFixed(2)}R
          </div>

          {/* Chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
          >
            <ChevronDown className={`w-3.5 h-3.5 ${isHit ? "text-emerald-500/40" : "text-muted-foreground/50"}`} />
          </motion.div>
        </div>

        {/* Emerald left accent bar for hit */}
        {isHit && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-l-xl" />
        )}
      </motion.button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 mx-1 mb-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2.5 shadow-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">سعر الهدف</span>
                  <span className="font-mono font-bold text-foreground tabular-nums" dir="ltr">{tp.tp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">المسافة</span>
                  <span className="font-mono text-foreground/80 tabular-nums" dir="ltr">{direction}{diff} نقطة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">R:R</span>
                  <span className="font-mono font-semibold text-amber-400 tabular-nums" dir="ltr">{tp.rr.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">نسبة التحرك</span>
                  <span className="font-mono text-foreground/80 tabular-nums" dir="ltr">{pctFromEntry}%</span>
                </div>
              </div>
              {isHit ? (
                <div className="flex items-center gap-2 pt-2 border-t border-emerald-500/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold">تم تحقيق الهدف بنجاح</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground/60">في انتظار التحقيق</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   3. TRADE RESULT BANNER
   ═══════════════════════════════════════════════════════════════ */
export function TradeStatusBanner({ s }: { s: Signal }) {
  const isProfit = s.status === "HIT_TP";
  const isLoss = s.status === "HIT_SL";
  const isManual = s.status === "MANUAL_CLOSE";
  const isPartialWin = isProfit && s.partialWin;
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;
  const totalTPs = s.totalTPs || s.takeProfits?.length || 0;
  const isReentry = (s.signalCategory || "").startsWith("REENTRY");
  const isPyramid = (s.signalCategory || "").startsWith("PYRAMID");
  if (s.status === "ACTIVE") return null;

  const theme = isReentry
    ? { gradient: "from-cyan-500/[0.12] via-cyan-600/[0.06] to-transparent", border: "border-cyan-500/20", iconBg: "bg-cyan-500/20", text: "text-cyan-400", badge: "bg-cyan-500/15 text-cyan-400", pill: "bg-cyan-500/10 text-cyan-400/80", sub: "text-cyan-400/50" }
    : isPyramid
    ? { gradient: "from-purple-500/[0.12] via-purple-600/[0.06] to-transparent", border: "border-purple-500/20", iconBg: "bg-purple-500/20", text: "text-purple-400", badge: "bg-purple-500/15 text-purple-400", pill: "bg-purple-500/10 text-purple-400/80", sub: "text-purple-400/50" }
    : isProfit
    ? { gradient: "from-emerald-500/[0.12] via-emerald-600/[0.06] to-transparent", border: "border-emerald-500/20", iconBg: "bg-emerald-500/20", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400", pill: "bg-emerald-500/10 text-emerald-400/80", sub: "text-emerald-400/50" }
    : isLoss
    ? { gradient: "from-red-500/[0.12] via-red-600/[0.06] to-transparent", border: "border-red-500/20", iconBg: "bg-red-500/20", text: "text-red-400", badge: "bg-red-500/15 text-red-400", pill: "bg-red-500/10 text-red-400/80", sub: "text-red-400/50" }
    : { gradient: "from-white/[0.04] via-white/[0.02] to-transparent", border: "border-white/[0.06]", iconBg: "bg-white/[0.06]", text: "text-muted-foreground", badge: "bg-white/[0.04] text-muted-foreground", pill: "bg-white/[0.04] text-muted-foreground/60", sub: "text-muted-foreground/50" };

  const catIcon = isReentry ? <RotateCcw className="w-3 h-3" /> : isPyramid ? <Flame className="w-3 h-3" /> : null;
  const catLabel = isReentry ? "تعويض" : isPyramid ? "تعزيز" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`mt-3 rounded-xl border overflow-hidden ${theme.border}`}
    >
      <div className={`bg-gradient-to-l ${theme.gradient} p-3`}>
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.iconBg} shadow-sm`}>
            {isProfit && <CheckCircle2 className={`w-4 h-4 ${theme.text}`} />}
            {isLoss && <XCircle className="w-4 h-4 text-red-400" />}
            {isManual && <Info className="w-4 h-4 text-muted-foreground" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${theme.text}`}>
                {isPartialWin ? (catLabel ? `${catLabel} ربح جزئي` : "ربح جزئي") : isProfit ? (catLabel ? `${catLabel} رابح` : "صفقة رابحة") : isLoss ? (isReentry ? "تعويض خاسر" : isPyramid ? "تعزيز خاسر" : "صفقة خاسرة") : "صفقة مغلقة يدويا"}
              </span>
              {isProfit && hitCount > 0 && totalTPs > 0 && (
                <span className={`text-[10px] ${theme.badge} px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1`}>
                  {catIcon}{hitCount}/{totalTPs} {catLabel || "أهداف"}
                </span>
              )}
            </div>
            {/* PnL */}
            {isProfit && (s.pnlDollars ?? 0) !== 0 && (
              <div className={`text-[11px] font-mono font-bold ${theme.text} mt-0.5 tabular-nums`} dir="ltr">
                {s.pnlDollars! >= 0 ? "+" : ""}{(s.pnlDollars!).toFixed(2)}{" "}
                <span className={`text-[10px] font-normal ${theme.sub}`}>({s.pnlPoints! >= 0 ? "+" : ""}{s.pnlPoints ?? 0} نقطة)</span>
              </div>
            )}
            {isLoss && (s.pnlDollars ?? 0) !== 0 && (
              <div className="text-[11px] font-mono font-bold text-red-400 mt-0.5 tabular-nums" dir="ltr">
                -${Math.abs(s.pnlDollars ?? 0).toFixed(2)}{" "}
                <span className="text-[10px] font-normal text-red-400/50">({s.pnlPoints ?? 0} نقطة)</span>
              </div>
            )}
            {isManual && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                تم إغلاق الصفقة يدويا{hitCount > 0 && ` بعد تحقيق ${hitCount} هدف`}
              </div>
            )}
          </div>

          {/* Pill */}
          {isProfit && (
            <div className={`text-[10px] font-bold ${theme.pill} px-2.5 py-1 rounded-lg flex-shrink-0`}>
              {isPartialWin ? "ربح جزئي" : "ربح"}
            </div>
          )}
          {isLoss && (
            <div className="text-[10px] font-bold bg-red-500/10 text-red-400/80 px-2.5 py-1 rounded-lg flex-shrink-0">
              خسارة
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   4. ENTRY CARD — Full Active Signal Card (Major Redesign)
   ═══════════════════════════════════════════════════════════════ */
export function EntryCard({ s, idx, isAdmin, onUpdate, onDelete, isNew, statusChanged, isFavorite, onToggleFavorite }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
  isNew?: boolean;
  statusChanged?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const ac = entryAccent(s);
  const isBuy = s.type === "BUY";
  const isClosed = s.status !== "ACTIVE";
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;
  const isReentry = (s.signalCategory || "").startsWith("REENTRY");
  const isPyramid = (s.signalCategory || "").startsWith("PYRAMID");
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => setElapsed(formatCountdown(s.createdAt));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [s.createdAt]);

  const isOnline = useOnlineStatus();
  const typeLabel = isReentry ? "إعادة دخول" : isPyramid ? "تدرج" : isBuy ? "شراء" : "بيع";

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: 40 } : { opacity: 0, y: 16 }}
      animate={{ opacity: isClosed ? 0.8 : 1, x: 0, y: 0 }}
      transition={{ duration: 0.4, delay: isNew ? 0 : idx * 0.04 }}
      className={statusChanged ? "animate-status-pulse" : ""}
    >
      <Glass className={`overflow-hidden relative ${ac.border} ${isClosed ? "opacity-80" : ""} shadow-layered hover-lift-premium`} padding="none">
        {/* 1. Top accent bar */}
        <div className={`h-[3px] bg-gradient-to-l ${ac.accent}`} style={{ boxShadow: `0 0 12px ${isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }} />

        {/* Favorite star button */}
        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(s.id); }}
          className="absolute top-3 left-3 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: isFavorite ? "rgba(251, 191, 36, 0.15)" : "rgba(255,255,255,0.04)", border: isFavorite ? "1px solid rgba(251, 191, 36, 0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
          <Star className={`w-3.5 h-3.5 ${isFavorite ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"}`} />
        </button>

        <div className="p-4 space-y-3.5">
          {/* 2. Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              {/* Pair icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ac.bg} shadow-lg shadow-layered`}>
                {isBuy
                  ? <TrendingUp className={`w-5 h-5 ${ac.text}`} />
                  : <TrendingDown className={`w-5 h-5 ${ac.text}`} />
                }
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-foreground text-[16px] tracking-wide">{s.pair}</span>
                  {/* BUY/SELL pill badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isBuy
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/15 text-red-400 border border-red-500/20"
                  }`}>
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                  {/* Timeframe badges */}
                  {s.timeframe && (
                    <span className="text-[10px] bg-white/[0.04] text-muted-foreground px-1.5 py-0.5 rounded-md font-medium border border-white/[0.06]">
                      {s.timeframe}
                    </span>
                  )}
                  {s.htfTimeframe && (
                    <span className="text-[10px] bg-white/[0.04] text-muted-foreground px-1.5 py-0.5 rounded-md font-medium border border-white/[0.06]">
                      {s.htfTimeframe}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
                  {/* LIVE indicator */}
                  {s.status === "ACTIVE" && (
                    <div className="flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold tracking-wider">LIVE</span>
                    </div>
                  )}
                  {isClosed && (
                    <span className={`text-[10px] font-semibold ${
                      s.status === "HIT_TP" ? "text-emerald-400" : s.status === "HIT_SL" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {s.status === "HIT_TP" ? (s.partialWin ? "ربح جزئي" : "مغلقة بربح") : s.status === "HIT_SL" ? "مغلقة بخسارة" : "مغلقة"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: confidence + PnL */}
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {/* Confidence stars */}
              {s.confidence > 0 && <Stars r={s.confidence} />}
              {/* PnL for active with hits or closed */}
              {(hitCount > 0) && (s.pnlDollars != null && s.pnlDollars !== 0) && (
                <div className="text-right">
                  <div className={`text-[14px] font-extrabold font-mono tabular-nums ${s.pnlDollars >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                    {s.pnlDollars >= 0 ? "+" : ""}{s.pnlDollars.toFixed(2)}$
                  </div>
                  {s.pnlPoints != null && s.pnlPoints !== 0 && (
                    <div className={`text-[10px] font-mono tabular-nums ${s.pnlDollars >= 0 ? "text-emerald-400/40" : "text-red-400/40"}`} dir="ltr">
                      {s.pnlPoints >= 0 ? "+" : ""}{s.pnlPoints} نقطة
                    </div>
                  )}
                </div>
              )}
              {isClosed && s.status === "HIT_SL" && (s.pnlDollars == null || s.pnlDollars === 0) && (
                <div className="text-[14px] font-extrabold font-mono text-red-400 tabular-nums" dir="ltr">
                  -{(s.pnlPoints ?? 0)} نقطة
                </div>
              )}
            </div>
          </div>

          {/* 4. Timer */}
          <div className="flex items-center gap-2">
            {s.status === "ACTIVE" && (
              <>
                <Radio className="w-3 h-3 text-emerald-400/40 animate-pulse" />
                <span className="text-[10px] text-emerald-400/50 font-medium">مباشر</span>
                <span className="text-[10px] text-white/[0.1]">•</span>
              </>
            )}
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">منذ {elapsed || timeAgo(s.createdAt)}</span>
            </div>
          </div>

          {/* 5. Price grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Entry price */}
            <div className={`rounded-xl p-3 border transition-all duration-300 ${
              isBuy
                ? "bg-emerald-500/[0.04] border-emerald-500/15"
                : "bg-red-500/[0.04] border-red-500/15"
            }`}>
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className={`w-3 h-3 ${isBuy ? "text-emerald-400" : "text-red-400"}`} />
                <span className="text-[10px] text-muted-foreground font-medium">سعر الدخول</span>
              </div>
              <div className={`text-[16px] font-extrabold font-mono tabular-nums ${isBuy ? "text-emerald-300" : "text-red-300"}`} dir="ltr">
                {s.entry}
              </div>
            </div>
            {/* Stop Loss */}
            <div className="bg-red-500/[0.04] rounded-xl p-3 border border-red-500/15">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldAlert className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400/60 font-medium">وقف الخسارة</span>
              </div>
              <div className="text-[16px] font-extrabold font-mono text-red-400 tabular-nums" dir="ltr">
                {s.stopLoss}
              </div>
              <div className="text-[10px] text-muted-foreground/40 mt-1.5 font-mono tabular-nums" dir="ltr">
                {s.slDistance || Math.abs(s.entry - s.stopLoss).toFixed(1)} نقطة
              </div>
            </div>
          </div>

          {/* 6. Risk Management */}
          {(s.balance || s.lotSize || s.riskTarget) && (
            <>
              <Div />
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-foreground/70">إدارة المخاطر</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  {s.balance && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">الرصيد</span>
                      <span className="font-mono text-foreground font-semibold tabular-nums" dir="ltr">${Number(s.balance).toLocaleString()}</span>
                    </div>
                  )}
                  {s.lotSize && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">اللوت</span>
                      <span className="font-mono text-foreground font-semibold tabular-nums" dir="ltr">{s.lotSize}</span>
                    </div>
                  )}
                  {s.riskTarget && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">الخطر</span>
                      <span className="font-mono text-foreground tabular-nums" dir="ltr">${s.riskTarget}{s.riskPercent ? ` (${s.riskPercent}%)` : ""}</span>
                    </div>
                  )}
                  {s.actualRisk && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">فعلي</span>
                      <span className="font-mono text-foreground tabular-nums" dir="ltr">${s.actualRisk}{s.actualRiskPct ? ` (${s.actualRiskPct}%)` : ""}</span>
                    </div>
                  )}
                  {s.maxRR && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">R:R أقصى</span>
                      <span className="font-mono text-amber-400 font-bold tabular-nums" dir="ltr">1:{s.maxRR}</span>
                    </div>
                  )}
                  {getInstrumentLabel(s.pair) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground/60">الأداة</span>
                      <span className="text-foreground">{getInstrumentLabel(s.pair)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 7. TP Targets */}
          {s.takeProfits?.length > 0 && (
            <>
              <Div />
              <div className="space-y-2.5">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] text-foreground/80 font-bold">الأهداف</span>
                    {hitCount > 0 && (
                      <motion.span
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-bold"
                      >
                        {hitCount}/{s.takeProfits.length}
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 font-mono">R:R</span>
                </div>

                {/* TP cards list */}
                <div className="space-y-1.5">
                  {s.takeProfits.map((tp, i) => (
                    <TpMiniCard
                      key={i}
                      tp={tp}
                      index={i}
                      isHit={s.hitTpIndex > 0 && i < s.hitTpIndex}
                      isLastHit={s.hitTpIndex - 1 === i}
                      entry={s.entry}
                      type={s.type}
                    />
                  ))}
                </div>

                {/* Segmented progress bar */}
                {s.status === "ACTIVE" && s.takeProfits.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex gap-0.5">
                      {s.takeProfits.map((_, i) => {
                        const isHit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                        return (
                          <div
                            key={i}
                            className={`h-full rounded-full transition-all duration-500 ${
                              i === 0 ? "rounded-r-full" : ""
                            } ${i === s.takeProfits.length - 1 ? "rounded-l-full" : ""} ${
                              isHit
                                ? "bg-gradient-to-l from-emerald-400 to-emerald-500"
                                : "bg-white/[0.06]"
                            }`}
                            style={{ width: `${100 / s.takeProfits.length}%` }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-emerald-400/60 font-medium tabular-nums">{hitCount}/{s.takeProfits.length} أهداف</span>
                      <span className="text-[10px] text-red-400/40 font-medium">SL</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 8. HTF/SMC Trend */}
          {(s.htfTrend || s.smcTrend) && (
            <>
              <Div />
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                {s.htfTrend && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <Activity className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-muted-foreground/50 text-[10px]">{s.htfTimeframe || "HTF"}:</span>
                    <span className={`font-semibold ${
                      s.htfTrend === "صاعد" ? "text-emerald-400" : s.htfTrend === "هابط" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {s.htfTrend}{s.htfTrend === "صاعد" ? " 🐂" : s.htfTrend === "هابط" ? " 🐻" : ""}
                    </span>
                  </div>
                )}
                {s.smcTrend && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <Zap className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-muted-foreground/50 text-[10px]">SMC:</span>
                    <span className={`font-semibold ${
                      s.smcTrend === "صاعد" ? "text-emerald-400" : s.smcTrend === "هابط" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {s.smcTrend}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 10. TradeResultBanner */}
          <TradeStatusBanner s={s} />

          {/* 9. Admin Actions */}
          {isAdmin && s.status === "ACTIVE" && (
            <>
              <Div />
              <div className="flex flex-wrap gap-1.5">
                {s.takeProfits?.map((_, i) => {
                  const isHit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                  return (
                    <motion.button
                      key={i}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => onUpdate(s.id, "HIT_TP", i)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium border transition-all duration-200 flex items-center gap-1 ${
                        isHit
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 cursor-default"
                          : "bg-white/[0.03] text-sky-400 border-white/[0.08] hover:bg-sky-500/10 hover:border-sky-500/20"
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      <span className="tabular-nums">TP{i + 1}</span>
                    </motion.button>
                  );
                })}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => onUpdate(s.id, "HIT_SL")}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/[0.06] text-red-400 border border-red-500/15 hover:bg-red-500/10 transition-all duration-200 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>وقف</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => onUpdate(s.id, "MANUAL_CLOSE")}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.03] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.06] transition-all duration-200"
                >
                  إغلاق
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => onDelete(s.id)}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/[0.04] text-red-400/50 border border-red-500/10 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
                >
                  <Trash2 className="w-3 h-3" />
                </motion.button>
              </div>
            </>
          )}
        </div>
      </Glass>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   5. CLOSED SIGNAL CARD — Compact Expandable
   ═══════════════════════════════════════════════════════════════ */
export function ClosedSignalCard({ s, idx, isAdmin, onDelete, statusChanged, isFavorite, onToggleFavorite }: {
  s: Signal; idx: number; isAdmin: boolean; onDelete: (id: string) => void; statusChanged?: boolean;
  isFavorite?: boolean; onToggleFavorite?: (id: string) => void;
}) {
  const isProfit = s.status === "HIT_TP";
  const isLoss = s.status === "HIT_SL";
  const isPartialWin = isProfit && s.partialWin;
  const [expanded, setExpanded] = useState(false);
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;
  const totalTPs = s.totalTPs || s.takeProfits?.length || 0;
  const isBuy = s.type === "BUY";
  const pnl = s.pnlDollars ?? 0;
  const points = s.pnlPoints ?? 0;

  const isReentry = (s.signalCategory || "").startsWith("REENTRY");
  const isPyramid = (s.signalCategory || "").startsWith("PYRAMID");

  const theme = isReentry
    ? { bg: "bg-blue-500/[0.06]", border: "border-blue-500/15", iconBg: "bg-blue-500/15", text: "text-blue-400", badge: "bg-blue-500/15 text-blue-400", tpBadge: "bg-blue-500/10 text-blue-400 border-blue-500/15", accent: "from-blue-400 to-blue-600" }
    : isPyramid
    ? { bg: "bg-purple-500/[0.06]", border: "border-purple-500/15", iconBg: "bg-purple-500/15", text: "text-purple-400", badge: "bg-purple-500/15 text-purple-400", tpBadge: "bg-purple-500/10 text-purple-400 border-purple-500/15", accent: "from-purple-400 to-purple-600" }
    : isProfit
    ? { bg: "bg-emerald-500/[0.06]", border: "border-emerald-500/15", iconBg: "bg-emerald-500/15", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400", tpBadge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", accent: "from-emerald-400 to-emerald-600" }
    : isLoss
    ? { bg: "bg-red-500/[0.06]", border: "border-red-500/15", iconBg: "bg-red-500/15", text: "text-red-400", badge: "bg-red-500/15 text-red-400", tpBadge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", accent: "from-red-400 to-red-600" }
    : { bg: "bg-white/[0.02]", border: "border-white/[0.06]", iconBg: "bg-white/[0.06]", text: "text-muted-foreground", badge: "bg-white/[0.04] text-muted-foreground", tpBadge: "bg-white/[0.04] text-muted-foreground border-white/[0.06]", accent: "from-gray-400 to-gray-600" };

  const catLabel = isReentry ? "تعويض" : isPyramid ? "تعزيز" : catCfg[s.signalCategory]?.label || "مغلقة";
  const catIcon = isReentry ? <RotateCcw className="w-3.5 h-3.5" /> : isPyramid ? <Flame className="w-3.5 h-3.5" /> : isPartialWin ? <Zap className="w-3.5 h-3.5" /> : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx * 0.03 }}
      className={statusChanged ? "animate-status-pulse" : ""}
    >
      <div className={`rounded-2xl border overflow-hidden relative ${theme.bg} ${theme.border} card-transition-premium hover-lift-premium ${isProfit ? "border-r-2 border-r-emerald-400" : isLoss ? "border-r-2 border-r-red-400" : ""}`}>
        {/* Top accent line */}
        <div className={`h-[2px] bg-gradient-to-l ${theme.accent}`} style={{ boxShadow: `0 1px 8px ${isProfit ? 'rgba(16, 185, 129, 0.2)' : isLoss ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)'}` }} />

        {/* Favorite star button */}
        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(s.id); }}
          className="absolute top-2.5 left-2.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: isFavorite ? "rgba(251, 191, 36, 0.15)" : "rgba(255,255,255,0.04)", border: isFavorite ? "1px solid rgba(251, 191, 36, 0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
          <Star className={`w-3.5 h-3.5 ${isFavorite ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"}`} />
        </button>

        {/* Compact Header — Always Visible */}
        <motion.button
          whileTap={{ scale: 0.995 }}
          onClick={() => setExpanded(!expanded)}
          className="w-full text-right hover-lift-premium"
        >
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              {/* Result icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${theme.iconBg} shadow-sm`}>
                {isProfit ? (
                  <CheckCircle2 className={`w-4 h-4 ${theme.text}`} />
                ) : isLoss ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Info className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground text-[13px]">{s.pair}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                  {hitCount > 0 && isProfit && (
                    <span className={`text-[10px] ${theme.badge} px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5`}>
                      {catIcon}{hitCount}/{totalTPs}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {catIcon && <span className={theme.text}>{catIcon}</span>}
                  <span className={`text-[10px] font-medium ${theme.text}/60`}>
                    {isPartialWin ? "ربح جزئي" : catLabel}
                  </span>
                </div>
                {/* TP Progress Bar */}
                {s.totalTPs && s.hitTpIndex > 0 && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground/60">الأهداف المحققة</span>
                      <span className="text-[10px] font-bold text-amber-400">{s.hitTpIndex}/{s.totalTPs}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-all duration-500"
                        style={{ width: `${(s.hitTpIndex / s.totalTPs) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* PnL */}
              <div className={`text-left rounded-lg px-2.5 py-1.5 ${isProfit ? "bg-emerald-500/[0.06]" : isLoss ? "bg-red-500/[0.06]" : ""}`}>
                <div className={`text-lg font-extrabold font-mono tabular-nums ${isProfit ? theme.text : "text-red-400"} ${isProfit ? "drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]" : isLoss ? "drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]" : ""}`} dir="ltr">
                  {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toFixed(2)}
                </div>
                <div className={`text-[10px] font-mono tabular-nums ${isProfit ? theme.text + "/40" : "text-red-400/40"}`} dir="ltr">
                  {points >= 0 ? "+" : ""}{points} نقطة
                </div>
              </div>
              {/* Chevron */}
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
                <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
              </motion.div>
            </div>
          </div>
        </motion.button>

        {/* Expanded Details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/[0.06] mx-3.5" />
              <div className="p-3.5 space-y-3">
                {/* Entry / SL / Hit Price grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.06]">
                    <div className="text-[10px] text-muted-foreground/50 mb-1">الدخول</div>
                    <div className="text-[11px] font-bold font-mono text-foreground tabular-nums" dir="ltr">{s.entry}</div>
                  </div>
                  <div className="bg-red-500/[0.03] rounded-lg p-2.5 border border-red-500/10">
                    <div className="text-[10px] text-red-400/40 mb-1">الوقف</div>
                    <div className="text-[11px] font-bold font-mono text-red-300 tabular-nums" dir="ltr">{s.stopLoss}</div>
                  </div>
                  <div className={`rounded-lg p-2.5 border ${
                    isProfit ? theme.iconBg + " " + theme.border : "bg-red-500/[0.04] border-red-500/10"
                  }`}>
                    <div className="text-[10px] text-muted-foreground/50 mb-1">
                      {isReentry ? "تعويض" : isPyramid ? "تعزيز" : isProfit ? "الهدف" : "الإغلاق"}
                      {hitCount > 0 && totalTPs > 0 && ` (${hitCount}/${totalTPs})`}
                    </div>
                    <div className={`text-[11px] font-bold font-mono ${isProfit ? theme.text : "text-red-400"} tabular-nums`} dir="ltr">
                      {s.hitPrice ?? "—"}
                    </div>
                  </div>
                </div>

                {/* TP Targets */}
                {s.takeProfits?.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-muted-foreground/50 font-medium">الأهداف ({hitCount}/{totalTPs})</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {s.takeProfits.map((tp, i) => {
                        const hit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                        return (
                          <div
                            key={i}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono border tabular-nums ${
                              hit
                                ? theme.tpBadge
                                : "bg-white/[0.02] text-muted-foreground/40 border-white/[0.06] line-through"
                            }`}
                            dir="ltr"
                          >
                            TP{i + 1}: {tp.tp} ({tp.rr.toFixed(1)}R)
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : hitCount > 0 && totalTPs > 0 ? (
                  <div className={`px-3 py-2 rounded-lg border ${theme.tpBadge}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold flex items-center gap-1">
                        {catIcon} {isReentry ? "تعويض" : isPyramid ? "تعزيز" : "هدف"} {hitCount} من {totalTPs}
                      </span>
                      <span className="text-[10px] opacity-60">متبقي {totalTPs - hitCount}</span>
                    </div>
                  </div>
                ) : null}

                {/* Risk Info */}
                {(s.balance || s.lotSize) && (
                  <div className="flex gap-4 text-[10px]">
                    {s.balance && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">الرصيد:</span>
                        <span className="font-mono text-foreground/70 tabular-nums" dir="ltr">${Number(s.balance).toLocaleString()}</span>
                      </div>
                    )}
                    {s.lotSize && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">اللوت:</span>
                        <span className="font-mono text-foreground/70 tabular-nums" dir="ltr">{s.lotSize}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Result banner for closed signals */}
                <TradeStatusBanner s={s} />

                {/* Time + Delete */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(s.createdAt)}
                  </span>
                  {isAdmin && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/[0.04] text-red-400/50 border border-red-500/10 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      حذف
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   6. CANDLE — SVG Candlestick
   ═══════════════════════════════════════════════════════════════ */
export function Candle({ x, bodyH, wickTop, wickBot, isGreen, delay, bodyW }: {
  x: number; bodyH: number; wickTop: number; wickBot: number;
  isGreen: boolean; delay: number; bodyW: number;
}) {
  const bodyY = wickTop;
  const color = isGreen ? "#00E676" : "#FF5252";
  const glowClass = isGreen ? "splash-candle-green" : "splash-candle-red";

  return (
    <g style={{ animationDelay: `${delay}ms` }} className={glowClass}>
      {/* Upper Wick */}
      <rect
        x={x + bodyW / 2 - 1}
        y={0}
        width={2}
        height={wickTop}
        fill={color}
        opacity={0.6}
        rx={1}
        className="splash-wick"
        style={{ animationDelay: `${delay}ms` }}
      />
      {/* Body */}
      <rect
        x={x}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        fill={color}
        rx={3}
        className="splash-candle"
        style={{ animationDelay: `${delay + 100}ms` }}
        opacity={0.85}
      />
      {/* Lower Wick */}
      <rect
        x={x + bodyW / 2 - 1}
        y={bodyY + bodyH}
        width={2}
        height={wickBot}
        fill={color}
        opacity={0.6}
        rx={1}
        className="splash-wick"
        style={{ animationDelay: `${delay + 200}ms` }}
      />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════
   7. SPLASH SCREEN
   ═══════════════════════════════════════════════════════════════ */
export function SplashScreen() {
  const [tipIndex, setTipIndex] = useState(0);
  const [loadStatus, setLoadStatus] = useState(0);
  const tips = [
    "تتبع إشاراتك في الوقت الحقيقي",
    "إدارة المخاطر هي مفتاح النجاح",
    "لا تتجاوز 2% من رصيدك في صفقة واحدة",
  ];
  const statusTexts = [
    "جاري الاتصال بالخادم...",
    "جاري تحميل البيانات...",
    "جاري تجهيز الواجهة...",
  ];

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % tips.length);
    }, 2500);
    const statusInterval = setInterval(() => {
      setLoadStatus(prev => (prev + 1) % statusTexts.length);
    }, 1200);
    return () => { clearInterval(tipInterval); clearInterval(statusInterval); };
  }, [tips.length, statusTexts.length]);

  const candles: [number, number, number, number, boolean, number][] = [
    [10,  45, 20, 30, true,  0],
    [32,  35, 15, 25, true,  120],
    [54,  55, 25, 20, false, 240],
    [76,  40, 18, 22, true,  360],
    [98,  60, 30, 15, true,  480],
    [120, 30, 12, 35, false, 600],
    [142, 50, 22, 18, true,  720],
    [164, 38, 16, 28, false, 840],
    [186, 65, 28, 12, true,  960],
    [208, 42, 20, 24, true,  1080],
    [230, 55, 25, 20, false, 1200],
    [252, 48, 22, 26, true,  1320],
  ];

  const sparkles = [
    { x: 60, y: 30, delay: 500, size: 4 },
    { x: 180, y: 20, delay: 1200, size: 3 },
    { x: 130, y: 50, delay: 1800, size: 5 },
    { x: 240, y: 15, delay: 2400, size: 3 },
    { x: 30, y: 55, delay: 800, size: 4 },
    { x: 210, y: 60, delay: 1500, size: 3 },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #050a15 0%, #0a1628 50%, #070b14 100%)" }}
    >
      {/* Ambient glows */}
      <div
        className="absolute top-[-15%] right-[-10%] w-80 h-80 rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(60px)" }}
      />
      <div
        className="absolute bottom-[-10%] left-[-10%] w-72 h-72 rounded-full opacity-[0.04]"
        style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(60px)" }}
      />
      <div
        className="absolute top-[30%] left-[50%] w-60 h-60 rounded-full opacity-[0.03]"
        style={{ background: "radial-gradient(circle, #FF5252 0%, transparent 70%)", filter: "blur(80px)", transform: "translateX(-50%)" }}
      />

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={`p-${i}`}
          className="absolute w-1 h-1 rounded-full"
          style={{
            background: i % 2 === 0 ? "#FFD700" : "#00E676",
            left: `${15 + i * 14}%`,
            bottom: "10%",
            opacity: 0,
            animation: `floatParticles ${3 + i * 0.5}s ease-in-out ${i * 0.7}s infinite`,
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[400px] px-6">
        {/* Logo with crown */}
        <div className="splash-logo relative mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
            style={{
              background: "linear-gradient(135deg, #FFD700 0%, #FF8F00 100%)",
              boxShadow: "0 0 30px rgba(255, 215, 0, 0.2), 0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <Crown className="w-10 h-10" style={{ color: "#070b14" }} />
          </div>
          {/* Pulse ring */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              border: "2px solid rgba(255, 215, 0, 0.3)",
              animation: "gentlePulse 2s ease-in-out infinite",
            }}
          />
        </div>

        {/* App name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-2"
        >
          <h1
            className="text-3xl font-extrabold tracking-wider text-center"
            style={{
              background: "linear-gradient(135deg, #FFD700 0%, #FFFFFF 50%, #FFD700 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "shimmer 3s linear infinite",
            }}
          >
            ForexYemeni
          </h1>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mb-10"
        >
          <p className="text-xs font-semibold tracking-[0.3em] text-center" style={{ color: "rgba(255, 215, 0, 0.6)" }}>
            ForexYemeni Signals
          </p>
        </motion.div>

        {/* Candlestick chart card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="w-full"
        >
          <div
            className="relative w-full rounded-2xl p-4 pb-5 overflow-hidden"
            style={{
              background: "rgba(10, 18, 40, 0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 215, 0, 0.06)",
              boxShadow: "0 0 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.02)",
            }}
          >
            {/* Chart header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px rgba(0, 230, 118, 0.4)" }} />
                <span className="text-[10px] font-bold text-emerald-400">LIVE</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-white/70">XAUUSD</span>
                <span className="text-[10px] font-mono font-bold text-emerald-400 tabular-nums">+2.34%</span>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="relative w-full" style={{ height: "140px" }}>
              {/* Grid lines */}
              {[20, 50, 80, 110].map((y, i) => (
                <div
                  key={`gl-${i}`}
                  className="absolute left-0 right-0"
                  style={{
                    top: `${y}px`,
                    height: "1px",
                    background: "rgba(255, 255, 255, 0.025)",
                    animation: `gridLineMove ${3 + i}s ease-in-out ${i * 0.5}s infinite`,
                  }}
                />
              ))}

              {/* Price labels */}
              <div className="absolute left-1 top-3 text-[10px] font-mono text-white/15 tabular-nums">2,450</div>
              <div className="absolute left-1 top-[42px] text-[10px] font-mono text-white/15 tabular-nums">2,445</div>
              <div className="absolute left-1 top-[72px] text-[10px] font-mono text-white/15 tabular-nums">2,440</div>
              <div className="absolute left-1 top-[102px] text-[10px] font-mono text-white/15 tabular-nums">2,435</div>

              {/* Candlesticks */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 290 140"
                preserveAspectRatio="xMidYMid meet"
              >
                {candles.map(([cx, bh, wt, wb, green, del], i) => (
                  <Candle
                    key={i}
                    x={cx + 30}
                    bodyH={bh}
                    wickTop={wt}
                    wickBot={wb}
                    isGreen={green}
                    delay={del}
                    bodyW={16}
                  />
                ))}
                {/* MA line */}
                <polyline
                  points="45,75 67,70 89,85 111,72 133,65 155,80 177,68 199,82 221,60 243,70 265,75"
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Sparkles */}
              {sparkles.map((sp, i) => (
                <div
                  key={`sp-${i}`}
                  className="absolute splash-sparkle"
                  style={{
                    left: `${sp.x}px`,
                    top: `${sp.y}px`,
                    width: `${sp.size}px`,
                    height: `${sp.size}px`,
                    background: "#FFD700",
                    borderRadius: "50%",
                    animationDelay: `${sp.delay}ms`,
                    boxShadow: `0 0 ${sp.size * 2}px rgba(255, 215, 0, 0.5)`,
                  }}
                />
              ))}

              {/* Price line */}
              <div
                className="absolute right-3"
                style={{
                  top: "55px",
                  height: "1px",
                  width: "60%",
                  background: "linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.15) 30%, rgba(255, 215, 0, 0.15) 70%, transparent)",
                }}
              />
              <div
                className="absolute right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums"
                style={{
                  top: "51px",
                  background: "#FFD700",
                  color: "#070b14",
                  boxShadow: "0 0 10px rgba(255, 215, 0, 0.25)",
                }}
              >
                2,438.50
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="grid grid-cols-3 gap-3 mt-4"
        >
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums" style={{ color: "#FFD700" }}>150+</div>
            <div className="text-[10px]" style={{ color: "rgba(255,215,0,0.4)" }}>إشارة</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums" style={{ color: "#00E676" }}>78%</div>
            <div className="text-[10px]" style={{ color: "rgba(0,230,118,0.4)" }}>نسبة نجاح</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: "#06b6d4" }}>VIP</div>
            <div className="text-[10px]" style={{ color: "rgba(6,182,212,0.4)" }}>عضوية</div>
          </div>
        </motion.div>

        {/* Rotating tips + progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="w-full mt-8 space-y-3"
        >
          {/* Rotating tips */}
          <div className="h-5 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="text-[10px] font-medium"
                style={{ color: "rgba(255, 215, 0, 0.6)" }}
              >
                💡 {tips[tipIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar with shimmer */}
          <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255, 215, 0, 0.08)" }}>
            <div className="splash-progress-bar h-full rounded-full" style={{ width: "0%" }} />
          </div>

          {/* Loading status */}
          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#FFD700",
                    opacity: 0.2,
                    animation: `gentlePulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                  }}
                />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.span
                key={loadStatus}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-[10px]"
                style={{ color: "rgba(255, 255, 255, 0.3)" }}
              >
                {statusTexts[loadStatus]}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
