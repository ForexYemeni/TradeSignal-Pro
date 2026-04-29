import { NextRequest, NextResponse } from "next/server";
import { getUserById, getAppSettings, getReferrals, generateReferralCode, getUserByReferralCode, updateUser, getUsers, getPackageById } from "@/lib/store";

/**
 * GET /api/referral?userId=xxx
 * - Get user's referral code, stats, and list of referred users
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ success: false, error: "معرف المستخدم مطلوب" }, { status: 400 });
    }

    const settings = await getAppSettings();

    if (!settings.referralEnabled) {
      return NextResponse.json({ success: true, enabled: false, referralCode: null, referrals: [], stats: { total: 0, active: 0, rewardDays: 0, inviteeRewardDays: 0 } });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Generate referral code if user doesn't have one
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = generateReferralCode();
      // Ensure uniqueness
      let existing = await getUserByReferralCode(referralCode);
      while (existing) {
        referralCode = generateReferralCode();
        existing = await getUserByReferralCode(referralCode);
      }
      await updateUser(userId, { referralCode });
    }

    const { referred } = await getReferrals(userId);
    const now = new Date();

    // Stats
    const totalReferrals = referred.length;
    const activeReferrals = referred.filter(u => u.subscriptionType === "subscriber" && u.subscriptionExpiry && new Date(u.subscriptionExpiry) > now).length;
    const rewardedReferrals = referred.filter(u => u.referralRewardClaimed).length;

    // Format referred users list
    const referralsList = referred.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      subscriptionType: u.subscriptionType,
      subscriptionExpiry: u.subscriptionExpiry,
      packageName: u.packageName,
      referralRewardClaimed: u.referralRewardClaimed,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({
      success: true,
      enabled: true,
      referralCode,
      referrals: referralsList,
      stats: {
        total: totalReferrals,
        active: activeReferrals,
        rewarded: rewardedReferrals,
        rewardDays: settings.referralRewardDays,
        inviteeRewardDays: settings.referralInviteeRewardDays,
      },
    });
  } catch (error) {
    console.error("GET referral error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب بيانات الاحالة" }, { status: 500 });
  }
}

/**
 * POST /api/referral
 * - Apply a referral code during registration or from account page
 * Body: { userId, referralCode }
 *
 * IMPORTANT: The invitee reward is NOT given here. It is granted when the
 * invitee's first PAID subscription is approved (see payments API).
 * This prevents free-trial users from exploiting the referral system.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, referralCode } = await request.json();

    if (!userId || !referralCode) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    const settings = await getAppSettings();
    if (!settings.referralEnabled) {
      return NextResponse.json({ success: false, error: "نظام الاحالة غير مفعّل حالياً" }, { status: 400 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // User already has a referral code applied
    if (user.referredBy) {
      return NextResponse.json({
        success: false,
        error: `لقد تم تطبيق كود احالة مسبقاً. لا يمكن استخدام أكثر من كود واحد.`,
        alreadyApplied: true,
      }, { status: 409 });
    }

    // Validate the referral code
    const trimmedCode = referralCode.trim().toUpperCase();
    const referrer = await getUserByReferralCode(trimmedCode);

    if (!referrer) {
      return NextResponse.json({ success: false, error: "كود الاحالة غير صالح. تأكد من صحة الكود وحاول مرة أخرى." }, { status: 404 });
    }

    // Can't refer yourself
    if (referrer.id === userId) {
      return NextResponse.json({ success: false, error: "لا يمكنك استخدام كودك الخاص" }, { status: 400 });
    }

    // Check for circular referrals (A refers B, B refers A)
    if (referrer.referredBy === user.referralCode) {
      return NextResponse.json({ success: false, error: "لا يمكن الاحالة المتبادلة" }, { status: 400 });
    }

    // Apply referral code (save it — reward will be given on first paid subscription)
    await updateUser(userId, { referredBy: trimmedCode });

    return NextResponse.json({
      success: true,
      message: "تم تطبيق كود الاحالة بنجاح! ستحصل على مكافأة عند أول اشتراك مدفوع.",
      referrerName: referrer.name,
    });
  } catch (error) {
    console.error("POST referral error:", error);
    return NextResponse.json({ success: false, error: "خطأ في تطبيق كود الاحالة" }, { status: 500 });
  }
}
