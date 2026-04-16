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
  partialClose?: boolean;
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
  status: "pending" | "active" | "blocked";
  mustChangePwd: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Signals ────────────────────────────────────────────
export async function getSignals(limit = 100): Promise<StoredSignal[]> {
  const data = await kv.get<StoredSignal[]>('signals');
  return (data || []).slice(0, limit);
}

export async function addSignal(signal: StoredSignal): Promise<StoredSignal> {
  const signals = await getSignals(9999);
  signals.unshift(signal);
  await kv.set('signals', signals.slice(0, 1000));
  return signal;
}

export async function getSignalById(id: string): Promise<StoredSignal | null> {
  const signals = await getSignals(9999);
  return signals.find(s => s.id === id) || null;
}

export async function updateSignal(id: string, updates: Partial<StoredSignal>): Promise<StoredSignal | null> {
  const signals = await getSignals(9999);
  const idx = signals.findIndex(s => s.id === id);
  if (idx === -1) return null;
  signals[idx] = { ...signals[idx], ...updates };
  await kv.set('signals', signals);
  return signals[idx];
}

export async function deleteSignal(id: string): Promise<boolean> {
  const signals = await getSignals(9999);
  const filtered = signals.filter(s => s.id !== id);
  if (filtered.length === signals.length) return false;
  await kv.set('signals', filtered);
  return true;
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

export async function addUser(user: StoredUser): Promise<StoredUser> {
  const users = await getUsers();
  users.push(user);
  await kv.set('users', users);
  return user;
}

export async function updateUser(id: string, updates: Partial<StoredUser>): Promise<StoredUser | null> {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
  await kv.set('users', users);
  return users[idx];
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await getUsers();
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  await kv.set('users', filtered);
  return true;
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
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
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
