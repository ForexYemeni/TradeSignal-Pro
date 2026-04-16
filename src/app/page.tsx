"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TrendingUp, TrendingDown, Star, Target, ShieldAlert, Clock,
  Activity, Send, RefreshCw, LogOut, Lock, Mail, Zap, Eye,
  EyeOff, DollarSign, AlertTriangle, Trash2, Loader2, Radio,
  BarChart3, User, Volume2, VolumeX, Bell,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
type SignalCategory =
  | "ENTRY" | "TP_HIT" | "SL_HIT" | "REENTRY"
  | "REENTRY_TP" | "REENTRY_SL" | "PYRAMID"
  | "PYRAMID_TP" | "PYRAMID_SL";

interface TakeProfit { tp: number; rr: number }

interface Signal {
  id: string; pair: string; type: "BUY" | "SELL";
  entry: number; stopLoss: number; takeProfits: TakeProfit[];
  confidence: number; status: string; signalCategory: SignalCategory;
  rawText: string; timeframe: string; htfTimeframe: string;
  htfTrend: string; smcTrend: string; hitTpIndex: number;
  hitPrice?: number; pnlPoints?: number; pnlDollars?: number;
  partialClose?: boolean; balance?: number; lotSize?: string;
  riskTarget?: number; riskPercent?: number; actualRisk?: number;
  actualRiskPct?: number; slDistance?: number; maxRR?: number;
  instrument?: string; createdAt: string;
}

interface AdminSession { id: string; email: string; name: string; mustChangePwd: boolean }

interface Stats {
  total: number; active: number; hitTp: number; hitSl: number;
  winRate: number; buyCount: number; sellCount: number;
  recentWeek: number; avgConfidence: number;
  topPairs: { pair: string; count: number }[];
}

type View = "login" | "main" | "changePwd";
type Tab = "signals" | "dashboard" | "analyst" | "account";
type Filter = "all" | "buy" | "sell" | "active" | "closed";

/* ═══════════════════════════════════════════════════════════════
   CATEGORY CONFIG
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${dy} ي`;
}

function isEntry(cat: SignalCategory) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}

function entryAccent(s: Signal) {
  if (s.signalCategory === "REENTRY") return { accent: "from-cyan-400 to-cyan-600", border: "border-cyan-500/25", text: "text-cyan-400", bg: "bg-cyan-500/15" };
  if (s.signalCategory === "PYRAMID") return { accent: "from-purple-400 to-purple-600", border: "border-purple-500/25", text: "text-purple-400", bg: "bg-purple-500/15" };
  if (s.type === "BUY") return { accent: "from-emerald-400 to-emerald-600", border: "border-emerald-500/25", text: "text-emerald-400", bg: "bg-emerald-500/15" };
  return { accent: "from-red-400 to-red-600", border: "border-red-500/25", text: "text-red-400", bg: "bg-red-500/15" };
}

function isTpLike(c: SignalCategory) {
  return c === "TP_HIT" || c === "REENTRY_TP" || c === "PYRAMID_TP";
}
function isSlLike(c: SignalCategory) {
  return c === "SL_HIT" || c === "REENTRY_SL" || c === "PYRAMID_SL";
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO NOTIFICATIONS (Web Audio API)
   ═══════════════════════════════════════════════════════════════ */
function playTone(freq: number, duration: number, startTime: number, ctx: AudioContext, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSound(type: "buy" | "sell" | "tp" | "sl" | "message", volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const v = volume * 0.3;
    const t = ctx.currentTime;
    switch (type) {
      case "buy":
        playTone(523.25, 0.15, t, ctx, v);
        playTone(659.25, 0.15, t + 0.12, ctx, v);
        break;
      case "sell":
        playTone(659.25, 0.15, t, ctx, v);
        playTone(523.25, 0.15, t + 0.12, ctx, v);
        break;
      case "tp":
        playTone(523.25, 0.12, t, ctx, v);
        playTone(659.25, 0.12, t + 0.1, ctx, v);
        playTone(783.99, 0.2, t + 0.2, ctx, v);
        break;
      case "sl":
        playTone(261.63, 0.2, t, ctx, v);
        playTone(220, 0.3, t + 0.18, ctx, v);
        break;
      case "message":
        playTone(523.25, 0.4, t, ctx, v);
        break;
    }
  } catch {
    // Web Audio not supported
  }
}

/* ═══════════════════════════════════════════════════════════════
   TINY COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function Stars({ r }: { r: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < r ? "fill-amber-400 text-amber-400" : "text-slate-700"}`} />
      ))}
    </div>
  );
}

function Div() { return <div className="border-t border-white/[0.04] my-2.5" />; }

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm ${className}`}>{children}</div>;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-24 rounded bg-white/[0.06]" />
          <div className="h-2.5 w-16 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 rounded-xl bg-white/[0.04]" />
        <div className="h-14 rounded-xl bg-white/[0.04]" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIGNAL CARDS
   ═══════════════════════════════════════════════════════════════ */
function EntryCard({ s, idx, isAdmin, onUpdate, onDelete }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
}) {
  const ac = entryAccent(s);
  const isBuy = s.type === "BUY";
  const typeLabel = s.signalCategory === "REENTRY" ? "إعادة دخول" : s.signalCategory === "PYRAMID" ? "تدرج" : isBuy ? "شراء" : "بيع";
  return (
    <div className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}>
      <Glass className={`overflow-hidden ${ac.border}`}>
        <div className={`h-[2px] bg-gradient-to-l ${ac.accent}`} />
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ac.bg}`}>
                {isBuy ? <TrendingUp className={`w-4 h-4 ${ac.text}`} /> : <TrendingDown className={`w-4 h-4 ${ac.text}`} />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-sm">{s.pair}</span>
                  {s.timeframe && <span className="text-[9px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded">{s.timeframe}</span>}
                  {s.htfTimeframe && <span className="text-[9px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded">{s.htfTimeframe}</span>}
                </div>
                <span className="text-[10px] text-slate-500">{typeLabel}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={`${ac.bg} ${ac.text} border ${ac.border} text-[9px] font-semibold px-2 py-0`}>{typeLabel}</Badge>
              {s.status === "ACTIVE" && <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[8px] px-1.5">● نشطة</Badge>}
              {(s.status === "HIT_TP" || s.status === "HIT_SL" || s.status === "MANUAL_CLOSE") && <Badge className="bg-slate-500/15 text-slate-400 border-0 text-[8px] px-1.5">مغلقة</Badge>}
            </div>
          </div>
          {s.confidence > 0 && (
            <div className="flex items-center justify-between">
              <Stars r={s.confidence} />
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(s.createdAt)}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.04]">
              <div className="flex items-center gap-1 mb-1"><Activity className="w-3 h-3 text-slate-500" /><span className="text-[9px] text-slate-500">الدخول</span></div>
              <div className="text-sm font-bold font-mono text-white">{s.entry}</div>
            </div>
            <div className="bg-red-500/[0.04] rounded-xl p-2.5 border border-red-500/[0.08]">
              <div className="flex items-center gap-1 mb-1"><ShieldAlert className="w-3 h-3 text-red-400" /><span className="text-[9px] text-red-400">الوقف</span></div>
              <div className="text-sm font-bold font-mono text-red-400">{s.stopLoss}</div>
              <div className="text-[8px] text-slate-500 mt-0.5">{s.slDistance || Math.abs(s.entry - s.stopLoss).toFixed(1)} نقطة</div>
            </div>
          </div>
          {(s.balance || s.lotSize || s.riskTarget) && (
            <>
              <Div />
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                <DollarSign className="w-3 h-3 text-amber-400" />
                <span className="font-semibold text-slate-300">إدارة المخاطر</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {s.balance && <div className="flex items-center justify-between"><span className="text-slate-500">الرصيد</span><span className="font-mono text-slate-200">${Number(s.balance).toLocaleString()}</span></div>}
                {s.lotSize && <div className="flex items-center justify-between"><span className="text-slate-500">اللوت</span><span className="font-mono text-slate-200">{s.lotSize}</span></div>}
                {s.riskTarget && <div className="flex items-center justify-between"><span className="text-slate-500">الخطر</span><span className="font-mono text-slate-200">${s.riskTarget}{s.riskPercent ? ` (${s.riskPercent}%)` : ""}</span></div>}
                {s.actualRisk && <div className="flex items-center justify-between"><span className="text-slate-500">فعلي</span><span className="font-mono text-slate-200">${s.actualRisk}{s.actualRiskPct ? ` (${s.actualRiskPct}%)` : ""}</span></div>}
                {s.maxRR && <div className="flex items-center justify-between"><span className="text-slate-500">R:R أقصى</span><span className="font-mono text-amber-400 font-bold">1:{s.maxRR}</span></div>}
                {s.instrument && <div className="flex items-center justify-between"><span className="text-slate-500">الأداة</span><span className="text-slate-200">{s.instrument}</span></div>}
              </div>
            </>
          )}
          {s.takeProfits?.length > 0 && (
            <>
              <Div />
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className="flex items-center gap-1 text-slate-400 font-semibold"><Target className="w-3 h-3 text-amber-400" />الأهداف</span>
                <span className="text-slate-500">R:R</span>
              </div>
              <div className="space-y-1.5">
                {s.takeProfits.map((tp, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${s.hitTpIndex >= 0 && s.hitTpIndex >= i ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-white/[0.02] border-white/[0.04] text-slate-300"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold opacity-50 w-7">TP{i + 1}</span>
                      <span className="font-bold font-mono">{tp.tp}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-amber-400/80">{tp.rr.toFixed(2)}</span>
                      {s.hitTpIndex >= 0 && s.hitTpIndex >= i ? <span className="text-emerald-400 text-xs">✅</span> : <span className="text-slate-600 text-[10px]">⏳</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {(s.htfTrend || s.smcTrend) && (
            <>
              <Div />
              <div className="flex items-center gap-3 text-[11px]">
                {s.htfTrend && (
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500">{s.htfTimeframe || "HTF"}:</span>
                    <span className={`font-semibold ${s.htfTrend === "صاعد" ? "text-emerald-400" : s.htfTrend === "هابط" ? "text-red-400" : "text-slate-400"}`}>
                      {s.htfTrend}{s.htfTrend === "صاعد" ? " 🐂" : s.htfTrend === "هابط" ? " 🐻" : ""}
                    </span>
                  </div>
                )}
                {s.smcTrend && (
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500">SMC:</span>
                    <span className={`font-semibold ${s.smcTrend === "صاعد" ? "text-emerald-400" : s.smcTrend === "هابط" ? "text-red-400" : "text-slate-400"}`}>{s.smcTrend}</span>
                  </div>
                )}
              </div>
            </>
          )}
          {isAdmin && s.status === "ACTIVE" && (
            <>
              <Div />
              <div className="flex flex-wrap gap-1.5">
                {s.takeProfits?.map((_, i) => (
                  <button key={i} onClick={() => onUpdate(s.id, "HIT_TP", i)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform">TP{i + 1} ✅</button>
                ))}
                <button onClick={() => onUpdate(s.id, "HIT_SL")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform">وقف ❌</button>
                <button onClick={() => onUpdate(s.id, "MANUAL_CLOSE")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06] active:scale-95 transition-transform">إغلاق</button>
                <button onClick={() => onDelete(s.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">🗑</button>
              </div>
            </>
          )}
        </div>
      </Glass>
    </div>
  );
}

function TpCard({ s, idx, isAdmin, onDelete }: { s: Signal; idx: number; isAdmin: boolean; onDelete: (id: string) => void }) {
  const cc = catCfg[s.signalCategory];
  return (
    <div className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}>
      <Glass className={`overflow-hidden ${cc.border}`}>
        <div className={`h-[2px] bg-gradient-to-l ${cc.accent}`} />
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center"><Target className="w-4 h-4 text-sky-400" /></div>
              <div>
                <span className="font-bold text-white text-sm">{s.pair}</span>
                <br />
                <span className="text-[10px] text-sky-400 font-semibold">{cc.label} — TP{(s.hitTpIndex ?? 0) + 1}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/25 text-[9px] px-2 py-0">{s.partialClose ? "جزئي" : "كامل"}</Badge>
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(s.createdAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-sky-500/[0.06] rounded-xl p-2.5 border border-sky-500/10">
              <div className="text-[9px] text-slate-500 mb-0.5">سعر الهدف</div>
              <div className="text-sm font-bold font-mono text-sky-300">{s.hitPrice ?? "—"}</div>
            </div>
            <div className="bg-emerald-500/[0.06] rounded-xl p-2.5 border border-emerald-500/10">
              <div className="text-[9px] text-slate-500 mb-0.5">الربح</div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                +${s.pnlDollars ?? 0}
                <span className="text-[9px] text-emerald-400/60 mr-1">({s.pnlPoints ?? 0} نقطة)</span>
              </div>
            </div>
          </div>
          {isAdmin && <div className="flex justify-end"><button onClick={() => onDelete(s.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">🗑 حذف</button></div>}
        </div>
      </Glass>
    </div>
  );
}

function SlCard({ s, idx, isAdmin, onDelete }: { s: Signal; idx: number; isAdmin: boolean; onDelete: (id: string) => void }) {
  const cc = catCfg[s.signalCategory];
  return (
    <div className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}>
      <Glass className={`overflow-hidden ${cc.border}`}>
        <div className={`h-[2px] bg-gradient-to-l ${cc.accent}`} />
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-red-400" /></div>
              <div>
                <span className="font-bold text-white text-sm">{s.pair}</span>
                <br />
                <span className="text-[10px] text-red-400 font-semibold">{cc.label}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {s.partialClose && <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[9px] px-2 py-0">ربح جزئي</Badge>}
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(s.createdAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-500/[0.06] rounded-xl p-2.5 border border-red-500/10">
              <div className="text-[9px] text-slate-500 mb-0.5">سعر الوقف</div>
              <div className="text-sm font-bold font-mono text-red-300">{s.hitPrice ?? "—"}</div>
            </div>
            <div className="bg-red-500/[0.06] rounded-xl p-2.5 border border-red-500/10">
              <div className="text-[9px] text-slate-500 mb-0.5">الخسارة</div>
              <div className="text-sm font-bold font-mono text-red-400">
                -${Math.abs(s.pnlDollars ?? 0)}
                <span className="text-[9px] text-red-400/60 mr-1">({s.pnlPoints ?? 0} نقطة)</span>
              </div>
            </div>
          </div>
          {isAdmin && <div className="flex justify-end"><button onClick={() => onDelete(s.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">🗑 حذف</button></div>}
        </div>
      </Glass>
    </div>
  );
}

function SignalCard({ s, idx, isAdmin, onUpdate, onDelete }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
}) {
  if (isEntry(s.signalCategory)) return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} />;
  if (isTpLike(s.signalCategory)) return <TpCard s={s} idx={idx} isAdmin={isAdmin} onDelete={onDelete} />;
  if (isSlLike(s.signalCategory)) return <SlCard s={s} idx={idx} isAdmin={isAdmin} onDelete={onDelete} />;
  return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} />;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
export default function HomePage() {
  /* ── View: login always shows first ── */
  const [view, setView] = useState<View>("login");
  const [session, setSession] = useState<AdminSession | null>(null);

  /* ── Login ── */
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loginLoad, setLoginLoad] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  /* ── Change Password ── */
  const [cpCur, setCpCur] = useState("");
  const [cpEmail, setCpEmail] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConf, setCpConf] = useState("");
  const [cpLoad, setCpLoad] = useState(false);
  const [cpErr, setCpErr] = useState("");

  /* ── Main State ── */
  const [tab, setTab] = useState<Tab>("signals");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioVol, setAudioVol] = useState(0.7);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* ── Analyst ── */
  const [rawText, setRawText] = useState("");
  const [parseResult, setParseResult] = useState<Signal | null>(null);
  const [parseLoad, setParseLoad] = useState(false);
  const [sendLoad, setSendLoad] = useState(false);
  const [parseError, setParseError] = useState("");

  /* ── Account ── */
  const [showCp, setShowCp] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  /* ── Session Init: restore from localStorage ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("adminSession");
      if (saved) {
        const s = JSON.parse(saved);
        if (s && s.id && s.email) {
          setSession(s);
          setView("main");
          return;
        }
      }
    } catch { /* ignore */ }
    // default view is "login" — no change needed
  }, []);

  /* ── Fetch Signals ── */
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals?limit=100");
      const data = await res.json();
      if (data.success) {
        const newSignals: Signal[] = data.signals;
        const newIds = new Set(newSignals.map((s: Signal) => s.id));
        const oldIds = prevIdsRef.current;
        // Detect new signals
        if (oldIds.size > 0 && !audioMuted) {
          for (const s of newSignals) {
            if (!oldIds.has(s.id)) {
              if (isEntry(s.signalCategory)) playSound(s.type === "BUY" ? "buy" : "sell", audioVol);
              else if (isTpLike(s.signalCategory)) playSound("tp", audioVol);
              else if (isSlLike(s.signalCategory)) playSound("sl", audioVol);
              else playSound("message", audioVol);
            }
          }
        }
        prevIdsRef.current = newIds;
        setSignals(newSignals);
      }
    } catch (e) { console.error("Fetch signals:", e); }
  }, [audioMuted, audioVol]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) { console.error("Fetch stats:", e); }
  }, []);

  /* ── Auto-refresh ── */
  useEffect(() => {
    if (view !== "main" || !session) return;
    setLoading(true);
    Promise.all([fetchSignals(), fetchStats()]).finally(() => setLoading(false));
    intervalRef.current = setInterval(() => { fetchSignals(); fetchStats(); }, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [view, session, fetchSignals, fetchStats]);

  /* ── Manual refresh ── */
  useEffect(() => {
    if (refreshKey === 0 || view !== "main") return;
    setLoading(true);
    Promise.all([fetchSignals(), fetchStats()]).finally(() => setLoading(false));
  }, [refreshKey]);

  /* ── Handlers ── */
  async function handleLogin() {
    setLoginErr("");
    setLoginLoad(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password: pwd }),
      });
      const data = await res.json();
      if (!data.success) { setLoginErr(data.error || "خطأ في تسجيل الدخول"); return; }
      const s: AdminSession = data.admin;
      setSession(s);
      localStorage.setItem("adminSession", JSON.stringify(s));
      if (s.mustChangePwd) {
        setCpEmail(s.email);
        setView("changePwd");
      } else {
        setView("main");
      }
    } catch { setLoginErr("خطأ في الاتصال بالخادم"); }
    finally { setLoginLoad(false); }
  }

  async function handleChangePwd() {
    setCpErr("");
    if (!cpCur || !cpEmail || !cpNew || !cpConf) { setCpErr("جميع الحقول مطلوبة"); return; }
    if (cpNew !== cpConf) { setCpErr("كلمة المرور غير متطابقة"); return; }
    if (cpNew.length < 4) { setCpErr("كلمة المرور يجب أن تكون 4 أحرف على الأقل"); return; }
    setCpLoad(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", id: session?.id, currentPassword: cpCur, newEmail: cpEmail, newPassword: cpNew }),
      });
      const data = await res.json();
      if (!data.success) { setCpErr(data.error || "خطأ"); return; }
      const s: AdminSession = data.admin;
      setSession(s);
      localStorage.setItem("adminSession", JSON.stringify(s));
      setView("main");
      setCpCur(""); setCpEmail(""); setCpNew(""); setCpConf("");
    } catch { setCpErr("خطأ في الاتصال بالخادم"); }
    finally { setCpLoad(false); }
  }

  function handleLogout() {
    setSession(null);
    localStorage.removeItem("adminSession");
    setEmail(""); setPwd("");
    setView("login");
    setTab("signals");
    prevIdsRef.current = new Set();
  }

  async function handleUpdate(id: string, status: string, tpIdx?: number) {
    try {
      await fetch(`/api/signals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, hitTpIndex: tpIdx }),
      });
      fetchSignals(); fetchStats();
    } catch (e) { console.error("Update:", e); }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/signals/${id}`, { method: "DELETE" });
      fetchSignals(); fetchStats();
    } catch (e) { console.error("Delete:", e); }
  }

  async function handleClearAll() {
    try {
      await Promise.all(signals.map(s => fetch(`/api/signals/${s.id}`, { method: "DELETE" })));
      setConfirmClear(false);
      fetchSignals(); fetchStats();
    } catch (e) { console.error("Clear:", e); }
  }

  async function handleParse() {
    if (!rawText.trim()) return;
    setParseLoad(true); setParseResult(null); setParseError("");
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();
      if (data.success && data.signal) { setParseResult(data.signal); }
      else { setParseError(data.error || "فشل تحليل الإشارة"); }
    } catch (e) { setParseError("خطأ في الاتصال"); }
    finally { setParseLoad(false); }
  }

  async function handleSend() {
    if (!rawText.trim()) return;
    setSendLoad(true);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();
      if (data.success) {
        setRawText(""); setParseResult(null); setParseError("");
        fetchSignals(); fetchStats();
      }
    } catch (e) { console.error("Send:", e); }
    finally { setSendLoad(false); }
  }

  function getFiltered(): Signal[] {
    switch (filter) {
      case "buy": return signals.filter(s => s.type === "BUY");
      case "sell": return signals.filter(s => s.type === "SELL");
      case "active": return signals.filter(s => s.status === "ACTIVE");
      case "closed": return signals.filter(s => s.status !== "ACTIVE");
      default: return signals;
    }
  }

  const activeCount = signals.filter(s => s.status === "ACTIVE").length;
  const filtered = getFiltered();

  /* ═══════════════════════════════════════════════════════════════
     RENDER: LOGIN
     ═══════════════════════════════════════════════════════════════ */
  if (view === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #080d1a 0%, #0f172a 50%, #080d1a 100%)" }}>
        <div className="w-full max-w-sm animate-[fadeIn_0.4s_ease-out]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Radio className="w-8 h-8 text-black" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white tracking-wide">TradeSignal Pro</h1>
                <p className="text-sm text-slate-400 mt-1">نظام إشارات التداول الذكي</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />البريد الإلكتروني</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@forexyemeni.com"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleLogin()} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />كلمة المرور</label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr"
                    onKeyDown={e => e.key === "Enter" && handleLogin()} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {loginErr && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 text-center animate-[fadeIn_0.2s_ease-out]">{loginErr}</div>
              )}
              <Button onClick={handleLogin} disabled={loginLoad || !email || !pwd}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm hover:from-amber-400 hover:to-orange-400 transition-all active:scale-[0.98] disabled:opacity-50">
                {loginLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : "تسجيل الدخول"}
              </Button>
            </div>
            <div className="text-center text-[10px] text-slate-600">الإصدار 2.0 | FOREXYEMENI PRO</div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: CHANGE PASSWORD (forced)
     ═══════════════════════════════════════════════════════════════ */
  if (view === "changePwd") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #080d1a 0%, #0f172a 50%, #080d1a 100%)" }}>
        <div className="w-full max-w-sm animate-[fadeIn_0.4s_ease-out]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-white">تغيير بيانات الحساب</h2>
                <p className="text-xs text-slate-400 mt-1">يجب تغيير البريد وكلمة المرور للمتابعة</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">كلمة المرور الحالية</label>
                <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="••••••••"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">البريد الإلكتروني الجديد</label>
                <Input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="new@email.com"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">كلمة المرور الجديدة</label>
                <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="••••••••"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">تأكيد كلمة المرور</label>
                <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="••••••••"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-11 rounded-xl text-sm" dir="ltr" />
              </div>
              {cpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 text-center">{cpErr}</div>}
              <Button onClick={handleChangePwd} disabled={cpLoad}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm hover:from-amber-400 hover:to-orange-400 transition-all active:scale-[0.98] disabled:opacity-50">
                {cpLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحديث البيانات"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: MAIN APP
     ═══════════════════════════════════════════════════════════════ */
  const filterChips: { key: Filter; label: string }[] = [
    { key: "all", label: "الكل" }, { key: "buy", label: "شراء" },
    { key: "sell", label: "بيع" }, { key: "active", label: "نشطة" }, { key: "closed", label: "مغلقة" },
  ];

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "signals", label: "الإشارات", icon: <Activity className="w-5 h-5" />, badge: activeCount },
    { key: "dashboard", label: "الإحصائيات", icon: <BarChart3 className="w-5 h-5" /> },
    { key: "analyst", label: "المحلل", icon: <Send className="w-5 h-5" /> },
    { key: "account", label: "الحساب", icon: <User className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #080d1a 0%, #0f172a 50%, #080d1a 100%)" }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080d1a]/80 backdrop-blur-lg">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Radio className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-white text-sm tracking-wide">TradeSignal Pro</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Audio Controls */}
            <button onClick={() => setAudioMuted(!audioMuted)} className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={() => setRefreshKey(k => k + 1)} className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-white transition-colors active:scale-90">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={handleLogout} className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Audio Volume (show when not muted) */}
        {!audioMuted && (
          <div className="px-4 pb-2 flex items-center gap-2">
            <Volume2 className="w-3 h-3 text-slate-500" />
            <input type="range" min="0" max="100" value={audioVol * 100} onChange={e => setAudioVol(Number(e.target.value) / 100)}
              className="flex-1 h-1 accent-amber-500 bg-white/[0.1] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500" />
            <span className="text-[10px] text-slate-500 w-8 text-center">{Math.round(audioVol * 100)}%</span>
          </div>
        )}
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-4 pb-24 pt-3 max-w-lg mx-auto w-full">

        {/* ══════ TAB: SIGNALS ══════ */}
        {tab === "signals" && (
          <div className="space-y-3">
            {/* Filter Chips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {filterChips.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filter === f.key ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]"}`}>
                  {f.label}
                </button>
              ))}
            </div>

            {loading && filtered.length === 0 ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Bell className="w-10 h-10 mb-3 text-slate-700" />
                <p className="text-sm">لا توجد إشارات</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((s, i) => (
                  <SignalCard key={s.id} s={s} idx={i} isAdmin={true} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════ TAB: DASHBOARD ══════ */}
        {tab === "dashboard" && (
          <div className="space-y-4">
            {loading && !stats ? (
              <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
            ) : stats ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">إجمالي الإشارات</div>
                    <div className="text-xl font-bold text-white">{stats.total}</div>
                  </Glass>
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">نشطة</div>
                    <div className="text-xl font-bold text-emerald-400">{stats.active}</div>
                  </Glass>
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">نسبة الفوز</div>
                    <div className="text-xl font-bold text-amber-400">{stats.winRate}%</div>
                  </Glass>
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">هذه الأسبوع</div>
                    <div className="text-xl font-bold text-sky-400">{stats.recentWeek}</div>
                  </Glass>
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">شراء / بيع</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-emerald-400">{stats.buyCount}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-sm font-bold text-red-400">{stats.sellCount}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex">
                      <div className="bg-emerald-500 h-full rounded-r-full transition-all" style={{ width: `${stats.buyCount + stats.sellCount > 0 ? (stats.buyCount / (stats.buyCount + stats.sellCount)) * 100 : 50}%` }} />
                      <div className="bg-red-500 h-full rounded-l-full flex-1" />
                    </div>
                  </Glass>
                  <Glass className="p-3.5">
                    <div className="text-[10px] text-slate-500 mb-1">متوسط الثقة</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl font-bold text-amber-400">{stats.avgConfidence}</span>
                      <Stars r={Math.round(stats.avgConfidence)} />
                    </div>
                  </Glass>
                </div>

                {/* Win/Loss */}
                <Glass className="p-4">
                  <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-amber-400" />نتائج الصفقات</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-emerald-400">ربح ({stats.hitTp})</span>
                        <span className="text-red-400">خسارة ({stats.hitSl})</span>
                      </div>
                      <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden flex">
                        {stats.hitTp + stats.hitSl > 0 && (
                          <div className="bg-gradient-to-l from-emerald-500 to-emerald-400 h-full rounded-r-full transition-all" style={{ width: `${(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100}%` }} />
                        )}
                        <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-full flex-1" />
                      </div>
                    </div>
                  </div>
                </Glass>

                {/* Top Pairs */}
                {stats.topPairs?.length > 0 && (
                  <Glass className="p-4">
                    <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-amber-400" />الأزواج الأكثر تداولاً</div>
                    <div className="space-y-2">
                      {stats.topPairs.map((p, i) => {
                        const maxCount = stats.topPairs[0].count;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-5 text-center">{i + 1}</span>
                            <span className="text-xs font-semibold text-white w-20 truncate">{p.pair}</span>
                            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-l from-amber-500 to-orange-500 transition-all" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 w-8 text-left">{p.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Glass>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ══════ TAB: ANALYST ══════ */}
        {tab === "analyst" && (
          <div className="space-y-4">
            <Glass className="p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-amber-400" />تحليل إشارة يدوي</div>
              <Textarea value={rawText} onChange={e => setRawText(e.target.value)}
                placeholder="الصق نص الإشارة من TradingView هنا..."
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 min-h-[140px] text-xs rounded-xl resize-none" dir="rtl" />
              <div className="flex gap-2">
                <Button onClick={handleParse} disabled={parseLoad || !rawText.trim()}
                  className="flex-1 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                  {parseLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحليل"}
                </Button>
                {parseResult && (
                  <Button onClick={handleSend} disabled={sendLoad}
                    className="flex-1 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                    {sendLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "إرسال للخادم"}
                  </Button>
                )}
              </div>
              {parseError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 text-center">{parseError}</div>}
            </Glass>

            {parseResult && (
              <div className="animate-[fadeInUp_0.3s_ease-out]">
                <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5"><Zap className="w-3 h-3 text-amber-400" />نتيجة التحليل</div>
                <SignalCard s={parseResult} idx={0} isAdmin={false} onUpdate={() => {}} onDelete={() => {}} />
              </div>
            )}
          </div>
        )}

        {/* ══════ TAB: ACCOUNT ══════ */}
        {tab === "account" && session && (
          <div className="space-y-4">
            {/* Admin Info */}
            <Glass className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <User className="w-6 h-6 text-black" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">{session.name}</div>
                  <div className="text-xs text-slate-400" dir="ltr">{session.email}</div>
                </div>
              </div>
            </Glass>

            {/* Change Password */}
            <Glass className="overflow-hidden">
              <button onClick={() => setShowCp(!showCp)} className="w-full p-4 flex items-center justify-between text-sm text-slate-300 hover:bg-white/[0.02] transition-colors">
                <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" />تغيير كلمة المرور</span>
                <ChevronIcon open={showCp} />
              </button>
              {showCp && (
                <div className="px-4 pb-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                  <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                  <Input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                  <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                  <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                  {cpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 text-center">{cpErr}</div>}
                  <Button onClick={handleChangePwd} disabled={cpLoad} className="w-full h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                    {cpLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث"}
                  </Button>
                </div>
              )}
            </Glass>

            {/* Clear All */}
            <Glass className="overflow-hidden">
              {!confirmClear ? (
                <button onClick={() => setConfirmClear(true)} className="w-full p-4 flex items-center justify-between text-sm text-red-400 hover:bg-red-500/[0.03] transition-colors">
                  <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" />حذف جميع الإشارات</span>
                </button>
              ) : (
                <div className="p-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                  <div className="text-xs text-red-400 text-center">هل أنت متأكد من حذف جميع الإشارات؟</div>
                  <div className="flex gap-2">
                    <Button onClick={handleClearAll} className="flex-1 h-10 rounded-xl bg-red-500/15 text-red-400 border border-red-500/25 text-xs font-semibold">نعم، احذف</Button>
                    <Button onClick={() => setConfirmClear(false)} className="flex-1 h-10 rounded-xl bg-white/[0.04] text-slate-400 border border-white/[0.06] text-xs">إلغاء</Button>
                  </div>
                </div>
              )}
            </Glass>

            {/* Logout */}
            <button onClick={handleLogout}
              className="w-full p-4 rounded-2xl border border-red-500/15 bg-red-500/[0.03] text-red-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/[0.06] transition-colors active:scale-[0.98]">
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#080d1a]/90 backdrop-blur-lg safe-area-bottom">
        <div className="max-w-lg mx-auto flex">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors ${tab === t.key ? "text-amber-400" : "text-slate-500"}`}>
              {t.icon}
              <span className="text-[10px] font-medium">{t.label}</span>
              {tab === t.key && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" />}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute top-1.5 right-1/2 translate-x-4 w-4.5 h-4.5 rounded-full bg-amber-500 text-[8px] font-bold text-black flex items-center justify-center px-1">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* Chevron icon for expandable sections */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
