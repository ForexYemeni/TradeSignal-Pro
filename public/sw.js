const CACHE_NAME = 'forexyemeni-v2';
const OFFLINE_URL = '/';

const PRECACHE_ASSETS = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

/* ═══════════════════════════════════════════════════════════════
   INSTALL & ACTIVATE
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/* ═══════════════════════════════════════════════════════════════
   FETCH (Cache First, Network Fallback)
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATION HANDLER
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  let data = {
    title: 'ForexYemeni',
    body: 'إشعار جديد',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'fy-default',
    sound: 'new_signal',
    requireInteraction: true,
    data: {},
    actions: [],
    vibrate: [200, 100, 200],
  };

  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch (e) {
      // Use default data
    }
  }

  // Define vibration patterns per sound type
  const vibrationPatterns = {
    new_signal: [200, 100, 200, 100, 200],
    tp_hit: [100, 50, 100, 50, 100, 50, 300],
    sl_hit: [300, 100, 300, 100, 300],
  };

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    vibrate: vibrationPatterns[data.sound] || vibrationPatterns.new_signal,
    data: {
      ...data.data,
      sound: data.sound,
      url: '/',
      timestamp: Date.now(),
    },
    actions: data.actions || [
      { action: 'open', title: 'فتح التطبيق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CLICK HANDLER
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('trade-signal-pro.vercel.app') || client.url.includes(self.location.origin)) {
            client.focus();
            // Navigate to the target URL
            if (data.url) {
              client.navigate(data.url);
            }
            return;
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND SYNC FOR AUDIO NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════ */
// Audio context for playing notification sounds in service worker
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (self.AudioContext || self.webkitAudioContext)();
  }
  return audioContext;
}

function playTone(freq, duration, startTime, ctx, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Play different sounds based on notification type
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PLAY_NOTIFICATION_SOUND') {
    try {
      const ctx = getAudioContext();
      const v = 0.3;
      const t = ctx.currentTime;
      const soundType = event.data.sound || 'new_signal';

      switch (soundType) {
        case 'buy':
          playTone(523.25, 0.15, t, ctx, v);
          playTone(659.25, 0.15, t + 0.12, ctx, v);
          break;
        case 'sell':
          playTone(659.25, 0.15, t, ctx, v);
          playTone(523.25, 0.15, t + 0.12, ctx, v);
          break;
        case 'tp_hit':
          playTone(523.25, 0.12, t, ctx, v);
          playTone(659.25, 0.12, t + 0.1, ctx, v);
          playTone(783.99, 0.2, t + 0.2, ctx, v);
          break;
        case 'sl_hit':
          playTone(261.63, 0.2, t, ctx, v);
          playTone(220, 0.3, t + 0.18, ctx, v);
          break;
        default:
          playTone(523.25, 0.4, t, ctx, v);
      }
    } catch (e) {
      // Audio not supported in this context
    }
  }
});
