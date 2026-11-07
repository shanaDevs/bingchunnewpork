import { describe, expect, it } from 'vitest';
import { buildCupStickers, stickerOrderLabel, stickerSequence } from './cupStickerPrint';
import type { Order } from '@/types';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '1',
    orderNumber: 'BC251107-000042',
    orderMode: 'TAKEAWAY',
    status: 'RECEIVED',
    paymentMethod: 'CASH_AT_COUNTER',
    paymentStatus: 'PENDING',
    subtotal: 1000,
    deliveryFee: 0,
    convenientFee: 0,
    discount: 0,
    loyaltyDiscount: 0,
    total: 1000,
    estimatedMinutes: 10,
    store: { id: 's1', name: 'Nugegoda', addressLine: 'x', lat: 0, lng: 0 },
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productName: 'Bobo',
        size: 'R',
        quantity: 2,
        unitPrice: 500,
        totalPrice: 1000,
        toppings: [],
      },
      {
        id: 'i2',
        productId: 'p2',
        productName: 'Matcha',
        size: 'R',
        quantity: 3,
        unitPrice: 500,
        totalPrice: 1500,
        toppings: [],
      },
    ],
    statusEvents: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('cupStickerPrint', () => {
  it('uses POS-N for counter orders with queue position', () => {
    expect(stickerOrderLabel(baseOrder({ channel: 'POS', queuePosition: 17 }))).toBe('POS-17');
  });

  it('uses last 4 order-number digits for OP/OD stickers', () => {
    expect(
      stickerOrderLabel(baseOrder({ channel: 'WEB', orderMode: 'TAKEAWAY', queuePosition: 1 })),
    ).toBe('OP-0042');
    expect(
      stickerOrderLabel(
        baseOrder({
          channel: 'APP',
          orderMode: 'DELIVERY',
          queuePosition: null,
          orderNumber: 'BC261101-1001',
        }),
      ),
    ).toBe('OD-1001');
    expect(stickerSequence({ orderNumber: 'BC261104-1004' })).toBe('1004');
  });

  it('expands quantity into one sticker per cup with 1/N labels', () => {
    const slips = buildCupStickers(baseOrder({ channel: 'POS', queuePosition: 17 }), '01/11 12:29:58');
    expect(slips).toHaveLength(5);
    expect(slips[0]).toMatchObject({ orderLabel: 'POS-17', cupLabel: '1/5', itemName: 'Bobo' });
    expect(slips[4]).toMatchObject({ cupLabel: '5/5', itemName: 'Matcha' });
  });

  it('prints each addon on its own sticker with the same cup number', () => {
    const slips = buildCupStickers(
      baseOrder({
        channel: 'POS',
        queuePosition: 3,
        items: [
          {
            id: 'i1',
            productId: 'p1',
            productName: 'Bobo',
            size: 'R',
            quantity: 1,
            unitPrice: 500,
            totalPrice: 650,
            toppings: [
              { toppingName: 'Pearl', extraPrice: 100 },
              { toppingName: 'Pudding', extraPrice: 50 },
            ],
          },
          {
            id: 'i2',
            productId: 'p2',
            productName: 'Matcha',
            size: 'R',
            quantity: 1,
            unitPrice: 500,
            totalPrice: 500,
            toppings: [],
          },
        ],
      }),
      '07/11 14:00',
    );
    expect(slips).toEqual([
      expect.objectContaining({ orderLabel: 'POS-3', cupLabel: '1/2', itemName: 'Bobo' }),
      expect.objectContaining({ cupLabel: '1/2', itemName: 'Pearl' }),
      expect.objectContaining({ cupLabel: '1/2', itemName: 'Pudding' }),
      expect.objectContaining({ cupLabel: '2/2', itemName: 'Matcha' }),
    ]);
  });

  it('repeats addon stickers for each cup when quantity > 1', () => {
    const slips = buildCupStickers(
      baseOrder({
        channel: 'WEB',
        orderMode: 'TAKEAWAY',
        queuePosition: 2,
        items: [
          {
            id: 'i1',
            productId: 'p1',
            productName: 'Bobo',
            size: 'R',
            quantity: 2,
            unitPrice: 500,
            totalPrice: 1200,
            toppings: [{ toppingName: 'Pearl', extraPrice: 100 }],
          },
        ],
      }),
      '07/11 14:00',
    );
    expect(slips.map((s) => `${s.cupLabel}:${s.itemName}`)).toEqual([
      '1/2:Bobo',
      '1/2:Pearl',
      '2/2:Bobo',
      '2/2:Pearl',
    ]);
  });
});
