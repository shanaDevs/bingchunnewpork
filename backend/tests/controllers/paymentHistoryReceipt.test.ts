import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

const SETTLEMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const STORE_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('../../src/lib/settlementSchema', () => ({
  ensureCommissionSettlementTable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/settlementProofAccess', () => ({
  buildProofAccessResponse: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  resolveBranchStoreId: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    commissionSettlement: { findFirst: vi.fn() },
    store: { findMany: vi.fn() },
  },
}));

import { buildProofAccessResponse } from '../../src/lib/settlementProofAccess';
import { prisma } from '../../src/lib/prisma';
import { getSettlementReceiptUrl } from '../../src/controllers/paymentHistoryController';
import { AppError } from '../../src/middleware/errorHandler';

describe('getSettlementReceiptUrl', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([{ id: STORE_ID }] as never);
  });

  it('returns presigned receipt access for a scoped settlement', async () => {
    vi.mocked(prisma.commissionSettlement.findFirst).mockResolvedValue({
      id: SETTLEMENT_ID,
      storeId: STORE_ID,
      receiptUrl: 'https://bucket.sgp1.digitaloceanspaces.com/bingchun/settlements/store/slip.pdf',
    } as never);
    vi.mocked(buildProofAccessResponse).mockResolvedValue({
      url: 'https://signed.example/slip.pdf',
      expiresAt: '2026-10-09T09:00:00.000Z',
    });

    const req = createMockReq({
      params: { id: SETTLEMENT_ID },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getSettlementReceiptUrl(req, res, next);

    expect(buildProofAccessResponse).toHaveBeenCalledWith(
      'https://bucket.sgp1.digitaloceanspaces.com/bingchun/settlements/store/slip.pdf',
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        url: 'https://signed.example/slip.pdf',
        expiresAt: '2026-10-09T09:00:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when the settlement is outside scope', async () => {
    vi.mocked(prisma.commissionSettlement.findFirst).mockResolvedValue(null);

    const req = createMockReq({
      params: { id: SETTLEMENT_ID },
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await getSettlementReceiptUrl(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(404);
    expect(buildProofAccessResponse).not.toHaveBeenCalled();
  });
});
