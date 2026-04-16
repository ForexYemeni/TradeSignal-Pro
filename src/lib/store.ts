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
