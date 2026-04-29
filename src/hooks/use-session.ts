/**
 * use-session.ts — Session / authentication hook
 *
 * TODO: Extract from page.tsx
 *
 * Currently all session logic lives in page.tsx (~lines 1–400).
 * To migrate:
 * 1. Move session state here (session, loginForm, otpStep, otpCode, etc.)
 * 2. Move login / logout handlers here (handleLogin, handleVerifyOtp, handleLogout)
 * 3. Move session polling logic here (setInterval for session refresh)
 * 4. Move auto-logout timer here (inactivity timeout)
 * 5. Return { session, isLoggedIn, loginForm, ... } from the hook
 * 6. Import and destructure in page.tsx
 *
 * Depends on: store (for session types), utils (for password hashing)
 */

// This hook will be implemented in a future refactoring phase.
// For now, session management remains in page.tsx.
export {};
