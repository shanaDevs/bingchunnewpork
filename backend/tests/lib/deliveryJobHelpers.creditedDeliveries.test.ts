import { describe, expect, it } from 'vitest';
import {
  creditedDeliveredTotals,
  groupFailedOrderIdsByJob,
  isCreditedDelivery,
} from '../../src/lib/deliveryJobHelpers';

const stop = (
  orderId: string,
  status: string,
  deliveryFee: number,
  cancelledAtStatus?: string | null,
) => ({
  orderId,
  order: { status, deliveryFee, cancelledAtStatus },
});

describe('isCreditedDelivery', () => {
  it('credits a delivered stop with no failure on this job', () => {
    expect(isCreditedDelivery('DELIVERED', false)).toBe(true);
  });

  it('does not credit a delivered stop that failed on this job', () => {
    expect(isCreditedDelivery('DELIVERED', true)).toBe(false);
  });

  it('does not credit undelivered stops', () => {
    expect(isCreditedDelivery('OUT_FOR_DELIVERY', false)).toBe(false);
    expect(isCreditedDelivery('OUT_FOR_DELIVERY', true)).toBe(false);
  });

  it('credits a customer cancel after the run started', () => {
    expect(isCreditedDelivery('CANCELLED', false, 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('does not credit a cancel before the run started', () => {
    expect(isCreditedDelivery('CANCELLED', false, 'READY')).toBe(false);
    expect(isCreditedDelivery('CANCELLED', false, null)).toBe(false);
    expect(isCreditedDelivery('CANCELLED', false)).toBe(false);
  });

  it('does not credit a mid-ride cancel that already failed on this job', () => {
    expect(isCreditedDelivery('CANCELLED', true, 'OUT_FOR_DELIVERY')).toBe(false);
  });
});

describe('groupFailedOrderIdsByJob', () => {
  it('groups leftover failed stops by job', () => {
    const grouped = groupFailedOrderIdsByJob([
      { jobId: 'job-a', orderId: 'ord-2' },
      { jobId: 'job-a', orderId: 'ord-3' },
      { jobId: 'job-b', orderId: 'ord-9' },
    ]);
    expect(grouped.get('job-a')).toEqual(new Set(['ord-2', 'ord-3']));
    expect(grouped.get('job-b')).toEqual(new Set(['ord-9']));
  });
});

describe('creditedDeliveredTotals', () => {
  it('sums only stops this rider delivered on this job', () => {
    expect(
      creditedDeliveredTotals([
        stop('ord-1', 'DELIVERED', 200),
        stop('ord-2', 'OUT_FOR_DELIVERY', 300),
        stop('ord-3', 'OUT_FOR_DELIVERY', 150),
      ]),
    ).toEqual({ deliveredCount: 1, deliveredTotal: 200 });
  });

  it('excludes a leftover failed stop even after another rider delivers it', () => {
    // Ride with 2 orders: A delivered ord-1, failed on ord-2. B later marks ord-2 DELIVERED.
    expect(
      creditedDeliveredTotals(
        [stop('ord-1', 'DELIVERED', 200), stop('ord-2', 'DELIVERED', 300)],
        new Set(['ord-2']),
      ),
    ).toEqual({ deliveredCount: 1, deliveredTotal: 200 });
  });

  it('credits the replacement rider for the same order on their redelivery job', () => {
    expect(
      creditedDeliveredTotals([stop('ord-2', 'DELIVERED', 300), stop('ord-3', 'DELIVERED', 150)]),
    ).toEqual({ deliveredCount: 2, deliveredTotal: 450 });
  });

  it('credits a mid-ride cancel together with delivered stops', () => {
    expect(
      creditedDeliveredTotals([
        stop('ord-1', 'DELIVERED', 200),
        stop('ord-2', 'CANCELLED', 150, 'OUT_FOR_DELIVERY'),
        stop('ord-3', 'CANCELLED', 80, 'READY'),
      ]),
    ).toEqual({ deliveredCount: 2, deliveredTotal: 350 });
  });
});
