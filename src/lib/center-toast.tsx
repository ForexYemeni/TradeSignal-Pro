"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";

/* ───────────────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────────────── */

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

interface CenterToastContextValue {
  success: (message: string, opts?: { description?: string; duration?: number }) => void;
  error: (message: string, opts?: { description?: string; duration?: number }) => void;
  warning: (message: string, opts?: { description?: string; duration?: number }) => void;
  info: (message: string, opts?: { description?: string; duration?: number }) => void;
}

/* ───────────────────────────────────────────────────────────────
   Context (safe for SSR — defaults are no-ops)
   ─────────────────────────────────────────────────────────────── */

const CenterToastCtx = createContext<CenterToastContextValue>({
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export const useCenterToast = () => useContext(CenterToastCtx);

/* ───────────────────────────────────────────────────────────────
   Icon + colour map
   ─────────────────────────────────────────────────────────────── */

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
  error: <AlertCircle className="w-6 h-6 text-red-400" />,
  warning: <AlertTriangle className="w-6 h-6 text-amber-400" />,
  info: <Info className="w-6 h-6 text-sky-400" />,
};

const RING_MAP: Record<ToastType, string> = {
  success: "ring-emerald-500/30 border-emerald-500/20",
  error: "ring-red-500/30 border-red-500/20",
  warning: "ring-amber-500/30 border-amber-500/20",
  info: "ring-sky-500/30 border-sky-500/20",
};

const GLOW_MAP: Record<ToastType, string> = {
  success: "shadow-emerald-500/10",
  error: "shadow-red-500/10",
  warning: "shadow-amber-500/10",
  info: "shadow-sky-500/10",
};

/* ───────────────────────────────────────────────────────────────
   Single Toast Card
   ─────────────────────────────────────────────────────────────── */

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const dur = item.duration ?? 4000;
    if (dur <= 0) return;
    const leaveTimer = setTimeout(() => setIsLeaving(true), dur);
    const removeTimer = setTimeout(onClose, dur + 350);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, [item.duration, onClose]);

  return (
    <div
      className={`
        relative w-[calc(100vw-3rem)] max-w-[380px] rounded-2xl
        border bg-[#0c1222]/95 backdrop-blur-2xl
        ring-2 shadow-2xl
        p-5 text-center space-y-2
        ${RING_MAP[item.type]} ${GLOW_MAP[item.type]}
        transition-all duration-300 ease-out
        ${isLeaving ? "opacity-0 scale-90 translate-y-4" : "opacity-100 scale-100 translate-y-0"}
      `}
      dir="rtl"
    >
      {/* Dismiss button */}
      <button
        onClick={() => { setIsLeaving(true); setTimeout(onClose, 300); }}
        className="absolute top-3 left-3 w-7 h-7 rounded-lg flex items-center justify-center
                   text-white/30 hover:text-white/70 hover:bg-white/[0.08] transition-all duration-200"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Icon */}
      <div className="flex justify-center">{ICON_MAP[item.type]}</div>

      {/* Message */}
      <p className="text-[13px] font-bold text-white/95 leading-relaxed">{item.message}</p>

      {/* Description */}
      {item.description && (
        <p className="text-[11px] text-white/50 leading-relaxed">{item.description}</p>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   Provider
   ─────────────────────────────────────────────────────────────── */

let _nextId = 0;

export function CenterToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback(
    (type: ToastType, message: string, opts?: { description?: string; duration?: number }) => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev.slice(-2), { id, type, message, ...opts }]); // max 3 stacked
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx: CenterToastContextValue = {
    success: (m, o) => addToast("success", m, o),
    error: (m, o) => addToast("error", m, o),
    warning: (m, o) => addToast("warning", m, o),
    info: (m, o) => addToast("info", m, o),
  };

  return (
    <CenterToastCtx.Provider value={ctx}>
      {children}

      {/* ── Overlay + centered toast stack ── */}
      {toasts.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
          aria-live="polite"
        >
          {/* Subtle backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

          {/* Toast stack (bottom-most first so newest is on top) */}
          <div className="relative flex flex-col-reverse items-center gap-3 pointer-events-auto">
            {toasts.map((t) => (
              <ToastCard key={t.id} item={t} onClose={() => removeToast(t.id)} />
            ))}
          </div>
        </div>
      )}
    </CenterToastCtx.Provider>
  );
}
