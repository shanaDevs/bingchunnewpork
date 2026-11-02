import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => {
  const prisma = {
    spinResult: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    spinWheelOffer: {
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(async (fn: unknown) =>
      typeof fn === 'function' ? (fn as (tx: typeof prisma) => unknown)(prisma) : fn,
    ),
  };
  return { prisma };
});

vi.mock('../../src/lib/appSchema', () => ({
  ensureAppSchema: vi.fn().mockResolvedValue(undefined),
  getSpinSettings: vi.fn().mockResolvedValue({
    spinEnabled: true,
    spinsPerWindow: 1,
    spinWindowHours: 24,
    spinTrackByIp: false,
    firstOrderOnly: false,
    criteria: [],
  }),
}));

vi.mock('../../src/lib/spinOffers', () => ({
  countActiveSpinOffersForStore: vi.fn().mockResolvedValue(2),
  resolveActiveSpinOffersForStore: vi.fn().mockResolvedValue([
    { id: 'offer-a', sortOrder: 0 },
    { id: 'offer-b', sortOrder: 1 },
  ]),
}));

vi.mock('../../src/lib/spinEligibilityRules', () => ({
  evaluateSpinAudienceRules: vi.fn().mockResolvedValue({ canSpin: true, reason: null }),
}));

vi.mock('../../src/lib/loyaltyCampaign', () => ({
  resolveLoyaltyCampaign: vi.fn().mockResolvedValue(null),
  getPlatformLoyaltyCampaign: vi.fn().mockResolvedValue(null),
  rollSpinPrizeWin: vi.fn().mockReturnValue(false),
}));

import { playSpin } from '../../src/controllers/spinController';
import { prisma } from '../../src/lib/prisma';

describe('playSpin concurrency', () => {
  const next = createMockNext() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ] as never);
    vi.mocked(prisma.spinWheelOffer.findMany).mockResolvedValue([
      {
        id: 'offer-a',
        offerType: 'PERCENTAGE',
        weight: 1,
        discountValue: 10,
        label: '10%',
        description: '',
        minOrderValue: 0,
        sortOrder: 0,
        giftProduct: null,
      },
      {
        id: 'offer-b',
        offerType: 'NO_PRIZE',
        weight: 1,
        discountValue: 0,
        label: 'Try again',
        description: '',
        minOrderValue: 0,
        sortOrder: 1,
        giftProduct: null,
      },
    ] as never);
    vi.mocked(prisma.spinResult.create).mockResolvedValue({
      id: 'spin-1',
      claimCode: 'SPIN-ABC',
      expiresAt: new Date(),
      offer: {
        id: 'offer-b',
        offerType: 'NO_PRIZE',
        discountValue: 0,
        label: 'Try again',
        description: '',
        minOrderValue: 0,
        giftProduct: null,
      },
    } as never);
  });

  it('rejects a second spin when the window allowance is already used under lock', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { createdAt: new Date() },
    ] as never);

    const req = createMockReq({
      body: { guestKey: 'guest-key-12345678' },
    });
    const res = createMockRes();

    await playSpin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(429);
    expect(prisma.spinResult.create).not.toHaveBeenCalled();
  });
});
