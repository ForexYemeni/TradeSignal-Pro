'use client';

import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  isOffline: boolean;
}

/**
 * Professional Error Boundary with:
 * - Animated icon with glow effect
 * - Glass card design matching the app theme
 * - Offline detection
 * - Retry button with gold gradient
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, isOffline: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, isOffline: !navigator.onLine };
  }

  componentDidMount(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleOnline = (): void => {
    this.setState({ isOffline: false });
  };

  handleOffline = (): void => {
    this.setState({ isOffline: true });
  };

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          dir="rtl"
          className="flex min-h-screen items-center justify-center px-4"
          style={{ background: 'linear-gradient(135deg, #080d1a 0%, #0f172a 50%, #080d1a 100%)' }}
        >
          {/* Ambient glow */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-amber-500/[0.03] blur-3xl pointer-events-none" />

          <div className="relative glass-card rounded-2xl p-10 max-w-md w-full text-center">
            {/* Animated icon with glow */}
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div
                className="absolute inset-0 rounded-full bg-amber-500/10 animate-pulse"
                style={{ boxShadow: '0 0 40px rgba(245,158,11,0.12)' }}
              />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/20 flex items-center justify-center">
                {this.state.isOffline ? (
                  <WifiOff className="w-8 h-8 text-amber-400" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                )}
              </div>
            </div>

            {/* Message */}
            <h2 className="text-xl font-extrabold text-foreground mb-2">
              {this.state.isOffline ? 'لا يوجد اتصال بالإنترنت' : 'حدث خطأ غير متوقع'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              {this.state.isOffline
                ? 'تأكد من اتصالك بالإنترنت وحاول مرة أخرى'
                : 'نعتذر عن الإزعاج. يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني'}
            </p>

            {/* Retry button */}
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl gold-gradient px-8 py-3 text-sm font-bold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.97]"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
