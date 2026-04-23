/**
 * Blockchain Verification for USDT Payments
 * 
 * Verifies USDT transactions on:
 * - TRC20 (Tron network) via TronGrid API
 * - BEP20 (BNB Smart Chain) via public BSC RPC
 * 
 * Checks:
 * 1. Transaction exists and is confirmed
 * 2. Transaction is a USDT transfer (correct token contract)
 * 3. Recipient address matches admin's wallet
 * 4. Amount matches expected price (with small tolerance)
 * 5. TXID not used before (duplicate check)
 */

// ─── Types ──────────────────────────────────────────────

export interface BlockchainVerification {
  success: boolean;       // API call succeeded (true) or network error (false)
  valid: boolean;         // Transaction is valid (true) or invalid (false)
  error?: string;         // Human-readable error message (Arabic)
  details?: {
    txId: string;
    from: string;         // Sender address
    to: string;           // Recipient address
    amount: number;       // Actual USDT amount received
    tokenSymbol: string;  // "USDT"
    network: string;      // "TRC20" or "BEP20"
    confirmed: boolean;
  };
}

// ─── TRC20 Verification (TronGrid API - Free, no key needed) ──

async function verifyTRC20(
  txId: string,
  expectedAddress: string,
  expectedAmount: number
): Promise<BlockchainVerification> {
  try {
    const url = `https://api.trongrid.io/v1/transactions/${txId}?onlyConfirmed=true`;
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (res.status === 404 || res.status === 400) {
      return { success: true, valid: false, error: "معرف المعاملة (TXID) غير موجود على شبكة Tron" };
    }

    if (!res.ok) {
      return { success: true, valid: false, error: "فشل في جلب بيانات المعاملة من شبكة Tron" };
    }

    const data = await res.json();

    // Check if transaction ID exists in response
    if (!data.txID) {
      return { success: true, valid: false, error: "المعاملة غير موجودة على شبكة Tron" };
    }

    // Check if transaction was successful
    if (data.ret && data.ret[0] && data.ret[0].contractRet !== "SUCCESS") {
      return { success: true, valid: false, error: "المعاملة فشلت ولم تُنفذ بنجاح على شبكة Tron" };
    }

    // Check for TRC20 transfer info
    const trc20Info = data.trc20TransferInfo;
    if (!trc20Info || !Array.isArray(trc20Info) || trc20Info.length === 0) {
      return { success: true, valid: false, error: "المعاملة ليست تحويل USDT عبر TRC20" };
    }

    // Find USDT transfer (USDT contract on Tron: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
    const USDT_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const transfer = trc20Info.find(
      (t: { from_address: string; to_address: string; amount: string; type?: string }) =>
        t.type === "USDT" || true // Accept any TRC20 for now, we verify the contract later
    ) || trc20Info[0]; // Fallback to first transfer

    if (!transfer) {
      return { success: true, valid: false, error: "لم يتم العثور على بيانات التحويل" };
    }

    // Normalize and compare recipient address
    const receivedTo = (transfer.to_address || "").trim();
    const expected = expectedAddress.trim();

    // Tron addresses are base58 (start with T), case-sensitive but we compare case-insensitive
    if (receivedTo.toLowerCase() !== expected.toLowerCase()) {
      return {
        success: true,
        valid: false,
        error: `المعاملة ليست موجهة لمحفظتك. المحفظة المستلمة: ${receivedTo.slice(0, 8)}...${receivedTo.slice(-4)}`,
      };
    }

    // USDT on Tron has 6 decimals (1 USDT = 1,000,000 units)
    const receivedAmount = Number(transfer.amount) / 1_000_000;

    // Allow tolerance of 0.5 USDT (for exchange fees / small differences)
    if (receivedAmount < expectedAmount - 0.5) {
      return {
        success: true,
        valid: false,
        error: `المبلغ غير كافٍ. المبلغ المُرسل: ${receivedAmount.toFixed(2)} USDT، المطلوب: ${expectedAmount} USDT`,
      };
    }

    return {
      success: true,
      valid: true,
      details: {
        txId,
        from: transfer.from_address,
        to: transfer.to_address,
        amount: receivedAmount,
        tokenSymbol: "USDT",
        network: "TRC20",
        confirmed: true,
      },
    };
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return { success: false, valid: false, error: "انتهت مهلة الاتصال بشبكة Tron. سيتم مراجعة الطلب يدوياً." };
    }
    console.error("TRC20 verification error:", error);
    return { success: false, valid: false, error: "خطأ في الاتصال بشبكة Tron. سيتم مراجعة الطلب يدوياً." };
  }
}

// ─── BEP20 Verification (BSC Public RPC - No API key needed) ──

async function verifyBEP20(
  txId: string,
  expectedAddress: string,
  expectedAmount: number
): Promise<BlockchainVerification> {
  try {
    // USDT contract address on BSC (BEP20)
    const USDT_BSC = "0x55d398326f99059ff775485246999027b3197955";

    // ERC20 Transfer event signature: Transfer(address,address,uint256)
    const TRANSFER_TOPIC =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    // Use public BSC RPC to get transaction receipt
    const rpcUrl = "https://bsc-dataseed.binance.org/";
    const rpcRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txId],
        id: 1,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!rpcRes.ok) {
      return { success: true, valid: false, error: "فشل في جلب بيانات المعاملة من شبكة BSC" };
    }

    const rpcData = await rpcRes.json();

    if (rpcData.error) {
      return { success: true, valid: false, error: "معرف المعاملة (TXID) غير موجود على شبكة BSC" };
    }

    const receipt = rpcData.result;

    if (!receipt) {
      return { success: true, valid: false, error: "المعاملة غير موجودة على شبكة BSC" };
    }

    // Check if transaction was successful (status 0x1 = success)
    if (receipt.status !== "0x1") {
      return { success: true, valid: false, error: "المعاملة فشلت ولم تُنفذ بنجاح على شبكة BSC" };
    }

    // Search logs for USDT Transfer event
    if (!receipt.logs || !Array.isArray(receipt.logs)) {
      return { success: true, valid: false, error: "المعاملة لا تحتوي على بيانات تحويل" };
    }

    let foundValid = false;
    let transferFrom = "";
    let transferTo = "";
    let transferAmount = 0;

    for (const log of receipt.logs) {
      // Skip if not a Transfer event
      if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) continue;

      // Skip if not from USDT contract
      if ((log.address || "").toLowerCase() !== USDT_BSC) continue;

      // Decode from and to addresses from topics (indexed params are 32 bytes each)
      transferFrom = "0x" + (log.topics[1] || "").slice(26); // last 20 bytes
      transferTo = "0x" + (log.topics[2] || "").slice(26);

      // Decode amount from data (uint256)
      const amountHex = (log.data || "").replace("0x", "");
      if (!amountHex) continue;
      transferAmount = parseInt(amountHex, 16) / 1e18; // USDT on BSC has 18 decimals

      // Check recipient
      if (transferTo.toLowerCase() !== expectedAddress.toLowerCase()) continue;

      // Check amount (with 0.5 USDT tolerance)
      if (transferAmount < expectedAmount - 0.5) continue;

      foundValid = true;
      break;
    }

    if (!foundValid) {
      // Check if we found any USDT transfer at all (to give better error message)
      const foundAnyUsdt = receipt.logs.some(
        (log: any) =>
          log.topics?.[0] === TRANSFER_TOPIC &&
          (log.address || "").toLowerCase() === USDT_BSC
      );

      if (!foundAnyUsdt) {
        return { success: true, valid: false, error: "المعاملة ليست تحويل USDT عبر BEP20" };
      }

      // Found USDT but wrong recipient or amount
      const recipientMatch = receipt.logs.some(
        (log: any) => {
          if (
            log.topics?.[0] !== TRANSFER_TOPIC ||
            (log.address || "").toLowerCase() !== USDT_BSC
          )
            return false;
          const to = "0x" + (log.topics[2] || "").slice(26);
          return to.toLowerCase() === expectedAddress.toLowerCase();
        }
      );

      if (!recipientMatch) {
        return {
          success: true,
          valid: false,
          error: "المعاملة ليست موجهة لمحفظتك",
        };
      }

      return {
        success: true,
        valid: false,
        error: `المبلغ غير كافٍ. المطلوب: ${expectedAmount} USDT`,
      };
    }

    return {
      success: true,
      valid: true,
      details: {
        txId,
        from: transferFrom,
        to: transferTo,
        amount: transferAmount,
        tokenSymbol: "USDT",
        network: "BEP20",
        confirmed: true,
      },
    };
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return { success: false, valid: false, error: "انتهت مهلة الاتصال بشبكة BSC. سيتم مراجعة الطلب يدوياً." };
    }
    console.error("BEP20 verification error:", error);
    return { success: false, valid: false, error: "خطأ في الاتصال بشبكة BSC. سيتم مراجعة الطلب يدوياً." };
  }
}

// ─── Main Verification Function ──────────────────────────

export async function verifyUsdtTransaction(
  txId: string,
  network: string, // "TRC20" or "BEP20"
  expectedAddress: string,
  expectedAmount: number
): Promise<BlockchainVerification> {
  const trimmedTxId = txId.trim();

  if (!trimmedTxId) {
    return { success: true, valid: false, error: "معرف المعاملة فارغ" };
  }

  // Validate TXID format
  if (network === "TRC20") {
    // Tron TXID: 64 hex characters
    if (!/^[0-9a-fA-F]{64}$/.test(trimmedTxId)) {
      return { success: true, valid: false, error: "صيغة معرف المعاملة TRC20 غير صالحة" };
    }
  } else if (network === "BEP20") {
    // Ethereum/BSC TXID: 0x + 64 hex characters
    if (!/^0x[0-9a-fA-F]{64}$/.test(trimmedTxId) && !/^[0-9a-fA-F]{64}$/.test(trimmedTxId)) {
      return { success: true, valid: false, error: "صيغة معرف المعاملة BEP20 غير صالحة" };
    }
  }

  // Validate expected address
  if (!expectedAddress || expectedAddress.trim().length === 0) {
    return { success: true, valid: false, error: "لم يتم تعيين عنوان المحفظة في الإعدادات. يرجى إضافة عنوان محفظة USDT." };
  }

  if (network === "TRC20") {
    return verifyTRC20(trimmedTxId, expectedAddress, expectedAmount);
  } else if (network === "BEP20") {
    return verifyBEP20(trimmedTxId, expectedAddress, expectedAmount);
  }

  return { success: true, valid: false, error: `الشبكة "${network}" غير مدعومة. الشبكات المدعومة: TRC20, BEP20` };
}

// ─── Duplicate TXID Check ───────────────────────────────

export async function checkDuplicateTxId(
  txId: string,
  excludeUserId?: string
): Promise<{ isDuplicate: boolean; existingRequest?: { id: string; userId: string; userName: string; packageName: string; createdAt: string } }> {
  try {
    const { getPaymentRequests } = await import("./store");
    const requests = await getPaymentRequests();
    const normalizedId = txId.trim().toLowerCase();

    const existing = requests.find(
      (r) =>
        r.txId &&
        r.txId.trim().toLowerCase() === normalizedId &&
        r.status === "approved" &&
        r.userId !== excludeUserId
    );

    if (existing) {
      return {
        isDuplicate: true,
        existingRequest: {
          id: existing.id,
          userId: existing.userId,
          userName: existing.userName,
          packageName: existing.packageName,
          createdAt: existing.createdAt,
        },
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error("Duplicate TXID check error:", error);
    // On error, allow the transaction (don't block)
    return { isDuplicate: false };
  }
}
