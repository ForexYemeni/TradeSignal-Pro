'use client';

import React, { useState } from 'react';
import {
  Home,
  Activity,
  BarChart3,
  Send,
  Users,
  Package,
  MoreHorizontal,
  Settings,
  ChevronDown,
  LogOut,
  CreditCard,
  Wallet,
  Banknote,
  Ticket,
  Megaphone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Tab, AdminSubTab } from '@/lib/types';

/* ═══════════════════════════════════════════════════════════════
   Sidebar Props
   ═══════════════════════════════════════════════════════════════ */
interface SidebarProps {
  tab: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTab: React.Dispatch<React.SetStateAction<any>>;
  isAdmin: boolean;
  adminSubTab?: AdminSubTab | null;
  setAdminSubTab?: (sub: AdminSubTab | null) => void;
  setView?: (view: string) => void;
  logout?: () => void;
  activeSignalCount?: number;
}

/* ═══════════════════════════════════════════════════════════════
   Navigation Items — mirrors the exact tabs from page.tsx
   ═══════════════════════════════════════════════════════════════ */
interface NavItem {
  key: Tab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
  userOnly?: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   "More" Sub-items (Admin Management Center)
   ═══════════════════════════════════════════════════════════════ */
interface MoreSubItem {
  key: AdminSubTab;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const MORE_SUB_ITEMS: MoreSubItem[] = [
  {
    key: 'packages',
    label: 'إدارة الباقات',
    icon: <Package className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/20',
  },
  {
    key: 'coupons',
    label: 'كوبونات الخصم',
    icon: <Ticket className="w-4 h-4" />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    borderColor: 'border-emerald-500/20',
  },
  {
    key: 'payment_requests',
    label: 'طلبات الدفع',
    icon: <CreditCard className="w-4 h-4" />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/15',
    borderColor: 'border-sky-500/20',
  },
  {
    key: 'usdt_networks',
    label: 'شبكات USDT',
    icon: <Wallet className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/20',
  },
  {
    key: 'local_methods',
    label: 'طرق الدفع المحلية',
    icon: <Banknote className="w-4 h-4" />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/20',
  },
  {
    key: 'settings',
    label: 'إعدادات التطبيق',
    icon: <Settings className="w-4 h-4" />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/15',
    borderColor: 'border-sky-500/20',
  },
  {
    key: 'announcements',
    label: 'الإعلانات',
    icon: <Megaphone className="w-4 h-4" />,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/15',
    borderColor: 'border-rose-500/20',
  },
];

/* ═══════════════════════════════════════════════════════════════
   Sidebar Component
   ═══════════════════════════════════════════════════════════════ */
export default function Sidebar({
  tab,
  setTab,
  isAdmin,
  adminSubTab,
  setAdminSubTab,
  setView,
  logout,
  activeSignalCount = 0,
}: SidebarProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);

  // Auto-expand "More" if we're on the more tab or have an adminSubTab
  const isMoreActive = tab === 'more' || !!adminSubTab;
  const showMoreExpanded = moreExpanded || isMoreActive;

  // Build tabs list matching page.tsx exactly
  const tabs: NavItem[] = [
    { key: 'home', label: 'الرئيسية', icon: <Home className="w-5 h-5" /> },
    { key: 'signals', label: 'الإشارات', icon: <Activity className="w-5 h-5" />, badge: activeSignalCount },
    { key: 'dashboard', label: 'الإحصائيات', icon: <BarChart3 className="w-5 h-5" /> },
    ...(isAdmin ? [{ key: 'analyst' as Tab, label: 'المحلل', icon: <Send className="w-5 h-5" />, adminOnly: true }] : []),
    ...(isAdmin ? [{ key: 'users' as Tab, label: 'المستخدمين', icon: <Users className="w-5 h-5" />, adminOnly: true }] : []),
    ...(!isAdmin ? [{ key: 'packages' as Tab, label: 'الاشتراك', icon: <Package className="w-5 h-5" />, userOnly: true }] : []),
    ...(isAdmin ? [{ key: 'more' as Tab, label: 'المزيد', icon: <MoreHorizontal className="w-5 h-5" />, adminOnly: true }] : []),
    { key: 'account', label: 'الحساب', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <aside
      className="hidden md:flex fixed right-0 top-0 bottom-0 w-64 z-40 flex-col glass-nav-premium"
      dir="rtl"
    >
      {/* ── Animated Gold Gradient Border (Left Edge) ── */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(255,215,0,0.08) 15%, rgba(255,215,0,0.2) 50%, rgba(255,215,0,0.08) 85%, transparent 100%)',
        }}
      />
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px] animate-pulse"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(255,215,0,0.15) 20%, rgba(255,215,0,0.35) 50%, rgba(255,215,0,0.15) 80%, transparent 100%)',
        }}
      />

      {/* ── Logo Section ── */}
      <div className="flex-shrink-0 px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"
            style={{
              boxShadow:
                '0 2px 8px rgba(255,215,0,0.25), 0 0 20px rgba(255,215,0,0.1)',
            }}
          >
            <span className="text-black font-bold text-sm">FY</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-foreground text-sm tracking-wide leading-tight">
              <span className="gold-gradient-text">ForexYemeni</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              TradeSignal Pro
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="mt-5 h-px bg-gradient-to-l from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* ── Navigation List ── */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-3 pb-4 space-y-1">
        {tabs.map((t) => {
          const isActive =
            tab === t.key || (t.key === 'more' && !!adminSubTab);

          return (
            <div key={t.key}>
              {/* Main Tab Button */}
              <button
                onClick={() => {
                  if (t.key === 'more') {
                    setMoreExpanded(!moreExpanded);
                    setTab(t.key);
                    if (setAdminSubTab) setAdminSubTab(null);
                  } else {
                    setTab(t.key);
                    if (setAdminSubTab) {
                      setAdminSubTab(null);
                    }
                  }
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-amber-400/[0.08] text-amber-400'
                    : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-white/[0.03]'
                  }
                `}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                )}

                {/* Icon container */}
                <div
                  className={`
                    flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200
                    ${isActive
                      ? 'bg-amber-400/[0.12]'
                      : 'bg-transparent group-hover:bg-white/[0.04]'
                    }
                  `}
                >
                  <span
                    className={isActive ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.4)]' : ''}
                  >
                    {t.icon}
                  </span>
                </div>

                {/* Label */}
                <span
                  className={`text-[13px] font-medium flex-1 text-right ${
                    isActive ? 'nav-active-vip' : ''
                  }`}
                >
                  {t.label}
                </span>

                {/* Badge */}
                {t.badge !== undefined && t.badge > 0 && (
                  <span
                    className="min-w-[20px] h-5 rounded-full bg-gradient-to-l from-amber-400 to-orange-500 text-[10px] font-bold text-black flex items-center justify-center px-1.5 shadow-lg shadow-amber-500/25"
                  >
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}

                {/* Chevron for "More" */}
                {t.key === 'more' && (
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 ${
                      showMoreExpanded ? 'rotate-180' : ''
                    } ${isActive ? 'text-amber-400' : 'text-muted-foreground/40'}`}
                  />
                )}
              </button>

              {/* ── More Sub-items (Admin Management Center) ── */}
              {t.key === 'more' && isAdmin && (
                <AnimatePresence initial={false}>
                  {showMoreExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 mr-5 pr-4 space-y-0.5 border-r border-white/[0.06]">
                        {MORE_SUB_ITEMS.map((sub) => {
                          const isSubActive = adminSubTab === sub.key;
                          return (
                            <button
                              key={sub.key}
                              onClick={() => {
                                setTab('more');
                                if (setAdminSubTab) setAdminSubTab(sub.key);
                              }}
                              className={`
                                w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
                                text-right transition-all duration-200
                                ${isSubActive
                                  ? `${sub.bgColor} ${sub.color} font-semibold`
                                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.03]'
                                }
                              `}
                            >
                              <div
                                className={`
                                  flex items-center justify-center w-7 h-7 rounded-lg border transition-all duration-200
                                  ${isSubActive
                                    ? `${sub.bgColor} ${sub.borderColor} ${sub.color}`
                                    : 'bg-transparent border-transparent'
                                  }
                                `}
                              >
                                {sub.icon}
                              </div>
                              <span className="text-[11px] font-medium flex-1">
                                {sub.label}
                              </span>
                              {/* Active dot for sub-item */}
                              {isSubActive && (
                                <div
                                  className={`w-1.5 h-1.5 rounded-full ${sub.color}`}
                                  style={{
                                    boxShadow: `0 0 8px currentColor`,
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer: Logout ── */}
      <div className="flex-shrink-0 px-3 pb-4 pt-2">
        {/* Separator */}
        <div className="mb-3 h-px bg-gradient-to-l from-transparent via-white/[0.06] to-transparent" />

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.06] transition-all duration-200 group"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/[0.08] border border-red-500/[0.1] group-hover:bg-red-500/[0.12] group-hover:border-red-500/[0.15] transition-all duration-200">
            <LogOut className="w-4 h-4" />
          </div>
          <span className="text-[13px] font-medium">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
