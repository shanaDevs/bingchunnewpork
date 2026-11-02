import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    refund: {
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/orderStatusRefundConfig', () => ({
  getRefundPercentageForStatus: vi.fn(),
}));

import {
  enrichRefundForDisplay,
  resolveEffectiveSalesTotal,
  resolvePartialRefundValues,
} from '../../src/lib/enrichRefundForDisplay';
import { getRefundPercentageForStatus } from '../../src/lib/orderStatusRefundConfig';
import { prisma } from '../../src/lib/prisma';

describe('enrichRefundForDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(60);
  });

  it('returns full refund records unchanged', async () => {
    const refund = {
      id: 'refund-full',
      status: 'RECEIVED',
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: true,
      refundPercentage: null,
      refundAmount: null,
      salesTotal: 1498,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund);
    expect(result).toEqual(refund);
    expect(getRefundPercentageForStatus).not.toHaveBeenCalled();
  });

  it('computes percentage and amount for legacy partial refunds', async () => {
    const refund = {
      id: 'refund-partial',
      status: 'RECEIVED',
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: null,
      refundAmount: null,
      salesTotal: 1498,
      cancelledAtStatus: null,
      configuredStatusRefundPercentage: null,
      order: {
        statusEvents: [
          { status: 'RECEIVED', createdAt: new Date('2026-08-19T10:49:00Z') },
          { status: 'READY', createdAt: new Date('2026-08-19T10:55:00Z') },
          { status: 'CANCELLED', createdAt: new Date('2026-08-19T10:56:00Z') },
        ],
      },
    };

    const result = await enrichRefundForDisplay(refund);

    expect(result.refundPercentage).toBe(60);
    expect(result.refundAmount).toBe(899);
    expect(result.cancelledAtStatus).toBe('READY');
    expect(result.configuredStatusRefundPercentage).toBe(60);
  });

  it('overlays live status refund percentage for pending partial refunds', async () => {
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(25);

    const refund = {
      id: 'refund-pending',
      status: 'RECEIVED' as const,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 40,
      refundAmount: 260,
      salesTotal: 650,
      cancelledAtStatus: 'OUT_FOR_DELIVERY',
      configuredStatusRefundPercentage: 40,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund);

    expect(result.refundPercentage).toBe(25);
    expect(result.refundAmount).toBe(163);
    expect(getRefundPercentageForStatus).toHaveBeenCalledWith('OUT_FOR_DELIVERY');
  });

  it('uses a provided percentage map instead of per-row lookups', async () => {
    const refund = {
      id: 'refund-mapped',
      status: 'RECEIVED' as const,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 80,
      refundAmount: 800,
      salesTotal: 1000,
      cancelledAtStatus: 'PREPARING',
      configuredStatusRefundPercentage: 80,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund, {
      percentageMap: new Map([['PREPARING', 50]]),
    });

    expect(result.refundPercentage).toBe(50);
    expect(result.refundAmount).toBe(500);
    expect(getRefundPercentageForStatus).not.toHaveBeenCalled();
  });

  it('keeps stored percentage and amount after COMPLETE', async () => {
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(25);

    const refund = {
      id: 'refund-complete',
      status: 'COMPLETE' as const,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 40,
      refundAmount: 260,
      salesTotal: 650,
      cancelledAtStatus: 'OUT_FOR_DELIVERY',
      configuredStatusRefundPercentage: 40,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund);

    expect(result.refundPercentage).toBe(40);
    expect(result.refundAmount).toBe(260);
    expect(getRefundPercentageForStatus).not.toHaveBeenCalled();
  });

  it('keeps stored percentage and amount after REJECTED', async () => {
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(25);

    const refund = {
      id: 'refund-rejected',
      status: 'REJECTED' as const,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 80,
      refundAmount: 800,
      salesTotal: 1000,
      cancelledAtStatus: 'PREPARING',
      configuredStatusRefundPercentage: 80,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund);

    expect(result.refundPercentage).toBe(80);
    expect(result.refundAmount).toBe(800);
    expect(getRefundPercentageForStatus).not.toHaveBeenCalled();
  });

  it('recomputes salesTotal from order when stored value is zero', async () => {
    const refund = {
      id: 'refund-zero-sales',
      status: 'RECEIVED',
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: null,
      refundAmount: null,
      salesTotal: 0,
      cancelledAtStatus: 'READY',
      configuredStatusRefundPercentage: null,
      order: {
        subtotal: 1510,
        discount: 0,
        loyaltyDiscount: 12,
        statusEvents: [],
      },
    };

    expect(resolveEffectiveSalesTotal(refund)).toBe(1498);

    const result = await enrichRefundForDisplay(refund);
    expect(result.salesTotal).toBe(1498);
    expect(result.refundAmount).toBe(899);
  });

  it('lazy-persists RECEIVED partial refunds when requested', async () => {
    const refund = {
      id: 'refund-persist',
      status: 'RECEIVED',
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: null,
      refundAmount: null,
      salesTotal: 1000,
      cancelledAtStatus: 'PREPARING',
      configuredStatusRefundPercentage: null,
      order: { statusEvents: [] },
    };

    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(80);

    await enrichRefundForDisplay(refund, { persistIfReceived: true });

    expect(prisma.refund.update).toHaveBeenCalledWith({
      where: { id: 'refund-persist' },
      data: expect.objectContaining({
        refundPercentage: 80,
        refundAmount: 800,
        cancelledAtStatus: 'PREPARING',
      }),
    });
  });

  it('does not persist live overlay when pending values already exist', async () => {
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(25);

    const refund = {
      id: 'refund-existing',
      status: 'RECEIVED' as const,
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      refundPercentage: 40,
      refundAmount: 260,
      salesTotal: 650,
      cancelledAtStatus: 'OUT_FOR_DELIVERY',
      configuredStatusRefundPercentage: 40,
      order: { statusEvents: [] },
    };

    const result = await enrichRefundForDisplay(refund, { persistIfReceived: true });

    expect(result.refundPercentage).toBe(25);
    expect(prisma.refund.update).not.toHaveBeenCalled();
  });
});

describe('resolvePartialRefundValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(25);
  });

  it('uses live status refund percentage at approval even if a snapshot exists', async () => {
    const resolved = await resolvePartialRefundValues({
      refundPercentage: 40,
      refundAmount: 260,
      salesTotal: 650,
      cancelledAtStatus: 'OUT_FOR_DELIVERY',
      configuredStatusRefundPercentage: 40,
      order: { statusEvents: [] },
    });

    expect(resolved.refundPercentage).toBe(25);
    expect(resolved.refundAmount).toBe(163);
    expect(getRefundPercentageForStatus).toHaveBeenCalledWith('OUT_FOR_DELIVERY');
  });
});
