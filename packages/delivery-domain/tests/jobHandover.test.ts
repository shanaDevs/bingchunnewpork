import { describe, expect, it } from 'vitest';
import { pickReassignedRiders } from '../src/reassignedRiders';

describe('pickReassignedRiders', () => {
  it('returns empty list when no redelivery jobs exist', () => {
    const map = pickReassignedRiders({
      failedJobIds: ['job-failed'],
      attempts: [{ jobId: 'job-failed', orderId: 'o1', createdAt: new Date('2026-01-01T10:00:00Z') }],
      links: [
        {
          orderId: 'o1',
          job: {
            id: 'job-failed',
            status: 'VEHICLE_FAILURE',
            rideCode: 'A',
            createdAt: new Date('2026-01-01T09:00:00Z'),
            driver: { id: 'd1', name: 'A', phone: '1' },
          },
        },
      ],
    });
    expect(map.get('job-failed')).toEqual([]);
  });
});