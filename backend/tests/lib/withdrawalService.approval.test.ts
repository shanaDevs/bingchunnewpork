import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/platformEarningsService', () => ({
  creditPlatformEarning: vi.fn(),
}));

vi.mock('../../src/lib/platformEarningsSchema', () => ({
  ensurePlatformEarningsSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/jasonBalance', () => ({
  computeJasonNetBalance: vi.fn().mockResolvedValue(1_000_000),
  assertJasonBalanceCoversContribution: vi.fn(),
  recordJasonSppcExpense: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    storeWithdrawal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    storeWallet: {
      update: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
    },
    promotionUsage: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/walletService', () => ({
  computeBreakdownForPeriod: vi.fn(),
  getOrCreateWallet: vi.fn(),
  getWalletSummary: vi.fn(),
  refreshWalletCaches: vi.fn(),
}));

vi.mock('../../src/lib/sharedPromoContribution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/sharedPromoContribution')>();
  return {
    ...actual,
    computeSharedPromoContribution: vi.fn().mockResolvedValue({}),
    mergeSharedPromoIntoBreakdown: (breakdown: Record<string, unknown>, shared: Record<string, unknown>) => ({
      ...breakdown,
      ...shared,
    }),
  };
});

vi.mock('../../src/lib/promoOwnershipTotals', () => ({
  loadPromoOwnershipTotalsForPeriod: vi.fn().mockResolvedValue({}),
  attachPromoOwnershipTotals: (breakdown: Record<string, unknown>) => breakdown,
}));

vi.mock('../../src/lib/walletTransactionInsert', () => ({
  insertWalletLedgerRow: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { insertWalletLedgerRow } from '../../src/lib/walletTransactionInsert';
import { computeBreakdownForPeriod, getOrCreateWallet, getWalletSummary } from '../../src/lib/walletService';
import { approveWithdrawal } from '../../src/lib/withdrawalService';

const asMock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const STORE_ID = 'store-approval-1';
const WITHDRAWAL_ID = 'wd-approval-1';
const REVIEWER_ID = 'admin-1';
const REQUESTER_ID = 'branch-mgr-1';

const baseBreakdown = {
  sharedPromoJasonContributionAmount: 5_000,
  finalPayoutAmount: 55_000,
};

const approvedWithdrawalRow = {
  id: WITHDRAWAL_ID,
  storeId: STORE_ID,
  amount: 50_000,
  status: 'APPROVED',
  breakdown: baseBreakdown,
  periodFrom: new Date('2026-07-01T00:00:00.000Z'),
  periodTo: new Date('2026-07-15T23:59:59.999Z'),
  reviewedAt: new Date('2026-07-16T10:00:00.000Z'),
};

function mockApprovalTransaction(
  walletTransactionCreate = vi.fn(),
  claimedCount = 1,
  lockedWithdrawalStatus: 'PENDING' | 'APPROVED' = 'PENDING',
) {
  asMock(prisma.$transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: WITHDRAWAL_ID, status: lockedWithdrawalStatus }])
        .mockResolvedValueOnce([{ balance: 100_000, totalWithdrawn: 20_000 }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      storeWallet: { update: vi.fn() },
      walletTransaction: { create: walletTransactionCreate },
      storeWithdrawal: {
        update: vi.fn().mockResolvedValue(approvedWithdrawalRow),
        updateMany: vi.fn().mockResolvedValue({ count: claimedCount }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(approvedWithdrawalRow),
      },
    }),
  );
  return walletTransactionCreate;
}

function mockLivePeriodNet(netAmount: number) {
  asMock(computeBreakdownForPeriod).mockResolvedValue({
    grossAmount: netAmount,
    onlineWalletGross: netAmount,
    deliveryFee: 0,
    commissionFee: 0,
    gatewayFee: 0,
    gatewayBase: 0,
    convenienceFee: 0,
    netAmount,
    orderCount: 1,
  });
}

describe('approveWithdrawal — FIN-003 SPPC ledger consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLivePeriodNet(100_000);

    asMock(getOrCreateWallet).mockResolvedValue({
      id: 'wallet-1',
      storeId: STORE_ID,
      balance: 100_000,
      totalEarnings: 200_000,
      totalWithdrawn: 20_000,
    });

    asMock(getWalletSummary).mockResolvedValue({
      storeId: STORE_ID,
      currentBalance: 100_000,
      totalEarnings: 200_000,
      grossLedgerCredits: 200_000,
      netTransferableEarnings: 120_000,
      totalWithdrawn: 20_000,
      pendingWithdrawalTotal: 50_000,
      availableBalance: 50_000,
    });

    asMock(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: WITHDRAWAL_ID,
      storeId: STORE_ID,
      amount: 50_000,
      status: 'PENDING',
      remarks: 'July payout',
      breakdown: baseBreakdown,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      requestedById: REQUESTER_ID,
      isAdvance: false,
    });

    mockApprovalTransaction();
  });

  it('creates ADJUSTMENT then PAYOUT with a self-consistent balanceAfter chain when SPPC > 0', async () => {
    mockApprovalTransaction();

    await approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', '/proof.pdf');

    expect(insertWalletLedgerRow).toHaveBeenCalledTimes(2);
    expect(asMock(insertWalletLedgerRow).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        type: 'ADJUSTMENT',
        amountCents: 5_000,
        balanceAfterCents: 55_000,
      }),
    );
    expect(asMock(insertWalletLedgerRow).mock.calls[1][1]).toEqual(
      expect.objectContaining({
        type: 'PAYOUT',
        amountCents: -55_000,
        balanceAfterCents: 50_000,
      }),
    );
  });
});

describe('approveWithdrawal — FIN-008 individual amount validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLivePeriodNet(100_000);
    asMock(getOrCreateWallet).mockResolvedValue({
      id: 'wallet-1',
      storeId: STORE_ID,
      balance: 100_000,
      totalEarnings: 200_000,
      totalWithdrawn: 20_000,
    });
    asMock(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: WITHDRAWAL_ID,
      storeId: STORE_ID,
      amount: 80_000,
      status: 'PENDING',
      remarks: null,
      breakdown: { sharedPromoJasonContributionAmount: 0, finalPayoutAmount: 80_000 },
      periodFrom: null,
      periodTo: null,
      requestedById: REQUESTER_ID,
      isAdvance: false,
    });
  });

  it('rejects when remainingNet is less than the withdrawal amount being approved', async () => {
    asMock(getWalletSummary).mockResolvedValue({
      storeId: STORE_ID,
      currentBalance: 100_000,
      totalEarnings: 200_000,
      grossLedgerCredits: 200_000,
      netTransferableEarnings: 90_000,
      totalWithdrawn: 20_000,
      pendingWithdrawalTotal: 100_000,
      availableBalance: 0,
    });

    await expect(
      approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', null),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Insufficient net transferable balance to approve this withdrawal',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('approveWithdrawal — concurrent claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLivePeriodNet(100_000);
    asMock(getOrCreateWallet).mockResolvedValue({
      id: 'wallet-1',
      storeId: STORE_ID,
      balance: 100_000,
      totalEarnings: 200_000,
      totalWithdrawn: 20_000,
    });
    asMock(getWalletSummary).mockResolvedValue({
      storeId: STORE_ID,
      currentBalance: 100_000,
      totalEarnings: 200_000,
      grossLedgerCredits: 200_000,
      netTransferableEarnings: 120_000,
      totalWithdrawn: 20_000,
      pendingWithdrawalTotal: 50_000,
      availableBalance: 50_000,
    });
    asMock(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: WITHDRAWAL_ID,
      storeId: STORE_ID,
      amount: 50_000,
      status: 'PENDING',
      remarks: 'July payout',
      breakdown: baseBreakdown,
      periodFrom: null,
      periodTo: null,
      requestedById: REQUESTER_ID,
      isAdvance: false,
    });
  });

  it('aborts when the pending row was already claimed', async () => {
    mockApprovalTransaction(vi.fn(), 0);
    await expect(
      approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('aborts with 409 when the locked withdrawal row is not PENDING', async () => {
    mockApprovalTransaction(vi.fn(), 1, 'APPROVED');
    await expect(
      approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', null),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Only pending withdrawals can be approved',
    });
  });
});

describe('approveWithdrawal — live period net and dual control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLivePeriodNet(40_000);
    asMock(getOrCreateWallet).mockResolvedValue({
      id: 'wallet-1',
      storeId: STORE_ID,
      balance: 100_000,
      totalEarnings: 200_000,
      totalWithdrawn: 20_000,
    });
    asMock(getWalletSummary).mockResolvedValue({
      storeId: STORE_ID,
      currentBalance: 100_000,
      totalEarnings: 200_000,
      grossLedgerCredits: 200_000,
      netTransferableEarnings: 120_000,
      totalWithdrawn: 20_000,
      pendingWithdrawalTotal: 50_000,
      availableBalance: 50_000,
    });
    asMock(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: WITHDRAWAL_ID,
      storeId: STORE_ID,
      amount: 50_000,
      status: 'PENDING',
      remarks: null,
      breakdown: baseBreakdown,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      requestedById: REQUESTER_ID,
      isAdvance: false,
    });
  });

  it('rejects when live period net is below the withdrawal amount', async () => {
    await expect(
      approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', null),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Live net for this period is lower than the requested amount. Reject and request again.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('forbids approving a withdrawal the reviewer requested', async () => {
    mockLivePeriodNet(100_000);
    asMock(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: WITHDRAWAL_ID,
      storeId: STORE_ID,
      amount: 50_000,
      status: 'PENDING',
      remarks: null,
      breakdown: baseBreakdown,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-15T23:59:59.999Z'),
      requestedById: REVIEWER_ID,
      isAdvance: false,
    });

    await expect(
      approveWithdrawal(WITHDRAWAL_ID, REVIEWER_ID, 'BANK_TRANSFER', null),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You cannot approve a withdrawal you requested',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
