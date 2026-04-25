import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { SignalCategory, Signal } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${dy} ي`;
}

export function isEntry(cat: SignalCategory | undefined | null) {
  return cat === "ENTRY" || cat === "REENTRY" || cat === "PYRAMID";
}

export function entryAccent(s: Signal) {
  if (s.signalCategory === "REENTRY") return { accent: "from-cyan-400 to-cyan-600", border: "border-cyan-500/25", text: "text-cyan-400", bg: "bg-cyan-500/15" };
  if (s.signalCategory === "PYRAMID") return { accent: "from-purple-400 to-purple-600", border: "border-purple-500/25", text: "text-purple-400", bg: "bg-purple-500/15" };
  if (s.type === "BUY") return { accent: "from-emerald-400 to-emerald-600", border: "border-emerald-500/25", text: "text-emerald-400", bg: "bg-emerald-500/15" };
  return { accent: "from-red-400 to-red-600", border: "border-red-500/25", text: "text-red-400", bg: "bg-red-500/15" };
}

export function isTpLike(c: SignalCategory | undefined | null) {
  return c === "TP_HIT" || c === "REENTRY_TP" || c === "PYRAMID_TP";
}
export function isSlLike(c: SignalCategory | undefined | null) {
  return c === "SL_HIT" || c === "REENTRY_SL" || c === "PYRAMID_SL";
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO NOTIFICATIONS (Web Audio API)
   - Uses a single persistent AudioContext (pre-warmed)
   - Resumes automatically on user interaction
   - No more creating new context per sound (browser limits)
   ═══════════════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null;
let _audioWarm = false;

function getAudioContext(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return _audioCtx;
}

/** Pre-warm AudioContext on first user interaction so no delay on first sound */
export function warmAudio() {
  if (_audioWarm) return;
  _audioWarm = true;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Add global listeners to resume AudioContext on any interaction
    const resume = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };
    document.addEventListener("click", resume, { once: false, passive: true });
    document.addEventListener("touchstart", resume, { once: false, passive: true });
    document.addEventListener("keydown", resume, { once: false, passive: true });
  } catch { /* not supported */ }
}

export function playTone(freq: number, duration: number, startTime: number, ctx: AudioContext, vol: number) {
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

export function playSound(type: "buy" | "sell" | "tp" | "sl" | "message" | "admin", volume: number) {
  try {
    const ctx = getAudioContext();
    // Resume context if suspended (autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume().then(() => _play(ctx, type, volume)).catch(() => {});
      return;
    }
    _play(ctx, type, volume);
  } catch {
    // Web Audio not supported
  }
}

function _play(ctx: AudioContext, type: string, volume: number) {
  const v = volume * 0.3;
  const t = ctx.currentTime;
  switch (type) {
    case "buy":
      playTone(523.25, 0.15, t, ctx, v);
      playTone(659.25, 0.15, t + 0.12, ctx, v);
      playTone(783.99, 0.2, t + 0.24, ctx, v);
      break;
    case "sell":
      playTone(783.99, 0.15, t, ctx, v);
      playTone(659.25, 0.15, t + 0.12, ctx, v);
      playTone(523.25, 0.2, t + 0.24, ctx, v);
      break;
    case "tp":
      playTone(523.25, 0.12, t, ctx, v);
      playTone(659.25, 0.12, t + 0.1, ctx, v);
      playTone(783.99, 0.2, t + 0.2, ctx, v);
      playTone(1046.5, 0.25, t + 0.35, ctx, v); // High triumphant note
      break;
    case "sl":
      playTone(392, 0.2, t, ctx, v);
      playTone(311.13, 0.25, t + 0.18, ctx, v);
      playTone(220, 0.4, t + 0.38, ctx, v);
      break;
    case "message":
      playTone(523.25, 0.4, t, ctx, v);
      break;
    case "admin":
      // Two-tone ascending chime — distinctive admin alert
      playTone(659.25, 0.18, t, ctx, v * 1.2);
      playTone(880, 0.18, t + 0.15, ctx, v * 1.2);
      playTone(1046.5, 0.25, t + 0.30, ctx, v * 1.2);
      break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   NATIVE ANDROID NOTIFICATION BRIDGE
   ═══════════════════════════════════════════════════════════════ */
export function nativeNotify(title: string, body: string, soundType: string) {
  try {
    const w = window as unknown as { AndroidNotify?: { sendNotification: (t: string, b: string, s: string) => void; setSessionToken: (t: string) => void } };
    if (w.AndroidNotify) {
      w.AndroidNotify.sendNotification(title, body, soundType);
    }
  } catch { /* not native */ }
}

/** Share session token with native Android SignalService */
export function shareSessionToken(token: string) {
  try {
    const w = window as unknown as { AndroidNotify?: { setSessionToken: (t: string) => void } };
    if (w.AndroidNotify) {
      w.AndroidNotify.setSessionToken(token);
    }
  } catch { /* not native */ }
}

/* ═══════════════════════════════════════════════════════════════
   BROWSER NOTIFICATION API
   - Works in both foreground AND background (via service worker push)
   - Triggers system notification sound automatically on most devices
   ═══════════════════════════════════════════════════════════════ */
let _notifPermissionGranted = false;

/** Request notification permission and cache result */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    _notifPermissionGranted = true;
    return true;
  }
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  _notifPermissionGranted = result === "granted";
  return _notifPermissionGranted;
}

/** Show a browser notification (works in foreground + triggers system sound) */
export function showBrowserNotification(title: string, body: string, tag?: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    // Don't show duplicate if app is in foreground and already handled
    if (document.hasFocus()) return; // Only show when app is in background
    new Notification(title, {
      body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: tag || `fy-${Date.now()}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
    } as NotificationOptions);
  } catch { /* not supported */ }
}

/** Play sound + show notification combo (instant, no delay) */
export function notifySignal(type: "buy" | "sell" | "tp" | "sl" | "message" | "admin", title: string, body: string, soundType: string) {
  // 1. Play sound immediately (Web Audio API - foreground)
  playSound(type, typeof window !== "undefined" ? (JSON.parse(localStorage.getItem("fy_audioVol") || "0.7") as number) : 0.7);
  // 2. Native Android bridge
  nativeNotify(title, body, soundType);
  // 3. Browser Notification (background / system notification)
  showBrowserNotification(title, body, `fy-${soundType}-${Date.now()}`);
  // 4. Tell service worker to show notification if page is hidden
  if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "BACKGROUND_NOTIFY",
      title,
      body,
      sound: soundType,
      tag: `fy-${soundType}-${Date.now()}`,
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATION SYSTEM
   ═══════════════════════════════════════════════════════════════ */

// Convert base64 to Uint8Array for VAPID key
export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushNotification(userId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[Push] Push not supported");
      return false;
    }

    // Request notification permission (this also enables browser notifications)
    const granted = await ensureNotificationPermission();
    if (!granted) {
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

export async function unregisterPushNotification(endpoint?: string): Promise<void> {
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

export function formatCountdown(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const totalMinutes = Math.floor(diff / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
}
