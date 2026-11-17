import type { StoreWithdrawal } from '@prisma/client';
import { prisma } from './prisma';
import { creditPlatformEarning } from './platformEarningsService';
import { refreshWalletCaches } from './walletService';
import { recordJasonPayoutApprovalExpenses } from './jasonBalance';
import { jasonNegativeNetPlatformCreditCents } from './jasonPayoutContribution';

export async function runWithdrawalApprovalSideEffects(opts: {
  approvedWithdrawal: StoreWithdrawal;
  storeId: string;
  sppcJasonCents: number;
  reviewerId: string;
  breakdownFallback?: unknown;
}): Promise<void> {
  const { approvedWithdrawal, storeId, sppcJasonCents, reviewerId, breakdownFallback } = opts;
  const approvedAt = approvedWithdrawal.reviewedAt ?? new Date();
  const breakdown = approvedWithdrawal.breakdown ?? breakdownFallback;

  await creditPlatformEarning({
    storeWithdrawalId: approvedWithdrawal.id,
    storeId: approvedWithdrawal.storeId,
    breakdown,
    periodFrom: approvedWithdrawal.periodFrom,
    periodTo: approvedWithdrawal.periodTo,
    approvedAt,
  });

  const negativeNetPlatformCents = jasonNegativeNetPlatformCreditCents(breakdown);
  if (sppcJasonCents > 0 || negativeNetPlatformCents > 0) {
    const storeRow = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    await recordJasonPayoutApprovalExpenses({
      storeId,
      storeWithdrawalId: approvedWithdrawal.id,
      sppcJasonCents,
      negativeNetPlatformCents,
      reviewerId,
      approvedAt,
      branchName: storeRow?.name,
    });
  }

  // Ledger recompute can take tens of seconds on large branches — never block
  // the initiate-payout HTTP response waiting for it (DO/Cloudflare gateway → 504).
  void refreshWalletCaches(storeId).catch((err) => {
    console.error('[withdrawal] refreshWalletCaches failed after approval', {
      storeId,
      withdrawalId: approvedWithdrawal.id,
      err,
    });
  });
}
