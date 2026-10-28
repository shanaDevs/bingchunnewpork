import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { isFcmConfigured, sendDataMessage } from './fcm';
import { isDriverAlertEligible } from './deliveryJobHelpers';

export type NewJobPushPayload = {
  jobId: string;
  title: string;
  storeName: string;
  orderCount: number;
  rideCode?: string;
  totalCups?: number;
  estimatedDistanceKm?: number;
  estimatedMinutes?: number;
  deliveryFee?: number;
  storeId?: string;
  storeCity?: string;
  dropoffName?: string;
  dropoffAddress?: string;
  extraStopCount?: number;
  /** JSON array of { orderNumber, deliveryFee } for ring UI. */
  orderPreviewsJson?: string;
  /** Force an immediate ring even if the driver app already tracks this job (manual admin re-ring). */
  forceRing?: boolean;
};

/**
 * FCM push to every alert-eligible driver who can deliver for [storeId].
 * Complements the `newDeliveryJob` socket broadcast so alerts still land when
 * the driver app's process is dead. No-op when Firebase is not configured.
 *
 * Audience: ONLINE drivers, plus ON_DELIVERY drivers who are in RETURNING
 * (or only hold QUEUED rides) — i.e. not actively delivering customers.
 */
export async function sendPushToBranchDrivers(
  storeId: string,
  payload: NewJobPushPayload,
): Promise<{ driversTargeted: number; tokensSent: number }> {
  if (!isFcmConfigured()) return { driversTargeted: 0, tokensSent: 0 };

  const candidates = await prisma.adminUser.findMany({
    where: {
      role: { name: 'DELIVERY_DRIVER' },
      isActive: true,
      dutyStatus: { in: ['ONLINE', 'ON_DELIVERY'] },
      OR: [{ accessibleStores: { some: { id: storeId } } }, { storeId }],
    },
    select: { id: true, dutyStatus: true },
  });
  if (candidates.length === 0) return { driversTargeted: 0, tokensSent: 0 };

  const eligibleIds: string[] = [];
  await Promise.all(
    candidates.map(async (d) => {
      if (d.dutyStatus === 'ONLINE') {
        eligibleIds.push(d.id);
        return;
      }
      if (await isDriverAlertEligible(d.id)) {
        eligibleIds.push(d.id);
      }
    }),
  );
  if (eligibleIds.length === 0) return { driversTargeted: 0, tokensSent: 0 };

  const devices = await prisma.driverDevice.findMany({
    where: {
      driverId: { in: eligibleIds },
      fcmToken: { not: null },
    },
    select: { id: true, fcmToken: true },
  });
  if (devices.length === 0) return { driversTargeted: eligibleIds.length, tokensSent: 0 };

  const data = buildNewJobPushData(payload);

  // Sum the settled results — `tokensSent += await …` inside the map would read the
  // counter before awaiting, so concurrent sends would clobber each other's increments.
  const sent = await Promise.all(
    devices.map((device) => deliverToDevice(device.id, device.fcmToken!, data)),
  );
  const tokensSent = sent.reduce((n, one) => n + one, 0);

  logger.debug(
    `New-job push for ${payload.jobId}: ${tokensSent}/${devices.length} tokens across ${eligibleIds.length} drivers`,
  );
  return { driversTargeted: eligibleIds.length, tokensSent };
}

function buildNewJobPushData(payload: NewJobPushPayload): Record<string, string> {
  const data: Record<string, string> = {
    type: 'NEW_JOB',
    jobId: payload.jobId,
    title: payload.title,
    storeName: payload.storeName,
    orderCount: String(payload.orderCount),
  };
  if (payload.rideCode) data.rideCode = payload.rideCode;
  if (payload.totalCups != null) data.totalCups = String(payload.totalCups);
  if (payload.estimatedDistanceKm != null) {
    data.estimatedDistanceKm = String(payload.estimatedDistanceKm);
  }
  if (payload.estimatedMinutes != null) {
    data.estimatedMinutes = String(payload.estimatedMinutes);
  }
  if (payload.deliveryFee != null) data.deliveryFee = String(payload.deliveryFee);
  if (payload.storeId) data.storeId = payload.storeId;
  if (payload.storeCity) data.storeCity = payload.storeCity;
  if (payload.dropoffName) data.dropoffName = payload.dropoffName;
  if (payload.dropoffAddress) data.dropoffAddress = payload.dropoffAddress;
  if (payload.extraStopCount != null) data.extraStopCount = String(payload.extraStopCount);
  if (payload.orderPreviewsJson) data.orderPreviewsJson = payload.orderPreviewsJson;
  if (payload.forceRing) data.forceRing = 'true';
  return data;
}

async function deliverToDevice(
  deviceId: string,
  fcmToken: string,
  data: Record<string, string>,
): Promise<number> {
  const result = await sendDataMessage(fcmToken, data);
  if (result === 'sent') return 1;
  if (result === 'stale') {
    await prisma.driverDevice
      .update({ where: { id: deviceId }, data: { fcmToken: null } })
      .catch(() => {});
  }
  return 0;
}

export type OrderCancelledPushPayload = {
  jobId: string;
  orderId: string;
  orderNumber: string;
  cancelledBy: string;
};

/**
 * FCM to the rider currently holding a cancelled order. Deliberately separate from
 * [sendPushToDriver] — that one carries a new-job payload the driver app turns into a
 * ride offer, which is the wrong shape (and the wrong alert) for a cancellation.
 */
export async function sendOrderCancelledToDriver(
  driverId: string,
  payload: OrderCancelledPushPayload,
): Promise<{ tokensSent: number }> {
  if (!isFcmConfigured()) return { tokensSent: 0 };

  const devices = await prisma.driverDevice.findMany({
    where: { driverId, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });
  if (devices.length === 0) return { tokensSent: 0 };

  const data: Record<string, string> = {
    type: 'ORDER_CANCELLED',
    jobId: payload.jobId,
    orderId: payload.orderId,
    orderNumber: payload.orderNumber,
    cancelledBy: payload.cancelledBy,
  };

  const sent = await Promise.all(
    devices.map((device) => deliverToDevice(device.id, device.fcmToken!, data)),
  );
  const tokensSent = sent.reduce((n, one) => n + one, 0);

  logger.debug(
    `Order-cancelled push for ${payload.orderNumber} to driver ${driverId}: ${tokensSent}/${devices.length} tokens`,
  );
  return { tokensSent };
}

/** FCM to a single rider — used when admin assigns a redelivery rather than broadcasting the pool. */
export async function sendPushToDriver(
  driverId: string,
  payload: NewJobPushPayload,
): Promise<{ tokensSent: number }> {
  if (!isFcmConfigured()) return { tokensSent: 0 };

  const devices = await prisma.driverDevice.findMany({
    where: { driverId, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });
  if (devices.length === 0) return { tokensSent: 0 };

  const data = buildNewJobPushData(payload);
  const sent = await Promise.all(
    devices.map((device) => deliverToDevice(device.id, device.fcmToken!, data)),
  );
  const tokensSent = sent.reduce((n, one) => n + one, 0);

  logger.debug(
    `Assigned-job push for ${payload.jobId} to driver ${driverId}: ${tokensSent}/${devices.length} tokens`,
  );
  return { tokensSent };
}
