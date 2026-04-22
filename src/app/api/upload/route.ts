import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

/**
 * POST /api/upload
 * Upload payment proof image (base64) and store in KV.
 * Returns a URL-like reference ID.
 *
 * Body: { image: string (base64 data URL) }
 * Returns: { success: true, url: "proof:<id>" }
 */
export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json({ success: false, error: "الصورة مطلوبة" }, { status: 400 });
    }

    // Validate it's a data URL
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ success: false, error: "صيغة الصورة غير مدعومة" }, { status: 400 });
    }

    // Limit size: ~2MB base64
    if (image.length > 2_800_000) {
      return NextResponse.json({ success: false, error: "حجم الصورة كبير جداً. الحد الأقصى 2 ميجا" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const key = `payment_proof:${id}`;
    await kv.set(key, image, { ex: 7 * 24 * 60 * 60 }); // 7 days TTL

    return NextResponse.json({ success: true, url: `proof:${id}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ success: false, error: "خطأ في رفع الصورة" }, { status: 500 });
  }
}

/**
 * GET /api/upload?id=<proofId>
 * Retrieve stored image by proof ID.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const proofId = searchParams.get("id");

    if (!proofId) {
      return NextResponse.json({ success: false, error: "معرف الصورة مطلوب" }, { status: 400 });
    }

    const key = `payment_proof:${proofId}`;
    const data = await kv.get<string>(key);

    if (!data) {
      return NextResponse.json({ success: false, error: "الصورة غير موجودة أو انتهت صلاحيتها" }, { status: 404 });
    }

    // Return the base64 data URL
    return NextResponse.json({ success: true, image: data });
  } catch (error) {
    console.error("GET upload error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الصورة" }, { status: 500 });
  }
}
