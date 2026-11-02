import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    order: { findFirst: vi.fn() },
    refund: { findFirst: vi.fn() },
  },
}));

vi.mock('../../src/lib/deliveryPayoutSchema', () => ({
  ensureDeliveryPayoutSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/deliveryWalletService', () => ({
  getDeliveryWalletSummary: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { getDeliveryWalletSummary } from '../../src/lib/deliveryWalletService';
import {
  approveDeliveryPayout,
  attachDeliveryPayoutProof,
  createDeliveryPayout,
  listDeliveryPayouts,
  listElapsedDeliveryPayoutWindows,
  payDeliveryPayout,
} from '../../src/lib/deliveryPayoutService';

const summaryFixture = {
  netForDelivery: 882.9,
  branches: [],
  grossDeliveryFee: 1000,
  platformFee: 100,
  afterPlatformFee: 900,
  gatewayFee: 17.1,
  platformFeePercent: 10,
  gatewayFeePercent: 1.9,
  fromActiveOrders: 1000,
  fromLateCancels: 0,
  orderCount: 1,
  lateCancelCount: 0,
  platformFeeRate: 0.1,
  gatewayFeeRate: 0.019,
};

const approvedRow = {
  id: 'payout-1',
  amount: 88290,
  status: 'APPROVED',
  remarks: null,
  periodFrom: new Date('2026-08-01T00:00:00.000Z'),
  periodTo: new Date('2026-08-15T23:59:59.999Z'),
  requestedById: 'admin-1',
  breakdown: {},
  paymentMethod: 'BANK_TRANSFER',
  proofUrl: 'https://example.com/slip.pdf',
  reviewedById: 'admin-1',
  reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const pendingRow = {
  ...approvedRow,
  status: 'PENDING',
  proofUrl: null,
  paymentMethod: null,
  reviewedById: null,
  reviewedAt: null,
};

describe('listElapsedDeliveryPayoutWindows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    } as never);
    vi.mocked(prisma.refund.findFirst).mockResolvedValue(null);
  });

  it('returns completed windows with positive net only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue(summaryFixture as never);

    const windows = await listElapsedDeliveryPayoutWindows(2);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0]?.days).toBe(15);
    expect(windows[0]?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(windows[0]!.to < '2026-08-20').toBe(true);
    vi.useRealTimers();
  });

  it('skips zero-net windows but continues', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    vi.mocked(getDeliveryWalletSummary)
      .mockResolvedValueOnce({ ...summaryFixture, netForDelivery: 0 } as never)
      .mockResolvedValueOnce(summaryFixture as never);

    const windows = await listElapsedDeliveryPayoutWindows(1);
    expect(windows).toHaveLength(1);
    vi.useRealTimers();
  });

  it('does not require proof to approve (it can be uploaded later)', async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([pendingRow] as never)
      .mockResolvedValueOnce([{ ...pendingRow, status: 'APPROVED', proofUrl: null }] as never);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({ netForDelivery: 900 } as never);
    const result = await approveDeliveryPayout({
      payoutId: 'payout-1',
      reviewerId: 'approver-1',
    });
    expect(result.status).toBe('APPROVED');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "delivery_payouts"'),
      'approver-1',
      null,
      'payout-1',
    );
  });
});

describe('payDeliveryPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    } as never);
    vi.mocked(prisma.refund.findFirst).mockResolvedValue(null);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue(summaryFixture as never);
  });

  it('rejects stale periodFrom', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as never);
    });

    await expect(
      payDeliveryPayout({
        periodFrom: '2026-07-01',
        paymentMethod: 'CASH',
        proofUrl: 'https://example.com/slip.pdf',
        adminId: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    vi.useRealTimers();
  });

  it('maps overlapping period inserts to 409', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(Object.assign(new Error('exclusion'), { code: '23P01' })),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as never);
    });

    const windows = await listElapsedDeliveryPayoutWindows(1);
    if (windows[0]) {
      await expect(
        payDeliveryPayout({
          periodFrom: windows[0].from,
          paymentMethod: 'CASH',
          proofUrl: 'https://example.com/slip.pdf',
          adminId: 'admin-1',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    }
    vi.useRealTimers();
  });
});

describe('createDeliveryPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    } as never);
    vi.mocked(prisma.refund.findFirst).mockResolvedValue(null);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue(summaryFixture as never);
  });

  it('maps overlapping period inserts to 409', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(Object.assign(new Error('exclusion'), { code: '23P01' })),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as never);
    });

    await expect(
      createDeliveryPayout({
        periodDays: 15,
        requestedById: 'requester-1',
        proofUrl: 'https://example.com/slip.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    vi.useRealTimers();
  });

  it('only accepts the fixed 15-day period', async () => {
    await expect(
      createDeliveryPayout({
        periodDays: 30,
        requestedById: 'admin-1',
        proofUrl: 'https://example.com/slip.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('does not require a payment proof up front', async () => {
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue({ netForDelivery: 0 } as never);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.refund.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn({
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      } as never),
    );

    await expect(
      createDeliveryPayout({ periodDays: 15, requestedById: 'admin-1' }),
    ).rejects.toMatchObject({ message: expect.not.stringContaining('proof') });
  });
});

describe('payDeliveryPayout success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    } as never);
    vi.mocked(prisma.refund.findFirst).mockResolvedValue(null);
    vi.mocked(getDeliveryWalletSummary).mockResolvedValue(summaryFixture as never);
  });

  it('inserts an APPROVED payout row', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([] as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));

    const windows = await listElapsedDeliveryPayoutWindows(1);
    const target = windows[0];
    if (!target) {
      vi.useRealTimers();
      return;
    }

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([approvedRow]),
      };
      return fn(tx as never);
    });

    const result = await payDeliveryPayout({
      periodFrom: target.from,
      paymentMethod: 'BANK_TRANSFER',
      proofUrl: 'https://example.com/slip.pdf',
      adminId: 'admin-1',
    });
    expect(result.status).toBe('APPROVED');
    expect(result.proofUrl).toBeNull();
    expect(result.hasProof).toBe(true);
    vi.useRealTimers();
  });
});

describe('attachDeliveryPayoutProof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const paidRow = { ...pendingRow, status: 'APPROVED', proofUrl: null };

  it('adds proof to a paid payout that has none', async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([paidRow] as never)
      .mockResolvedValueOnce([{ ...paidRow, proofUrl: 'https://example.com/slip.pdf' }] as never);
    const result = await attachDeliveryPayoutProof({
      payoutId: 'payout-1',
      proofUrl: 'https://example.com/slip.pdf',
    });
    expect(result.proofUrl).toBeNull();
    expect(result.hasProof).toBe(true);
  });

  it('refuses when the payout already has proof', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { ...paidRow, proofUrl: 'https://example.com/old.pdf' },
    ] as never);
    await expect(
      attachDeliveryPayoutProof({ payoutId: 'payout-1', proofUrl: 'https://example.com/new.pdf' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses for payouts that are not paid', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([pendingRow] as never);
    await expect(
      attachDeliveryPayoutProof({ payoutId: 'payout-1', proofUrl: 'https://example.com/new.pdf' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('listDeliveryPayouts', () => {
  it('never returns proofUrl; exposes hasProof instead', async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ ...approvedRow, proofUrl: 'https://secret/slip.pdf' }] as never)
      .mockResolvedValueOnce([{ n: 1 }] as never);
    const result = await listDeliveryPayouts({ page: 1, limit: 10 });
    expect(result.items[0]?.proofUrl).toBeNull();
    expect(result.items[0]?.hasProof).toBe(true);
    expect(result.items[0]?.amountLkr).toBe(882.9);

    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ ...approvedRow, proofUrl: null }] as never)
      .mockResolvedValueOnce([{ n: 1 }] as never);
    const noProof = await listDeliveryPayouts({ page: 1, limit: 10 });
    expect(noProof.items[0]?.hasProof).toBe(false);
  });
});
