import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

/**
 * POST /api/upload
 * Upload payment proof image (base64) and store in KV.
 * Returns a URL-like reference ID.
 *
 * Body: { image?: string, file?: string, fileName?: string }
 * Returns: { success: true, url: "proof:<id>" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const image = body.image || body.file;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ success: false, error: "الصورة مطلوبة" }, { status: 400 });
    }

    // 1. Must be a data URL starting with data:image/
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ success: false, error: "يجب رفع صورة فقط - الصيغ المدعومة: JPG, PNG, GIF, WebP" }, { status: 400 });
    }

    // 2. Validate image MIME type (check the part after "data:image/")
    const mimeMatch = image.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
    if (!mimeMatch) {
      return NextResponse.json({ success: false, error: "صيغة الصورة غير معروفة - يجب رفع صورة حقيقية" }, { status: 400 });
    }

    const allowedMimes = ["jpeg", "jpg", "png", "gif", "webp", "bmp", "svg+xml"];
    const mimeType = mimeMatch[1].toLowerCase();

    if (!allowedMimes.includes(mimeType)) {
      return NextResponse.json({ success: false, error: "صيغة الصورة غير مدعومة - الصيغ المدعومة: JPG, PNG, GIF, WebP" }, { status: 400 });
    }

    // 3. Check for valid base64 data after the comma
    const base64Data = image.split(",")[1];
    if (!base64Data || base64Data.length < 100) {
      return NextResponse.json({ success: false, error: "الملف المرفوع فارغ أو غير صالح - يجب رفع صورة حقيقية" }, { status: 400 });
    }

    // 4. Validate that the base64 data decodes to actual image content
    // Check the file signature (magic bytes) of the decoded data
    try {
      const buffer = Buffer.from(base64Data, "base64");

      // Check for valid image magic bytes
      const isValidImage =
        // JPEG: starts with FF D8 FF
        (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) ||
        // PNG: starts with 89 50 4E 47 (‰PNG)
        (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) ||
        // GIF: starts with "GIF8"
        (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) ||
        // WebP: starts with "RIFF" and "WEBP" at offset 8
        (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
         buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) ||
        // BMP: starts with "BM"
        (buffer[0] === 0x42 && buffer[1] === 0x4D) ||
        // SVG: starts with <?xml or <svg (text-based)
        (base64Data.startsWith("PD94bWwg") || base64Data.startsWith("PHN2Zw"));

      if (!isValidImage) {
        return NextResponse.json({ success: false, error: "الملف ليس صورة حقيقية - يجب رفع صورة فقط" }, { status: 400 });
      }

      // 5. Limit size: 5MB decoded
      if (buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: "حجم الصورة كبير جداً - الحد الأقصى 5 ميجابايت" }, { status: 400 });
      }

      // 6. Minimum image size check (at least 1KB — prevents blank/tiny files)
      if (buffer.length < 1024) {
        return NextResponse.json({ success: false, error: "الصورة صغيرة جداً أو فارغة - يجب رفع صورة حقيقية" }, { status: 400 });
      }
    } catch (decodeError) {
      return NextResponse.json({ success: false, error: "الملف المرفوع تالف - يجب رفع صورة حقيقية" }, { status: 400 });
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

    return NextResponse.json({ success: true, image: data });
  } catch (error) {
    console.error("GET upload error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الصورة" }, { status: 500 });
  }
}
