import { describe, expect, it } from 'vitest';
import { formatJobOrder } from '../../src/lib/deliveryJobHelpers';

function sampleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 'BC-1',
    status: 'READY',
    createdAt: new Date('2026-01-01'),
    paymentMethod: 'PAYHERE',
    paymentGateway: 'WEBXPAY',
    paymentStatus: 'PAID',
    total: 2500,
    deliveryFee: 250,
    estimatedMinutes: 30,
    notes: null,
    guestName: 'Ada',
    guestPhone: '0771234567',
    deliveryAddressLine: '12 Secret Lane',
    deliveryCity: 'Colombo',
    deliveryDistrict: 'Colombo',
    deliveryLat: 6.9,
    deliveryLng: 79.8,
    user: { name: 'Ada', phone: '0771234567' },
    address: null,
    items: [{ productName: 'Noodles', quantity: 2, totalPrice: 900, product: { imageUrl: null } }],
    ...overrides,
  } as never;
}

describe('formatJobOrder privacy', () => {
  it('redacts phone and street before acceptance, but keeps coordinates', () => {
    const dto = formatJobOrder(sampleOrder(), 1, { redactCustomer: true, redactPricing: true });
    expect(dto.customerPhone).toBe('');
    expect(dto.customerName).toBe('Customer');
    expect(dto.addressLine).toBe('');
    // Geometry is not redacted: the driver app's pre-claim Stops screen is map-first and
    // needs real pins to draw. Identity above stays hidden until the job is claimed.
    expect(dto.lat).toBe(6.9);
    expect(dto.lng).toBe(79.8);
    expect(dto.total).toBeUndefined();
    expect(dto.items[0].totalPrice).toBeUndefined();
    expect(dto.deliveryFee).toBe(250);
    expect(dto.paymentMethod).toBe('WEBXPAY');
    expect(dto.city).toBe('Colombo');
  });

  it('includes customer details after assignment', () => {
    const dto = formatJobOrder(sampleOrder(), 1, { redactCustomer: false, redactPricing: true });
    expect(dto.customerPhone).toBe('0771234567');
    expect(dto.addressLine).toBe('12 Secret Lane');
    expect(dto.deliveryFee).toBe(250);
    expect(dto.total).toBeUndefined();
  });
});
