"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  ChevronLeft,
  XCircle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   1. STARS — Rating Stars
   ═══════════════════════════════════════════════════════════════════════ */
export function Stars({
  r,
  rating,
  size = "sm",
  max = 5,
  className = "",
}: {
  /** @deprecated Use `rating` instead. Kept for backward compatibility. */
  r?: number;
  rating?: number;
  size?: "sm" | "md" | "lg";
  max?: number;
  className?: string;
}) {
  const _rating = rating ?? r ?? 0;
  const sizeClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4.5 h-4.5",
    lg: "w-5.5 h-5.5",
  };

  return (
    <div className={`flex items-center gap-[3px] ${className}`} dir="ltr">
      {Array.from({ length: max }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 20 }}
        >
          <Star
            className={`${sizeClasses[size]} transition-all duration-300 ${
              i < _rating
                ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.5)]"
                : "fill-transparent text-muted-foreground/30"
            }`}
          />
        </motion.div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   2. DIV — Horizontal Divider
   ═══════════════════════════════════════════════════════════════════════ */
export function Div({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  if (label) {
    return (
      <div className={`flex items-center gap-3 my-4 ${className}`}>
        <div className="flex-1 h-px bg-gradient-to-l from-white/[0.08] via-white/[0.08] to-transparent" />
        <span className="text-[11px] text-muted-foreground/50 font-medium whitespace-nowrap px-1">
          {label}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.08] to-transparent" />
      </div>
    );
  }

  return (
    <div className={`my-3 ${className}`}>
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   3. GLASS — Reusable Glass Card Wrapper
   ═══════════════════════════════════════════════════════════════════════ */
export function Glass({
  children,
  className = "",
  hover = false,
  padding = "p-4",
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "p-4" | "lg" | "p-6";
}) {
  const paddingClasses: Record<string, string> = {
    none: "",
    sm: "p-3",
    "p-4": "p-4",
    lg: "p-5",
    "p-6": "p-6",
  };

  return (
    <motion.div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl ${
        paddingClasses[padding] ?? "p-4"
      } ${hover ? "hover:bg-white/[0.05] hover:border-white/[0.1] cursor-pointer" : ""} card-transition-premium ${className}`}
      whileHover={
        hover
          ? { y: -3, boxShadow: "0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)" }
          : undefined
      }
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   4. SKELETON CARD — Generic Loading Skeleton with Shimmer
   ═══════════════════════════════════════════════════════════════════════ */
function ShimmerBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-white/[0.04] ${className}`}
    >
      <div
        className="absolute inset-0 animate-[shimmer_2s_ease-in-out_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <ShimmerBlock className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <ShimmerBlock className="h-3.5 w-28 rounded-md" />
          <ShimmerBlock className="h-2.5 w-16 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <ShimmerBlock className="h-16 rounded-xl" />
        <ShimmerBlock className="h-16 rounded-xl" />
      </div>
      <ShimmerBlock className="h-3 w-20 rounded-md" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   5. SIGNALS LOADING SKELETON — Signal-specific skeleton
   ═══════════════════════════════════════════════════════════════════════ */
export function SignalsLoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3"
        >
          {/* Top accent bar */}
          <ShimmerBlock className="h-[3px] rounded-full w-3/4" />

          {/* Header row: pair + badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShimmerBlock className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div className="space-y-2">
                <ShimmerBlock className="h-4 w-24 rounded-md" />
                <ShimmerBlock className="h-2.5 w-14 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShimmerBlock className="h-6 w-16 rounded-lg" />
              <ShimmerBlock className="h-6 w-12 rounded-full" />
            </div>
          </div>

          {/* Price boxes */}
          <div className="grid grid-cols-2 gap-2.5">
            <ShimmerBlock className="h-[72px] rounded-xl" />
            <ShimmerBlock className="h-[72px] rounded-xl" />
          </div>

          {/* TP targets */}
          <div className="space-y-2">
            <ShimmerBlock className="h-3 w-20 rounded-md" />
            <div className="space-y-1.5">
              <ShimmerBlock className="h-10 rounded-xl" />
              <ShimmerBlock className="h-10 rounded-xl" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   6. STATS LOADING SKELETON — 2×3 grid skeleton
   ═══════════════════════════════════════════════════════════════════════ */
export function StatsLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {/* 2×3 grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-2.5"
          >
            <ShimmerBlock className="h-2.5 w-20 rounded-md" />
            <ShimmerBlock className="h-7 w-16 rounded-md" />
            <ShimmerBlock className="h-2 w-12 rounded-md" />
          </motion.div>
        ))}
      </div>

      {/* Bottom progress bar */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
        <ShimmerBlock className="h-3 w-28 rounded-md" />
        <ShimmerBlock className="h-2.5 rounded-full w-full" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   7. EMPTY STATE — Professional empty state display
   ═══════════════════════════════════════════════════════════════════════ */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Gradient circle behind icon */}
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400/10 via-yellow-500/5 to-transparent blur-xl scale-125" />
        <div className="relative w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-muted-foreground/50 shadow-layered">
          {icon}
        </div>
      </div>

      <motion.p
        className="text-sm font-bold text-muted-foreground/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        {title}
      </motion.p>

      {subtitle && (
        <motion.p
          className="text-[11px] text-muted-foreground/45 mt-1.5 text-center max-w-[260px] leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          {subtitle}
        </motion.p>
      )}

      {actionLabel && onAction && (
        <motion.button
          onClick={onAction}
          className="mt-5 px-5 py-2.5 rounded-xl btn-premium-gold text-xs active:scale-95"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   8. CONFETTI — Celebration Overlay
   ═══════════════════════════════════════════════════════════════════════ */
export function Confetti({ show }: { show: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 70 }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        color: ["#FFD700", "#10b981", "#ffffff", "#06b6d4", "#fbbf24", "#34d399"][Math.floor(Math.random() * 6)],
        delay: `${Math.random() * 0.9}s`,
        duration: `${1.8 + Math.random() * 1.8}s`,
        width: `${4 + Math.random() * 7}px`,
        height: `${7 + Math.random() * 12}px`,
        rotation: `${Math.random() * 360}deg`,
        opacity: 0.7 + Math.random() * 0.3,
      })),
    []
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-[100] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-[2px]"
              style={{
                left: p.left,
                top: "-20px",
                width: p.width,
                height: p.height,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: `rotate(${p.rotation})`,
                animation: `confettiFall ${p.duration} cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay} forwards`,
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   9. ONLINE STATUS HOOK
   ═══════════════════════════════════════════════════════════════════════ */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true)
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

/* ═══════════════════════════════════════════════════════════════════════
   10. PULL TO REFRESH HOOK
   ═══════════════════════════════════════════════════════════════════════ */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const THRESHOLD = 80;

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isRefreshing) return;
      const target = e.currentTarget as HTMLElement;
      if (target.scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    },
    [isRefreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pullingRef.current || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.5, 120));
      }
    },
    [isRefreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current || isRefreshing) return;
    pullingRef.current = false;
    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } catch {
        /* ignore */
      }
      setIsRefreshing(false);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  return { pullDistance, isRefreshing, onTouchStart, onTouchMove, onTouchEnd };
}

/* ═══════════════════════════════════════════════════════════════════════
   11. STATUS BADGE — Color-coded pill badge
   ═══════════════════════════════════════════════════════════════════════ */
type StatusType = "active" | "pending" | "blocked" | "expired" | "buy" | "sell";

const statusConfig: Record<
  StatusType,
  { label: string; dotColor: string; bg: string; textColor: string }
> = {
  active: {
    label: "نشط",
    dotColor: "bg-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    textColor: "text-emerald-400",
  },
  pending: {
    label: "قيد الانتظار",
    dotColor: "bg-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    textColor: "text-amber-400",
  },
  blocked: {
    label: "محظور",
    dotColor: "bg-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    textColor: "text-red-400",
  },
  expired: {
    label: "منتهي",
    dotColor: "bg-muted-foreground/50",
    bg: "bg-white/[0.04] border-white/[0.08]",
    textColor: "text-muted-foreground/60",
  },
  buy: {
    label: "شراء",
    dotColor: "bg-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    textColor: "text-emerald-400",
  },
  sell: {
    label: "بيع",
    dotColor: "bg-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    textColor: "text-red-400",
  },
};

export function StatusBadge({
  type,
  className = "",
}: {
  type: StatusType;
  className?: string;
}) {
  const config = statusConfig[type];

  return (
    <motion.span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${config.bg} ${config.textColor} ${className}`}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${
          type === "active" || type === "pending"
            ? "animate-pulse"
            : ""
        }`}
      />
      {config.label}
    </motion.span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   12. SECTION HEADER — Section header with title, subtitle, action
   ═══════════════════════════════════════════════════════════════════════ */
export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 mb-4 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-muted-foreground/60">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-foreground leading-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400/80 hover:text-amber-400 transition-colors duration-200 active:scale-95 shrink-0"
        >
          {action.label}
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   13. PRICE BOX — Compact price display box
   ═══════════════════════════════════════════════════════════════════════ */
type PriceBoxVariant = "entry" | "sl" | "tp";

const priceBoxConfig: Record<
  PriceBoxVariant,
  { label: string; accentColor: string; borderColor: string; iconBg: string }
> = {
  entry: {
    label: "الدخول",
    accentColor: "text-emerald-400",
    borderColor: "border-emerald-400/15",
    iconBg: "bg-emerald-400/10 text-emerald-400",
  },
  sl: {
    label: "وقف الخسارة",
    accentColor: "text-red-400",
    borderColor: "border-red-400/15",
    iconBg: "bg-red-400/10 text-red-400",
  },
  tp: {
    label: "الهدف",
    accentColor: "text-cyan-400",
    borderColor: "border-cyan-400/15",
    iconBg: "bg-cyan-400/10 text-cyan-400",
  },
};

export function PriceBox({
  variant,
  price,
  label,
  className = "",
}: {
  variant: PriceBoxVariant;
  price: string;
  label?: string;
  className?: string;
}) {
  const config = priceBoxConfig[variant];

  return (
    <motion.div
      className={`rounded-xl border ${config.borderColor} bg-white/[0.02] px-3 py-2.5 ${className}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
          {label ?? config.label}
        </span>
        <div
          className={`w-5 h-5 rounded-md ${config.iconBg} flex items-center justify-center`}
        >
          {variant === "entry" ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : variant === "sl" ? (
            <XCircle className="w-3 h-3" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
        </div>
      </div>
      <p className={`text-sm font-bold font-mono tabular-nums ${config.accentColor}`}>
        {price}
      </p>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   14. PROGRESS RING — SVG Circular progress indicator
   ═══════════════════════════════════════════════════════════════════════ */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 4,
  color = "gold",
  className = "",
}: {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: "green" | "red" | "gold";
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const colorMap = {
    green: { stroke: "#10b981", track: "rgba(16,185,129,0.12)" },
    red: { stroke: "#ef4444", track: "rgba(239,68,68,0.12)" },
    gold: { stroke: "#fbbf24", track: "rgba(251,191,36,0.12)" },
  };

  const { stroke, track } = colorMap[color];

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <defs>
          <linearGradient id={`progressGrad-${color}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#progressGrad-${color}-${size})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          style={{
            filter: `drop-shadow(0 0 6px ${stroke}60)`,
          }}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold text-foreground tabular-nums">
        {value}%
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   15. MINI CHART — SVG Sparkline Chart
   ═══════════════════════════════════════════════════════════════════════ */
export function MiniChart({
  data,
  width = 100,
  height = 32,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M${points.join(" L")}`;

  // Create area fill
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  const isUp = data[data.length - 1] >= data[0];
  const lineColor = isUp ? "#10b981" : "#ef4444";
  const fillGradientId = `miniChartGrad-${Math.random().toString(36).slice(2)}`;

  return (
    <div className={`inline-block ${className}`} dir="ltr">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient
            id={fillGradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={lineColor}
              stopOpacity="0.25"
            />
            <stop
              offset="100%"
              stopColor={lineColor}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <motion.path
          d={areaD}
          fill={`url(#${fillGradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
        {/* Line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 2px ${lineColor}40)` }}
        />
        {/* End dot */}
        <motion.circle
          cx={width}
          cy={parseFloat(points[points.length - 1].split(",")[1])}
          r={2.5}
          fill={lineColor}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
          style={{ filter: `drop-shadow(0 0 4px ${lineColor}90)` }}
        />
      </svg>
    </div>
  );
}
