"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Star, Activity, BarChart3, Package, Users, Inbox } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   STAR RATING
   ═══════════════════════════════════════════════════════════════ */
export function Stars({ r }: { r: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < r ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

export function Div() { return <div className="border-t border-border my-2.5" />; }

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-muted/50 backdrop-blur-sm ${className}`}>{children}</div>;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-24 rounded bg-muted" />
          <div className="h-2.5 w-16 rounded bg-muted/60" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 rounded-xl bg-muted/60" />
        <div className="h-14 rounded-xl bg-muted/60" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIGNAL LOADING SKELETON (mimics signal card structure)
   ═══════════════════════════════════════════════════════════════ */
export function SignalsLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-muted/50 p-4 space-y-3 animate-pulse">
          {/* Top accent bar */}
          <div className="h-[3px] rounded-full bg-muted/60 w-3/4" />
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-muted/60" />
                <div className="h-2.5 w-12 rounded bg-muted/40" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-14 rounded-lg bg-muted/40" />
              <div className="h-6 w-12 rounded-full bg-muted/40" />
            </div>
          </div>
          {/* Price boxes */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-[68px] rounded-xl bg-muted/60" />
            <div className="h-[68px] rounded-xl bg-muted/60" />
          </div>
          {/* TP targets */}
          <div className="space-y-1.5">
            <div className="h-3 w-16 rounded bg-muted/40" />
            <div className="h-10 rounded-xl bg-muted/40" />
            <div className="h-10 rounded-xl bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATS LOADING SKELETON
   ═══════════════════════════════════════════════════════════════ */
export function StatsLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-muted/50 p-3.5 space-y-2 animate-pulse">
            <div className="h-2.5 w-16 rounded bg-muted/60" />
            <div className="h-6 w-12 rounded bg-muted/40" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-muted/50 p-4 space-y-3 animate-pulse">
        <div className="h-3 w-24 rounded bg-muted/60" />
        <div className="h-3 rounded-full bg-muted/40" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function EmptyState({ icon, title, subtitle }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground/70 mt-1.5 text-center max-w-[240px]">{subtitle}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CONFETTI COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function Confetti({ show }: { show: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: ["#FFD700", "#10b981", "#ffffff", "#FF8F00", "#06b6d4", "#a855f7", "#f43f5e"][Math.floor(Math.random() * 7)],
      delay: `${Math.random() * 0.8}s`,
      duration: `${1.5 + Math.random() * 1.5}s`,
      width: `${5 + Math.random() * 8}px`,
      height: `${8 + Math.random() * 14}px`,
      rotation: `${Math.random() * 360}deg`,
    })), []);

  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]" style={{ overflow: "hidden" }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: p.left,
            top: "-20px",
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation})`,
            animation: `confettiFall ${p.duration} ease-out ${p.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ONLINE STATUS HOOK
   ═══════════════════════════════════════════════════════════════ */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
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

/* ═══════════════════════════════════════════════════════════════
   PULL TO REFRESH HOOK
   ═══════════════════════════════════════════════════════════════ */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const THRESHOLD = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    const target = e.currentTarget as HTMLElement;
    if (target.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  }, [isRefreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullingRef.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    }
  }, [isRefreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current || isRefreshing) return;
    pullingRef.current = false;
    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(0);
      try { await onRefresh(); } catch { /* ignore */ }
      setIsRefreshing(false);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  return { pullDistance, isRefreshing, onTouchStart, onTouchMove, onTouchEnd };
}
