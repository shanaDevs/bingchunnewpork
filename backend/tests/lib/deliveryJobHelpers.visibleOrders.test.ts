import { describe, expect, it } from 'vitest';
import {
  isActiveDeliveryJobStatus,
  visibleJobOrderLinksForDeliveryJob,
  visibleOrdersForDeliveryJob,
} from '../../src/lib/deliveryJobHelpers';

describe('isActiveDeliveryJobStatus', () => {
  it('treats scheduled, assigned, in-progress, and returning jobs as active', () => {
    expect(isActiveDeliveryJobStatus('SCHEDULED')).toBe(true);
    expect(isActiveDeliveryJobStatus('ASSIGNED')).toBe(true);
    expect(isActiveDeliveryJobStatus('IN_PROGRESS')).toBe(true);
    expect(isActiveDeliveryJobStatus('RETURNING')).toBe(true);
    expect(isActiveDeliveryJobStatus('QUEUED')).toBe(true);
  });

  it('treats completed and cancelled jobs as inactive', () => {
    expect(isActiveDeliveryJobStatus('COMPLETED')).toBe(false);
    expect(isActiveDeliveryJobStatus('CANCELLED')).toBe(false);
  });
});

describe('visibleOrdersForDeliveryJob', () => {
  const orders = [
    { id: '1', status: 'READY' },
    { id: '2', status: 'CANCELLED' },
    { id: '3', status: 'OUT_FOR_DELIVERY' },
  ];

  it('omits cancelled orders from active jobs', () => {
    expect(visibleOrdersForDeliveryJob('SCHEDULED', orders)).toEqual([
      { id: '1', status: 'READY' },
      { id: '3', status: 'OUT_FOR_DELIVERY' },
    ]);
    expect(visibleOrdersForDeliveryJob('IN_PROGRESS', orders).map((o) => o.id)).toEqual(['1', '3']);
  });

  it('keeps cancelled orders on completed jobs', () => {
    expect(visibleOrdersForDeliveryJob('COMPLETED', orders)).toEqual(orders);
  });
});

describe('visibleJobOrderLinksForDeliveryJob', () => {
  const links = [
    { orderId: 'a', order: { status: 'DELIVERED', total: 10 } },
    { orderId: 'b', order: { status: 'CANCELLED', total: 20 } },
    { orderId: 'c', order: { status: 'READY', total: 30 } },
  ];

  it('omits cancelled links from active job counts', () => {
    const visible = visibleJobOrderLinksForDeliveryJob('ASSIGNED', links);
    expect(visible.map((link) => link.orderId)).toEqual(['a', 'c']);
    expect(visible.reduce((sum, link) => sum + link.order.total, 0)).toBe(40);
  });

  it('keeps cancelled links on completed jobs', () => {
    expect(visibleJobOrderLinksForDeliveryJob('COMPLETED', links)).toEqual(links);
  });
});
