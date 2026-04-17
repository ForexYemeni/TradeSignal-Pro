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
  Crown, Package, Users, CalendarDays, CheckCircle, XCircle, Settings, ChevronDown,
  Home, Flame, Trophy, ArrowUpRight, ArrowDownRight, Hash, Globe, PieChart, Sparkles, Timer, TrendingUpIcon, CircleDot, Gavel, Banknote, Wallet, Percent,
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
  partialWin?: boolean; totalTPs?: number;
  balance?: number; lotSize?: string;
  riskTarget?: number; riskPercent?: number; actualRisk?: number;
  actualRiskPct?: number; slDistance?: number; maxRR?: number;
  instrument?: string; createdAt: string;
}

interface AdminSession { id: string; email: string; name: string; mustChangePwd: boolean; role?: string; status?: string; subscriptionType?: string; subscriptionExpiry?: string; packageName?: string; packageId?: string }

interface Stats {
  total: number; active: number; hitTp: number; hitSl: number;
  winRate: number; buyCount: number; sellCount: number;
  recentWeek: number; avgConfidence: number;
  topPairs: { pair: string; count: number }[];
}

type View = "login" | "register" | "pending" | "blocked" | "expired" | "main" | "changePwd";
type Tab = "home" | "signals" | "dashboard" | "analyst" | "users" | "packages" | "account";
type Filter = "all" | "buy" | "sell" | "active" | "closed";

interface SubPackage { id: string; name: string; durationDays: number; price: number; type: string; description: string; isActive: boolean; order: number; }
interface AppSettingsData { freeTrialPackageId: string | null; autoApproveOnRegister: boolean; }

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

function isEntry(cat: SignalCategory | undefined | null) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}

function entryAccent(s: Signal) {
  if (s.signalCategory === "REENTRY") return { accent: "from-cyan-400 to-cyan-600", border: "border-cyan-500/25", text: "text-cyan-400", bg: "bg-cyan-500/15" };
  if (s.signalCategory === "PYRAMID") return { accent: "from-purple-400 to-purple-600", border: "border-purple-500/25", text: "text-purple-400", bg: "bg-purple-500/15" };
  if (s.type === "BUY") return { accent: "from-emerald-400 to-emerald-600", border: "border-emerald-500/25", text: "text-emerald-400", bg: "bg-emerald-500/15" };
  return { accent: "from-red-400 to-red-600", border: "border-red-500/25", text: "text-red-400", bg: "bg-red-500/15" };
}

function isTpLike(c: SignalCategory | undefined | null) {
  return c === "TP_HIT" || c === "REENTRY_TP" || c === "PYRAMID_TP";
}
function isSlLike(c: SignalCategory | undefined | null) {
  return c === "SL_HIT" || c === "REENTRY_SL" || c === "PYRAMID_SL";
}

/* ═══════════════════════════════════════════════════════════════
   NATIVE ANDROID NOTIFICATION BRIDGE
   ═══════════════════════════════════════════════════════════════ */
function nativeNotify(title: string, body: string, soundType: string) {
  try {
    const w = window as unknown as { AndroidNotify?: { sendNotification: (t: string, b: string, s: string) => void } };
    if (w.AndroidNotify) {
      w.AndroidNotify.sendNotification(title, body, soundType);
    }
  } catch { /* not native */ }
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
   PUSH NOTIFICATION SYSTEM
   ═══════════════════════════════════════════════════════════════ */

// Convert base64 to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerPushNotification(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[Push] Push not supported");
      return false;
    }

    // Check current permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Push] Notification permission denied");
      return false;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from API
    const vapidRes = await fetch("/api/push/vapid");
    const vapidData = await vapidRes.json();
    if (!vapidData.success || !vapidData.publicKey) {
      console.warn("[Push] Failed to get VAPID key");
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidData.publicKey);

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send subscription to server
    const subRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!))),
        },
        userId,
      }),
    });

    const subData = await subRes.json();
    if (subData.success) {
      console.log("[Push] Successfully registered for push notifications");
      return true;
    }
    return false;
  } catch (err) {
    console.error("[Push] Registration failed:", err);
    return false;
  }
}

async function unregisterPushNotification(endpoint?: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error("[Push] Unregister failed:", err);
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
   SIGNAL CARDS — PROFESSIONAL EDITION
   ═══════════════════════════════════════════════════════════════ */

/* ── Expandable TP Mini-Card ── */
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
            ? `bg-gradient-to-br from-emerald-500/[0.12] to-emerald-600/[0.06] border-emerald-500/30 ${isLastHit ? "animate-glow-pulse" : ""}`
            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]"
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
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center">
                <span className="text-[9px] text-slate-500 font-bold">{index + 1}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold font-mono ${isHit ? "text-emerald-300" : "text-slate-300"}`}>{tp.tp}</span>
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-md ${isHit ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.04] text-slate-500"}`}>
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
              <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="tp-expand-enter mt-1 mx-2 mb-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex justify-between"><span className="text-slate-500">سعر الهدف</span><span className="font-mono font-bold text-white">{tp.tp}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">المسافة</span><span className="font-mono text-slate-300">{direction}{diff} نقطة</span></div>
            <div className="flex justify-between"><span className="text-slate-500">R:R</span><span className="font-mono font-semibold text-amber-400">{tp.rr.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">نسبة التحرك</span><span className="font-mono text-slate-300">{pctFromEntry}%</span></div>
          </div>
          {isHit && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-emerald-500/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-semibold">تم تحقيق الهدف بنجاح</span>
            </div>
          )}
          {!isHit && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-white/[0.04]">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span className="text-[10px] text-slate-500">في انتظار التحقيق</span>
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
    : { bg: "bg-white/[0.03] border-white/[0.06]", iconBg: "bg-slate-500/20", text: "text-slate-400", badge: "bg-slate-500/20 text-slate-400", pill: "text-slate-400/70 bg-slate-500/10", sub: "text-slate-400/60" };
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
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${c.text}`}>
              {catIcon && `${catIcon} `}{isProfit ? (catLabel ? `${catLabel} رابح` : "صفقة رابحة") : isLoss ? (isReentry ? "تعويض خاسر" : isPyramid ? "تعزيز خاسر" : "صفقة خاسرة") : "صفقة مغلقة يدويا"}
            </span>
            {isProfit && hitCount > 0 && totalTPs > 0 && (
              <span className={`text-[9px] ${c.badge} px-1.5 py-0.5 rounded-md font-bold`}>
                {catIcon} {hitCount}/{totalTPs} {catLabel || "أهداف"}
              </span>
            )}
          </div>
          {isProfit && (s.pnlDollars ?? 0) > 0 && (
            <div className={`text-[11px] font-mono font-bold ${c.text} mt-0.5`}>
              +${s.pnlDollars}{" "}
              <span className={`text-[9px] font-normal ${c.sub}`}>({s.pnlPoints ?? 0} نقطة)</span>
            </div>
          )}
          {isLoss && (s.pnlDollars ?? 0) !== 0 && (
            <div className="text-[11px] font-mono font-bold text-red-400 mt-0.5">
              -${Math.abs(s.pnlDollars ?? 0)}{" "}
              <span className="text-[9px] font-normal text-red-400/60">({s.pnlPoints ?? 0} نقطة)</span>
            </div>
          )}
          {isManual && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              تم إغلاق الصفقة يدويا
              {hitCount > 0 && ` بعد تحقيق ${hitCount} هدف`}
            </div>
          )}
        </div>
        {isProfit && (
          <div className={`text-[10px] font-bold ${c.pill} px-2 py-1 rounded-lg flex-shrink-0`}>
            ربح
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
function EntryCard({ s, idx, isAdmin, onUpdate, onDelete }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
}) {
  const ac = entryAccent(s);
  const isBuy = s.type === "BUY";
  const typeLabel = s.signalCategory === "REENTRY" ? "إعادة دخول" : s.signalCategory === "PYRAMID" ? "تدرج" : isBuy ? "شراء" : "بيع";
  const isClosed = s.status !== "ACTIVE";
  const hitCount = s.hitTpIndex >= 0 ? s.hitTpIndex : 0;

  return (
    <div className="animate-[fadeInUp_0.35s_ease-out]" style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}>
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
                  <span className="font-extrabold text-white text-[15px] tracking-wide">{s.pair}</span>
                  {s.timeframe && <span className="text-[9px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded-md font-medium">{s.timeframe}</span>}
                  {s.htfTimeframe && <span className="text-[9px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded-md font-medium">{s.htfTimeframe}</span>}
                </div>
                <span className="text-[10px] text-slate-500 font-medium">{typeLabel}</span>
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
                  <Badge className={`${s.status === "HIT_TP" ? "bg-emerald-500/10 text-emerald-400" : s.status === "HIT_SL" ? "bg-red-500/10 text-red-400" : "bg-slate-500/10 text-slate-400"} border-0 text-[8px] font-semibold px-2`}>
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
                <div className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-400/50 animate-pulse" />
                  <span className="text-[9px] text-emerald-400/60">مباشر</span>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(s.createdAt)}</span>
          </div>

          {/* ── Entry / SL Price Boxes ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-xl p-3 border transition-all duration-300 ${isBuy ? "bg-gradient-to-br from-emerald-500/[0.06] to-emerald-600/[0.02] border-emerald-500/15" : "bg-gradient-to-br from-red-500/[0.06] to-red-600/[0.02] border-red-500/15"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity className={`w-3 h-3 ${isBuy ? "text-emerald-400" : "text-red-400"}`} />
                <span className="text-[9px] text-slate-400 font-medium">سعر الدخول</span>
              </div>
              <div className={`text-[15px] font-extrabold font-mono ${isBuy ? "text-emerald-300" : "text-red-300"}`}>{s.entry}</div>
            </div>
            <div className="bg-gradient-to-br from-red-500/[0.06] to-red-600/[0.02] rounded-xl p-3 border border-red-500/15">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldAlert className="w-3 h-3 text-red-400" />
                <span className="text-[9px] text-red-300 font-medium">وقف الخسارة</span>
              </div>
              <div className="text-[15px] font-extrabold font-mono text-red-400">{s.stopLoss}</div>
              <div className="text-[8px] text-slate-500 mt-1 font-mono">{s.slDistance || Math.abs(s.entry - s.stopLoss).toFixed(1)} نقطة</div>
            </div>
          </div>

          {/* ── Risk Management ── */}
          {(s.balance || s.lotSize || s.riskTarget) && (
            <>
              <Div />
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold text-slate-300">إدارة المخاطر</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {s.balance && <div className="flex items-center justify-between"><span className="text-slate-500">الرصيد</span><span className="font-mono text-slate-200 font-semibold">${Number(s.balance).toLocaleString()}</span></div>}
                {s.lotSize && <div className="flex items-center justify-between"><span className="text-slate-500">اللوت</span><span className="font-mono text-slate-200 font-semibold">{s.lotSize}</span></div>}
                {s.riskTarget && <div className="flex items-center justify-between"><span className="text-slate-500">الخطر</span><span className="font-mono text-slate-200">${s.riskTarget}{s.riskPercent ? ` (${s.riskPercent}%)` : ""}</span></div>}
                {s.actualRisk && <div className="flex items-center justify-between"><span className="text-slate-500">فعلي</span><span className="font-mono text-slate-200">${s.actualRisk}{s.actualRiskPct ? ` (${s.actualRiskPct}%)` : ""}</span></div>}
                {s.maxRR && <div className="flex items-center justify-between"><span className="text-slate-500">R:R أقصى</span><span className="font-mono text-amber-400 font-bold">1:{s.maxRR}</span></div>}
                {s.instrument && <div className="flex items-center justify-between"><span className="text-slate-500">الأداة</span><span className="text-slate-200">{s.instrument}</span></div>}
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
                  <span className="text-[10px] text-slate-300 font-bold">الأهداف</span>
                  {hitCount > 0 && (
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-md font-bold ml-1">
                      {hitCount}/{s.takeProfits.length}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-600 font-mono">R:R</span>
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
                    <Activity className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500">{s.htfTimeframe || "HTF"}:</span>
                    <span className={`font-semibold ${s.htfTrend === "صاعد" ? "text-emerald-400" : s.htfTrend === "هابط" ? "text-red-400" : "text-slate-400"}`}>
                      {s.htfTrend}{s.htfTrend === "صاعد" ? " 🐂" : s.htfTrend === "هابط" ? " 🐻" : ""}
                    </span>
                  </div>
                )}
                {s.smcTrend && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500">SMC:</span>
                    <span className={`font-semibold ${s.smcTrend === "صاعد" ? "text-emerald-400" : s.smcTrend === "هابط" ? "text-red-400" : "text-slate-400"}`}>{s.smcTrend}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Trade Close Status Banner ── */}
          <TradeStatusBanner s={s} />

          {/* ── Admin Actions ── */}
          {isAdmin && s.status === "ACTIVE" && (
            <>
              <Div />
              <div className="flex flex-wrap gap-1.5">
                {s.takeProfits?.map((_, i) => (
                  <button key={i} onClick={() => onUpdate(s.id, "HIT_TP", i)} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform hover:bg-sky-500/20">TP{i + 1} ✅</button>
                ))}
                <button onClick={() => onUpdate(s.id, "HIT_SL")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform hover:bg-red-500/20">وقف ❌</button>
                <button onClick={() => onUpdate(s.id, "MANUAL_CLOSE")} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06] active:scale-95 transition-transform hover:bg-white/[0.08]">إغلاق</button>
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
function ClosedSignalCard({ s, idx, isAdmin, onDelete }: { s: Signal; idx: number; isAdmin: boolean; onDelete: (id: string) => void }) {
  const isProfit = s.status === "HIT_TP";
  const isLoss = s.status === "HIT_SL";
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
    : { bg: "bg-white/[0.03]", border: "border-white/[0.06]", iconBg: "bg-slate-500/15", text: "text-slate-400", badge: "bg-slate-500/20 text-slate-400", tpBadge: "bg-slate-500/10 text-slate-400 border-white/[0.06]" };
  const catIcon = isReentry ? "♻️" : isPyramid ? "🔥" : isProfit ? "✅" : isLoss ? "❌" : "⊘";

  return (
    <div className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}>
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
                  <ShieldAlert className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-[13px]">{s.pair}</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{isBuy ? "BUY" : "SELL"}</span>
                  {hitCount > 0 && isProfit && (
                    <span className={`text-[8px] ${catColors.badge} px-1.5 py-0.5 rounded-md font-bold`}>{hitCount}/{totalTPs} {isReentry ? "♻️" : isPyramid ? "🔥" : "TP"}</span>
                  )}
                </div>
                <span className={`text-[9px] font-medium ${catColors.text}/70`}>{catIcon} {catLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {/* PnL badge */}
              <div className="text-right">
                <div className={`text-[13px] font-extrabold font-mono ${isProfit ? catColors.text : "text-red-400"}`}>
                  {isProfit ? "+" : "-"}${Math.abs(pnl)}
                </div>
                <div className={`text-[8px] font-mono ${isProfit ? catColors.text + "/50" : "text-red-400/50"}`}>{points} نقطة</div>
              </div>
              {/* Chevron */}
              <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>

        {/* Expanded Details */}
        {expanded && (
          <div className="tp-expand-enter">
            <div className="border-t border-white/[0.04] mx-3" />
            <div className="p-3 space-y-2.5">
              {/* Entry / SL / Hit Price */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.03] rounded-lg p-2 border border-white/[0.05]">
                  <div className="text-[8px] text-slate-500 mb-0.5">الدخول</div>
                  <div className="text-[11px] font-bold font-mono text-white">{s.entry}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2 border border-white/[0.05]">
                  <div className="text-[8px] text-slate-500 mb-0.5">الوقف</div>
                  <div className="text-[11px] font-bold font-mono text-red-300">{s.stopLoss}</div>
                </div>
                <div className={`rounded-lg p-2 border ${isProfit ? catColors.iconBg + " " + catColors.border : "bg-red-500/[0.06] border-red-500/10"}`}>
                  <div className="text-[8px] text-slate-500 mb-0.5">{isReentry ? "تعويض" : isPyramid ? "تعزيز" : isProfit ? "الهدف" : "الإغلاق"} {hitCount > 0 && totalTPs > 0 ? `(${hitCount}/${totalTPs})` : ""}</div>
                  <div className={`text-[11px] font-bold font-mono ${isProfit ? catColors.text : "text-red-400"}`}>{s.hitPrice ?? "—"}</div>
                </div>
              </div>

              {/* TP Targets or hit info for standalone TP/SL alerts */}
              {s.takeProfits?.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[9px] text-slate-500 font-medium">الأهداف ({hitCount}/{totalTPs})</div>
                  <div className="flex gap-1 flex-wrap">
                    {s.takeProfits.map((tp, i) => {
                      const hit = s.hitTpIndex > 0 && i < s.hitTpIndex;
                      return (
                        <div key={i} className={`px-2 py-1 rounded-lg text-[9px] font-mono border ${hit ? catColors.tpBadge : "bg-white/[0.02] text-slate-500 border-white/[0.06] line-through opacity-50"}`}>
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
                  {s.balance && <div className="flex items-center gap-1"><span className="text-slate-500">الرصيد:</span><span className="font-mono text-slate-300">${Number(s.balance).toLocaleString()}</span></div>}
                  {s.lotSize && <div className="flex items-center gap-1"><span className="text-slate-500">اللوت:</span><span className="font-mono text-slate-300">{s.lotSize}</span></div>}
                </div>
              )}

              {/* Time + Delete */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] text-slate-500 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{timeAgo(s.createdAt)}</span>
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

        {/* Loading Progress */}
        <div className="splash-text-anim w-full mt-8 space-y-3" style={{ animationDelay: "800ms" }}>
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
              جاري التحميل...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalCard({ s, idx, isAdmin, onUpdate, onDelete }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
}) {
  /* Closed signals (status !== ACTIVE) use compact card — whether category is ENTRY or TP/SL */
  if (s.status !== "ACTIVE") return <ClosedSignalCard s={s} idx={idx} isAdmin={isAdmin} onDelete={onDelete} />;
  /* Active entry signals use full card */
  if (isEntry(s.signalCategory)) return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} />;
  return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} />;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
export default function HomePage() {
  /* ── View: login shows first ── */
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
  const prevStateRef = useRef<Map<string, { hitTpIndex: number; status: string }>>(new Map());
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

  /* ── Register ── */
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPwd, setRegPwd] = useState("");
  const [regLoad, setRegLoad] = useState(false);
  const [regErr, setRegErr] = useState("");
  const [regSuccess, setRegSuccess] = useState("");

  /* ── Users Management ── */
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string; status: string; createdAt: string; subscriptionType?: string; subscriptionExpiry?: string; packageName?: string; packageId?: string }[]>([]);
  const [usersLoad, setUsersLoad] = useState(false);

  /* ── Email Change Request ── */
  const [emailReqNew, setEmailReqNew] = useState("");
  const [emailReqLoad, setEmailReqLoad] = useState(false);
  const [emailReqMsg, setEmailReqMsg] = useState("");
  const [emailRequests, setEmailRequests] = useState<{ id: string; userId: string; userName: string; oldEmail: string; newEmail: string; status: string; createdAt: string }[]>([]);
  const [showEmailReqSection, setShowEmailReqSection] = useState(false);

  /* ── Packages & Settings ── */
  const [packages, setPackages] = useState<SubPackage[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingsData>({ freeTrialPackageId: null, autoApproveOnRegister: true });
  const [showPkgForm, setShowPkgForm] = useState(false);
  const [pkgFormName, setPkgFormName] = useState("");
  const [pkgFormDays, setPkgFormDays] = useState("");
  const [pkgFormPrice, setPkgFormPrice] = useState("");
  const [pkgFormType, setPkgFormType] = useState<"free" | "trial" | "paid">("paid");
  const [pkgFormDesc, setPkgFormDesc] = useState("");
  const [pkgFormActive, setPkgFormActive] = useState(true);
  const [pkgLoad, setPkgLoad] = useState(false);
  const [showAssignPkg, setShowAssignPkg] = useState<string | null>(null);
  const [assignDays, setAssignDays] = useState("");

  /* ── Session Init: restore from localStorage ── */
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    // Auto-setup database tables on first load
    async function initDb() {
      try {
        const res = await fetch("/api/setup");
        const data = await res.json();
        if (data.success) {
          setDbReady(true);
        } else {
          setDbError(data.error || "Database setup failed");
          setDbReady(true); // still show login so user can see the error
        }
      } catch (e) {
        setDbError("Cannot connect to database");
        setDbReady(true);
      }
    }

    async function restoreSession() {
      try {
        const saved = localStorage.getItem("adminSession");
        if (saved) {
          const s = JSON.parse(saved);
          if (s && s.id && s.email) {
            setSession(s);
            // Check session status and role
            if (s.role === "user" && s.status === "pending") {
              setView("pending");
            } else if (s.role === "user" && s.status === "blocked") {
              setView("blocked");
            } else if (s.role === "user" && s.status === "expired") {
              setView("expired");
            } else if (s.mustChangePwd) {
              setCpEmail(s.email);
              setView("changePwd");
            } else {
              setView("main");
              // Register push notifications automatically
              registerPushNotification(s.id).catch(() => {});
            }
            return;
          }
        }
      } catch { /* ignore */ }
    }

    // Start DB init immediately, no splash delay
    // Add timeout fallback: if API hangs, still show login after 5 seconds
    const timeoutId = setTimeout(() => {
      if (!dbReady) {
        setDbReady(true);
        setDbError(prev => prev || "Timeout - check connection");
      }
    }, 5000);
    initDb().finally(() => {
      clearTimeout(timeoutId);
      restoreSession();
    });
    return () => clearTimeout(timeoutId);
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
        const oldStates = prevStateRef.current;
        // Detect new signals AND state changes (TP hits, SL hits)
        if (oldIds.size > 0) {
          for (const s of newSignals) {
            if (!oldIds.has(s.id)) {
              // Brand new signal — play sound + native notification
              if (!audioMuted) {
                if (isEntry(s.signalCategory)) {
                  playSound(s.type === "BUY" ? "buy" : "sell", audioVol);
                  nativeNotify(s.type === "BUY" ? "📊 إشارة شراء — " + s.pair : "📊 إشارة بيع — " + s.pair, s.type === "BUY" ? "شراء @" + s.entry : "بيع @" + s.entry, s.type === "BUY" ? "buy" : "sell");
                } else if (isTpLike(s.signalCategory)) {
                  playSound("tp", audioVol);
                  nativeNotify("🎯 تحقق هدف — " + s.pair, "هدف " + s.hitTpIndex + " تم تحقيقه", "tp_hit");
                } else if (isSlLike(s.signalCategory)) {
                  playSound("sl", audioVol);
                  nativeNotify("🛑 وقف خسارة — " + s.pair, "تم ضرب وقف الخسارة", "sl_hit");
                } else {
                  playSound("message", audioVol);
                }
              }
            } else {
              // Existing signal — detect TP/SL state changes
              const prev = oldStates.get(s.id);
              if (prev) {
                const tpChanged = s.hitTpIndex !== prev.hitTpIndex && s.hitTpIndex > prev.hitTpIndex;
                const slChanged = prev.status === "ACTIVE" && s.status === "HIT_SL";
                if (tpChanged && !audioMuted) {
                  playSound("tp", audioVol);
                  nativeNotify("🎯 تحقق هدف — " + s.pair, "هدف " + s.hitTpIndex + " تم تحقيقه", "tp_hit");
                } else if (slChanged && !audioMuted) {
                  playSound("sl", audioVol);
                  nativeNotify("🛑 وقف خسارة — " + s.pair, "تم ضرب وقف الخسارة", "sl_hit");
                }
              }
            }
          }
        }
        // Save current state for next comparison
        prevIdsRef.current = newIds;
        const stateMap = new Map<string, { hitTpIndex: number; status: string }>();
        for (const s of newSignals) {
          stateMap.set(s.id, { hitTpIndex: s.hitTpIndex, status: s.status });
        }
        prevStateRef.current = stateMap;
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

  /* ── Auto-refresh + Real-time updates ── */
  const lastCheckTimeRef = useRef<number>(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fast polling for new signals (every 3 seconds)
  const checkForUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/signals/updates?since=${lastCheckTimeRef.current}`);
      const data = await res.json();
      if (data.success && data.hasNew && data.newSignals?.length > 0) {
        // Update last check time
        lastCheckTimeRef.current = data.latestTime;
        // Fetch full signals and show notifications
        await fetchSignals();
      } else if (data.success) {
        lastCheckTimeRef.current = data.latestTime;
      }
    } catch { /* ignore */ }
  }, [fetchSignals]);

  useEffect(() => {
    if (view !== "main" || !session) return;
    setLoading(true);
    Promise.all([fetchSignals(), fetchStats()]).finally(() => setLoading(false));

    // Fast update check every 3 seconds (lightweight - only checks timestamps)
    const updateInterval = setInterval(checkForUpdates, 3000);

    // Full signal refresh every 15 seconds
    const fullInterval = setInterval(() => { fetchSignals(); fetchStats(); }, 15000);

    // Try to connect to SSE for instant updates
    try {
      const es = new EventSource("/api/signals/stream");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "signal" || data.type === "new_signal" || data.type === "tp_hit" || data.type === "sl_hit") {
            // New signal event from server - refresh immediately
            fetchSignals();
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { /* SSE not supported or disconnected - polling handles it */ };
      eventSourceRef.current = es;
    } catch { /* SSE not available - polling is the fallback */ }

    return () => {
      clearInterval(updateInterval);
      clearInterval(fullInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [view, session, fetchSignals, fetchStats, checkForUpdates]);

  /* ── Manual refresh ── */
  useEffect(() => {
    if (refreshKey === 0 || view !== "main") return;
    setLoading(true);
    Promise.all([fetchSignals(), fetchStats()]).finally(() => setLoading(false));
  }, [refreshKey]);

  /* ── Load users when admin switches to users tab ── */
  useEffect(() => {
    if (view === "main" && tab === "users" && isAdmin) {
      fetchUsers();
      fetchEmailRequests();
    }
    if (view === "main" && tab === "packages" && isAdmin) {
      fetchPackages();
    }
  }, [tab, view]);

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
      if (!data.success) {
        // Check for pending/blocked/expired status
        if (data.pending) {
          setView("pending");
          return;
        }
        if (data.blocked) {
          setView("blocked");
          return;
        }
        if (data.expired) {
          setView("expired");
          return;
        }
        setLoginErr(data.error || data.detail || "خطأ في تسجيل الدخول");
        return;
      }
      const s: AdminSession = data.admin;
      setSession(s);
      localStorage.setItem("adminSession", JSON.stringify(s));
      if (s.mustChangePwd) {
        setCpEmail(s.email);
        setView("changePwd");
      } else if (s.role === "user" && s.status === "pending") {
        setView("pending");
      } else if (s.role === "user" && s.status === "blocked") {
        setView("blocked");
      } else if (s.role === "user" && s.status === "expired") {
        setView("expired");
      } else {
        setView("main");
        // Register push notifications automatically after login
        registerPushNotification(s.id).catch(() => {});
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
    // Unregister push notifications on logout
    unregisterPushNotification().catch(() => {});
    setSession(null);
    localStorage.removeItem("adminSession");
    setEmail(""); setPwd("");
    setView("login");
    setTab("signals");
    prevIdsRef.current = new Set();
  }

  async function handleRegister() {
    setRegErr(""); setRegSuccess("");
    if (!regName || !regEmail || !regPwd) { setRegErr("جميع الحقول مطلوبة"); return; }
    if (regPwd.length < 4) { setRegErr("كلمة المرور يجب أن تكون 4 أحرف على الأقل"); return; }
    setRegLoad(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPwd }),
      });
      const data = await res.json();
      if (data.success) {
        setRegSuccess("تم إنشاء الحساب بنجاح! في انتظار موافقة الإدارة.");
        setRegName(""); setRegEmail(""); setRegPwd("");
      } else {
        setRegErr(data.error || "فشل إنشاء الحساب");
      }
    } catch { setRegErr("خطأ في الاتصال بالخادم"); }
    finally { setRegLoad(false); }
  }

  async function fetchUsers() {
    setUsersLoad(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch (e) { console.error("Fetch users:", e); }
    finally { setUsersLoad(false); }
  }

  async function fetchPackages() {
    try {
      const [pkgRes, setRes] = await Promise.all([fetch("/api/packages"), fetch("/api/settings")]);
      const pkgData = await pkgRes.json();
      const setData = await setRes.json();
      if (pkgData.success) setPackages(pkgData.packages);
      if (setData.success) setAppSettings(setData.settings);
    } catch (e) { console.error("Fetch packages:", e); }
  }

  async function handleCreatePackage() {
    if (!pkgFormName || !pkgFormDays) return;
    setPkgLoad(true);
    try {
      const res = await fetch("/api/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pkgFormName, durationDays: Number(pkgFormDays), price: Number(pkgFormPrice || 0), type: pkgFormType, description: pkgFormDesc, isActive: pkgFormActive }) });
      const data = await res.json();
      if (data.success) { setShowPkgForm(false); setPkgFormName(""); setPkgFormDays(""); setPkgFormPrice(""); setPkgFormDesc(""); fetchPackages(); }
    } catch (e) { console.error("Create package:", e); }
    finally { setPkgLoad(false); }
  }

  async function handleDeletePackage(id: string) {
    try {
      await fetch("/api/packages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      fetchPackages();
    } catch (e) { console.error("Delete package:", e); }
  }

  async function handleTogglePackage(id: string, isActive: boolean) {
    try {
      await fetch("/api/packages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive }) });
      fetchPackages();
    } catch (e) { console.error("Toggle package:", e); }
  }

  async function handleSetTrialPkg(pkgId: string) {
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ freeTrialPackageId: pkgId === appSettings.freeTrialPackageId ? null : pkgId }) });
      fetchPackages();
    } catch (e) { console.error("Set trial:", e); }
  }

  async function handleSetAutoApprove(val: boolean) {
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoApproveOnRegister: val }) });
      setAppSettings(s => ({ ...s, autoApproveOnRegister: val }));
    } catch (e) { console.error("Set auto approve:", e); }
  }

  async function handleAssignPackage(userId: string, packageId: string) {
    try {
      await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, action: "assign_package", packageId, days: assignDays ? Number(assignDays) : undefined }) });
      setShowAssignPkg(null); setAssignDays("");
      fetchUsers();
    } catch (e) { console.error("Assign package:", e); }
  }

  async function handleSetAgency(userId: string) {
    try {
      await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, action: "set_agency" }) });
      fetchUsers();
    } catch (e) { console.error("Set agency:", e); }
  }

  async function handleUserAction(id: string, action: string) {
    try {
      await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      fetchUsers();
    } catch (e) { console.error("User action:", e); }
  }

  async function handleDeleteUser(id: string) {
    try {
      await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchUsers();
    } catch (e) { console.error("Delete user:", e); }
  }

  async function handleSubmitEmailChange() {
    setEmailReqMsg("");
    if (!emailReqNew || !session?.id) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailReqNew)) { setEmailReqMsg("البريد الإلكتروني غير صالح"); return; }
    setEmailReqLoad(true);
    try {
      const res = await fetch("/api/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.id, newEmail: emailReqNew }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailReqMsg(data.message);
        setEmailReqNew("");
      } else {
        setEmailReqMsg(data.error || "فشل إرسال الطلب");
      }
    } catch { setEmailReqMsg("خطأ في الاتصال"); }
    finally { setEmailReqLoad(false); }
  }

  async function fetchEmailRequests() {
    try {
      const res = await fetch("/api/email-change");
      const data = await res.json();
      if (data.success) setEmailRequests(data.requests);
    } catch (e) { console.error("Fetch email requests:", e); }
  }

  async function handleEmailRequestAction(id: string, action: string) {
    try {
      await fetch("/api/email-change", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      fetchEmailRequests();
      fetchUsers();
    } catch (e) { console.error("Email request action:", e); }
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
     RENDER: LOGIN (VIP Premium Design)
     ═══════════════════════════════════════════════════════════════ */
  if (view === "login") {
    if (!dbReady) {
      return <SplashScreen />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        {/* Background gradient blurs */}
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-3xl p-8 space-y-7">
            {/* Logo & Title */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center shadow-lg shadow-amber-500/25">
                <svg className="w-10 h-10 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                </svg>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-white tracking-wide">ForexYemeni</h1>
                <p className="text-sm font-bold mt-1.5" style={{ color: "#FFD700" }}>VIP TRADING SIGNALS</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Email */}
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm"
                  dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
              </div>

              {/* Password */}
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="كلمة المرور"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm"
                  dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="text-slate-500 hover:text-slate-300 transition-colors">
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Error */}
              {loginErr && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center animate-[fadeIn_0.2s_ease-out] break-all leading-relaxed">{loginErr}</div>
              )}

              {/* Login Button */}
              <button
                onClick={handleLogin}
                disabled={loginLoad || !email || !pwd}
                className="w-full h-[56px] rounded-2xl gold-gradient text-black font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {loginLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تسجيل الدخول"}
              </button>
            </div>

            {/* Register Link */}
            <div className="text-center">
              <button
                onClick={() => { setView("register"); setLoginErr(""); }}
                className="text-sm font-medium transition-colors"
                style={{ color: "#FFD700" }}
              >
                ليس لديك اشتراك؟ أنشئ حسابك الآن
              </button>
            </div>

            {/* Version & DB Error */}
            <div className="text-center text-[10px] text-slate-700">الإصدار 2.0 | FOREXYEMENI VIP</div>
            {dbError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-xs text-red-400 text-center">
                ⚠️ {dbError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: REGISTER (VIP Premium Design)
     ═══════════════════════════════════════════════════════════════ */
  if (view === "register") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        {/* Background gradient blurs */}
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-3xl p-8 space-y-7">
            {/* Icon & Title */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25">
                <User className="w-10 h-10 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-white">إنشاء حساب جديد</h2>
                <p className="text-xs text-slate-400 mt-1.5">سجل الآن وانتظر موافقة الإدارة</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Full Name */}
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <User className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm"
                  dir="rtl"
                />
              </div>

              {/* Email */}
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm"
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input
                  type="password"
                  value={regPwd}
                  onChange={e => setRegPwd(e.target.value)}
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm"
                  dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleRegister()}
                />
              </div>

              {/* Error */}
              {regErr && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center">{regErr}</div>}

              {/* Success */}
              {regSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 text-[12px] text-emerald-400 text-center animate-[fadeIn_0.3s_ease-out]">
                  {regSuccess}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleRegister}
                disabled={regLoad || !regName || !regEmail || !regPwd}
                className="w-full h-[56px] rounded-2xl bg-gradient-to-r from-white to-slate-200 text-black font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg"
              >
                {regLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "طلب اشتراك"}
              </button>
            </div>

            {/* Login Link */}
            <div className="text-center">
              <button
                onClick={() => setView("login")}
                className="text-sm font-medium transition-colors"
                style={{ color: "#FFD700" }}
              >
                لديك حساب؟ سجل دخولك
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: PENDING STATUS
     ═══════════════════════════════════════════════════════════════ */
  if (view === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-3xl p-8 space-y-7 text-center">
            {/* Hourglass Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-sky-500/15 flex items-center justify-center status-pending-icon">
                <Clock className="w-10 h-10 text-sky-400" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-white">حسابك قيد المراجعة</h2>
                <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                  أهلاً بك في نادي الـ VIP! حسابك قيد المراجعة من قبل الإدارة.
                  <br />
                  سيتم إشعارك فور تفعيل حسابك.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-[56px] rounded-2xl gold-gradient text-black font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: BLOCKED STATUS
     ═══════════════════════════════════════════════════════════════ */
  if (view === "blocked") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full opacity-25" style={{ background: "radial-gradient(circle, #EF4444 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-red-500/15 shadow-2xl rounded-3xl p-8 space-y-7 text-center">
            {/* Lock Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-red-500/15 flex items-center justify-center status-pending-icon">
                <Lock className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-red-400">حساب محظور</h2>
                <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                  تم حظر حسابك من قبل الإدارة.
                  <br />
                  يرجى التواصل مع الدعم الفني للحصول على المساعدة.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-[56px] rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: EXPIRED STATUS
     ═══════════════════════════════════════════════════════════════ */
  if (view === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-3xl p-8 space-y-7 text-center">
            {/* Ban Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center status-pending-icon">
                <svg className="w-10 h-10 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0120 12c0 4.42-3.58 8-8 8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold" style={{ color: "#FFD700" }}>انتهى اشتراكك</h2>
                <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                  انتهت مدة اشتراكك في نادي الـ VIP.
                  <br />
                  يرجى التواصل مع الإدارة لتجديد الاشتراك.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-[56px] rounded-2xl gold-gradient text-black font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
            >
              تسجيل الخروج
            </button>
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#070b14" }}>
        <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(80px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-3xl p-8 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center shadow-lg shadow-amber-500/25">
                <AlertTriangle className="w-10 h-10 text-black" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-extrabold text-white">تغيير بيانات الحساب</h2>
                <p className="text-xs text-slate-400 mt-1.5">يجب تغيير البريد وكلمة المرور للمتابعة</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm" dir="ltr" />
              </div>
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm" dir="ltr" />
              </div>
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm" dir="ltr" />
              </div>
              <div className="input-glass rounded-2xl px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-sm" dir="ltr" />
              </div>
              {cpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center">{cpErr}</div>}
              <button onClick={handleChangePwd} disabled={cpLoad}
                className="w-full h-[56px] rounded-2xl gold-gradient text-black font-bold text-base hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-amber-500/20">
                {cpLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تحديث البيانات"}
              </button>
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

  const isAdmin = session?.role === "admin";

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean }[] = [
    { key: "home", label: "الرئيسية", icon: <Home className="w-5 h-5" /> },
    { key: "signals", label: "الإشارات", icon: <Activity className="w-5 h-5" />, badge: activeCount },
    { key: "dashboard", label: "الإحصائيات", icon: <BarChart3 className="w-5 h-5" /> },
    ...(isAdmin ? [{ key: "analyst" as Tab, label: "المحلل", icon: <Send className="w-5 h-5" /> }] : []),
    ...(isAdmin ? [{ key: "users" as Tab, label: "المستخدمين", icon: <User className="w-5 h-5" />, adminOnly: true }] : []),
    ...(isAdmin ? [{ key: "packages" as Tab, label: "الباقات", icon: <Package className="w-5 h-5" /> }] : []),
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
            <span className="font-bold text-white text-sm tracking-wide">ForexYemeni</span>
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

        {/* ══════ TAB: HOME — PROFESSIONAL DASHBOARD ══════ */}
        {tab === "home" && (() => {
          const activeSignals = signals.filter(s => s.status === "ACTIVE");
          const closedSignals = signals.filter(s => s.status !== "ACTIVE");
          const winClosed = closedSignals.filter(s => s.status === "HIT_TP");
          const lossClosed = closedSignals.filter(s => s.status === "HIT_SL");
          const totalPnl = closedSignals.reduce((acc, s) => acc + (s.pnlDollars ?? 0), 0);
          const totalPoints = closedSignals.reduce((acc, s) => acc + (s.pnlPoints ?? 0), 0);
          const todaySignals = signals.filter(s => {
            const d = new Date(s.createdAt);
            const now = new Date();
            return d.toDateString() === now.toDateString();
          });
          const todayWins = todaySignals.filter(s => s.status === "HIT_TP").length;
          const todayLosses = todaySignals.filter(s => s.status === "HIT_SL").length;
          const todayPnl = todaySignals.reduce((acc, s) => acc + (s.pnlDollars ?? 0), 0);
          const subDaysLeft = session?.subscriptionExpiry ? Math.max(0, Math.ceil((new Date(session.subscriptionExpiry).getTime() - Date.now()) / 86400000)) : null;
          const totalActiveUsers = users.filter(u => u.status === "active" && u.role === "user").length;
          const totalSubscribers = users.filter(u => u.subscriptionType === "subscriber").length;
          const weeklySignals = signals.filter(s => {
            const d = new Date(s.createdAt);
            const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
            return d >= weekAgo;
          });
          const weeklyWinRate = weeklySignals.length > 0 ? Math.round((weeklySignals.filter(s => s.status === "HIT_TP").length / weeklySignals.filter(s => s.status !== "ACTIVE").length) * 100) || 0 : 0;
          const streak = (() => {
            let count = 0;
            const sorted = [...closedSignals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            for (const s of sorted) {
              if (s.status === "HIT_TP") count++;
              else break;
            }
            return count;
          })();
          const hour = new Date().getHours();
          const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء الخير" : "مساء النور";
          const currentDay = new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" });

          return (
          <div className="space-y-5">

            {/* ── Welcome Hero Card ── */}
            <div className="rounded-3xl border border-amber-500/15 overflow-hidden relative" style={{ background: "linear-gradient(145deg, rgba(255,215,0,0.1) 0%, rgba(255,140,0,0.05) 40%, rgba(139,92,246,0.05) 100%)" }}>
              {/* Decorative circles */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-500/[0.07] blur-2xl" />
              <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-purple-500/[0.07] blur-2xl" />
              <div className="relative p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-[11px] text-amber-400/70 font-medium">{currentDay}</div>
                    <h1 className="text-xl font-extrabold text-white mt-1">
                      {isAdmin ? "مرحباً، المدير" : `${greeting}، ${session?.name?.split(" ")[0] || ""}`}
                    </h1>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isAdmin
                        ? `${totalActiveUsers} مستخدم نشط • ${activeSignals.length} إشارة مفتوحة`
                        : `لديك ${activeSignals.length} إشارة نشطة حالياً`
                      }
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                    {isAdmin ? <ShieldAlert className="w-6 h-6 text-black" /> : <Sparkles className="w-6 h-6 text-black" />}
                  </div>
                </div>
                {/* Quick Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/20 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06]">
                    <div className="text-lg font-extrabold text-emerald-400">{todayWins}</div>
                    <div className="text-[9px] text-emerald-400/70 font-medium">ربح اليوم</div>
                  </div>
                  <div className="bg-black/20 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06]">
                    <div className="text-lg font-extrabold text-red-400">{todayLosses}</div>
                    <div className="text-[9px] text-red-400/70 font-medium">خسارة اليوم</div>
                  </div>
                  <div className="bg-black/20 backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06]">
                    <div className={`text-lg font-extrabold ${todayPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {todayPnl >= 0 ? "+" : ""}{todayPnl > 0 ? `$${todayPnl}` : todayPnl < 0 ? `-$${Math.abs(todayPnl)}` : "$0"}
                    </div>
                    <div className="text-[9px] text-slate-500 font-medium">أرباح اليوم</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Live Pulse Indicator ── */}
            <div className="flex items-center gap-2 px-1">
              <div className="flex items-center gap-1.5 bg-emerald-500/[0.08] border border-emerald-500/15 rounded-full px-3 py-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-semibold">مباشر</span>
              </div>
              <span className="text-[10px] text-slate-500">آخر تحديث: {new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {/* ── Active Signals Summary (if any) ── */}
            {activeSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                    <span className="text-xs font-bold text-white">الإشارات النشطة</span>
                    <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">{activeSignals.length}</span>
                  </div>
                  <button onClick={() => setTab("signals")} className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5 hover:text-amber-300 transition-colors">
                    عرض الكل <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2">
                  {activeSignals.slice(0, 3).map((s, i) => {
                    const ac = entryAccent(s);
                    const isBuy = s.type === "BUY";
                    return (
                      <div key={s.id} className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                        <div className={`rounded-2xl border ${ac.border} bg-white/[0.03] p-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer`} onClick={() => setTab("signals")}>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ac.bg}`}>
                            {isBuy ? <TrendingUp className={`w-5 h-5 ${ac.text}`} /> : <TrendingDown className={`w-5 h-5 ${ac.text}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{s.pair}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                {isBuy ? "شراء" : "بيع"}
                              </span>
                              {s.timeframe && <span className="text-[8px] bg-white/[0.06] text-slate-500 px-1 py-0.5 rounded-md">{s.timeframe}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px]">
                              <span className="text-slate-400">دخول: <span className="font-mono font-semibold text-slate-200">{s.entry}</span></span>
                              <span className="text-red-400/60">وقف: <span className="font-mono font-semibold text-red-300">{s.stopLoss}</span></span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-[8px] text-emerald-400 font-semibold">نشطة</span>
                            </div>
                            <span className="text-[9px] text-slate-600">{timeAgo(s.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Performance Metrics Grid ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1 h-5 rounded-full bg-gradient-to-b from-sky-400 to-blue-500" />
                <span className="text-xs font-bold text-white">الأداء العام</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Win Rate */}
                <Glass className="p-3.5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-emerald-500/[0.06] -translate-y-4 translate-x-4" />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] text-slate-400 font-medium">نسبة الفوز</span>
                    </div>
                    <div className={`text-2xl font-extrabold ${stats && stats.winRate >= 60 ? "text-emerald-400" : stats && stats.winRate >= 40 ? "text-amber-400" : "text-red-400"}`}>
                      {stats ? `${stats.winRate}%` : "—"}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      {stats && <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-400 transition-all duration-500" style={{ width: `${stats.winRate}%` }} />}
                    </div>
                  </div>
                </Glass>

                {/* Total PnL */}
                <Glass className="p-3.5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-amber-500/[0.06] -translate-y-4 translate-x-4" />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-2">
                      <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] text-slate-400 font-medium">إجمالي الأرباح</span>
                    </div>
                    <div className={`text-2xl font-extrabold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {totalPnl >= 0 ? "+" : ""}{totalPnl > 0 ? `$${totalPnl.toLocaleString()}` : totalPnl < 0 ? `-$${Math.abs(totalPnl).toLocaleString()}` : "$0"}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">{totalPoints >= 0 ? "+" : ""}{totalPoints} نقطة</div>
                  </div>
                </Glass>

                {/* Win Streak */}
                <Glass className="p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] text-slate-400 font-medium">سلسلة الأرباح</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className={`text-2xl font-extrabold ${streak >= 3 ? "text-orange-400" : streak > 0 ? "text-amber-400" : "text-slate-500"}`}>{streak}</span>
                    <span className="text-[10px] text-slate-500 mb-1">صفقات</span>
                  </div>
                  {streak >= 3 && <div className="text-[9px] text-orange-400/70 mt-1">أداء ممتاز!</div>}
                </Glass>

                {/* Weekly Performance */}
                <Glass className="p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <PieChart className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[10px] text-slate-400 font-medium">أداء الأسبوع</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-extrabold text-sky-400">{weeklyWinRate}%</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{weeklySignals.filter(s => s.status !== "ACTIVE").length} صفقة مغلقة</div>
                </Glass>

                {/* Total Trades */}
                <Glass className="p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Hash className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] text-slate-400 font-medium">إجمالي الصفقات</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-extrabold text-purple-400">{stats?.total || 0}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{stats?.active || 0} نشطة</div>
                </Glass>

                {/* Avg Confidence */}
                <Glass className="p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] text-slate-400 font-medium">متوسط الثقة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-extrabold text-amber-400">{stats?.avgConfidence || 0}</span>
                    <Stars r={Math.round(stats?.avgConfidence || 0)} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">من 5 نجوم</div>
                </Glass>
              </div>
            </div>

            {/* ── Win/Loss Visual Bar ── */}
            {stats && (stats.hitTp + stats.hitSl) > 0 && (
              <Glass className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-bold text-white">نتائج الصفقات</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-emerald-400 font-semibold">{stats.hitTp} ربح</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-red-400 font-semibold">{stats.hitSl} خسارة</span>
                  </div>
                </div>
                <div className="h-4 rounded-2xl bg-white/[0.06] overflow-hidden flex">
                  <div className="bg-gradient-to-l from-emerald-400 to-emerald-500 h-full rounded-r-2xl transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100}%` }}>
                    {(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100 > 15 && (
                      <span className="text-[9px] font-bold text-white/90">{Math.round((stats.hitTp / (stats.hitTp + stats.hitSl)) * 100)}%</span>
                    )}
                  </div>
                  <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-2xl flex-1 flex items-center justify-center">
                    {((stats.hitSl / (stats.hitTp + stats.hitSl)) * 100) > 15 && (
                      <span className="text-[9px] font-bold text-white/90">{Math.round((stats.hitSl / (stats.hitTp + stats.hitSl)) * 100)}%</span>
                    )}
                  </div>
                </div>
              </Glass>
            )}

            {/* ── Subscription Card (User Only) ── */}
            {!isAdmin && (
              <Glass className="overflow-hidden">
                <div className="p-4" style={{ background: session?.subscriptionType && session.subscriptionType !== "none" ? "linear-gradient(135deg, rgba(56,189,248,0.06) 0%, rgba(168,85,247,0.04) 100%)" : "" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white">حالة الاشتراك</span>
                    </div>
                    {session?.subscriptionType && session.subscriptionType !== "none" && (
                      <div className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${subDaysLeft && subDaysLeft > 7 ? "bg-emerald-500/15 text-emerald-400" : subDaysLeft && subDaysLeft > 0 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                        {subDaysLeft !== null ? `${subDaysLeft} يوم متبقي` : "نشط"}
                      </div>
                    )}
                  </div>
                  {session?.subscriptionType && session.subscriptionType !== "none" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${session.subscriptionType === "subscriber" ? "bg-sky-400" : "bg-purple-400"}`} />
                        <span className={`text-[11px] font-semibold ${session.subscriptionType === "subscriber" ? "text-sky-400" : "text-purple-400"}`}>
                          {session.subscriptionType === "subscriber" ? "مشترك VIP" : "مسجل تحت وكالة"}
                        </span>
                      </div>
                      {session.packageName && (
                        <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06] flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-slate-500">الباقة</div>
                            <div className="text-[13px] font-bold text-white">{session.packageName}</div>
                          </div>
                          {session.subscriptionExpiry && (
                            <div className="text-left">
                              <div className="text-[10px] text-slate-500">الانتهاء</div>
                              <div className="text-[11px] font-semibold text-slate-300">{new Date(session.subscriptionExpiry).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Expiry progress bar */}
                      {subDaysLeft !== null && subDaysLeft > 0 && (
                        <div className="mt-1">
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${subDaysLeft > 14 ? "bg-emerald-500" : subDaysLeft > 7 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(100, (subDaysLeft / 30) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <div className="text-xs text-slate-500">لا يوجد اشتراك نشط</div>
                      <div className="text-[10px] text-slate-600 mt-1">تواصل مع الإدارة للاشتراك</div>
                    </div>
                  )}
                </div>
              </Glass>
            )}

            {/* ── Admin Quick Stats ── */}
            {isAdmin && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-purple-400 to-pink-500" />
                  <span className="text-xs font-bold text-white">إدارة سريعة</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setTab("users")} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center active:scale-95 transition-transform">
                    <Users className="w-5 h-5 text-sky-400 mx-auto mb-1.5" />
                    <div className="text-lg font-extrabold text-white">{totalActiveUsers}</div>
                    <div className="text-[9px] text-slate-500 font-medium">مستخدم نشط</div>
                  </button>
                  <button onClick={() => setTab("packages")} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center active:scale-95 transition-transform">
                    <Wallet className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                    <div className="text-lg font-extrabold text-white">{totalSubscribers}</div>
                    <div className="text-[9px] text-slate-500 font-medium">مشترك</div>
                  </button>
                  <button onClick={() => setTab("signals")} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center active:scale-95 transition-transform">
                    <Activity className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
                    <div className="text-lg font-extrabold text-white">{activeSignals.length}</div>
                    <div className="text-[9px] text-slate-500 font-medium">إشارة مفتوحة</div>
                  </button>
                </div>
              </div>
            )}

            {/* ── Top Pairs (Mini) ── */}
            {stats && stats.topPairs?.length > 0 && (
              <Glass className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-bold text-white">الأزواج الأكثر تداولاً</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {stats.topPairs.slice(0, 5).map((p, i) => {
                    const maxCount = stats.topPairs[0].count;
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-amber-500/15 text-amber-400" : i === 1 ? "bg-slate-400/10 text-slate-300" : i === 2 ? "bg-orange-500/10 text-orange-400" : "bg-white/[0.04] text-slate-500"}`}>
                          {i + 1}
                        </div>
                        <span className="text-xs font-semibold text-white w-20 truncate">{p.pair}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-l from-amber-500 to-orange-500 transition-all duration-500" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 w-6 text-left">{p.count}</span>
                      </div>
                    );
                  })}
                </div>
              </Glass>
            )}

            {/* ── Recent Activity (Last 5 Closed Signals) ── */}
            {closedSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-red-500" />
                    <span className="text-xs font-bold text-white">آخر النتائج</span>
                  </div>
                  <button onClick={() => setTab("signals")} className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5 hover:text-amber-300 transition-colors">
                    الكل <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {closedSignals.slice(0, 5).map((s, i) => {
                    const isProfit = s.status === "HIT_TP";
                    const isBuy = s.type === "BUY";
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/[0.04] bg-white/[0.02] animate-[fadeInUp_0.25s_ease-out]" style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isProfit ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                          {isProfit ? (
                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">{s.pair}</span>
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{isBuy ? "BUY" : "SELL"}</span>
                          </div>
                          <span className="text-[9px] text-slate-500">{timeAgo(s.createdAt)}</span>
                        </div>
                        <div className="text-right">
                          <div className={`text-[12px] font-extrabold font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                            {isProfit ? "+" : "-"}${Math.abs(s.pnlDollars ?? 0)}
                          </div>
                          <div className="text-[8px] text-slate-600 font-mono">{s.pnlPoints ?? 0} pts</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Buy/Sell Ratio (Visual) ── */}
            {stats && (stats.buyCount + stats.sellCount) > 0 && (
              <Glass className="p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <PieChart className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-white">توزيع الشراء والبيع</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10 p-3 text-center">
                    <ArrowUpRight className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-emerald-400">{stats.buyCount}</div>
                    <div className="text-[9px] text-emerald-400/70 font-medium">شراء</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-red-500/[0.06] border border-red-500/10 p-3 text-center">
                    <ArrowDownRight className="w-4 h-4 text-red-400 mx-auto mb-1" />
                    <div className="text-lg font-extrabold text-red-400">{stats.sellCount}</div>
                    <div className="text-[9px] text-red-400/70 font-medium">بيع</div>
                  </div>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-white/[0.06] overflow-hidden flex">
                  <div className="bg-gradient-to-l from-emerald-500 to-emerald-400 h-full rounded-r-full transition-all duration-500"
                    style={{ width: `${(stats.buyCount / (stats.buyCount + stats.sellCount)) * 100}%` }} />
                  <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-full flex-1" />
                </div>
              </Glass>
            )}

            {/* ── Motivational Footer ── */}
            <div className="text-center py-2">
              <div className="inline-flex items-center gap-1.5 bg-white/[0.03] rounded-full px-4 py-2 border border-white/[0.05]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] text-slate-400">
                  {stats && stats.winRate >= 70
                    ? "أداء استثنائي! استمر بنفس المستوى"
                    : stats && stats.winRate >= 50
                    ? "أداء جيد! يمكنك تحسين النتائج أكثر"
                    : "ركز على إدارة المخاطر واتبع الخطة"}
                </span>
              </div>
            </div>

          </div>
          );
        })()}

        {/* ══════ TAB: SIGNALS — PREMIUM DESIGN ══════ */}
        {tab === "signals" && (() => {
          const activeSignals = filtered.filter(s => isEntry(s.signalCategory) && s.status === "ACTIVE");
          const closedSignals = filtered.filter(s => !isEntry(s.signalCategory) || s.status !== "ACTIVE");
          const winClosed = closedSignals.filter(s => s.status === "HIT_TP");
          const lossClosed = closedSignals.filter(s => s.status === "HIT_SL");
          const totalClosed = closedSignals.length;
          const closedWinRate = totalClosed > 0 ? Math.round((winClosed.length / totalClosed) * 100) : 0;

          return (
          <div className="space-y-4">
            {/* ── Premium Stats Header ── */}
            {stats && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,140,0,0.03) 50%, rgba(255,215,0,0.06) 100%)" }}>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                    <span className="text-xs font-bold text-amber-400 tracking-wide">نظرة سريعة</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-white">{stats.active}</div>
                      <div className="text-[9px] text-emerald-400 font-medium">نشطة</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-white">{stats.total}</div>
                      <div className="text-[9px] text-slate-400 font-medium">إجمالي</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-amber-400">{stats.winRate}%</div>
                      <div className="text-[9px] text-slate-400 font-medium">نسبة الفوز</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-sky-400">{stats.recentWeek}</div>
                      <div className="text-[9px] text-slate-400 font-medium">هذا الأسبوع</div>
                    </div>
                  </div>
                  {totalClosed > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[9px] mb-1.5">
                        <span className="text-emerald-400 font-semibold">ربح {winClosed.length}</span>
                        <span className="text-red-400 font-semibold">خسارة {lossClosed.length}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
                        <div className="bg-gradient-to-l from-emerald-400 to-emerald-500 h-full rounded-r-full transition-all" style={{ width: `${closedWinRate}%` }} />
                        <div className="bg-gradient-to-r from-red-400 to-red-500 h-full rounded-l-full flex-1" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Filter Chips — Premium Style ── */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              {filterChips.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
                    filter === f.key
                      ? "bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/5"
                      : "bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {loading && filtered.length === 0 ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                  <Activity className="w-7 h-7 text-slate-700" />
                </div>
                <p className="text-sm font-semibold text-slate-400">لا توجد إشارات</p>
                <p className="text-[10px] text-slate-600 mt-1">ستظهر الإشارات الجديدة هنا تلقائياً</p>
              </div>
            ) : (
              <>
                {/* ── Active Signals Section ── */}
                {activeSignals.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-bold text-emerald-400">الإشارات النشطة</span>
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-md font-bold">{activeSignals.length}</span>
                    </div>
                    <div className="space-y-3">
                      {activeSignals.map((s, i) => (
                        <SignalCard key={s.id} s={s} idx={i} isAdmin={isAdmin} onUpdate={handleUpdate} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Closed Signals Section ── */}
                {closedSignals.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 rounded-full bg-slate-500" />
                      <span className="text-[11px] font-bold text-slate-400">الإشارات المغلقة</span>
                      <span className="text-[9px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded-md font-bold">{closedSignals.length}</span>
                      {totalClosed > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${closedWinRate >= 60 ? "bg-emerald-500/15 text-emerald-400" : closedWinRate >= 40 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                          {closedWinRate}%
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {closedSignals.map((s, i) => (
                        <SignalCard key={s.id} s={s} idx={i + (activeSignals.length || 0)} isAdmin={isAdmin} onUpdate={handleUpdate} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          );
        })()}

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

        {/* ══════ TAB: PACKAGES (Admin) ══════ */}
        {tab === "packages" && isAdmin && (
          <div className="space-y-4">
            {/* ── App Settings Card ── */}
            <div className="rounded-2xl border border-amber-500/15 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,140,0,0.02) 100%)" }}>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">إعدادات التسجيل</span>
                </div>
                <div className="space-y-2.5">
                  {/* Auto approve toggle */}
                  <div className="flex items-center justify-between bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                    <div>
                      <div className="text-[11px] font-semibold text-white">تفعيل تلقائي عند التسجيل</div>
                      <div className="text-[9px] text-slate-500 mt-0.5">يتم تفعيل الحساب والباقة المجانية تلقائياً بدون موافقة</div>
                    </div>
                    <button onClick={() => handleSetAutoApprove(!appSettings.autoApproveOnRegister)}
                      className={`w-11 h-6 rounded-full transition-all duration-300 relative ${appSettings.autoApproveOnRegister ? "bg-amber-500" : "bg-white/10"}`}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${appSettings.autoApproveOnRegister ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Packages List ── */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                إدارة الباقات
                <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">{packages.length}</span>
              </h2>
              <button onClick={() => setShowPkgForm(!showPkgForm)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 active:scale-95 transition-transform">
                {showPkgForm ? "إلغاء" : "+ إضافة باقة"}
              </button>
            </div>

            {/* ── Create Package Form ── */}
            {showPkgForm && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[9px] text-slate-500 mb-1 block">اسم الباقة</label>
                    <Input value={pkgFormName} onChange={e => setPkgFormName(e.target.value)} placeholder="مثال: شهرية VIP"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-9 rounded-lg text-[11px]" dir="rtl" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 mb-1 block">المدة (أيام)</label>
                    <Input type="number" value={pkgFormDays} onChange={e => setPkgFormDays(e.target.value)} placeholder="30"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-9 rounded-lg text-[11px]" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 mb-1 block">السعر ($)</label>
                    <Input type="number" value={pkgFormPrice} onChange={e => setPkgFormPrice(e.target.value)} placeholder="0"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-9 rounded-lg text-[11px]" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 mb-1 block">النوع</label>
                    <div className="flex gap-1.5">
                      {(["free", "trial", "paid"] as const).map(t => (
                        <button key={t} onClick={() => setPkgFormType(t)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${pkgFormType === t ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/[0.03] text-slate-400 border border-white/[0.06]"}`}>
                          {t === "free" ? "مجانية" : t === "trial" ? "تجربة" : "مدفوعة"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <Input value={pkgFormDesc} onChange={e => setPkgFormDesc(e.target.value)} placeholder="وصف مختصر للباقة..."
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-9 rounded-lg text-[11px]" dir="rtl" />
                <div className="flex gap-2">
                  <button onClick={handleCreatePackage} disabled={pkgLoad || !pkgFormName || !pkgFormDays}
                    className="flex-1 h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[11px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform">
                    {pkgLoad ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "إنشاء الباقة"}
                  </button>
                  <button onClick={() => setShowPkgForm(false)} className="px-4 h-9 rounded-xl bg-white/[0.04] text-slate-400 text-[11px]">إلغاء</button>
                </div>
              </div>
            )}

            {/* ── Package Cards ── */}
            {packages.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">لا توجد باقات بعد. أضف باقة لتشغيل نظام الاشتراكات.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {packages.map(pkg => {
                  const isTrial = appSettings.freeTrialPackageId === pkg.id;
                  return (
                    <div key={pkg.id} className={`rounded-xl border overflow-hidden transition-all ${isTrial ? "border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] to-orange-500/[0.03]" : pkg.isActive ? "border-white/[0.06] bg-white/[0.03]" : "border-white/[0.03] bg-white/[0.01] opacity-50"}`}>
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">{pkg.name}</span>
                              {isTrial && <span className="text-[8px] bg-amber-500/25 text-amber-400 px-1.5 py-0.5 rounded-md font-bold animate-pulse">التجربة التلقائية</span>}
                              {!pkg.isActive && <span className="text-[8px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md font-bold">معطلة</span>}
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold ${pkg.type === "free" ? "bg-emerald-500/15 text-emerald-400" : pkg.type === "trial" ? "bg-sky-500/15 text-sky-400" : "bg-purple-500/15 text-purple-400"}`}>
                                {pkg.type === "free" ? "مجانية" : pkg.type === "trial" ? "تجربة" : "مدفوعة"}
                              </span>
                            </div>
                            {pkg.description && <p className="text-[10px] text-slate-500 mt-1">{pkg.description}</p>}
                            <div className="flex items-center gap-3 mt-2 text-[10px]">
                              <span className="flex items-center gap-1 text-slate-400"><CalendarDays className="w-3 h-3" />{pkg.durationDays} يوم</span>
                              <span className="flex items-center gap-1 font-mono font-bold text-amber-400">${pkg.price}</span>
                            </div>
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1.5 mt-3 pt-3 border-t border-white/[0.04] flex-wrap">
                          <button onClick={() => handleSetTrialPkg(pkg.id)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95 ${isTrial ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/[0.04] text-slate-400 border border-white/[0.06]"}`}>
                            {isTrial ? "✓ تجربة تلقائية" : "تعيين كتجربة"}
                          </button>
                          <button onClick={() => handleTogglePackage(pkg.id, !pkg.isActive)}
                            className="px-2.5 py-1 rounded-lg text-[9px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06] active:scale-95 transition-transform">
                            {pkg.isActive ? "تعطيل" : "تفعيل"}
                          </button>
                          <button onClick={() => handleDeletePackage(pkg.id)}
                            className="px-2.5 py-1 rounded-lg text-[9px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">
                            حذف
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════ TAB: ACCOUNT ══════ */}
        {tab === "users" && isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2"><User className="w-4 h-4 text-amber-400" />إدارة المستخدمين</h2>
              <button onClick={fetchUsers} className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06] active:scale-95 transition-transform hover:bg-white/[0.08]">
                تحديث
              </button>
            </div>
            {usersLoad && <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>}
            {!usersLoad && users.length === 0 && (
              <Glass className="p-6 text-center">
                <User className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">لا يوجد مستخدمين بعد</p>
                <p className="text-[10px] text-slate-600 mt-1">المستخدمون الجدد سيظهرون هنا بعد التسجيل</p>
              </Glass>
            )}
            {!usersLoad && users.length > 0 && (
              <div className="space-y-2">
                {/* Pending Users */}
                {users.filter(u => u.status === "pending").length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[10px] text-amber-400 font-bold">بانتظار الموافقة ({users.filter(u => u.status === "pending").length})</span>
                    </div>
                    {users.filter(u => u.status === "pending").map(u => (
                      <Glass key={u.id} className="p-3 mb-2 border-amber-500/15">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                              <User className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">{u.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{u.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleUserAction(u.id, "approve")} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 active:scale-95 transition-transform">قبول</button>
                            <button onClick={() => handleDeleteUser(u.id)} className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform">رفض</button>
                          </div>
                        </div>
                      </Glass>
                    ))}
                  </div>
                )}
                {/* Active Users with Subscription Info */}
                {users.filter(u => u.status === "active").length > 0 && (() => {
                  const actives = users.filter(u => u.status === "active");
                  const subscribers = actives.filter(u => u.subscriptionType === "subscriber");
                  const agency = actives.filter(u => u.subscriptionType === "agency");
                  const noSub = actives.filter(u => !u.subscriptionType || u.subscriptionType === "none");
                  return (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-bold">نشطون ({actives.length})</span>
                      {subscribers.length > 0 && <span className="text-[8px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-md">{subscribers.length} مشترك</span>}
                      {agency.length > 0 && <span className="text-[8px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-md">{agency.length} وكالة</span>}
                    </div>
                    {actives.map(u => {
                      const isAgency = u.subscriptionType === "agency";
                      const isSub = u.subscriptionType === "subscriber";
                      const expDays = u.subscriptionExpiry ? Math.ceil((new Date(u.subscriptionExpiry).getTime() - Date.now()) / 86400000) : null;
                      return (
                        <Glass key={u.id} className="p-3 mb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${u.role === "admin" ? "bg-amber-500/15" : isAgency ? "bg-purple-500/15" : "bg-emerald-500/10"}`}>
                                <User className={`w-4 h-4 ${u.role === "admin" ? "text-amber-400" : isAgency ? "text-purple-400" : "text-emerald-400"}`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-white">{u.name}</span>
                                  {u.role === "admin" && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">مدير</span>}
                                  {isAgency && <span className="text-[8px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-md font-bold">وكالة</span>}
                                  {isSub && <span className="text-[8px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-md font-bold">مشترك</span>}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{u.email}</div>
                                {u.packageName && (
                                  <div className="flex items-center gap-1.5 mt-1 text-[9px]">
                                    <span className="text-slate-500">{u.packageName}</span>
                                    {expDays !== null && (
                                      <span className={`font-bold ${expDays > 3 ? "text-emerald-400" : expDays > 0 ? "text-amber-400" : "text-red-400"}`}>
                                        {expDays > 0 ? `${expDays} يوم متبقي` : "منتهي!"}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Action Buttons */}
                          {u.role !== "admin" && (
                            <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.04] flex-wrap">
                              <button onClick={() => setShowAssignPkg(u.id)}
                                className="px-2 py-1 rounded-lg text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform">
                                تعيين باقة
                              </button>
                              <button onClick={() => handleSetAgency(u.id)}
                                className={`px-2 py-1 rounded-lg text-[9px] font-medium active:scale-95 transition-transform ${isAgency ? "bg-purple-500/20 text-purple-400 border border-purple-500/25" : "bg-purple-500/10 text-purple-400 border border-purple-500/15"}`}>
                                {isAgency ? "✓ وكالة" : "تحويل لوكالة"}
                              </button>
                              {u.role !== "admin" && <button onClick={() => handleUserAction(u.id, "make_admin")} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/15 active:scale-95 transition-transform">ترقية</button>}
                              <button onClick={() => handleUserAction(u.id, "block")} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform">حظر</button>
                              <button onClick={() => handleDeleteUser(u.id)} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform">حذف</button>
                            </div>
                          )}
                          {/* Assign Package Dropdown */}
                          {showAssignPkg === u.id && packages.filter(p => p.isActive).length > 0 && (
                            <div className="mt-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2 animate-[fadeIn_0.2s_ease-out]">
                              <div className="flex gap-1.5 flex-wrap">
                                {packages.filter(p => p.isActive).map(pkg => (
                                  <button key={pkg.id} onClick={() => handleAssignPackage(u.id, pkg.id)}
                                    className="px-2.5 py-1.5 rounded-lg text-[9px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform">
                                    {pkg.name} ({pkg.durationDays}ي)
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <Input type="number" value={assignDays} onChange={e => setAssignDays(e.target.value)} placeholder="أيام مخصصة (اختياري)"
                                  className="flex-1 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-8 rounded-lg text-[10px]" dir="ltr" />
                                <button onClick={() => setShowAssignPkg(null)} className="px-2 h-8 rounded-lg bg-white/[0.04] text-slate-400 text-[9px]">إلغاء</button>
                              </div>
                            </div>
                          )}
                        </Glass>
                      );
                    })}
                  </div>
                  );
                })()}
                {/* Blocked Users */}
                {users.filter(u => u.status === "blocked").length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="text-[10px] text-red-400 font-bold">محظورون ({users.filter(u => u.status === "blocked").length})</span>
                    </div>
                    {users.filter(u => u.status === "blocked").map(u => (
                      <Glass key={u.id} className="p-3 mb-2 opacity-60">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">{u.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{u.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleUserAction(u.id, "unblock")} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 active:scale-95 transition-transform">فتح</button>
                            <button onClick={() => handleDeleteUser(u.id)} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform">حذف</button>
                          </div>
                        </div>
                      </Glass>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Email Change Requests (Admin) */}
            {isAdmin && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[10px] text-sky-400 font-bold">طلبات تغيير البريد</span>
                  </div>
                  <button onClick={fetchEmailRequests} className="text-[9px] text-slate-500 hover:text-slate-300">تحديث</button>
                </div>
                {emailRequests.filter(r => r.status === "pending").length === 0 && (
                  <div className="text-[10px] text-slate-600 text-center py-2">لا توجد طلبات معلقة</div>
                )}
                {emailRequests.filter(r => r.status === "pending").map(r => (
                  <Glass key={r.id} className="p-3 mb-2 border-sky-500/15">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                        <Mail className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white">{r.userName}</div>
                        <div className="text-[9px] text-slate-500">
                          <span className="line-through" dir="ltr">{r.oldEmail}</span>
                          <span className="mx-1.5 text-slate-600">→</span>
                          <span className="text-sky-400" dir="ltr">{r.newEmail}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleEmailRequestAction(r.id, "approve")} className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 active:scale-95 transition-transform">قبول</button>
                      <button onClick={() => handleEmailRequestAction(r.id, "reject")} className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform">رفض</button>
                    </div>
                  </Glass>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === "account" && session && (
          <div className="space-y-4">
            {/* Profile Info */}
            <Glass className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isAdmin ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-sky-400 to-blue-600"}`}>
                  <User className="w-6 h-6 text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{session.name}</span>
                    {isAdmin && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">مدير</span>}
                  </div>
                  <div className="text-xs text-slate-400" dir="ltr">{session.email}</div>
                </div>
              </div>
            </Glass>

            {/* ── User Subscription Status ── */}
            {!isAdmin && (
              <Glass className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                  <Crown className="w-4 h-4 text-amber-400" />
                  حالة الاشتراك
                </div>
                {session.subscriptionType && session.subscriptionType !== "none" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${session.subscriptionType === "subscriber" ? "bg-sky-400" : "bg-purple-400"}`} />
                      <span className={`text-xs font-bold ${session.subscriptionType === "subscriber" ? "text-sky-400" : "text-purple-400"}`}>
                        {session.subscriptionType === "subscriber" ? "مشترك نشط" : "مسجل تحت وكالة"}
                      </span>
                    </div>
                    {session.packageName && (
                      <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-slate-500">نوع الباقة</div>
                            <div className="text-[13px] font-bold text-white mt-0.5">{session.packageName}</div>
                          </div>
                          {session.subscriptionExpiry && (() => {
                            const days = Math.ceil((new Date(session.subscriptionExpiry).getTime() - Date.now()) / 86400000);
                            return (
                              <div className="text-center">
                                <div className="text-[10px] text-slate-500">المتبقية</div>
                                <div className={`text-lg font-extrabold mt-0.5 ${days > 7 ? "text-emerald-400" : days > 3 ? "text-amber-400" : "text-red-400"}`}>
                                  {days > 0 ? days : 0}
                                </div>
                                <div className="text-[9px] text-slate-500">يوم</div>
                              </div>
                            );
                          })()}
                        </div>
                        {session.subscriptionExpiry && (
                          <div className="pt-2 border-t border-white/[0.04]">
                            <div className="text-[10px] text-slate-500">تاريخ الانتهاء</div>
                            <div className="text-[12px] font-semibold text-slate-300 mt-0.5">{new Date(session.subscriptionExpiry).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="text-xs text-slate-500">لا يوجد اشتراك نشط حالياً</div>
                    <div className="text-[10px] text-slate-600 mt-1">تواصل مع الإدارة للاشتراك في إحدى الباقات</div>
                  </div>
                )}
              </Glass>
            )}

            {/* ── Test Notifications (Admin Only) ── */}
            {isAdmin && (
            <Glass className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
                <Bell className="w-4 h-4 text-amber-400" />
                اختبار الإشعارات
              </div>
              <div className="text-[10px] text-slate-500">
                اضغط على أي زر لتجربة الإشعار والصوت
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => {
                  nativeNotify("📊 إشارة شراء — EURUSD", "شراء @ 1.0850", "buy");
                  playSound("buy", audioVol);
                }} className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold active:scale-95 transition-transform hover:bg-emerald-500/20">
                  📊 إشارة شراء
                </button>
                <button onClick={() => {
                  nativeNotify("📊 إشارة بيع — GBPUSD", "بيع @ 1.2650", "sell");
                  playSound("sell", audioVol);
                }} className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold active:scale-95 transition-transform hover:bg-red-500/20">
                  📊 إشارة بيع
                </button>
                <button onClick={() => {
                  nativeNotify("🎯 هدف محقق — EURUSD", "TP1 تم تحقيقه بنجاح!", "tp_hit");
                  playSound("tp", audioVol);
                }} className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-semibold active:scale-95 transition-transform hover:bg-sky-500/20">
                  🎯 تحقيق هدف
                </button>
                <button onClick={() => {
                  nativeNotify("🛑 وقف خسارة — EURUSD", "تم ضرب وقف الخسارة!", "sl_hit");
                  playSound("sl", audioVol);
                }} className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold active:scale-95 transition-transform hover:bg-amber-500/20">
                  🛑 وقف خسارة
                </button>
              </div>
              <div className="pt-1 border-t border-white/[0.04]">
                <button onClick={async () => {
                  try {
                    const res = await fetch("/api/test-notification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "buy" }) });
                    const data = await res.json();
                    if (data.success) {
                      alert("تم إرسال إشارة اختبار!");
                    }
                  } catch { /* ignore */ }
                }} className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/25 text-amber-400 text-[11px] font-semibold active:scale-95 transition-transform hover:from-amber-500/25 hover:to-orange-500/25">
                  إرسال إشارة اختبار من الخادم
                </button>
              </div>
            </Glass>
            )}

            {/* ── USER: Request Email Change ── */}
            {!isAdmin && (
              <Glass className="overflow-hidden">
                <button onClick={() => setShowEmailReqSection(!showEmailReqSection)} className="w-full p-4 flex items-center justify-between text-sm text-slate-300 hover:bg-white/[0.02] transition-colors">
                  <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-sky-400" />طلب تغيير البريد الإلكتروني</span>
                  <ChevronIcon open={showEmailReqSection} />
                </button>
                {showEmailReqSection && (
                  <div className="px-4 pb-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                    <div className="text-[10px] text-slate-500 bg-white/[0.02] rounded-lg p-2">
                      لتغيير بريدك الإلكتروني، أرسل طلبا وانتظر موافقة الإدارة
                    </div>
                    <Input type="email" value={emailReqNew} onChange={e => setEmailReqNew(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                    {emailReqMsg && (
                      <div className={`rounded-xl px-3 py-2 text-xs text-center ${emailReqMsg.includes("فشل") || emailReqMsg.includes("غير صالح") || emailReqMsg.includes("مسجل") ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"}`}>
                        {emailReqMsg}
                      </div>
                    )}
                    <Button onClick={handleSubmitEmailChange} disabled={emailReqLoad || !emailReqNew} className="w-full h-10 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/25 text-xs font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-50">
                      {emailReqLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "إرسال طلب التغيير"}
                    </Button>
                  </div>
                )}
              </Glass>
            )}

            {/* Change Password (both admin and user) */}
            <Glass className="overflow-hidden">
              <button onClick={() => setShowCp(!showCp)} className="w-full p-4 flex items-center justify-between text-sm text-slate-300 hover:bg-white/[0.02] transition-colors">
                <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" />تغيير كلمة المرور</span>
                <ChevronIcon open={showCp} />
              </button>
              {showCp && (
                <div className="px-4 pb-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                  {isAdmin ? (
                    <>
                      <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                      <Input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                      <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                      <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                    </>
                  ) : (
                    <>
                      <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                      <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                      <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 rounded-xl text-sm" dir="ltr" />
                    </>
                  )}
                  {cpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400 text-center">{cpErr}</div>}
                  <Button onClick={handleChangePwd} disabled={cpLoad} className="w-full h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                    {cpLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث"}
                  </Button>
                </div>
              )}
            </Glass>

            {/* Admin Only: Clear All */}
            {isAdmin && (
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
            )}

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
