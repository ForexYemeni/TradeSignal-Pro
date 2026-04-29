'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Animated number counter — counts from 0 to target with ease-out cubic.
 * Usage: const animatedValue = useCountUp(displayStats.winRate);
 */
export function useCountUp(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);
  const targetRef = useRef(target);
  const rafRef = useRef<number>(0);

  targetRef.current = target;

  useEffect(() => {
    if (!enabled) { setValue(target); return; }

    const start = performance.now();
    const startVal = value; // Continue from current value for smooth updates

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startVal + (eased * (targetRef.current - startVal)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, enabled]);

  return value;
}

/**
 * Animated decimal counter — for P&L values like +$14.51
 */
export function useCountUpDecimal(target: number, decimals = 2, duration = 600) {
  const [value, setValue] = useState(0);
  const targetRef = useRef(target);
  const rafRef = useRef<number>(0);

  targetRef.current = target;

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * targetRef.current;
      setValue(parseFloat(current.toFixed(decimals)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, decimals]);

  return value;
}
