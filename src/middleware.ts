import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════
//  Rate Limiter — In-memory (per-edge-function, resets on deploy)
//  100 requests per minute for API, 5 login attempts per minute
// ═══════════════════════════════════════════════════════════════
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
}

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) rateLimitStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // ═══ Secure Headers (all routes) ═══
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");

  // Content Security Policy
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' wss: https:",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // HSTS (only in production)
  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // ═══ Rate Limiting (API routes only) ═══
  if (pathname.startsWith("/api/")) {
    // Get client IP or use a fallback
    const clientIP =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Login endpoint — high IP-level limit (smart tracking done in API route per-email)
    if (pathname === "/api/admin" && request.method === "POST") {
      const result = checkRateLimit(`login:${clientIP}`, 30, 60 * 1000);
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "account_locked",
            locked: true,
            retryAfter: result.resetIn,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.resetIn),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }
    }

    // Register endpoint — 3 attempts per minute
    if (pathname === "/api/register") {
      const result = checkRateLimit(`register:${clientIP}`, 3, 60 * 1000);
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `محاولات تسجيل كثيرة. حاول بعد ${result.resetIn} ثانية`,
            retryAfter: result.resetIn,
          },
          { status: 429, headers: { "Retry-After": String(result.resetIn) } }
        );
      }
    }

    // All other API routes — 100 requests per minute
    if (pathname !== "/api/admin" && pathname !== "/api/register") {
      const result = checkRateLimit(`api:${clientIP}`, 100, 60 * 1000);
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "طلبات كثيرة. حاول مرة أخرى بعد قليل",
          },
          { status: 429, headers: { "Retry-After": String(result.resetIn) } }
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|logo|manifest|robots|sw\\.js).*)"],
};
