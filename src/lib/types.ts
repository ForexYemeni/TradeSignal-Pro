export type SignalCategory =
  | "ENTRY" | "TP_HIT" | "SL_HIT" | "REENTRY"
  | "REENTRY_TP" | "REENTRY_SL" | "PYRAMID"
  | "PYRAMID_TP" | "PYRAMID_SL";

export interface TakeProfit { tp: number; rr: number }

export interface Signal {
  id: string; pair: string; type: "BUY" | "SELL";
  entry: number; stopLoss: number; takeProfits: TakeProfit[];
  confidence: number; status: string; signalCategory: SignalCategory;
  rawText: string; timeframe: string; htfTimeframe: string;
  htfTrend: string; smcTrend: string; hitTpIndex: number;
  hitPrice?: number; pnlPoints?: number; pnlDollars?: number;
  partialWin?: boolean; totalTPs?: number;
  balance?: number; lotSize?: string;
  riskTarget?: number; riskPercent?: number; actualRisk?: number;
  actualRiskPct?: number; slDistance?: number; maxRR?: number;
  instrument?: string; createdAt: string;
}

export interface AdminSession { id: string; email: string; name: string; mustChangePwd: boolean; role?: string; status?: string; subscriptionType?: string; subscriptionExpiry?: string; packageName?: string; packageId?: string }

export interface Stats {
  total: number; active: number; hitTp: number; hitSl: number;
  winRate: number; buyCount: number; sellCount: number;
  recentWeek: number; avgConfidence: number;
  topPairs: { pair: string; count: number }[];
}

export type View = "login" | "register" | "forgotPwd" | "pending" | "blocked" | "expired" | "main" | "changePwd";
export type Tab = "home" | "signals" | "dashboard" | "analyst" | "users" | "packages" | "more" | "account";
export type AdminSubTab = "packages" | "coupons" | "payments" | "usdt_networks" | "local_methods" | "payment_requests" | "settings" | "users" | "analyst" | "announcements";
export type Filter = "all" | "buy" | "sell" | "active" | "closed" | "favorites";
export interface SubPackage { id: string; name: string; durationDays: number; price: number; type: string; description: string; isActive: boolean; order: number; features: string[]; maxSignals: number; prioritySupport: boolean; showEntryEarly: boolean; instruments?: string[]; }
export interface UsdtNetworkAddress {
  id: string;
  network: string;       // e.g., "TRC20", "BEP20", "ERC20"
  address: string;       // wallet address
  isActive: boolean;
  order: number;
}

export interface TelegramConnectionData {
  id: string;
  label: string;
  botToken: string;
  chatId: string;
  isActive: boolean;
  createdAt: string;
}

export interface AppSettingsData {
  freeTrialPackageId: string | null;
  autoApproveOnRegister: boolean;
  usdtWalletAddress: string | null;
  usdtNetwork: string | null;
  usdtNetworks?: UsdtNetworkAddress[];  // multiple network addresses
  /* Referral settings */
  referralEnabled: boolean;
  referralRewardDays: number;
  referralInviteeRewardDays: number;
  /* Telegram integration */
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramConnections?: TelegramConnectionData[];
}

export interface LocalPaymentMethodData {
  id: string;
  name: string;
  walletAddress: string;
  walletName: string;
  currencyName: string;
  currencyCode: string;
  exchangeRate: number;
  isActive: boolean;
  order: number;
  createdAt: string;
}
