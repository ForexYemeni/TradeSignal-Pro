import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Only allow in development or when explicitly enabled
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: "This endpoint is disabled in production" }, { status: 403 });
    }

    const { kv } = await import('@vercel/kv');
    await kv.set('_health', 'ok');
    const result = await kv.get('_health');
    return NextResponse.json({
      success: true,
      message: "KV Store يعمل ✅",
      test: result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      message: "KV Store غير متصل ❌",
      error: msg,
      fix: "Vercel Dashboard → Storage → Create Database → KV → Create",
    });
  }
}
