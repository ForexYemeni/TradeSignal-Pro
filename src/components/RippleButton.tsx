'use client';

import React, { useRef, useCallback, type ButtonHTMLAttributes } from 'react';

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  rippleColor?: string;
}

/**
 * Premium button with Material-style ripple effect on click.
 * Wraps any button content with an animated ripple overlay.
 */
export function RippleButton({
  children,
  className = '',
  onClick,
  rippleColor = 'rgba(255, 215, 0, 0.25)',
  ...props
}: RippleButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const maxDim = Math.max(rect.width, rect.height) * 2;

    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position:absolute;
      border-radius:50%;
      background:${rippleColor};
      width:0; height:0;
      left:${x}px; top:${y}px;
      transform:translate(-50%,-50%);
      animation:rippleEffect 0.6s ease-out forwards;
      pointer-events:none;
    `;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);

    onClick?.(e);
  }, [onClick, rippleColor]);

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
