import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findMany: vi.fn() },
    driverDevice: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../../src/lib/fcm', () => ({
  isFcmConfigured: vi.fn(() => true),
  sendDataMessage: vi.fn(async () => 'sent'),
}));

vi.mock('../../src/lib/deliveryJobHelpers', () => ({
  isDriverAlertEligible: vi.fn(async () => true),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  sendDriverAccountUpdateToDriver,
  sendOrderCancelledToDriver,
  sendPushToBranchDrivers,
} from '../../src/lib/driverPush';
import { prisma } from '../../src/lib/prisma';
import { isFcmConfigured, sendDataMessage } from '../../src/lib/fcm';
import { isDriverAlertEligible } from '../../src/lib/deliveryJobHelpers';

const payload = {
  jobId: 'job-1',
  title: 'Evening run',
  storeName: 'Nugegoda',
  orderCount: 3,
};

function devicesFor(driverIds: string[]) {
  return driverIds.map((id) => ({ id: `device-${id}`, fcmToken: `token-${id}` })) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFcmConfigured).mockReturnValue(true);
  vi.mocked(sendDataMessage).mockResolvedValue('sent' as never);
  vi.mocked(isDriverAlertEligible).mockResolvedValue(true as never);
  vi.mocked(prisma.driverDevice.update).mockResolvedValue({} as never);
});

/**
 * The new-job ring audience. Two rules ride on this query: a driver only ever hears
 * about their own branches, and only while they are not mid-delivery.
 */
describe('sendPushToBranchDrivers — audience', () => {
  it('scopes candidates to the branch, by home store or accessible stores', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([] as never);

    await sendPushToBranchDrivers('store-1', payload);

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith({
      where: {
        role: { name: 'DELIVERY_DRIVER' },
        isActive: true,
        dutyStatus: { in: ['ONLINE', 'ON_DELIVERY'] },
        OR: [{ accessibleStores: { some: { id: 'store-1' } } }, { storeId: 'store-1' }],
      },
      select: { id: true, dutyStatus: true },
    });
  });

  it('includes an ONLINE driver without an eligibility lookup', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'idle', dutyStatus: 'ONLINE' },
    ] as never);
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['idle']));

    const result = await sendPushToBranchDrivers('store-1', payload);

    expect(isDriverAlertEligible).not.toHaveBeenCalled();
    expect(result).toEqual({ driversTargeted: 1, tokensSent: 1 });
  });

  it('includes an ON_DELIVERY driver who is returning to the branch', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'returning', dutyStatus: 'ON_DELIVERY' },
    ] as never);
    vi.mocked(isDriverAlertEligible).mockResolvedValue(true as never);
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['returning']));

    const result = await sendPushToBranchDrivers('store-1', payload);

    expect(isDriverAlertEligible).toHaveBeenCalledWith('returning');
    expect(result.driversTargeted).toBe(1);
  });

  it('excludes an ON_DELIVERY driver who is actively delivering', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'busy', dutyStatus: 'ON_DELIVERY' },
    ] as never);
    vi.mocked(isDriverAlertEligible).mockResolvedValue(false as never);

    const result = await sendPushToBranchDrivers('store-1', payload);

    expect(result).toEqual({ driversTargeted: 0, tokensSent: 0 });
    expect(prisma.driverDevice.findMany).not.toHaveBeenCalled();
  });

  it('rings only the eligible half of a mixed branch', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'idle', dutyStatus: 'ONLINE' },
      { id: 'busy', dutyStatus: 'ON_DELIVERY' },
      { id: 'returning', dutyStatus: 'ON_DELIVERY' },
    ] as never);
    vi.mocked(isDriverAlertEligible).mockImplementation(
      async (driverId: string) => driverId === 'returning',
    );
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['idle', 'returning']));

    const result = await sendPushToBranchDrivers('store-1', payload);

    expect(result.driversTargeted).toBe(2);
    const queriedIds = vi.mocked(prisma.driverDevice.findMany).mock.calls[0][0] as {
      where: { driverId: { in: string[] } };
    };
    expect(queriedIds.where.driverId.in.sort()).toEqual(['idle', 'returning']);
  });

  it('no-ops when nobody covers the branch', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([] as never);

    expect(await sendPushToBranchDrivers('store-1', payload)).toEqual({
      driversTargeted: 0,
      tokensSent: 0,
    });
    expect(sendDataMessage).not.toHaveBeenCalled();
  });

  it('reports the audience even when nobody has a device token', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'idle', dutyStatus: 'ONLINE' },
    ] as never);
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue([] as never);

    expect(await sendPushToBranchDrivers('store-1', payload)).toEqual({
      driversTargeted: 1,
      tokensSent: 0,
    });
  });

  it('no-ops when Firebase is not configured', async () => {
    vi.mocked(isFcmConfigured).mockReturnValue(false);

    expect(await sendPushToBranchDrivers('store-1', payload)).toEqual({
      driversTargeted: 0,
      tokensSent: 0,
    });
    expect(prisma.adminUser.findMany).not.toHaveBeenCalled();
  });

  it('clears a stale token rather than retrying it forever', async () => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'idle', dutyStatus: 'ONLINE' },
    ] as never);
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['idle']));
    vi.mocked(sendDataMessage).mockResolvedValue('stale' as never);

    const result = await sendPushToBranchDrivers('store-1', payload);

    expect(result.tokensSent).toBe(0);
    expect(prisma.driverDevice.update).toHaveBeenCalledWith({
      where: { id: 'device-idle' },
      data: { fcmToken: null },
    });
  });
});

/** Branch-side "Re-ring" must reach the phone even mid quiet-gap. */
describe('sendPushToBranchDrivers — forceRing', () => {
  beforeEach(() => {
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([
      { id: 'idle', dutyStatus: 'ONLINE' },
    ] as never);
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['idle']));
  });

  it('serializes forceRing as the string "true"', async () => {
    await sendPushToBranchDrivers('store-1', { ...payload, forceRing: true });

    const data = vi.mocked(sendDataMessage).mock.calls[0][1];
    expect(data.forceRing).toBe('true');
    expect(data.type).toBe('NEW_JOB');
  });

  it('omits forceRing on an ordinary broadcast', async () => {
    await sendPushToBranchDrivers('store-1', payload);

    expect(vi.mocked(sendDataMessage).mock.calls[0][1]).not.toHaveProperty('forceRing');
  });

  it('serializes storeId on the NEW_JOB data payload', async () => {
    await sendPushToBranchDrivers('store-1', { ...payload, storeId: 'store-1' });

    expect(vi.mocked(sendDataMessage).mock.calls[0][1].storeId).toBe('store-1');
  });
});

describe('sendOrderCancelledToDriver', () => {
  const cancelPayload = {
    jobId: 'job-1',
    orderId: 'order-1',
    orderNumber: 'BC-1042',
    cancelledBy: 'customer',
  };

  it('sends a data-only ORDER_CANCELLED push to every device the rider has', async () => {
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['a', 'b']));

    const result = await sendOrderCancelledToDriver('driver-1', cancelPayload);

    expect(result).toEqual({ tokensSent: 2 });
    expect(vi.mocked(sendDataMessage).mock.calls[0][1]).toEqual({
      type: 'ORDER_CANCELLED',
      jobId: 'job-1',
      orderId: 'order-1',
      orderNumber: 'BC-1042',
      cancelledBy: 'customer',
    });
  });

  it('no-ops when Firebase is not configured', async () => {
    vi.mocked(isFcmConfigured).mockReturnValue(false);

    expect(await sendOrderCancelledToDriver('driver-1', cancelPayload)).toEqual({ tokensSent: 0 });
    expect(prisma.driverDevice.findMany).not.toHaveBeenCalled();
  });

  it('clears a stale token', async () => {
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['a']));
    vi.mocked(sendDataMessage).mockResolvedValue('stale' as never);

    expect(await sendOrderCancelledToDriver('driver-1', cancelPayload)).toEqual({ tokensSent: 0 });
    expect(prisma.driverDevice.update).toHaveBeenCalledWith({
      where: { id: 'device-a' },
      data: { fcmToken: null },
    });
  });
});

describe('sendDriverAccountUpdateToDriver', () => {
  const accountPayload = {
    notificationId: 'notif-1',
    kind: 'COMPLAINT' as const,
    title: 'Complaint confirmed',
    body: 'Your complaint on order #1042 was confirmed.',
    complaintId: 'cp-1',
  };

  it('sends DRIVER_UPDATE data to every device', async () => {
    vi.mocked(prisma.driverDevice.findMany).mockResolvedValue(devicesFor(['a']));

    const result = await sendDriverAccountUpdateToDriver('driver-1', accountPayload);

    expect(result).toEqual({ tokensSent: 1 });
    expect(vi.mocked(sendDataMessage).mock.calls[0][1]).toEqual({
      type: 'DRIVER_UPDATE',
      notificationId: 'notif-1',
      kind: 'COMPLAINT',
      title: accountPayload.title,
      body: accountPayload.body,
      complaintId: 'cp-1',
    });
  });

  it('no-ops when Firebase is not configured', async () => {
    vi.mocked(isFcmConfigured).mockReturnValue(false);
    expect(await sendDriverAccountUpdateToDriver('driver-1', accountPayload)).toEqual({ tokensSent: 0 });
    expect(prisma.driverDevice.findMany).not.toHaveBeenCalled();
  });
});
