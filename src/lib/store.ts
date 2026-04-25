/**
 * Vercel KV Data Store
 * 
 * Simple, reliable data layer using Vercel KV (Redis).
 * No Prisma, no PostgreSQL, no raw SQL needed.
 * 
 * To set up:
 * 1. Vercel Dashboard → Storage → Create Database → KV → Create
 * 2. That's it! Vercel auto-connects KV_REST_API_URL and KV_REST_API_TOKEN
 */

import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';

// ─── Types ───────────────────────────────────────────────
export interface StoredSignal {
  id: string;
  pair: string;
  type: string;
  entry: number;
  stopLoss: number;
  takeProfits: string; // JSON string of {tp, rr}[]
  confidence: number;
  status: string;
  signalCategory: string;
  rawText: string;
  timeframe: string;
  htfTimeframe: string;
  htfTrend: string;
  smcTrend: string;
  hitTpIndex: number;
  hitPrice?: number;
  pnlPoints?: number;
  pnlDollars?: number;
  partialWin?: boolean;
  tpStatusList?: string;
  totalTPs?: number;
  balance?: number;
  lotSize?: string;
  riskTarget?: number;
  riskPercent?: number;
  actualRisk?: number;
  actualRiskPct?: number;
  slDistance?: number;
  maxRR?: number;
  instrument?: string;
  createdAt: string;
}

export interface StoredAdmin {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  mustChangePwd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  status: "pending" | "active" | "blocked" | "expired";
  mustChangePwd: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  /* Subscription fields */
  subscriptionType: "none" | "subscriber" | "agency";
  subscriptionExpiry: string | null;
  packageId: string | null;
  packageName: string | null;
  hadFreeTrial: boolean;
  /* Device tracking */
  deviceId: string | null;
  /* Referral fields */
  referralCode: string | null;
  referredBy: string | null;       // referral code of the person who invited them
  referralRewardClaimed: boolean;  // whether referrer already got reward for this user
}

// ─── Signals ────────────────────────────────────────────
export async function getSignals(limit = 100): Promise<StoredSignal[]> {
  const data = await kv.get<StoredSignal[]>('signals');
  return (data || []).slice(0, limit);
}

export async function addSignal(signal: StoredSignal): Promise<StoredSignal> {
  return withLock('signals', async () => {
    const signals = await getSignals(9999);
    signals.unshift(signal);
    await kv.set('signals', signals.slice(0, 1000));
    return signal;
  });
}

export async function getSignalById(id: string): Promise<StoredSignal | null> {
  const signals = await getSignals(9999);
  return signals.find(s => s.id === id) || null;
}

export async function updateSignal(id: string, updates: Partial<StoredSignal>): Promise<StoredSignal | null> {
  return withLock('signals', async () => {
    const signals = await getSignals(9999);
    const idx = signals.findIndex(s => s.id === id);
    if (idx === -1) return null;
    signals[idx] = { ...signals[idx], ...updates };
    await kv.set('signals', signals);
    return signals[idx];
  });
}

export async function deleteSignal(id: string): Promise<boolean> {
  return withLock('signals', async () => {
    const signals = await getSignals(9999);
    const filtered = signals.filter(s => s.id !== id);
    if (filtered.length === signals.length) return false;
    await kv.set('signals', filtered);
    return true;
  });
}

// ─── Distributed Lock (prevents race conditions) ───
async function withLock<T>(resource: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  const lockKey = `lock:${resource}`;
  for (let i = 0; i < retries; i++) {
    const acquired = await kv.set(lockKey, '1', { nx: true, ex: 5 });
    if (acquired) {
      try {
        return await fn();
      } finally {
        await kv.del(lockKey);
      }
    }
    // Wait before retry (100ms, 200ms, 300ms)
    await new Promise(r => setTimeout(r, 100 * (i + 1)));
  }
  // If lock can't be acquired, proceed anyway (last resort)
  return fn();
}

// ─── Admin ──────────────────────────────────────────────
export async function getAdmin(): Promise<StoredAdmin | null> {
  return await kv.get<StoredAdmin>('admin') || null;
}

export async function setAdmin(admin: StoredAdmin): Promise<void> {
  await kv.set('admin', admin);
}

// ─── Stats ──────────────────────────────────────────────
export async function getStats() {
  const signals = await getSignals(9999);
  const total = signals.length;
  const active = signals.filter(s => s.status === 'ACTIVE').length;
  const hitTp = signals.filter(s => s.status === 'HIT_TP').length;
  const hitSl = signals.filter(s => s.status === 'HIT_SL').length;
  const closed = hitTp + hitSl;
  const winRate = closed > 0 ? Math.round((hitTp / closed) * 100) : 0;
  const buyCount = signals.filter(s => s.type === 'BUY').length;
  const sellCount = signals.filter(s => s.type === 'SELL').length;
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recentWeek = signals.filter(s => new Date(s.createdAt).getTime() > sevenDaysAgo).length;
  const avgConfidence = total > 0
    ? +(signals.reduce((sum, s) => sum + s.confidence, 0) / total).toFixed(1)
    : 0;
  const pairCount: Record<string, number> = {};
  signals.forEach(s => { pairCount[s.pair] = (pairCount[s.pair] || 0) + 1; });
  const topPairs = Object.entries(pairCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pair, count]) => ({ pair, count }));
  return { total, active, hitTp, hitSl, winRate, buyCount, sellCount, recentWeek, avgConfidence, topPairs };
}

// ─── Push Subscriptions ─────────────────────────────────
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  userAgent: string;
  createdAt: string;
}

export async function getPushSubscriptions(): Promise<PushSubscription[]> {
  const data = await kv.get<PushSubscription[]>('push_subscriptions');
  return data || [];
}

export async function addPushSubscription(sub: PushSubscription): Promise<void> {
  return withLock('push_subscriptions', async () => {
    const subs = await getPushSubscriptions();
    // Remove old subscription for this user (one per user)
    const filtered = subs.filter(s => s.userId !== sub.userId);
    filtered.push(sub);
    await kv.set('push_subscriptions', filtered);
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  return withLock('push_subscriptions', async () => {
    const subs = await getPushSubscriptions();
    const filtered = subs.filter(s => s.endpoint !== endpoint);
    await kv.set('push_subscriptions', filtered);
  });
}

export async function removePushSubscriptionByUserId(userId: string): Promise<void> {
  return withLock('push_subscriptions', async () => {
    const subs = await getPushSubscriptions();
    const filtered = subs.filter(s => s.userId !== userId);
    await kv.set('push_subscriptions', filtered);
  });
}

// ─── Password Hashing ─────────────────────────────────
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 12);
}

/**
 * Compare password: supports both hashed (bcrypt) and legacy plaintext.
 * Returns { match, needsRehash } — if needsRehash, caller should re-hash and save.
 */
export async function comparePassword(plainText: string, stored: string): Promise<{ match: boolean; needsRehash: boolean }> {
  // If stored value looks like a bcrypt hash (starts with $2), use bcrypt
  if (stored.startsWith('$2')) {
    const match = await bcrypt.compare(plainText, stored);
    return { match, needsRehash: false };
  }
  // Legacy plaintext comparison
  const match = plainText === stored;
  return { match, needsRehash: match }; // re-hash on successful plaintext match
}

// ─── Health Check ───────────────────────────────────────
export async function isReady(): Promise<boolean> {
  try {
    await kv.set('_health', 'ok');
    return true;
  } catch {
    return false;
  }
}

// ─── Users ─────────────────────────────────────────────
export async function getUsers(): Promise<StoredUser[]> {
  const data = await kv.get<StoredUser[]>('users');
  return data || [];
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const users = await getUsers();
  return users.find(u => u.id === id) || null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function getUserByDeviceId(deviceId: string): Promise<StoredUser | null> {
  if (!deviceId) return null;
  const users = await getUsers();
  return users.find(u => u.deviceId === deviceId && u.role !== "admin") || null;
}

export async function addUser(user: StoredUser): Promise<StoredUser> {
  return withLock('users', async () => {
    const users = await getUsers();
    users.push(user);
    await kv.set('users', users);
    return user;
  });
}

export async function updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser | null> {
  return withLock('users', async () => {
    const users = await getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    await kv.set('users', users);
    return users[idx];
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  return withLock('users', async () => {
    const users = await getUsers();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) return false;
    await kv.set('users', filtered);
    return true;
  });
}

// ─── Migrate Admin to Users ─────────────────────────────
export async function migrateAdminToUsers(): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  const existing = await getUserByEmail(admin.email);
  if (!existing) {
    await addUser({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      passwordHash: admin.passwordHash,
      role: "admin",
      status: "active",
      mustChangePwd: admin.mustChangePwd,
      emailVerified: true,
      hadFreeTrial: false,
      subscriptionType: "none",
      subscriptionExpiry: null,
      packageId: null,
      packageName: null,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      deviceId: null,
      referralCode: null,
      referredBy: null,
      referralRewardClaimed: false,
    });
  } else if (!existing.emailVerified) {
    // Existing user missing emailVerified — mark admin accounts as verified
    await updateUser(existing.id, { emailVerified: true });
  }
}

// ─── Email Change Requests ──────────────────────────────
export interface EmailChangeRequest {
  id: string;
  userId: string;
  userName: string;
  oldEmail: string;
  newEmail: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export async function getEmailChangeRequests(): Promise<EmailChangeRequest[]> {
  const data = await kv.get<EmailChangeRequest[]>('email_change_requests');
  return data || [];
}

export async function addEmailChangeRequest(req: EmailChangeRequest): Promise<EmailChangeRequest> {
  const requests = await getEmailChangeRequests();
  // Check if there's already a pending request for this user
  const existing = requests.find(r => r.userId === req.userId && r.status === "pending");
  if (existing) {
    // Update existing request
    existing.newEmail = req.newEmail;
    existing.createdAt = req.createdAt;
    await kv.set('email_change_requests', requests);
    return existing;
  }
  requests.push(req);
  await kv.set('email_change_requests', requests);
  return req;
}

export async function updateEmailChangeRequest(id: string, updates: Partial<EmailChangeRequest>): Promise<EmailChangeRequest | null> {
  const requests = await getEmailChangeRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return null;
  requests[idx] = { ...requests[idx], ...updates };
  await kv.set('email_change_requests', requests);
  return requests[idx];
}

export async function deleteEmailChangeRequest(id: string): Promise<boolean> {
  const requests = await getEmailChangeRequests();
  const filtered = requests.filter(r => r.id !== id);
  if (filtered.length === requests.length) return false;
  await kv.set('email_change_requests', filtered);
  return true;
}

export async function getPendingEmailRequestsForUser(userId: string): Promise<EmailChangeRequest | null> {
  const requests = await getEmailChangeRequests();
  return requests.find(r => r.userId === userId && r.status === "pending") || null;
}

// ─── Subscription Packages ──────────────────────────────
export interface SubscriptionPackage {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  type: "free" | "trial" | "paid";
  description: string;
  isActive: boolean;
  createdAt: string;
  order: number;
  features: string[];
  maxSignals: number;
  prioritySupport: boolean;
  showEntryEarly: boolean;
  instruments?: string[];
}

export async function getPackages(): Promise<SubscriptionPackage[]> {
  const data = await kv.get<SubscriptionPackage[]>('subscription_packages');
  return (data || []).sort((a, b) => a.order - b.order);
}

export async function getActivePackages(): Promise<SubscriptionPackage[]> {
  const pkgs = await getPackages();
  return pkgs.filter(p => p.isActive);
}

export async function getPackageById(id: string): Promise<SubscriptionPackage | null> {
  const pkgs = await getPackages();
  return pkgs.find(p => p.id === id) || null;
}

export async function addPackage(pkg: SubscriptionPackage): Promise<SubscriptionPackage> {
  const pkgs = await getPackages();
  pkgs.push(pkg);
  await kv.set('subscription_packages', pkgs);
  return pkg;
}

export async function updatePackage(id: string, updates: Partial<SubscriptionPackage>): Promise<SubscriptionPackage | null> {
  const pkgs = await getPackages();
  const idx = pkgs.findIndex(p => p.id === id);
  if (idx === -1) return null;
  pkgs[idx] = { ...pkgs[idx], ...updates };
  await kv.set('subscription_packages', pkgs);
  return pkgs[idx];
}

export async function deletePackage(id: string): Promise<boolean> {
  const pkgs = await getPackages();
  const filtered = pkgs.filter(p => p.id !== id);
  if (filtered.length === pkgs.length) return false;
  await kv.set('subscription_packages', filtered);
  return true;
}

// ─── Login Attempt Tracking ──────────────────────────
interface LoginAttemptData {
  count: number;
  lockedUntil: string | null; // ISO timestamp
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const ATTEMPT_WINDOW_MINUTES = 15;

export async function trackLoginAttempt(email: string): Promise<{ attemptsLeft: number; locked: boolean; lockedUntil: string | null }> {
  const key = `login_attempts:${email.toLowerCase()}`;
  const data = await kv.get<LoginAttemptData>(key);

  const now = new Date();
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);

  if (data) {
    // Check if currently locked
    if (data.lockedUntil && new Date(data.lockedUntil) > now) {
      return {
        attemptsLeft: 0,
        locked: true,
        lockedUntil: data.lockedUntil,
      };
    }
    // Lock expired, reset
    if (data.lockedUntil && new Date(data.lockedUntil) <= now) {
      await kv.del(key);
      return { attemptsLeft: MAX_LOGIN_ATTEMPTS, locked: false, lockedUntil: null };
    }
  }

  const newCount = (data?.count || 0) + 1;
  let lockedUntil: string | null = null;

  if (newCount >= MAX_LOGIN_ATTEMPTS) {
    lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
  }

  await kv.set(key, { count: newCount, lockedUntil }, { ex: LOCKOUT_DURATION_MINUTES * 60 });

  return {
    attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - newCount),
    locked: newCount >= MAX_LOGIN_ATTEMPTS,
    lockedUntil,
  };
}

export async function getLoginAttempts(email: string): Promise<{ attemptsLeft: number; locked: boolean; lockedUntil: string | null }> {
  const key = `login_attempts:${email.toLowerCase()}`;
  const data = await kv.get<LoginAttemptData>(key);

  if (!data) return { attemptsLeft: MAX_LOGIN_ATTEMPTS, locked: false, lockedUntil: null };

  const now = new Date();
  if (data.lockedUntil && new Date(data.lockedUntil) > now) {
    return { attemptsLeft: 0, locked: true, lockedUntil: data.lockedUntil };
  }

  if (data.lockedUntil && new Date(data.lockedUntil) <= now) {
    await kv.del(key);
    return { attemptsLeft: MAX_LOGIN_ATTEMPTS, locked: false, lockedUntil: null };
  }

  return {
    attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - data.count),
    locked: false,
    lockedUntil: null,
  };
}

export async function resetLoginAttempts(email: string): Promise<void> {
  const key = `login_attempts:${email.toLowerCase()}`;
  await kv.del(key);
}

// ─── App Settings ──────────────────────────────────────
export interface UsdtNetwork {
  id: string;
  network: string;       // e.g. "TRC20", "BEP20", "ERC20"
  address: string;       // wallet address
  isActive: boolean;
  order: number;
}

export interface AppSettings {
  freeTrialPackageId: string | null;
  autoApproveOnRegister: boolean;
  /* Payment settings */
  usdtWalletAddress: string | null;
  usdtNetwork: string | null;         // e.g. "TRC20", "BEP20", "ERC20" (legacy single)
  usdtNetworks?: UsdtNetwork[];       // multiple network addresses
  localCurrencyName: string | null;   // e.g. "ريال يمني", "جنيه مصري"
  localCurrencyCode: string | null;   // e.g. "YER", "EGP"
  usdtToLocalRate: number | null;     // e.g. 550 (1 USDT = 550 YER)
  /* Referral settings */
  referralEnabled: boolean;
  referralRewardDays: number;         // extra days given to referrer
  referralInviteeRewardDays: number;  // extra days given to invitee
  /* Telegram integration */
  telegramBotToken: string | null;    // legacy single bot (kept for backward compat)
  telegramChatId: string | null;      // legacy single channel
  telegramConnections?: TelegramConnection[];  // multiple bot+channel pairs
}

export interface TelegramConnection {
  id: string;               // unique UUID
  label: string;            // e.g. "قناة VIP", "مجموعة مجانية"
  botToken: string;         // e.g. "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  chatId: string;           // e.g. "2463619819" or "@channel"
  isActive: boolean;        // enable/disable without deleting
  createdAt: string;
}

export async function getAppSettings(): Promise<AppSettings> {
  const data = await kv.get<AppSettings>('app_settings');
  return data || { freeTrialPackageId: null, autoApproveOnRegister: true, usdtWalletAddress: null, usdtNetwork: null, localCurrencyName: null, localCurrencyCode: null, usdtToLocalRate: null, referralEnabled: false, referralRewardDays: 7, referralInviteeRewardDays: 3, telegramBotToken: null, telegramChatId: null, telegramConnections: [] };
}

export async function updateAppSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const updated = { ...current, ...updates };
  await kv.set('app_settings', updated);
  return updated;
}

// ─── Check & Enforce Subscriptions ──────────────────────
export async function enforceSubscriptions(): Promise<string[]> {
  const users = await getUsers();
  const expiredIds: string[] = [];
  const now = new Date().toISOString();
  let changed = false;
  for (const u of users) {
    if (u.role === "admin") continue;
    if (u.subscriptionExpiry && u.subscriptionType !== "none" && u.subscriptionExpiry < now) {
      u.status = "expired";
      u.subscriptionType = "none";
      u.packageId = null;
      u.packageName = null;
      u.subscriptionExpiry = null;
      expiredIds.push(u.id);
      changed = true;
    }
  }
  if (changed) await kv.set('users', users);
  return expiredIds;
}

// ─── Local Payment Methods ──────────────────────────────
export interface LocalPaymentMethod {
  id: string;
  name: string;                   // اسم المحفظة - e.g., "محفظة YmntPay"
  walletAddress: string;          // رقم المحفظة - the actual wallet number/address
  walletName: string;             // اسم مزود المحفظة - e.g., "YmntPay", "Chime", "MTN"
  currencyName: string;           // اسم العملة المحلية - e.g., "ريال يمني"
  currencyCode: string;           // رمز العملة - e.g., "YER"
  exchangeRate: number;           // 1 USDT = X local currency
  isActive: boolean;
  order: number;
  createdAt: string;
}

export async function getLocalPaymentMethods(): Promise<LocalPaymentMethod[]> {
  const data = await kv.get<LocalPaymentMethod[]>('local_payment_methods');
  return (data || []).sort((a, b) => a.order - b.order);
}

export async function getActiveLocalPaymentMethods(): Promise<LocalPaymentMethod[]> {
  const methods = await getLocalPaymentMethods();
  return methods.filter(m => m.isActive);
}

export async function addLocalPaymentMethod(method: LocalPaymentMethod): Promise<LocalPaymentMethod> {
  const methods = await getLocalPaymentMethods();
  methods.push(method);
  await kv.set('local_payment_methods', methods);
  return method;
}

export async function updateLocalPaymentMethod(id: string, updates: Partial<LocalPaymentMethod>): Promise<LocalPaymentMethod | null> {
  const methods = await getLocalPaymentMethods();
  const idx = methods.findIndex(m => m.id === id);
  if (idx === -1) return null;
  methods[idx] = { ...methods[idx], ...updates };
  await kv.set('local_payment_methods', methods);
  return methods[idx];
}

export async function deleteLocalPaymentMethod(id: string): Promise<boolean> {
  const methods = await getLocalPaymentMethods();
  const filtered = methods.filter(m => m.id !== id);
  if (filtered.length === methods.length) return false;
  await kv.set('local_payment_methods', filtered);
  return true;
}

// ─── Payment Requests (Subscription Purchases) ─────────
export interface PaymentRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  packageId: string;
  packageName: string;
  packagePrice: number;           // Price in USDT
  paymentMethod: "usdt" | "local";
  paymentMethodId?: string;       // ID of LocalPaymentMethod or UsdtNetwork (for local/usdt payments)
  paymentMethodName?: string;     // Name of the payment method (display)
  status: "pending" | "approved" | "rejected" | "expired";
  // USDT fields
  txId?: string;                  // Transaction ID
  usdtNetwork?: string;           // Network used: "TRC20", "BEP20", etc.
  // Blockchain verification fields
  blockchainVerified?: boolean;   // Whether blockchain verification was performed
  blockchainValid?: boolean;      // Whether verification passed
  blockchainError?: string;       // Verification error message (if any)
  blockchainDetails?: string;     // JSON string of verification details
  // Local currency fields
  localAmount?: number;           // Amount in local currency
  localCurrencyCode?: string;     // e.g., "YER"
  paymentProofUrl?: string;       // Uploaded image URL
  // Metadata
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectReason?: string;
}

export async function getPaymentRequests(): Promise<PaymentRequest[]> {
  const data = await kv.get<PaymentRequest[]>('payment_requests');
  return data || [];
}

export async function getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]> {
  const all = await getPaymentRequests();
  return all.filter(r => r.userId === userId);
}

export async function getPendingPaymentRequests(): Promise<PaymentRequest[]> {
  const all = await getPaymentRequests();
  return all.filter(r => r.status === "pending");
}

export async function addPaymentRequest(req: PaymentRequest): Promise<PaymentRequest> {
  return withLock('payment_requests', async () => {
    const all = await getPaymentRequests();
    all.unshift(req);
    await kv.set('payment_requests', all.slice(0, 500));
    return req;
  });
}

export async function updatePaymentRequest(id: string, updates: Partial<PaymentRequest>): Promise<PaymentRequest | null> {
  return withLock('payment_requests', async () => {
    const all = await getPaymentRequests();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    await kv.set('payment_requests', all);
    return all[idx];
  });
}

// ─── Referral System ─────────────────────────────────

export async function getUserByReferralCode(code: string): Promise<StoredUser | null> {
  if (!code) return null;
  const users = await getUsers();
  return users.find(u => u.referralCode === code.trim() && u.role !== "admin") || null;
}

export async function getReferrals(userId: string): Promise<{ referrer: StoredUser; referred: StoredUser[] }> {
  const users = await getUsers();
  const referrer = users.find(u => u.id === userId);
  if (!referrer || !referrer.referralCode) return { referrer: referrer!, referred: [] };
  const referred = users.filter(u => u.referredBy === referrer.referralCode && u.id !== userId);
  return { referrer, referred };
}

export async function countSuccessfulReferrals(userId: string): Promise<number> {
  const { referred } = await getReferrals(userId);
  return referred.filter(u => u.subscriptionType === "subscriber" && new Date(u.subscriptionExpiry || "") > new Date()).length;
}

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I,O,0,1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Admin Notifications ──────────────────────────────
export interface AdminNotification {
  id: string;
  type: "new_user" | "new_payment" | "subscription_change" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export async function getAdminNotifications(limit = 50): Promise<AdminNotification[]> {
  const data = await kv.get<AdminNotification[]>('admin_notifications');
  return (data || []).slice(0, limit);
}

export async function addAdminNotification(notification: Omit<AdminNotification, 'id' | 'read' | 'createdAt'>): Promise<AdminNotification> {
  const newNotification: AdminNotification = {
    ...notification,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };
  // Keep max 200 notifications
  const notifications = await getAdminNotifications(200);
  notifications.unshift(newNotification);
  await kv.set('admin_notifications', notifications.slice(0, 200));
  return newNotification;
}

export async function markNotificationRead(id: string): Promise<void> {
  const notifications = await getAdminNotifications(200);
  const idx = notifications.findIndex(n => n.id === id);
  if (idx !== -1) {
    notifications[idx].read = true;
    await kv.set('admin_notifications', notifications);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const notifications = await getAdminNotifications(200);
  for (const n of notifications) n.read = true;
  await kv.set('admin_notifications', notifications);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const notifications = await getAdminNotifications(200);
  return notifications.filter(n => !n.read).length;
}

export async function clearNotifications(): Promise<void> {
  await kv.set('admin_notifications', []);
}
