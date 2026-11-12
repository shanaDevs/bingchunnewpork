import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bingchun/db', () => ({
  prisma: {
    deliveryJob: { findUnique: vi.fn(), update: vi.fn() },
    driverLocation: { findMany: vi.fn() },
  },
}));

import {
  buildJobHistoryOrderRows,
  creditedDeliveredTotals,
  filterGpsNoise,
  formatDeliveryFailureReason,
  groupLatestFailedAttemptsByJob,
  isCreditedDelivery,
  snapGpsPathForDisplay,
} from '../src/gpsPath';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe('isCreditedDelivery and creditedDeliveredTotals', () => {
  const fee = (status: string, deliveryFee: number) => ({
    orderId: 'ord-1',
    order: { status, deliveryFee, cancelledAtStatus: null },
  });

  it('credits DELIVERED without a failure', () => {
    expect(isCreditedDelivery('DELIVERED', null)).toBe(true);
    const { deliveredTotal } = creditedDeliveredTotals([fee('DELIVERED', 200)], new Map());
    expect(deliveredTotal).toBe(200);
  });

  it('credits customer-side failure while order is still OUT_FOR_DELIVERY', () => {
    const failed = new Map([['ord-1', { outcome: 'CUSTOMER_UNREACHABLE', note: null }]]);
    const { deliveredTotal, deliveredCount } = creditedDeliveredTotals(
      [fee('OUT_FOR_DELIVERY', 150)],
      failed,
    );
    expect(deliveredCount).toBe(1);
    expect(deliveredTotal).toBe(150);
  });

  it('credits customer-side failure even when order was later DELIVERED elsewhere', () => {
    const failed = new Map([['ord-1', { outcome: 'WRONG_ADDRESS', note: null }]]);
    expect(creditedDeliveredTotals([fee('DELIVERED', 175)], failed).deliveredTotal).toBe(175);
  });

  it('does not credit driver error or vehicle failure', () => {
    expect(
      creditedDeliveredTotals(
        [fee('OUT_FOR_DELIVERY', 100)],
        new Map([['ord-1', { outcome: 'OTHER', note: null }]]),
      ).deliveredTotal,
    ).toBe(0);
    expect(
      creditedDeliveredTotals(
        [fee('DELIVERED', 100)],
        new Map([['ord-1', { outcome: 'VEHICLE_FAILURE', note: null }]]),
      ).deliveredTotal,
    ).toBe(0);
  });

  it('credits mid-ride customer cancel without a failure attempt', () => {
    const { deliveredTotal } = creditedDeliveredTotals(
      [
        {
          orderId: 'ord-1',
          order: { status: 'CANCELLED', deliveryFee: 120, cancelledAtStatus: 'OUT_FOR_DELIVERY' },
        },
      ],
      new Map(),
    );
    expect(deliveredTotal).toBe(120);
  });
});

describe('groupLatestFailedAttemptsByJob', () => {
  it('keeps the latest attempt per job and order', () => {
    const grouped = groupLatestFailedAttemptsByJob([
      {
        jobId: 'job-1',
        orderId: 'ord-1',
        outcome: 'OTHER',
        note: 'old',
        attemptNo: 1,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        jobId: 'job-1',
        orderId: 'ord-1',
        outcome: 'CUSTOMER_UNREACHABLE',
        note: 'latest',
        attemptNo: 2,
        createdAt: new Date('2026-01-01T11:00:00Z'),
      },
    ]);
    expect(grouped.get('job-1')?.get('ord-1')).toEqual({
      outcome: 'CUSTOMER_UNREACHABLE',
      note: 'latest',
    });
  });
});

describe('formatDeliveryFailureReason', () => {
  it('labels known outcomes and appends notes', () => {
    expect(formatDeliveryFailureReason('REFUSED', 'Gate closed')).toBe(
      'Customer refused delivery — Gate closed',
    );
    expect(formatDeliveryFailureReason(null, null)).toBe('Not provided');
  });
});

describe('buildJobHistoryOrderRows', () => {
  it('marks failed stops and counts them', () => {
    const failed = new Map([
      ['ord-2', { outcome: 'VEHICLE_FAILURE', note: 'Flat tyre' }],
    ]);
    const { orders, failedCount } = buildJobHistoryOrderRows(
      [
        { orderId: 'ord-1', order: { status: 'DELIVERED' } },
        { orderId: 'ord-2', order: { status: 'DELIVERED', cancelledAtStatus: null } },
      ],
      failed,
    );
    expect(failedCount).toBe(1);
    expect(orders[0]?.deliveryFailed).toBe(false);
    expect(orders[1]?.deliveryFailed).toBe(true);
    expect(orders[1]?.failureReason).toContain('Vehicle failure');
  });
});

describe('filterGpsNoise', () => {
  it('drops non-finite and out-of-range points', () => {
    expect(
      filterGpsNoise([
        { lat: Number.NaN, lng: 79.86 },
        { lat: 6.9, lng: 79.86 },
        { lat: 91, lng: 79.86 },
      ]),
    ).toEqual([{ lat: 6.9, lng: 79.86 }]);
  });

  it('drops consecutive near-duplicates but keeps large jumps', () => {
    const path = filterGpsNoise([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.900001, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ]);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ lat: 6.9, lng: 79.86 });
    expect(path[1]).toEqual({ lat: 6.91, lng: 79.87 });
  });
});

describe('snapGpsPathForDisplay', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns matched geometry when OSRM succeeds', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'Ok',
        matchings: [
          {
            geometry: {
              coordinates: [
                [79.86, 6.9],
                [79.861, 6.901],
                [79.862, 6.902],
              ],
            },
          },
        ],
      }),
    );

    const path = await snapGpsPathForDisplay([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.905, lng: 79.865 },
    ]);
    expect(path).toEqual([
      { lat: 6.9, lng: 79.86 },
      { lat: 6.901, lng: 79.861 },
      { lat: 6.902, lng: 79.862 },
    ]);
  });

  it('falls back to filtered GPS when OSRM fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'NoMatch' }, true));
    const raw = [
      { lat: 6.9, lng: 79.86 },
      { lat: 6.91, lng: 79.87 },
    ];
    expect(await snapGpsPathForDisplay(raw)).toEqual(raw);
  });

  it('does not call OSRM for fewer than 2 points', async () => {
    expect(await snapGpsPathForDisplay([{ lat: 6.9, lng: 79.86 }])).toEqual([
      { lat: 6.9, lng: 79.86 },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
