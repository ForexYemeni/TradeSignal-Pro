'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface HeatMapProps {
  signals: Array<{
    pair: string;
    status: string;
    pnlDollars?: number;
  }>;
  animated?: boolean;
}

/**
 * Pair Performance Heat Map — grid of colored tiles showing
 * win rate per trading pair. Green = high win rate, Red = low.
 */
export function PairPerformanceHeatMap({ signals, animated = true }: HeatMapProps) {
  const pairStats = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; total: number; pnl: number }>();
    for (const s of signals) {
      if (s.status === 'ACTIVE') continue;
      const pair = (s.pair || '').toUpperCase();
      const stat = map.get(pair) || { wins: 0, losses: 0, total: 0, pnl: 0 };
      if (s.status === 'HIT_TP') stat.wins++;
      else if (s.status === 'HIT_SL') stat.losses++;
      if (typeof s.pnlDollars === 'number' && isFinite(s.pnlDollars)) stat.pnl += s.pnlDollars;
      stat.total++;
      map.set(pair, stat);
    }
    return Array.from(map.entries())
      .map(([pair, stats]) => ({
        pair,
        ...stats,
        winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [signals]);

  if (pairStats.length === 0) return null;

  const getCellStyle = (winRate: number, total: number) => {
    if (total < 2) return 'bg-white/[0.03] border-white/[0.06]';
    if (winRate >= 70) return 'bg-emerald-500/10 border-emerald-500/20';
    if (winRate >= 50) return 'bg-amber-500/10 border-amber-500/15';
    return 'bg-red-500/10 border-red-500/15';
  };

  const getTextColor = (winRate: number, total: number) => {
    if (total < 2) return 'text-muted-foreground';
    if (winRate >= 70) return 'text-emerald-400';
    if (winRate >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getPnlText = (pnl: number) => {
    if (pnl > 0) return `+$${pnl.toFixed(0)}`;
    if (pnl < 0) return `-$${Math.abs(pnl).toFixed(0)}`;
    return '$0';
  };

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return 'text-emerald-400/60';
    if (pnl < 0) return 'text-red-400/60';
    return 'text-muted-foreground/40';
  };

  return (
    <div className="glass-card rounded-xl p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center">
          <Flame className="w-3 h-3 text-amber-400" />
        </div>
        <span className="text-[11px] font-bold text-foreground">خريطة أداء الأزواج</span>
        <span className="text-[8px] text-muted-foreground/50 mr-auto">آخر {pairStats.length} زوج</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {pairStats.map((p, i) => (
          <motion.div
            key={p.pair}
            initial={animated ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className={`rounded-lg p-2.5 text-center border transition-all hover:scale-[1.02] cursor-default ${getCellStyle(p.winRate, p.total)}`}
          >
            <div className="text-[9px] font-mono font-bold text-foreground truncate leading-tight">{p.pair}</div>
            <div className={`text-base font-black tabular-nums leading-tight mt-0.5 ${getTextColor(p.winRate, p.total)}`}>
              {p.total < 2 ? '—' : `${p.winRate}%`}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`text-[7px] ${getPnlColor(p.pnl)}`}>{getPnlText(p.pnl)}</span>
              <span className="text-[7px] text-muted-foreground/40">{p.total}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
