/**
 * use-payment.ts — Payment / subscription hook
 *
 * TODO: Extract from page.tsx
 *
 * Currently all payment logic lives in page.tsx (~lines 1200–1600).
 * To migrate:
 * 1. Move payment state variables here (paymentMethod, selectedPkg, couponApplied, etc.)
 * 2. Move payment form handlers here (handlePaymentSubmit, handleApplyCoupon, etc.)
 * 3. Move subscription upgrade logic here (effectivePrice calculation, upgradeInfo)
 * 4. Return { paymentMethod, selectedPkg, appliedCoupon, ... } from the hook
 * 5. Import and destructure in page.tsx
 *
 * Depends on: use-session (for auth headers), store (for package/coupon types)
 */

// This hook will be implemented in a future refactoring phase.
// For now, payment management remains in page.tsx.
export {};
