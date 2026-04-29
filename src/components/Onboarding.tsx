'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, BarChart3, Bell, Settings, Home, Users, Package, MoreHorizontal, TrendingUp, Search } from 'lucide-react';

type TabKey = string;

interface OnboardingProps {
  onComplete: () => void;
}

/**
 * Professional onboarding flow for new users.
 * 3-step walkthrough showing key features of the platform.
 * Auto-dismisses after completion, stores flag in localStorage.
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);

  const steps = [
    {
      icon: <Activity className="w-7 h-7 text-emerald-400" />,
      bg: 'from-emerald-500/15 to-emerald-600/5',
      border: 'border-emerald-500/20',
      title: 'إشارات فورية',
      description: 'تلقى إشارات التداول فور إرسالها من المحلل مع تنبيهات صوتية ومرئية فورية',
    },
    {
      icon: <TrendingUp className="w-7 h-7 text-amber-400" />,
      bg: 'from-amber-500/15 to-amber-600/5',
      border: 'border-amber-500/20',
      title: 'تتبع الأداء',
      description: 'راقب نسبة الفوز والخريطة الحرارية والأرباح في الوقت الحقيقي مع رسوم بيانية متحركة',
    },
    {
      icon: <Bell className="w-7 h-7 text-sky-400" />,
      bg: 'from-sky-500/15 to-sky-600/5',
      border: 'border-sky-500/20',
      title: 'إشعارات ذكية',
      description: 'تنبيهات ذكية لكل تحديث — ضرب هدف، وقف خسارة، ونقل للتعادل مع تخصيص كامل',
    },
  ];

  const handleComplete = () => {
    setVisible(false);
    try { localStorage.setItem('fy_onboarding_done', '1'); } catch {}
    setTimeout(onComplete, 300);
  };

  const handleSkip = () => {
    handleComplete();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4"
          onClick={handleSkip}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(10, 17, 40, 0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Noise overlay */}
            <div className="absolute inset-0 noise-overlay pointer-events-none" />

            <div className="relative p-8 text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  {/* Icon */}
                  <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${steps[step].bg} border ${steps[step].border} flex items-center justify-center mb-5`}>
                    {steps[step].icon}
                  </div>

                  {/* Text */}
                  <h3 className="text-lg font-bold text-foreground mb-2">{steps[step].title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px] mx-auto">{steps[step].description}</p>
                </motion.div>
              </AnimatePresence>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {steps.map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ width: i === step ? 24 : 8, backgroundColor: i === step ? '#FFD700' : 'rgba(255,255,255,0.15)' }}
                    transition={{ duration: 0.3 }}
                    className="h-2 rounded-full"
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={step < steps.length - 1 ? () => setStep(s => s + 1) : handleComplete}
                  className="w-full h-12 rounded-xl gold-gradient text-black font-bold text-sm transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-amber-500/20"
                >
                  {step < steps.length - 1 ? 'التالي' : 'ابدأ الآن'}
                </button>
                <button
                  onClick={handleSkip}
                  className="w-full text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
                >
                  تخطي
                </button>
              </div>

              {/* Step counter */}
              <div className="mt-4 text-[9px] text-muted-foreground/30">
                {step + 1} من {steps.length}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Check if onboarding has been completed before.
 */
export function hasCompletedOnboarding(): boolean {
  try { return localStorage.getItem('fy_onboarding_done') === '1'; } catch { return false; }
}
