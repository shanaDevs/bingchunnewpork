import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryAttempt: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    driverLocation: { findFirst: vi.fn() },
    order: { update: vi.fn() },
  },
}));

import { prisma } from '@bingchun/db';
import {
  dropoffApiFields,
  mapPinPoint,
  parseLatLngPair,
  persistActualDropoffOnOrder,
  resolveLiveLastDropoff,
  resolveRiderDropoffCoords,
  shouldShowPlannedAddressPin,
} from '../src/actualDropoff';

describe('actualDropoff helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parseLatLngPair rejects incomplete or out-of-range coords', () => {
    expect(parseLatLngPair(6.9, 79.8)).toEqual({ lat: 6.9, lng: 79.8 });
    expect(parseLatLngPair(6.9, null)).toBeNull();
    expect(parseLatLngPair(91, 79)).toBeNull();
  });

  it('mapPinPoint prefers actual GPS over planned address', () => {
    expect(
      mapPinPoint({
        deliveryLat: 6.91,
        deliveryLng: 79.86,
        actualDropoffLat: 6.92,
        actualDropoffLng: 79.87,
      }),
    ).toEqual({ lat: 6.92, lng: 79.87 });
    expect(mapPinPoint({ deliveryLat: 6.91, deliveryLng: 79.86 })).toEqual({ lat: 6.91, lng: 79.86 });
  });

  it('dropoffApiFields exposes planned and actual separately', () => {
    expect(
      dropoffApiFields({
        deliveryLat: 6.91,
        deliveryLng: 79.86,
        actualDropoffLat: 6.92,
        actualDropoffLng: 79.87,
        actualDropoffAt: '2026-11-16T07:00:00.000Z',
      }),
    ).toEqual({
      dropoffLat: 6.92,
      dropoffLng: 79.87,
      dropoffAt: '2026-11-16T07:00:00.000Z',
      plannedLat: 6.91,
      plannedLng: 79.86,
    });
  });

  it('shouldShowPlannedAddressPin when GPS diverges ~40m+', () => {
    expect(shouldShowPlannedAddressPin({ lat: 6.91, lng: 79.86 }, { lat: 6.91, lng: 79.86 })).toBe(false);
    expect(shouldShowPlannedAddressPin({ lat: 6.91, lng: 79.86 }, { lat: 6.911, lng: 79.861 })).toBe(true);
  });

  it('resolveLiveLastDropoff uses newest actualDropoffAt then sequence', () => {
    const last = resolveLiveLastDropoff([
      {
        sequence: 1,
        order: {
          id: 'o1',
          orderNumber: 'BC-1',
          status: 'DELIVERED',
          deliveryLat: 6.8,
          deliveryLng: 79.8,
          actualDropoffLat: 6.81,
          actualDropoffLng: 79.81,
          actualDropoffAt: '2026-11-16T07:00:00.000Z',
        },
      },
      {
        sequence: 2,
        order: {
          id: 'o2',
          orderNumber: 'BC-2',
          status: 'DELIVERED',
          deliveryLat: 6.82,
          deliveryLng: 79.82,
          actualDropoffLat: 6.83,
          actualDropoffLng: 79.83,
          actualDropoffAt: '2026-11-16T07:10:00.000Z',
        },
      },
      {
        sequence: 3,
        order: {
          id: 'o3',
          orderNumber: 'BC-3',
          status: 'OUT_FOR_DELIVERY',
          deliveryLat: 6.84,
          deliveryLng: 79.84,
        },
      },
    ]);
    expect(last).toMatchObject({
      kind: 'dropoff',
      orderId: 'o2',
      lat: 6.83,
      lng: 79.83,
      actual: true,
      sequence: 2,
    });
  });

  it('resolveRiderDropoffCoords prefers body then attempt then job GPS', async () => {
    expect(
      await resolveRiderDropoffCoords({ lat: 6.9, lng: 79.8, driverId: 'd1', jobId: 'j1' }),
    ).toEqual({ lat: 6.9, lng: 79.8 });

    vi.mocked(prisma.deliveryAttempt.findFirst).mockResolvedValue({ lat: 6.91, lng: 79.81 } as never);
    expect(
      await resolveRiderDropoffCoords({ driverId: 'd1', jobId: 'j1', orderId: 'o1' }),
    ).toEqual({ lat: 6.91, lng: 79.81 });

    vi.mocked(prisma.deliveryAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.driverLocation.findFirst)
      .mockResolvedValueOnce({ lat: 6.92, lng: 79.82 } as never);
    expect(await resolveRiderDropoffCoords({ driverId: 'd1', jobId: 'j1' })).toEqual({
      lat: 6.92,
      lng: 79.82,
    });
  });

  it('persistActualDropoffOnOrder writes order fields', async () => {
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);
    await persistActualDropoffOnOrder({ orderId: 'o1', lat: 6.9, lng: 79.8 });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({
        actualDropoffLat: 6.9,
        actualDropoffLng: 79.8,
      }),
    });
  });
});
