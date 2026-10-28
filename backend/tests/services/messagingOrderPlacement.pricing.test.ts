import { beforeEach, describe, expect, it, vi } from 'vitest';

const orderCreate = vi.fn();

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    productTopping: { findMany: vi.fn() },
    order: { update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ order: { create: orderCreate } }),
    ),
  },
}));

vi.mock('../../src/lib/storeOrderingSchema', () => ({
  fetchStoreOrderingHours: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/storeOrderingHours', () => ({
  isBranchManuallyClosed: vi.fn().mockReturnValue(false),
  isCustomerOnlineOrderingOpen: vi.fn().mockReturnValue(true),
  branchManuallyClosedMessage: vi.fn(),
  customerOnlineOrderingClosedMessage: vi.fn(),
}));

vi.mock('../../src/lib/stockEngine', () => ({
  validateOrderStock: vi.fn().mockResolvedValue(undefined),
  deductOrderItemsOnce: vi.fn(),
}));

vi.mock('../../src/integrations/mapsAdapter', () => ({
  mapsAdapter: { geocode: vi.fn() },
}));

vi.mock('../../src/lib/deliveryFee', () => ({
  resolveDeliveryValidation: vi.fn().mockResolvedValue({
    zone: { id: 'z1', fee: 0, minOrder: 0 },
    distanceKm: 1,
    estimatedMinutes: 30,
  }),
  DELIVERY_MIN_ORDER: 0,
}));

vi.mock('../../src/lib/branchNotifications', () => ({
  mapNotifyOrderItems: vi.fn().mockReturnValue([]),
  notifyBranchNewOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/messaging/customerChannelService', () => ({
  findOrCreateUserByPhone: vi.fn().mockResolvedValue({ id: 'u1' }),
  linkCustomerChannel: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { computeUnitPriceFromProduct } from '../../src/lib/pricing';
import { placeMessagingOrder } from '../../src/services/messaging/messagingOrderPlacement';

describe('placeMessagingOrder pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderCreate.mockImplementation(async ({ data }) => ({
      id: 'order-1',
      orderNumber: 'BC1',
      total: data.total,
      subtotal: data.subtotal,
      items: [],
      store: { name: 'Test' },
    }));
    vi.mocked(prisma.store.findFirst).mockResolvedValue({
      id: 'store-1',
      name: 'Test',
      isActive: true,
      lat: 6.9,
      lng: 79.8,
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Milk Tea',
        basePrice: 500,
        isAvailable: true,
        categoryId: 'cat-1',
      },
    ] as never);
    vi.mocked(prisma.productTopping.findMany).mockResolvedValue([]);
  });

  it('charges LARGE surcharge from catalog pricing, not session unitPrice', async () => {
    const expectedLarge = computeUnitPriceFromProduct(
      { basePrice: 500, isAvailable: true, name: 'Milk Tea' } as never,
      'LARGE',
      [],
      [],
    );

    await placeMessagingOrder({
      channel: 'WHATSAPP',
      externalUserId: 'wa-1',
      storeId: 'store-1',
      cart: [
        {
          productId: 'prod-1',
          productName: 'Milk Tea',
          quantity: 1,
          unitPrice: 500,
          size: 'LARGE',
        },
      ],
      guestName: 'Guest',
      guestPhone: '0771234567',
      addressLine: '1 Main St',
      city: 'Colombo',
      orderMode: 'TAKEAWAY',
      paymentMethod: 'CASH_AT_COUNTER',
    });

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: expectedLarge,
          items: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ unitPrice: expectedLarge, size: 'LARGE' }),
            ]),
          }),
        }),
      }),
    );
  });
});
