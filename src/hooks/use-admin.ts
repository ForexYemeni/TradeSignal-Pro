/**
 * use-admin.ts — Admin panel management hook
 *
 * TODO: Extract from page.tsx
 *
 * Currently all admin logic lives in page.tsx (~lines 600–1200).
 * To migrate:
 * 1. Move admin state variables here (users, packages, coupons, paymentRequests, etc.)
 * 2. Move admin fetch functions here (fetchUsers, fetchPackages, fetchCoupons, etc.)
 * 3. Move admin CRUD handlers here (handleDeleteUser, handleToggleUser, handleCreatePackage, etc.)
 * 4. Return { users, packages, coupons, paymentRequests, ... } from the hook
 * 5. Import and destructure in page.tsx
 *
 * Depends on: use-session (for auth headers), store (for data types)
 */

// This hook will be implemented in a future refactoring phase.
// For now, admin management remains in page.tsx.
export {};
