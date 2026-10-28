import { randomUUID } from 'crypto';
import { patchDriverOpsProfile, riderProfileEnabled } from '@bingchun/delivery-domain';
import { prisma } from './prisma';

/**
 * Legacy mirror of `delivery-service/src/lib/meritPoints.ts`. The bands and deltas
 * live in `@bingchun/delivery-domain`; they are restated here because the legacy
 * backend does not depend on that package.
 */
export const MERIT_DELTAS = {
  LATE_DELIVERY: -2,
  CANCEL_BEFORE_PICKUP: -5,
  CONFIRMED_COMPLAINT: -5,
  SERIOUS_VIOLATION: -10,
  RECOVERY_BONUS: 5,
} as const;

export const RECOVERY_STREAK = 20;

export type MeritStatusBand = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'WARNING' | 'CRITICAL';

export type MeritEventType =
  | 'INITIAL'
  | 'LATE_DELIVERY'
  | 'CANCEL_BEFORE_PICKUP'
  | 'CONFIRMED_COMPLAINT'
  | 'SERIOUS_VIOLATION'
  | 'RECOVERY_BONUS'
  | 'MANUAL_ADJUSTMENT';

export function meritStatusBand(points: number): MeritStatusBand {
  const p = Math.max(0, Math.min(100, points));
  if (p >= 90) return 'EXCELLENT';
  if (p >= 75) return 'GOOD';
  if (p >= 60) return 'AVERAGE';
  if (p >= 40) return 'WARNING';
  return 'CRITICAL';
}

export function clampMeritPoints(points: number): number {
  return Math.max(0, Math.min(100, Math.round(points)));
}

export async function applyMeritDelta(params: {
  driverId: string;
  orderId?: string | null;
  delta: number;
  eventType: MeritEventType;
  reason: string;
  createdBy?: string;
}): Promise<{ previousPoints: number; newPoints: number; band: MeritStatusBand }> {
  const driver = await prisma.adminUser.findUnique({
    where: { id: params.driverId },
    select: { meritPoints: true, consecutiveSuccessfulDeliveries: true },
  });
  if (!driver) throw new Error('Driver not found for merit update');

  const previousPoints = driver.meritPoints ?? 100;
  const newPoints = clampMeritPoints(previousPoints + params.delta);

  let consecutive = driver.consecutiveSuccessfulDeliveries ?? 0;
  if (params.eventType === 'CANCEL_BEFORE_PICKUP' || params.eventType === 'CONFIRMED_COMPLAINT') {
    consecutive = 0;
  }

  const meritOps = {
    meritPoints: newPoints,
    consecutiveSuccessfulDeliveries: consecutive,
  };

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: params.driverId },
      data: meritOps,
    }),
    ...(riderProfileEnabled()
      ? [
          prisma.riderProfile.upsert({
            where: { adminUserId: params.driverId },
            create: {
              id: randomUUID(),
              adminUserId: params.driverId,
              ...meritOps,
            },
            update: meritOps,
          }),
        ]
      : []),
    prisma.meritPointHistory.create({
      data: {
        id: randomUUID(),
        driverId: params.driverId,
        orderId: params.orderId ?? null,
        previousPoints,
        changedPoints: params.delta,
        newPoints,
        reason: params.reason,
        eventType: params.eventType,
        createdBy: params.createdBy ?? 'SYSTEM',
      },
    }),
  ]);

  return { previousPoints, newPoints, band: meritStatusBand(newPoints) };
}

/** Record a successful delivery and apply the recovery bonus when the streak hits 20. */
export async function recordSuccessfulDelivery(driverId: string, orderId: string): Promise<void> {
  const driver = await prisma.adminUser.findUnique({
    where: { id: driverId },
    select: { consecutiveSuccessfulDeliveries: true, meritPoints: true },
  });
  if (!driver) return;

  const nextStreak = (driver.consecutiveSuccessfulDeliveries ?? 0) + 1;
  await patchDriverOpsProfile(driverId, { consecutiveSuccessfulDeliveries: nextStreak });

  if (nextStreak > 0 && nextStreak % RECOVERY_STREAK === 0) {
    await applyMeritDelta({
      driverId,
      orderId,
      delta: MERIT_DELTAS.RECOVERY_BONUS,
      eventType: 'RECOVERY_BONUS',
      reason: `${RECOVERY_STREAK} consecutive successful deliveries`,
    });
  }
}
