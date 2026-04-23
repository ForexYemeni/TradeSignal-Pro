"use client";

// ═══ IMPORTS ═══
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  TrendingUp, TrendingDown, Star, Target, ShieldAlert, Clock,
  Activity, Send, RefreshCw, LogOut, Lock, Mail, Zap, Eye,
  EyeOff, DollarSign, AlertTriangle, Trash2, Loader2, Radio,
  BarChart3, User, Volume2, VolumeX, Bell,
  Crown, Package, Users, CalendarDays, Settings,
  Home, Flame, Trophy, ArrowUpRight, ArrowDownRight, Hash, Globe, PieChart, Sparkles, Timer, Wallet,
  MoreHorizontal, CreditCard, Upload, CheckCircle2, XCircle, Image, Copy, Plus, Banknote,
  ShieldCheck, ShieldX, ShieldBan, WifiOff, Gift, Ticket,
  Search, Unlock, ArrowLeft, X,
} from "lucide-react";

// ═══ EXTRACTED MODULES ═══
import type { Signal, AdminSession, Stats, View, Tab, Filter, SubPackage, AppSettingsData, LocalPaymentMethodData, UsdtNetworkAddress } from "@/lib/types";
import { timeAgo, isEntry, entryAccent, isTpLike, isSlLike, nativeNotify, playSound, registerPushNotification, unregisterPushNotification, formatCountdown, warmAudio, ensureNotificationPermission, showBrowserNotification, notifySignal, shareSessionToken } from "@/lib/utils";
import { Stars, Div, Glass, SkeletonCard, SignalsLoadingSkeleton, StatsLoadingSkeleton, EmptyState, Confetti, useOnlineStatus, usePullToRefresh, ProgressRing } from "@/components/shared";
import { TpMiniCard, TradeStatusBanner, EntryCard, ClosedSignalCard, SplashScreen } from "@/components/SignalCards";



// ═══ LOCKED COUNTDOWN COMPONENT ═══
function LockedCountdown({ lockedUntil }: { lockedUntil: string }) {
  const [timeLeft, setTimeLeft] = useState({ min: 0, sec: 0 });

  useEffect(() => {
    const calc = () => {
      const diff = Math.max(0, new Date(lockedUntil).getTime() - Date.now());
      setTimeLeft({
        min: Math.floor(diff / 60000),
        sec: Math.floor((diff % 60000) / 1000),
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  return (
    <div className="flex items-center justify-center gap-4 py-2">
      {/* Minutes */}
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-red-600/15 border border-red-500/20 flex items-center justify-center">
          <span className="text-2xl font-black text-red-300 font-mono">
            {String(timeLeft.min).padStart(2, "0")}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground mt-1.5">دقيقة</span>
      </div>

      {/* Separator */}
      <div className="flex flex-col items-center gap-1 pt-2">
        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        <div className="w-1.5 h-1.5 rounded-full bg-red-400/50" />
      </div>

      {/* Seconds */}
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-red-600/15 border border-red-500/20 flex items-center justify-center">
          <span className="text-2xl font-black text-red-300 font-mono">
            {String(timeLeft.sec).padStart(2, "0")}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground mt-1.5">ثانية</span>
      </div>
    </div>
  );
}

// ═══ SIGNAL CARD WRAPPER ═══
function SignalCard({ s, idx, isAdmin, onUpdate, onDelete, isNew, statusChanged }: {
  s: Signal; idx: number; isAdmin: boolean;
  onUpdate: (id: string, status: string, tpIdx?: number) => void;
  onDelete: (id: string) => void;
  isNew?: boolean; statusChanged?: boolean;
}) {
  /* Closed signals (status !== ACTIVE) use compact card — whether category is ENTRY or TP/SL */
  if (s.status !== "ACTIVE") return <ClosedSignalCard s={s} idx={idx} isAdmin={isAdmin} onDelete={onDelete} statusChanged={statusChanged} />;
  /* Active entry signals use full card */
  if (isEntry(s.signalCategory)) return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} isNew={isNew} statusChanged={statusChanged} />;
  return <EntryCard s={s} idx={idx} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} isNew={isNew} statusChanged={statusChanged} />;
}


/* ═══════════════════════════════════════════════════════════════
   REFERRAL SECTION COMPONENT
   ═══════════════════════════════════════════════════════════════ */

function ReferralSection({ session, appSettings }: { session: any; appSettings: any }) {
  const [referralData, setReferralData] = useState<{
    enabled: boolean;
    referralCode: string | null;
    referrals: any[];
    stats: { total: number; active: number; rewarded: number; rewardDays: number; inviteeRewardDays: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralInput, setReferralInput] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [codeApplied, setCodeApplied] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session?.id) return;
    fetch(`/api/referral?userId=${session.id}`)
      .then(r => r.json())
      .then(data => { if (data.success) setReferralData(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.id]);

  // Check if user already has a referral applied
  useEffect(() => {
    if (session?.referredBy) setCodeApplied(true);
  }, [session?.referredBy]);

  async function handleApplyCode() {
    if (!referralInput.trim() || !session?.id) return;
    setApplyingCode(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.id, referralCode: referralInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setCodeApplied(true);
        setReferralInput("");
      } else {
        toast.error(data.error || "فشل تطبيق الكود");
      }
    } catch { toast.error("خطأ في الاتصال"); }
    finally { setApplyingCode(false); }
  }

  function handleCopy() {
    if (!referralData?.referralCode) return;
    const text = `انضم إلى ForexYemeni VIP واستخدم كود الاحالة: ${referralData.referralCode} للحصول على ${referralData.stats.inviteeRewardDays} أيام مجانية!`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("تم نسخ رابط الدعوة!");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return null;
  if (!referralData?.enabled) return null;

  const now = new Date();

  return (
    <div className="space-y-3">
      {/* ── Share Your Code ── */}
      <div className="rounded-2xl border border-violet-500/15 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(109,40,217,0.02) 100%)" }}>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/15 flex items-center justify-center">
              <Gift className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xs font-bold text-foreground">دعوة أصدقائك</h3>
              <p className="text-[9px] text-muted-foreground">شارك كودك واحصل على {referralData.stats.rewardDays} أيام لكل اشتراك مدفوع</p>
            </div>
          </div>

          {/* Referral Code Display */}
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-muted/50 border border-border px-3 py-2.5 text-center">
              <span className="text-lg font-black font-mono tracking-[4px] text-violet-400">{referralData.referralCode || "----"}</span>
            </div>
            <button onClick={handleCopy} className="px-4 py-2.5 rounded-xl bg-violet-500/15 border border-violet-500/20 text-violet-400 active:scale-95 transition-transform flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">{copied ? "تم!" : "نسخ"}</span>
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 border border-border p-2 text-center">
              <div className="text-sm font-black text-foreground">{referralData.stats.total}</div>
              <div className="text-[8px] text-muted-foreground">مدعو</div>
            </div>
            <div className="rounded-lg bg-emerald-500/[0.08] border border-emerald-500/15 p-2 text-center">
              <div className="text-sm font-black text-emerald-400">{referralData.stats.active}</div>
              <div className="text-[8px] text-emerald-400/60">مشترك نشط</div>
            </div>
            <div className="rounded-lg bg-violet-500/[0.08] border border-violet-500/15 p-2 text-center">
              <div className="text-sm font-black text-violet-400">{referralData.stats.rewarded * referralData.stats.rewardDays}</div>
              <div className="text-[8px] text-violet-400/60">يوم مكافأة</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Apply Referral Code ── */}
      {!codeApplied && (
        <div className="rounded-2xl border border-sky-500/15 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.05) 0%, rgba(2,132,199,0.02) 100%)" }}>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/15 flex items-center justify-center">
                <Ticket className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">لديك كود دعوة؟</h3>
                <p className="text-[9px] text-muted-foreground">أدخل كود صديقك واحصل على {referralData.stats.inviteeRewardDays} أيام إضافية</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={referralInput}
                onChange={e => setReferralInput(e.target.value.toUpperCase())}
                placeholder="أدخل كود الدعوة..."
                className="flex-1 bg-muted/50 border-border text-xs font-mono uppercase tracking-wider text-center"
                maxLength={6}
              />
              <button
                onClick={handleApplyCode}
                disabled={applyingCode || referralInput.length < 4}
                className="px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/20 text-sky-400 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40"
              >
                {applyingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تطبيق"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Code Already Applied ── */}
      {codeApplied && (
        <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-[10px] text-emerald-400">تم تطبيق كود الدعوة بنجاح</span>
        </div>
      )}

      {/* ── Referred Users List ── */}
      {referralData.referrals.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-muted/20">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold text-foreground">الأشخاص الذين دعوتهم ({referralData.referrals.length})</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {referralData.referrals.map((ref: any) => {
              const isActive = ref.subscriptionType === "subscriber" && ref.subscriptionExpiry && new Date(ref.subscriptionExpiry) > now;
              return (
                <div key={ref.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/60 text-muted-foreground"}`}>
                      {ref.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-foreground truncate">{ref.name}</div>
                      <div className="text-[8px] text-muted-foreground truncate" dir="ltr">{ref.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {ref.referralRewardClaimed && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 font-medium">مكافأة</span>
                    )}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-medium ${isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/40 text-muted-foreground"}`}>
                      {isActive ? ref.packageName || "مشترك" : ref.status === "blocked" ? "محظور" : ref.status === "pending" ? "معلق" : "غير مشترك"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */

export default function HomePage() {
  /* ── Online Status ── */
  const isOnline = useOnlineStatus();

  /* ── Instrument Categories (inside component to avoid prerender TDZ) ── */
  const INST_CATS = [
    { id: "gold", label: "الذهب", icon: "🥇" },
    { id: "currencies", label: "عملات", icon: "💱" },
    { id: "indices", label: "مؤشرات", icon: "📊" },
    { id: "oil", label: "نفط وطاقة", icon: "🛢️" },
    { id: "crypto", label: "عملات رقمية", icon: "₿" },
    { id: "metals", label: "معادن", icon: "🥈" },
  ];

  /* ── View: login shows first ── */
  const [view, setView] = useState<View>("login");
  const [session, setSession] = useState<AdminSession | null>(null);

  /* ── Login ── */
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loginLoad, setLoginLoad] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  /* ── Login Feedback States ── */
  const [loginFeedback, setLoginFeedback] = useState<null | { type: "email_not_found" | "wrong_password" | "account_locked"; attemptsLeft?: number; maxAttempts?: number; lockedUntil?: string; retryAfterMinutes?: number; email?: string }>(null);

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

  /* ── Confetti / Win Streak ── */
  const [showConfetti, setShowConfetti] = useState(false);
  const [winStreakCount, setWinStreakCount] = useState(0);
  const prevStreakRef = useRef<number>(0);

  /* ── Analyst ── */
  const [rawText, setRawText] = useState("");
  const [parseResult, setParseResult] = useState<Signal | null>(null);
  const [parseLoad, setParseLoad] = useState(false);
  const [sendLoad, setSendLoad] = useState(false);
  const [parseError, setParseError] = useState("");

  /* ── Professional Confirm Dialog ── */
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => void;
    variant: "danger" | "warning" | "info";
    confirmLabel?: string;
    icon?: React.ReactNode;
  } | null>(null);

  function askConfirm(params: {
    title: string;
    description: string;
    action: () => void;
    variant?: "danger" | "warning" | "info";
    confirmLabel?: string;
    icon?: React.ReactNode;
  }) {
    setConfirmAction({
      variant: params.variant || "warning",
      confirmLabel: params.confirmLabel,
      icon: params.icon,
      title: params.title,
      description: params.description,
      action: params.action,
    });
  }

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

  /* ── Device ID (unique per device, stored in localStorage) ── */
  function getDeviceId(): string {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("fy_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("fy_device_id", id);
    }
    return id;
  }

  /* ── OTP (shared by login & register & reset) ── */
  const [otpStep, setOtpStep] = useState<"none" | "sending" | "verifying" | "done">("none");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState<"register" | "login" | "reset">("register");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpName, setOtpName] = useState("");
  const [otpPwd, setOtpPwd] = useState("");
  const [otpVerifyToken, setOtpVerifyToken] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpIntervalId, setOtpIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Device Warning Dialog ── */
  const [deviceWarning, setDeviceWarning] = useState<{
    show: boolean;
    existingAccount: { name: string; email: string; subscriptionType?: string; packageName?: string };
    action: "login" | "register";
    blocked: boolean;
  }>({ show: false, existingAccount: { name: "", email: "" }, action: "login", blocked: false });

  /* ── Forgot Password ── */
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoad, setFpLoad] = useState(false);
  const [fpErr, setFpErr] = useState("");
  const [fpNewPwd, setFpNewPwd] = useState("");
  const [fpConfirmPwd, setFpConfirmPwd] = useState("");
  const [fpResetLoad, setFpResetLoad] = useState(false);
  const [fpShowPwd, setFpShowPwd] = useState(false);
  const [fpSuccess, setFpSuccess] = useState(false);

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
  const [appSettings, setAppSettings] = useState<AppSettingsData>({ freeTrialPackageId: null, autoApproveOnRegister: true, usdtWalletAddress: null, usdtNetwork: null, referralEnabled: false, referralRewardDays: 7, referralInviteeRewardDays: 3 });
  const [showPkgForm, setShowPkgForm] = useState(false);
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgFormName, setPkgFormName] = useState("");
  const [pkgFormDays, setPkgFormDays] = useState("");
  const [pkgFormPrice, setPkgFormPrice] = useState("");
  const [pkgFormType, setPkgFormType] = useState<"free" | "trial" | "paid">("paid");
  const [pkgFormDesc, setPkgFormDesc] = useState("");
  const [pkgFormActive, setPkgFormActive] = useState(true);
  const [pkgFormFeatures, setPkgFormFeatures] = useState("");
  const [pkgFormMaxSignals, setPkgFormMaxSignals] = useState("0");
  const [pkgFormPriority, setPkgFormPriority] = useState(false);
  const [pkgFormEarlyEntry, setPkgFormEarlyEntry] = useState(false);
  const [pkgFormInstruments, setPkgFormInstruments] = useState(["gold", "currencies"]);
  const [pkgLoad, setPkgLoad] = useState(false);
  const [showAssignPkg, setShowAssignPkg] = useState<string | null>(null);
  const [assignDays, setAssignDays] = useState("");
  const SUPER_ADMIN_EMAIL = "mhmdlybdhshay@gmail.com";

  /* ── Payment & Subscription ── */
  const [selectedPkg, setSelectedPkg] = useState<SubPackage | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"usdt" | "local" | null>(null);
  const [selectedLocalMethod, setSelectedLocalMethod] = useState<LocalPaymentMethodData | null>(null);
  const [userPaymentMethods, setUserPaymentMethods] = useState<LocalPaymentMethodData[]>([]);
  const [usdtTxid, setUsdtTxid] = useState("");
  const [selectedUsdtNetwork, setSelectedUsdtNetwork] = useState<UsdtNetworkAddress | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [paymentLoad, setPaymentLoad] = useState(false);
  const [paymentResult, setPaymentResult] = useState<null | "success" | "pending">(null);
  const [paymentRequests, setPaymentRequests] = useState<{ id: string; userId: string; userName: string; userEmail: string; packageId: string; packageName: string; amount: number; paymentMethod: string; txid?: string; proofUrl?: string; status: string; createdAt: string }[]>([]);
  const [payReqLoad, setPayReqLoad] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [paySettingsForm, setPaySettingsForm] = useState({ usdtWalletAddress: "", usdtNetwork: "TRC20" });
  const [localPaymentMethods, setLocalPaymentMethods] = useState<LocalPaymentMethodData[]>([]);
  const [showMethodForm, setShowMethodForm] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodFormName, setMethodFormName] = useState("");
  const [methodFormWallet, setMethodFormWallet] = useState("");
  const [methodFormWalletName, setMethodFormWalletName] = useState("");
  const [methodFormCurrencyName, setMethodFormCurrencyName] = useState("");
  const [methodFormCurrencyCode, setMethodFormCurrencyCode] = useState("");
  const [methodFormRate, setMethodFormRate] = useState("");
  const [methodLoad, setMethodLoad] = useState(false);

  /* ── Proof Image Modal ── */
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofModalImage, setProofModalImage] = useState<string | null>(null);
  const [proofModalLoading, setProofModalLoading] = useState(false);

  /* ── USDT Multiple Networks ── */
  const [usdtNetworks, setUsdtNetworks] = useState<UsdtNetworkAddress[]>([]);
  const [showUsdtNetworkForm, setShowUsdtNetworkForm] = useState(false);
  const [editingUsdtNetworkId, setEditingUsdtNetworkId] = useState<string | null>(null);
  const [usdtNetFormNetwork, setUsdtNetFormNetwork] = useState("TRC20");
  const [usdtNetFormAddress, setUsdtNetFormAddress] = useState("");
  /* ── Admin Payment Tab (removed: using separate sections instead) ── */

  /* ── Session Init: restore from localStorage ── */
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState("");

  /* ── Track new signal IDs for slide-in animation ── */
  const newSignalIdsRef = useRef<Set<string>>(new Set());

  /* ── Track status change signals for pulse animation ── */
  const statusChangeIdsRef = useRef<Set<string>>(new Set());

  /* ── Session Auto-Logout (30 min inactivity) ── */
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const lastActivityRef = useRef(Date.now());
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    logoutTimerRef.current = setTimeout(() => {
      setView("login");
      setSession(null);
      localStorage.removeItem("adminSession");
      toast.warning("تم تسجيل الخروج تلقائياً بسبب عدم النشاط");
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!session) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const handler = () => resetActivityTimer();
    for (const e of events) window.addEventListener(e, handler, { passive: true });
    resetActivityTimer();
    return () => {
      for (const e of events) window.removeEventListener(e, handler);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [session, resetActivityTimer]);

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
              // Share session token with Android native service for authenticated API calls
              shareSessionToken(s.id);
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
              // Brand new signal — play sound + native notification + browser notification
              if (!audioMuted) {
                if (isEntry(s.signalCategory)) {
                  const isBuy = s.type === "BUY";
                  notifySignal(isBuy ? "buy" : "sell", isBuy ? "📊 إشارة شراء — " + s.pair : "📊 إشارة بيع — " + s.pair, isBuy ? "شراء @" + s.entry : "بيع @" + s.entry, isBuy ? "buy" : "sell");
                } else if (isTpLike(s.signalCategory)) {
                  notifySignal("tp", "🎯 تحقق هدف — " + s.pair, "هدف " + s.hitTpIndex + " تم تحقيقه", "tp_hit");
                } else if (isSlLike(s.signalCategory)) {
                  notifySignal("sl", "🛑 وقف خسارة — " + s.pair, "تم ضرب وقف الخسارة", "sl_hit");
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
                // Detect partial win: SL hit but status shows HIT_TP (TPs were achieved first)
                const partialWinChanged = prev.status === "ACTIVE" && s.status === "HIT_TP" && s.partialWin;
                if (tpChanged && !audioMuted) {
                  notifySignal("tp", "🎯 تحقق هدف — " + s.pair, "هدف " + s.hitTpIndex + " تم تحقيقه", "tp_hit");
                } else if (slChanged && !audioMuted) {
                  notifySignal("sl", "🛑 وقف خسارة — " + s.pair, "تم ضرب وقف الخسارة", "sl_hit");
                } else if (partialWinChanged && !audioMuted) {
                  // Partial win: TPs were hit, then SL → still a win
                  notifySignal("tp", "🎯 ربح جزئي — " + s.pair, "تم تحقيق " + s.hitTpIndex + " أهداف ثم ضرب الوقف", "tp_hit");
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
        // Track new signal IDs for slide-in animation
        for (const s of newSignals) {
          if (!oldIds.has(s.id)) {
            newSignalIdsRef.current.add(s.id);
          } else {
            const prev = oldStates.get(s.id);
            if (prev && (prev.status !== s.status || prev.hitTpIndex !== s.hitTpIndex)) {
              statusChangeIdsRef.current.add(s.id);
            }
          }
        }
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

  /* ── Pull to refresh (for signals tab) ── */
  const handlePullRefresh = useCallback(async () => {
    await Promise.all([fetchSignals(), fetchStats()]);
  }, [fetchSignals, fetchStats]);
  const pullRefresh = usePullToRefresh(handlePullRefresh);

  /* ── Auto-refresh + Real-time updates ── */
  const lastCheckTimeRef = useRef<number>(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Listen for messages from service worker (push notification clicked)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SIGNAL_UPDATE") {
        // Push notification was clicked — refresh signals immediately
        fetchSignals();
        fetchStats();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [fetchSignals, fetchStats]);

  // Fast polling for new signals (every 2 seconds — reduced from 3 for faster detection)
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

    // Pre-warm audio context on first load
    warmAudio();
    // Ensure notification permission is granted
    ensureNotificationPermission().catch(() => {});

    // Fast update check every 2 seconds (was 3 — faster detection)
    const updateInterval = setInterval(checkForUpdates, 2000);

    // Full signal refresh every 10 seconds (was 15 — more responsive)
    const fullInterval = setInterval(() => { fetchSignals(); fetchStats(); }, 10000);

    // Try to connect to SSE for instant updates
    try {
      const es = new EventSource("/api/signals/stream");
      // Track last SSE event timestamp to prevent duplicate alerts
      const lastSseEventRef = useRef<string>("");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type;
          if (eventType === "signal" || eventType === "new_signal" || eventType === "tp_hit" || eventType === "sl_hit") {
            // ── INSTANT: Play sound + native notification IMMEDIATELY from SSE ──
            // Don't wait for fetchSignals() — use SSE data directly for speed
            const pair = data.pair || "";
            const sigType = data.signalType || "";
            const tpIndex = data.tpIndex;

            // Deduplicate: skip if same event processed recently
            const eventKey = `${eventType}:${pair}:${tpIndex || ""}`;
            if (eventKey !== lastSseEventRef.current && !audioMuted) {
              lastSseEventRef.current = eventKey;

              if (eventType === "tp_hit") {
                notifySignal("tp", "🎯 تحقق هدف — " + pair, "هدف " + (tpIndex || "?") + " تم تحقيقه", "tp_hit");
              } else if (eventType === "sl_hit") {
                notifySignal("sl", "🛑 وقف خسارة — " + pair, "تم ضرب وقف الخسارة", "sl_hit");
              } else if (eventType === "signal" || eventType === "new_signal") {
                // Use signalDirection (BUY/SELL) from SSE event
                const isBuy = data.signalDirection === "BUY";
                notifySignal(isBuy ? "buy" : "sell", (isBuy ? "📊 إشارة شراء — " : "📊 إشارة بيع — ") + pair, isBuy ? "شراء" : "بيع", isBuy ? "buy" : "sell");
              }
            }
            // Then fetch full signals to update UI (runs in parallel with notification)
            fetchSignals();
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { /* SSE not supported or disconnected - polling handles it */ };
      eventSourceRef.current = es;
    } catch { /* SSE not available - polling is the fallback */ }

    // When app returns to foreground, immediately check for updates
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Resume audio context (browser may suspend it in background)
        warmAudio();
        // Immediately fetch latest signals
        fetchSignals();
        fetchStats();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(updateInterval);
      clearInterval(fullInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
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

  /* ── Win Streak Detection & Confetti ── */
  useEffect(() => {
    if (signals.length === 0) return;
    const closed = signals.filter(s => s.status !== "ACTIVE");
    const sorted = [...closed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let streak = 0;
    for (const s of sorted) {
      if (s.status === "HIT_TP") streak++;
      else break;
    }
    if (streak >= 3 && prevStreakRef.current < 3) {
      setShowConfetti(true);
      setWinStreakCount(streak);
      setTimeout(() => setShowConfetti(false), 2500);
    }
    prevStreakRef.current = streak;
  }, [signals]);

  /* ── Load users when admin switches to users tab ── */
  useEffect(() => {
    if (view === "main" && tab === "users" && isAdmin) {
      fetchUsers();
      fetchEmailRequests();
    }
    if (view === "main" && tab === "packages") {
      fetchPackages();
      if (isAdmin) { fetchPaymentRequests(); fetchLocalPaymentMethods(); }
      if (!isAdmin) fetchUserPaymentMethods();
    }
  }, [tab, view]);

  /* ── Handlers ── */
  async function handleLogin() {
    setLoginErr("");
    setLoginFeedback(null);
    setLoginLoad(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password: pwd, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (!data.success) {
        // Check for pending/blocked/expired status
        if (data.pending) {
          setView("pending");
          return;
        }
        if (data.blocked || data.deviceBlocked) {
          if (data.deviceBlocked) {
            setDeviceWarning({
              show: true,
              existingAccount: { name: "", email: "" },
              action: "login",
              blocked: true,
            });
          } else {
            setView("blocked");
          }
          return;
        }
        if (data.expired) {
          setView("expired");
          return;
        }
        // If needOtp — redirect to OTP step
        if (data.needOtp) {
          handleSendOtp("login", email, undefined, pwd);
          setLoginLoad(false);
          return;
        }
        // Smart login feedback
        if (data.error === "email_not_found") {
          setLoginFeedback({ type: "email_not_found", email: data.email });
          return;
        }
        if (data.error === "wrong_password") {
          setLoginFeedback({
            type: "wrong_password",
            attemptsLeft: data.attemptsLeft,
            maxAttempts: data.maxAttempts,
            locked: data.locked,
            lockedUntil: data.lockedUntil,
          });
          return;
        }
        if (data.error === "account_locked") {
          setLoginFeedback({
            type: "account_locked",
            lockedUntil: data.lockedUntil || new Date(Date.now() + (data.retryAfter || 60) * 1000).toISOString(),
            retryAfterMinutes: data.retryAfterMinutes || Math.ceil((data.retryAfter || 60) / 60),
          });
          return;
        }
        setLoginErr(data.error || data.detail || "خطأ في تسجيل الدخول");
        return;
      }
      setLoginFeedback(null);
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
        // Share session token with Android native service
        shareSessionToken(s.id);
        toast.success("تم تسجيل الدخول بنجاح");
      }
    } catch { setLoginErr("خطأ في الاتصال بالخادم"); toast.error("خطأ في الاتصال بالخادم"); }
    finally { setLoginLoad(false); }
  }

  async function handleChangePwd() {
    setCpErr("");
    const isAdmin = session?.role === "admin";
    if (!cpCur || !cpNew || !cpConf) { setCpErr("جميع الحقول مطلوبة"); return; }
    if (isAdmin && !cpEmail) { setCpErr("جميع الحقول مطلوبة"); return; }
    if (cpNew !== cpConf) { setCpErr("كلمة المرور غير متطابقة"); return; }
    if (cpNew.length < 6) { setCpErr("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setCpLoad(true);
    try {
      const payload: Record<string, string> = { action: "change-password", id: session?.id || "", currentPassword: cpCur, newPassword: cpNew };
      if (isAdmin) payload.newEmail = cpEmail;
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) { setCpErr(data.error || "خطأ"); return; }
      const s: AdminSession = data.admin;
      setSession(s);
      localStorage.setItem("adminSession", JSON.stringify(s));
      setView("main");
      setCpCur(""); setCpEmail(""); setCpNew(""); setCpConf("");
      toast.success("تم تغيير كلمة المرور");
    } catch { setCpErr("خطأ في الاتصال بالخادم"); }
    finally { setCpLoad(false); }
  }

  function handleLogout() {
    // Unregister push notifications on logout
    unregisterPushNotification().catch(() => {});
    setSession(null);
    localStorage.removeItem("adminSession");
    setEmail(""); setPwd(""); setLoginFeedback(null);
    setView("login");
    setTab("signals");
    prevIdsRef.current = new Set();
    toast("تم تسجيل الخروج");
  }

  async function handleRegister() {
    setRegErr(""); setRegSuccess("");
    if (!regName || !regEmail || !regPwd) { setRegErr("جميع الحقول مطلوبة"); return; }
    if (regPwd.length < 6) { setRegErr("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    // Send OTP to verify email before registration
    handleSendOtp("register", regEmail, regName, regPwd);
  }

  /* ── OTP Helper Functions ── */
  function startOtpTimer() {
    setOtpTimer(60);
    if (otpIntervalId) clearInterval(otpIntervalId);
    const id = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    setOtpIntervalId(id);
  }

  async function handleSendOtp(purpose: "register" | "login" | "reset", targetEmail: string, targetName?: string, targetPwd?: string) {
    setOtpErr("");
    setOtpStep("sending");
    setOtpPurpose(purpose);
    setOtpEmail(targetEmail);
    setOtpName(targetName || "");
    setOtpPwd(targetPwd || "");
    setOtpCode("");
    setOtpVerifyToken("");
    setOtpVerifying(false);
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, type: purpose, name: targetName }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpStep("verifying");
        startOtpTimer();
        toast.success(data.message);
      } else {
        if (purpose === "login") {
          if (data.error.includes("غير مسجل")) {
            setLoginFeedback({ type: "email_not_found", email: targetEmail });
          } else if (data.error.includes("غير صالح") || data.error.includes("انتهت")) {
            toast.error(data.error);
          } else {
            setLoginErr(data.error || "فشل إرسال الكود");
          }
        } else if (purpose === "reset") {
          setFpErr(data.error || "فشل إرسال الكود");
          toast.error(data.error || "فشل إرسال الكود");
        } else {
          setOtpErr(data.error || "فشل إرسال الكود");
          toast.error(data.error || "فشل إرسال الكود");
        }
        setOtpStep("none");
      }
    } catch {
      setOtpErr("خطأ في الاتصال");
      toast.error("خطأ في الاتصال");
      setOtpStep("none");
    }
  }

  async function handleVerifyOtp(codeOverride?: string) {
    const code = codeOverride || otpCode;
    if (code.length !== 6) { setOtpErr("أدخل الكود كاملاً (6 أرقام)"); return; }
    if (otpVerifying) return;
    setOtpVerifying(true);
    setOtpErr("");
    try {
      // Step 1: Verify OTP code
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, otp: code, type: otpPurpose }),
      });
      const data = await res.json();
      console.log("[OTP Verify]", JSON.stringify(data));
      if (!data.success) {
        setOtpErr(data.error || "كود التحقق غير صحيح");
        setOtpVerifying(false);
        return;
      }
      // OTP verified successfully
      setOtpVerifyToken(data.verifyToken);
      // Step 2: Complete the action based on purpose
      if (otpPurpose === "reset") {
        // For password reset — go to forgot password view with token ready
        setOtpStep("done");
        setView("forgotPwd");
        toast.success("تم التحقق بنجاح. أدخل كلمة المرور الجديدة.");
      } else if (otpPurpose === "register") {
        setRegLoad(true);
        try {
          const regRes = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: otpName, email: otpEmail, password: otpPwd, verifyToken: data.verifyToken, deviceId: getDeviceId() }),
          });
          const regData = await regRes.json();
          console.log("[Register]", JSON.stringify(regData));
          if (regData.success) {
            setRegSuccess(regData.message);
            setRegName(""); setRegEmail(""); setRegPwd("");
            toast.success(regData.message);
            setView("login");
          } else if (regData.deviceBlocked) {
            setDeviceWarning({
              show: true,
              existingAccount: { name: "", email: "" },
              action: "register",
              blocked: true,
            });
            setOtpVerifying(false);
          } else {
            setOtpErr(regData.error || "فشل إنشاء الحساب");
            toast.error(regData.error || "فشل إنشاء الحساب");
            setOtpVerifying(false);
          }
        } catch (err) {
          console.error("[Register Error]", err);
          setOtpErr("خطأ في إنشاء الحساب");
          setOtpVerifying(false);
        } finally { setRegLoad(false); }
      } else if (otpPurpose === "login") {
        setLoginLoad(true);
        try {
          const loginRes = await fetch("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", email: otpEmail, password: otpPwd, verifyToken: data.verifyToken, deviceId: getDeviceId() }),
          });
          const loginData = await loginRes.json();
          console.log("[Login after OTP]", JSON.stringify(loginData));
          if (loginData.success) {
            completeLogin(loginData);
          } else if (loginData.pending) {
            setView("pending");
          } else if (loginData.blocked || loginData.deviceBlocked) {
            if (loginData.deviceBlocked) {
              setDeviceWarning({
                show: true,
                existingAccount: { name: "", email: "" },
                action: "login",
                blocked: true,
              });
            } else {
              setView("blocked");
            }
            setOtpVerifying(false);
          } else if (loginData.expired) {
            setView("expired");
          } else if (loginData.locked) {
            setOtpErr("الحساب مقفل مؤقتاً. حاول بعد " + (loginData.retryAfterMinutes || 15) + " دقيقة");
            setOtpVerifying(false);
          } else {
            // Show the actual error from the server
            const errMsg = loginData.error || "فشل تسجيل الدخول";
            setOtpErr(errMsg);
            toast.error(errMsg);
            setOtpVerifying(false);
          }
        } catch (err) {
          console.error("[Login Error]", err);
          setOtpErr("خطأ في الاتصال بالخادم");
          setOtpVerifying(false);
        } finally { setLoginLoad(false); }
      }
    } catch (err) {
      console.error("[OTP Verify Error]", err);
      setOtpErr("خطأ في الاتصال");
      setOtpVerifying(false);
    }
  }

  function resetOtp() {
    setOtpStep("none"); setOtpCode(""); setOtpVerifyToken(""); setOtpErr("");
    if (otpIntervalId) clearInterval(otpIntervalId);
    setOtpTimer(0);
  }

  /* ── Forgot Password Handler ── */
  async function handleForgotPasswordSend() {
    if (!fpEmail.trim()) { setFpErr("أدخل البريد الإلكتروني"); return; }
    setFpErr(""); setFpSuccess(false);
    setFpNewPwd(""); setFpConfirmPwd("");
    // Send OTP with type "reset"
    handleSendOtp("reset", fpEmail.trim());
  }

  async function handleResetPassword() {
    if (fpNewPwd.length < 6) { setFpErr("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (fpNewPwd !== fpConfirmPwd) { setFpErr("كلمة المرور وتأكيدها غير متطابقتين"); return; }
    if (!otpVerifyToken) { setFpErr("انتهت صلاحية رمز التحقق. أعد المحاولة."); return; }
    setFpResetLoad(true); setFpErr("");
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, verifyToken: otpVerifyToken, newPassword: fpNewPwd }),
      });
      const data = await res.json();
      if (data.success) {
        setFpSuccess(true);
        toast.success(data.message);
        setTimeout(() => {
          setView("login"); setFpEmail(""); setFpNewPwd(""); setFpConfirmPwd("");
          setFpSuccess(false); resetOtp();
        }, 2500);
      } else {
        setFpErr(data.error || "فشل إعادة تعيين كلمة المرور");
        toast.error(data.error || "فشل إعادة تعيين كلمة المرور");
      }
    } catch {
      setFpErr("خطأ في الاتصال");
      toast.error("خطأ في الاتصال");
    } finally { setFpResetLoad(false); }
  }

  function completeLogin(data: { success: boolean; admin: AdminSession; token: string }) {
    setSession(data.admin);
    localStorage.setItem("adminSession", JSON.stringify(data.admin));
    shareSessionToken(data.token);
    setEmail(""); setPwd(""); setLoginFeedback(null);
    setView("main");
    prevIdsRef.current = new Set();
    prevStateRef.current = new Map();
    resetOtp();
    toast.success("تم تسجيل الدخول بنجاح");
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
      if (setData.success) {
        setAppSettings(setData.settings);
        setUsdtNetworks(setData.settings.usdtNetworks || []);
      }
    } catch (e) { console.error("Fetch packages:", e); }
  }

  function resetPkgForm() {
    setPkgFormName(""); setPkgFormDays(""); setPkgFormPrice(""); setPkgFormType("paid");
    setPkgFormDesc(""); setPkgFormActive(true); setPkgFormFeatures("");
    setPkgFormMaxSignals("0"); setPkgFormPriority(false); setPkgFormEarlyEntry(false);
    setPkgFormInstruments(["gold", "currencies"]);
    setEditingPkgId(null); setShowPkgForm(false);
  }

  function openEditPkg(pkg: SubPackage) {
    setEditingPkgId(pkg.id);
    setPkgFormName(pkg.name); setPkgFormDays(String(pkg.durationDays)); setPkgFormPrice(String(pkg.price));
    setPkgFormType(pkg.type as "free" | "trial" | "paid"); setPkgFormDesc(pkg.description);
    setPkgFormActive(pkg.isActive); setPkgFormFeatures((pkg.features || []).join("\n"));
    setPkgFormMaxSignals(String(pkg.maxSignals || 0)); setPkgFormPriority(!!pkg.prioritySupport);
    setPkgFormEarlyEntry(!!pkg.showEntryEarly); setPkgFormInstruments(pkg.instruments || ["gold", "currencies"]); setShowPkgForm(true);
  }

  async function handleSavePackage() {
    if (!pkgFormName || !pkgFormDays) return;
    setPkgLoad(true);
    const features = pkgFormFeatures.split("\n").map(f => f.trim()).filter(Boolean);
    const body = {
      name: pkgFormName, durationDays: Number(pkgFormDays), price: Number(pkgFormPrice || 0),
      type: pkgFormType, description: pkgFormDesc, isActive: pkgFormActive,
      features, maxSignals: Number(pkgFormMaxSignals), prioritySupport: pkgFormPriority, showEntryEarly: pkgFormEarlyEntry,
      instruments: pkgFormInstruments,
    };
    try {
      const url = editingPkgId ? "/api/packages" : "/api/packages";
      const method = editingPkgId ? "PUT" : "POST";
      const payload = editingPkgId ? { id: editingPkgId, ...body } : body;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) { resetPkgForm(); fetchPackages(); toast.success(editingPkgId ? "تم تحديث الباقة بنجاح" : "تم إنشاء الباقة بنجاح"); }
      else toast.error(data.error || "فشل حفظ الباقة");
    } catch (e) { console.error("Save package:", e); toast.error("خطأ في الاتصال"); }
    finally { setPkgLoad(false); }
  }

  async function handleDeletePackage(id: string) {
    const pkg = packages.find(p => p.id === id);
    const pkgName = pkg?.name || "هذه الباقة";
    askConfirm({
      title: "حذف الباقة",
      description: `هل أنت متأكد من حذف باقة "${pkgName}"؟ سيتم فقدان جميع إعداداتها ولا يمكن التراجع عن هذا الإجراء.`,
      variant: "danger",
      confirmLabel: "نعم، حذف الباقة",
      icon: <Trash2 className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          await fetch("/api/packages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
          fetchPackages();
          toast.success("تم حذف الباقة");
        } catch (e) { console.error("Delete package:", e); }
      },
    });
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

  /* ── Referral Settings Handlers ── */
  async function handleSetReferralEnabled(val: boolean) {
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralEnabled: val }) });
      setAppSettings(s => ({ ...s, referralEnabled: val }));
    } catch (e) { console.error("Set referral enabled:", e); }
  }

  async function handleSetReferralRewardDays(val: number) {
    const days = Math.max(1, Math.min(365, val));
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralRewardDays: days }) });
      setAppSettings(s => ({ ...s, referralRewardDays: days }));
    } catch (e) { console.error("Set referral reward days:", e); }
  }

  async function handleSetReferralInviteeDays(val: number) {
    const days = Math.max(1, Math.min(365, val));
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralInviteeRewardDays: days }) });
      setAppSettings(s => ({ ...s, referralInviteeRewardDays: days }));
    } catch (e) { console.error("Set referral invitee days:", e); }
  }

  /* ── Payment Settings Handlers ── */
  async function handleSavePaymentSettings() {
    const payload: Record<string, string | number | null> = {};
    if (paySettingsForm.usdtWalletAddress) payload.usdtWalletAddress = paySettingsForm.usdtWalletAddress;
    if (paySettingsForm.usdtNetwork) payload.usdtNetwork = paySettingsForm.usdtNetwork;
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        setAppSettings(data.settings);
        // Sync USDT networks from settings
        setUsdtNetworks(data.settings.usdtNetworks || []);
        toast.success("تم حفظ إعدادات USDT");
      } else {
        toast.error(data.error || "فشل حفظ الإعدادات");
      }
    } catch (e) { console.error("Save payment settings:", e); toast.error("خطأ في الاتصال"); }
  }

  /* ── Proof Image Viewer ── */
  async function handleViewProofImage(proofUrl: string) {
    // Extract proof ID from "proof:<uuid>" format
    const proofId = proofUrl.replace("proof:", "");
    if (!proofId) { toast.error("رابط الصورة غير صالح"); return; }
    setProofModalOpen(true);
    setProofModalLoading(true);
    setProofModalImage(null);
    try {
      const res = await fetch(`/api/upload?id=${proofId}`);
      const data = await res.json();
      if (data.success && data.image) {
        setProofModalImage(data.image);
      } else {
        toast.error(data.error || "الصورة غير موجودة أو انتهت صلاحيتها");
        setProofModalOpen(false);
      }
    } catch (e) {
      console.error("View proof:", e);
      toast.error("خطأ في تحميل الصورة");
      setProofModalOpen(false);
    } finally {
      setProofModalLoading(false);
    }
  }

  /* ── USDT Network Addresses Handlers ── */
  function resetUsdtNetForm() {
    setUsdtNetFormNetwork("TRC20");
    setUsdtNetFormAddress("");
    setEditingUsdtNetworkId(null);
    setShowUsdtNetworkForm(false);
  }

  async function handleSaveUsdtNetwork() {
    if (!usdtNetFormAddress.trim()) { toast.error("عنوان المحفظة مطلوب"); return; }
    const currentNetworks = [...(appSettings.usdtNetworks || appSettings.usdtNetwork ? [{
      id: appSettings.usdtWalletAddress || "legacy",
      network: appSettings.usdtNetwork || "TRC20",
      address: appSettings.usdtWalletAddress || "",
      isActive: true,
      order: 0,
    }] : [])];
    // Remove old one being edited
    const filtered = editingUsdtNetworkId ? currentNetworks.filter(n => n.id !== editingUsdtNetworkId) : currentNetworks;
    const newNetwork = {
      id: editingUsdtNetworkId || crypto.randomUUID(),
      network: usdtNetFormNetwork,
      address: usdtNetFormAddress.trim(),
      isActive: true,
      order: filtered.length,
    };
    filtered.push(newNetwork);
    // Set first active address as default for backward compatibility
    const firstActive = filtered.find(n => n.isActive);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usdtNetworks: filtered,
          usdtWalletAddress: firstActive?.address || null,
          usdtNetwork: firstActive?.network || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAppSettings(data.settings);
        setUsdtNetworks(data.settings.usdtNetworks || []);
        resetUsdtNetForm();
        toast.success(editingUsdtNetworkId ? "تم تحديث عنوان الشبكة" : "تم إضافة عنوان الشبكة");
      } else {
        toast.error(data.error || "فشل الحفظ");
      }
    } catch (e) { console.error("Save USDT network:", e); toast.error("خطأ في الاتصال"); }
  }

  async function handleDeleteUsdtNetwork(id: string) {
    const currentNetworks = appSettings.usdtNetworks || [];
    const filtered = currentNetworks.filter(n => n.id !== id);
    const firstActive = filtered.find(n => n.isActive);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usdtNetworks: filtered,
          usdtWalletAddress: firstActive?.address || null,
          usdtNetwork: firstActive?.network || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAppSettings(data.settings);
        setUsdtNetworks(data.settings.usdtNetworks || []);
        toast.success("تم حذف عنوان الشبكة");
      } else {
        toast.error(data.error || "فشل الحذف");
      }
    } catch (e) { console.error("Delete USDT network:", e); toast.error("خطأ في الاتصال"); }
  }

  async function handleToggleUsdtNetwork(id: string, active: boolean) {
    const currentNetworks = appSettings.usdtNetworks || [];
    const updated = currentNetworks.map(n => n.id === id ? { ...n, isActive: active } : n);
    const firstActive = updated.find(n => n.isActive);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usdtNetworks: updated,
          usdtWalletAddress: firstActive?.address || null,
          usdtNetwork: firstActive?.network || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAppSettings(data.settings);
        setUsdtNetworks(data.settings.usdtNetworks || []);
        toast.success(active ? "تم تفعيل الشبكة" : "تم تعطيل الشبكة");
      } else {
        toast.error(data.error || "فشل التحديث");
      }
    } catch (e) { console.error("Toggle USDT network:", e); toast.error("خطأ في الاتصال"); }
  }

  /* ── Local Payment Methods Handlers ── */
  async function fetchLocalPaymentMethods() {
    try {
      const res = await fetch("/api/payment-methods");
      const data = await res.json();
      if (data.success) setLocalPaymentMethods(data.methods || []);
    } catch (e) { console.error("Fetch local payment methods:", e); }
  }

  async function fetchUserPaymentMethods() {
    try {
      const res = await fetch("/api/payment-methods?active=true");
      const data = await res.json();
      if (data.success) setUserPaymentMethods(data.methods || []);
    } catch (e) { console.error("Fetch user payment methods:", e); }
  }

  function resetMethodForm() {
    setMethodFormName(""); setMethodFormWallet(""); setMethodFormWalletName("");
    setMethodFormCurrencyName(""); setMethodFormCurrencyCode(""); setMethodFormRate("");
    setEditingMethodId(null); setShowMethodForm(false);
  }

  async function handleSaveMethod() {
    if (!methodFormName.trim() || !methodFormWallet.trim() || !methodFormWalletName.trim() || !methodFormCurrencyName.trim() || !methodFormCurrencyCode.trim() || !methodFormRate) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    setMethodLoad(true);
    try {
      const body = {
        name: methodFormName.trim(),
        walletAddress: methodFormWallet.trim(),
        walletName: methodFormWalletName.trim(),
        currencyName: methodFormCurrencyName.trim(),
        currencyCode: methodFormCurrencyCode.trim(),
        exchangeRate: Number(methodFormRate),
      };
      if (editingMethodId) {
        const res = await fetch("/api/payment-methods", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingMethodId, ...body }) });
        const data = await res.json();
        if (data.success) { resetMethodForm(); fetchLocalPaymentMethods(); toast.success("تم تحديث طريقة الدفع"); }
        else { toast.error(data.error || "فشل التحديث"); }
      } else {
        const res = await fetch("/api/payment-methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) { resetMethodForm(); fetchLocalPaymentMethods(); toast.success("تم إضافة طريقة الدفع"); }
        else { toast.error(data.error || "فشل الإضافة"); }
      }
    } catch (e) { console.error("Save method:", e); toast.error("خطأ في الاتصال"); }
    finally { setMethodLoad(false); }
  }

  async function handleDeleteMethod(id: string) {
    const method = localPaymentMethods.find(m => m.id === id);
    askConfirm({
      title: "حذف طريقة الدفع",
      description: `هل تريد حذف طريقة الدفع "${method?.name}"؟`,
      variant: "danger",
      confirmLabel: "نعم، حذف",
      icon: <Trash2 className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          const res = await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) { fetchLocalPaymentMethods(); toast.success("تم حذف طريقة الدفع"); }
          else { toast.error(data.error || "فشل الحذف"); }
        } catch (e) { console.error("Delete method:", e); toast.error("خطأ في الاتصال"); }
      },
    });
  }

  async function handleToggleMethod(id: string, active: boolean) {
    try {
      const res = await fetch("/api/payment-methods", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive: active }) });
      const data = await res.json();
      if (data.success) { fetchLocalPaymentMethods(); toast.success(active ? "تم تفعيل طريقة الدفع" : "تم تعطيل طريقة الدفع"); }
      else { toast.error(data.error || "فشل التحديث"); }
    } catch (e) { console.error("Toggle method:", e); toast.error("خطأ في الاتصال"); }
  }

  /* ── Payment Request Handlers ── */
  async function fetchPaymentRequests() {
    setPayReqLoad(true);
    try {
      const res = await fetch("/api/payments");
      const data = await res.json();
      if (data.success) setPaymentRequests(data.requests || []);
    } catch (e) { console.error("Fetch payment requests:", e); }
    finally { setPayReqLoad(false); }
  }

  async function handlePaymentAction(id: string, action: "approve" | "reject") {
    const req = paymentRequests.find(r => r.id === id);
    const userName = req?.userName || "";
    const pkgName = req?.packageName || "";
    askConfirm({
      title: action === "approve" ? "قبول طلب الدفع" : "رفض طلب الدفع",
      description: action === "approve" ? `هل تريد قبول طلب الدفع من "${userName}" لباقة "${pkgName}"؟ سيتم تفعيل الاشتراك فوراً.` : `هل تريد رفض طلب الدفع من "${userName}" لباقة "${pkgName}"؟ سيتم إبلاغ المستخدم بالرفض.`,
      variant: action === "approve" ? "info" : "danger",
      confirmLabel: action === "approve" ? "نعم، قبول" : "نعم، رفض",
      icon: action === "approve" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          const res = await fetch("/api/payments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, action, adminId: session?.id }) });
          const data = await res.json();
          if (data.success) { fetchPaymentRequests(); fetchUsers(); toast.success(action === "approve" ? "تم قبول طلب الدفع وتفعيل الاشتراك" : "تم رفض طلب الدفع"); }
          else { toast.error(data.error || "فشل تحديث الطلب"); }
        } catch (e) { console.error("Payment action:", e); toast.error("خطأ في الاتصال"); }
      },
    });
  }

  /* ── User Payment Handlers ── */
  async function handleUsdtPayment() {
    if (!selectedPkg || !usdtTxid.trim() || !session) return;
    setPaymentLoad(true);
    try {
      const networkName = selectedUsdtNetwork?.network || appSettings.usdtNetwork || "";
      const networkId = selectedUsdtNetwork?.id || undefined;
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.id, packageId: selectedPkg.id, packagePrice: selectedPkg.price,
          paymentMethod: "usdt",
          txId: usdtTxid.trim(),
          paymentMethodId: networkId,
          usdtNetwork: networkName,
          paymentMethodName: networkName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.autoActivated && data.blockchainVerified && data.blockchainValid) {
          // Auto-activated: blockchain verification passed
          setPaymentResult("success");
          toast.success(data.message || "تم تفعيل الاشتراك بنجاح! تم التحقق من الدفع.");
          setTimeout(() => { fetchPackages(); handleLogout(); }, 3000);
        } else if (data.requiresAdminReview) {
          // Verification failed or API error: pending admin review
          setPaymentResult("pending");
          if (data.blockchainError) {
            toast.warning(data.blockchainError, { duration: 8000 });
          }
          toast.info(data.message || "تم إرسال طلبك للمراجعة اليدوية.", { duration: 6000 });
        } else {
          setPaymentResult("success");
          toast.success(data.message || "تم تفعيل الاشتراك بنجاح!");
          setTimeout(() => { fetchPackages(); handleLogout(); }, 3000);
        }
      } else {
        toast.error(data.error || "فشل تفعيل الاشتراك");
        if (data.samePackage) resetPaymentState();
      }
    } catch (e) { console.error("USDT payment:", e); toast.error("خطأ في الاتصال"); }
    finally { setPaymentLoad(false); }
  }

  async function handleLocalPayment() {
    if (!selectedPkg || !paymentProofFile || !session || !selectedLocalMethod) return;
    setPaymentLoad(true);
    try {
      const reader = new FileReader();
      const fileDataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(paymentProofFile);
      });
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: fileDataUrl }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success || !uploadData.url) { toast.error("فشل رفع صورة الإثبات"); setPaymentLoad(false); return; }

      const localAmount = selectedPkg.price * selectedLocalMethod.exchangeRate;
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.id, packageId: selectedPkg.id, packagePrice: selectedPkg.price,
          paymentMethod: "local",
          paymentMethodId: selectedLocalMethod.id,
          paymentMethodName: selectedLocalMethod.name,
          localAmount,
          localCurrencyCode: selectedLocalMethod.currencyCode,
          proofUrl: uploadData.url,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPaymentResult("pending");
        toast.success(data.message || "تم إرسال طلب الدفع بنجاح!");
      } else {
        toast.error(data.error || "فشل إرسال طلب الدفع");
        if (data.samePackage) resetPaymentState();
      }
    } catch (e) { console.error("Local payment:", e); toast.error("خطأ في الاتصال"); }
    finally { setPaymentLoad(false); }
  }

  /* ── Cancel Subscription ── */
  async function handleCancelSubscription() {
    if (!session) return;
    askConfirm({
      title: "إلغاء الاشتراك",
      description: `هل أنت متأكد من إلغاء اشتراكك في باقة "${session.packageName}"؟ سيتم فقدان الوصول إلى الإشارات فوراً ولا يمكن التراجع عن هذا الإجراء.`,
      variant: "danger",
      confirmLabel: "نعم، إلغاء الاشتراك",
      icon: <XCircle className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          const res = await fetch("/api/subscription/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.id }) });
          const data = await res.json();
          if (data.success) {
            toast.success("تم إلغاء الاشتراك بنجاح");
            fetchPackages();
            // Update session locally
            setSession(s => s ? { ...s, subscriptionType: "none", subscriptionExpiry: undefined, packageId: undefined, packageName: undefined, status: "expired" } : s);
          } else {
            toast.error(data.error || "فشل إلغاء الاشتراك");
          }
        } catch (e) { console.error("Cancel subscription:", e); toast.error("خطأ في الاتصال"); }
      },
    });
  }

  function resetPaymentState() {
    setSelectedPkg(null); setPaymentMethod(null); setSelectedLocalMethod(null);
    setSelectedUsdtNetwork(null); setUsdtTxid("");
    setPaymentProofFile(null); setPaymentProofPreview(null);
    setPaymentLoad(false); setPaymentResult(null);
  }

  async function handleAssignPackage(userId: string, packageId: string) {
    const user = users.find(u => u.id === userId);
    const userName = user?.name || user?.email || "";
    const pkg = packages.find(p => p.id === packageId);
    const pkgName = pkg?.name || "";
    askConfirm({
      title: "تفعيل الباقة",
      description: `هل تريد تفعيل باقة "${pkgName}" للمستخدم "${userName}"؟ ${assignDays ? `المدة: ${assignDays} يوم.` : ''}`,
      variant: "info",
      confirmLabel: "نعم، تفعيل",
      icon: <Package className="w-5 h-5 text-sky-400" />,
      action: async () => {
        try {
          const res = await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, action: "assign_package", packageId, days: assignDays ? Number(assignDays) : undefined }) });
          const data = await res.json();
          if (!data.success) {
            if (data.alreadyActive) {
              askConfirm({
                title: "الباقة مفعلة بالفعل",
                description: `باقة "${data.packageName}" مفعلة بالفعل لهذا المستخدم ولم تنتهِ بعد. متبقي ${data.remainingDays} يوم على الانتهاء. لا يمكن تفعيل نفس الباقة مرتين أثناء سريانها.`,
                variant: "warning",
                confirmLabel: "فهمت",
                icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
                action: () => {},
              });
            } else {
              toast.error(data.error || "فشل تعيين الباقة");
            }
            return;
          }
          setShowAssignPkg(null); setAssignDays("");
          fetchUsers();
          toast.success("تم تفعيل الباقة بنجاح");
        } catch (e) { console.error("Assign package:", e); toast.error("خطأ في الاتصال"); }
      },
    });
  }

  async function handleSetAgency(userId: string) {
    const user = users.find(u => u.id === userId);
    const userName = user?.name || user?.email || "";
    askConfirm({
      title: "تعيين كوكالة",
      description: `هل تريد تعيين "${userName}" كوكالة؟`,
      variant: "info",
      confirmLabel: "نعم، تعيين",
      icon: <Users className="w-5 h-5 text-purple-400" />,
      action: async () => {
        try {
          await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, action: "set_agency" }) });
          fetchUsers();
          toast.success("تم تعيين الوكالة");
        } catch (e) { console.error("Set agency:", e); }
      },
    });
  }

  async function handleUserAction(id: string, action: string) {
    const user = users.find(u => u.id === id);
    const userName = user?.name || user?.email || "";

    if (action === "remove_admin") {
      askConfirm({
        title: "إزالة صلاحية المدير",
        description: `هل أنت متأكد من إزالة صلاحية المدير من "${userName}"؟ سيصبح مستخدم عادي ولن يتمكن من الوصول لإدارة النظام.`,
        variant: "warning",
        confirmLabel: "نعم، إزالة الصلاحية",
        icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
        action: () => executeUserAction(id, action, userName),
      });
      return;
    }
    if (action === "block") {
      askConfirm({
        title: "حظر المستخدم",
        description: `هل أنت متأكد من حظر "${userName}"؟ سيتم فوراً إيقاف صلاحية الوصول وستفقد جميع الاشتراكات والباقات النشطة. لا يمكن التراجع عن هذا الإجراء إلا بفتح الحظر لاحقاً.`,
        variant: "danger",
        confirmLabel: "نعم، حظر",
        icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
        action: () => executeUserAction(id, action, userName),
      });
      return;
    }
    if (action === "make_admin") {
      askConfirm({
        title: "ترقية إلى مدير",
        description: `هل تريد ترقية "${userName}" ليصبح مديراً؟ سيحصل على كامل صلاحيات إدارة النظام بما في ذلك إدارة المستخدمين والباقات والإشارات.`,
        variant: "warning",
        confirmLabel: "نعم، ترقية",
        icon: <Crown className="w-5 h-5 text-amber-400" />,
        action: () => executeUserAction(id, action, userName),
      });
      return;
    }
    if (action === "unblock") {
      askConfirm({
        title: "فتح حظر المستخدم",
        description: `هل تريد فتح حظر "${userName}" وإعادته كمتخدم نشط؟`,
        variant: "info",
        confirmLabel: "نعم، فتح الحظر",
        icon: <ShieldAlert className="w-5 h-5 text-emerald-400" />,
        action: () => executeUserAction(id, action, userName),
      });
      return;
    }
    await executeUserAction(id, action, userName);
  }

  async function executeUserAction(id: string, action: string, userName: string) {
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "فشل تحديث المستخدم");
        return;
      }
      fetchUsers();
      toast.success(action === "remove_admin" ? "تم إزالة صلاحية المدير" : action === "make_admin" ? `تم ترقية ${userName} لمدير` : "تم تحديث حالة المستخدم");
    } catch (e) { console.error("User action:", e); toast.error("خطأ في الاتصال"); }
  }

  async function handleDeleteUser(id: string) {
    const user = users.find(u => u.id === id);
    const userName = user?.name || user?.email || "";
    askConfirm({
      title: "حذف المستخدم",
      description: `هل أنت متأكد من حذف المستخدم "${userName}" نهائياً؟ سيتم حذف جميع بياناته واشتراكاته بشكل دائم ولا يمكن التراجع عن هذا الإجراء.`,
      variant: "danger",
      confirmLabel: "نعم، حذف نهائياً",
      icon: <Trash2 className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          const res = await fetch("/api/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          const data = await res.json();
          if (!data.success) {
            toast.error(data.error || "فشل حذف المستخدم");
            return;
          }
          fetchUsers();
          toast.success("تم حذف المستخدم نهائياً");
        } catch (e) { console.error("Delete user:", e); toast.error("خطأ في الاتصال"); }
      },
    });
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
    // Confirm before manual close
    if (status === "HIT_TP" || status === "HIT_SL") {
      const sig = signals.find(s => s.id === id);
      const pair = sig?.pair || "";
      const action = status === "HIT_TP" ? "إغلاق بربح" : "إغلاق بخسارة";
      askConfirm({
        title: status === "HIT_TP" ? "إغلاق الإشارة بربح" : "إغلاق الإشارة بخسارة",
        description: `هل أنت متأكد من ${action} إشارة "${pair}"؟ سيتم تحديث حالة الإشارة وإشعار المستخدمين.`,
        variant: status === "HIT_TP" ? "info" : "danger",
        confirmLabel: status === "HIT_TP" ? "نعم، إغلاق بربح" : "نعم، إغلاق بخسارة",
        icon: status === "HIT_TP" ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />,
        action: async () => {
          try {
            await fetch(`/api/signals/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status, hitTpIndex: tpIdx }),
            });
            fetchSignals(); fetchStats();
            toast.success(status === "HIT_TP" ? "تم إغلاق الإشارة بربح" : status === "HIT_SL" ? "تم إغلاق الإشارة بخسارة" : "تم التحديث");
          } catch (e) { console.error("Update:", e); }
        },
      });
      return;
    }
    try {
      await fetch(`/api/signals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, hitTpIndex: tpIdx }),
      });
      fetchSignals(); fetchStats();
      toast.success("تم التحديث");
    } catch (e) { console.error("Update:", e); }
  }

  async function handleDelete(id: string) {
    const sig = signals.find(s => s.id === id);
    const pair = sig?.pair || "";
    askConfirm({
      title: "حذف الإشارة",
      description: `هل أنت متأكد من حذف إشارة "${pair}" نهائياً؟ سيتم حذفها من النظام ولن تظهر للمستخدمين. لا يمكن التراجع عن هذا الإجراء.`,
      variant: "danger",
      confirmLabel: "نعم، حذف الإشارة",
      icon: <Trash2 className="w-5 h-5 text-red-400" />,
      action: async () => {
        try {
          await fetch(`/api/signals/${id}`, { method: "DELETE" });
          fetchSignals(); fetchStats();
          toast.success("تم حذف الإشارة");
        } catch (e) { console.error("Delete:", e); }
      },
    });
  }

  async function handleClearAll() {
    try {
      await Promise.allSettled(signals.map(s => fetch(`/api/signals/${s.id}`, { method: "DELETE" })));
      setConfirmClear(false);
      fetchSignals(); fetchStats();
      toast.success("تم حذف جميع الإشارات");
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
        toast.success("تم إرسال الإشارة بنجاح");
      }
    } catch (e) { console.error("Send:", e); }
    finally { setSendLoad(false); }
  }

  const isAdmin = session?.role === "admin";

  function getFiltered(): Signal[] {
    // ── Subscription gate: unsubscribed users see NO signals ──
    if (!isAdmin && session) {
      const hasSub = session.subscriptionType === "subscriber" && session.subscriptionExpiry && new Date(session.subscriptionExpiry).getTime() > Date.now();
      if (!hasSub) return [];
    }
    // Instrument category mapping — covers all formats from TradingView Pine Script
    const instMap: Record<string, string> = {
      "ذهب": "gold", "الذهب": "gold", "gold": "gold",
      "عملات": "currencies", "فوركس": "currencies", "الفوركس": "currencies",
      "مؤشرات": "indices",
      "نفط": "oil",
      "عملات رقمية": "crypto", "كريبتو": "crypto",
      "معادن": "metals",
    };
    const upkg = packages.find(p => p.id === session?.packageId);
    const allowed = (!isAdmin && upkg?.instruments?.length) ? upkg.instruments : null;
    let result = signals;
    switch (filter) {
      case "buy": result = result.filter(s => s.type === "BUY"); break;
      case "sell": result = result.filter(s => s.type === "SELL"); break;
      case "active": result = result.filter(s => s.status === "ACTIVE"); break;
      case "closed": result = result.filter(s => s.status !== "ACTIVE"); break;
    }
    if (allowed) {
      result = result.filter(s => {
        if (!s.instrument) return true; // no instrument info → show to all
        const normalized = (s.instrument || "").toLowerCase();
        // Check if any instrument category keyword matches
        for (const [keyword, cat] of Object.entries(instMap)) {
          if (normalized.includes(keyword.toLowerCase()) && allowed.includes(cat)) return true;
        }
        // If instrument doesn't match any known category, show it (don't hide unknown instruments)
        const matched = Object.entries(instMap).some(([keyword]) => normalized.includes(keyword.toLowerCase()));
        return !matched; // If not matched to any category, show it
      });
    }
    return result;
  }

  const activeCount = signals.filter(s => s.status === "ACTIVE").length;
  const filtered = getFiltered();

  /* ═══════════════════════════════════════════════════════════════
     DEVICE WARNING DIALOG (extracted for use in all views)
     ═══════════════════════════════════════════════════════════════ */
  const deviceWarningDialog = deviceWarning.show ? (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(16px)" }}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-sm rounded-3xl overflow-hidden"
          style={{ background: "linear-gradient(160deg, rgba(20,10,10,0.99), rgba(10,8,15,0.99))", border: deviceWarning.blocked ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(245,158,11,0.3)" }}
        >
          {/* Red/Amber top accent bar */}
          <div className="h-1" style={{ background: deviceWarning.blocked ? "linear-gradient(90deg, #dc2626, #ef4444, #f87171, #ef4444, #dc2626)" : "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)" }} />

          {/* Header with ShieldAlert icon */}
          <div className="relative px-6 pt-8 pb-4 text-center">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full opacity-20 blur-2xl" style={{ background: deviceWarning.blocked ? "#ef4444" : "#f59e0b" }} />
            <div className="relative">
              <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: deviceWarning.blocked ? "linear-gradient(145deg, rgba(239,68,68,0.15), rgba(185,28,28,0.08))" : "linear-gradient(145deg, rgba(245,158,11,0.15), rgba(217,119,6,0.08))", border: deviceWarning.blocked ? "2px solid rgba(239,68,68,0.3)" : "2px solid rgba(245,158,11,0.3)", boxShadow: deviceWarning.blocked ? "0 0 40px rgba(239,68,68,0.1)" : "0 0 40px rgba(245,158,11,0.1)" }}>
                <ShieldAlert className="w-10 h-10" style={{ color: deviceWarning.blocked ? "#f87171" : "#fbbf24" }} />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1.5">{deviceWarning.blocked ? "تم الحظر تلقائياً" : "تنبيه أمني"}</h3>
              <p className="text-[11px] font-semibold" style={{ color: deviceWarning.blocked ? "#fca5a5" : "#fcd34d" }}>{deviceWarning.blocked ? "حظر بسبب تعدد الحسابات" : "كشف حساب آخر على هذا الجهاز"}</p>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 pb-6 space-y-4">
            <div className="rounded-2xl p-4 space-y-3" style={{ background: deviceWarning.blocked ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)", border: deviceWarning.blocked ? "1px solid rgba(239,68,68,0.12)" : "1px solid rgba(245,158,11,0.12)" }}>
              {deviceWarning.blocked ? (
                <p className="text-[12px] text-white/70 leading-[1.9] text-center">تم اكتشاف محاولة استخدام <strong className="text-red-400">حسابين مختلفين</strong> من نفس الجهاز. تم حظر كلا الحسابين تلقائياً مع الحفاظ على بيانات الاشتراك. تواصل مع الإدارة لتفعيل حسابك.</p>
              ) : (
                <p className="text-[12px] text-white/70 leading-[1.9] text-center">يوجد حساب آخر مسجل على هذا الجهاز. إذا متابعتك سيتم <strong className="text-amber-400">حظر الحسابين تلقائياً</strong> بما في ذلك اشتراكاتك الحالية.</p>
              )}

              {deviceWarning.blocked && (
                <div className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[11px] text-red-400 font-bold">الحساب محظور حالياً</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">تم الحفاظ على بيانات اشتراكك. تواصل مع الإدارة عبر البريد الإلكتروني لطلب إعادة تفعيل الحساب.</p>
                </div>
              )}

              {!deviceWarning.blocked && deviceWarning.existingAccount.email && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest">الحساب المسجل على الجهاز</div>
                  <div className="text-[12px] text-white font-bold" dir="ltr">{deviceWarning.existingAccount.email}</div>
                  <div className="text-[10px] text-white/50">{deviceWarning.existingAccount.name}</div>
                  {deviceWarning.existingAccount.packageName && (
                    <div className="flex items-center gap-1.5">
                      <Crown className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-amber-400/80">{deviceWarning.existingAccount.packageName}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {deviceWarning.blocked ? (
                <button onClick={() => setDeviceWarning(w => ({ ...w, show: false }))} className="w-full py-3.5 rounded-2xl text-[13px] font-bold active:scale-[0.97] transition-all duration-200" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>فهمت</button>
              ) : (
                <button onClick={() => setDeviceWarning(w => ({ ...w, show: false }))} className="w-full py-3.5 rounded-2xl text-[13px] font-bold bg-white/5 text-white/60 border border-white/10 active:scale-[0.97] transition-all duration-200">العودة بأمان</button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  ) : null;

  /* ═══════════════════════════════════════════════════════════════
     RENDER: LOGIN (VIP Premium Design)
     ═══════════════════════════════════════════════════════════════ */
  if (view === "login") {
    if (!dbReady) {
      return <SplashScreen />;
    }
    return (
      <>
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        {/* Background: animated mesh gradient + grid */}
        <div className="absolute inset-0 bg-mesh-animated" />
        <div className="absolute inset-0 bg-grid-subtle opacity-60" />
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)", animation: "meshFloat3 18s ease-in-out infinite" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)", animation: "meshFloat2 20s ease-in-out infinite" }} />
        <div className="absolute top-[40%] left-[50%] w-60 h-60 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #FF8F00 0%, transparent 70%)", filter: "blur(80px)", transform: "translate(-50%, -50%)", animation: "meshFloat1 16s ease-in-out infinite" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="card-diamond rounded-3xl p-8 space-y-6 noise-overlay">
            {/* Logo & Title */}
            <div className="flex flex-col items-center gap-4">
              {/* Logo with animated ring */}
              <div className="relative">
                <div className="logo-ring-animated w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center shadow-lg shadow-amber-500/30" style={{ boxShadow: "0 0 30px rgba(255, 215, 0, 0.25), 0 0 60px rgba(255, 215, 0, 0.08), 0 4px 16px rgba(255, 215, 0, 0.2)" }}>
                  <svg className="w-10 h-10 text-black" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-foreground tracking-wide">ForexYemeni</h1>
                <p className="text-sm font-bold mt-1.5 gold-gradient-text-animated">VIP TRADING SIGNALS</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Email */}
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                  dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
              </div>

              {/* Password */}
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="كلمة المرور"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                  dir="ltr"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="text-muted-foreground hover:text-foreground/80 transition-colors">
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Smart Login Feedback */}
              <AnimatePresence mode="wait">
                {loginFeedback?.type === "email_not_found" && (
                  <motion.div
                    key="email-not-found"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative overflow-hidden rounded-2xl border border-amber-500/30"
                  >
                    {/* Animated gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10" />
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                    
                    <div className="relative p-5 space-y-4">
                      {/* Icon & Title */}
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-amber-300">حساب غير موجود</h3>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            البريد <span className="text-amber-400/80 font-mono text-[10px]">{loginFeedback.email}</span> غير مسجل في النظام
                          </p>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

                      {/* CTA Button */}
                      <button
                        onClick={() => { setView("register"); setLoginFeedback(null); setLoginErr(""); }}
                        className="w-full h-[44px] rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/25 flex items-center justify-center gap-2 text-amber-300 text-sm font-bold hover:from-amber-500/30 hover:to-orange-500/30 transition-all active:scale-[0.98] group"
                      >
                        <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                        أنشئ حسابك الآن
                        <ArrowUpRight className="w-3.5 h-3.5 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {loginFeedback?.type === "wrong_password" && (
                  <motion.div
                    key="wrong-password"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative overflow-hidden rounded-2xl border border-red-500/30"
                  >
                    {/* Animated gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-rose-500/5 to-orange-500/10" />
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-400 to-transparent" />

                    <div className="relative p-5 space-y-4">
                      {/* Icon & Title */}
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <ShieldAlert className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-red-300">كلمة المرور غير صحيحة</h3>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            تحقق من كلمة المرور وحاول مرة أخرى
                          </p>
                        </div>
                      </div>

                      {/* Attempts Counter */}
                      <div className="flex items-center gap-3">
                        {/* Progress Ring */}
                        <div className="relative w-14 h-14 flex-shrink-0">
                          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                            <circle
                              cx="28" cy="28" r="23" fill="none"
                              stroke={loginFeedback.attemptsLeft! <= 1 ? "#ef4444" : loginFeedback.attemptsLeft! <= 2 ? "#f97316" : "#FFD700"}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={`${(loginFeedback.attemptsLeft! / loginFeedback.maxAttempts!) * 2 * Math.PI * 23} ${2 * Math.PI * 23}`}
                              className="transition-all duration-700 ease-out"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-lg font-black ${loginFeedback.attemptsLeft! <= 1 ? "text-red-400" : loginFeedback.attemptsLeft! <= 2 ? "text-orange-400" : "text-amber-300"}`}>
                              {loginFeedback.attemptsLeft}
                            </span>
                          </div>
                        </div>

                        {/* Text Info */}
                        <div className="flex-1">
                          <div className="text-xs font-bold text-foreground">
                            محاولات متبقية
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {loginFeedback.attemptsLeft! > 2 ? (
                              <span>لديك <span className="text-amber-300 font-bold">{loginFeedback.attemptsLeft}</span> محاولات قبل قفل الحساب</span>
                            ) : loginFeedback.attemptsLeft! === 2 ? (
                              <span className="text-orange-300 font-medium">تحذير! محاولتان فقط متبقيتان</span>
                            ) : (
                              <span className="text-red-400 font-medium">محاولة أخيرة! ثم سيتم قفل الحساب</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Attempt Dots */}
                      <div className="flex items-center justify-center gap-2">
                        {Array.from({ length: loginFeedback.maxAttempts! }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              i < loginFeedback.attemptsLeft!
                                ? loginFeedback.attemptsLeft! <= 2
                                  ? "bg-orange-400 w-5"
                                  : "bg-amber-400 w-5"
                                : "bg-white/10 w-3"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {loginFeedback?.type === "account_locked" && (
                  <motion.div
                    key="account-locked"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative overflow-hidden rounded-2xl border border-red-600/40"
                  >
                    {/* Animated background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/15 via-rose-600/10 to-red-800/15" />
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse" />

                    <div className="relative p-5 space-y-4">
                      {/* Icon & Title */}
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-red-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Lock className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-red-300">تم قفل الحساب مؤقتاً</h3>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            تم تجاوز عدد المحاولات المسموحة. انتظر قبل المحاولة مرة أخرى.
                          </p>
                        </div>
                      </div>

                      {/* Countdown */}
                      <LockedCountdown lockedUntil={loginFeedback.lockedUntil!} />

                      {/* Warning */}
                      <div className="flex items-center gap-2 bg-red-500/10 rounded-xl px-3 py-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-[10px] text-red-300/80 leading-relaxed">
                          لأسباب أمنية، سيتم فتح الحساب تلقائياً بعد انتهاء المدة
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {loginErr && !loginFeedback && (
                  <motion.div
                    key="generic-error"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center break-all leading-relaxed"
                  >
                    {loginErr}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Login Button */}
              <button
                onClick={handleLogin}
                disabled={loginLoad || !email || !pwd || loginFeedback?.type === "account_locked"}
                className="w-full h-14 rounded-2xl btn-premium-gold text-base disabled:opacity-50"
              >
                {loginLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تسجيل الدخول"}
              </button>
            </div>

            {/* Forgot Password Link */}
            <div className="text-center">
              <button
                onClick={() => { setView("forgotPwd"); setFpErr(""); setFpSuccess(false); setFpEmail(""); setFpNewPwd(""); setFpConfirmPwd(""); resetOtp(); }}
                className="text-xs text-muted-foreground hover:text-amber-400/80 transition-colors"
              >
                نسيت كلمة المرور؟
              </button>
            </div>

            {/* Register Link */}
            <div className="text-center">
              <button
                onClick={() => { setView("register"); setLoginErr(""); setLoginFeedback(null); }}
                className="text-sm font-medium transition-colors hover:brightness-110"
                style={{ color: "#FFD700" }}
              >
                ليس لديك اشتراك؟ أنشئ حسابك الآن
              </button>
            </div>

            {/* Version & DB Error */}
            <div className="text-center text-[10px] text-muted-foreground/60 font-mono">v2.0 · FOREXYEMENI VIP</div>
            {dbError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-xs text-red-400 text-center">
                ⚠️ {dbError}
              </div>
            )}
          </div>
        </div>
      </div>
      {deviceWarningDialog}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: OTP VERIFICATION
     ═══════════════════════════════════════════════════════════════ */
  if (otpStep === "sending" || otpStep === "verifying") {
    return (
      <>

      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="glass-card rounded-3xl p-8 space-y-6">
            {/* Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(245, 158, 11, 0.2), 0 0 60px rgba(245, 158, 11, 0.06)" }} />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Mail className="w-10 h-10 text-black" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-foreground">تحقق من البريد الإلكتروني</h2>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  تم إرسال كود تحقق مكون من 6 أرقام إلى
                  <br />
                  <span className="text-amber-400 font-mono text-[11px]">{otpEmail}</span>
                </p>
              </div>
            </div>

            {/* OTP Input — Single Field */}
            <div className="space-y-4">
              <div className="flex justify-center" dir="ltr">
                <input
                  ref={el => { otpInputRef.current = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                    setOtpCode(val);
                    setOtpVerifying(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && otpCode.length === 6 && !otpVerifying) {
                      handleVerifyOtp();
                    }
                  }}
                  placeholder="000000"
                  className="glass-input w-full max-w-[280px] h-[64px] text-center text-2xl font-bold tracking-[0.4em] rounded-2xl text-foreground bg-transparent border-none outline-none focus:ring-2 focus:ring-amber-400/50 transition-all placeholder:text-muted-foreground/30 font-mono"
                />
              </div>

              {/* Error */}
              {otpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center">{otpErr}</div>}

              {/* Verify Button */}
              <button
                onClick={() => handleVerifyOtp()}
                disabled={otpCode.length !== 6 || otpStep === "done" || otpVerifying}
                className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {otpVerifying ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  "تحقق"
                )}
              </button>

              {/* Resend Timer / Resend Link */}
              <div className="text-center">
                {otpTimer > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    إعادة الإرسال بعد <span className="text-amber-400 font-mono font-bold">{otpTimer}</span> ثانية
                  </p>
                ) : (
                  <button
                    onClick={() => handleSendOtp(otpPurpose, otpEmail, otpName || undefined, otpPwd || undefined)}
                    className="text-sm font-medium transition-colors hover:brightness-110"
                    style={{ color: "#FFD700" }}
                  >
                    إعادة إرسال الكود
                  </button>
                )}
              </div>
            </div>

            {/* Back Button */}
            <div className="text-center">
              <button
                onClick={() => { resetOtp(); setView(otpPurpose === "register" ? "register" : otpPurpose === "reset" ? "forgotPwd" : "login"); }}
                className="text-sm text-muted-foreground hover:text-amber-400/70 transition-colors"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      </div>
      {deviceWarningDialog}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: FORGOT PASSWORD
     ═══════════════════════════════════════════════════════════════ */
  if (view === "forgotPwd") {
    const showNewPwdForm = otpVerifyToken && otpStep === "done";
    if (fpSuccess) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
          <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
          <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)" }} />
          <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
            <div className="glass-card rounded-3xl p-8 space-y-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(16, 185, 129, 0.2), 0 0 60px rgba(16, 185, 129, 0.06)" }} />
                  <div className="relative w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20">
                    <Sparkles className="w-8 h-8 text-emerald-400" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-foreground">تم بنجاح</h2>
                <p className="text-sm text-muted-foreground">تم إعادة تعيين كلمة المرور. جاري التحويل...</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="glass-card rounded-3xl p-8 space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(245, 158, 11, 0.2), 0 0 60px rgba(245, 158, 11, 0.06)" }} />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Lock className="w-8 h-8 text-black" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-foreground">
                {showNewPwdForm ? "كلمة المرور الجديدة" : "نسيت كلمة المرور"}
              </h1>
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                {showNewPwdForm
                  ? "أدخل كلمة المرور الجديدة مع التأكيد"
                  : "أدخل بريدك الإلكتروني وسنرسل لك كود تحقق لإعادة تعيين كلمة المرور"}
              </p>
            </div>

            {fpErr && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center break-all leading-relaxed">
                {fpErr}
              </div>
            )}

            {!showNewPwdForm ? (
              <div className="space-y-4">
                <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="email"
                    value={fpEmail}
                    onChange={e => { setFpEmail(e.target.value); setFpErr(""); }}
                    placeholder="البريد الإلكتروني"
                    className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                    dir="ltr"
                    onKeyDown={e => e.key === "Enter" && !fpLoad && handleForgotPasswordSend()}
                  />
                </div>
                <button
                  onClick={handleForgotPasswordSend}
                  disabled={fpLoad || !fpEmail.trim()}
                  className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  {fpLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "إرسال كود التحقق"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    type={fpShowPwd ? "text" : "password"}
                    value={fpNewPwd}
                    onChange={e => { setFpNewPwd(e.target.value); setFpErr(""); }}
                    placeholder="كلمة المرور الجديدة"
                    className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setFpShowPwd(!fpShowPwd)} className="text-muted-foreground hover:text-foreground/80 transition-colors">
                    {fpShowPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <input
                    type={fpShowPwd ? "text" : "password"}
                    value={fpConfirmPwd}
                    onChange={e => { setFpConfirmPwd(e.target.value); setFpErr(""); }}
                    placeholder="تأكيد كلمة المرور"
                    className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                    dir="ltr"
                    onKeyDown={e => e.key === "Enter" && !fpResetLoad && handleResetPassword()}
                  />
                </div>
                <button
                  onClick={handleResetPassword}
                  disabled={fpResetLoad || !fpNewPwd || !fpConfirmPwd}
                  className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  {fpResetLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "إعادة تعيين كلمة المرور"}
                </button>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => { setView("login"); setFpErr(""); setFpSuccess(false); setFpEmail(""); setFpNewPwd(""); setFpConfirmPwd(""); resetOtp(); }}
                className="text-sm text-muted-foreground hover:text-amber-400/70 transition-colors"
              >
                رجوع لتسجيل الدخول
              </button>
            </div>
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
      <>
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        {/* Background gradient blurs */}
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="glass-card rounded-3xl p-8 space-y-6">
            {/* Icon & Title */}
            <div className="flex flex-col items-center gap-4">
              {/* Cyan glow behind icon */}
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(14, 165, 233, 0.2), 0 0 60px rgba(14, 165, 233, 0.06)" }} />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
                  <User className="w-10 h-10 text-white" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-foreground">إنشاء حساب جديد</h2>
                <p className="text-xs text-muted-foreground mt-1.5">سجل الآن وانتظر موافقة الإدارة</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Full Name */}
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <User className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                  dir="rtl"
                />
              </div>

              {/* Email */}
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  type="password"
                  value={regPwd}
                  onChange={e => setRegPwd(e.target.value)}
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
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
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-white to-slate-200 text-black font-bold text-base hover:brightness-95 transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg"
              >
                {regLoad ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "طلب اشتراك"}
              </button>
            </div>

            {/* Login Link */}
            <div className="text-center">
              <button
                onClick={() => { setView("login"); setLoginErr(""); setLoginFeedback(null); }}
                className="text-sm font-medium transition-colors hover:brightness-110"
                style={{ color: "#FFD700" }}
              >
                لديك حساب؟ سجل دخولك
              </button>
            </div>
          </div>
        </div>
      </div>
      {deviceWarningDialog}
      </>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER: PENDING STATUS
     ═══════════════════════════════════════════════════════════════ */
  if (view === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="glass-card rounded-3xl p-8 space-y-6 text-center">
            {/* Hourglass Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(14, 165, 233, 0.2), 0 0 60px rgba(14, 165, 233, 0.06)" }} />
                <div className="relative w-20 h-20 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center status-pending-icon">
                  <Clock className="w-10 h-10 text-sky-400" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-foreground">حسابك قيد المراجعة</h2>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  أهلاً بك في نادي الـ VIP! حسابك قيد المراجعة من قبل الإدارة.
                  <br />
                  سيتم إشعارك فور تفعيل حسابك.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] shadow-lg shadow-amber-500/20"
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] right-[-10%] w-80 h-80 rounded-full opacity-25" style={{ background: "radial-gradient(circle, #EF4444 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] left-[-10%] w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #991b1b 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="card-danger rounded-3xl p-8 space-y-6 text-center" style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            {/* Lock Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(239, 68, 68, 0.25), 0 0 60px rgba(239, 68, 68, 0.08)" }} />
                <div className="relative w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center status-pending-icon">
                  <Lock className="w-10 h-10 text-red-400" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-red-400">حساب محظور</h2>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  تم حظر حسابك من قبل الإدارة.
                  <br />
                  يرجى التواصل مع الدعم الفني للحصول على المساعدة.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-base hover:brightness-110 hover:shadow-red-500/30 hover:shadow-xl transition-all active:scale-[0.97] shadow-lg shadow-red-500/20"
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #FF8F00 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="card-premium rounded-3xl p-8 space-y-6 text-center">
            {/* Ban Icon */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 30px rgba(255, 215, 0, 0.25), 0 0 60px rgba(255, 215, 0, 0.08)" }} />
                <div className="relative w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center status-pending-icon">
                  <svg className="w-10 h-10 text-black" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0120 12c0 4.42-3.58 8-8 8z" />
                  </svg>
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold gold-gradient-text">انتهى اشتراكك</h2>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  انتهت مدة اشتراكك في نادي الـ VIP.
                  <br />
                  يرجى التواصل مع الإدارة لتجديد الاشتراك.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] shadow-lg shadow-amber-500/20"
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #FFD700 0%, transparent 70%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #00E676 0%, transparent 70%)", filter: "blur(100px)" }} />

        <div className="w-full max-w-[480px] animate-[fadeInUp_0.5s_ease-out] relative z-10">
          <div className="glass-card rounded-3xl p-8 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: "0 0 40px rgba(255, 215, 0, 0.25), 0 0 80px rgba(255, 215, 0, 0.08)" }} />
                <div className="relative w-20 h-20 rounded-2xl gold-gradient flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <AlertTriangle className="w-10 h-10 text-black" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-extrabold text-foreground">تغيير بيانات الحساب</h2>
                <p className="text-xs text-muted-foreground mt-1.5">يجب تغيير البريد وكلمة المرور للمتابعة</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm" dir="ltr" />
              </div>
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm" dir="ltr" />
              </div>
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm" dir="ltr" />
              </div>
              <div className="glass-input-premium px-4 h-[60px] flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                  className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm" dir="ltr" />
              </div>
              {cpErr && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12px] text-red-400 text-center">{cpErr}</div>}
              <button onClick={handleChangePwd} disabled={cpLoad}
                className="w-full h-14 rounded-2xl gold-gradient text-black font-bold text-base hover:brightness-110 hover:shadow-amber-500/30 hover:shadow-xl transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-amber-500/20">
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean }[] = [
    { key: "home", label: "الرئيسية", icon: <Home className="w-5 h-5" /> },
    { key: "signals", label: "الإشارات", icon: <Activity className="w-5 h-5" />, badge: activeCount },
    { key: "dashboard", label: "الإحصائيات", icon: <BarChart3 className="w-5 h-5" /> },
    ...(isAdmin ? [{ key: "analyst" as Tab, label: "المحلل", icon: <Send className="w-5 h-5" /> }] : []),
    ...(isAdmin ? [{ key: "users" as Tab, label: "المستخدمين", icon: <User className="w-5 h-5" />, adminOnly: true }] : []),
    { key: "packages" as Tab, label: isAdmin ? "الباقات" : "الاشتراك", icon: <Package className="w-5 h-5" /> },
    { key: "account", label: "الحساب", icon: <User className="w-5 h-5" /> },
  ];

  const mainContent = (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #080d1a 0%, #0f172a 50%, #080d1a 100%)" }}>
      {/* ── Confetti ── */}
      <Confetti show={showConfetti} />
      {showConfetti && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[101] animate-[fadeInUp_0.4s_ease-out]">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-black px-4 py-2 rounded-xl text-xs font-bold shadow-lg">
            🔥 سلسلة ربح ممتازة! ({winStreakCount} صفقات)
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass-nav-premium glass-nav-border-animated border-b border-white/[0.04]">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo + Online Status */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25" style={{ boxShadow: "0 2px 8px rgba(255, 215, 0, 0.2), 0 0 16px rgba(255, 215, 0, 0.08)" }}>
              <Crown className="w-3.5 h-3.5 text-black" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-foreground text-[13px] tracking-wide leading-tight">ForexYemeni</span>
              <div className="flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isOnline ? "bg-emerald-400" : "bg-red-400"}`} />
                </span>
                <span className={`text-[9px] font-medium ${isOnline ? "text-emerald-400" : "text-red-400"}`}>{isOnline ? "متصل" : "غير متصل"}</span>
              </div>
            </div>
          </div>
          {/* Controls */}
          <div className="flex items-center gap-1">
            {/* Audio Controls */}
            <button onClick={() => setAudioMuted(!audioMuted)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all duration-300 hover:shadow-sm active:scale-90">
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {/* Volume slider (inline, shows when not muted) */}
            {!audioMuted && (
              <div className="flex items-center gap-1.5 px-1">
                <input type="range" min="0" max="100" value={audioVol * 100} onChange={e => setAudioVol(Number(e.target.value) / 100)}
                  className="w-14 h-1 accent-amber-500 bg-white/[0.08] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(251,191,36,0.4)]" />
              </div>
            )}
            {/* Refresh */}
            <button onClick={() => setRefreshKey(k => k + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-white/[0.06] transition-all duration-300 hover:shadow-sm active:scale-90">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {/* Logout */}
            <button onClick={handleLogout} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/[0.08] transition-all duration-300 hover:shadow-sm active:scale-90">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-4 pb-20 md:pb-24 pt-3 max-w-lg mx-auto w-full">

        {/* ══════ TAB: HOME — PROFESSIONAL DASHBOARD ══════ */}
        {tab === "home" && (<motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>{(() => {
          const activeSignals = signals.filter(s => s.status === "ACTIVE");
          const closedSignals = signals.filter(s => s.status !== "ACTIVE");
          const winClosed = closedSignals.filter(s => s.status === "HIT_TP");
          const lossClosed = closedSignals.filter(s => s.status === "HIT_SL");
          const totalPnl = signals.reduce((acc, s) => acc + (s.pnlDollars ?? 0), 0);
          const totalPoints = signals.reduce((acc, s) => acc + (s.pnlPoints ?? 0), 0);
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
          <div className="space-y-4">

            {/* ── Welcome Hero Card ── */}
            <div className="card-animated-border rounded-2xl overflow-hidden relative p-5 shadow-layered">
              {/* Decorative blobs */}
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-amber-500/[0.07] blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-purple-500/[0.05] blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-amber-400/60 font-medium tracking-wide uppercase">{currentDay}</div>
                    <h1 className="text-lg font-extrabold text-foreground mt-1 leading-tight">
                      {isAdmin ? "مرحباً، المدير" : `${greeting}، ${session?.name?.split(" ")[0] || ""}`}
                    </h1>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {isAdmin
                        ? `${totalActiveUsers} مستخدم نشط • ${activeSignals.length} إشارة مفتوحة`
                        : `لديك ${activeSignals.length} إشارة نشطة حالياً`
                      }
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0" style={{ boxShadow: "0 4px 12px rgba(255, 215, 0, 0.2), 0 0 20px rgba(255, 215, 0, 0.08)" }}>
                    {isAdmin ? <ShieldAlert className="w-5 h-5 text-black" /> : <Sparkles className="w-5 h-5 text-black" />}
                  </div>
                </div>
                {/* Quick Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/[0.04] backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06] shadow-sm">
                    <div className="text-base font-extrabold text-emerald-400" style={{ textShadow: "0 0 12px rgba(16, 185, 129, 0.3)" }}>{todayWins}</div>
                    <div className="text-[8px] text-emerald-400/60 font-medium mt-0.5">ربح اليوم</div>
                  </div>
                  <div className="bg-white/[0.04] backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06] shadow-sm">
                    <div className="text-base font-extrabold text-red-400" style={{ textShadow: "0 0 12px rgba(239, 68, 68, 0.3)" }}>{todayLosses}</div>
                    <div className="text-[8px] text-red-400/60 font-medium mt-0.5">خسارة اليوم</div>
                  </div>
                  <div className="bg-white/[0.04] backdrop-blur-sm rounded-xl p-2.5 text-center border border-white/[0.06] shadow-sm">
                    <div className={`text-base font-extrabold ${todayPnl >= 0 ? "text-emerald-400" : "text-red-400"}`} style={{ textShadow: todayPnl !== 0 ? `0 0 12px ${todayPnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` : "none" }}>
                      {todayPnl >= 0 ? "+" : ""}{todayPnl > 0 ? `$${todayPnl}` : todayPnl < 0 ? `-$${Math.abs(todayPnl)}` : "$0"}
                    </div>
                    <div className="text-[8px] text-muted-foreground/60 font-medium mt-0.5">أرباح اليوم</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Live Pulse Indicator ── */}
            <div className="flex items-center gap-2 px-0.5">
              <div className="flex items-center gap-1.5 bg-emerald-500/[0.06] border border-emerald-500/10 rounded-full px-3 py-1 shadow-sm" style={{ boxShadow: "0 0 12px rgba(16, 185, 129, 0.06)" }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">بث مباشر</span>
              </div>
              <span className="text-[10px] text-muted-foreground/50">آخر تحديث: {new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {/* ── Active Signals Summary (if any) ── */}
            {activeSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5 px-0.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                    <span className="text-xs font-bold text-foreground">الإشارات النشطة</span>
                    <span className="text-[8px] bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">{activeSignals.length}</span>
                  </div>
                  <button onClick={() => setTab("signals")} className="text-[10px] text-amber-400/70 font-medium flex items-center gap-0.5 hover:text-amber-400 transition-colors">
                    عرض الكل <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2">
                  {activeSignals.slice(0, 3).map((s, i) => {
                    const ac = entryAccent(s);
                    const isBuy = s.type === "BUY";
                    return (
                      <div key={s.id} className="animate-[fadeInUp_0.3s_ease-out]" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                        <div className={`glass-card rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer`} onClick={() => setTab("signals")}>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ac.bg}`}>
                            {isBuy ? <TrendingUp className={`w-4 h-4 ${ac.text}`} /> : <TrendingDown className={`w-4 h-4 ${ac.text}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-foreground text-sm">{s.pair}</span>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${isBuy ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/15" : "bg-red-400/10 text-red-400 border border-red-400/15"}`}>
                                {isBuy ? "شراء" : "بيع"}
                              </span>
                              {s.timeframe && <span className="text-[8px] bg-white/[0.04] text-muted-foreground/60 px-1 py-0.5 rounded-md">{s.timeframe}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px]">
                              <span className="text-muted-foreground/70">دخول: <span className="font-mono font-semibold text-foreground/90">{s.entry}</span></span>
                              <span className="text-red-400/50">وقف: <span className="font-mono font-semibold text-red-300/80">{s.stopLoss}</span></span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="badge-active">نشطة</span>
                            <span className="text-[9px] text-muted-foreground/50">{timeAgo(s.createdAt)}</span>
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
              <div className="flex items-center gap-2 mb-2.5 px-0.5">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-sky-400 to-blue-500" />
                <span className="text-xs font-bold text-foreground">الأداء العام</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Win Rate — with ProgressRing */}
                <Glass className="p-3 relative overflow-hidden rounded-xl">
                  <div className="absolute top-0 right-0 w-14 h-14 rounded-full bg-emerald-500/[0.05] -translate-y-4 translate-x-4" />
                  <div className="relative flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Trophy className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] text-muted-foreground/70 font-medium">نسبة الفوز</span>
                      </div>
                      <div className={`text-xl font-extrabold ${stats && stats.winRate >= 60 ? "text-emerald-400" : stats && stats.winRate >= 40 ? "text-amber-400" : "text-red-400"}`}>
                        {stats ? `${stats.winRate}%` : "—"}
                      </div>
                    </div>
                    <ProgressRing value={stats?.winRate ?? 0} size={48} strokeWidth={3.5} color={stats && stats.winRate >= 60 ? "green" : stats && stats.winRate >= 40 ? "gold" : "red"} />
                  </div>
                </Glass>

                {/* Total PnL */}
                <Glass className="p-3 relative overflow-hidden rounded-xl">
                  <div className="absolute top-0 right-0 w-14 h-14 rounded-full bg-amber-500/[0.05] -translate-y-4 translate-x-4" />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <DollarSign className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-muted-foreground/70 font-medium">إجمالي الأرباح</span>
                    </div>
                    <div className={`text-xl font-extrabold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {totalPnl >= 0 ? "+" : ""}{totalPnl > 0 ? `$${totalPnl.toLocaleString()}` : totalPnl < 0 ? `-$${Math.abs(totalPnl).toLocaleString()}` : "$0"}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">{totalPoints >= 0 ? "+" : ""}{totalPoints} نقطة</div>
                  </div>
                </Glass>

                {/* Win Streak */}
                <Glass className="p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Flame className="w-3 h-3 text-orange-400" />
                    <span className="text-[10px] text-muted-foreground/70 font-medium">سلسلة الأرباح</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className={`text-xl font-extrabold ${streak >= 3 ? "text-orange-400" : streak > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{streak}</span>
                    <span className="text-[10px] text-muted-foreground/50 mb-0.5">صفقات</span>
                  </div>
                  {streak >= 3 && <div className="text-[9px] text-orange-400/60 mt-0.5">🔥 أداء ممتاز!</div>}
                </Glass>

                {/* Weekly Performance */}
                <Glass className="p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <PieChart className="w-3 h-3 text-sky-400" />
                    <span className="text-[10px] text-muted-foreground/70 font-medium">أداء الأسبوع</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl font-extrabold text-sky-400">{weeklyWinRate}%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">{weeklySignals.filter(s => s.status !== "ACTIVE").length} صفقة مغلقة</div>
                </Glass>

                {/* Total Trades */}
                <Glass className="p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Hash className="w-3 h-3 text-purple-400" />
                    <span className="text-[10px] text-muted-foreground/70 font-medium">إجمالي الصفقات</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-xl font-extrabold text-purple-400">{stats?.total || 0}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">{stats?.active || 0} نشطة</div>
                </Glass>

                {/* Avg Confidence */}
                <Glass className="p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Star className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-muted-foreground/70 font-medium">متوسط الثقة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-extrabold text-amber-400">{stats?.avgConfidence || 0}</span>
                    <Stars r={Math.round(stats?.avgConfidence || 0)} />
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">من 5 نجوم</div>
                </Glass>
              </div>
            </div>

            {/* ── Win/Loss Visual Bar ── */}
            {stats && (stats.hitTp + stats.hitSl) > 0 && (
              <Glass className="p-3.5 rounded-xl">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3 h-3 text-amber-400" />
                    <span className="text-xs font-bold text-foreground">نتائج الصفقات</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-emerald-400 font-semibold">{stats.hitTp} ربح</span>
                    <span className="text-muted-foreground/30">|</span>
                    <span className="text-red-400 font-semibold">{stats.hitSl} خسارة</span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden flex">
                  <div className="bg-gradient-to-l from-emerald-400 to-emerald-500 h-full rounded-r-full transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100}%` }}>
                    {(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100 > 18 && (
                      <span className="text-[8px] font-bold text-white/90">{Math.round((stats.hitTp / (stats.hitTp + stats.hitSl)) * 100)}%</span>
                    )}
                  </div>
                  <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-full flex-1 flex items-center justify-center">
                    {((stats.hitSl / (stats.hitTp + stats.hitSl)) * 100) > 18 && (
                      <span className="text-[8px] font-bold text-white/90">{Math.round((stats.hitSl / (stats.hitTp + stats.hitSl)) * 100)}%</span>
                    )}
                  </div>
                </div>
              </Glass>
            )}

            {/* ── Subscription Card (User Only) ── */}
            {!isAdmin && (
              <div className="card-premium rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-foreground">حالة الاشتراك</span>
                    </div>
                    {session?.subscriptionType && session.subscriptionType !== "none" && (
                      <div className={`px-2.5 py-1 rounded-lg text-[9px] font-bold ${subDaysLeft && subDaysLeft > 7 ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/15" : subDaysLeft && subDaysLeft > 0 ? "bg-amber-400/10 text-amber-400 border border-amber-400/15" : "bg-red-400/10 text-red-400 border border-red-400/15"}`}>
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
                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] flex items-center justify-between">
                          <div>
                            <div className="text-[9px] text-muted-foreground/50">الباقة</div>
                            <div className="text-[13px] font-bold text-foreground">{session.packageName}</div>
                          </div>
                          {session.subscriptionExpiry && (
                            <div className="text-left">
                              <div className="text-[9px] text-muted-foreground/50">الانتهاء</div>
                              <div className="text-[11px] font-semibold text-foreground/70">{new Date(session.subscriptionExpiry).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Expiry progress bar */}
                      {subDaysLeft !== null && subDaysLeft > 0 && (
                        <div className="mt-1">
                          <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${subDaysLeft > 14 ? "bg-emerald-500" : subDaysLeft > 7 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(100, (subDaysLeft / 30) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <div className="text-xs text-muted-foreground/70">لا يوجد اشتراك نشط</div>
                      <div className="text-[10px] text-muted-foreground/50 mt-1">تواصل مع الإدارة للاشتراك</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Admin Quick Stats ── */}
            {isAdmin && (
              <div>
                <div className="flex items-center gap-2 mb-2.5 px-0.5">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-pink-500" />
                  <span className="text-xs font-bold text-foreground">إدارة سريعة</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setTab("users")} className="glass-card rounded-xl p-3 text-center active:scale-95 transition-transform hover-lift">
                    <Users className="w-4 h-4 text-sky-400 mx-auto mb-1.5" />
                    <div className="text-base font-extrabold text-foreground">{totalActiveUsers}</div>
                    <div className="text-[8px] text-muted-foreground/60 font-medium">مستخدم نشط</div>
                  </button>
                  <button onClick={() => setTab("packages")} className="glass-card rounded-xl p-3 text-center active:scale-95 transition-transform hover-lift">
                    <Wallet className="w-4 h-4 text-emerald-400 mx-auto mb-1.5" />
                    <div className="text-base font-extrabold text-foreground">{totalSubscribers}</div>
                    <div className="text-[8px] text-muted-foreground/60 font-medium">مشترك</div>
                  </button>
                  <button onClick={() => setTab("signals")} className="glass-card rounded-xl p-3 text-center active:scale-95 transition-transform hover-lift">
                    <Activity className="w-4 h-4 text-amber-400 mx-auto mb-1.5" />
                    <div className="text-base font-extrabold text-foreground">{activeSignals.length}</div>
                    <div className="text-[8px] text-muted-foreground/60 font-medium">إشارة مفتوحة</div>
                  </button>
                </div>
              </div>
            )}

            {/* ── Top Pairs (Mini) ── */}
            {stats && stats.topPairs?.length > 0 && (
              <Glass className="p-3.5 rounded-xl">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-amber-400" />
                    <span className="text-xs font-bold text-foreground">الأزواج الأكثر تداولاً</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {stats.topPairs.slice(0, 5).map((p, i) => {
                    const maxCount = stats.topPairs[0].count;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${i === 0 ? "bg-amber-400/10 text-amber-400" : i === 1 ? "bg-white/[0.05] text-foreground/70" : i === 2 ? "bg-orange-400/8 text-orange-400" : "bg-white/[0.03] text-muted-foreground/50"}`}>
                          {i + 1}
                        </div>
                        <span className="text-[11px] font-semibold text-foreground w-20 truncate">{p.pair}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-l from-amber-500/80 to-orange-500/80 transition-all duration-500" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground/50 w-6 text-left">{p.count}</span>
                      </div>
                    );
                  })}
                </div>
              </Glass>
            )}

            {/* ── Recent Activity (Last 5 Closed Signals) ── */}
            {closedSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5 px-0.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-red-500" />
                    <span className="text-xs font-bold text-foreground">آخر النتائج</span>
                  </div>
                  <button onClick={() => setTab("signals")} className="text-[10px] text-amber-400/70 font-medium flex items-center gap-0.5 hover:text-amber-400 transition-colors">
                    الكل <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {closedSignals.slice(0, 5).map((s, i) => {
                    const isProfit = s.status === "HIT_TP";
                    const isBuy = s.type === "BUY";
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/[0.04] animate-[fadeInUp_0.25s_ease-out]" style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}>
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isProfit ? "bg-emerald-400/8" : "bg-red-400/8"}`}>
                          {isProfit ? (
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-foreground">{s.pair}</span>
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isBuy ? "bg-emerald-400/8 text-emerald-400" : "bg-red-400/8 text-red-400"}`}>{isBuy ? "BUY" : "SELL"}</span>
                          </div>
                          <span className="text-[9px] text-muted-foreground/50">{timeAgo(s.createdAt)}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-[11px] font-extrabold font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                            {isProfit ? "+" : "-"}${Math.abs(s.pnlDollars ?? 0)}
                          </div>
                          <div className="text-[8px] text-muted-foreground/40 font-mono">{s.pnlPoints ?? 0} pts</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Buy/Sell Ratio (Visual) ── */}
            {stats && (stats.buyCount + stats.sellCount) > 0 && (
              <Glass className="p-3.5 rounded-xl">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <PieChart className="w-3 h-3 text-amber-400" />
                  <span className="text-xs font-bold text-foreground">توزيع الشراء والبيع</span>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-1 rounded-lg bg-emerald-400/[0.04] border border-emerald-400/8 p-2.5 text-center">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                    <div className="text-base font-extrabold text-emerald-400">{stats.buyCount}</div>
                    <div className="text-[8px] text-emerald-400/60 font-medium">شراء</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-red-400/[0.04] border border-red-400/8 p-2.5 text-center">
                    <ArrowDownRight className="w-3.5 h-3.5 text-red-400 mx-auto mb-1" />
                    <div className="text-base font-extrabold text-red-400">{stats.sellCount}</div>
                    <div className="text-[8px] text-red-400/60 font-medium">بيع</div>
                  </div>
                </div>
                <div className="mt-2.5 h-2 rounded-full bg-white/[0.04] overflow-hidden flex">
                  <div className="bg-gradient-to-l from-emerald-500 to-emerald-400 h-full rounded-r-full transition-all duration-500"
                    style={{ width: `${(stats.buyCount / (stats.buyCount + stats.sellCount)) * 100}%` }} />
                  <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-full flex-1" />
                </div>
              </Glass>
            )}

            {/* ── Motivational Footer ── */}
            <div className="text-center py-1">
              <div className="inline-flex items-center gap-1.5 bg-white/[0.03] rounded-full px-4 py-2 border border-white/[0.05]">
                <Sparkles className="w-3 h-3 text-amber-400/60" />
                <span className="text-[10px] text-muted-foreground/50">
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
        })()}</motion.div>)}

        {/* ══════ TAB: SIGNALS — PREMIUM DESIGN ══════ */}
        {tab === "signals" && (<motion.div key="signals" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>{(() => {
          const activeSignals = filtered.filter(s => isEntry(s.signalCategory) && s.status === "ACTIVE");
          const closedSignals = filtered.filter(s => !isEntry(s.signalCategory) || s.status !== "ACTIVE");
          const winClosed = closedSignals.filter(s => s.status === "HIT_TP");
          const lossClosed = closedSignals.filter(s => s.status === "HIT_SL");
          const totalClosed = closedSignals.length;
          const closedWinRate = totalClosed > 0 ? Math.round((winClosed.length / totalClosed) * 100) : 0;

          return (
          <div
            className="space-y-4"
            onTouchStart={pullRefresh.onTouchStart}
            onTouchMove={pullRefresh.onTouchMove}
            onTouchEnd={pullRefresh.onTouchEnd}
            style={{ position: "relative" }}
          >
            {/* ── Pull to Refresh Indicator ── */}
            {pullRefresh.isRefreshing && (
              <div className="flex justify-center py-3">
                <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent" style={{ animation: "pullSpin 0.8s linear infinite" }} />
              </div>
            )}
            {pullRefresh.pullDistance > 0 && !pullRefresh.isRefreshing && (
              <div className="flex justify-center" style={{ height: pullRefresh.pullDistance, overflow: "hidden" }}>
                <div className="flex flex-col items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent" style={{ animation: "pullSpin 0.8s linear infinite", opacity: pullRefresh.pullDistance >= 40 ? 1 : 0.5 }} />
                  <span className="text-[9px] text-amber-400 mt-1">{pullRefresh.pullDistance >= 40 ? "أفلت للتحديث" : "اسحب للتحديث"}</span>
                </div>
              </div>
            )}

            {/* ── Premium Stats Header ── */}
            {stats && (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="p-3.5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                    <span className="text-xs font-bold text-amber-400/80 tracking-wide">نظرة سريعة</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <div className="text-base font-extrabold text-foreground">{stats.active}</div>
                      <div className="text-[8px] text-emerald-400/70 font-medium">نشطة</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-extrabold text-foreground">{stats.total}</div>
                      <div className="text-[8px] text-muted-foreground/60 font-medium">إجمالي</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-extrabold text-amber-400">{stats.winRate}%</div>
                      <div className="text-[8px] text-muted-foreground/60 font-medium">نسبة الفوز</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-extrabold text-sky-400">{stats.recentWeek}</div>
                      <div className="text-[8px] text-muted-foreground/60 font-medium">هذا الأسبوع</div>
                    </div>
                  </div>
                  {totalClosed > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[8px] mb-1.5">
                        <span className="text-emerald-400/70 font-semibold">ربح {winClosed.length}</span>
                        <span className="text-red-400/70 font-semibold">خسارة {lossClosed.length}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden flex">
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
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 ${
                    filter === f.key
                      ? "bg-amber-400/[0.12] text-amber-400 border border-amber-400/20 shadow-sm shadow-amber-400/5"
                      : "bg-white/[0.03] text-muted-foreground/60 border border-white/[0.06] hover:bg-white/[0.05] hover:text-muted-foreground"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {loading && filtered.length === 0 ? (
              <SignalsLoadingSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Activity className="w-7 h-7" />}
                title={filter === "active" ? "لا توجد إشارات نشطة حالياً" : filter === "closed" ? "لا توجد إشارات مغلقة" : filter === "buy" ? "لا توجد إشارات شراء" : filter === "sell" ? "لا توجد إشارات بيع" : "لا توجد إشارات حالياً"}
                subtitle="سيتم عرض الإشارات هنا فور إرسالها"
              />
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
                        <div key={s.id} className={newSignalIdsRef.current.has(s.id) ? "animate-slide-in-right animate-new-signal-glow" : ""}>
                          <SignalCard s={s} idx={i} isAdmin={isAdmin} onUpdate={handleUpdate} onDelete={handleDelete} isNew={newSignalIdsRef.current.has(s.id)} statusChanged={statusChangeIdsRef.current.has(s.id)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Closed Signals Section ── */}
                {closedSignals.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-2 h-2 rounded-full bg-slate-500" />
                      <span className="text-[11px] font-bold text-muted-foreground">الإشارات المغلقة</span>
                      <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md font-bold">{closedSignals.length}</span>
                      {totalClosed > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${closedWinRate >= 60 ? "bg-emerald-500/15 text-emerald-400" : closedWinRate >= 40 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                          {closedWinRate}%
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {closedSignals.map((s, i) => {
                        const isNew = newSignalIdsRef.current.has(s.id);
                        const isStatusChange = statusChangeIdsRef.current.has(s.id);
                        const isTpHit = s.status === "HIT_TP";
                        const isSlHit = s.status === "HIT_SL";
                        return (
                          <div key={s.id} className={`${isNew ? "animate-slide-in-right" : ""} ${isStatusChange ? (isTpHit ? "animate-tp-hit-pulse" : isSlHit ? "animate-sl-hit-pulse" : "animate-status-pulse") : ""}`}>
                            <SignalCard s={s} idx={i + (activeSignals.length || 0)} isAdmin={isAdmin} onUpdate={handleUpdate} onDelete={handleDelete} isNew={isNew} statusChanged={isStatusChange} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          );
        })()}</motion.div>)}

        {/* ══════ TAB: DASHBOARD ══════ */}
        {tab === "dashboard" && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
            {loading && !stats ? (
              <StatsLoadingSkeleton />
            ) : stats ? (
              <>
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/10 border border-violet-500/20 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">الإحصائيات</h2>
                    <p className="text-[11px] text-muted-foreground">نظرة شاملة على الأداء</p>
                  </div>
                </div>

                {/* Stats Grid — 2×3 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* إجمالي الصفقات */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-violet-500/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                        <Hash className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">إجمالي الصفقات</span>
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">{stats.total}</div>
                  </div>

                  {/* الصفقات النشطة */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-emerald-500/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">الصفقات النشطة</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.active}</div>
                  </div>

                  {/* نسبة الفوز */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-amber-500/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Target className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">نسبة الفوز</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-400 tabular-nums">{stats.winRate}%</div>
                  </div>

                  {/* أداء الأسبوع */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-sky-500/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
                        <Timer className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">أداء الأسبوع</span>
                    </div>
                    <div className="text-2xl font-bold text-sky-400 tabular-nums">{stats.recentWeek}</div>
                  </div>

                  {/* نسبة الشراء/البيع */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-emerald-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">شراء / بيع</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg font-bold text-emerald-400 tabular-nums">{stats.buyCount}</span>
                      <span className="text-xs text-muted-foreground/50">/</span>
                      <span className="text-lg font-bold text-red-400 tabular-nums">{stats.sellCount}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                      <div className="bg-gradient-to-l from-emerald-500 to-emerald-400 h-full rounded-r-full transition-all duration-500" style={{ width: `${stats.buyCount + stats.sellCount > 0 ? (stats.buyCount / (stats.buyCount + stats.sellCount)) * 100 : 50}%` }} />
                      <div className="bg-gradient-to-l from-red-500 to-red-400 h-full rounded-l-full flex-1" />
                    </div>
                  </div>

                  {/* متوسط الثقة */}
                  <div className="glass-card rounded-xl p-4 border-b-2 border-b-amber-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Star className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">متوسط الثقة</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-amber-400 tabular-nums">{stats.avgConfidence}</span>
                      <Stars r={Math.round(stats.avgConfidence)} />
                    </div>
                  </div>
                </div>

                {/* Win/Loss Distribution Bar */}
                <div className="glass-card rounded-xl p-4">
                  <div className="text-xs font-bold text-foreground/90 mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    نتائج الصفقات
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ربح
                        <span className="text-muted-foreground font-normal">({stats.hitTp})</span>
                      </span>
                      <span className="text-red-400 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        خسارة
                        <span className="text-muted-foreground font-normal">({stats.hitSl})</span>
                      </span>
                    </div>
                    <div className="h-3.5 rounded-xl bg-white/5 overflow-hidden flex">
                      {stats.hitTp + stats.hitSl > 0 && (
                        <div className="bg-gradient-to-l from-emerald-400 to-emerald-500 h-full transition-all duration-700 rounded-xl" style={{ width: `${(stats.hitTp / (stats.hitTp + stats.hitSl)) * 100}%` }} />
                      )}
                      <div className="bg-gradient-to-l from-red-400 to-red-500 h-full flex-1 transition-all duration-700 rounded-xl" />
                    </div>
                    <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                      <span>{stats.hitTp + stats.hitSl > 0 ? Math.round((stats.hitTp / (stats.hitTp + stats.hitSl)) * 100) : 0}% فوز</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span>{stats.hitTp + stats.hitSl > 0 ? Math.round((stats.hitSl / (stats.hitTp + stats.hitSl)) * 100) : 0}% خسارة</span>
                    </div>
                  </div>
                </div>

                {/* Top Performing Pairs */}
                {stats.topPairs?.length > 0 && (
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs font-bold text-foreground/90 mb-3 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      الأزواج الأكثر أداءً
                    </div>
                    <div className="space-y-2.5">
                      {stats.topPairs.slice(0, 5).map((p, i) => {
                        const maxCount = stats.topPairs[0].count;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-slate-400/15 text-slate-300" : i === 2 ? "bg-orange-500/15 text-orange-400" : "bg-white/5 text-muted-foreground"}`}>
                              {i + 1}
                            </div>
                            <span className="text-xs font-bold text-foreground w-[72px] truncate">{p.pair}</span>
                            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground w-8 text-left tabular-nums">{p.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </motion.div>
        )}

        {/* ══════ TAB: ANALYST ══════ */}
        {tab === "analyst" && (
          <motion.div key="analyst" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
            {/* Section Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">المحلل</h2>
                <p className="text-[11px] text-muted-foreground">تحليل وإرسال الإشارات يدوياً</p>
              </div>
            </div>

            {/* Signal Input Area */}
            <div className="glass-card rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-foreground/80 flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center">
                  <Zap className="w-3 h-3 text-amber-400" />
                </div>
                تحليل إشارة يدوي
              </div>
              <div className="glass-input rounded-xl overflow-hidden">
                <Textarea value={rawText} onChange={e => setRawText(e.target.value)}
                  placeholder="أدخل نص الإشارة هنا..."
                  className="bg-transparent border-0 text-foreground placeholder:text-muted-foreground/50 min-h-[150px] text-xs rounded-xl resize-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none" dir="rtl" />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5">
                <Button onClick={handleParse} disabled={parseLoad || !rawText.trim()}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-navy-900 text-xs font-bold hover:from-amber-400 hover:to-amber-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20">
                  {parseLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <Zap className="w-3.5 h-3.5 ml-1.5" />
                      تحليل
                    </>
                  )}
                </Button>
                {parseResult && (
                  <Button onClick={handleSend} disabled={sendLoad}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20">
                    {sendLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <>
                        <Send className="w-3.5 h-3.5 ml-1.5" />
                        إرسال للخادم
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Error Display */}
            {parseError && (
              <div className="glass-card rounded-xl p-3.5 border border-red-500/20 bg-red-500/[0.04]">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-md bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ShieldAlert className="w-3 h-3 text-red-400" />
                  </div>
                  <div className="text-xs text-red-400 leading-relaxed">{parseError}</div>
                </div>
              </div>
            )}

            {/* Parse Preview */}
            {parseResult && (
              <div className="animate-[fadeInUp_0.3s_ease-out]">
                <div className="text-xs font-bold text-foreground/80 mb-2.5 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  </div>
                  نتيجة التحليل
                </div>
                <SignalCard s={parseResult} idx={0} isAdmin={false} onUpdate={() => {}} onDelete={() => {}} />
              </div>
            )}
          </motion.div>
        )}

        {/* ══════ TAB: PACKAGES (Admin) ══════ */}
        {tab === "packages" && isAdmin && (
          <motion.div key="packages" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">

            {/* ══════════════════════════════════════════════════
                USDT PAYMENT NETWORKS — Professional Card
               ══════════════════════════════════════════════════ */}
            <div className="glass-card overflow-hidden">
              {/* Section Header */}
              <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/15 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">شبكات USDT</h3>
                    <p className="text-[8px] text-muted-foreground">{(usdtNetworks.filter(n => n.isActive).length || (appSettings.usdtWalletAddress && usdtNetworks.length === 0 ? 1 : 0))} شبكة نشطة</p>
                  </div>
                </div>
                {!showUsdtNetworkForm && (
                  <button onClick={() => { resetUsdtNetForm(); setShowUsdtNetworkForm(true); }}
                    className="px-3 py-1.5 rounded-lg text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/15 hover:bg-amber-500/15 transition-all flex items-center gap-1 active:scale-95">
                    <Plus className="w-3 h-3" /> إضافة شبكة
                  </button>
                )}
              </div>

              {/* Networks List */}
              <div className="p-3 space-y-2">
                {(usdtNetworks.length > 0 || (appSettings.usdtWalletAddress && usdtNetworks.length === 0)) ? (
                  (usdtNetworks.length > 0 ? usdtNetworks : (appSettings.usdtWalletAddress ? [{
                    id: "legacy", network: appSettings.usdtNetwork || "TRC20",
                    address: appSettings.usdtWalletAddress || "", isActive: true, order: 0
                  }] : [])).map(net => (
                    <div key={net.id} className={`rounded-xl border p-3 transition-all glass-subtle ${net.isActive ? "border-amber-500/15" : "border-border/40 opacity-40"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg ${net.isActive ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10" : "bg-muted/20"} border ${net.isActive ? "border-amber-500/15" : "border-border/40"} flex items-center justify-center flex-shrink-0`}>
                            <Wallet className={`w-3.5 h-3.5 ${net.isActive ? "text-amber-400" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${net.isActive ? "text-foreground" : "text-muted-foreground"}`}>{net.network}</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[7px] font-bold ${net.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/20 text-muted-foreground"}`}>
                                <span className={`w-1 h-1 rounded-full ${net.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                                {net.isActive ? "نشطة" : "معطلة"}
                              </span>
                            </div>
                            <div className="text-[8px] font-mono text-foreground/40 truncate mt-0.5" dir="ltr">{net.address}</div>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => { setEditingUsdtNetworkId(net.id); setUsdtNetFormNetwork(net.network); setUsdtNetFormAddress(net.address); setShowUsdtNetworkForm(true); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                            <Settings className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleToggleUsdtNetwork(net.id, !net.isActive)}
                            className={`p-1.5 rounded-md transition-all ${net.isActive ? "text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`}>
                            {net.isActive ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          </button>
                          <button onClick={() => handleDeleteUsdtNetwork(net.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-[10px] text-muted-foreground">لا توجد شبكات USDT</p>
                    <p className="text-[8px] text-muted-foreground/50 mt-1">أضف عناوين المحفظة لتفعيل الدفع عبر USDT</p>
                  </div>
                )}

                {/* Add/Edit Network Form */}
                <AnimatePresence>
                {showUsdtNetworkForm && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card border-amber-500/15 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400">{editingUsdtNetworkId ? "تعديل الشبكة" : "شبكة جديدة"}</span>
                      <button onClick={resetUsdtNetForm} className="text-muted-foreground hover:text-foreground transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex gap-1.5 h-9">
                      {["TRC20", "BEP20", "ERC20"].map(n => (
                        <button key={n} onClick={() => setUsdtNetFormNetwork(n)}
                          className={`flex-1 rounded-lg text-[9px] font-semibold transition-all border ${usdtNetFormNetwork === n ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/30"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <Input value={usdtNetFormAddress} onChange={e => setUsdtNetFormAddress(e.target.value)} placeholder="أدخل عنوان المحفظة..."
                      className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px] font-mono" dir="ltr" />
                    <button onClick={handleSaveUsdtNetwork}
                      className="w-full h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {editingUsdtNetworkId ? "حفظ" : "إضافة"}
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════
                LOCAL PAYMENT METHODS — Professional Card
               ══════════════════════════════════════════════════ */}
            <div className="glass-card overflow-hidden">
              {/* Section Header */}
              <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/20 to-cyan-500/10 border border-sky-500/15 flex items-center justify-center">
                    <Banknote className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">طرق الدفع المحلية</h3>
                    <p className="text-[8px] text-muted-foreground">{localPaymentMethods.filter(m => m.isActive).length} طريقة نشطة</p>
                  </div>
                </div>
                {!showMethodForm && (
                  <button onClick={() => { resetMethodForm(); setShowMethodForm(true); }}
                    className="px-3 py-1.5 rounded-lg text-[9px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/15 hover:bg-sky-500/15 transition-all flex items-center gap-1 active:scale-95">
                    <Plus className="w-3 h-3" /> إضافة طريقة
                  </button>
                )}
              </div>

              {/* Methods List */}
              <div className="p-3 space-y-2">
                {/* Add/Edit Form */}
                <AnimatePresence>
                {showMethodForm && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card border-sky-500/15 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-sky-400">{editingMethodId ? "تعديل طريقة الدفع" : "طريقة دفع جديدة"}</span>
                      <button onClick={resetMethodForm} className="text-muted-foreground hover:text-foreground transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">اسم المحفظة</label>
                        <Input value={methodFormName} onChange={e => setMethodFormName(e.target.value)} placeholder="محفظة YmntPay" dir="rtl"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px]" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">اسم المزود</label>
                        <Input value={methodFormWalletName} onChange={e => setMethodFormWalletName(e.target.value)} placeholder="YmntPay, Chime, MTN" dir="ltr"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px] font-mono" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">رقم المحفظة</label>
                        <Input value={methodFormWallet} onChange={e => setMethodFormWallet(e.target.value)} placeholder="أدخل رقم المحفظة" dir="ltr"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px] font-mono" />
                      </div>
                      <div>
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">اسم العملة</label>
                        <Input value={methodFormCurrencyName} onChange={e => setMethodFormCurrencyName(e.target.value)} placeholder="الريال اليمني" dir="rtl"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px]" />
                      </div>
                      <div>
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">رمز العملة</label>
                        <Input value={methodFormCurrencyCode} onChange={e => setMethodFormCurrencyCode(e.target.value)} placeholder="YER" dir="ltr"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px] font-mono" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[8px] text-muted-foreground mb-0.5 block">سعر الصرف (1 USDT = ?)</label>
                        <Input type="number" value={methodFormRate} onChange={e => setMethodFormRate(e.target.value)} placeholder="535" dir="ltr"
                          className="glass-input text-foreground placeholder:text-muted-foreground/50 h-9 text-[10px] font-mono" />
                      </div>
                    </div>
                    <button onClick={handleSaveMethod} disabled={methodLoad}
                      className="w-full h-9 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[10px] font-bold disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                      {methodLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5" /> {editingMethodId ? "حفظ التعديلات" : "إضافة"}</>}
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>

                {/* Methods Cards */}
                {localPaymentMethods.length > 0 ? (
                  localPaymentMethods.map(m => (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
                      className={`rounded-xl border p-3 transition-all glass-subtle ${m.isActive ? "border-sky-500/15" : "border-border/40 opacity-40"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg ${m.isActive ? "bg-gradient-to-br from-sky-500/20 to-cyan-500/10" : "bg-muted/20"} border ${m.isActive ? "border-sky-500/15" : "border-border/40"} flex items-center justify-center flex-shrink-0`}>
                            <CreditCard className={`w-3.5 h-3.5 ${m.isActive ? "text-sky-400" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${m.isActive ? "text-foreground" : "text-muted-foreground"}`}>{m.name}</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[7px] font-bold ${m.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/20 text-muted-foreground"}`}>
                                <span className={`w-1 h-1 rounded-full ${m.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                                {m.isActive ? "نشطة" : "معطلة"}
                              </span>
                            </div>
                            <div className="text-[8px] text-muted-foreground/60 mt-0.5">
                              <span className="font-mono" dir="ltr">{m.walletName}</span> · <span>{m.currencyName}</span> · <span className="text-amber-400/80 font-bold font-mono" dir="ltr">1 USDT = {m.exchangeRate.toLocaleString()} {m.currencyCode}</span>
                            </div>
                            <div className="text-[8px] font-mono text-foreground/30 truncate mt-0.5" dir="ltr">{m.walletAddress}</div>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => { setEditingMethodId(m.id); setMethodFormName(m.name); setMethodFormWallet(m.walletAddress); setMethodFormWalletName(m.walletName); setMethodFormCurrencyName(m.currencyName); setMethodFormCurrencyCode(m.currencyCode); setMethodFormRate(String(m.exchangeRate)); setShowMethodForm(true); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 transition-all">
                            <Settings className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleToggleMethod(m.id, !m.isActive)}
                            className={`p-1.5 rounded-md transition-all ${m.isActive ? "text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`}>
                            {m.isActive ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          </button>
                          <button onClick={() => handleDeleteMethod(m.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : !showMethodForm ? (
                  <div className="py-6 text-center">
                    <p className="text-[10px] text-muted-foreground">لا توجد طرق دفع محلية</p>
                    <p className="text-[8px] text-muted-foreground/50 mt-1">أضف طرق دفع للعملات المحلية</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* ── Payment Requests Review ── */}
            {(() => {
              const pendingReqs = paymentRequests.filter(r => r.status === "pending");
              return pendingReqs.length > 0 ? (
                <div className="glass-card border-amber-500/20 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,215,0,0.04) 0%, rgba(255,140,0,0.01) 100%)" }}>
                  <div className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/15 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-foreground">طلبات الدفع المعلقة</h3>
                          <p className="text-[9px] text-muted-foreground">{pendingReqs.length} طلب بانتظار المراجعة</p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-bold">{pendingReqs.length}</span>
                    </div>
                  </div>
                  <div className="px-4 pb-3 space-y-2 max-h-96 overflow-y-auto">
                    {pendingReqs.map(req => (
                      <div key={req.id} className="glass-subtle rounded-xl border border-white/[0.05] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-foreground truncate">{req.userName}</div>
                            <div className="text-[9px] text-muted-foreground font-mono truncate" dir="ltr">{req.userEmail}</div>
                          </div>
                          <div className="text-left flex-shrink-0">
                            <div className="text-sm font-black text-amber-400 font-mono">${req.packagePrice || req.amount}</div>
                            <div className="text-[8px] text-muted-foreground">{req.packageName}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          <span className="px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-medium">
                            {req.paymentMethod === "usdt" ? `USDT${req.usdtNetwork ? ` (${req.usdtNetwork})` : ""}` : (req.paymentMethodName || "محلي")}
                          </span>
                          {req.txid && <span className="truncate font-mono" dir="ltr">TX: {req.txid}</span>}
                          {req.txId && <span className="truncate font-mono" dir="ltr">TX: {req.txId}</span>}
                          {req.localAmount && <span className="font-mono" dir="ltr">{req.localAmount.toLocaleString()} {req.localCurrencyCode || ""}</span>}
                          <span className="mr-auto">{new Date(req.createdAt).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}</span>
                        </div>
                        {/* Blockchain verification status */}
                        {req.paymentMethod === "usdt" && req.blockchainVerified !== undefined && (
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-medium ${
                            req.blockchainValid
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                              : "bg-red-500/10 text-red-400 border border-red-500/15"
                          }`}>
                            {req.blockchainValid ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                            <span>{req.blockchainValid ? "تم التحقق من البلوكتشين بنجاح" : `فشل التحقق: ${req.blockchainError || "غير معروف"}`}</span>
                          </div>
                        )}
                        {req.paymentMethod === "usdt" && req.blockchainVerified === false && !req.blockchainValid && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/15">
                            <WifiOff className="w-3 h-3" />
                            <span>لم يتم التحقق التلقائي (مشكلة اتصال) — راجع يدوياً</span>
                          </div>
                        )}
                        {(req.proofUrl || req.paymentProofUrl) && (
                          <div className="mt-1">
                            <button onClick={() => handleViewProofImage(req.proofUrl || req.paymentProofUrl || "")} className="flex items-center gap-1.5 text-[10px] text-sky-400 hover:text-sky-300 transition-colors">
                              <Image className="w-3.5 h-3.5" aria-hidden="true" /> عرض صورة الإثبات
                            </button>
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handlePaymentAction(req.id, "approve")} className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 active:scale-95 transition-transform flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> قبول
                          </button>
                          <button onClick={() => handlePaymentAction(req.id, "reject")} className="flex-1 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center justify-center gap-1">
                            <XCircle className="w-3 h-3" /> رفض
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* ── App Settings Card ── */}
            <div className="glass-card border-amber-500/15 overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">إعدادات التسجيل</span>
                </div>
                <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3 border border-border">
                  <div>
                    <div className="text-[11px] font-semibold text-foreground">تفعيل تلقائي عند التسجيل</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">يتم تفعيل الحساب والباقة المجانية تلقائياً بدون موافقة</div>
                  </div>
                  <button onClick={() => handleSetAutoApprove(!appSettings.autoApproveOnRegister)}
                    className={`w-11 h-6 rounded-full transition-all duration-300 relative ${appSettings.autoApproveOnRegister ? "bg-amber-500" : "bg-white/10"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${appSettings.autoApproveOnRegister ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Referral Settings Card ── */}
            <div className="glass-card border-violet-500/15 overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <Gift className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <span className="text-xs font-bold text-violet-400">نظام الاحالة</span>
                </div>

                {/* Toggle */}
                <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3 border border-border">
                  <div>
                    <div className="text-[11px] font-semibold text-foreground">تفعيل نظام الاحالة</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">يحصل المستخدمون على مكافأة عند دعوة أصدقائهم</div>
                  </div>
                  <button onClick={() => handleSetReferralEnabled(!appSettings.referralEnabled)}
                    className={`w-11 h-6 rounded-full transition-all duration-300 relative ${appSettings.referralEnabled ? "bg-violet-500" : "bg-white/10"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${appSettings.referralEnabled ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Reward Days */}
                {appSettings.referralEnabled && (
                  <div className="space-y-2.5 pt-1">
                    <div className="bg-muted/50 rounded-xl p-3 border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-semibold text-foreground">مكافأة المدعو (لصاحب الكود)</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">عدد الأيام المجانية عند تفعيل اشتراك المدعو</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleSetReferralRewardDays((appSettings.referralRewardDays || 7) - 1)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center text-foreground active:scale-90 transition-transform text-sm font-bold">−</button>
                          <span className="w-8 text-center text-sm font-bold text-violet-400">{appSettings.referralRewardDays || 7}</span>
                          <button onClick={() => handleSetReferralRewardDays((appSettings.referralRewardDays || 7) + 1)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center text-foreground active:scale-90 transition-transform text-sm font-bold">+</button>
                        </div>
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-3 border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-semibold text-foreground">مكافأة الداعي (للمدعو الجديد)</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">عدد الأيام المجانية للمدعو عند استخدام الكود</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleSetReferralInviteeDays((appSettings.referralInviteeRewardDays || 3) - 1)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center text-foreground active:scale-90 transition-transform text-sm font-bold">−</button>
                          <span className="w-8 text-center text-sm font-bold text-violet-400">{appSettings.referralInviteeRewardDays || 3}</span>
                          <button onClick={() => handleSetReferralInviteeDays((appSettings.referralInviteeRewardDays || 3) + 1)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center text-foreground active:scale-90 transition-transform text-sm font-bold">+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Packages Header ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/15 flex items-center justify-center">
                  <Package className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">إدارة الباقات</h2>
                  <p className="text-[9px] text-muted-foreground">{packages.filter(p => p.isActive).length} باقة مفعلة من {packages.length}</p>
                </div>
              </div>
              <button onClick={() => { if (showPkgForm && editingPkgId) resetPkgForm(); else setShowPkgForm(!showPkgForm); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-400 border border-amber-500/25 active:scale-95 transition-transform flex items-center gap-1">
                {showPkgForm && editingPkgId ? "✕ إلغاء التعديل" : showPkgForm ? "✕ إلغاء" : <><span className="text-amber-300">+</span> إنشاء باقة</>}
              </button>
              <div className="flex gap-1.5">
              <button onClick={() => askConfirm({
                title: "إضافة الباقات الافتراضية",
                description: "هل تريد إضافة الباقات الافتراضية إلى النظام؟ الباقات الحالية لن تُحذف ولن تتأثر.",
                variant: "info",
                confirmLabel: "نعم، إضافة",
                icon: <Sparkles className="w-5 h-5 text-emerald-400" />,
                action: async () => { await fetch("/api/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: false }) }); fetchPackages(); toast.success("تم إنشاء الباقات الافتراضية"); },
              })}
                className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-gradient-to-r from-emerald-500/20 to-green-500/15 text-emerald-400 border border-emerald-500/25 active:scale-95 transition-transform flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> باقات افتراضية
              </button>
              </div>
            </div>

            {/* ── Create/Edit Package Form ── */}
            <AnimatePresence>
            {showPkgForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="glass-card border-amber-500/20 bg-muted/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    {editingPkgId ? <Settings className="w-3 h-3 text-amber-400" /> : <Sparkles className="w-3 h-3 text-amber-400" />}
                  </div>
                  <span className="text-[11px] font-bold text-amber-400">{editingPkgId ? "تعديل الباقة" : "إنشاء باقة جديدة"}</span>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="col-span-2">
                    <label className="text-[9px] text-muted-foreground mb-1 block font-medium">اسم الباقة *</label>
                    <Input value={pkgFormName} onChange={e => setPkgFormName(e.target.value)} placeholder="مثال: الباقة الشهرية VIP"
                      className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-[11px]" dir="rtl" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground mb-1 block font-medium">المدة (أيام) *</label>
                    <Input type="number" value={pkgFormDays} onChange={e => setPkgFormDays(e.target.value)} placeholder="30"
                      className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-[11px]" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground mb-1 block font-medium">السعر ($)</label>
                    <Input type="number" value={pkgFormPrice} onChange={e => setPkgFormPrice(e.target.value)} placeholder="0"
                      className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-[11px]" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground mb-1 block font-medium">نوع الباقة</label>
                    <div className="flex gap-1.5 h-[40px]">
                      {([
                        { key: "trial" as const, label: "تجربة", color: "sky" },
                        { key: "free" as const, label: "مجانية", color: "emerald" },
                        { key: "paid" as const, label: "مدفوعة", color: "purple" },
                      ]).map(t => (
                        <button key={t.key} onClick={() => setPkgFormType(t.key)}
                          className={`flex-1 rounded-xl text-[10px] font-semibold transition-all border ${pkgFormType === t.key ? `bg-${t.color}-500/20 text-${t.color}-400 border-${t.color}-500/30` : "bg-muted/50 text-muted-foreground border-border"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground mb-1 block font-medium">الحد الأقصى للإشارات (0 = غير محدود)</label>
                    <Input type="number" value={pkgFormMaxSignals} onChange={e => setPkgFormMaxSignals(e.target.value)} placeholder="0"
                      className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-[11px]" dir="ltr" />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-[9px] text-muted-foreground mb-1 block font-medium">وصف مختصر للباقة</label>
                  <Input value={pkgFormDesc} onChange={e => setPkgFormDesc(e.target.value)} placeholder="وصف قصير يظهر في بطاقة الباقة..."
                    className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-[11px]" dir="rtl" />
                </div>

                {/* Feature toggles */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setPkgFormPriority(!pkgFormPriority)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold border transition-all active:scale-[0.98] ${pkgFormPriority ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-muted/40 text-muted-foreground border-border"}`}>
                    <Zap className="w-3.5 h-3.5" />
                    دعم أولوي
                  </button>
                  <button onClick={() => setPkgFormEarlyEntry(!pkgFormEarlyEntry)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold border transition-all active:scale-[0.98] ${pkgFormEarlyEntry ? "bg-sky-500/15 text-sky-400 border-sky-500/25" : "bg-muted/40 text-muted-foreground border-border"}`}>
                    <Timer className="w-3.5 h-3.5" />
                    دخول مبكر
                  </button>
                  <button onClick={() => setPkgFormActive(!pkgFormActive)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold border transition-all active:scale-[0.98] ${pkgFormActive ? "bg-amber-500/15 text-amber-400 border-amber-500/25" : "bg-muted/40 text-muted-foreground border-border"}`}>
                    {pkgFormActive ? "● مفعلة" : "○ معطلة"}
                  </button>
                </div>

                {/* Instrument Categories Selector */}
                <div>
                  <label className="text-[9px] text-muted-foreground mb-1.5 block font-medium">فئات الأدوات المتاحة للباقة</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {INST_CATS.map(cat => {
                      const sel = pkgFormInstruments.includes(cat.id);
                      return (
                        <button key={cat.id} onClick={() => setPkgFormInstruments(p => sel ? p.filter(i => i !== cat.id) : [...p, cat.id])}
                          className={`flex items-center gap-1.5 py-2 px-2 rounded-xl text-[10px] font-medium border transition-all active:scale-[0.98] ${sel ? "bg-amber-500/15 text-amber-400 border-amber-500/25" : "bg-muted/40 text-muted-foreground border-border opacity-60"}`}>
                          <span className="text-sm">{cat.icon}</span>
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Features list */}
                <div>
                  <label className="text-[9px] text-muted-foreground mb-1 block font-medium">المميزات (كل سطر = مميزة واحدة)</label>
                  <Textarea value={pkgFormFeatures} onChange={e => setPkgFormFeatures(e.target.value)}
                    placeholder={"إشارات ذهبية يومية\nتحليل فني متقدم\nدعم مباشر 24/7\nوصول لجميع الأزواج"}
                    className="glass-input text-foreground placeholder:text-muted-foreground min-h-[100px] text-[11px] resize-none" dir="rtl" rows={4} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={handleSavePackage} disabled={pkgLoad || !pkgFormName || !pkgFormDays}
                    className="flex-1 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[11px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5">
                    {pkgLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{editingPkgId ? "حفظ التعديلات" : "إنشاء الباقة"}</>}
                  </button>
                  <button onClick={resetPkgForm} className="px-5 h-10 rounded-xl bg-muted/60 text-muted-foreground text-[11px] font-medium active:scale-[0.98] transition-transform">إلغاء</button>
                </div>
              </div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* ── Package Cards ── */}
            {packages.length === 0 ? (
              <EmptyState icon={<Package className="w-7 h-7" />} title="لا توجد باقات حالياً" subtitle="أنشئ باقة جديدة أو استخدم زر البيانات التجريبية" />
            ) : (
              <div className="space-y-3">
                {packages.map((pkg, idx) => {
                  const isTrial = appSettings.freeTrialPackageId === pkg.id;
                  const pkgColors = pkg.type === "free"
                    ? { bg: "from-emerald-500/10 to-green-500/5", border: "border-emerald-500/20", accent: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400" }
                    : pkg.type === "trial"
                    ? { bg: "from-sky-500/10 to-blue-500/5", border: "border-sky-500/20", accent: "text-sky-400", badge: "bg-sky-500/15 text-sky-400" }
                    : { bg: "from-purple-500/10 to-violet-500/5", border: "border-purple-500/20", accent: "text-purple-400", badge: "bg-purple-500/15 text-purple-400" };

                  return (() => {
                    const pkgBg = isTrial
                      ? "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(255,140,0,0.03) 100%)"
                      : pkg.isActive
                      ? "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)"
                      : undefined;
                    return (
                    <motion.div key={pkg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: pkg.isActive ? 1 : 0.5, y: 0 }} transition={{ delay: idx * 0.05 }}
                      className={`rounded-2xl border overflow-hidden transition-all ${isTrial ? "border-amber-500/30 ring-1 ring-amber-500/10" : pkg.isActive ? pkgColors.border : "border-white/[0.03]"}`}
                      style={pkgBg ? { background: pkgBg } : undefined}>
                      {/* Header Row */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Name + Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-extrabold text-foreground">{pkg.name}</span>
                              {isTrial && (
                                <span className="text-[8px] bg-amber-500/25 text-amber-400 px-1.5 py-0.5 rounded-md font-bold animate-pulse flex items-center gap-0.5">
                                  <Sparkles className="w-2 h-2" /> التجربة التلقائية
                                </span>
                              )}
                              {!pkg.isActive && <span className="text-[8px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md font-bold">معطلة</span>}
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold ${pkgColors.badge}`}>
                                {pkg.type === "free" ? "مجانية" : pkg.type === "trial" ? "تجربة" : "مدفوعة"}
                              </span>
                            </div>
                            {/* Description */}
                            {pkg.description && <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">{pkg.description}</p>}
                          </div>
                          {/* Price Badge */}
                          <div className="text-left flex-shrink-0">
                            {pkg.price > 0 ? (
                              <div className="text-center">
                                <div className="text-2xl font-black text-amber-400 font-mono leading-tight">${pkg.price}</div>
                                <div className="text-[8px] text-muted-foreground mt-0.5">{pkg.durationDays} يوم</div>
                                <div className="text-[7px] text-muted-foreground/60">{pkg.durationDays >= 365 ? `${(pkg.price / (pkg.durationDays / 30)).toFixed(1)}/شهر` : `${((pkg.price / pkg.durationDays) * 30).toFixed(0)}/شهر`}</div>
                              </div>
                            ) : (
                              <div className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20">
                                <span className="text-xs font-bold text-emerald-400">مجاني</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Feature List */}
                        {(pkg.features && pkg.features.length > 0) && (
                          <div className="mt-3 space-y-1">
                            {pkg.features.map((f, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <span className="text-[10px] text-foreground/80 leading-relaxed">{f}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Instruments */}
                        {pkg.instruments && pkg.instruments.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                            {pkg.instruments.map(instId => { const c = INST_CATS.find(x => x.id === instId); return c ? (<span key={instId} className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[9px] text-foreground/80"><span>{c.icon}</span> {c.label}</span>) : null; })}
                          </div>
                        )}

                        {/* Quick Stats Row */}
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                          {pkg.prioritySupport && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-[9px] text-emerald-400 font-medium">
                              <Zap className="w-3 h-3" /> دعم أولوي
                            </div>
                          )}
                          {pkg.showEntryEarly && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 text-[9px] text-sky-400 font-medium">
                              <Timer className="w-3 h-3" /> دخول مبكر
                            </div>
                          )}
                          {pkg.maxSignals > 0 ? (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 text-[9px] text-purple-400 font-medium">
                              <Target className="w-3 h-3" /> {pkg.maxSignals} إشارة/يوم
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-[9px] text-amber-400 font-medium">
                              <Activity className="w-3 h-3" /> إشارات غير محدودة
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="flex gap-1.5 px-4 py-2.5 border-t border-border/40 flex-wrap bg-muted/20">
                        <button onClick={() => openEditPkg(pkg)}
                          className="px-3 py-1.5 rounded-lg text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform flex items-center gap-1">
                          <Settings className="w-3 h-3" /> تعديل
                        </button>
                        {pkg.type === "trial" || pkg.type === "free" ? (
                          <button onClick={() => handleSetTrialPkg(pkg.id)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all active:scale-95 flex items-center gap-1 ${isTrial ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-muted/60 text-muted-foreground border border-border"}`}>
                            {isTrial ? "✓ تجربة تلقائية" : "تعيين كتجربة"}
                          </button>
                        ) : null}
                        <button onClick={() => handleTogglePackage(pkg.id, !pkg.isActive)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-medium border active:scale-95 transition-transform flex items-center gap-1 ${pkg.isActive ? "bg-amber-500/10 text-amber-300/70 border-amber-500/15" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"}`}>
                          {pkg.isActive ? "تعطيل" : "تفعيل"}
                        </button>
                        <button onClick={() => handleDeletePackage(pkg.id)}
                          className="px-3 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/5 text-red-300/60 border border-red-500/10 active:scale-95 transition-transform flex items-center gap-1 mr-auto">
                          <Trash2 className="w-3 h-3" /> حذف
                        </button>
                      </div>
                    </motion.div>
                    );
                  })();
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ══════ TAB: PACKAGES (User) ══════ */}
        {tab === "packages" && !isAdmin && (
          <motion.div key="packages-user" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
            {/* ── Header ── */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/15 flex items-center justify-center">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">الاشتراك في الباقات</h2>
                <p className="text-[9px] text-muted-foreground">اختر الباقة المناسبة لك وابدأ رحلة التداول</p>
              </div>
            </div>

            {/* ── Active Subscription Banner ── */}
            {session?.subscriptionType === "subscriber" && session?.subscriptionExpiry && new Date(session.subscriptionExpiry).getTime() > Date.now() && (
              (() => {
                const remainingMs = new Date(session.subscriptionExpiry!).getTime() - Date.now();
                const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
                const expiryDate = new Date(session.subscriptionExpiry);
                const currentPkg = packages.find(p => p.id === session.packageId);
                const isFreeOrTrial = currentPkg && (currentPkg.type === "free" || currentPkg.type === "trial");
                const daysColor = remainingDays > 7 ? "text-emerald-400" : remainingDays > 3 ? "text-amber-400" : "text-red-400";
                const daysBg = remainingDays > 7 ? "bg-emerald-500/15 border-emerald-500/25" : remainingDays > 3 ? "bg-amber-500/15 border-amber-500/25" : "bg-red-500/15 border-red-500/25";
                const daysTextColor = remainingDays > 7 ? "text-emerald-400" : remainingDays > 3 ? "text-amber-400" : "text-red-400";
                const barGrad = remainingDays > 7 ? "from-emerald-400 to-emerald-500" : remainingDays > 3 ? "from-amber-400 to-amber-500" : "from-red-400 to-red-500";
                const totalDays = currentPkg ? currentPkg.durationDays : 30;
                const progressPct = Math.min(100, Math.max(0, (remainingDays / totalDays) * 100));
                // Find next paid package for upgrade
                const paidPkgs = packages.filter(p => p.isActive && p.type === "paid").sort((a, b) => a.order - b.order);
                const currentPkgIdx = currentPkg ? paidPkgs.findIndex(p => p.id === currentPkg.id) : -1;
                const nextPkg = currentPkgIdx >= 0 && currentPkgIdx < paidPkgs.length - 1 ? paidPkgs[currentPkgIdx + 1] : null;
                let upgradePrice = 0;
                if (nextPkg && currentPkg && currentPkg.type === "paid") {
                  const remainingValue = (remainingDays / currentPkg.durationDays) * currentPkg.price;
                  upgradePrice = Math.ceil(Math.max(0, nextPkg.price - remainingValue));
                } else if (nextPkg && isFreeOrTrial) {
                  upgradePrice = nextPkg.price;
                }
                return (
                  <div className="card-premium overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-l from-amber-400 via-yellow-500 to-orange-500" />
                    <div className="p-5 space-y-4">
                      {/* Status row: crown + name + badge */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20">
                          <Crown className="w-6 h-6 text-black" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-extrabold text-foreground">{session.packageName}</span>
                            <span className="badge-active">
                              مفعّل
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">اشتراكك الحالي نشط ومفعل</p>
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">الأيام المتبقية</span>
                          <span className={`text-sm font-black ${daysTextColor}`}>{remainingDays > 0 ? remainingDays : 0} <span className="text-[9px] text-muted-foreground font-normal">يوم من {totalDays}</span></span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-l ${barGrad} transition-all duration-700`} style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarDays className={`w-3 h-3 ${daysTextColor}`} />{expiryDate.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}</span>
                          <span>{Math.round(progressPct)}% متبقي</span>
                        </div>
                      </div>
                      {/* Upgrade to next package */}
                      {nextPkg && upgradePrice > 0 && (
                        <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-sky-400" />
                            <span className="text-[11px] font-bold text-sky-400">الترقية للباقة التالية</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[10px] text-muted-foreground">
                                {isFreeOrTrial ? "اشترك في" : "ترقية إلى"} <span className="font-bold text-foreground">{nextPkg.name}</span>
                                {isFreeOrTrial ? "" : " — دفع الفرق فقط"}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {!isFreeOrTrial && <span className="text-[9px] text-muted-foreground line-through">${nextPkg.price}</span>}
                                <span className="text-base font-black text-sky-400 font-mono">${upgradePrice}</span>
                                {!isFreeOrTrial && <span className="text-[8px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded-md font-bold">وفر ${nextPkg.price - upgradePrice}</span>}
                              </div>
                              {isFreeOrTrial ? (
                                <div className="text-[8px] text-muted-foreground mt-1">{nextPkg.durationDays} يوم</div>
                              ) : (
                                <div className="text-[8px] text-muted-foreground mt-1">يتم تمديد {nextPkg.durationDays} يوم إضافي من تاريخ الانتهاء الحالي</div>
                              )}
                            </div>
                            <button onClick={() => { setSelectedPkg(nextPkg); setPaymentMethod(null); setSelectedLocalMethod(null); setSelectedUsdtNetwork(null); setUsdtTxid(""); setPaymentProofFile(null); setPaymentProofPreview(null); setPaymentResult(null); }}
                              className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[10px] font-bold active:scale-[0.98] transition-transform flex items-center gap-1.5 shadow-sm shadow-sky-500/20">
                              <Sparkles className="w-3.5 h-3.5" /> ترقية الآن
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Cancel button */}
                      <button onClick={handleCancelSubscription}
                        className="w-full py-2.5 rounded-xl text-[10px] font-medium text-red-400/70 bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" /> إلغاء الاشتراك
                      </button>
                    </div>
                  </div>
                );
              })()
            )}

            {/* ── Payment Result States ── */}
            <AnimatePresence>
            {paymentResult === "success" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="card-success p-6 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto animate-check-pop">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-400">تم تفعيل الاشتراك بنجاح!</h3>
                  <p className="text-xs text-muted-foreground mt-1">سيتم تسجيل خروجك تلقائياً لتسجيل الدخول بالباقة الجديدة</p>
                </div>
              </motion.div>
            )}
            {paymentResult === "pending" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="glass-card border-amber-500/20 p-6 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto status-pending-icon">
                  <Clock className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-400">تم إرسال طلب الدفع</h3>
                  <p className="text-xs text-muted-foreground mt-1">سيتم مراجعة طلبك من قبل الإدارة وسيتم تفعيل الاشتراك بعد القبول.</p>
                </div>
                <button onClick={resetPaymentState} className="px-4 py-2 rounded-xl text-xs font-semibold glass-subtle text-foreground active:scale-95 transition-transform">تصفح الباقات</button>
              </motion.div>
            )}
            </AnimatePresence>

            {/* ── Payment Flow (USDT or Local) ── */}
            <AnimatePresence>
            {selectedPkg && !paymentResult && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                {/* Back button */}
                <button onClick={resetPaymentState} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ← العودة للباقات
                </button>

                {/* Selected Package Summary */}
                <div className="glass-card border-amber-500/20 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{selectedPkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{selectedPkg.durationDays} يوم</p>
                    </div>
                    <div className="text-2xl font-black gold-gradient-text font-mono">${selectedPkg.price}</div>
                  </div>
                </div>

                {/* Payment Method Selection (if not chosen yet) */}
                {!paymentMethod && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-foreground">اختر طريقة الدفع</p>
                    {/* USDT Payment Card - show if any networks configured */}
                    {(appSettings.usdtNetworks || []).filter(n => n.isActive).length > 0 && (
                      <button onClick={() => setPaymentMethod("usdt")} className="w-full glass-card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform hover:border-amber-500/25">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                          <Wallet className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-xs font-bold text-foreground">USDT (TETHER)</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">تحويل مباشر — تفعيل فوري تلقائي</div>
                        </div>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg font-bold">فوري</span>
                      </button>
                    )}
                    {/* Local Currency Payment Methods */}
                    {userPaymentMethods.map(m => (
                      <button key={m.id} onClick={() => { setPaymentMethod("local"); setSelectedLocalMethod(m); }} className="w-full glass-card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform hover:border-sky-500/25">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                          <CreditCard className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-xs font-bold text-foreground">{m.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{m.currencyName} — مراجعة يدوية خلال 24 ساعة</div>
                        </div>
                        <div className="text-left flex-shrink-0">
                          <div className="text-[10px] font-bold text-sky-400 font-mono">{(selectedPkg.price * m.exchangeRate).toLocaleString()}</div>
                          <div className="text-[8px] text-muted-foreground">{m.currencyCode}</div>
                        </div>
                      </button>
                    ))}
                    {(appSettings.usdtNetworks || []).filter(n => n.isActive).length === 0 && userPaymentMethods.length === 0 && (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">لا توجد طرق دفع متاحة حالياً</p>
                        <p className="text-[10px] text-muted-foreground mt-1">تواصل مع الإدارة للاشتراك</p>
                      </div>
                    )}
                  </div>
                )}

                {/* USDT Payment Form */}
                {paymentMethod === "usdt" && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="glass-card border-amber-500/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">دفع USDT</span>
                      </div>
                      {(() => {
                        const activeNetworks = (appSettings.usdtNetworks || []).filter(n => n.isActive);
                        // If only one network, auto-select it
                        const displayNetwork = selectedUsdtNetwork || (activeNetworks.length === 1 ? activeNetworks[0] : null);
                        const displayAddress = displayNetwork?.address || appSettings.usdtWalletAddress || "";
                        const displayNetName = displayNetwork?.network || appSettings.usdtNetwork || "TRC20";
                        if (!displayAddress) return (
                          <div className="text-center py-2">
                            <p className="text-xs text-muted-foreground">عنوان المحفظة غير متاح حالياً</p>
                            <p className="text-[10px] text-muted-foreground mt-1">تواصل مع الإدارة للاشتراك</p>
                          </div>
                        );
                        return (
                          <>
                            {/* Network Selection (if multiple) */}
                            {activeNetworks.length > 1 && !selectedUsdtNetwork && (
                              <div className="space-y-2">
                                <label className="text-[9px] text-muted-foreground font-medium block">اختر الشبكة:</label>
                                <div className="space-y-1.5">
                                  {activeNetworks.map(net => (
                                    <button key={net.id} onClick={() => setSelectedUsdtNetwork(net)}
                                      className="w-full rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between active:scale-[0.98] transition-transform hover:border-amber-500/25">
                                      <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                                          <Wallet className="w-4 h-4 text-amber-400" />
                                        </div>
                                        <span className="text-[11px] font-bold text-foreground">{net.network}</span>
                                      </div>
                                      <span className="text-[8px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md font-mono">{net.network}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Show selected network with option to change */}
                            {selectedUsdtNetwork && activeNetworks.length > 1 && (
                              <button onClick={() => setSelectedUsdtNetwork(null)} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                                ← تغيير الشبكة
                              </button>
                            )}
                            {/* Step 1: Copy wallet address */}
                            <div className="glass-subtle rounded-xl p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] text-muted-foreground font-medium">الخطوة 1: انسخ عنوان المحفظة</span>
                                <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-md font-mono">{displayNetName}</span>
                              </div>
                              <div className="bg-black/20 rounded-lg p-2.5">
                                <div className="text-[10px] font-mono text-foreground break-all select-all" dir="ltr">{displayAddress}</div>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(displayAddress); toast.success("تم نسخ العنوان"); }}
                                className="mt-2 w-full py-2 rounded-lg text-[10px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/15 hover:bg-amber-500/15 transition-colors flex items-center justify-center gap-1.5">
                                <Copy className="w-3 h-3" /> نسخ عنوان المحفظة
                              </button>
                            </div>
                            {/* Step 2: Enter TXID */}
                            <div>
                              <label className="text-[9px] text-muted-foreground mb-1 block font-medium">الخطوة 2: أدخل رقم العملية (TXID) بعد التحويل</label>
                              <Input value={usdtTxid} onChange={e => setUsdtTxid(e.target.value)} placeholder="أدخل رقم العملية..."
                                className="glass-input text-foreground placeholder:text-muted-foreground h-11 text-[11px] font-mono" dir="ltr" />
                            </div>
                            {/* Activate */}
                            <button onClick={handleUsdtPayment} disabled={paymentLoad || !usdtTxid.trim()}
                              className="w-full h-11 rounded-xl gold-gradient text-black text-xs font-bold disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
                              {paymentLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> تفعيل الاشتراك الآن</>}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}

                {/* Local Payment Form */}
                {paymentMethod === "local" && selectedLocalMethod && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="glass-card border-sky-500/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-sky-400" />
                          <span className="text-xs font-bold text-sky-400">{selectedLocalMethod.name}</span>
                        </div>
                        <span className="text-[9px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-lg font-bold">{selectedLocalMethod.walletName}</span>
                      </div>

                      {/* Wallet Info */}
                      <div className="bg-muted/60 rounded-xl p-3 border border-border space-y-2">
                        <div>
                          <div className="text-[9px] text-muted-foreground mb-1">رقم المحفظة</div>
                          <div className="bg-black/20 rounded-lg p-2.5">
                            <div className="text-[10px] font-mono text-foreground break-all select-all" dir="ltr">{selectedLocalMethod.walletAddress}</div>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(selectedLocalMethod.walletAddress || ""); toast.success("تم نسخ رقم المحفظة"); }}
                            className="mt-1.5 text-[10px] text-sky-400 font-medium hover:text-sky-300 transition-colors flex items-center gap-1">
                            <Copy className="w-3 h-3" /> نسخ رقم المحفظة
                          </button>
                        </div>
                      </div>

                      {/* Amount Info */}
                      <div className="bg-gradient-to-r from-sky-500/10 to-cyan-500/5 rounded-xl p-3 border border-sky-500/15">
                        <div className="text-[9px] text-muted-foreground mb-1">المبلغ المطلوب التحويل</div>
                        <div className="text-xl font-black text-foreground">
                          {(selectedPkg.price * selectedLocalMethod.exchangeRate).toLocaleString()} <span className="text-xs text-muted-foreground">{selectedLocalMethod.currencyCode}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1" dir="ltr">{selectedPkg.price} USDT × {selectedLocalMethod.exchangeRate.toLocaleString()} = {(selectedPkg.price * selectedLocalMethod.exchangeRate).toLocaleString()} {selectedLocalMethod.currencyCode}</div>
                      </div>

                      {/* Upload Proof */}
                      <div>
                        <label className="text-[9px] text-muted-foreground mb-1.5 block font-medium">صورة إثبات التحويل <span className="text-red-400">*إجباري</span></label>
                        <div className="relative">
                          <input type="file" accept="image/*" className="hidden" id="payment-proof" onChange={e => {
                            const f = e.target.files?.[0]; if (!f) return;
                            setPaymentProofFile(f);
                            const r = new FileReader(); r.onload = () => setPaymentProofPreview(r.result as string); r.readAsDataURL(f);
                          }} />
                          {paymentProofPreview ? (
                            <div className="relative rounded-xl overflow-hidden border border-border">
                              <img src={paymentProofPreview} alt="إثبات الدفع" className="w-full h-40 object-cover" />
                              <button onClick={() => { setPaymentProofFile(null); setPaymentProofPreview(null); }} className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                                <XCircle className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          ) : (
                            <label htmlFor="payment-proof" className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:border-sky-500/30 transition-colors">
                              <Upload className="w-6 h-6 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">اضغط لرفع صورة إثبات التحويل</span>
                            </label>
                          )}
                        </div>
                      </div>
                      <button onClick={handleLocalPayment} disabled={paymentLoad || !paymentProofFile}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs font-bold disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
                        {paymentLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4" /> إرسال طلب الدفع</>}
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
            </AnimatePresence>

            {/* ── Package Cards (only show when no payment flow active) ── */}
            {!selectedPkg && !paymentResult && (
              packages.length === 0 ? (
                <EmptyState icon={<Package className="w-7 h-7" />} title="لا توجد باقات متاحة حالياً" subtitle="يتم إضافة الباقات قريباً. تواصل مع الإدارة." />
              ) : (
                <div className="space-y-3">
                  {packages.filter(p => p.isActive && p.type === "paid").map((pkg, idx) => {
                    // Check upgrade eligibility
                    const hasActiveSub = session?.subscriptionType === "subscriber" && session?.subscriptionExpiry && new Date(session.subscriptionExpiry).getTime() > Date.now();
                    const isSamePkg = session?.packageId === pkg.id;
                    const currentPkg = session?.packageId ? packages.find(p => p.id === session.packageId) : null;
                    const isCurrentFreeTrial = currentPkg && (currentPkg.type === "free" || currentPkg.type === "trial");
                    const isCurrentPaid = currentPkg && currentPkg.type === "paid";
                    const isUpgrade = hasActiveSub && !isSamePkg && isCurrentPaid && pkg.type === "paid";
                    const canSubscribe = !isSamePkg;
                    // Calculate upgrade price
                    let upgradePrice = 0;
                    let remainingDays = 0;
                    if (isUpgrade && currentPkg && session?.subscriptionExpiry) {
                      remainingDays = Math.max(0, Math.ceil((new Date(session.subscriptionExpiry).getTime() - Date.now()) / 86400000));
                      const remainingValue = (remainingDays / currentPkg.durationDays) * currentPkg.price;
                      upgradePrice = Math.ceil(Math.max(0, pkg.price - remainingValue));
                    }
                    const pkgBg = isSamePkg
                      ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)"
                      : "linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,140,0,0.02) 100%)";
                    return (
                      <motion.div key={pkg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                        className={`rounded-2xl border overflow-hidden ${isSamePkg ? "border-emerald-500/20" : "border-amber-500/20"}`} style={{ background: pkgBg }}>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-extrabold text-foreground">{pkg.name}</span>
                                {isSamePkg && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                    باقتك الحالية
                                  </span>
                                )}
                                {isUpgrade && upgradePrice > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/20">
                                    <Sparkles className="w-2.5 h-2.5" /> ترقية
                                  </span>
                                )}
                              </div>
                              {pkg.description && <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{pkg.description}</p>}
                            </div>
                            <div className="text-left flex-shrink-0">
                              {isSamePkg ? (
                                <div className="text-center">
                                  <div className="text-2xl font-black text-emerald-400 font-mono leading-tight">${pkg.price}</div>
                                  <div className="text-[8px] text-emerald-400/70 mt-0.5">مفعّلة</div>
                                </div>
                              ) : isUpgrade && upgradePrice > 0 ? (
                                <div className="text-center">
                                  <div className="text-[9px] text-muted-foreground line-through">${pkg.price}</div>
                                  <div className="text-2xl font-black text-sky-400 font-mono leading-tight">${upgradePrice}</div>
                                  <div className="text-[8px] text-sky-400/70 mt-0.5">سعر الترقية</div>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <div className="text-2xl font-black text-amber-400 font-mono leading-tight">${pkg.price}</div>
                                  <div className="text-[8px] text-muted-foreground mt-0.5">{pkg.durationDays} يوم</div>
                                  {userPaymentMethods.length > 0 && (
                                    <div className="text-[8px] text-muted-foreground mt-0.5">
                                      {userPaymentMethods.map(m => `${(pkg.price * m.exchangeRate).toLocaleString()} ${m.currencyCode}`).join(" / ")}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Upgrade info bar */}
                          {isUpgrade && upgradePrice > 0 && (
                            <div className="mt-3 p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/15">
                              <div className="flex items-center gap-2 text-[9px]">
                                <Sparkles className="w-3 h-3 text-sky-400 flex-shrink-0" />
                                <span className="text-sky-400/80">
                                  ترقية من <span className="font-bold text-foreground/80">{currentPkg?.name}</span> — دفع الفرق فقط <span className="font-bold text-sky-400">${upgradePrice}</span> بدلاً من ${pkg.price} — يتم تمديد {pkg.durationDays} يوم من تاريخ الانتهاء الحالي
                                </span>
                              </div>
                            </div>
                          )}
                          {(pkg.features && pkg.features.length > 0) && (
                            <div className="mt-3 space-y-1">
                              {pkg.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  </div>
                                  <span className="text-[10px] text-foreground/80">{f}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pkg.instruments && pkg.instruments.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                              {pkg.instruments.map(instId => { const c = INST_CATS.find(x => x.id === instId); return c ? (<span key={instId} className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[9px] text-foreground/80"><span>{c.icon}</span> {c.label}</span>) : null; })}
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-2.5 border-t border-border/40 bg-muted/20">
                          {isSamePkg ? (
                            <div className="w-full h-10 rounded-xl bg-emerald-500/10 text-emerald-400/60 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-default">
                              <CheckCircle2 className="w-3.5 h-3.5" /> الباقة الحالية
                            </div>
                          ) : (
                            <button onClick={() => { setSelectedPkg(pkg); setPaymentMethod(null); setSelectedLocalMethod(null); setSelectedUsdtNetwork(null); setUsdtTxid(""); setPaymentProofFile(null); setPaymentProofPreview(null); setPaymentResult(null); }}
                              className={`w-full h-10 rounded-xl text-[11px] font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 ${isUpgrade ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white" : "gold-gradient text-black"}`}>
                              {isUpgrade ? <><Sparkles className="w-3.5 h-3.5" /> ترقية الآن</> : <><Crown className="w-3.5 h-3.5" /> اشترك الآن</>}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Referral Section ── */}
            <ReferralSection session={session} appSettings={appSettings} />

          </motion.div>
        )}

        {/* TAB: ACCOUNT */}

        {tab === "users" && isAdmin && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">

            {/* ═══ Section Header ═══ */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-500/15 border border-amber-500/20 flex items-center justify-center shadow-lg shadow-amber-500/10">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-extrabold text-foreground">إدارة المستخدمين</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{users.length} مستخدم مسجل</p>
                </div>
                <button onClick={fetchUsers} disabled={usersLoad} className="w-9 h-9 rounded-xl glass-subtle border border-border/50 flex items-center justify-center active:scale-95 transition-transform hover:bg-white/[0.06]">
                  <RefreshCw className={`w-4 h-4 text-muted-foreground ${usersLoad ? "animate-spin" : ""}`} />
                </button>
              </div>
              {/* Search */}
              <form onSubmit={e => e.preventDefault()} className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                <input type="text" placeholder="ابحث عن مستخدم بالاسم أو البريد..." dir="rtl"
                  className="glass-input w-full h-9 pr-9 pl-3 rounded-xl text-[11px] text-foreground placeholder:text-muted-foreground/50" />
              </form>
            </div>

            {usersLoad && <SignalsLoadingSkeleton />}
            {!usersLoad && users.length === 0 && (
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title="لا يوجد مستخدمين مسجلين حالياً"
                subtitle="المستخدمون الجدد سيظهرون هنا بعد التسجيل"
              />
            )}
            {!usersLoad && users.length > 0 && (
              <div className="space-y-5">

                {/* ═══ Stats Bar ═══ */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "الكل", count: users.length, color: "text-foreground", bg: "bg-muted/40" },
                    { label: "نشط", count: users.filter(u => u.status === "active").length, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                    { label: "معلق", count: users.filter(u => u.status === "pending").length, color: "text-amber-400", bg: "bg-amber-500/10" },
                    { label: "محظور", count: users.filter(u => u.status === "blocked").length, color: "text-red-400", bg: "bg-red-500/10" },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-2.5 border border-border/50 text-center`}>
                      <div className={`text-lg font-black ${s.color}`}>{s.count}</div>
                      <div className="text-[8px] text-muted-foreground font-medium mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* ═══ Pending Users ═══ */}
                {users.filter(u => u.status === "pending").length > 0 && (
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-1.5 h-5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[11px] text-amber-400 font-bold">بانتظار الموافقة</span>
                      <span className="badge-pending">{users.filter(u => u.status === "pending").length}</span>
                    </div>
                    <div className="space-y-2">
                    {users.filter(u => u.status === "pending").map(u => (
                      <div key={u.id} className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-3 transition-all hover:bg-amber-500/[0.05]">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/25 to-orange-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-amber-400">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-foreground truncate">{u.name}</div>
                            <div className="text-[9px] text-muted-foreground font-mono truncate" dir="ltr">{u.email}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="badge-pending">معلق</span>
                              <span className="text-[8px] text-muted-foreground/60">{new Date(u.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}</span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => askConfirm({
                              title: "قبول المستخدم",
                              description: `هل تريد قبول طلب التسجيل من "${u.name}"؟ سيتم تفعيل حسابه فوراً.`,
                              variant: "info",
                              confirmLabel: "نعم، قبول",
                              icon: <User className="w-5 h-5 text-emerald-400" />,
                              action: () => handleUserAction(u.id, "approve"),
                            })} className="px-3 py-1.5 rounded-lg text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 active:scale-95 transition-transform flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> قبول
                            </button>
                            <button onClick={() => handleDeleteUser(u.id)} className="px-2 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> رفض
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}

                {/* ═══ Active Users ═══ */}
                {users.filter(u => u.status === "active").length > 0 && (() => {
                  const actives = users.filter(u => u.status === "active");
                  const admins = actives.filter(u => u.role === "admin");
                  const subscribers = actives.filter(u => u.subscriptionType === "subscriber" && u.role !== "admin");
                  const agency = actives.filter(u => u.subscriptionType === "agency" && u.role !== "admin");
                  const regular = actives.filter(u => !u.subscriptionType || u.subscriptionType === "none");

                  return (
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-1.5 h-5 rounded-full bg-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-bold">المستخدمون النشطون</span>
                      <span className="badge-active">{actives.length}</span>
                      <div className="flex gap-1 mr-auto">
                        {admins.length > 0 && <span className="text-[7px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">{admins.length} مدير</span>}
                        {subscribers.length > 0 && <span className="text-[7px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full font-medium">{subscribers.length} مشترك</span>}
                        {agency.length > 0 && <span className="text-[7px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full font-medium">{agency.length} وكالة</span>}
                        {regular.length > 0 && <span className="text-[7px] bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">{regular.length} عادي</span>}
                      </div>
                    </div>
                    <div className="space-y-2">
                    {actives.map(u => {
                      const isAgency = u.subscriptionType === "agency";
                      const isSub = u.subscriptionType === "subscriber";
                      const expDays = u.subscriptionExpiry ? Math.ceil((new Date(u.subscriptionExpiry).getTime() - Date.now()) / 86400000) : null;
                      const isSuperAdmin = u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
                      const isPromotedAdmin = u.role === "admin" && !isSuperAdmin;
                      const avatarGradient = isSuperAdmin
                        ? "from-amber-400 via-yellow-500 to-orange-500 shadow-lg shadow-amber-500/20"
                        : isPromotedAdmin
                          ? "from-amber-500/30 to-amber-600/15"
                          : isAgency
                            ? "from-purple-500/25 to-violet-500/15"
                            : isSub
                              ? "from-sky-500/25 to-cyan-500/15"
                              : "from-emerald-500/20 to-green-500/10";
                      const avatarBorder = isSuperAdmin
                        ? "border-amber-400/30"
                        : isPromotedAdmin
                          ? "border-amber-500/20"
                          : isAgency
                            ? "border-purple-500/20"
                            : isSub
                              ? "border-sky-500/20"
                              : "border-emerald-500/15";
                      const textColor = isSuperAdmin ? "text-white" : isPromotedAdmin ? "text-amber-400" : isAgency ? "text-purple-300" : isSub ? "text-sky-300" : "text-emerald-300";

                      return (
                        <div key={u.id} className={`rounded-xl border p-3 transition-all hover:bg-white/[0.02] ${isSuperAdmin ? "border-amber-500/20 bg-gradient-to-l from-amber-500/[0.04]" : "border-border/40 bg-white/[0.01]"}`}>
                          {/* Main Row */}
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient} border ${avatarBorder} flex items-center justify-center flex-shrink-0`}>
                              {isSuperAdmin || isPromotedAdmin ? <Crown className={`w-4 h-4 ${textColor}`} /> : <span className={`text-sm font-black ${textColor}`}>{u.name?.charAt(0)?.toUpperCase() || "?"}</span>}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold text-foreground">{u.name}</span>
                                <span className="badge-active">نشط</span>
                                {isSuperAdmin && <span className="text-[7px] bg-gradient-to-r from-amber-500/30 to-orange-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/15">المدير الأعلى</span>}
                                {isPromotedAdmin && <span className="text-[7px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/10">مدير</span>}
                                {isAgency && <span className="text-[7px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full font-bold border border-purple-500/10">وكالة</span>}
                                {isSub && <span className="text-[7px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full font-bold border border-sky-500/10">مشترك</span>}
                              </div>
                              <div className="text-[9px] text-muted-foreground font-mono truncate mt-0.5" dir="ltr">{u.email}</div>
                              {/* Package Badge & Subscription Info */}
                              {u.packageName && (
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/15">
                                    <Package className="w-2.5 h-2.5" /> {u.packageName}
                                  </span>
                                  {u.hadFreeTrial && <span className="text-[7px] bg-amber-500/10 text-amber-400/60 px-1.5 py-0.5 rounded-md font-medium">سبق تجربة</span>}
                                  {expDays !== null && (
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                                      expDays > 7 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" :
                                      expDays > 3 ? "bg-sky-500/10 text-sky-400 border border-sky-500/15" :
                                      expDays > 0 ? "bg-amber-500/10 text-amber-400 border border-amber-500/15" :
                                      "bg-red-500/10 text-red-400 border border-red-500/15"
                                    }`}>
                                      {expDays > 0 ? `${expDays}ي متبقي` : "منتهي!"}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Date */}
                            <div className="text-[8px] text-muted-foreground/50 text-left flex-shrink-0 hidden sm:block">
                              {new Date(u.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                            </div>
                          </div>

                          {/* Action Buttons - Regular users (NOT super admin, NOT promoted admins) */}
                          {!isSuperAdmin && !isPromotedAdmin && (
                          <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-border/30 flex-wrap">
                            <button onClick={() => setShowAssignPkg(u.id)}
                              className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-sky-500/20">
                              <Package className="w-3 h-3" /> باقة
                            </button>
                            <button onClick={() => handleSetAgency(u.id)}
                              className={`px-2.5 py-1.5 rounded-lg text-[9px] font-medium active:scale-95 transition-transform flex items-center gap-1 ${isAgency ? "bg-purple-500/20 text-purple-400 border border-purple-500/25 hover:bg-purple-500/30" : "bg-purple-500/10 text-purple-400 border border-purple-500/15 hover:bg-purple-500/20"}`}>
                              {isAgency ? "✓ وكالة" : "وكالة"}
                            </button>
                            <button onClick={() => handleUserAction(u.id, "make_admin")} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-amber-500/20">
                              <Crown className="w-3 h-3" /> ترقية
                            </button>
                            <button onClick={() => handleUserAction(u.id, "block")} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-red-500/20">
                              <ShieldBan className="w-3 h-3" /> حظر
                            </button>
                            <button onClick={() => handleDeleteUser(u.id)} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/5 text-red-300/50 border border-red-500/10 active:scale-95 transition-transform flex items-center gap-1 mr-auto hover:bg-red-500/10 hover:text-red-400">
                              <Trash2 className="w-3 h-3" /> حذف
                            </button>
                          </div>
                          )}
                          {/* Action Buttons - Promoted admins only: can demote back */}
                          {isPromotedAdmin && (
                          <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-border/30 flex-wrap">
                            <button onClick={() => handleUserAction(u.id, "remove_admin")} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-red-500/20">
                              <Crown className="w-3 h-3" /> إزالة المدير
                            </button>
                          </div>
                          )}
                          {/* Assign Package Dropdown */}
                          {showAssignPkg === u.id && packages.filter(p => p.isActive).length > 0 && (
                            <div className="mt-2.5 glass-card p-3.5 space-y-3 animate-[fadeIn_0.2s_ease-out] border-sky-500/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Package className="w-3.5 h-3.5 text-sky-400" />
                                  <span className="text-[10px] font-bold text-sky-400">تعيين باقة</span>
                                </div>
                                <button onClick={() => setShowAssignPkg(null)} className="w-6 h-6 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors">
                                  <X className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </div>
                              {u.hadFreeTrial && (
                                <div className="flex items-center gap-1.5 bg-amber-500/10 rounded-lg px-2.5 py-2 border border-amber-500/15">
                                  <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="text-[9px] text-amber-300/80 leading-relaxed">
                                    هذا المستخدم سبق له أخذ تجربة مجانية. لا يمكن تفعيل الباقة المجانية مرة أخرى.
                                  </span>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                {packages.filter(p => p.isActive).map(pkg => {
                                  const isTrial = appSettings.freeTrialPackageId === pkg.id;
                                  const disabled = isTrial && u.hadFreeTrial;
                                  return (
                                    <button key={pkg.id}
                                      onClick={() => !disabled && handleAssignPackage(u.id, pkg.id)}
                                      className={`px-2.5 py-2.5 rounded-xl text-[9px] font-semibold border text-right transition-all ${
                                        disabled
                                          ? "bg-white/[0.02] text-muted-foreground/30 border-border/50 cursor-not-allowed line-through opacity-40"
                                          : "bg-sky-500/[0.06] text-sky-400 border-sky-500/15 active:scale-95 hover:bg-sky-500/15 hover:border-sky-500/30"
                                      }`}
                                      disabled={disabled}>
                                      <div className="flex items-center justify-between">
                                        <span className="truncate font-bold">{pkg.name}</span>
                                        <span className="text-[7px] text-muted-foreground flex-shrink-0 mr-1">{pkg.durationDays}ي{pkg.price > 0 ? ` · $${pkg.price}` : ""}</span>
                                      </div>
                                      {isTrial && !disabled && <div className="text-[7px] text-emerald-400 mt-0.5 font-bold">مجاني</div>}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                <Input type="number" value={assignDays} onChange={e => setAssignDays(e.target.value)} placeholder="أيام مخصصة (اختياري)"
                                  className="glass-input flex-1 h-9 text-[10px]" dir="ltr" />
                                <button onClick={() => setShowAssignPkg(null)} className="px-3 h-9 rounded-lg bg-muted/40 text-muted-foreground text-[9px] font-medium border border-border/50 hover:bg-muted/60 transition-colors">إلغاء</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  );
                })()}

                {/* ═══ Blocked Users ═══ */}
                {users.filter(u => u.status === "blocked").length > 0 && (
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-1.5 h-5 rounded-full bg-red-400" />
                      <span className="text-[11px] text-red-400 font-bold">محظورون</span>
                      <span className="badge-blocked">{users.filter(u => u.status === "blocked").length}</span>
                    </div>
                    <div className="space-y-2">
                    {users.filter(u => u.status === "blocked").map(u => (
                      <div key={u.id} className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-3 opacity-70">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-red-400">{u.name?.charAt(0)?.toUpperCase() || "?"}</span>
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-foreground/70 flex items-center gap-1.5">
                              {u.name}
                              <span className="badge-blocked">محظور</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground font-mono truncate mt-0.5" dir="ltr">{u.email}</div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => handleUserAction(u.id, "unblock")} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-emerald-500/20">
                              <Unlock className="w-3 h-3" /> فتح الحظر
                            </button>
                            <button onClick={() => handleDeleteUser(u.id)} className="px-2.5 py-1.5 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center gap-1 hover:bg-red-500/20">
                              <Trash2 className="w-3 h-3" /> حذف
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ Email Change Requests (Admin) ═══ */}
            {isAdmin && (
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/15 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <span className="text-[11px] text-foreground font-bold">طلبات تغيير البريد</span>
                    {emailRequests.filter(r => r.status === "pending").length > 0 && (
                      <span className="text-[7px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full font-bold">{emailRequests.filter(r => r.status === "pending").length}</span>
                    )}
                  </div>
                  <button onClick={fetchEmailRequests} className="w-7 h-7 rounded-lg glass-subtle border border-border/50 flex items-center justify-center hover:bg-white/[0.06] transition-colors">
                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                {emailRequests.filter(r => r.status === "pending").length === 0 && (
                  <div className="text-[10px] text-muted-foreground text-center py-4">
                    <Mail className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground/30" />
                    لا توجد طلبات معلقة
                  </div>
                )}
                {emailRequests.filter(r => r.status === "pending").map(r => (
                  <div key={r.id} className="rounded-xl border border-sky-500/10 bg-sky-500/[0.02] p-3 mb-2 last:mb-0 hover:bg-sky-500/[0.04] transition-colors">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div className="w-8 h-8 rounded-full bg-sky-500/15 border border-sky-500/15 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-foreground">{r.userName}</div>
                        <div className="text-[9px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="line-through font-mono" dir="ltr">{r.oldEmail}</span>
                          <ArrowLeft className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                          <span className="text-sky-400 font-mono" dir="ltr">{r.newEmail}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => askConfirm({
                        title: "قبول تغيير البريد",
                        description: `هل تريد قبول تغيير البريد من "${r.oldEmail}" إلى "${r.newEmail}" للمستخدم "${r.userName}"؟`,
                        variant: "info",
                        confirmLabel: "نعم، قبول",
                        icon: <Mail className="w-5 h-5 text-emerald-400" />,
                        action: () => handleEmailRequestAction(r.id, "approve"),
                      })} className="flex-1 px-2 py-2 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> قبول
                      </button>
                      <button onClick={() => askConfirm({
                        title: "رفض تغيير البريد",
                        description: `هل تريد رفض طلب تغيير البريد للمستخدم "${r.userName}"؟`,
                        variant: "warning",
                        confirmLabel: "نعم، رفض",
                        icon: <Mail className="w-5 h-5 text-red-400" />,
                        action: () => handleEmailRequestAction(r.id, "reject"),
                      })} className="flex-1 px-2 py-2 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/15 active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-red-500/20">
                        <XCircle className="w-3.5 h-3.5" /> رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
        {tab === "account" && session && (
          <motion.div key="account" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
            {/* Profile Card */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${isAdmin ? "bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 shadow-lg shadow-amber-500/20" : "bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-lg shadow-sky-500/20"}`}>
                  <span className="text-xl font-black text-white">{session.name?.charAt(0)?.toUpperCase() || "?"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-foreground text-base">{session.name}</span>
                    {isAdmin && (
                      <span className="badge-buy text-[7px]">
                        <Crown className="w-2.5 h-2.5" /> مدير
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono" dir="ltr">{session.email}</div>
                </div>
              </div>
            </div>

            {/* ── User Subscription Status ── */}
            {!isAdmin && (
              <div className="card-premium p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/15 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-sm font-bold text-foreground">حالة الاشتراك</span>
                </div>
                {session.subscriptionType && session.subscriptionType !== "none" ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${session.subscriptionType === "subscriber" ? "bg-emerald-400" : "bg-purple-400"}`} />
                      <span className={`text-xs font-bold ${session.subscriptionType === "subscriber" ? "text-emerald-400" : "text-purple-400"}`}>
                        {session.subscriptionType === "subscriber" ? "مشترك نشط" : "مسجل تحت وكالة"}
                      </span>
                    </div>
                    {session.packageName && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-muted-foreground">نوع الباقة</div>
                            <div className="text-[14px] font-extrabold text-foreground mt-0.5">{session.packageName}</div>
                          </div>
                          {session.subscriptionExpiry && (() => {
                            const days = Math.ceil((new Date(session.subscriptionExpiry).getTime() - Date.now()) / 86400000);
                            const maxDays = 30;
                            const pct = Math.min(100, Math.max(0, (days / maxDays) * 100));
                            const barColor = days > 7 ? "from-emerald-400 to-emerald-500" : days > 3 ? "from-amber-400 to-amber-500" : "from-red-400 to-red-500";
                            return (
                              <div className="text-center">
                                <div className={`text-xl font-black ${days > 7 ? "text-emerald-400" : days > 3 ? "text-amber-400" : "text-red-400"}`}>
                                  {days > 0 ? days : 0}
                                </div>
                                <div className="text-[9px] text-muted-foreground">يوم متبقي</div>
                              </div>
                            );
                          })()}
                        </div>
                        {session.subscriptionExpiry && (() => {
                          const days = Math.ceil((new Date(session.subscriptionExpiry).getTime() - Date.now()) / 86400000);
                          const maxDays = 30;
                          const pct = Math.min(100, Math.max(0, (days / maxDays) * 100));
                          const barColor = days > 7 ? "from-emerald-400 to-emerald-500" : days > 3 ? "from-amber-400 to-amber-500" : "from-red-400 to-red-500";
                          return (
                            <div className="space-y-2">
                              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div className={`h-full rounded-full bg-gradient-to-l ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] text-muted-foreground">
                                  <CalendarDays className="w-3 h-3 inline mr-1 opacity-50" />
                                  {new Date(session.subscriptionExpiry).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-2">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">لا يوجد اشتراك نشط حالياً</div>
                    <button onClick={() => setTab("packages")} className="mt-2 px-4 py-2 rounded-xl gold-gradient text-[10px] font-bold flex items-center gap-1.5 mx-auto">
                      <Crown className="w-3 h-3" /> تصفح الباقات والاشتراك
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── USER: Request Email Change ── */}
            {!isAdmin && (
              <div className="glass-card overflow-hidden">
                <button onClick={() => setShowEmailReqSection(!showEmailReqSection)} className="w-full p-4 flex items-center justify-between text-sm text-foreground/80 hover:bg-white/[0.02] transition-colors">
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/15 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    طلب تغيير البريد الإلكتروني
                  </span>
                  <ChevronIcon open={showEmailReqSection} />
                </button>
                {showEmailReqSection && (
                  <div className="px-4 pb-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                    <div className="text-[10px] text-muted-foreground glass-subtle rounded-lg p-2.5">
                      لتغيير بريدك الإلكتروني، أرسل طلبا وانتظر موافقة الإدارة
                    </div>
                    <Input type="email" value={emailReqNew} onChange={e => setEmailReqNew(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                      className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                    {emailReqMsg && (
                      <div className={`rounded-xl px-3 py-2 text-xs text-center ${emailReqMsg.includes("فشل") || emailReqMsg.includes("غير صالح") || emailReqMsg.includes("مسجل") ? "card-danger" : "card-success"}`}>
                        {emailReqMsg}
                      </div>
                    )}
                    <Button onClick={handleSubmitEmailChange} disabled={emailReqLoad || !emailReqNew} className="w-full h-10 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/25 text-xs font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-50">
                      {emailReqLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "إرسال طلب التغيير"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Change Password (both admin and user) */}
            <div className="glass-card overflow-hidden">
              <button onClick={() => setShowCp(!showCp)} className="w-full p-4 flex items-center justify-between text-sm text-foreground/80 hover:bg-white/[0.02] transition-colors">
                <span className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/15 flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  تغيير كلمة المرور
                </span>
                <ChevronIcon open={showCp} />
              </button>
              {showCp && (
                <div className="px-4 pb-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                  {isAdmin ? (
                    <>
                      <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                      <Input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                      <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                      <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                    </>
                  ) : (
                    <>
                      <Input type="password" value={cpCur} onChange={e => setCpCur(e.target.value)} placeholder="كلمة المرور الحالية"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                      <Input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="كلمة المرور الجديدة"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                      <Input type="password" value={cpConf} onChange={e => setCpConf(e.target.value)} placeholder="تأكيد كلمة المرور"
                        className="glass-input text-foreground placeholder:text-muted-foreground h-10 text-sm" dir="ltr" />
                    </>
                  )}
                  {cpErr && <div className="card-danger rounded-xl px-3 py-2 text-xs text-red-400 text-center">{cpErr}</div>}
                  <Button onClick={handleChangePwd} disabled={cpLoad} className="w-full h-10 rounded-xl gold-gradient text-black text-xs font-semibold disabled:opacity-50">
                    {cpLoad ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث كلمة المرور"}
                  </Button>
                </div>
              )}
            </div>

            {/* Admin Only: Clear All */}
            {isAdmin && (
              <div className="card-danger overflow-hidden">
                <button onClick={() => askConfirm({
                  title: "حذف جميع الإشارات",
                  description: "هل أنت متأكد من حذف جميع الإشارات من النظام؟ سيتم حذفها بشكل دائم ولا يمكن استرجاعها. هذا الإجراء يشمل جميع الإشارات النشطة والمغلقة.",
                  variant: "danger",
                  confirmLabel: "نعم، احذف الكل",
                  icon: <Trash2 className="w-5 h-5 text-red-400" />,
                  action: handleClearAll,
                })} className="w-full p-4 flex items-center justify-between text-sm text-red-400 hover:bg-red-500/[0.04] transition-colors">
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/15 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </div>
                    حذف جميع الإشارات
                  </span>
                </button>
              </div>
            )}

            {/* Logout */}
            <button onClick={handleLogout}
              className="w-full p-4 rounded-2xl text-red-400 text-sm font-semibold flex items-center justify-center gap-2.5 hover:bg-red-500/[0.08] transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.03) 100%)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
              تسجيل الخروج
            </button>
          </motion.div>
        )}
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      {/* ── Mobile Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-nav-premium glass-nav-border-animated safe-area-bottom h-16">
        <div className="max-w-lg mx-auto flex items-stretch h-full">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all duration-300 ${tab === t.key ? "" : "text-muted-foreground/60"}`}>
              {tab === t.key && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-all duration-300 shadow-sm" style={{ boxShadow: "0 0 8px rgba(255, 215, 0, 0.4)" }} />}
              <div className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-300 ${tab === t.key ? "bg-amber-400/[0.12]" : ""}`}>
                <span className={`transition-all duration-300 ${tab === t.key ? "text-amber-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" : ""}`}>{t.icon}</span>
              </div>
              <span className={`text-[9px] font-semibold transition-colors duration-200 ${tab === t.key ? "text-amber-400" : ""}`}>{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute top-1.5 left-1/2 translate-x-5 min-w-[16px] h-[16px] rounded-full bg-gradient-to-l from-amber-400 to-orange-500 text-[8px] font-bold text-black flex items-center justify-center px-1 shadow-lg shadow-amber-500/30">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Desktop Bottom Navigation ── */}
      <nav className="hidden md:block fixed bottom-0 left-0 right-0 z-40 glass-nav-premium glass-nav-border-animated border-t border-white/[0.04] safe-area-bottom h-14">
        <div className="max-w-lg mx-auto flex h-full">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all duration-200 ${tab === t.key ? "text-amber-400" : "text-muted-foreground/60 hover:text-muted-foreground"}`}>
              {tab === t.key && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-all duration-300" />}
              <span className="transition-all duration-200">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute top-1 right-1/2 translate-x-4 min-w-[16px] h-[16px] rounded-full bg-gradient-to-l from-amber-400 to-orange-500 text-[8px] font-bold text-black flex items-center justify-center px-1 shadow-lg shadow-amber-500/30">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══ Professional Confirmation Dialog ═══ */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent className="sm:max-w-md" dir="rtl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              {confirmAction?.icon && (
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  confirmAction.variant === "danger" ? "bg-red-500/15 border border-red-500/20" :
                  confirmAction.variant === "warning" ? "bg-amber-500/15 border border-amber-500/20" :
                  "bg-sky-500/15 border border-sky-500/20"
                }`}>
                  {confirmAction.icon}
                </div>
              )}
              <AlertDialogTitle className="text-base font-bold">{confirmAction?.title}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground pr-14">
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-3 mt-2">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl text-sm font-medium cursor-pointer">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction?.action) {
                  confirmAction.action();
                }
                setConfirmAction(null);
              }}
              className={`flex-1 h-11 rounded-xl text-sm font-bold cursor-pointer ${
                confirmAction?.variant === "danger"
                  ? "bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25"
                  : confirmAction?.variant === "warning"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25"
                  : "bg-sky-500/15 text-sky-400 border border-sky-500/25 hover:bg-sky-500/25"
              }`}
            >
              {confirmAction?.confirmLabel || "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══════ Proof Image Modal ══════ */}
      {proofModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setProofModalOpen(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={() => setProofModalOpen(false)} className="absolute -top-12 left-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-20">
              <XCircle className="w-5 h-5" />
            </button>
            {/* Image container */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/50">
              {proofModalLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                  <span className="text-xs text-muted-foreground">جارٍ تحميل الصورة...</span>
                </div>
              ) : proofModalImage ? (
                <img src={proofModalImage} alt="صورة إثبات التحويل" className="w-full max-h-[80vh] object-contain" />
              ) : null}
            </div>
          </div>
        </div>
      )}

    </div>
  );

  return (
    <>
      {mainContent}
      {deviceWarningDialog}
    </>
  );
}

/* Chevron icon for expandable sections */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
