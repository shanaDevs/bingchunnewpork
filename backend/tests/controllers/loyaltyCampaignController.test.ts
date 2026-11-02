import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    product: { findFirst: vi.fn() },
    loyaltyCampaign: { update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/loyaltyCampaign', () => ({
  ensurePlatformLoyaltyCampaign: vi.fn().mockResolvedValue(undefined),
  getPlatformLoyaltyCampaign: vi.fn().mockResolvedValue({ id: 'camp-1', storeId: null }),
  getBranchLoyaltyOverride: vi.fn().mockResolvedValue(null),
  resolveLoyaltyCampaign: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { getPlatformLoyaltyCampaign } from '../../src/lib/loyaltyCampaign';
import {
  loyaltyCampaignBodySchema,
  upsertLoyaltyCampaignAdmin,
} from '../../src/controllers/loyaltyCampaignController';

function thrownError(next: ReturnType<typeof createMockNext>) {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

describe('loyaltyCampaignBodySchema', () => {
  it('accepts non-UUID offer2GiftProductId', () => {
    const parsed = loyaltyCampaignBodySchema.parse({
      offer2GiftProductId: 'prod-blueberry-milkshake',
    });
    expect(parsed.offer2GiftProductId).toBe('prod-blueberry-milkshake');
  });

  it('coerces empty offer2GiftProductId to null', () => {
    const parsed = loyaltyCampaignBodySchema.parse({ offer2GiftProductId: '' });
    expect(parsed.offer2GiftProductId).toBeNull();
  });
});

describe('upsertLoyaltyCampaignAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves gift product id before platform update', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({
      id: 'prod-blueberry-milkshake',
    } as Awaited<ReturnType<typeof prisma.product.findFirst>>);
    vi.mocked(prisma.loyaltyCampaign.update).mockResolvedValue({
      id: 'camp-1',
      storeId: null,
      offer1Enabled: true,
      offer1DiscountType: 'PERCENTAGE',
      offer1DiscountValue: 20,
      offer1MinSubtotal: 0,
      offer2Enabled: true,
      offer2DiscountType: 'PERCENTAGE',
      offer2DiscountValue: 0,
      offer2RewardType: 'GIFT',
      offer2GiftProductId: 'prod-blueberry-milkshake',
      offer2WindowDays: 7,
      offer2MinSubtotal: 0,
      offer3Enabled: true,
      offer3RequiredOrders: 3,
      offer3OptionAMinEach: 0,
      offer3OptionBCombinedMin: 0,
      offer3MatchMode: 'A_OR_B',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      ownership: 'PLATFORM',
      branchSharePct: 0,
      platformSharePct: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = createMockRes();
    const next = createMockNext();
    await upsertLoyaltyCampaignAdmin(
      createMockReq({
        user: { type: 'admin', role: 'SYSTEM_ADMIN' },
        body: {
          offer2GiftProductId: 'blueberry-milkshake',
          storeId: null,
        },
      }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'blueberry-milkshake' }, { slug: 'blueberry-milkshake' }],
        isAvailable: true,
      },
      select: { id: true },
    });
    expect(prisma.loyaltyCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          offer2GiftProductId: 'prod-blueberry-milkshake',
        }),
      }),
    );
    expect(getPlatformLoyaltyCampaign).toHaveBeenCalled();
  });

  it('returns 400 when gift product cannot be resolved', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    const next = createMockNext();
    await upsertLoyaltyCampaignAdmin(
      createMockReq({
        user: { type: 'admin', role: 'SYSTEM_ADMIN' },
        body: { offer2GiftProductId: 'missing-product', storeId: null },
      }),
      createMockRes(),
      next,
    );

    const err = thrownError(next);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/gift product/i);
  });
});
