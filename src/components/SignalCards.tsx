"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Star, Target, ShieldAlert, Clock,
  Activity, Zap, DollarSign, AlertTriangle, Trash2, Loader2,
  BarChart3, Crown, CheckCircle, XCircle, ChevronDown, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Hash, Timer, Eye, EyeOff,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Signal, SignalCategory, TakeProfit, AdminSession, Stats } from "@/lib/types";
import { timeAgo, isEntry, entryAccent, isTpLike, isSlLike, formatCountdown } from "@/lib/utils";
import { Stars, Glass, Div, useOnlineStatus } from "@/components/shared";

const catCfg: Record<SignalCategory, { label: string; accent: string; border: string }> = {
  ENTRY: { label: "إشارة دخول", accent: "", border: "" },
  TP_HIT: { label: "هدف محقق", accent: "from-sky-400 to-blue-600", border: "border-sky-500/20" },
  SL_HIT: { label: "وقف محقق", accent: "from-red-400 to-red-600", border: "border-red-500/20" },
  REENTRY: { label: "إعادة دخول", accent: "from-cyan-400 to-cyan-600", border: "border-cyan-500/20" },
  REENTRY_TP: { label: "تعويض - هدف", accent: "from-cyan-400 to-blue-500", border: "border-cyan-500/20" },
  REENTRY_SL: { label: "تعويض - وقف", accent: "from-cyan-400 to-red-500", border: "border-cyan-500/20" },
  PYRAMID: { label: "تدرج", accent: "from-purple-400 to-purple-600", border: "border-purple-500/20" },
  PYRAMID_TP: { label: "تدرج - هدف", accent: "from-purple-400 to-blue-500", border: "border-purple-500/20" },
  PYRAMID_SL: { label: "تدرج - وقف", accent: "from-purple-400 to-red-500", border: "border-purple-500/20" },
};

/* ── Tp Mini Card ── */
function TpMiniCard({ tp, index, isHit, isLastHit, entry, type }: {
  tp: TakeProfit; index: number; isHit: boolean; isLastHit: boolean; entry: number; type: "BUY" | "SELL";
}) {
  const [expanded, setExpanded] = useState(false);
  const diff = Math.abs(tp.tp - entry).toFixed(1);
  const direction = (type === "BUY" && tp.tp > entry) || (type === "SELL" && tp.tp < entry) ? "+" : "";
  const pctFromEntry = ((Math.abs(tp.tp - entry) / entry) * 100).toFixed(3);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-right transition-all duration-300 active:scale-[0.98] rounded-xl border ${
          isHit
            ? `bg-gradient-to-br from-emerald-500/[0.12] to-emerald-600/[0.06] border-emerald-500/30 ${isLastHit ? "animate-glow-pulse animate-tp-hit-pulse" : ""}`
            : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border"
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2.5">
            {isHit ? (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center animate-check-pop">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground font-bold">{index + 1}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold font-mono ${isHit ? "text-emerald-300" : "text-foreground/80"}`}>{tp.tp}</span>
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-md ${isHit ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/60 text-muted-foreground"}`}>
                  {direction}{diff}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg ${isHit ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/[0.08] text-amber-400/70"}`}>
              {tp.rr.toFixed(2)}
            </div>
            {!isHit && (
              <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
            {isHit && (
              <svg className={`w-3.5 h-3.5 text-emerald-500/60 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="tp-expand-enter mt-1 mx-2 mb-1 p-3 rounded-xl bg-muted/30 border border-border space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex justify-between"><span className="text-muted-foreground">سعر الهدف</span><span className="font-mono font-bold text-foreground">{tp.tp}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">المسافة</span><span className="font-mono text-foreground/80">{direction}{diff} نقطة</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">R:R</span><span className="font-mono font-semibold text-amber-400">{tp.rr.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">نسبة التحرك</span><span className="font-mono text-foreground/80">{pctFromEntry}%</span></div>
          </div>
          {isHit && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-emerald-500/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-semibold">تم تحقيق الهدف بنجاح</span>
            </div>
          )}
          {!isHit && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-border">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span className="text-[10px] text-muted-foreground">في انتظار التحقيق</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Trade Status Banner ── */
function TradeStatusBanner({ s }: { s: Signal }) {
  const isProfit = s.status === "HIT_TP";
  const isLoss = s.status === "HIT_SL";
  const isManual = s.status === "MANUAL_CLOSE";
  const isPartialWin = isProfit && s.partialWin;
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;
  const totalTPs = s.totalTPs || s.takeProfits?.length || 0;
  const isReentry = (s.signalCategory || "").startsWith("REENTRY");
  const isPyramid = (s.signalCategory || "").startsWith("PYRAMID");
  if (s.status === "ACTIVE") return null;

  const c = isReentry
    ? { bg: "bg-gradient-to-br from-cyan-500/[0.1] to-cyan-600/[0.04] border-cyan-500/25 animate-profit-glow", iconBg: "bg-cyan-500/20", text: "text-cyan-400", badge: "bg-cyan-500/20 text-cyan-400", pill: "text-cyan-400/70 bg-cyan-500/10", sub: "text-cyan-400/60" }
    : isPyramid
    ? { bg: "bg-gradient-to-br from-purple-500/[0.1] to-purple-600/[0.04] border-purple-500/25 animate-profit-glow", iconBg: "bg-purple-500/20", text: "text-purple-400", badge: "bg-purple-500/20 text-purple-400", pill: "text-purple-400/70 bg-purple-500/10", sub: "text-purple-400/60" }
    : isProfit
    ? { bg: "bg-gradient-to-br from-emerald-500/[0.1] to-emerald-600/[0.04] border-emerald-500/25 animate-profit-glow", iconBg: "bg-emerald-500/20", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-400", pill: "text-emerald-400/70 bg-emerald-500/10", sub: "text-emerald-400/60" }
    : isLoss
    ? { bg: "bg-gradient-to-br from-red-500/[0.1] to-red-600/[0.04] border-red-500/25 animate-loss-glow", iconBg: "bg-red-500/20", text: "text-red-400", badge: "bg-red-500/20 text-red-400", pill: "text-red-400/70 bg-red-500/10", sub: "text-red-400/60" }
    : { bg: "bg-muted/50 border-border", iconBg: "bg-slate-500/20", text: "text-muted-foreground", badge: "bg-muted text-muted-foreground", pill: "text-muted-foreground/70 bg-muted/80", sub: "text-muted-foreground/60" };
  const catIcon = isReentry ? "♻️" : isPyramid ? "🔥" : "";
  const catLabel = isReentry ? "تعويض" : isPyramid ? "تعزيز" : "";

  return (
    <div className={`mt-2.5 rounded-xl p-3 border ${c.bg}`}>
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
          {isProfit && (
            <svg className={`w-4 h-4 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isLoss && (
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {isManual && (
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${c.text}`}>
              {catIcon && `${catIcon} `}{isPartialWin ? (catLabel ? `${catLabel} ربح جزئي` : "ربح جزئي") : isProfit ? (catLabel ? `${catLabel} رابح` : "صفقة رابحة") : isLoss ? (isReentry ? "تعويض خاسر" : isPyramid ? "تعزيز خاسر" : "صفقة خاسرة") : "صفقة مغلقة يدويا"}
            </span>
            {isProfit && hitCount > 0 && totalTPs > 0 && (
              <span className={`text-[9px] ${c.badge} px-1.5 py-0.5 rounded-md font-bold`}>
                {catIcon} {hitCount}/{totalTPs} {catLabel || "أهداف"}
              </span>
            )}
          </div>
          {isProfit && (s.pnlDollars ?? 0) !== 0 && (
            <div className={`text-[11px] font-mono font-bold ${c.text} mt-0.5`}>
              {s.pnlDollars! >= 0 ? "+" : ""}{s.pnlDollars}{" "}
              <span className={`text-[9px] font-normal ${c.sub}`}>({s.pnlPoints! >= 0 ? "+" : ""}{s.pnlPoints ?? 0} نقطة)</span>
            </div>
          )}
          {isLoss && (s.pnlDollars ?? 0) !== 0 && (
            <div className="text-[11px] font-mono font-bold text-red-400 mt-0.5">
              -${Math.abs(s.pnlDollars ?? 0)}{" "}
              <span className="text-[9px] font-normal text-red-400/60">({s.pnlPoints ?? 0} نقطة)</span>
            </div>
          )}
          {isManual && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              تم إغلاق الصفقة يدويا
              {hitCount > 0 && ` بعد تحقيق ${hitCount} هدف`}
            </div>
          )}
        </div>
        {isProfit && (
          <div className={`text-[10px] font-bold ${c.pill} px-2 py-1 rounded-lg flex-shrink-0`}>
            {isPartialWin ? "ربح جزئي" : "ربح"}
          </div>
        )}
        {isLoss && (
          <div className="text-[10px] font-bold text-red-400/70 bg-red-500/10 px-2 py-1 rounded-lg flex-shrink-0">
            خسارة
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Entry Card (Professional) ── */
function EntryCard({ s, idx, isAdmin, onUpdate, onDelete, isNew, statusChanged }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
  isNew?: boolean;
  statusChanged?: boolean;
}) {
  const ac = entryAccent(s);
  const isBuy = s.type === "BUY";
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => setElapsed(formatCountdown(s.createdAt));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [s.createdAt]);
  const isOnline = useOnlineStatus();
  const typeLabel = s.signalCategory === "REENTRY" ? "إعادة دخول" : s.signalCategory === "PYRAMID" ? "تدرج" : isBuy ? "شراء" : "بيع";
  const isClosed = s.status !== "ACTIVE";
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;

  return (
    <div className={`${isNew ? "animate-slide-in-right" : "animate-[fadeInUp_0.35s_ease-out]"} ${statusChanged ? "animate-status-pulse" : ""}`} style={!isNew ? { animationDelay: `${idx * 40}ms`, animationFillMode: "both" } : undefined}>
      <Glass className={`overflow-hidden ${ac.border} transition-all duration-300 ${isClosed ? "opacity-80" : ""}`}>
        {/* Top gradient accent bar */}
        <div className={`h-[3px] bg-gradient-to-l ${ac.accent}`} />

        <div className="p-4 space-y-3">
          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ac.bg} shadow-lg`}>
                {isBuy ? <TrendingUp className={`w-[18px] h-[18px] ${ac.text}`} /> : <TrendingDown className={`w-[18px] h-[18px] ${ac.text}`} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-online-pulse" : "bg-red-400"}`} />
                  <span className="font-extrabold text-foreground text-[15px] tracking-wide">{s.pair}</span>
                  <div className="flex items-center gap-1">
                    {s.type === "BUY" ? (
                      <svg width="32" height="16" viewBox="0 0 32 16" className="opacity-40">
                        <path d="M2 14 L16 4 L24 8 L30 2" stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M24 2 L30 2 L30 8" stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="32" height="16" viewBox="0 0 32 16" className="opacity-40">
                        <path d="M2 2 L16 12 L24 8 L30 14" stroke="#ef4444" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M24 14 L30 14 L30 8" stroke="#ef4444" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {s.timeframe && <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md font-medium">{s.timeframe}</span>}
                  {s.htfTimeframe && <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md font-medium">{s.htfTimeframe}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{typeLabel}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <Badge className={`${ac.bg} ${ac.text} border ${ac.border} text-[9px] font-bold px-2 py-0`}>{typeLabel}</Badge>
                {s.status === "ACTIVE" && (
                  <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 active-pulse-ring" />
                    <span className="text-[8px] text-emerald-400 font-semibold">نشطة</span>
                  </div>
                )}
                {isClosed && (
                  <Badge className={`${s.status === "HIT_TP" ? "bg-emerald-500/10 text-emerald-400" : s.status === "HIT_SL" ? "bg-red-500/10 text-red-400" : "bg-muted/80 text-muted-foreground"} border-0 text-[8px] font-semibold px-2`}>
                    {s.status === "HIT_TP" ? "مغلقة بربح" : s.status === "HIT_SL" ? "مغلقة بخسارة" : "مغلقة"}
                  </Badge>
                )}
              </div>
              {s.confidence > 0 && <Stars r={s.confidence} />}
            </div>
          </div>

          {/* ── Time ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {s.status === "ACTIVE" && (
                <>
                  <div className="flex items-center gap-1">
                    <Radio className="w-3 h-3 text-emerald-400/50 animate-pulse" />
                    <span className="text-[9px] text-emerald-400/60">مباشر</span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <Timer className="w-2.5 h-2.5" />
                    <span>{elapsed}</span>
                  </div>
                </>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" />{elapsed || timeAgo(s.createdAt)}</span>
          </div>

          {/* ── Entry / SL Price Boxes ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl p-3 border transition-all duration-300 ${isBuy ? "bg-gradient-to-br from-emerald-500/[0.06] to-emerald-600/[0.02] border-emerald-500/15" : "bg-gradient-to-br from-red-500/[0.06] to-red-600/[0.02] border-red-500/15"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity className={`w-3 h-3 ${isBuy ? "text-emerald-400" : "text-red-400"}`} />
                <span className="text-[9px] text-muted-foreground font-medium">سعر الدخول</span>
              </div>
              <div className={`text-[15px] font-extrabold font-mono ${isBuy ? "text-emerald-300" : "text-red-300"}`}>{s.entry}</div>
            </div>
            <div className="bg-gradient-to-br from-red-500/[0.06] to-red-600/[0.02] rounded-xl p-3 border border-red-500/15">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldAlert className="w-3 h-3 text-red-400" />
                <span className="text-[9px] text-red-300 font-medium">وقف الخسارة</span>
              </div>
              <div className="text-[15px] font-extrabold font-mono text-red-400">{s.stopLoss}</div>
              <div className="text-[8px] text-muted-foreground mt-1 font-mono">{s.slDistance || Math.abs(s.entry - s.stopLoss).toFixed(1)} نقطة</div>
            </div>
          </div>

          {/* ── Risk Management ── */}
          {(s.balance || s.lotSize || s.riskTarget) && (
            <>
              <Div />
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold text-foreground/80">إدارة المخاطر</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {s.balance && <div className="flex items-center justify-between"><span className="text-muted-foreground">الرصيد</span><span className="font-mono text-foreground font-semibold">${Number(s.balance).toLocaleString()}</span></div>}
                {s.lotSize && <div className="flex items-center justify-between"><span className="text-muted-foreground">اللوت</span><span className="font-mono text-foreground font-semibold">{s.lotSize}</span></div>}
                {s.riskTarget && <div className="flex items-center justify-between"><span className="text-muted-foreground">الخطر</span><span className="font-mono text-foreground">${s.riskTarget}{s.riskPercent ? ` (${s.riskPercent}%)` : ""}</span></div>}
                {s.actualRisk && <div className="flex items-center justify-between"><span className="text-muted-foreground">فعلي</span><span className="font-mono text-foreground">${s.actualRisk}{s.actualRiskPct ? ` (${s.actualRiskPct}%)` : ""}</span></div>}
                {s.maxRR && <div className="flex items-center justify-between"><span className="text-muted-foreground">R:R أقصى</span><span className="font-mono text-amber-400 font-bold">1:{s.maxRR}</span></div>}
                {s.instrument && <div className="flex items-center justify-between"><span className="text-muted-foreground">الأداة</span><span className="text-foreground">{s.instrument}</span></div>}
              </div>
            </>
          )}

          {/* ── TP Targets (Clickable Cards) ── */}
          {s.takeProfits?.length > 0 && (
            <>
              <Div />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] text-foreground/80 font-bold">الأهداف</span>
                  {hitCount > 0 && (
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-md font-bold ml-1">
                      {hitCount}/{s.takeProfits.length}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground font-mono">R:R</span>
              </div>
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
            </>
          )}

          {/* ── HTF/SMC Trends ── */}
          {(s.htfTrend || s.smcTrend) && (
            <>
              <Div />
              <div className="flex items-center gap-3 text-[11px]">
                {s.htfTrend && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{s.htfTimeframe || "HTF"}:</span>
                    <span className={`font-semibold ${s.htfTrend === "صاعد" ? "text-emerald-400" : s.htfTrend === "هابط" ? "text-red-400" : "text-muted-foreground"}`}>
                      {s.htfTrend}{s.htfTrend === "صاعد" ? " 🐂" : s.htfTrend === "هابط" ? " 🐻" : ""}
                    </span>
                  </div>
                )}
                {s.smcTrend && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">SMC:</span>
                    <span className={`font-semibold ${s.smcTrend === "صاعد" ? "text-emerald-400" : s.smcTrend === "هابط" ? "text-red-400" : "text-muted-foreground"}`}>{s.smcTrend}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Trade Close Status Banner ── */}
          <TradeStatusBanner s={s} />

          {/* ── Trade Progress Bar (for active signals with TPs) ── */}
          {s.status === "ACTIVE" && s.takeProfits && s.takeProfits.length > 0 && (
            <div className="mt-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                {s.takeProfits.map((tp, i) => {
                  const isHit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                  return (
                    <div
                      key={i}
                      className={`h-full transition-all duration-500 ${i === 0 ? "rounded-r-full" : ""} ${i === s.takeProfits.length - 1 ? "rounded-l-full" : ""} ${
                        isHit ? "bg-emerald-500" : "bg-muted"
                      }`}
                      style={{ width: `${100 / s.takeProfits.length}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[8px] text-emerald-400 font-semibold">{hitCount}/{s.takeProfits.length} أهداف</span>
                <span className="text-[8px] text-red-400/60 font-medium">SL</span>
              </div>
            </div>
          )}

          {/* ── Admin Actions ── */}
          {isAdmin && s.status === "ACTIVE" && (
            <>
              <Div />
              <div className="flex flex-wrap gap-1.5">
                {s.takeProfits?.map((_, i) => (
                  <button key={i} onClick={() => onUpdate(s.id, "HIT_TP", i)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform hover:bg-sky-500/20">TP{i + 1} ✅</button>
                ))}
                <button onClick={() => onUpdate(s.id, "HIT_SL")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform hover:bg-red-500/20">وقف ❌</button>
                <button onClick={() => onUpdate(s.id, "MANUAL_CLOSE")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border active:scale-95 transition-transform hover:bg-muted/80">إغلاق</button>
                <button onClick={() => onDelete(s.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform hover:bg-red-500/10">🗑</button>
              </div>
            </>
          )}
        </div>
      </Glass>
    </div>
  );
}

/* ── Closed Signal Compact Card (click to expand) ── */
function ClosedSignalCard({ s, idx, isAdmin, onDelete, statusChanged }: { s: Signal; idx: number; isAdmin: boolean; onDelete: (id: string) => void; statusChanged?: boolean }) {
  const isProfit = s.status === "HIT_TP";
  const isLoss = s.status === "HIT_SL";
  const isPartialWin = isProfit && s.partialWin;
  const [expanded, setExpanded] = useState(false);
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;
  const totalTPs = s.totalTPs || s.takeProfits?.length || 0;  const isBuy = s.type === "BUY";
  const catLabel = catCfg[s.signalCategory]?.label || "مغلقة";
  const pnl = s.pnlDollars ?? 0;
  const points = s.pnlPoints ?? 0;

  // Category-specific color theme
  const isReentry = (s.signalCategory || "").startsWith("REENTRY");
  const isPyramid = (s.signalCategory || "").startsWith("PYRAMID");
  const catColors = isReentry
    ? { bg: "bg-gradient-to-r from-cyan-500/[0.08] to-cyan-600/[0.03]", border: "border-cyan-500/20", iconBg: "bg-cyan-500/15", text: "text-cyan-400", badge: "bg-cyan-500/20 text-cyan-400", tpBadge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" }
    : isPyramid
    ? { bg: "bg-gradient-to-r from-purple-500/[0.08] to-purple-600/[0.03]", border: "border-purple-500/20", iconBg: "bg-purple-500/15", text: "text-purple-400", badge: "bg-purple-500/20 text-purple-400", tpBadge: "bg-purple-500/15 text-purple-400 border-purple-500/20" }
    : isProfit
    ? { bg: "bg-gradient-to-r from-emerald-500/[0.08] to-emerald-600/[0.03]", border: "border-emerald-500/20", iconBg: "bg-emerald-500/15", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-400", tpBadge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" }
    : isLoss
    ? { bg: "bg-gradient-to-r from-red-500/[0.08] to-red-600/[0.03]", border: "border-red-500/20", iconBg: "bg-red-500/15", text: "text-red-400", badge: "bg-red-500/20 text-red-400", tpBadge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" }
    : { bg: "bg-muted/50", border: "border-border", iconBg: "bg-muted", text: "text-muted-foreground", badge: "bg-muted text-muted-foreground", tpBadge: "bg-muted/80 text-muted-foreground border-border" };
  const catIcon = isReentry ? "♻️" : isPyramid ? "🔥" : isPartialWin ? "⚡" : isProfit ? "✅" : isLoss ? "❌" : "⊘";

  return (
    <div className={`${statusChanged ? "animate-status-pulse " : ""}animate-[fadeInUp_0.3s_ease-out]`} style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}>
      <div className={`rounded-xl border overflow-hidden transition-all duration-300 active:scale-[0.99] ${catColors.bg} ${catColors.border}`}>
        {/* Compact Header - Always Visible */}
        <button onClick={() => setExpanded(!expanded)} className="w-full text-right">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {/* Result icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${catColors.iconBg}`}>
                {isProfit ? (
                  <svg className={`w-4 h-4 ${catColors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : isLoss ? (
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground text-[13px]">{s.pair}</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{isBuy ? "BUY" : "SELL"}</span>
                  {hitCount > 0 && isProfit && (
                    <span className={`text-[8px] ${catColors.badge} px-1.5 py-0.5 rounded-md font-bold`}>{hitCount}/{totalTPs} {isReentry ? "♻️" : isPyramid ? "🔥" : "TP"}</span>
                  )}
                </div>
                <span className={`text-[9px] font-medium ${catColors.text}/70`}>{catIcon} {isPartialWin ? "ربح جزئي" : catLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {/* PnL badge */}
              <div className="text-right">
                <div className={`text-[13px] font-extrabold font-mono ${isProfit ? catColors.text : "text-red-400"}`}>
                  {pnl >= 0 ? "+" : "-"}${Math.abs(pnl)}
                </div>
                <div className={`text-[8px] font-mono ${isProfit ? catColors.text + "/50" : "text-red-400/50"}`}>{points >= 0 ? "+" : ""}{points} نقطة</div>
              </div>
              {/* Chevron */}
              <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>

        {/* Expanded Details */}
        {expanded && (
          <div className="tp-expand-enter">
            <div className="border-t border-border mx-3" />
            <div className="p-3 space-y-2.5">
              {/* Entry / SL / Hit Price */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/50 rounded-lg p-2 border border-border">
                  <div className="text-[8px] text-muted-foreground mb-0.5">الدخول</div>
                  <div className="text-[11px] font-bold font-mono text-foreground">{s.entry}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 border border-border">
                  <div className="text-[8px] text-muted-foreground mb-0.5">الوقف</div>
                  <div className="text-[11px] font-bold font-mono text-red-300">{s.stopLoss}</div>
                </div>
                <div className={`rounded-lg p-2 border ${isProfit ? catColors.iconBg + " " + catColors.border : "bg-red-500/[0.06] border-red-500/10"}`}>
                  <div className="text-[8px] text-muted-foreground mb-0.5">{isReentry ? "تعويض" : isPyramid ? "تعزيز" : isProfit ? "الهدف" : "الإغلاق"} {hitCount > 0 && totalTPs > 0 ? `(${hitCount}/${totalTPs})` : ""}</div>
                  <div className={`text-[11px] font-bold font-mono ${isProfit ? catColors.text : "text-red-400"}`}>{s.hitPrice ?? "—"}</div>
                </div>
              </div>

              {/* TP Targets or hit info for standalone TP/SL alerts */}
              {s.takeProfits?.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[9px] text-muted-foreground font-medium">الأهداف ({hitCount}/{totalTPs})</div>
                  <div className="flex gap-1 flex-wrap">
                    {s.takeProfits.map((tp, i) => {
                      const hit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                      return (
                        <div key={i} className={`px-2 py-1 rounded-lg text-[9px] font-mono border ${hit ? catColors.tpBadge : "bg-muted/30 text-muted-foreground border-border line-through opacity-50"}`}>
                          TP{i+1}: {tp.tp} ({tp.rr.toFixed(1)}R)
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : hitCount > 0 && totalTPs > 0 ? (
                <div className={`px-3 py-2 rounded-lg border ${catColors.tpBadge}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold">{catIcon} {isReentry ? "تعويض" : isPyramid ? "تعزيز" : "هدف"} {hitCount} من {totalTPs}</span>
                    <span className="text-[9px] opacity-70">متبقي {totalTPs - hitCount}</span>
                  </div>
                </div>
              ) : null}

              {/* Risk Info */}
              {(s.balance || s.lotSize) && (
                <div className="flex gap-3 text-[9px]">
                  {s.balance && <div className="flex items-center gap-1"><span className="text-muted-foreground">الرصيد:</span><span className="font-mono text-foreground/80">${Number(s.balance).toLocaleString()}</span></div>}
                  {s.lotSize && <div className="flex items-center gap-1"><span className="text-muted-foreground">اللوت:</span><span className="font-mono text-foreground/80">{s.lotSize}</span></div>}
                </div>
              )}

              {/* Time + Delete */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{timeAgo(s.createdAt)}</span>
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} className="px-2 py-1 rounded-lg text-[9px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">🗑 حذف</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFESSIONAL CANDLESTICK SPLASH SCREEN
   ═══════════════════════════════════════════════════════════════ */

/* Individual Candlestick Component */
function Candle({ x, bodyH, wickTop, wickBot, isGreen, delay, bodyW }: {
  x: number; bodyH: number; wickTop: number; wickBot: number;
  isGreen: boolean; delay: number; bodyW: number;
}) {
  const totalH = wickTop + bodyH + wickBot;
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
        opacity={0.7}
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
        rx={2.5}
        className="splash-candle"
        style={{ animationDelay: `${delay + 100}ms` }}
        opacity={0.9}
      />
      {/* Lower Wick */}
      <rect
        x={x + bodyW / 2 - 1}
        y={bodyY + bodyH}
        width={2}
        height={wickBot}
        fill={color}
        opacity={0.7}
        rx={1}
        className="splash-wick"
        style={{ animationDelay: `${delay + 200}ms` }}
      />
    </g>
  );
}

function SplashScreen() {
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
    }, 2000);
    const statusInterval = setInterval(() => {
      setLoadStatus(prev => (prev + 1) % statusTexts.length);
    }, 1000);
    return () => { clearInterval(tipInterval); clearInterval(statusInterval); };
  }, [tips.length, statusTexts.length]);
  /* Candlestick data: [x_offset, bodyHeight, wickTop, wickBottom, isGreen, delay] */
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

  /* Sparkle positions around the chart */
  const sparkles = [
    { x: 60, y: 30, delay: 500, size: 4 },
    { x: 180, y: 20, delay: 1200, size: 3 },
    { x: 130, y: 50, delay: 1800, size: 5 },
    { x: 240, y: 15, delay: 2400, size: 3 },
    { x: 30, y: 55, delay: 800, size: 4 },
    { x: 210, y: 60, delay: 1500, size: 3 },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(180deg, #050a15 0%, #0a1628 50%, #070b14 100%)" }}>
      {/* Background ambient glows */}
      <div className="absolute top-[-15%] right-[-10%] w-80 h-80 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(60px)" }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(60px)" }} />
      <div className="absolute top-[30%] left-[50%] w-60 h-60 rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #FF5252 0%, transparent 70%)", filter: "blur(80px)", transform: "translateX(-50%)" }} />

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

      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[400px] px-6">
        {/* Logo */}
        <div className="splash-logo w-20 h-20 rounded-2xl flex items-center justify-center mb-8" style={{ background: "linear-gradient(135deg, #FFD700 0%, #FF8F00 100%)", boxShadow: "0 0 30px rgba(255, 215, 0, 0.2), 0 8px 32px rgba(0,0,0,0.4)" }}>
          <svg className="w-10 h-10" style={{ color: "#070b14" }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
          </svg>
        </div>

        {/* App Name */}
        <div className="splash-text-anim mb-2" style={{ animationDelay: "200ms" }}>
          <h1 className="text-3xl font-extrabold tracking-wider text-center" style={{ background: "linear-gradient(135deg, #FFD700 0%, #FFFFFF 50%, #FFD700 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>
            ForexYemeni
          </h1>
        </div>
        <div className="splash-text-anim mb-10" style={{ animationDelay: "400ms" }}>
          <p className="text-xs font-semibold tracking-[0.3em] text-center" style={{ color: "#FFD700", opacity: 0.7 }}>
            VIP TRADING SIGNALS
          </p>
        </div>

        {/* Candlestick Chart */}
        <div className="splash-text-anim w-full" style={{ animationDelay: "500ms" }}>
          <div className="relative w-full rounded-2xl p-4 pb-5 overflow-hidden" style={{ background: "rgba(10, 18, 40, 0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 215, 0, 0.08)", boxShadow: "0 0 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)" }}>
            {/* Chart header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px rgba(0, 230, 118, 0.5)" }} />
                <span className="text-[10px] font-bold text-emerald-400">LIVE</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-white/80">XAUUSD</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: "#00E676" }}>+2.34%</span>
              </div>
            </div>

            {/* SVG Candlestick Chart */}
            <div className="relative w-full" style={{ height: "140px" }}>
              {/* Grid lines */}
              {[20, 50, 80, 110].map((y, i) => (
                <div key={`gl-${i}`} className="absolute left-0 right-0" style={{ top: `${y}px`, height: "1px", background: "rgba(255, 255, 255, 0.03)", animation: `gridLineMove ${3 + i}s ease-in-out ${i * 0.5}s infinite` }} />
              ))}

              {/* Price labels */}
              <div className="absolute left-1 top-3 text-[7px] font-mono text-white/20">2,450</div>
              <div className="absolute left-1 top-[42px] text-[7px] font-mono text-white/20">2,445</div>
              <div className="absolute left-1 top-[72px] text-[7px] font-mono text-white/20">2,440</div>
              <div className="absolute left-1 top-[102px] text-[7px] font-mono text-white/20">2,435</div>

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

                {/* Moving average line */}
                <polyline
                  points="45,75 67,70 89,85 111,72 133,65 155,80 177,68 199,82 221,60 243,70 265,75"
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Sparkle effects */}
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
                    boxShadow: `0 0 ${sp.size * 2}px rgba(255, 215, 0, 0.6)`,
                  }}
                />
              ))}

              {/* Current price line */}
              <div
                className="absolute right-3"
                style={{
                  top: "55px",
                  height: "1px",
                  width: "60%",
                  background: "linear-gradient(90deg, transparent, #FFD700 30%, #FFD700 70%, transparent)",
                  opacity: 0.2,
                }}
              />
              <div
                className="absolute right-2 px-1.5 py-0.5 rounded text-[7px] font-mono font-bold"
                style={{
                  top: "51px",
                  background: "#FFD700",
                  color: "#070b14",
                  boxShadow: "0 0 10px rgba(255, 215, 0, 0.3)",
                }}
              >
                2,438.50
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="splash-text-anim grid grid-cols-3 gap-3 mt-4" style={{ animationDelay: "700ms" }}>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: "#FFD700" }}>150+</div>
            <div className="text-[9px]" style={{ color: "rgba(255,215,0,0.5)" }}>إشارة</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: "#00E676" }}>78%</div>
            <div className="text-[9px]" style={{ color: "rgba(0,230,118,0.5)" }}>نسبة نجاح</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: "#06b6d4" }}>VIP</div>
            <div className="text-[9px]" style={{ color: "rgba(6,182,212,0.5)" }}>عضوية</div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="splash-text-anim flex items-center justify-center gap-2 mt-6" style={{ animationDelay: "900ms" }}>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-online-pulse" />
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>جاري الاتصال بالخادم...</span>
        </div>

        {/* Loading Progress */}
        <div className="splash-text-anim w-full mt-8 space-y-3" style={{ animationDelay: "800ms" }}>
          {/* Rotating Tips */}
          <div className="h-5 flex items-center justify-center overflow-hidden">
            <p key={tipIndex} className="text-[10px] font-medium animate-tip-fade" style={{ color: "rgba(255, 215, 0, 0.7)" }}>
              💡 {tips[tipIndex]}
            </p>
          </div>
          <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255, 215, 0, 0.1)" }}>
            <div className="splash-progress-bar h-full rounded-full" style={{ width: "0%" }} />
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#FFD700",
                    opacity: 0.3,
                    animation: `gentlePulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] font-medium" style={{ color: "rgba(255, 215, 0, 0.6)" }}>
              {statusTexts[loadStatus]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TpMiniCard, TradeStatusBanner, EntryCard, ClosedSignalCard, Candle, SplashScreen };
