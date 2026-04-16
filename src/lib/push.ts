/**
 * Push Notification Utility
 * 
 * Sends Web Push notifications to all subscribed users.
 * Uses VAPID keys for authentication.
 */

import webpush from 'web-push';
import { getPushSubscriptions, PushSubscription, getUsers } from './store';

// Lazy VAPID initialization - only configure when actually sending
let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) return false;
  try {
    const subject = process.env.VAPID_SUBJECT || 'mailto:forexyemeni@push.local';
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (e) {
    console.error('[Push] Failed to configure VAPID:', e);
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  sound?: 'new_signal' | 'tp_hit' | 'sl_hit';
  requireInteraction?: boolean;
  urgency?: 'normal' | 'high' | 'critical';
}

/**
 * Send push notification to ALL subscribed users
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ success: number; failed: number }> {
  if (!configureVapid()) {
    return { success: 0, failed: 0 };
  }

  try {
    const subs = await getPushSubscriptions();
    if (subs.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    const promises = subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/icon-192x192.png',
            badge: payload.badge || '/icon-192x192.png',
            tag: payload.tag || `fy-${Date.now()}`,
            data: payload.data || {},
            sound: payload.sound || 'new_signal',
            requireInteraction: payload.requireInteraction !== false,
            actions: [
              { action: 'open', title: 'فتح التطبيق' },
            ],
          }),
          {
            TTL: 86400, // 24 hours
            urgency: payload.urgency || 'high',
          }
        );
        success++;
      } catch (err: unknown) {
        failed++;
        // If subscription is invalid/expired, we should clean it up
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          // Subscription expired or gone - it will be cleaned on next subscribe
          console.warn(`[Push] Dead subscription removed: ${sub.endpoint.substring(0, 50)}...`);
        }
      }
    });

    await Promise.allSettled(promises);
    console.log(`[Push] Sent to ${success}/${subs.length} subscribers`);
    return { success, failed };
  } catch (error) {
    console.error('[Push] Error sending notifications:', error);
    return { success: 0, failed: 0 };
  }
}

/**
 * Send push notification to a specific user
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!configureVapid()) return false;

  try {
    const subs = await getPushSubscriptions();
    const userSub = subs.find(s => s.userId === userId);
    if (!userSub) return false;

    await webpush.sendNotification(
      {
        endpoint: userSub.endpoint,
        keys: userSub.keys,
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192x192.png',
        badge: payload.badge || '/icon-192x192.png',
        tag: payload.tag || `fy-${Date.now()}`,
        data: payload.data || {},
        sound: payload.sound || 'new_signal',
        requireInteraction: payload.requireInteraction !== false,
      }),
      {
        TTL: 86400,
        urgency: payload.urgency || 'high',
      }
    );
    return true;
  } catch (err) {
    console.error(`[Push] Error sending to user ${userId}:`, err);
    return false;
  }
}

/**
 * Send push notification to ADMIN users only
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<{ success: number; failed: number }> {
  if (!configureVapid()) {
    return { success: 0, failed: 0 };
  }

  try {
    const [subs, users] = await Promise.all([getPushSubscriptions(), getUsers()]);

    // Get admin user IDs
    const adminIds = new Set(
      users.filter(u => u.role === "admin").map(u => u.id)
    );

    // Filter subscriptions to admins only
    const adminSubs = subs.filter(s => adminIds.has(s.userId));
    if (adminSubs.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    const promises = adminSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/icon-192x192.png',
            badge: payload.badge || '/icon-192x192.png',
            tag: payload.tag || `fy-admin-${Date.now()}`,
            data: payload.data || {},
            sound: payload.sound || 'new_signal',
            requireInteraction: payload.requireInteraction !== false,
            actions: [{ action: 'open', title: 'فتح التطبيق' }],
          }),
          { TTL: 86400, urgency: payload.urgency || 'high' }
        );
        success++;
      } catch (err) {
        failed++;
      }
    });

    await Promise.allSettled(promises);
    console.log(`[Push] Sent admin notification to ${success}/${adminSubs.length} admins`);
    return { success, failed };
  } catch (error) {
    console.error('[Push] Error sending admin notifications:', error);
    return { success: 0, failed: 0 };
  }
}

/**
 * Helper: New signal notification
 */
export async function notifyNewSignal(pair: string, type: string, entry: number, timeframe: string) {
  const typeAr = type === 'BUY' ? 'شراء' : 'بيع';
  const title = `📊 إشارة جديدة — ${pair}`;
  const body = `${typeAr} @ ${entry} | ${timeframe || ''}`.trim();
  return sendPushToAll({
    title,
    body,
    tag: `signal-${pair}-${Date.now()}`,
    sound: 'new_signal',
    requireInteraction: true,
    urgency: 'high',
    data: { type: 'new_signal', pair, signalType: type },
  });
}

/**
 * Helper: Take profit hit notification
 */
export async function notifyTpHit(pair: string, tpIndex: number, pnl?: number) {
  const title = `🎯 هدف محقق — ${pair}`;
  const body = pnl ? `TP${tpIndex + 1} تم تحقيقه! ربح: +$${pnl.toFixed(2)}` : `TP${tpIndex + 1} تم تحقيقه بنجاح!`;
  return sendPushToAll({
    title,
    body,
    tag: `tp-${pair}-${Date.now()}`,
    sound: 'tp_hit',
    requireInteraction: true,
    urgency: 'high',
    data: { type: 'tp_hit', pair, tpIndex, pnl },
  });
}

/**
 * Helper: Stop loss hit notification
 */
export async function notifySlHit(pair: string, pnl?: number) {
  const title = `🛑 وقف خسارة — ${pair}`;
  const body = pnl ? `تم ضرب وقف الخسارة! خسارة: -$${Math.abs(pnl).toFixed(2)}` : `تم ضرب وقف الخسارة!`;
  return sendPushToAll({
    title,
    body,
    tag: `sl-${pair}-${Date.now()}`,
    sound: 'sl_hit',
    requireInteraction: true,
    urgency: 'critical',
    data: { type: 'sl_hit', pair, pnl },
  });
}

// Export the public VAPID key for client-side use
export { VAPID_PUBLIC_KEY };
