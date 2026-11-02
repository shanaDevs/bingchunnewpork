import type { StoreWithdrawal } from '@prisma/client';
import { prisma } from './prisma';
import { creditPlatformEarning } from './platformEarningsService';
import { refreshWalletCaches } from './walletService';
import { recordJasonSppcExpense } from './jasonBalance';

export async function runWithdrawalApprovalSideEffects(opts: {
  approvedWithdrawal: StoreWithdrawal;
  storeId: string;
  sppcJasonCents: number;
  reviewerId: string;
  breakdownFallback?: unknown;
}): Promise<void> {
  const { approvedWithdrawal, storeId, sppcJasonCents, reviewerId, breakdownFallback } = opts;
  const approvedAt = approvedWithdrawal.reviewedAt ?? new Date();

  await creditPlatformEarning({
    storeWithdrawalId: approvedWithdrawal.id,
    storeId: approvedWithdrawal.storeId,
    breakdown: approvedWithdrawal.breakdown ?? breakdownFallback,
    periodFrom: approvedWithdrawal.periodFrom,
    periodTo: approvedWithdrawal.periodTo,
    approvedAt,
  });

  if (sppcJasonCents > 0) {
    const storeRow = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    await recordJasonSppcExpense({
      storeId,
      storeWithdrawalId: approvedWithdrawal.id,
      amountCents: sppcJasonCents,
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
