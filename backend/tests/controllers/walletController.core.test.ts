import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  getPrismaFanOutLimit: () => 3,
  prisma: {
    store: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    storeWallet: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    walletTransaction: {
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    storeWithdrawal: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../src/lib/walletSchema', () => ({
  ensureWalletSettlementColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/verifyAdminPin', () => ({
  verifyAdminPin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/withdrawalSchema', () => ({
  ensureWithdrawalSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../../src/lib/walletService', () => ({
  getOrCreateWallet: vi.fn(),
  getPendingWithdrawalTotal: vi.fn(),
  computeNetTransferableEarnings: vi.fn(),
  enrichWalletRow: vi.fn((wallet, pending, net) => ({
    ...wallet,
    pendingWithdrawalTotal: pending,
    netTransferableEarnings: net ?? wallet.totalEarnings,
    currentBalance: wallet.balance,
    availableBalance: Math.max(0, (net ?? wallet.totalEarnings) - wallet.totalWithdrawn - pending),
  })),
  getWalletSummary: vi.fn(),
  computeBreakdownForPeriod: vi.fn(),
  getSuperAdminWalletDashboard: vi.fn().mockResolvedValue(null),
  getBranchWalletDashboard: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/walletSync', () => ({
  recalculateWalletBalance: vi.fn().mockResolvedValue(0),
  syncMissingWalletPayments: vi.fn(),
}));

vi.mock('../../src/lib/settlementWithdrawalQuery', () => ({
  listWithdrawalsUnsettledForDartCodes: vi.fn(),
  withdrawalHasDartCodesSettlement: vi.fn(),
}));

vi.mock('../../src/lib/periodChannelPreview', () => ({
  buildPeriodChannelPreview: vi.fn(),
}));

vi.mock('../../src/lib/withdrawalInvoice', () => ({
  buildInvoiceChannelSummary: vi.fn(),
  generateWithdrawalInvoice: vi.fn(),
  parseInvoicePeriodBreakdown: vi.fn(),
}));

vi.mock('../../src/lib/withdrawalService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/withdrawalService')>();
  return {
    ...actual,
    approveWithdrawal: vi.fn(),
    cancelWithdrawal: vi.fn(),
    createApprovedWithdrawalRecord: vi.fn().mockResolvedValue(undefined),
    getNextPayoutStartDate: vi.fn(),
    initiateAndApproveWithdrawal: vi.fn(),
    listWithdrawals: vi.fn(),
    rejectWithdrawal: vi.fn(),
    requestWithdrawal: vi.fn(),
  };
});

vi.mock('../../src/lib/appSchema', () => ({
  getConvenientFeeRate: vi.fn().mockResolvedValue(0.065),
}));

vi.mock('../../src/middleware/upload', () => ({
  settlementReceiptPublicPath: vi.fn(
    (storeId: string, filename: string) => `/uploads/${storeId}/${filename}`,
  ),
}));

import {
  adjustWallet,
  creditWalletAddonPayment,
  creditWalletForOrder,
  getSettleInfo,
  getSettlePreview,
  getWallet,
  getWalletSummaryHandler,
  getWalletTransactions,
  listWallets,
  settleWallet,
  syncWallets,
} from '../../src/controllers/walletController';
import { prisma } from '../../src/lib/prisma';
import {
  computeNetTransferableEarnings,
  getBranchWalletDashboard,
  getOrCreateWallet,
  getPendingWithdrawalTotal,
  getWalletSummary,
} from '../../src/lib/walletService';
import { syncMissingWalletPayments, recalculateWalletBalance } from '../../src/lib/walletSync';
import { createApprovedWithdrawalRecord } from '../../src/lib/withdrawalService';
import { resolveBranchStoreId } from '../../src/middleware/auth';
import { centsApi } from '../helpers/moneyExpect';

const walletRow = {
  id: 'wallet-1',
  storeId: 'store-1',
  balance: 50_000,
  totalEarnings: 80_000,
  totalWithdrawn: 10_000,
  lastSettledAt: null as Date | null,
  store: { id: 'store-1', name: 'Nugegoda', city: 'Colombo', isActive: true },
};

describe('listWallets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(getOrCreateWallet).mockResolvedValue(walletRow as never);
    vi.mocked(getPendingWithdrawalTotal).mockResolvedValue(0);
    vi.mocked(computeNetTransferableEarnings).mockResolvedValue(70_000);
    vi.mocked(getWalletSummary).mockResolvedValue({
      storeId: 'store-1',
      currentBalance: 50_000,
      totalEarnings: 80_000,
      netTransferableEarnings: 70_000,
      totalWithdrawn: 10_000,
      pendingWithdrawalTotal: 0,
      availableBalance: 60_000,
    });
  });

  it('lists all wallets with system totals for SYSTEM_ADMIN', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Nugegoda', city: 'Colombo', isActive: true },
    ] as never);
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([walletRow] as never);
    vi.mocked(prisma.walletTransaction.count).mockResolvedValue(12);
    vi.mocked(prisma.walletTransaction.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 100_000 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: -20_000 } } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listWallets(req, res);

    expect(getOrCreateWallet).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          wallets: expect.any(Array),
          systemTotals: {
            totalIn: centsApi(100_000),
            totalOut: centsApi(20_000),
            totalBalance: centsApi(50_000),
          },
          summary: null,
          periodBranchReports: null,
        }),
      }),
    );
  });

  it('includes periodBranchReports when from and to query params are set', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Nugegoda', city: 'Colombo', isActive: true },
    ] as never);
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([walletRow] as never);
    vi.mocked(prisma.walletTransaction.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 100_000 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: -20_000 } } as never);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      {
        storeId: 'store-1',
        orderMode: 'TAKEAWAY',
        paymentMethod: 'CARD',
        _sum: { total: 100 },
      },
    ] as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-10-01', to: '2026-10-15' },
    });
    const res = createMockRes();

    await listWallets(req, res);

    expect(prisma.order.groupBy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          periodBranchReports: [
            expect.objectContaining({
              storeId: 'store-1',
              totalIn: 10_000,
            }),
          ],
        }),
      }),
    );
  });

  it('scopes to the branch store and includes a summary for branch admins', async () => {
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Nugegoda', city: 'Colombo', isActive: true },
    ] as never);
    vi.mocked(prisma.storeWallet.findMany).mockResolvedValue([walletRow] as never);
    vi.mocked(prisma.walletTransaction.count).mockResolvedValue(3);

    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await listWallets(req, res);

    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'store-1' } }),
    );
    expect(getWalletSummary).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          systemTotals: null,
          summary: expect.objectContaining({ storeId: 'store-1' }),
        }),
      }),
    );
  });
});

describe('getWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(getOrCreateWallet).mockResolvedValue(walletRow as never);
    vi.mocked(getPendingWithdrawalTotal).mockResolvedValue(2_000);
    vi.mocked(computeNetTransferableEarnings).mockResolvedValue(70_000);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      id: 'store-1',
      name: 'Nugegoda',
      city: 'Colombo',
      addressLine: 'Main St',
      phone: '0112223333',
    } as never);
  });

  it('returns the enriched wallet and store for a system admin', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getWallet(req, res);

    expect(getBranchWalletDashboard).toHaveBeenCalledWith('store-1', undefined);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          storeId: 'store-1',
          store: expect.objectContaining({ name: 'Nugegoda' }),
          dashboard: null,
        }),
      }),
    );
  });

  it('forbids a branch admin from reading another store wallet', async () => {
    const req = createMockReq({
      params: { storeId: 'store-2' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await expect(getWallet(req, res)).rejects.toMatchObject({
      message: 'Forbidden',
      statusCode: 403,
    });
  });
});

describe('getWalletSummaryHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(getWalletSummary).mockResolvedValue({
      storeId: 'store-1',
      currentBalance: 1,
      totalEarnings: 2,
      netTransferableEarnings: 3,
      totalWithdrawn: 0,
      pendingWithdrawalTotal: 0,
      availableBalance: 3,
    });
  });

  it('requires storeId for system admins', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await expect(getWalletSummaryHandler(req, res)).rejects.toMatchObject({
      message: 'storeId is required',
      statusCode: 400,
    });
  });

  it('returns the summary for the requested store', async () => {
    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getWalletSummaryHandler(req, res);

    expect(getWalletSummary).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ storeId: 'store-1', availableBalance: '3' }),
    });
  });

  it('uses the branch store for store managers even without query storeId', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getWalletSummaryHandler(req, res);

    expect(getWalletSummary).toHaveBeenCalledWith('store-1');
  });
});

describe('getWalletTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      {
        id: 'txn-1',
        amount: 1500,
        type: 'ORDER_PAYMENT',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
      {
        id: 'txn-2',
        amount: -500,
        type: 'PAYOUT',
        createdAt: new Date('2026-07-02T10:00:00.000Z'),
      },
    ] as never);
    vi.mocked(prisma.walletTransaction.count).mockResolvedValue(2);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { total: 15, orderMode: 'DELIVERY', paymentMethod: 'PAYHERE' },
    ] as never);
    vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValue({
      _sum: { amount: -500 },
    } as never);
  });

  it('maps transaction direction and returns revenue summary', async () => {
    vi.mocked(prisma.walletTransaction.aggregate).mockReset();
    vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValue({
      _sum: { amount: -500 },
    } as never);

    const req = createMockReq({
      params: { storeId: 'store-1' },
      query: { page: '1', limit: '20' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getWalletTransactions(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          transactions: [
            expect.objectContaining({ id: 'txn-1', direction: 'IN' }),
            expect.objectContaining({ id: 'txn-2', direction: 'OUT' }),
          ],
          pagination: expect.objectContaining({ page: 1, limit: 20, total: 2, pages: 1 }),
          summary: expect.objectContaining({
            totalIn: 1500,
            totalOut: '500',
          }),
        }),
      }),
    );
  });

  it('filters OUT direction transactions by negative amount', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      query: { direction: 'OUT', type: 'PAYOUT' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getWalletTransactions(req, res);

    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          type: 'PAYOUT',
          amount: { lt: 0 },
        }),
      }),
    );
  });
});

describe('adjustWallet', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateWallet).mockResolvedValue(walletRow as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      if (typeof fn !== 'function') return fn;
      return fn({
        $queryRaw: vi.fn().mockResolvedValue([{ balance: 50_000 }]),
        storeWallet: {
          update: vi.fn().mockResolvedValue({ ...walletRow, balance: 60_000 }),
        },
        walletTransaction: {
          create: vi.fn().mockResolvedValue({ id: 'txn-adj', amount: 10_000, type: 'ADJUSTMENT' }),
        },
      });
    });
    vi.mocked(recalculateWalletBalance).mockResolvedValue(60_000);
  });

  it('rejects non-system admins', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { type: 'CREDIT', amount: 1000, description: 'x', password: 'pin' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await adjustWallet(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Forbidden',
      statusCode: 403,
    }));
  });

  it('credits the wallet for CREDIT adjustments', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { type: 'CREDIT', amount: 10_000, description: 'Manual top-up', password: 'pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await adjustWallet(req, res, next);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(recalculateWalletBalance).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          wallet: expect.objectContaining({ balance: centsApi(60_000) }),
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid adjustment payloads via zod', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { type: 'CREDIT', amount: -5, description: 'x', password: 'pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await adjustWallet(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('settleWallet flow', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateWallet).mockResolvedValue({
      ...walletRow,
      lastSettledAt: new Date('2026-06-30T23:59:59.999Z'),
    } as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: 'store-1' } as never);
  });

  it('returns settle-info suggestions for system admins', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue({
      id: 'txn-old',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
    } as never);
    vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValue({
      _sum: { amount: 12_000 },
    } as never);

    const req = createMockReq({
      params: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getSettleInfo(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          minFromDate: '2026-07-01',
          suggestedFrom: '2026-07-01',
          unsettledBalance: 12_000,
          currentBalance: 50_000,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('forbids settle-info for branch managers', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getSettleInfo(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });

  it('rejects settle preview when the range starts before last settled date', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      query: { from: '2026-06-15', to: '2026-06-20' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getSettlePreview(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toMatch(
      /Settlement range must start after the last settled date/,
    );
  });

  it('previews unsettled amount for a valid range', async () => {
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      { id: 'p1', amount: 1000 },
      { id: 'p2', amount: 2500 },
    ] as never);

    const req = createMockReq({
      params: { storeId: 'store-1' },
      query: { from: '2026-07-01', to: '2026-07-10' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getSettlePreview(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { from: '2026-07-01', to: '2026-07-10', amount: '3500', orderCount: 2 },
    });
  });

  it('rejects settling when there are no unsettled payments in range', async () => {
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([]);

    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { from: '2026-07-01', to: '2026-07-10', password: 'pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await settleWallet(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'No unsettled payments in the selected date range',
    );
  });

  it('settles unsettled order payments and creates an approved withdrawal record', async () => {
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      { id: 'p1', amount: 1000 },
      { id: 'p2', amount: 500 },
    ] as never);
    const updatedWallet = { ...walletRow, balance: 48_500, totalWithdrawn: 11_500 };
    const payoutTxn = {
      id: expect.any(String),
      type: 'PAYOUT',
      amount: -1500,
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'wallet-1', balance: 50_000 }]),
        walletTransaction: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          create: vi.fn().mockResolvedValue(payoutTxn),
        },
        storeWallet: {
          update: vi.fn().mockResolvedValue(updatedWallet),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updatedWallet),
        },
      };
      return fn(tx);
    });
    vi.mocked(prisma.walletTransaction.findUniqueOrThrow).mockResolvedValue({
      id: 'settle-txn',
      type: 'PAYOUT',
      amount: -1500,
    } as never);

    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { from: '2026-07-01', to: '2026-07-10', description: 'July settle', password: 'pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await settleWallet(req, res, next);

    expect(createApprovedWithdrawalRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        amount: 1500,
        remarks: 'July settle',
        requestedById: 'admin-1',
        reviewedById: 'admin-1',
      }),
      expect.anything(),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          settledAmount: '1500',
          orderCount: 2,
          from: '2026-07-01',
          to: '2026-07-10',
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects settle when from is after to', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: { from: '2026-07-10', to: '2026-07-01', password: 'pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await settleWallet(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Start date must be on or before end date',
    );
  });
});

describe('creditWalletForOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateWallet).mockResolvedValue(walletRow as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(recalculateWalletBalance).mockResolvedValue(0);
  });

  it('no-ops for non-online payment methods', async () => {
    await creditWalletForOrder('order-1', 'store-1', 1500, 'CASH_AT_COUNTER');

    expect(prisma.walletTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent when an ORDER_PAYMENT txn already exists', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue({ id: 'existing' } as never);

    await creditWalletForOrder('order-1', 'store-1', 1500, 'PAYHERE');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credits cents for a new online payment', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      orderNumber: 'BC1',
      subtotal: 1000,
      deliveryFee: 150,
      discount: 0,
      loyaltyDiscount: 0,
      paymentRef: 'pay_1',
      orderMode: 'DELIVERY',
    } as never);

    await creditWalletForOrder('order-1', 'store-1', 1500, 'CARD');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(recalculateWalletBalance).toHaveBeenCalledWith('store-1');
  });
});

describe('creditWalletAddonPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateWallet).mockResolvedValue(walletRow as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(recalculateWalletBalance).mockResolvedValue(0);
  });

  it('no-ops for non-positive amounts', async () => {
    await creditWalletAddonPayment('order-1', 'store-1', 0);
    expect(prisma.walletTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('is idempotent when an addon payment already exists', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue({ id: 'addon' } as never);
    await creditWalletAddonPayment('order-1', 'store-1', 200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credits addon cash collected at counter', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ orderNumber: 'BC1' } as never);

    await creditWalletAddonPayment('order-1', 'store-1', 200, 'CASH_AT_COUNTER');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(recalculateWalletBalance).toHaveBeenCalledWith('store-1');
  });
});

describe('syncWallets', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
  });

  it('runs a full sync for system admins', async () => {
    vi.mocked(syncMissingWalletPayments).mockResolvedValue({
      ordersAdded: 2,
      storesTouched: 1,
    } as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await syncWallets(req, res, next);

    expect(syncMissingWalletPayments).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Synced 2 paid order(s) to wallet',
      }),
    );
  });

  it('scopes sync to the branch store for managers', async () => {
    vi.mocked(syncMissingWalletPayments).mockResolvedValue({
      ordersAdded: 0,
      storesTouched: 0,
    } as never);

    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await syncWallets(req, res, next);

    expect(syncMissingWalletPayments).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Wallet is already up to date',
      }),
    );
  });

  it('forbids branch users without a linked store', async () => {
    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: undefined },
    });
    const res = createMockRes();

    await syncWallets(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });
});
