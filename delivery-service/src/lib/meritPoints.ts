import { prisma } from '@bingchun/db';
import {
  clampMeritPoints,
  MERIT_DELTAS,
  meritStatusBand,
  patchDriverOpsProfile,
  RECOVERY_STREAK,
  riderProfileEnabled,
} from '@bingchun/delivery-domain';

type MeritEventType =
  | 'INITIAL'
  | 'LATE_DELIVERY'
  | 'CANCEL_BEFORE_PICKUP'
  | 'CONFIRMED_COMPLAINT'
  | 'SERIOUS_VIOLATION'
  | 'RECOVERY_BONUS'
  | 'MANUAL_ADJUSTMENT';

export async function applyMeritDelta(params: {
  driverId: string;
  orderId?: string | null;
  delta: number;
  eventType: MeritEventType;
  reason: string;
  createdBy?: string;
}): Promise<{ previousPoints: number; newPoints: number; band: string }> {
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
              id: crypto.randomUUID(),
              adminUserId: params.driverId,
              ...meritOps,
            },
            update: meritOps,
          }),
        ]
      : []),
    prisma.meritPointHistory.create({
      data: {
        id: crypto.randomUUID(),
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

/** Record a successful delivery and apply recovery bonus when streak hits 20. */
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

export { meritStatusBand, MERIT_DELTAS };
