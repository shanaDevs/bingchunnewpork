import { prisma } from '@bingchun/db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isDriverAlertEligible } from './deliveryJobHelpers';

let app: import('firebase-admin/app').App | null = null;
let initialized = false;
let unavailable = false;

/** Lazily loads firebase-admin only if configured — keeps it an optional dependency
 *  for environments that don't set FIREBASE_SERVICE_ACCOUNT_JSON. */
async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  if (unavailable) return false;
  if (!config.firebaseServiceAccountJson) return false;

  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
    app = initializeApp({ credential: cert(serviceAccount) }, 'delivery-service');
    initialized = true;
    logger.info('Firebase Admin SDK initialized (delivery-service)');
    return true;
  } catch (err) {
    unavailable = true;
    logger.warn('FCM unavailable for delivery-service — push notifications disabled', err);
    return false;
  }
}

/** Best-effort push to a driver's registered devices. Never throws — callers should
 *  treat delivery failures as a soft-fail (the driver still sees updates in-app). */
export async function sendPushToDriver(
  driverId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ tokensTargeted: number; tokensSent: number }> {
  if (!(await ensureInitialized()) || !app) return { tokensTargeted: 0, tokensSent: 0 };

  const devices = await prisma.driverDevice.findMany({
    where: { driverId, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });
  if (devices.length === 0) return { tokensTargeted: 0, tokensSent: 0 };

  const { getMessaging } = await import('firebase-admin/messaging');
  let tokensSent = 0;

  await Promise.all(
    devices.map(async (device) => {
      if (!device.fcmToken) return;
      try {
        await getMessaging(app!).send({
          token: device.fcmToken,
          notification: { title, body },
          data: data ?? {},
          android: { priority: 'high' },
        });
        tokensSent += 1;
      } catch (err: any) {
        if (
          err?.code === 'messaging/invalid-registration-token' ||
          err?.code === 'messaging/registration-token-not-registered'
        ) {
          await prisma.driverDevice.update({ where: { id: device.id }, data: { fcmToken: null } }).catch(() => {});
        } else {
          logger.warn('FCM send error (delivery-service)', err);
        }
      }
    }),
  );

  return { tokensTargeted: devices.length, tokensSent };
}

export type NewJobPushPayload = {
  jobId: string;
  title: string;
  storeName: string;
  storeId?: string;
  orderCount: number;
  /** Force an immediate ring even if the driver app already tracks this job. */
  forceRing?: boolean;
};

/**
 * FCM to every alert-eligible driver who can deliver for [storeId] (mirrors core
 * sendPushToBranchDrivers). Audience: ONLINE drivers, plus ON_DELIVERY drivers who are
 * RETURNING (or only hold QUEUED rides) — i.e. not actively delivering customers.
 */
export async function sendPushToBranchDrivers(
  storeId: string,
  payload: NewJobPushPayload,
): Promise<{ driversTargeted: number; tokensSent: number }> {
  if (!(await ensureInitialized()) || !app) return { driversTargeted: 0, tokensSent: 0 };

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

  const drivers: Array<{ id: string }> = [];
  await Promise.all(
    candidates.map(async (d) => {
      if (d.dutyStatus === 'ONLINE' || (await isDriverAlertEligible(d.id))) {
        drivers.push({ id: d.id });
      }
    }),
  );
  if (drivers.length === 0) return { driversTargeted: 0, tokensSent: 0 };

  const devices = await prisma.driverDevice.findMany({
    where: {
      driverId: { in: drivers.map((d) => d.id) },
      fcmToken: { not: null },
    },
    select: { id: true, fcmToken: true },
  });
  if (devices.length === 0) return { driversTargeted: drivers.length, tokensSent: 0 };

  const { getMessaging } = await import('firebase-admin/messaging');
  const data: Record<string, string> = {
    type: 'NEW_JOB',
    jobId: payload.jobId,
    title: payload.title,
    storeName: payload.storeName,
    orderCount: String(payload.orderCount),
  };
  if (payload.storeId) data.storeId = payload.storeId;
  if (payload.forceRing) data.forceRing = 'true';

  const body = [
    payload.title,
    payload.storeName,
    payload.orderCount > 0
      ? `${payload.orderCount} ${payload.orderCount === 1 ? 'order' : 'orders'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let tokensSent = 0;
  await Promise.all(
    devices.map(async (device) => {
      if (!device.fcmToken) return;
      try {
        await getMessaging(app!).send({
          token: device.fcmToken,
          notification: { title: 'New delivery job', body },
          data,
          android: { priority: 'high' },
        });
        tokensSent += 1;
      } catch (err: any) {
        if (
          err?.code === 'messaging/invalid-registration-token' ||
          err?.code === 'messaging/registration-token-not-registered'
        ) {
          await prisma.driverDevice.update({ where: { id: device.id }, data: { fcmToken: null } }).catch(() => {});
        } else {
          logger.warn('FCM send error (delivery-service branch push)', err);
        }
      }
    }),
  );

  logger.debug(
    `New-job push for ${payload.jobId}: ${tokensSent}/${devices.length} tokens across ${drivers.length} drivers`,
  );
  return { driversTargeted: drivers.length, tokensSent };
}

export type OrderCancelledPushPayload = {
  jobId: string;
  orderId: string;
  orderNumber: string;
  cancelledBy: string;
};

/**
 * Data-only FCM to the rider holding a cancelled order. No `notification` block —
 * the driver app turns `type: ORDER_CANCELLED` into the cancel tone itself.
 * A notification payload would be shown by Android and would not run that handler
 * while the app is in the background.
 *
 * Never throws.
 */
export async function sendOrderCancelledToDriver(
  driverId: string,
  payload: OrderCancelledPushPayload,
): Promise<{ tokensSent: number }> {
  try {
    if (!(await ensureInitialized()) || !app) return { tokensSent: 0 };

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

    const { getMessaging } = await import('firebase-admin/messaging');
    const sent = await Promise.all(
      devices.map(async (device) => {
        if (!device.fcmToken) return 0;
        try {
          await getMessaging(app!).send({
            token: device.fcmToken,
            data,
            android: { priority: 'high' },
          });
          return 1;
        } catch (err: any) {
          if (
            err?.code === 'messaging/invalid-registration-token' ||
            err?.code === 'messaging/registration-token-not-registered'
          ) {
            await prisma.driverDevice.update({ where: { id: device.id }, data: { fcmToken: null } }).catch(() => {});
          } else {
            logger.warn('FCM order-cancelled send error (delivery-service)', err);
          }
          return 0;
        }
      }),
    );
    const tokensSent = sent.reduce<number>((n, one) => n + one, 0);
    logger.debug(
      `Order-cancelled push for ${payload.orderNumber} to driver ${driverId}: ${tokensSent}/${devices.length} tokens`,
    );
    return { tokensSent };
  } catch (err) {
    logger.error('sendOrderCancelledToDriver failed', { driverId, err });
    return { tokensSent: 0 };
  }
}

export function isFcmConfigured(): boolean {
  return !!config.firebaseServiceAccountJson;
}
