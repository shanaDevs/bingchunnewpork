import { describe, expect, it } from 'vitest';
import {
  ALERT_MUTE_JOB_STATUSES,
  DRIVER_HELD_JOB_STATUSES,
  distanceMeters,
} from '../../src/lib/deliveryJobHelpers';
import {
  customerRouteStops,
  optimizeDeliveryStops,
  totalRouteDistanceKm,
  totalRouteEtaMinutes,
} from '../../src/lib/routeOptimizer';

describe('ALERT_MUTE_JOB_STATUSES / DRIVER_HELD_JOB_STATUSES', () => {
  it('mutes alerts while actively delivering or holding a queued next claim', () => {
    expect([...ALERT_MUTE_JOB_STATUSES]).toEqual(['ASSIGNED', 'IN_PROGRESS', 'QUEUED']);
  });

  it('keeps RETURNING as a held ride so the rider can finish at the branch', () => {
    expect(DRIVER_HELD_JOB_STATUSES).toContain('RETURNING');
    expect(DRIVER_HELD_JOB_STATUSES).toContain('IN_PROGRESS');
    expect(DRIVER_HELD_JOB_STATUSES).toContain('QUEUED');
    expect(DRIVER_HELD_JOB_STATUSES).not.toContain('VEHICLE_FAILURE');
  });
});

describe('distanceMeters (branch completion radius)', () => {
  it('returns ~0 for the same point', () => {
    expect(distanceMeters(6.9, 79.85, 6.9, 79.85)).toBeLessThan(1);
  });

  it('is under 100m for a nearby point and over 100m for a farther one', () => {
    // ~50m north of origin (1 deg lat ≈ 111 km)
    const near = distanceMeters(6.9, 79.85, 6.9 + 0.00045, 79.85);
    expect(near).toBeGreaterThan(40);
    expect(near).toBeLessThan(60);

    const far = distanceMeters(6.9, 79.85, 6.91, 79.85);
    expect(far).toBeGreaterThan(1000);
  });
});

describe('optimizeDeliveryStops includeReturnToOrigin', () => {
  const origin = { lat: 6.9, lng: 79.85 };
  const rawStops = [
    {
      orderId: 'o1',
      orderNumber: '1001',
      customerName: 'A',
      customerPhone: '',
      addressLine: '',
      city: '',
      district: '',
      status: 'READY',
      total: 0,
      itemCount: 2,
      lat: 6.91,
      lng: 79.86,
    },
    {
      orderId: 'o2',
      orderNumber: '1002',
      customerName: 'B',
      customerPhone: '',
      addressLine: '',
      city: '',
      district: '',
      status: 'READY',
      total: 0,
      itemCount: 3,
      lat: 6.92,
      lng: 79.84,
    },
  ];

  it('appends a synthetic return leg to the branch', () => {
    const withReturn = optimizeDeliveryStops(origin, rawStops, { includeReturnToOrigin: true });
    expect(withReturn[withReturn.length - 1].orderId).toBe('__return__');
    expect(withReturn[withReturn.length - 1].lat).toBe(origin.lat);
    expect(withReturn[withReturn.length - 1].lng).toBe(origin.lng);
  });

  it('includes return distance in estimated totals', () => {
    const without = optimizeDeliveryStops(origin, rawStops);
    const withReturn = optimizeDeliveryStops(origin, rawStops, { includeReturnToOrigin: true });
    expect(totalRouteDistanceKm(withReturn)).toBeGreaterThan(totalRouteDistanceKm(without));
    expect(totalRouteEtaMinutes(withReturn)).toBeGreaterThan(totalRouteEtaMinutes(without));
  });

  it('customerRouteStops excludes the return leg', () => {
    const withReturn = optimizeDeliveryStops(origin, rawStops, { includeReturnToOrigin: true });
    const customers = customerRouteStops(withReturn);
    expect(customers.every((s) => s.orderId !== '__return__')).toBe(true);
    expect(customers).toHaveLength(2);
  });
});
