import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set('_health', 'ok');
    const result = await kv.get('_health');
    return NextResponse.json({
      success: true,
      message: "KV Store يعمل ✅",
      test: result,
      hasUrl: !!process.env.KV_REST_API_URL,
      hasToken: !!process.env.KV_REST_API_TOKEN,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      message: "KV Store غير متصل ❌",
      error: msg,
      hasUrl: !!process.env.KV_REST_API_URL,
      hasToken: !!process.env.KV_REST_API_TOKEN,
      fix: "Vercel Dashboard → Storage → Create Database → KV → Create",
    });
  }
}
