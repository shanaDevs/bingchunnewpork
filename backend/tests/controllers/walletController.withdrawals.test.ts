import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  getPrismaFanOutLimit: vi.fn(() => 4),
  prisma: {
    store: { findUnique: vi.fn(), findMany: vi.fn() },
    storeWallet: { findMany: vi.fn() },
    storeWithdrawal: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    walletTransaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    order: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    promotionUsage: { findMany: vi.fn().mockResolvedValue([]) },
  },
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
  enrichWalletRow: vi.fn((w) => w),
  getWalletSummary: vi.fn(),
  computeBreakdownForPeriod: vi.fn(),
}));

vi.mock('../../src/lib/walletSync', () => ({
  recalculateWalletBalance: vi.fn(),
  syncMissingWalletPayments: vi.fn(),
}));

vi.mock('../../src/lib/settlementWithdrawalQuery', () => ({
  listWithdrawalsUnsettledForDartCodes: vi.fn(),
}));

vi.mock('../../src/lib/periodChannelPreview', () => ({
  buildPeriodChannelPreview: vi.fn(),
}));

vi.mock('../../src/lib/promoOwnershipTotals', () => ({
  attachPromoOwnershipTotals: (
    breakdown: Record<string, unknown>,
    totals: Record<string, number>,
  ) => ({ ...breakdown, ...totals }),
  loadPromoOwnershipTotalsForPeriod: vi.fn().mockResolvedValue({
    branchOwnedPromoDiscountTotal: 0,
    platformOwnedPromoDiscountTotal: 0,
  }),
}));

vi.mock('../../src/lib/withdrawalInvoice', () => ({
  buildInvoiceChannelSummary: vi.fn().mockReturnValue({
    commissionBaseCents: 0,
    convenienceBaseCents: 0,
    commissionRatePct: 6.5,
  }),
  generateWithdrawalInvoice: vi.fn(),
  parseInvoicePeriodBreakdown: vi.fn().mockReturnValue(null),
  buildInvoicePromoSummaryFromUsages: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/withdrawalService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/withdrawalService')>();
  return {
    ...actual,
    approveWithdrawal: vi.fn(),
    buildStoredWithdrawalBreakdown: vi.fn(async (period: Record<string, unknown>, channelBreakdown: unknown) => ({
      ...period,
      channelBreakdown,
    })),
    cancelWithdrawal: vi.fn(),
    createApprovedWithdrawalRecord: vi.fn(),
    getNextPayoutStartDate: vi.fn(),
    initiateAndApproveWithdrawal: vi.fn(),
    listDuePayoutStoreIds: vi.fn().mockResolvedValue([]),
    listElapsedPayoutWindows: vi.fn().mockResolvedValue([]),
    listWithdrawals: vi.fn(),
    rejectWithdrawal: vi.fn(),
    requestWithdrawal: vi.fn(),
    resolvePayoutPeriod: vi.fn(),
    resolveOpenRollingPayoutWindow: vi.fn(),
    resolvePayoutPeriodOptions: vi.fn().mockResolvedValue([]),
    todayDateStr: vi.fn(() => '2026-07-20'),
  };
});

vi.mock('../../src/lib/appSchema', () => ({
  getConvenientFeeRate: vi.fn().mockResolvedValue(0.065),
  getGatewayFeeRate: vi.fn().mockResolvedValue(0.019),
  getConvenienceFeeRates: vi.fn().mockResolvedValue({ pickupOnline: 0.065, deliveryOnline: 0.065 }),
}));

vi.mock('../../src/middleware/upload', () => ({
  settlementReceiptPublicPath: vi.fn(
    (storeId: string, filename: string) => `/uploads/${storeId}/${filename}`,
  ),
}));

vi.mock('../../src/lib/walletSchema', () => ({
  ensureWalletSettlementColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/verifyAdminPin', () => ({
  verifyAdminPin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/settlementProofUpload', () => ({
  requireSettlementProofUpload: vi.fn().mockResolvedValue('/proofs/wd-1.pdf'),
  withUploadedProofCleanup: vi.fn(async (_url: string, work: () => Promise<unknown>) => work()),
}));

import {
  approveWithdrawalHandler,
  cancelWithdrawalHandler,
  getNetPreviewHandler,
  getPayoutPeriodInfoHandler,
  getPayoutsDueHandler,
  getPayoutPeriodsHandler,
  getPendingWithdrawalForSettlement,
  initiatePayoutHandler,
  listWithdrawalsForSettlement,
  listWithdrawalsHandler,
  rejectWithdrawalHandler,
  requestWithdrawalHandler,
  verifyWalletPinHandler,
  attachStoreIdFromWalletParams,
  attachWithdrawalStoreForUpload,
} from '../../src/controllers/walletController';
import { prisma } from '../../src/lib/prisma';
import {
  computeBreakdownForPeriod,
  computeNetTransferableEarnings,
  getOrCreateWallet,
} from '../../src/lib/walletService';
import { listWithdrawalsUnsettledForDartCodes } from '../../src/lib/settlementWithdrawalQuery';
import { buildPeriodChannelPreview } from '../../src/lib/periodChannelPreview';
import {
  approveWithdrawal,
  buildStoredWithdrawalBreakdown,
  cancelWithdrawal,
  getNextPayoutStartDate,
  initiateAndApproveWithdrawal,
  listDuePayoutStoreIds,
  listElapsedPayoutWindows,
  listWithdrawals,
  rejectWithdrawal,
  requestWithdrawal,
  resolveOpenRollingPayoutWindow,
  resolvePayoutPeriod,
} from '../../src/lib/withdrawalService';
import { generateWithdrawalInvoice } from '../../src/lib/withdrawalInvoice';
import * as walletControllerSupport from '../../src/lib/walletControllerSupport';
import { resolveBranchStoreId } from '../../src/middleware/auth';
import { verifyAdminPin } from '../../src/lib/verifyAdminPin';
import { requireSettlementProofUpload } from '../../src/lib/settlementProofUpload';

describe('listWithdrawalsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(listWithdrawals).mockResolvedValue({
      items: [{ id: 'wd-1', status: 'PENDING' }],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
  });

  it('lists withdrawals with pagination and optional status filter', async () => {
    const storeId = '11111111-1111-4111-8111-111111111111';
    const req = createMockReq({
      query: { status: 'PENDING', page: '2', limit: '10', storeId },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listWithdrawalsHandler(req, res);

    expect(listWithdrawals).toHaveBeenCalledWith({
      storeId,
      status: 'PENDING',
      page: 2,
      limit: 10,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ total: 1 }),
    });
  });

  it('lists withdrawals for a legacy slug store id', async () => {
    const storeId = 'store-bing-chun---moratuwa';
    const req = createMockReq({
      query: { storeId, page: '1', limit: '10' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listWithdrawalsHandler(req, res);

    expect(listWithdrawals).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId,
        page: 1,
        limit: 10,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });
});

describe('requestWithdrawalHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks branch manager payout requests when ENABLE_BRANCH_PAYOUT_REQUESTS is false', async () => {
    const req = createMockReq({
      body: { amount: 500, periodDays: 15, remarks: 'Weekly', password: 'secret-pin' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Branch payout requests are currently disabled by the Super Admin.',
    );
    expect(requestWithdrawal).not.toHaveBeenCalled();
    expect(verifyAdminPin).not.toHaveBeenCalled();
  });

  it('rejects when PIN is missing', async () => {
    const req = createMockReq({
      body: { amount: 500, periodDays: 15 },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(requestWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects when PIN verification fails', async () => {
    vi.mocked(verifyAdminPin).mockRejectedValue(new AppError('Invalid PIN', 401));

    const req = createMockReq({
      body: { amount: 500, periodDays: 15, password: 'wrong' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(requestWithdrawal).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('rejects an invalid payout period length', async () => {
    const req = createMockReq({
      body: { amount: 500, periodDays: 7, password: 'secret-pin' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(requestWithdrawal).not.toHaveBeenCalled();
  });

  it('requires a linked branch for branch-scoped users', async () => {
    const req = createMockReq({
      body: { amount: 500, periodDays: 15, password: 'secret-pin' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: undefined },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Branch payout requests are currently disabled by the Super Admin.',
    );
  });

  it('allows system admin to pass storeId in the body', async () => {
    vi.mocked(requestWithdrawal).mockResolvedValue({ id: 'wd-2' } as never);

    const req = createMockReq({
      body: {
        storeId: 'store-9',
        amount: 100,
        periodDays: 15,
        isAdvance: true,
        password: 'secret-pin',
      },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await requestWithdrawalHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'secret-pin');
    expect(requestWithdrawal).toHaveBeenCalledWith(
      'store-9',
      10_000,
      undefined,
      'admin-1',
      15,
      true,
    );
  });
});

describe('verifyWalletPinHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
  });

  it('verifies the admin PIN', async () => {
    const req = createMockReq({
      body: { password: 'secret-pin' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await verifyWalletPinHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('mgr-1', 'secret-pin');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { verified: true } });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards invalid PIN errors', async () => {
    vi.mocked(verifyAdminPin).mockRejectedValue(new AppError('Invalid PIN', 401));

    const req = createMockReq({
      body: { password: 'wrong' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await verifyWalletPinHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});

describe('approveWithdrawalHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
    vi.mocked(requireSettlementProofUpload).mockResolvedValue('/proofs/wd-1.pdf');
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: 'wd-1',
      storeId: 'store-1',
      amount: 25_000,
      remarks: null,
      breakdown: null,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-07T23:59:59.999Z'),
    } as never);
    vi.mocked(getOrCreateWallet).mockResolvedValue({
      balance: 80_000,
      totalWithdrawn: 10_000,
    } as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ name: 'Nugegoda' } as never);
    vi.mocked(computeNetTransferableEarnings).mockResolvedValue(90_000);
    vi.mocked(approveWithdrawal).mockResolvedValue({
      id: 'wd-1',
      reviewedAt: new Date('2026-07-08T10:00:00.000Z'),
      checkNumber: null,
      checkDate: null,
    } as never);
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      grossAmount: 1,
      onlineWalletGross: 1,
      deliveryFee: 0,
      commissionFee: 0,
      gatewayFee: 0,
      gatewayBase: 0,
      convenienceFee: 0,
      netAmount: 1,
      orderCount: 1,
    });
    vi.mocked(buildPeriodChannelPreview).mockResolvedValue({
      breakdown: {},
      storeDiscountsTotal: 0,
      slabInfo: null,
    } as never);
    vi.mocked(generateWithdrawalInvoice).mockResolvedValue({
      invoiceRef: 'INV-1',
      invoiceUrl: '/api/admin/invoices/withdrawal/wd-1',
      invoiceData: { storeId: 'store-1', withdrawalId: 'wd-1' },
    } as never);
    vi.mocked(prisma.storeWithdrawal.update).mockResolvedValue({
      id: 'wd-1',
      invoiceRef: 'INV-1',
      invoiceUrl: '/invoices/INV-1.pdf',
    } as never);
  });

  it('forbids non-system admins', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { paymentMethod: 'BANK_TRANSFER' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });

  it('returns 404 when the withdrawal does not exist', async () => {
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing' },
      body: { paymentMethod: 'CASH' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('requires check metadata when payment method is CHECK', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { paymentMethod: 'CHECK', password: 'secret-pin' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(approveWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects when PIN is missing', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { paymentMethod: 'BANK_TRANSFER' },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(approveWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects when PIN verification fails', async () => {
    vi.mocked(verifyAdminPin).mockRejectedValue(new AppError('Invalid PIN', 401));

    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { paymentMethod: 'BANK_TRANSFER', password: 'wrong' },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'wrong');
    expect(requireSettlementProofUpload).not.toHaveBeenCalled();
    expect(approveWithdrawal).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('approves a bank transfer withdrawal and attaches an invoice', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { paymentMethod: 'BANK_TRANSFER', password: 'secret-pin' },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await approveWithdrawalHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'secret-pin');
    expect(requireSettlementProofUpload).toHaveBeenCalled();
    expect(approveWithdrawal).toHaveBeenCalledWith(
      'wd-1',
      'admin-1',
      'BANK_TRANSFER',
      '/proofs/wd-1.pdf',
      expect.objectContaining({ checkNumber: null, checkDate: null }),
    );
    expect(generateWithdrawalInvoice).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ invoiceRef: 'INV-1' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('initiatePayoutHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
    vi.mocked(requireSettlementProofUpload).mockResolvedValue('/proofs/store-1.pdf');
    vi.mocked(getOrCreateWallet).mockResolvedValue({
      balance: 80_000,
      totalWithdrawn: 10_000,
    } as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ name: 'Nugegoda' } as never);
    vi.mocked(computeNetTransferableEarnings).mockResolvedValue(90_000);
    vi.mocked(initiateAndApproveWithdrawal).mockResolvedValue({
      id: 'wd-init-1',
      amount: 25_000,
      breakdown: null,
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodTo: new Date('2026-07-07T23:59:59.999Z'),
      reviewedAt: new Date('2026-07-08T10:00:00.000Z'),
      remarks: null,
      checkNumber: null,
      checkDate: null,
    } as never);
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      grossAmount: 1,
      onlineWalletGross: 1,
      deliveryFee: 0,
      commissionFee: 0,
      gatewayFee: 0,
      gatewayBase: 0,
      convenienceFee: 0,
      netAmount: 1,
      orderCount: 1,
    });
    vi.mocked(buildPeriodChannelPreview).mockResolvedValue({
      breakdown: {},
      storeDiscountsTotal: 0,
      slabInfo: null,
    } as never);
    vi.mocked(generateWithdrawalInvoice).mockResolvedValue({
      invoiceRef: 'INV-INIT-1',
      invoiceUrl: '/api/admin/invoices/withdrawal/wd-init-1',
      invoiceData: { storeId: 'store-1', withdrawalId: 'wd-init-1' },
    } as never);
    vi.mocked(prisma.storeWithdrawal.update).mockResolvedValue({
      id: 'wd-init-1',
      invoiceRef: 'INV-INIT-1',
      invoiceUrl: '/invoices/INV-INIT-1.pdf',
    } as never);
  });

  it('forbids non-system admins', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: {
        amount: 250,
        periodDays: 15,
        paymentMethod: 'BANK_TRANSFER',
        password: 'secret-pin',
      },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await initiatePayoutHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });

  it('rejects when PIN is missing', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: {
        amount: 250,
        periodDays: 15,
        paymentMethod: 'BANK_TRANSFER',
      },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await initiatePayoutHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(verifyAdminPin).not.toHaveBeenCalled();
    expect(initiateAndApproveWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects when PIN verification fails', async () => {
    vi.mocked(verifyAdminPin).mockRejectedValue(new AppError('Invalid PIN', 401));

    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: {
        amount: 250,
        periodDays: 15,
        paymentMethod: 'BANK_TRANSFER',
        password: 'wrong',
      },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await initiatePayoutHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'wrong');
    expect(requireSettlementProofUpload).not.toHaveBeenCalled();
    expect(initiateAndApproveWithdrawal).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('initiates a direct payout when PIN is valid', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: {
        amount: 250,
        periodDays: 15,
        paymentMethod: 'BANK_TRANSFER',
        password: 'secret-pin',
      },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await initiatePayoutHandler(req, res, next);

    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'secret-pin');
    expect(requireSettlementProofUpload).toHaveBeenCalled();
    expect(initiateAndApproveWithdrawal).toHaveBeenCalledWith(
      'store-1',
      25_000,
      undefined,
      'admin-1',
      15,
      'BANK_TRANSFER',
      '/proofs/store-1.pdf',
      false,
      expect.objectContaining({ checkNumber: null, checkDate: null }),
    );
    expect(generateWithdrawalInvoice).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ invoiceRef: 'INV-INIT-1' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('passes explicit period bounds from Payouts Due when from/to are provided', async () => {
    const req = createMockReq({
      params: { storeId: 'store-1' },
      body: {
        amount: 250,
        periodDays: 15,
        from: '2026-08-11',
        to: '2026-08-25',
        paymentMethod: 'BANK_TRANSFER',
        password: 'secret-pin',
      },
      file: { originalname: 'proof.pdf' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await initiatePayoutHandler(req, res, next);

    expect(initiateAndApproveWithdrawal).toHaveBeenCalledWith(
      'store-1',
      25_000,
      undefined,
      'admin-1',
      15,
      'BANK_TRANSFER',
      '/proofs/store-1.pdf',
      false,
      expect.objectContaining({
        periodBounds: { from: '2026-08-11', to: '2026-08-25' },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rejectWithdrawalHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rejectWithdrawal).mockResolvedValue({ id: 'wd-1', status: 'REJECTED' } as never);
  });

  it('forbids non-system admins', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { reason: 'Incomplete docs' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await rejectWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });

  it('rejects a pending withdrawal with an optional reason', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      body: { reason: 'Incomplete docs' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await rejectWithdrawalHandler(req, res, next);

    expect(rejectWithdrawal).toHaveBeenCalledWith('wd-1', 'admin-1', 'Incomplete docs');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ status: 'REJECTED' }),
    });
  });
});

describe('cancelWithdrawalHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      id: 'wd-1',
      storeId: 'store-1',
      status: 'PENDING',
    } as never);
    vi.mocked(cancelWithdrawal).mockResolvedValue({ id: 'wd-1', status: 'CANCELLED' } as never);
  });

  it('returns 404 when withdrawal is missing', async () => {
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'missing' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await cancelWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('forbids cancelling another branch withdrawal', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
    });
    const res = createMockRes();

    await cancelWithdrawalHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Forbidden');
  });

  it('cancels a pending withdrawal for the owning branch', async () => {
    const req = createMockReq({
      params: { id: 'wd-1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await cancelWithdrawalHandler(req, res, next);

    expect(cancelWithdrawal).toHaveBeenCalledWith('wd-1', 'mgr-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
  });
});

describe('getPayoutPeriodInfoHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
  });

  it('requires storeId for system admins', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodInfoHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('storeId is required');
  });

  it('returns locked next period dates when a next start exists', async () => {
    vi.mocked(getNextPayoutStartDate).mockResolvedValue('2026-07-08');

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodInfoHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        nextStartDate: '2026-07-08',
        lockStartDate: true,
        periodType: 'rolling',
        options: [],
      },
    });
  });

  it('returns unlocked null end when there is no next start', async () => {
    vi.mocked(getNextPayoutStartDate).mockResolvedValue(null);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodInfoHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        nextStartDate: null,
        lockStartDate: false,
        periodType: 'rolling',
        options: [],
      },
    });
  });
});

describe('getPayoutsDueHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-due', name: 'Bing Chun - Kandy' },
      { id: 'store-zero', name: 'Bing Chun - Galle' },
    ] as never);
    vi.spyOn(walletControllerSupport, 'listSuperAdminPayoutsDueItems').mockImplementation(
      async () => {
        const periodFrom = '2026-07-01';
        const periodTo = '2026-07-15';
        return {
          items: [
            {
              storeId: 'store-due',
              storeName: 'Bing Chun - Kandy',
              periodFrom,
              periodTo,
              days: 15,
              netAmountCents: 50_000,
              orderCount: 8,
            },
          ],
          nextCursor: null,
          done: true,
        };
      },
    );
  });

  it('returns pending branch periods (from/to query is forwarded but does not filter the queue)', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-07-01', to: '2026-07-31' },
    });
    const res = createMockRes();

    await getPayoutsDueHandler(req, res, next);

    expect(walletControllerSupport.listSuperAdminPayoutsDueItems).toHaveBeenCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [
          {
            storeId: 'store-due',
            storeName: 'Bing Chun - Kandy',
            periodFrom: '2026-07-01',
            periodTo: '2026-07-15',
            days: 15,
            netAmountCents: 50_000,
            orderCount: 8,
          },
        ],
        nextCursor: null,
        done: true,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('still returns due items when from/to would not overlap the period (queue is not month-scoped)', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-08-01', to: '2026-08-31' },
    });
    const res = createMockRes();

    await getPayoutsDueHandler(req, res, next);

    expect(walletControllerSupport.listSuperAdminPayoutsDueItems).toHaveBeenCalledWith({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            storeId: 'store-due',
            periodFrom: '2026-07-01',
            periodTo: '2026-07-15',
          }),
        ],
        nextCursor: null,
        done: true,
      },
    });
  });

  it('forwards the store cursor to the next chunk', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-07-01', to: '2026-07-31', cursor: 'store-due' },
    });
    const res = createMockRes();

    await getPayoutsDueHandler(req, res, next);

    expect(walletControllerSupport.listSuperAdminPayoutsDueItems).toHaveBeenCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
      cursor: 'store-due',
    });
  });

  it('rejects non-system-admin callers', async () => {
    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getPayoutsDueHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(walletControllerSupport.listSuperAdminPayoutsDueItems).not.toHaveBeenCalled();
  });

  it('loads the full queue when from/to are omitted', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await getPayoutsDueHandler(req, res, next);

    expect(walletControllerSupport.listSuperAdminPayoutsDueItems).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('listSuperAdminPayoutsDueItems', () => {
  const { listSuperAdminPayoutsDueItems } = walletControllerSupport;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-1', name: 'Bing Chun - Kandy' },
    ] as never);
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([]);
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([
      { days: 15, from: '2026-07-01', to: '2026-07-15', capped: false },
      { days: 15, from: '2026-07-16', to: '2026-07-30', capped: false },
    ]);
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      netAmount: 10_000,
      orderCount: 3,
      netPlatformEarning: 500,
    } as never);
  });

  it('returns elapsed unpaid windows from the next payout start (ignores month filter)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([
      {
        id: 'wd-1',
        storeId: 'store-1',
        amount: 10_000,
        status: 'APPROVED',
        periodFrom: new Date('2026-08-23T00:00:00.000Z'),
        periodTo: new Date('2026-09-06T00:00:00.000Z'),
        breakdown: { orderCount: 2 },
      },
    ] as never);

    const page = await listSuperAdminPayoutsDueItems({
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(page.items.map((item) => item.periodFrom)).toEqual([
      '2026-09-07',
      '2026-09-22',
      '2026-10-07',
    ]);
    expect(page.items[0].periodTo).toBe('2026-09-21');
    vi.useRealTimers();
  });

  it('includes the full unpaid chain when explicit from/to is passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      storeId: 'store-1',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    } as never);

    const page = await listSuperAdminPayoutsDueItems({
      from: '2026-07-20',
      to: '2026-07-31',
    });

    expect(page.items.length).toBeGreaterThanOrEqual(2);
    expect(page.items[0]).toMatchObject({ periodFrom: '2026-07-01', periodTo: '2026-07-15' });
    expect(page.items[1]).toMatchObject({ periodFrom: '2026-07-16', periodTo: '2026-07-30' });
    vi.useRealTimers();
  });
});

describe('getPayoutPeriodsHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([]);
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([]);
    vi.mocked(resolveOpenRollingPayoutWindow).mockResolvedValue(null);
    vi.mocked(resolvePayoutPeriod).mockResolvedValue({
      days: 15,
      from: '2026-09-10',
      to: '2026-09-20',
      capped: false,
    });
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      netAmount: 26_181,
      orderCount: 9,
      netPlatformEarning: 4_000,
    } as never);
    vi.mocked(buildPeriodChannelPreview).mockResolvedValue({
      breakdown: { pickupOnline: { orderCount: 9 } },
    } as never);
    vi.mocked(buildStoredWithdrawalBreakdown).mockImplementation(
      async (period: Record<string, unknown>, channelBreakdown: unknown) => ({
        ...period,
        channelBreakdown,
      }),
    );
  });

  it('maps approved withdrawals to Paid and elapsed windows to Pending', async () => {
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([
      {
        id: 'paid',
        storeId: 'store-1',
        amount: 24_500,
        status: 'APPROVED',
        periodFrom: new Date('2026-08-26T00:00:00.000Z'),
        periodTo: new Date('2026-09-09T00:00:00.000Z'),
        breakdown: { orderCount: 6, netAmount: 24_500 },
      },
    ] as never);
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([
      { days: 15, from: '2026-08-11', to: '2026-08-25', capped: false },
      { days: 15, from: '2026-08-26', to: '2026-09-09', capped: false },
    ]);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(listElapsedPayoutWindows).toHaveBeenCalledWith('store-1', 15);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          key: 'wd-paid',
          periodFrom: '2026-08-26',
          periodTo: '2026-09-09',
          status: 'PAID',
          amountCents: 24_500,
          orderCount: 6,
        }),
        expect.objectContaining({
          key: 'period-2026-08-11-2026-08-25',
          periodFrom: '2026-08-11',
          periodTo: '2026-08-25',
          status: 'PENDING',
          amountCents: 26_181,
          orderCount: 9,
          withdrawal: null,
          breakdown: null,
        }),
      ],
    });
    expect(buildStoredWithdrawalBreakdown).not.toHaveBeenCalled();
    expect(buildPeriodChannelPreview).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a list-only pending row without building a stored snapshot', async () => {
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([
      { days: 15, from: '2026-08-11', to: '2026-08-25', capped: false },
    ]);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          key: 'period-2026-08-11-2026-08-25',
          status: 'PENDING',
          amountCents: 26_181,
          breakdown: null,
        }),
      ],
    });
    expect(buildStoredWithdrawalBreakdown).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('includes the current in-progress capped window', async () => {
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([]);
    vi.mocked(resolveOpenRollingPayoutWindow).mockResolvedValue({
      days: 15,
      from: '2026-09-10',
      to: '2026-09-20',
      capped: true,
    });

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(resolveOpenRollingPayoutWindow).toHaveBeenCalledWith('store-1', 15);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          key: 'period-in-progress-2026-09-10-2026-09-24',
          periodFrom: '2026-09-10',
          periodTo: '2026-09-24',
          summaryThrough: '2026-09-20',
          status: 'IN_PROGRESS',
          amountCents: 26_181,
          orderCount: 9,
          breakdown: null,
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('includes in-progress row even when accumulated net is zero', async () => {
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([]);
    vi.mocked(resolveOpenRollingPayoutWindow).mockResolvedValue({
      days: 15,
      from: '2026-10-14',
      to: '2026-10-20',
      capped: true,
    });
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      netAmount: 0,
      orderCount: 0,
      netPlatformEarning: 0,
    } as never);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          status: 'IN_PROGRESS',
          periodFrom: '2026-10-14',
          periodTo: '2026-10-28',
          summaryThrough: '2026-10-20',
          amountCents: 0,
          orderCount: 0,
        }),
      ],
    });
  });

  it('skips elapsed windows whose computed net is zero', async () => {
    vi.mocked(listElapsedPayoutWindows).mockResolvedValue([
      { days: 15, from: '2026-08-11', to: '2026-08-25', capped: false },
    ]);
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      netAmount: 0,
      orderCount: 0,
      netPlatformEarning: 0,
    } as never);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('scopes branch managers to their own store', async () => {
    const req = createMockReq({
      query: { storeId: 'other-store' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(listElapsedPayoutWindows).not.toHaveBeenCalled();
  });

  it('requires storeId for Super Admin', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPayoutPeriodsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('storeId is required');
  });
});

describe('settlement withdrawal helpers', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(listWithdrawalsUnsettledForDartCodes).mockResolvedValue([
      { id: 'wd-a', amount: 1000 },
      { id: 'wd-b', amount: 2000 },
    ] as never);
  });

  it('returns the first unsettled withdrawal for pending-withdrawal', async () => {
    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPendingWithdrawalForSettlement(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'wd-a', amount: 1000 },
    });
  });

  it('returns null when there are no unsettled withdrawals', async () => {
    vi.mocked(listWithdrawalsUnsettledForDartCodes).mockResolvedValue([]);

    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getPendingWithdrawalForSettlement(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('lists all unsettled withdrawals for settlement', async () => {
    const req = createMockReq({
      query: { storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listWithdrawalsForSettlement(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        { id: 'wd-a', amount: 1000 },
        { id: 'wd-b', amount: 2000 },
      ],
    });
  });
});

describe('getNetPreviewHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      platformDiscountPaybackEnabled: true,
    } as never);
    vi.mocked(computeBreakdownForPeriod).mockResolvedValue({
      grossAmount: 10_000,
      onlineWalletGross: 10_000,
      deliveryFee: 0,
      commissionFee: 650,
      gatewayFee: 280,
      gatewayBase: 10_000,
      convenienceFee: 0,
      netAmount: 9_070,
      orderCount: 2,
    });
    vi.mocked(buildPeriodChannelPreview).mockResolvedValue({
      breakdown: { deliveryOnline: {} },
      storeDiscountsTotal: 0,
    } as never);
  });

  it('rejects inverted date ranges', async () => {
    const req = createMockReq({
      query: { from: '2026-07-10', to: '2026-07-01', storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getNetPreviewHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Start date must be on or before end date',
    );
  });

  it('returns breakdown with netAmountLkr and channel preview', async () => {
    const req = createMockReq({
      query: { from: '2026-07-01', to: '2026-07-07', storeId: 'store-1' },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getNetPreviewHandler(req, res, next);

    expect(computeBreakdownForPeriod).toHaveBeenCalledWith('store-1', '2026-07-01', '2026-07-07');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        netAmount: 9_070,
        netAmountLkr: 90.7,
        platformDiscountPaybackEnabled: true,
        channelPreview: expect.any(Object),
      }),
    });
  });
});

describe('upload helpers', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attachStoreIdFromWalletParams copies storeId into the body', () => {
    const req = createMockReq({
      params: { storeId: encodeURIComponent('store 1') },
      body: {},
    });
    const res = createMockRes();

    attachStoreIdFromWalletParams(req, res, next);

    expect(req.body.storeId).toBe('store 1');
    expect(next).toHaveBeenCalledWith();
  });

  it('attachWithdrawalStoreForUpload loads storeId from the withdrawal', async () => {
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue({
      storeId: 'store-1',
    } as never);

    const req = createMockReq({ params: { id: 'wd-1' }, body: {} });
    const res = createMockRes();

    await attachWithdrawalStoreForUpload(req, res, next);

    expect(req.body.storeId).toBe('store-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('attachWithdrawalStoreForUpload returns 404 for missing withdrawals', async () => {
    vi.mocked(prisma.storeWithdrawal.findUnique).mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'missing' }, body: {} });
    const res = createMockRes();

    await attachWithdrawalStoreForUpload(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });
});
