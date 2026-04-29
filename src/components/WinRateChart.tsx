'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface WinRateChartProps {
  winRate: number;
  wins: number;
  losses: number;
  animated?: boolean;
}

/**
 * SVG Donut Chart for Win Rate visualization.
 * Animates from 0 to actual value on mount.
 * Color: green >=60%, yellow >=40%, red <40%
 */
export function WinRateChart({ winRate, wins, losses, animated = true }: WinRateChartProps) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (winRate / 100) * circumference;

  const color = useMemo(() => {
    if (winRate >= 60) return { stroke: '#10b981', glow: 'rgba(16,185,129,0.15)', bg: 'from-emerald-500/15 to-emerald-600/5' };
    if (winRate >= 40) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.15)', bg: 'from-amber-500/15 to-amber-600/5' };
    return { stroke: '#ef4444', glow: 'rgba(239,68,68,0.15)', bg: 'from-red-500/15 to-red-600/5' };
  }, [winRate]);

  return (
    <div className="glass-card rounded-xl p-4 relative overflow-hidden">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${color.bg} opacity-50 pointer-events-none`} />
      
      <div className="relative flex items-center gap-4">
        {/* SVG Donut */}
        <div className="relative w-[88px] h-[88px] flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="7"
            />
            {/* Win arc */}
            <motion.circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={color.stroke}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={animated ? { strokeDashoffset: circumference } : { strokeDashoffset }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
              style={{ filter: `drop-shadow(0 0 6px ${color.glow})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black tabular-nums" style={{ color: color.stroke }}>
              {winRate}%
            </span>
            <span className="text-[7px] text-muted-foreground font-medium">نسبة الفوز</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-semibold">ربح</span>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">{wins}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-[10px] text-red-400 font-semibold">خسارة</span>
            </div>
            <span className="text-sm font-bold text-red-400 tabular-nums">{losses}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-emerald-600"
              initial={animated ? { width: 0 } : { width: `${winRate}%` }}
              animate={{ width: `${winRate}%` }}
              transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
            />
          </div>
          <div className="text-[8px] text-muted-foreground/50">
            {wins + losses > 0 ? `إجمالي ${wins + losses} صفقة مغلقة` : 'لا توجد صفقات مغلقة'}
          </div>
        </div>
      </div>
    </div>
  );
}
