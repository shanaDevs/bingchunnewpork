import { describe, expect, it } from 'vitest';
import {
  collectForwardOrders,
  deriveFailureReassignment,
  redeliveryJobTitle,
} from '../../src/lib/deliveryFailureReassign';
import { deliveredOrderDeliveryFees } from '../../src/lib/deliveryJobHelpers';
import { pickLiveTrackingLink } from '../../src/lib/liveDriverTracking';

const created = (iso: string) => new Date(iso);

describe('collectForwardOrders', () => {
  const stops = [
    { orderId: 'o1', sequence: 1, orderNumber: '1001', status: 'DELIVERED' },
    { orderId: 'o2', sequence: 2, orderNumber: '1002', status: 'OUT_FOR_DELIVERY' },
    { orderId: 'o3', sequence: 3, orderNumber: '1003', status: 'OUT_FOR_DELIVERY' },
    { orderId: 'o4', sequence: 4, orderNumber: '1004', status: 'READY' },
  ];

  it('includes the failed stop plus every other undelivered stop', () => {
    expect(collectForwardOrders({ failedOrderId: 'o2', stops })).toEqual([
      { orderId: 'o2', orderNumber: '1002', sequence: 2, status: 'OUT_FOR_DELIVERY', isFailedStop: true },
      { orderId: 'o3', orderNumber: '1003', sequence: 3, status: 'OUT_FOR_DELIVERY', isFailedStop: false },
      { orderId: 'o4', orderNumber: '1004', sequence: 4, status: 'READY', isFailedStop: false },
    ]);
  });

  it('skips delivered and cancelled stops but keeps every other undelivered stop', () => {
    expect(
      collectForwardOrders({
        failedOrderId: 'o2',
        stops: [
          { orderId: 'o1', sequence: 1, orderNumber: '1001', status: 'OUT_FOR_DELIVERY' },
          { orderId: 'o2', sequence: 2, orderNumber: '1002', status: 'OUT_FOR_DELIVERY' },
          { orderId: 'o3', sequence: 3, orderNumber: '1003', status: 'DELIVERED' },
          { orderId: 'o4', sequence: 4, orderNumber: '1004', status: 'CANCELLED' },
          { orderId: 'o5', sequence: 5, orderNumber: '1005', status: 'OUT_FOR_DELIVERY' },
        ],
      }).map((s) => s.orderId),
    ).toEqual(['o1', 'o2', 'o5']);
  });

  it('also forwards an undelivered stop sequenced before the failed one', () => {
    expect(
      collectForwardOrders({
        failedOrderId: 'o4',
        stops,
      }).map((s) => s.orderId),
    ).toEqual(['o2', 'o3', 'o4']);
  });

  it('forwards every undelivered stop for a driver-error (OTHER) failure too', () => {
    // collectForwardOrders no longer takes an outcome — every outcome, including a
    // rider-fault (OTHER) failure, moves every unfinished order on the ride.
    expect(
      collectForwardOrders({
        failedOrderId: 'o2',
        stops,
      }).map((s) => s.orderId),
    ).toEqual(['o2', 'o3', 'o4']);
  });
});

describe('redeliveryJobTitle', () => {
  it('names a single-order ride after the failed order', () => {
    expect(redeliveryJobTitle('1042', 1)).toBe('Redelivery #1042');
  });

  it('includes how many later stops ride along', () => {
    expect(redeliveryJobTitle('1042', 3)).toBe('Redelivery #1042 + 2 more');
  });
});

describe('deriveFailureReassignment', () => {
  it('marks delivered or cancelled orders as done', () => {
    expect(
      deriveFailureReassignment({
        orderStatus: 'DELIVERED',
        originalJobId: 'job-1',
        jobsForOrder: [],
      }),
    ).toEqual({ reassignmentStatus: 'done', activeRedeliveryJob: null });

    expect(
      deriveFailureReassignment({
        orderStatus: 'CANCELLED',
        originalJobId: 'job-1',
        jobsForOrder: [],
      }).reassignmentStatus,
    ).toBe('done');
  });

  it('needs assignment when the failed order is still out for delivery on the original job only', () => {
    expect(
      deriveFailureReassignment({
        orderStatus: 'OUT_FOR_DELIVERY',
        originalJobId: 'job-1',
        jobsForOrder: [
          {
            jobId: 'job-1',
            job: {
              id: 'job-1',
              status: 'IN_PROGRESS',
              createdAt: created('2026-08-31T08:00:00.000Z'),
              driver: { id: 'd1', name: 'Amal' },
            },
          },
        ],
      }),
    ).toEqual({ reassignmentStatus: 'needs_assignment', activeRedeliveryJob: null });
  });

  it('reports ringing while the redelivery is still scheduled', () => {
    const result = deriveFailureReassignment({
      orderStatus: 'OUT_FOR_DELIVERY',
      originalJobId: 'job-1',
      jobsForOrder: [
        {
          jobId: 'job-2',
          job: {
            id: 'job-2',
            status: 'SCHEDULED',
            createdAt: created('2026-08-31T09:00:00.000Z'),
            driver: { id: 'd2', name: 'Nimal' },
          },
        },
      ],
    });
    expect(result).toEqual({
      reassignmentStatus: 'ringing',
      activeRedeliveryJob: {
        id: 'job-2',
        status: 'SCHEDULED',
        driver: { id: 'd2', name: 'Nimal' },
      },
    });
  });

  it('reports assigned when a newer redelivery job exists', () => {
    const result = deriveFailureReassignment({
      orderStatus: 'OUT_FOR_DELIVERY',
      originalJobId: 'job-1',
      jobsForOrder: [
        {
          jobId: 'job-1',
          job: {
            id: 'job-1',
            status: 'IN_PROGRESS',
            createdAt: created('2026-08-31T08:00:00.000Z'),
            driver: { id: 'd1', name: 'Amal' },
          },
        },
        {
          jobId: 'job-2',
          job: {
            id: 'job-2',
            status: 'ASSIGNED',
            createdAt: created('2026-08-31T09:00:00.000Z'),
            driver: { id: 'd2', name: 'Nimal' },
          },
        },
      ],
    });
    expect(result).toEqual({
      reassignmentStatus: 'assigned',
      activeRedeliveryJob: {
        id: 'job-2',
        status: 'ASSIGNED',
        driver: { id: 'd2', name: 'Nimal' },
      },
    });
  });
});

describe('deliveredOrderDeliveryFees', () => {
  it('sums fees only for delivered orders so the original rider keeps completed work', () => {
    expect(
      deliveredOrderDeliveryFees([
        { order: { status: 'DELIVERED', deliveryFee: 150 } },
        { order: { status: 'OUT_FOR_DELIVERY', deliveryFee: 200 } },
        { order: { status: 'CANCELLED', deliveryFee: 80 } },
      ]),
    ).toBe(150);
  });

  it('includes a cancel that happened after the run started', () => {
    expect(
      deliveredOrderDeliveryFees([
        { order: { status: 'DELIVERED', deliveryFee: 150 } },
        { order: { status: 'CANCELLED', deliveryFee: 80, cancelledAtStatus: 'OUT_FOR_DELIVERY' } },
        { order: { status: 'CANCELLED', deliveryFee: 40, cancelledAtStatus: 'READY' } },
      ]),
    ).toBe(230);
  });
});

describe('pickLiveTrackingLink', () => {
  const original = {
    jobId: 'job-1',
    job: {
      status: 'IN_PROGRESS' as const,
      driverId: 'd1',
      createdAt: created('2026-08-31T08:00:00.000Z'),
    },
  };
  const redelivery = {
    jobId: 'job-2',
    job: {
      status: 'ASSIGNED' as const,
      driverId: 'd2',
      createdAt: created('2026-08-31T09:00:00.000Z'),
    },
  };

  it('prefers the redelivery job while the original failed ride is still in progress', () => {
    const picked = pickLiveTrackingLink([original, redelivery], new Set(['job-1']));
    expect(picked?.jobId).toBe('job-2');
    expect(picked?.job.driverId).toBe('d2');
  });

  it('falls back to the original job when no redelivery exists yet', () => {
    const picked = pickLiveTrackingLink([original], new Set(['job-1']));
    expect(picked?.jobId).toBe('job-1');
  });
});
