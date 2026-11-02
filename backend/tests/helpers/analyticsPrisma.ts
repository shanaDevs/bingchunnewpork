import { vi } from 'vitest';

/**
 * Shared prisma mock factory for analyticsController tests. Every analytics
 * export touches a different subset of these models, so we centralize the
 * mock shape here and let each test file reset only what it needs.
 */
export function emptyAggregate() {
  return {
    _sum: {
      total: null,
      quantity: null,
      balance: null,
      deliveryFee: null,
      convenientFee: null,
      discount: null,
      loyaltyDiscount: null,
    },
    _count: { id: 0 },
  };
}

export function createAnalyticsPrismaMock() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue(emptyAggregate()),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    orderItem: {
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItemTopping: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    storeWallet: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { balance: null } }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    store: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    storeProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    topping: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    deliveryJob: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    commissionSettlement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    platformRating: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    walletTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    storeWithdrawal: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

export type AnalyticsPrismaMock = ReturnType<typeof createAnalyticsPrismaMock>;

/** Reset every mocked prisma method back to its empty-dataset default. */
export function resetAnalyticsPrismaDefaults(prisma: any) {
  const p = prisma as AnalyticsPrismaMock;
  vi.mocked(p.$queryRaw).mockResolvedValue([] as never);
  vi.mocked(p.order.count).mockResolvedValue(0 as never);
  vi.mocked(p.order.aggregate).mockResolvedValue(emptyAggregate() as never);
  vi.mocked(p.order.findMany).mockResolvedValue([] as never);
  vi.mocked(p.order.findFirst).mockResolvedValue(null);
  (p.order.groupBy as any).mockResolvedValue([]);
  vi.mocked(p.user.count).mockResolvedValue(0 as never);
  vi.mocked(p.user.findMany).mockResolvedValue([] as never);
  vi.mocked(p.user.findUnique).mockResolvedValue(null);
  vi.mocked(p.user.findFirst).mockResolvedValue(null);
  (p.orderItem.groupBy as any).mockResolvedValue([]);
  vi.mocked(p.orderItem.aggregate).mockResolvedValue({ _sum: { quantity: null } } as never);
  vi.mocked(p.orderItem.findMany).mockResolvedValue([] as never);
  (p.orderItemTopping.groupBy as any).mockResolvedValue([]);
  vi.mocked(p.storeWallet.findMany).mockResolvedValue([] as never);
  vi.mocked(p.storeWallet.aggregate).mockResolvedValue({ _sum: { balance: null } } as never);
  vi.mocked(p.storeWallet.findUnique).mockResolvedValue(null);
  vi.mocked(p.store.findMany).mockResolvedValue([] as never);
  vi.mocked(p.store.findFirst).mockResolvedValue(null);
  vi.mocked(p.product.findMany).mockResolvedValue([] as never);
  vi.mocked(p.storeProduct.findMany).mockResolvedValue([] as never);
  vi.mocked(p.topping.findMany).mockResolvedValue([] as never);
  vi.mocked(p.deliveryJob.findMany).mockResolvedValue([] as never);
  vi.mocked(p.adminUser.findMany).mockResolvedValue([] as never);
  vi.mocked(p.commissionSettlement.findMany).mockResolvedValue([] as never);
  vi.mocked(p.commissionSettlement.count).mockResolvedValue(0 as never);
  vi.mocked(p.platformRating.findMany).mockResolvedValue([] as never);
  vi.mocked(p.walletTransaction.findMany).mockResolvedValue([] as never);
  vi.mocked(p.storeWithdrawal.findMany).mockResolvedValue([] as never);
}
