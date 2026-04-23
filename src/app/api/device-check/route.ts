import { NextRequest, NextResponse } from "next/server";
import { getUserByDeviceId } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const { deviceId, email } = await request.json();

    if (!deviceId || !deviceId.trim()) {
      return NextResponse.json({ success: true, safe: true });
    }

    const existingDeviceUser = await getUserByDeviceId(deviceId.trim());

    if (!existingDeviceUser) {
      return NextResponse.json({ success: true, safe: true });
    }

    // Device has another account - check if it's the same user trying to login
    if (email && existingDeviceUser.email.toLowerCase() === email.toLowerCase()) {
      // Same user - safe, they're logging into their own account
      return NextResponse.json({ success: true, safe: true });
    }

    // Different account on same device!
    return NextResponse.json({
      success: true,
      safe: false,
      detected: true,
      existingAccount: {
        name: existingDeviceUser.name,
        email: existingDeviceUser.email,
        createdAt: existingDeviceUser.createdAt,
        subscriptionType: existingDeviceUser.subscriptionType,
        packageName: existingDeviceUser.packageName,
      },
    });
  } catch (error) {
    console.error("Device check error:", error);
    return NextResponse.json({ success: true, safe: true }); // Fail open - don't block on error
  }
}
