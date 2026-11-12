import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/verifyAdminPin', () => ({
  verifyAdminPin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/deliveryWalletUnlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryWalletUnlock')>();
  return {
    ...actual,
    signDeliveryWalletUnlockToken: vi.fn().mockReturnValue('unlock-jwt'),
    assertActiveSystemAdmin: vi.fn().mockResolvedValue(undefined),
    requireSystemAdminFromRequest: vi.fn(async (req: { user?: { sub?: string; role?: string } }) => {
      const user = req.user;
      if (user?.role !== 'SYSTEM_ADMIN') {
        throw new AppError('Forbidden', 403);
      }
      return user;
    }),
  };
});

vi.mock('../../src/lib/deliveryWalletService', () => ({
  emptyDeliveryWalletSummary: vi.fn().mockReturnValue({ netForDelivery: 0 }),
  getDeliveryWalletSummary: vi.fn(),
  maxDeliveryWalletRangeDays: vi.fn().mockReturnValue(400),
}));

vi.mock('../../src/lib/deliveryPayoutService', () => ({
  getLiveDeliveryWalletRange: vi.fn(),
  getDeliveryPayoutPreview: vi.fn(),
  listDeliveryPayouts: vi.fn(),
  listDeliveryPayoutsDue: vi.fn(),
  payDeliveryPayout: vi.fn(),
  createDeliveryPayout: vi.fn(),
  approveDeliveryPayout: vi.fn(),
  attachDeliveryPayoutProof: vi.fn(),
  rejectDeliveryPayout: vi.fn(),
  cancelDeliveryPayout: vi.fn(),
}));

vi.mock('../../src/lib/settlementProofUpload', () => ({
  requireSettlementProofUpload: vi.fn(),
  optionalSettlementProofUpload: vi.fn(),
  withUploadedProofCleanup: vi.fn(async (_url: string | null, work: () => Promise<unknown>) => work()),
}));

vi.mock('../../src/lib/deliveryPayoutStatement', () => ({
  renderDeliveryPayoutStatementForId: vi.fn(),
  renderDeliveryPayoutStatementZip: vi.fn(),
}));

import { verifyAdminPin } from '../../src/lib/verifyAdminPin';
import { getDeliveryWalletSummary } from '../../src/lib/deliveryWalletService';
import {
  approveDeliveryPayout,
  attachDeliveryPayoutProof,
  createDeliveryPayout,
  getLiveDeliveryWalletRange,
  payDeliveryPayout,
} from '../../src/lib/deliveryPayoutService';
import {
  optionalSettlementProofUpload,
  requireSettlementProofUpload,
} from '../../src/lib/settlementProofUpload';
import {
  renderDeliveryPayoutStatementForId,
  renderDeliveryPayoutStatementZip,
} from '../../src/lib/deliveryPayoutStatement';
import {
  approveDeliveryPayoutHandler,
  attachDeliveryPayoutProofHandler,
  createDeliveryPayoutHandler,
  downloadDeliveryPayoutStatementZipHandler,
  getDeliveryPayoutStatementHandler,
  getDeliveryWalletHandler,
  payDeliveryPayoutHandler,
  unlockDeliveryWalletHandler,
} from '../../src/controllers/deliveryWalletController';

function thrownError(next: ReturnType<typeof createMockNext>) {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

describe('deliveryWalletController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a step-up token on unlock', async () => {
    const res = createMockRes();
    const next = createMockNext();
    await unlockDeliveryWalletHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
        body: { password: 'secret' },
      }),
      res,
      next,
    );
    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'secret');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { unlocked: true, token: 'unlock-jwt' },
    });
  });

  it('defaults GET without dates to the live window', async () => {
    vi.mocked(getLiveDeliveryWalletRange).mockResolvedValue({
      from: '2026-08-28',
      to: '2026-09-09',
      afterApproved: true,
    });
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({ netForDelivery: 882.9 } as never);
    const res = createMockRes();
    await getDeliveryWalletHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
        query: {},
      }),
      res,
      createMockNext(),
    );
    expect(getDeliveryWalletSummary).toHaveBeenCalledWith('2026-08-28', '2026-09-09');
  });

  it('restricts all-time scope to SYSTEM_ADMIN', async () => {
    const next = createMockNext();
    await getDeliveryWalletHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
        query: { scope: 'all' },
      }),
      createMockRes(),
      next,
    );
    expect(thrownError(next).statusCode).toBe(403);
  });

  it('rejects pay without a proof file', async () => {
    vi.mocked(requireSettlementProofUpload).mockRejectedValue(
      new AppError('Payment proof (slip/receipt) is required', 400),
    );
    const next = createMockNext();
    await payDeliveryPayoutHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        body: {
          periodFrom: '2026-08-01',
          paymentMethod: 'CASH',
          password: 'pin',
        },
      }),
      createMockRes(),
      next,
    );
    expect(thrownError(next).statusCode).toBe(400);
    expect(payDeliveryPayout).not.toHaveBeenCalled();
  });

  it('allows approve without a proof file', async () => {
    vi.mocked(optionalSettlementProofUpload).mockResolvedValue(null);
    vi.mocked(approveDeliveryPayout).mockResolvedValue({ id: 'payout-1', status: 'APPROVED' } as never);
    const next = createMockNext();
    await approveDeliveryPayoutHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'payout-1' },
        body: { password: 'pin' },
      }),
      createMockRes(),
      next,
    );
    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'pin');
    expect(next).not.toHaveBeenCalled();
    expect(approveDeliveryPayout).toHaveBeenCalledWith({
      payoutId: 'payout-1',
      reviewerId: 'admin-1',
      proofUrl: null,
    });
  });

  it('requires a proof file when uploading proof later', async () => {
    vi.mocked(requireSettlementProofUpload).mockRejectedValue(
      new AppError('Payment proof (slip/receipt) is required', 400),
    );
    const next = createMockNext();
    await attachDeliveryPayoutProofHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        params: { id: 'payout-1' },
      }),
      createMockRes(),
      next,
    );
    expect(thrownError(next).statusCode).toBe(400);
    expect(attachDeliveryPayoutProof).not.toHaveBeenCalled();
  });

  it('requires PIN before paying', async () => {
    vi.mocked(requireSettlementProofUpload).mockResolvedValue('https://proof/slip.pdf');
    vi.mocked(payDeliveryPayout).mockResolvedValue({ id: 'p1', status: 'APPROVED' } as never);
    const next = createMockNext();
    await payDeliveryPayoutHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        body: {
          periodFrom: '2026-08-01',
          paymentMethod: 'CASH',
          password: 'pin',
        },
      }),
      createMockRes(),
      next,
    );
    expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'pin');
    expect(payDeliveryPayout).toHaveBeenCalled();
  });

  it('requires check fields for CHECK payments', async () => {
    const next = createMockNext();
    await payDeliveryPayoutHandler(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
        body: {
          periodFrom: '2026-08-01',
          paymentMethod: 'CHECK',
          password: 'pin',
        },
      }),
      createMockRes(),
      next,
    );
    expect(asMockFn(next)).toHaveBeenCalled();
    expect(payDeliveryPayout).not.toHaveBeenCalled();
  });

  describe('delivery payout statements', () => {
    it('returns PDF attachment for a payout statement', async () => {
      vi.mocked(renderDeliveryPayoutStatementForId).mockResolvedValue({
        buffer: Buffer.from('%PDF-test'),
        filename: 'Delivery Partner - Jan.pdf',
      });
      const res = createMockRes();
      await getDeliveryPayoutStatementHandler(
        createMockReq({
          user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
          params: { id: 'payout-1' },
        }),
        res,
        createMockNext(),
      );
      expect(renderDeliveryPayoutStatementForId).toHaveBeenCalledWith('payout-1');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-test'));
    });

    it('propagates 404 when payout statement is missing', async () => {
      vi.mocked(renderDeliveryPayoutStatementForId).mockRejectedValue(new AppError('Delivery payout not found', 404));
      const next = createMockNext();
      await getDeliveryPayoutStatementHandler(
        createMockReq({
          user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
          params: { id: 'missing' },
        }),
        createMockRes(),
        next,
      );
      expect(thrownError(next).statusCode).toBe(404);
    });

    it('rejects empty zip body', async () => {
      const next = createMockNext();
      await downloadDeliveryPayoutStatementZipHandler(
        createMockReq({
          user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
          body: { ids: [] },
        }),
        createMockRes(),
        next,
      );
      expect(next).toHaveBeenCalled();
      expect(renderDeliveryPayoutStatementZip).not.toHaveBeenCalled();
    });

    it('returns zip attachment for multiple payout ids', async () => {
      vi.mocked(renderDeliveryPayoutStatementZip).mockResolvedValue(Buffer.from('PK'));
      const res = createMockRes();
      await downloadDeliveryPayoutStatementZipHandler(
        createMockReq({
          user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
          body: { ids: ['a', 'b'] },
        }),
        res,
        createMockNext(),
      );
      expect(renderDeliveryPayoutStatementZip).toHaveBeenCalledWith(['a', 'b']);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('PK'));
    });
  });

  describe('createDeliveryPayoutHandler', () => {
    const admin = { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' } as const;

    it('rejects periods other than 15 days', async () => {
      const next = createMockNext();
      await createDeliveryPayoutHandler(
        createMockReq({ user: admin, body: { periodDays: 30, password: 'pin' } }),
        createMockRes(),
        next,
      );
      expect(thrownError(next).statusCode).toBe(400);
      expect(createDeliveryPayout).not.toHaveBeenCalled();
    });

    it('creates a paid payout without proof when none is uploaded', async () => {
      vi.mocked(optionalSettlementProofUpload).mockResolvedValue(null);
      vi.mocked(createDeliveryPayout).mockResolvedValue({ id: 'payout-1', status: 'APPROVED' } as never);
      const res = createMockRes();
      await createDeliveryPayoutHandler(
        createMockReq({ user: admin, body: { periodDays: '15', password: 'pin' } }),
        res,
        createMockNext(),
      );
      expect(verifyAdminPin).toHaveBeenCalledWith('admin-1', 'pin');
      expect(createDeliveryPayout).toHaveBeenCalledWith(
        expect.objectContaining({ periodDays: 15, proofUrl: null }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creates a paid payout with the uploaded proof', async () => {
      vi.mocked(optionalSettlementProofUpload).mockResolvedValue('https://example.com/slip.pdf');
      vi.mocked(createDeliveryPayout).mockResolvedValue({ id: 'payout-1', status: 'APPROVED' } as never);
      const res = createMockRes();
      await createDeliveryPayoutHandler(
        createMockReq({ user: admin, body: { periodDays: '15', remarks: 'Aug', password: 'pin' } }),
        res,
        createMockNext(),
      );
      expect(createDeliveryPayout).toHaveBeenCalledWith({
        periodDays: 15,
        remarks: 'Aug',
        requestedById: 'admin-1',
        proofUrl: 'https://example.com/slip.pdf',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
