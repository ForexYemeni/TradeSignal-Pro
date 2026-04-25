/**
 * Admin Authentication Guard
 *
 * Shared utility for protecting admin-only API routes.
 * Checks session cookie (fy_session) or Authorization header
 * against admin users in the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "./store";

interface AdminAuthResult {
  isAdmin: boolean;
  userId: string;
  user: Awaited<ReturnType<typeof getUserById>> | null;
  error?: string;
}

/**
 * Validate admin access from request.
 * Checks fy_session cookie or Authorization: Bearer <userId> header.
 * Returns admin info if valid, or error response to return.
 */
export async function validateAdmin(request: NextRequest): Promise<AdminAuthResult> {
  let userId = "";

  // 1. Check session cookie
  const sessionCookie = request.cookies.get("fy_session")?.value;
  if (sessionCookie) {
    try {
      const sessionData = JSON.parse(atob(sessionCookie));
      userId = sessionData.id || sessionData.userId || "";
    } catch {
      // Invalid cookie format
    }
  }

  // 2. Check Authorization header (Bearer token)
  if (!userId) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      userId = authHeader.slice(7);
    }
  }

  // 3. Check body/body params (for backward compatibility with existing frontend)
  if (!userId) {
    try {
      const body = await request.json();
      userId = body.adminId || body.userId || "";
    } catch {
      // No body or invalid JSON
    }
  }

  if (!userId) {
    return { isAdmin: false, userId: "", user: null, error: "معرف المستخدم مطلوب" };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { isAdmin: false, userId, user: null, error: "المستخدم غير موجود" };
  }

  if (user.role !== "admin") {
    return { isAdmin: false, userId, user, error: "ليس لديك صلاحية الوصول" };
  }

  return { isAdmin: true, userId, user };
}

/**
 * Middleware wrapper: returns 403/401 response if not admin, or null if admin.
 * Usage:
 *   const authError = await requireAdmin(request);
 *   if (authError) return authError;
 *   // ... proceed with admin logic
 */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const result = await validateAdmin(request);

  if (!result.userId) {
    return NextResponse.json(
      { success: false, error: "يرجى تسجيل الدخول أولاً" },
      { status: 401 }
    );
  }

  if (!result.isAdmin) {
    return NextResponse.json(
      { success: false, error: result.error || "ليس لديك صلاحية الوصول لهذا الإجراء" },
      { status: 403 }
    );
  }

  return null;
}
