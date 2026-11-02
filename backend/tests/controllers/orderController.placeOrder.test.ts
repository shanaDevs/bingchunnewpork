import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/orderIdempotency', () => ({
  acquireOrderIdempotencySessionLock: vi.fn().mockResolvedValue(undefined),
  releaseOrderIdempotencySessionLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/prisma', () => {
  const prisma = {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    topping: {
      findMany: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
    },
    cartItem: {
      deleteMany: vi.fn(),
    },
    deliveryZone: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
    },
    promoCode: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    loyaltySetting: {
      findUnique: vi.fn(),
    },
    loyaltyTransaction: {
      create: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { points: 1000 } }),
    },
    loyaltyCampaign: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    address: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    spinResult: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    promotionUsage: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  prisma.$transaction = vi.fn(async (fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: typeof prisma) => unknown)(prisma) : fn,
  );
  return { prisma };
});

vi.mock('../../src/lib/storeOrderingSchema', () => ({
  fetchStoreOrderingHours: vi.fn().mockResolvedValue(null),
  ensureStoreOrderingHoursColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/storeOrderingHours', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/storeOrderingHours')>();
  return {
    ...actual,
    isOnlineOrderingOpen: vi.fn().mockReturnValue(true),
    // placeOrder checks isCustomerOnlineOrderingOpen for web/mobile; keep branch-close behavior
    // but avoid flaky local-timezone hour windows (see beforeEach fake timers).
    isCustomerOnlineOrderingOpen: vi.fn((store, now?) => {
      if (actual.isBranchManuallyClosed(store)) return false;
      return true;
    }),
  };
});

vi.mock('../../src/lib/orderSchema', () => ({
  ensureOrderDeliveryColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/orderIdempotency', () => ({
  acquireOrderIdempotencySessionLock: vi.fn().mockResolvedValue(undefined),
  releaseOrderIdempotencySessionLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/pricing')>();
  return {
    ...actual,
    computeUnitPrice: vi.fn(),
    batchResolveLinePricing: vi.fn(),
  };
});

vi.mock('../../src/lib/paymentSettings', () => ({
  assertPaymentMethodAllowed: vi.fn().mockResolvedValue(undefined),
  getPaymentSettings: vi.fn().mockResolvedValue({
    activeOnlineGateway: 'PAYHERE',
    methods: {},
    payhere: { merchantId: '', merchantSecret: '', mode: 'sandbox', configured: true },
    webxpay: {
      publicKey: '',
      secretKey: '',
      apiUsername: '',
      apiPassword: '',
      mode: 'sandbox',
      returnUrl: '',
      configured: false,
    },
  }),
}));

vi.mock('../../src/lib/appSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appSchema')>();
  return {
    ...actual,
    getConvenienceFeeRates: vi.fn().mockResolvedValue({ pickup: 0.06, delivery: 0.075 }),
    getConvenientFeeRate: vi.fn().mockResolvedValue(0.075),
    getPickupOrderEditSettings: vi.fn().mockResolvedValue({
      allowAddItemsPaidOnline: true,
      allowEditCashUnpaid: true,
    }),
  };
});

vi.mock('../../src/lib/stockEngine', () => ({
  validateOrderStock: vi.fn().mockResolvedValue(undefined),
  deductOrderItems: vi.fn().mockResolvedValue(undefined),
  deductOrderItemsOnce: vi.fn().mockResolvedValue(undefined),
  restoreOrderItems: vi.fn().mockResolvedValue(undefined),
  orderStockWasDeducted: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/services/inventoryReservationService', () => ({
  createCheckoutReservation: vi.fn().mockResolvedValue({ reservationUuid: 'res-1' }),
  validateAndLinkReservationToOrder: vi.fn().mockResolvedValue(undefined),
  InsufficientStockError: class InsufficientStockError extends Error {},
}));

vi.mock('../../src/lib/branchNotifications', () => ({
  notifyBranchNewOrder: vi.fn().mockResolvedValue(undefined),
  mapNotifyOrderItems: vi.fn((items: unknown) => items),
}));

vi.mock('../../src/lib/customerNotifications', () => ({
  notifyCustomerOrderPlaced: vi.fn().mockResolvedValue(undefined),
  notifyCustomerOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/integrations/smsAdapter', () => ({
  sendOrderConfirmationSms: vi.fn().mockResolvedValue(undefined),
  sendOrderReceiptSms: vi.fn().mockResolvedValue(undefined),
  sendOrderStatusSms: vi.fn().mockResolvedValue(undefined),
  orderSmsPhone: vi.fn((order?: { guestPhone?: string | null; user?: { phone?: string | null } | null }) =>
    order?.guestPhone || order?.user?.phone || null,
  ),
}));

vi.mock('../../src/integrations/emailAdapter', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/integrations/paymentAdapter', () => ({
  getPaymentAdapter: vi.fn(),
}));

vi.mock('../../src/services/messaging/messagingNotificationService', () => ({
  notifyMessagingOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/takeawayQueue', () => ({
  assignTakeawayQueueSlot: vi.fn(),
  TAKEAWAY_SLOT_MINUTES: 15,
}));

vi.mock('../../src/lib/resolveFrontendUrl', () => ({
  resolveFrontendUrl: vi.fn().mockReturnValue('https://frontend.example'),
}));

vi.mock('../../src/utils/orderNumber', () => ({
  generateOrderNumber: vi.fn().mockReturnValue('BC260722-9001'),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,MOCKQR'),
  },
}));

vi.mock('../../src/lib/deliveryFee', () => ({
  DELIVERY_MIN_ORDER: 500,
  resolveDeliveryValidation: vi.fn(),
}));

vi.mock('../../src/lib/loyaltyCampaign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/loyaltyCampaign')>();
  return {
    ...actual,
    evaluateLoyaltyForStore: vi.fn().mockResolvedValue({
      campaign: null,
      cartDiscount: null,
      spin: { enabled: false, unlocked: false, requiredOrders: 0, validOrderCount: 0 },
    }),
    isLoyaltyPromoCode: vi.fn().mockReturnValue(false),
    assertLoyaltyOfferCodeStillValidInTx: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/lib/spinOfferPromo', () => ({
  findPromoForSpinOffer: vi.fn().mockResolvedValue(null),
  isSpinLinkedPromo: vi.fn().mockReturnValue(false),
  syncSpinOfferToPromo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/loyaltySettingStore', () => ({
  fetchLoyaltySettingRow: vi.fn().mockResolvedValue({
    id: 'default',
    pointsPerLkr: 0.01,
    redeemValue: 1,
    maxRedeemPct: 20,
    minOrderToEarn: 999999,
    referralBonusPoints: 0,
    customerRedeemEnabled: true,
    checkoutRedeemEnabled: true,
    minPointsToRedeem: 0,
    tiersJson: '[]',
    redeemRewardsJson: '[]',
    upcomingOffersJson: '[]',
  }),
}));

import { placeOrder } from '../../src/controllers/orderController';
import { prisma } from '../../src/lib/prisma';
import { batchResolveLinePricing, computeUnitPrice } from '../../src/lib/pricing';
import { assertPaymentMethodAllowed } from '../../src/lib/paymentSettings';
import { notifyBranchNewOrder } from '../../src/lib/branchNotifications';
import { notifyCustomerOrderPlaced } from '../../src/lib/customerNotifications';
import { sendOrderConfirmationSms } from '../../src/integrations/smsAdapter';
import { sendOrderConfirmationEmail } from '../../src/integrations/emailAdapter';
import { getPaymentAdapter } from '../../src/integrations/paymentAdapter';
import { assignTakeawayQueueSlot } from '../../src/lib/takeawayQueue';
import { resolveDeliveryValidation, DELIVERY_MIN_ORDER } from '../../src/lib/deliveryFee';
import { evaluateLoyaltyForStore, isLoyaltyPromoCode } from '../../src/lib/loyaltyCampaign';
import { findPromoForSpinOffer } from '../../src/lib/spinOfferPromo';
import { AppError } from '../../src/middleware/errorHandler';
import QRCode from 'qrcode';

const activeStore = {
  id: 'store-1',
  name: 'Nugegoda',
  isActive: true,
  deliveryEnabled: true,
  openTime: '08:00',
  closeTime: '22:00',
};

const activeZone = {
  id: 'zone-1',
  storeId: 'store-1',
  isGlobal: false,
  isActive: true,
  fee: 150,
  minOrder: 500,
  store: { id: 'store-1', isActive: true },
};

const defaultEligibleValidation = {
  eligible: true,
  deliverable: true,
  store: {
    id: 'store-1',
    name: 'Nugegoda',
    address: 'Addr',
    openTime: '08:00',
    closeTime: '22:00',
    lat: 6.86,
    lng: 79.89,
  },
  zone: {
    id: 'distance-based-delivery',
    name: 'Distance-based delivery',
    fee: 150,
    minOrder: 500,
  },
  distanceKm: 1,
  estimatedMinutes: 35,
};

function buildCreatedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'BC260722-9001',
    userId: undefined,
    guestName: 'John Doe',
    guestPhone: '0771234567',
    storeId: 'store-1',
    orderMode: 'DELIVERY',
    status: 'RECEIVED',
    paymentMethod: 'CASH_AT_COUNTER',
    paymentStatus: 'PENDING',
    subtotal: 1000,
    deliveryFee: 150,
    convenientFee: 0,
    discount: 0,
    loyaltyDiscount: 0,
    total: 1150,
    prepaidAmount: 0,
    estimatedMinutes: 35,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Milk Tea',
        size: 'REGULAR',
        quantity: 2,
        unitPrice: 500,
        totalPrice: 1000,
        toppings: [],
        product: { imageUrl: null },
      },
    ],
    store: { name: 'Nugegoda' },
    createdAt: new Date('2026-07-22T10:00:00.000Z'),
    updatedAt: new Date('2026-07-22T10:00:00.000Z'),
    ...overrides,
  };
}

/** Matches production preset slots (15/30/45), rounded up to 5-minute steps. */
function presetScheduledAtIso(minutes = 30): string {
  const stepMs = 5 * 60_000;
  const target = new Date(Math.ceil((Date.now() + minutes * 60_000) / stepMs) * stepMs);
  return target.toISOString();
}

const deliveryBody = {
  orderMode: 'DELIVERY',
  storeId: 'store-1',
  deliveryZoneId: 'zone-1',
  items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
  deliveryAddress: {
    addressLine: '123 Main St',
    city: 'Colombo',
    district: 'Colombo',
    lat: 6.87,
    lng: 79.89,
  },
  paymentMethod: 'CASH_AT_COUNTER',
  guestName: 'John Doe',
  guestPhone: '0771234567',
  // Required when the store is not within the pre-close schedule lock window.
  scheduledAt: presetScheduledAtIso(30),
};

const checkoutIdempotencyHeader = { 'idempotency-key': 'test-checkout-idem-key' };

function reqForPlaceOrder(overrides: Parameters<typeof createMockReq>[0] = {}) {
  const headers = {
    ...checkoutIdempotencyHeader,
    ...(overrides.headers as Record<string, string> | undefined),
  };
  return createMockReq({ ...overrides, headers });
}

describe('placeOrder', () => {
  const next = createMockNext();

  beforeEach(() => {
    // Store hours are 08:00–22:00 in the runner's local timezone. CI is UTC,
    // so "now + 30 minutes" before 08:00 UTC is not a valid preset slot and
    // gets rejected as a custom time (45-minute lead). Freeze midday UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
    deliveryBody.scheduledAt = presetScheduledAtIso(30);
    vi.clearAllMocks();
    vi.mocked(batchResolveLinePricing).mockImplementation(async (lines) => {
      const map = new Map<
        string,
        { unitPrice: number; toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number } }> }
      >();
      for (const line of lines) {
        map.set(`${line.productId}:${line.size}:${line.toppingIds.join(',')}`, {
          unitPrice: 500,
          toppings: [],
        });
      }
      return map;
    });
    vi.mocked(computeUnitPrice).mockResolvedValue(500);
    vi.mocked(resolveDeliveryValidation).mockResolvedValue(defaultEligibleValidation as never);
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'prod-1',
      name: 'Milk Tea',
      isAvailable: true,
      basePrice: 500,
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'prod-1', name: 'Milk Tea', isAvailable: true, category: { name: 'Drinks' } },
    ] as never);
    vi.mocked(prisma.topping.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryZone.findFirst).mockResolvedValue(activeZone as never);
    vi.mocked(prisma.deliveryZone.findUnique).mockResolvedValue(activeZone as never);
    vi.mocked(prisma.store.findUnique).mockResolvedValue(activeStore as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.loyaltyCampaign.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockResolvedValue(buildCreatedOrder() as never);
    vi.mocked(assertPaymentMethodAllowed).mockResolvedValue(undefined);
    vi.mocked(prisma.address.findMany).mockResolvedValue([]);
    vi.mocked(prisma.address.count).mockResolvedValue(0);
    vi.mocked(prisma.address.updateMany).mockResolvedValue({ count: 0 } as never);
    // Only exercised when a logged-in / phone-resolved customer places a DELIVERY
    // order without a saved addressId — default it so unrelated tests don't crash.
    vi.mocked(prisma.address.create).mockResolvedValue({ id: 'address-1' } as never);
    vi.mocked(isLoyaltyPromoCode).mockReturnValue(false);
    vi.mocked(findPromoForSpinOffer).mockResolvedValue(null);
    vi.mocked(prisma.spinResult.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.promoCode.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.spinResult.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(evaluateLoyaltyForStore).mockResolvedValue({
      campaign: null,
      cartDiscount: null,
      spin: { enabled: false, unlocked: false, requiredOrders: 0, validOrderCount: 0 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays an existing guest order when Idempotency-Key matches', async () => {
    const existing = buildCreatedOrder();
    vi.mocked(prisma.order.findFirst).mockResolvedValue(existing as never);

    const req = createMockReq({
      body: deliveryBody,
      user: undefined,
      headers: { 'idempotency-key': 'guest-checkout-key-1' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('replays a phone-linked guest order when Idempotency-Key and phone match', async () => {
    const existing = buildCreatedOrder({ userId: 'user-linked-by-phone' });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(existing as never);

    const req = createMockReq({
      body: deliveryBody,
      user: undefined,
      headers: { 'idempotency-key': 'guest-checkout-key-linked' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not replay guest checkout when only the shared walk-in phone matches', async () => {
    const existing = buildCreatedOrder({
      orderMode: 'TAKEAWAY',
      guestName: 'Walk-in',
      guestPhone: '0700000000',
      deliveryFee: 0,
      total: 1000,
    });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(existing as never);
    vi.mocked(assignTakeawayQueueSlot).mockResolvedValue({
      queuePosition: 1,
      scheduledPickupAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({
        orderMode: 'TAKEAWAY',
        guestName: 'Walk-in',
        guestPhone: '0700000000',
        deliveryFee: 0,
        total: 1000,
      }) as never,
    );

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        paymentMethod: 'CASH_AT_COUNTER',
        guestName: 'Walk-in',
        guestPhone: '0700000000',
        scheduledAt: presetScheduledAtIso(30),
        scheduleMode: 30,
      },
      user: undefined,
      headers: { 'idempotency-key': 'walk-in-shared-key' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.order.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('places a DELIVERY order without a scheduled time', async () => {
    const { scheduledAt: _removed, ...bodyWithoutSchedule } = deliveryBody;
    const req = reqForPlaceOrder({ body: bodyWithoutSchedule, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('places a DELIVERY cash-at-counter order for a guest and sends confirmation sms', async () => {
    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: 'BC260722-9001',
          guestName: 'John Doe',
          guestPhone: '0771234567',
          storeId: 'store-1',
          orderMode: 'DELIVERY',
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PENDING',
          status: 'RECEIVED',
          subtotal: 1000,
          deliveryFee: 150,
          total: 1150,
        }),
      }),
    );
    expect(notifyBranchNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', storeId: 'store-1' }),
    );
    expect(sendOrderConfirmationSms).toHaveBeenCalledWith('0771234567', 'BC260722-9001', 35, 1150);
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(getPaymentAdapter).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { order: buildCreatedOrder() },
    });
  });

  it('rejects a delivery order missing guest name and phone', async () => {
    const req = reqForPlaceOrder({
      body: { ...deliveryBody, guestName: undefined, guestPhone: undefined },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Customer name and phone are required for delivery orders',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a delivery order from a logged-in OTP account still named Guest', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Guest',
      phone: '0771234567',
      email: null,
      deletedAt: null,
      bannedAt: null,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, guestName: undefined },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Customer name and phone are required for delivery orders',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('saves the checkout form name for a logged-in OTP account still named Guest', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Guest',
      phone: '0771234567',
      email: null,
      deletedAt: null,
      bannedAt: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: '0771234567', email: null } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ userId: 'user-1', guestName: 'Nimal Perera' }) as never,
    );

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, guestName: 'Nimal Perera' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Nimal Perera' },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guestName: 'Nimal Perera', userId: 'user-1' }),
      }),
    );
  });

  it('defaults to Walk-in guest info for takeaway orders without name/phone', async () => {
    vi.mocked(assignTakeawayQueueSlot).mockResolvedValue({
      queuePosition: 1,
      scheduledPickupAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({
        orderMode: 'TAKEAWAY',
        guestName: 'Walk-in',
        guestPhone: '0700000000',
        deliveryFee: 0,
        total: 1000,
      }) as never,
    );
    vi.mocked(prisma.order.update).mockResolvedValue(
      buildCreatedOrder({ orderMode: 'TAKEAWAY', guestName: 'Walk-in', guestPhone: '0700000000' }) as never,
    );

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        paymentMethod: 'CASH_AT_COUNTER',
        scheduledAt: presetScheduledAtIso(30),
        scheduleMode: 30,
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guestName: 'Walk-in', guestPhone: '0700000000' }),
      }),
    );
  });

  it('resolves an existing customer account by guest phone number', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'user-42' } as never);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ userId: 'user-42' }) as never,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: '0771234567', email: null } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-42' }) }),
    );
    // Logged-in resolution triggers a cart lookup for potential clearing.
    expect(prisma.cart.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-42' } });
  });

  it('rejects a delivery order when delivery coordinates are missing', async () => {
    const req = reqForPlaceOrder({
      body: {
        ...deliveryBody,
        deliveryAddress: { addressLine: '123 Main St', city: 'Colombo', district: 'Colombo' },
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Delivery coordinates are required',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a delivery order without a deliveryAddress', async () => {
    const req = reqForPlaceOrder({
      body: { ...deliveryBody, deliveryAddress: undefined },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Delivery address is required');
  });

  it('rejects a guest checkout with no items and no saved cart to fall back to', async () => {
    const req = reqForPlaceOrder({
      body: { ...deliveryBody, items: [] },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Cart is empty — add items before checkout',
    );
  });

  it('rejects a logged-in customer checkout when their saved cart has no items', async () => {
    vi.mocked(prisma.cart.findUnique).mockResolvedValue({ id: 'cart-1', items: [] } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, items: undefined },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toMatch(
      /Cart is empty|session has expired/i,
    );
  });

  it('rejects when a cart item references a missing product', async () => {
    vi.mocked(batchResolveLinePricing).mockRejectedValue(new AppError('Product not found: prod-1', 400));

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Product not found: prod-1');
  });

  it('rejects when a cart item references an unavailable product', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'prod-1', name: 'Milk Tea', isAvailable: false },
    ] as never);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Milk Tea is currently unavailable');
  });

  it('rejects when delivery validation says the address is not deliverable', async () => {
    vi.mocked(resolveDeliveryValidation).mockResolvedValue({
      eligible: false,
      message: 'Delivery is not available to this address',
    } as never);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Delivery is not available to this address',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('resolves the fulfilling branch via distance-based delivery validation', async () => {
    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(resolveDeliveryValidation).toHaveBeenCalledWith(6.87, 79.89, 'store-1');
    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storeId: 'store-1' }) }),
    );
  });

  it('rejects a delivery order when the selected branch cannot serve the location', async () => {
    vi.mocked(resolveDeliveryValidation).mockResolvedValue({
      eligible: false,
      reason: 'branch-cannot-serve',
      message: 'Selected branch cannot deliver to your location. Please choose a suggested branch.',
    } as never);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Selected branch cannot deliver to your location. Please choose a suggested branch.',
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a takeaway order when the store is not found or inactive', async () => {
    vi.mocked(prisma.store.findUnique).mockResolvedValue(null);

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        paymentMethod: 'CASH_AT_COUNTER',
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Store not found or inactive');
  });

  it('rejects a delivery order when the store has delivery disabled', async () => {
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      ...activeStore,
      deliveryEnabled: false,
    } as never);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Delivery is not available for this branch. Please choose Takeaway.',
    );
  });

  it('rejects when the subtotal is below DELIVERY_MIN_ORDER', async () => {
    vi.mocked(batchResolveLinePricing).mockImplementation(async (lines) => {
      const map = new Map<
        string,
        { unitPrice: number; toppings: Array<{ toppingId: string; topping: { id: string; name: string; extraPrice: number } }> }
      >();
      for (const line of lines) {
        map.set(`${line.productId}:${line.size}:${line.toppingIds.join(',')}`, {
          unitPrice: 200,
          toppings: [],
        });
      }
      return map;
    });

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      `Minimum order for delivery is LKR ${DELIVERY_MIN_ORDER}`,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects when the payment method is not allowed for this order', async () => {
    vi.mocked(assertPaymentMethodAllowed).mockRejectedValue(
      new AppError('This payment method is not available', 400),
    );

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('This payment method is not available');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('applies a valid promo code discount and increments its usage count', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo-1',
      code: 'SAVE10',
      isActive: true,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 0,
      maxUses: 100,
      usedCount: 5,
      expiresAt: null,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'SAVE10' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.promoCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'promo-1', usedCount: { lt: 100 } },
      data: { usedCount: { increment: 1 } },
    });
    // subtotal 1000 * 10% = 100 discount
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ discount: 100 }) }),
    );
  });

  it('rejects checkout when the promo cap is lost to a concurrent redemption', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo-1',
      code: 'SAVE10',
      isActive: true,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderValue: 0,
      maxUses: 100,
      usedCount: 5,
      expiresAt: null,
    } as never);
    vi.mocked(prisma.promoCode.updateMany).mockResolvedValue({ count: 0 });

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'SAVE10' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
  });

  it('rejects an unknown or inactive promo code', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'BADCODE' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid or expired promo code');
  });

  it('rejects an expired promo code', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo-1',
      isActive: true,
      expiresAt: new Date('2020-01-01'),
      maxUses: null,
      usedCount: 0,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 50,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'EXPIRED' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Promo code has expired');
  });

  it('rejects a promo code that has hit its usage limit', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo-1',
      isActive: true,
      expiresAt: null,
      maxUses: 10,
      usedCount: 10,
      minOrderValue: 0,
      discountType: 'FIXED',
      discountValue: 50,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'MAXED' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Promo code usage limit reached');
  });

  it('rejects a promo code when the order is below its minimum order value', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo-1',
      isActive: true,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      minOrderValue: 5000,
      discountType: 'FIXED',
      discountValue: 50,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'BIGORDER' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Minimum order LKR 5000 required for this code',
    );
  });

  it('redeems loyalty points up to the remaining payable amount', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      loyaltyPoints: 1000,
      phone: '0771234567',
      email: null,
    } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, usePoints: 500 },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', loyaltyPoints: { gte: 500 } },
      data: { loyaltyPoints: { decrement: 500 } },
    });
    expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          orderId: 'order-1',
          points: -500,
          type: 'REDEEM',
        }),
      }),
    );
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ loyaltyDiscount: 500 }) }),
    );
  });

  it('assigns a takeaway queue slot and updates the ETA/pickup time', async () => {
    const scheduledPickupAt = new Date('2026-07-22T10:30:00.000Z');
    vi.mocked(assignTakeawayQueueSlot).mockResolvedValue({ queuePosition: 2, scheduledPickupAt });
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ orderMode: 'TAKEAWAY', deliveryFee: 0, total: 1000, qrCode: 'data:image/png;base64,MOCKQR' }) as never,
    );
    vi.mocked(prisma.order.update).mockResolvedValue(
      buildCreatedOrder({ orderMode: 'TAKEAWAY', estimatedMinutes: 20 }) as never,
    );

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        paymentMethod: 'CASH_AT_COUNTER',
        guestName: 'Jane',
        guestPhone: '0771234567',
        scheduledAt: presetScheduledAtIso(30),
        scheduleMode: 30,
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(QRCode.toDataURL).toHaveBeenCalled();
    expect(assignTakeawayQueueSlot).toHaveBeenCalledWith('store-1', 'order-1', expect.any(Date));
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ estimatedMinutes: expect.any(Number) }),
      }),
    );
  });

  it('initiates online payment for PAYHERE/CARD and returns the payment url', async () => {
    const initiate = vi.fn().mockResolvedValue({
      paymentUrl: 'https://sandbox.payhere.lk/pay/checkout?x=1',
      paymentId: 'ph_123',
      payhere: { sandbox: true },
    });
    vi.mocked(getPaymentAdapter).mockResolvedValue({ initiate } as never);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ paymentMethod: 'CARD', paymentStatus: 'PENDING' }) as never,
    );

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, paymentMethod: 'CARD' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(getPaymentAdapter).toHaveBeenCalledWith(true);
    expect(initiate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', orderNumber: 'BC260722-9001' }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        paymentUrl: 'https://sandbox.payhere.lk/pay/checkout?x=1',
        payhere: { sandbox: true },
      }),
    });
    expect(notifyCustomerOrderPlaced).not.toHaveBeenCalled();
    expect(sendOrderConfirmationSms).not.toHaveBeenCalled();
  });

  it('uses 6% convenience fee for takeaway online payments, not the delivery rate', async () => {
    const initiate = vi.fn().mockResolvedValue({
      paymentUrl: 'https://sandbox.payhere.lk/pay/checkout?x=1',
      paymentId: 'ph_123',
      payhere: { sandbox: true, amount: '1743.00' },
    });
    vi.mocked(getPaymentAdapter).mockResolvedValue({ initiate } as never);
    vi.mocked(prisma.order.create).mockImplementation(async (args) => {
      const data = (args as { data: Record<string, unknown> }).data;
      return buildCreatedOrder({
        orderMode: 'TAKEAWAY',
        paymentMethod: 'PAYHERE',
        paymentStatus: 'PENDING',
        subtotal: 1000,
        deliveryFee: 0,
        convenientFee: data.convenientFee,
        total: data.total,
        qrCode: 'data:image/png;base64,MOCKQR',
      }) as never;
    });
    vi.mocked(assignTakeawayQueueSlot).mockResolvedValue({
      queuePosition: 1,
      scheduledPickupAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    vi.mocked(prisma.order.update).mockResolvedValue(
      buildCreatedOrder({ orderMode: 'TAKEAWAY', paymentMethod: 'PAYHERE' }) as never,
    );

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        paymentMethod: 'PAYHERE',
        guestName: 'Guest',
        guestPhone: '0771234567',
        scheduledAt: presetScheduledAtIso(45),
        scheduleMode: 45,
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          convenientFee: expect.any(Number),
          total: expect.any(Number),
        }),
      }),
    );
    expect(initiate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000 }),
    );
  });

  it('sends the in-app "order placed" notification for cash orders placed by a logged-in user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: '0771234567', email: null } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: null,
      deletedAt: null,
    } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ userId: 'user-1' }) as never,
    );

    const req = reqForPlaceOrder({
      body: deliveryBody,
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(notifyCustomerOrderPlaced).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', userId: 'user-1' }),
    );
  });

  it('clears the cart for a logged-in customer after the order is created', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ phone: '0771234567', email: null } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: null,
      deletedAt: null,
    } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue({ id: 'cart-1', userId: 'user-1' } as never);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ userId: 'user-1' }) as never,
    );

    const req = reqForPlaceOrder({
      body: deliveryBody,
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
  });

  it('swallows branch-notification failures without failing the request', async () => {
    vi.mocked(notifyBranchNewOrder).mockRejectedValue(new Error('notification bus down'));

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('propagates prisma failures while creating the order', async () => {
    vi.mocked(prisma.order.create).mockRejectedValue(new Error('DB write failed'));

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('records gift cost on promotion usage for a loyalty gift offer', async () => {
    vi.mocked(isLoyaltyPromoCode).mockReturnValue(true);
    vi.mocked(evaluateLoyaltyForStore).mockResolvedValue({
      campaign: null,
      cartDiscount: {
        offerKey: 'OFFER_2',
        code: 'LOYALTY-OFFER2',
        discount: 0,
        discountType: 'FIXED',
        discountValue: 0,
        giftCost: 200,
        label: 'Free Vanilla Ice Cream',
        description: 'Free gift',
        promotionKind: 'LOYALTY_OFFER_2_GIFT',
        ownership: 'SHARED',
        contributionSource: 'JASON',
        branchSharePct: 40,
        platformSharePct: 60,
        branchShareSplits: null,
        autoApply: true,
        hideCode: true,
        giftLabel: 'Free Vanilla Ice Cream',
        giftProduct: { id: 'gift-1', name: 'Vanilla Ice Cream', basePrice: 200, imageUrl: null },
        giftProductId: 'gift-1',
      },
      spin: { enabled: false, unlocked: false, requiredOrders: 0, validOrderCount: 0 },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      phone: '0771234567',
      email: null,
    } as never);
    vi.mocked(prisma.cart.findUnique).mockResolvedValue(null);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'LOYALTY-OFFER2' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.promotionUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promoCode: 'LOYALTY-OFFER2',
          ownership: 'SHARED',
          totalDiscountAmount: 200,
          branchShareAmount: 80,
          platformShareAmount: 120,
        }),
      }),
    );
  });

  it('records gift product base price on promotion usage for a spin gift', async () => {
    vi.mocked(prisma.spinResult.findUnique).mockResolvedValue({
      id: 'spin-1',
      status: 'CLAIMED',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      offer: {
        id: 'spin-offer-1',
        offerType: 'GIFT',
        discountValue: 0,
        minOrderValue: 0,
        giftProductId: 'gift-1',
        giftProduct: {
          id: 'gift-1',
          name: 'Free Cake',
          basePrice: 350,
          isAvailable: true,
        },
      },
    } as never);
    vi.mocked(findPromoForSpinOffer).mockResolvedValue({
      id: 'spin-promo-1',
      ownership: 'PLATFORM',
      contributionSource: null,
      branchSharePct: 0,
      platformSharePct: 100,
      promotionKind: 'GIFT_ITEM',
      promotionRules: {},
      discountType: 'FIXED',
      discountValue: 0,
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'SPIN123' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.promotionUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promoCode: 'SPIN123',
          totalDiscountAmount: 350,
        }),
      }),
    );
  });

  it('applies NCJ campaign ownership shares onto a spin-linked promo', async () => {
    vi.mocked(prisma.spinResult.findUnique).mockResolvedValue({
      id: 'spin-1',
      status: 'CLAIMED',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      offer: {
        id: 'spin-offer-1',
        offerType: 'PERCENTAGE',
        discountValue: 10,
        minOrderValue: 0,
        giftProductId: null,
        giftProduct: null,
      },
    } as never);
    vi.mocked(findPromoForSpinOffer).mockResolvedValue({
      id: 'spin-promo-1',
      ownership: 'PLATFORM',
      contributionSource: null,
      branchSharePct: 0,
      platformSharePct: 100,
      promotionKind: 'PERCENTAGE_DISCOUNT',
      promotionRules: {},
      discountType: 'PERCENTAGE',
      discountValue: 10,
    } as never);
    vi.mocked(evaluateLoyaltyForStore).mockResolvedValue({
      campaign: {
        offer3Enabled: true,
        ownership: 'SHARED',
        contributionSource: 'JASON',
        branchSharePct: 30,
        platformSharePct: 70,
        branchShareSplits: null,
      },
      cartDiscount: null,
      spin: { enabled: true, unlocked: true, requiredOrders: 3, validOrderCount: 3 },
    } as never);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, promoCode: 'SPIN123' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ discount: 100 }) }),
    );
    expect(prisma.promotionUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownership: 'SHARED',
          contributionSource: 'JASON',
          branchSharePct: 30,
          platformSharePct: 70,
          totalDiscountAmount: 100,
          branchShareAmount: 30,
          platformShareAmount: 70,
        }),
      }),
    );
  });

  it('propagates payment adapter failures for online payments', async () => {
    vi.mocked(getPaymentAdapter).mockRejectedValue(
      new AppError('PayHere sandbox is not configured.', 400),
    );

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, paymentMethod: 'PAYHERE' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('PayHere sandbox is not configured.');
  });

  it('rejects customer orders when the branch is manually closed', async () => {
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      ...activeStore,
      branchClosedAt: new Date('2026-10-06T10:00:00.000Z'),
    } as never);

    const req = reqForPlaceOrder({ body: deliveryBody, user: undefined });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toMatch(/temporarily closed/i);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('allows POS orders when the branch is manually closed', async () => {
    vi.mocked(prisma.store.findUnique).mockResolvedValue({
      ...activeStore,
      branchClosedAt: new Date('2026-10-06T10:00:00.000Z'),
    } as never);

    vi.mocked(assignTakeawayQueueSlot).mockResolvedValue({
      queuePosition: 1,
      scheduledPickupAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ orderMode: 'TAKEAWAY', deliveryFee: 0, total: 1000 }) as never,
    );

    const req = reqForPlaceOrder({
      body: {
        orderMode: 'TAKEAWAY',
        storeId: 'store-1',
        paymentMethod: 'CASH_AT_COUNTER',
        channel: 'POS',
        platform: 0,
        items: [{ productId: 'prod-1', size: 'REGULAR', toppingIds: [], quantity: 2 }],
        scheduledAt: presetScheduledAtIso(30),
        scheduleMode: 30,
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects guest checkout when a saved addressId is supplied', async () => {
    const req = reqForPlaceOrder({
      body: { ...deliveryBody, addressId: 'addr-other' },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Sign in to use a saved address');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated checkout with addressId even when guest phone links to a user', async () => {
    vi.mocked(prisma.user.findFirst).mockImplementation(async (args) => {
      const where = (args as { where?: { phone?: { in?: string[] }; id?: string } }).where;
      if (where?.phone?.in) {
        return {
          id: 'victim-user',
          name: 'Victim',
          phone: '0779999999',
          deletedAt: null,
          bannedAt: null,
        } as never;
      }
      return null;
    });

    const req = reqForPlaceOrder({
      body: {
        ...deliveryBody,
        guestPhone: '0779999999',
        addressId: 'addr-victim',
      },
      user: undefined,
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(prisma.address.findFirst).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a saved addressId that does not belong to the signed-in customer', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Nimal Perera',
      phone: '0771234567',
      email: null,
      deletedAt: null,
      bannedAt: null,
    } as never);
    vi.mocked(prisma.address.findFirst).mockResolvedValue(null);

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, addressId: 'addr-other' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Address not found');
    expect(prisma.address.findFirst).toHaveBeenCalledWith({
      where: { id: 'addr-other', userId: 'user-1' },
      select: { id: true },
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('links a saved addressId when it belongs to the signed-in customer', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Nimal Perera',
      phone: '0771234567',
      email: null,
      deletedAt: null,
      bannedAt: null,
    } as never);
    vi.mocked(prisma.address.findFirst).mockResolvedValue({ id: 'addr-mine' } as never);
    vi.mocked(prisma.order.create).mockResolvedValue(
      buildCreatedOrder({ userId: 'user-1', addressId: 'addr-mine' }) as never,
    );

    const req = reqForPlaceOrder({
      body: { ...deliveryBody, addressId: 'addr-mine' },
      user: { sub: 'user-1', type: 'user' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ addressId: 'addr-mine' }),
      }),
    );
  });

  it('requires Idempotency-Key for WEB checkout', async () => {
    const req = createMockReq({
      body: deliveryBody,
      headers: {},
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('returns the existing order when the same idempotency key is replayed for a signed-in user', async () => {
    const existing = buildCreatedOrder({ userId: 'user-1' });
    vi.mocked(prisma.order.findFirst).mockResolvedValue(existing as never);

    const req = reqForPlaceOrder({
      body: deliveryBody,
      user: { sub: 'user-1', type: 'user' },
      headers: { 'idempotency-key': 'replay-key-1' },
    });
    const res = createMockRes();

    await placeOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});
