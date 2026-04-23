import { NextRequest, NextResponse } from "next/server";
import { getPaymentRequests, getPaymentRequestsByUser, getPendingPaymentRequests, addPaymentRequest, updatePaymentRequest } from "@/lib/store";
import { getPackageById, getUserById, updateUser, getAppSettings, getUserByReferralCode } from "@/lib/store";
import { verifyUsdtTransaction, checkDuplicateTxId, type BlockchainVerification } from "@/lib/blockchain-verify";

// ── Referral reward: grant referrer bonus days when referred user activates paid plan ──
async function grantReferralReward(
  userId: string,
  packageType: "free" | "trial" | "paid"
): Promise<{ granted: boolean; days: number; referrerName?: string }> {
  try {
    const settings = await getAppSettings();
    if (!settings.referralEnabled || !settings.referralRewardDays) return { granted: false, days: 0 };
    if (packageType === "free" || packageType === "trial") return { granted: false, days: 0 };

    const user = await getUserById(userId);
    if (!user || !user.referredBy || user.referralRewardClaimed) return { granted: false, days: 0 };

    const referrer = await getUserByReferralCode(user.referredBy);
    if (!referrer || referrer.id === userId) return { granted: false, days: 0 };

    // Mark reward as claimed on the referred user
    await updateUser(userId, { referralRewardClaimed: true });

    const rewardDays = settings.referralRewardDays;

    // If referrer has active subscription, extend it immediately
    if (referrer.subscriptionType === "subscriber" && referrer.subscriptionExpiry && new Date(referrer.subscriptionExpiry) > new Date()) {
      const newExpiry = new Date(referrer.subscriptionExpiry);
      newExpiry.setDate(newExpiry.getDate() + rewardDays);
      await updateUser(referrer.id, { subscriptionExpiry: newExpiry.toISOString() });
      console.log(`[Referral Reward] Extended ${referrer.email} by ${rewardDays} days (referred by ${user.email})`);
    }

    return { granted: true, days: rewardDays, referrerName: referrer.name };
  } catch (error) {
    console.error("[Referral Reward] Error:", error);
    return { granted: false, days: 0 };
  }
}

/**
 * GET /api/payments?userId=xxx&pending=true
 * - List payment requests (admin: all, user: own)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const pendingOnly = searchParams.get("pending") === "true";

    if (userId) {
      const requests = await getPaymentRequestsByUser(userId);
      return NextResponse.json({ success: true, requests });
    }

    if (pendingOnly) {
      const requests = await getPendingPaymentRequests();
      return NextResponse.json({ success: true, requests });
    }

    const requests = await getPaymentRequests();
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("GET payments error:", error);
    return NextResponse.json({ success: false, error: "خطأ في جلب الطلبات" }, { status: 500 });
  }
}

/**
 * POST /api/payments
 * - Create a new payment request (subscription purchase / upgrade)
 *
 * Body: { userId, packageId, paymentMethod, txId?, txid?, paymentMethodId?, usdtNetwork?,
 *         localAmount?, localCurrencyCode?, proofUrl?, paymentProofUrl? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, packageId, paymentMethod, txId, txid, paymentMethodId, usdtNetwork: bodyNetwork, localAmount, localCurrencyCode, proofUrl, paymentProofUrl } = body;

    // Normalize txId (support both txId and txid from frontend)
    const normalizedTxId = txId || txid;
    // Normalize proofUrl (support both proofUrl and paymentProofUrl from frontend)
    const normalizedProofUrl = proofUrl || paymentProofUrl;

    if (!userId || !packageId || !paymentMethod) {
      return NextResponse.json({ success: false, error: "جميع الحقول مطلوبة" }, { status: 400 });
    }

    if (!["usdt", "local"].includes(paymentMethod)) {
      return NextResponse.json({ success: false, error: "طريقة الدفع غير صالحة" }, { status: 400 });
    }

    // Get user
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Get target package
    const pkg = await getPackageById(packageId);
    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ success: false, error: "الباقة غير موجودة أو غير مفعلة" }, { status: 404 });
    }

    // Validate method-specific fields
    if (paymentMethod === "usdt" && !normalizedTxId) {
      return NextResponse.json({ success: false, error: "معرف المعاملة (TXID) مطلوب للدفع عبر USDT" }, { status: 400 });
    }

    if (paymentMethod === "local") {
      if (!localAmount || localAmount <= 0) {
        return NextResponse.json({ success: false, error: "المبلغ مطلوب للدفع بالعملة المحلية" }, { status: 400 });
      }
      if (!normalizedProofUrl) {
        return NextResponse.json({ success: false, error: "صورة إثبات التحويل مطلوبة" }, { status: 400 });
      }
    }

    // ── Check active subscription & determine upgrade mode ──
    let isUpgrade = false;
    let effectivePrice = pkg.price;
    let remainingDays = 0;
    let remainingValue = 0;
    let upgradePrice = 0;

    if (user.subscriptionType !== "none" && user.subscriptionExpiry && new Date(user.subscriptionExpiry) > new Date()) {
      // Same package → block
      if (user.packageId === packageId) {
        const remDays = Math.ceil((new Date(user.subscriptionExpiry).getTime() - Date.now()) / 86400000);
        return NextResponse.json({
          success: false,
          error: `أنت مشترك بالفعل في باقة "${user.packageName}". متبقي ${remDays} يوم على الانتهاء.`,
          hasActiveSubscription: true,
          samePackage: true,
        }, { status: 409 });
      }

      const currentPkg = user.packageId ? await getPackageById(user.packageId) : null;
      const isCurrentFreeOrTrial = currentPkg && (currentPkg.type === "free" || currentPkg.type === "trial");

      if (isCurrentFreeOrTrial) {
        // Free/trial → paid: full price, fresh subscription
        isUpgrade = false;
        effectivePrice = pkg.price;
      } else if (currentPkg && currentPkg.type === "paid" && pkg.type === "paid") {
        // Paid → paid: calculate upgrade price
        isUpgrade = true;
        remainingDays = Math.max(0, Math.ceil((new Date(user.subscriptionExpiry).getTime() - Date.now()) / 86400000));
        remainingValue = (remainingDays / currentPkg.durationDays) * currentPkg.price;
        upgradePrice = Math.ceil(Math.max(0, pkg.price - remainingValue));

        if (upgradePrice <= 0) {
          return NextResponse.json({
            success: false,
            error: `اشتراكك الحالي في باقة "${user.packageName}" يعادل أو يفوق قيمة باقة "${pkg.name}". لا حاجة للترقية.`,
            hasActiveSubscription: true,
            currentPackage: user.packageName,
          }, { status: 409 });
        }

        effectivePrice = upgradePrice;
      } else {
        // Other cases (e.g., agency → paid): allow with full price
        isUpgrade = false;
        effectivePrice = pkg.price;
      }
    }

    // Check for existing pending request for same user + package
    const existingRequests = await getPaymentRequestsByUser(userId);
    const existingPending = existingRequests.find(
      r => r.status === "pending" && r.packageId === packageId && r.paymentMethod === paymentMethod
    );
    if (existingPending) {
      return NextResponse.json({ success: false, error: "لديك طلب معلق لنفس الباقة وطريقة الدفع. انتظر المراجعة." }, { status: 409 });
    }

    // ── USDT: Blockchain Verification ──
    if (paymentMethod === "usdt") {
      // Determine which network and wallet address to verify against
      const settings = await getAppSettings();
      let networkName = bodyNetwork?.trim() || ""; // e.g., "TRC20" or "BEP20"
      let walletAddress = "";

      // If paymentMethodId is provided, look up the network from usdtNetworks
      if (paymentMethodId && settings.usdtNetworks) {
        const selectedNetwork = settings.usdtNetworks.find(n => n.id === paymentMethodId && n.isActive);
        if (selectedNetwork) {
          networkName = selectedNetwork.network;
          walletAddress = selectedNetwork.address;
        }
      }

      // Fallback: use legacy single network if available
      if (!walletAddress && settings.usdtWalletAddress) {
        walletAddress = settings.usdtWalletAddress;
        if (!networkName && settings.usdtNetwork) {
          networkName = settings.usdtNetwork;
        }
      }

      // If still no network name, try to detect from TXID format
      if (!networkName) {
        const trimmedTxId = normalizedTxId.trim();
        if (/^[0-9a-fA-F]{64}$/.test(trimmedTxId) && !trimmedTxId.startsWith("0x")) {
          networkName = "TRC20";
        } else if (/^0x[0-9a-fA-F]{64}$/.test(trimmedTxId) || /^[0-9a-fA-F]{64}$/.test(trimmedTxId)) {
          networkName = "BEP20";
        }
      }

      // Default to TRC20 if still unknown
      if (!networkName) {
        networkName = "TRC20";
      }

      console.log(`[USDT Verification] TXID: ${normalizedTxId}, Network: ${networkName}, Address: ${walletAddress ? walletAddress.slice(0, 10) + "..." : "NOT SET"}, Expected Amount: ${effectivePrice}`);

      // 1. Check for duplicate TXID (approved transactions only)
      const duplicateCheck = await checkDuplicateTxId(normalizedTxId!, userId);
      if (duplicateCheck.isDuplicate && duplicateCheck.existingRequest) {
        return NextResponse.json({
          success: false,
          error: `تم استخدام هذا المعرف (TXID) مسبقاً في طلب آخر لـ "${duplicateCheck.existingRequest.packageName}". لا يمكن استخدام نفس المعاملة مرتين.`,
          isDuplicateTxId: true,
        }, { status: 409 });
      }

      // 2. Verify transaction on blockchain
      let verification: BlockchainVerification = { success: false, valid: false, error: "لم يتم إجراء التحقق" };

      if (walletAddress) {
        verification = await verifyUsdtTransaction(normalizedTxId!, networkName, walletAddress, effectivePrice);
        console.log(`[USDT Verification] Result: success=${verification.success}, valid=${verification.valid}, error=${verification.error}`);
      } else {
        console.log("[USDT Verification] Skipped: No wallet address configured");
        verification = {
          success: true,
          valid: false,
          error: "لم يتم تعيين عنوان محفظة USDT للشبكة المحددة. يرجى إضافة عنوان المحفظة في إعدادات الدفع.",
        };
      }

      // 3. Create payment request (with verification data)
      const paymentRequest = await addPaymentRequest({
        id: crypto.randomUUID(),
        userId,
        userName: user.name,
        userEmail: user.email,
        packageId,
        packageName: pkg.name,
        packagePrice: effectivePrice,
        paymentMethod,
        paymentMethodId: paymentMethodId || undefined,
        paymentMethodName: body.paymentMethodName || networkName,
        status: "pending", // Start as pending, will change based on verification
        txId: normalizedTxId || undefined,
        usdtNetwork: networkName,
        blockchainVerified: verification.success,
        blockchainValid: verification.valid,
        blockchainError: verification.error,
        blockchainDetails: verification.details ? JSON.stringify(verification.details) : undefined,
        createdAt: new Date().toISOString(),
      });

      // 4. If verification passed → auto-activate subscription
      if (verification.success && verification.valid) {
        let expiry: Date;

        if (isUpgrade && user.subscriptionExpiry) {
          // Extend from current expiry date
          expiry = new Date(user.subscriptionExpiry);
          expiry.setDate(expiry.getDate() + pkg.durationDays);
        } else {
          // Fresh subscription
          expiry = new Date();
          expiry.setDate(expiry.getDate() + pkg.durationDays);
        }

        await updateUser(userId, {
          subscriptionType: "subscriber",
          subscriptionExpiry: expiry.toISOString(),
          packageId: pkg.id,
          packageName: pkg.name,
          status: "active",
        });

        // Update the payment request status to approved
        await updatePaymentRequest(paymentRequest.id, { status: "approved" });

        // ── Grant referral reward to the referrer (if applicable) ──
        const referralReward = await grantReferralReward(userId, pkg.type);

        let rewardMsg = "";
        if (referralReward.granted) {
          rewardMsg = ` 🎁 حصلت صاحب الدعوة على ${referralReward.days} أيام إضافية!`;
        }

        return NextResponse.json({
          success: true,
          message: isUpgrade
            ? `تم ترقية اشتراكك إلى باقة "${pkg.name}" بنجاح! تم التحقق من المعاملة على البلوكتشين وتم تمديد الاشتراك بـ ${pkg.durationDays} يوم إضافي.${rewardMsg}`
            : `تم تفعيل الاشتراك بنجاح! تم التحقق من الدفع عبر USDT (${networkName}) على البلوكتشين.${rewardMsg}`,
          autoActivated: true,
          blockchainVerified: true,
          blockchainValid: true,
          verificationDetails: verification.details,
          isUpgrade,
          referralReward,
          request: { ...paymentRequest, status: "approved" },
        });
      }

      // 5. Verification failed or API error → keep as pending for admin review
      const isApiError = !verification.success;
      const userMessage = isApiError
        ? `تم إرسال طلب الاشتراك. يتعذر التحقق التلقائي من المعاملة حالياً بسبب مشكلة في الاتصال بالبلوكتشين. سيتم مراجعة طلبك يدوياً من قبل الإدارة.`
        : `تعذر التحقق من المعاملة: ${verification.error}. تم تحويل طلبك للمراجعة اليدوية.`;

      return NextResponse.json({
        success: true,
        message: userMessage,
        autoActivated: false,
        blockchainVerified: verification.success,
        blockchainValid: verification.valid,
        blockchainError: verification.error,
        isUpgrade,
        requiresAdminReview: true,
        request: paymentRequest,
      });
    }

    // ── Local currency: pending review ──
    const paymentRequest = await addPaymentRequest({
      id: crypto.randomUUID(),
      userId,
      userName: user.name,
      userEmail: user.email,
      packageId,
      packageName: pkg.name,
      packagePrice: effectivePrice,
      paymentMethod,
      paymentMethodId: paymentMethodId || undefined,
      paymentMethodName: body.paymentMethodName || undefined,
      status: "pending",
      txId: normalizedTxId || undefined,
      localAmount: localAmount || undefined,
      localCurrencyCode: localCurrencyCode || undefined,
      paymentProofUrl: normalizedProofUrl || undefined,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: isUpgrade
        ? `تم إرسال طلب الترقية لباقة "${pkg.name}". سيتم مراجعة الطلب وتفعيل الترقية بعد القبول.`
        : "تم إرسال طلب الاشتراك. سيتم المراجعة بعد رفع إثبات الدفع.",
      autoActivated: false,
      isUpgrade,
      request: paymentRequest,
    });
  } catch (error) {
    console.error("POST payment error:", error);
    return NextResponse.json({ success: false, error: "خطأ في إنشاء طلب الاشتراك" }, { status: 500 });
  }
}

/**
 * PUT /api/payments
 * - Admin: approve/reject a payment request
 *
 * Body: { requestId, action: "approve" | "reject", rejectReason?, adminId }
 */
export async function PUT(request: NextRequest) {
  try {
    const { requestId, action, rejectReason, adminId } = await request.json();

    if (!requestId || !action) {
      return NextResponse.json({ success: false, error: "معرف الطلب والإجراء مطلوبان" }, { status: 400 });
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, error: "إجراء غير صالح" }, { status: 400 });
    }

    const allReqs = await getPaymentRequests();
    const req = allReqs.find(r => r.id === requestId);

    if (!req) {
      return NextResponse.json({ success: false, error: "الطلب غير موجود" }, { status: 404 });
    }

    if (req.status !== "pending") {
      return NextResponse.json({ success: false, error: "هذا الطلب تم مراجعته مسبقاً" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status: action === "approve" ? "approved" : "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminId || "admin",
    };

    if (action === "reject") {
      updates.rejectReason = rejectReason || "تم رفض الطلب";
    }

    const updated = await updatePaymentRequest(requestId, updates);

    // If approved: activate subscription (with upgrade support)
    if (action === "approve" && updated) {
      const pkg = await getPackageById(req.packageId);
      const user = await getUserById(req.userId);

      if (pkg) {
        let expiry: Date;

        // Check if this is an upgrade (user has active paid subscription)
        const currentPkg = user?.packageId ? await getPackageById(user.packageId) : null;
        const isActivePaid = user?.subscriptionType !== "none"
          && user?.subscriptionExpiry
          && new Date(user.subscriptionExpiry) > new Date()
          && currentPkg?.type === "paid";

        if (isActivePaid && user?.subscriptionExpiry) {
          // Upgrade: extend from current expiry
          expiry = new Date(user.subscriptionExpiry);
          expiry.setDate(expiry.getDate() + pkg.durationDays);
        } else {
          // Fresh subscription
          expiry = new Date();
          expiry.setDate(expiry.getDate() + pkg.durationDays);
        }

        await updateUser(req.userId, {
          subscriptionType: "subscriber",
          subscriptionExpiry: expiry.toISOString(),
          packageId: pkg.id,
          packageName: pkg.name,
          status: "active",
        });

        // ── Grant referral reward (admin-approved payment) ──
        if (pkg.type === "paid") {
          await grantReferralReward(req.userId, pkg.type);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "تم قبول الطلب وتفعيل الاشتراك" : "تم رفض الطلب",
      request: updated,
    });
  } catch (error) {
    console.error("PUT payment error:", error);
    return NextResponse.json({ success: false, error: "خطأ في مراجعة الطلب" }, { status: 500 });
  }
}
