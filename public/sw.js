const CACHE_NAME = 'forexyemeni-v3';
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
   FETCH (Network First, Cache Fallback)
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip API calls — always fetch fresh
  if (event.request.url.includes('/api/')) return;

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
   - Shows native browser notification with vibration
   - System notification sound plays automatically on most devices
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
  };

  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch (e) {
      // Use default data
    }
  }

  // Define vibration patterns per notification type
  const vibrationPatterns = {
    new_signal: [200, 100, 200, 100, 200],
    tp_hit: [100, 50, 100, 50, 100, 50, 300],
    sl_hit: [300, 100, 300, 100, 300],
    buy: [200, 100, 200, 100, 200],
    sell: [200, 100, 200, 100, 200],
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
    // Silent: false ensures system notification sound plays
    silent: false,
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
        // If app is already open, focus it and send a message to refresh
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            // Send message to main app to refresh signals immediately
            client.postMessage({ type: 'SIGNAL_UPDATE', timestamp: Date.now() });
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
   MESSAGE HANDLER — Communication from main app
   ═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // When main app gets a signal update, it tells us to notify if in background
  if (event.data.type === 'BACKGROUND_NOTIFY') {
    const { title, body, sound, tag } = event.data;
    if (!title) return;

    const vibrationPatterns = {
      new_signal: [200, 100, 200, 100, 200],
      tp_hit: [100, 50, 100, 50, 100, 50, 300],
      sl_hit: [300, 100, 300, 100, 300],
      buy: [200, 100, 200, 100, 200],
      sell: [200, 100, 200, 100, 200],
    };

    self.registration.showNotification(title, {
      body: body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: tag || `fy-${Date.now()}`,
      requireInteraction: true,
      vibrate: vibrationPatterns[sound] || vibrationPatterns.new_signal,
      silent: false,
      data: { sound, url: '/', timestamp: Date.now() },
      actions: [{ action: 'open', title: 'فتح التطبيق' }],
    });
  }
});
