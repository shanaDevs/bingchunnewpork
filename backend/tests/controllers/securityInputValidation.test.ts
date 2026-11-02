import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockReq, createMockRes } from '../helpers/express';

const STORE_UUID = '11111111-1111-4111-8111-111111111111';
vi.mock('../../src/lib/withdrawalSchema', () => ({
  ensureWithdrawalSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/walletControllerSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/walletControllerSupport')>();
  return {
    ...actual,
    buildWalletReportPayload: vi.fn().mockResolvedValue({ rows: [] }),
    resolveScopedStoreId: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
  };
});

vi.mock('../../src/lib/walletAnalysis', () => ({
  getWalletAnalysis: vi.fn().mockResolvedValue({ tank: {}, trend: [] }),
}));

vi.mock('../../src/lib/withdrawalService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/withdrawalService')>();
  return {
    ...actual,
    listWithdrawals: vi.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    }),
  };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    storeWithdrawal: { findUnique: vi.fn() },
    commissionSettlement: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    loyaltyTransaction: { findMany: vi.fn() },
    order: { aggregate: vi.fn() },
  },
}));

vi.mock('../../src/lib/loyaltyCampaign', () => ({
  getCustomerLoyaltyJourney: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/loyaltySettingStore', () => ({
  fetchLoyaltySettingRow: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/middleware/auth', () => ({
  assertOrderStoreAccess: vi.fn().mockResolvedValue(undefined),
}));

import { buildWalletReportPayload, resolveScopedStoreId } from '../../src/lib/walletControllerSupport';
import { getWalletAnalysis } from '../../src/lib/walletAnalysis';
import { listWithdrawals } from '../../src/lib/withdrawalService';
import { getWalletReport, getWalletAnalysisHandler, listWithdrawalsHandler } from '../../src/controllers/walletController';
import {
  getWithdrawalInvoiceHandler,
  getSettlementInvoiceHandler,
} from '../../src/controllers/invoiceController';
import { getLoyaltySummary } from '../../src/controllers/loyaltyController';
import { prisma } from '../../src/lib/prisma';

describe('security input validation (QA 3.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wallet report query', () => {
    it('rejects invalid from date before report logic runs', async () => {
      const req = createMockReq({
        query: { from: 'not-a-date' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await expect(getWalletReport(req, res)).rejects.toBeInstanceOf(ZodError);
      expect(buildWalletReportPayload).not.toHaveBeenCalled();
    });

    it('accepts valid dates and delegates to buildWalletReportPayload', async () => {
      const req = createMockReq({
        query: { from: '2026-07-01', to: '2026-07-31', storeId: STORE_UUID },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await getWalletReport(req, res);

      expect(buildWalletReportPayload).toHaveBeenCalledWith(
        req.user,
        STORE_UUID,
        '2026-07-01',
        '2026-07-31',
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { rows: [] } });
    });
  });

  describe('wallet analysis query', () => {
    it('rejects malformed month', async () => {
      const req = createMockReq({
        query: { month: '2026/10' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await expect(getWalletAnalysisHandler(req, res)).rejects.toBeInstanceOf(ZodError);
      expect(getWalletAnalysis).not.toHaveBeenCalled();
    });

    it('passes validated month to getWalletAnalysis unchanged', async () => {
      const req = createMockReq({
        query: { month: '2026-10', storeId: STORE_UUID },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await getWalletAnalysisHandler(req, res);

      expect(getWalletAnalysis).toHaveBeenCalledWith({
        monthKey: '2026-10',
        storeId: STORE_UUID,
      });
    });
  });

  describe('wallet withdrawals list query', () => {
    it('accepts a legacy slug storeId and lists that branch', async () => {
      const storeId = 'store-bing-chun---moratuwa';
      vi.mocked(resolveScopedStoreId).mockImplementation(async (_req, id) => id);
      const req = createMockReq({
        query: { storeId },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await listWithdrawalsHandler(req, res);

      expect(listWithdrawals).toHaveBeenCalledWith(
        expect.objectContaining({ storeId }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });

  describe('invoice path params', () => {
    const next = vi.fn();

    it('rejects invalid withdrawal invoice id', async () => {
      const req = createMockReq({ params: { withdrawalId: 'not-uuid' } });
      const res = createMockRes();

      await getWithdrawalInvoiceHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
      expect(prisma.storeWithdrawal.findUnique).not.toHaveBeenCalled();
    });

    it('rejects invalid settlement invoice id', async () => {
      const req = createMockReq({ params: { settlementId: 'bad' } });
      const res = createMockRes();

      await getSettlementInvoiceHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
      expect(prisma.commissionSettlement.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('loyalty summary query', () => {
    const next = vi.fn();

    beforeEach(() => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        loyaltyPoints: 10,
      } as never);
      vi.mocked(prisma.loyaltyTransaction.findMany).mockResolvedValue([]);
      vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { total: 0 } } as never);
    });

    it('rejects invalid storeId query', async () => {
      const req = createMockReq({
        query: { storeId: 'not-uuid' },
        user: { sub: 'user-1', type: 'user' },
      });
      const res = createMockRes();

      await getLoyaltySummary(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    });
  });
});
