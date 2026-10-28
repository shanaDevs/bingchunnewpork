import { prisma } from './prisma';
import { addColumnIfMissing } from './schemaPatch';

export const TAKEAWAY_SLOT_MINUTES = 15;
export const PICKUP_REMINDER_MINUTES = 5;

const ACTIVE_STATUSES = ['RECEIVED', 'PREPARING', 'READY'] as const;

let columnsReady = false;
let todayTokensFixed = false;

export async function ensureTakeawayQueueColumns(): Promise<void> {
  if (columnsReady) return;

  await addColumnIfMissing('orders', 'queuePosition', 'INT NULL');
  await addColumnIfMissing('orders', 'scheduledPickupAt', 'DATETIME(3) NULL');
  await addColumnIfMissing('orders', 'pickupReminderSent', 'TINYINT(1) NOT NULL DEFAULT 0');

  columnsReady = true;
}

/**
 * On startup, renumber all of today's takeaway tokens per store starting from 1
 * ordered by createdAt. Fixes any tokens that carried over from a previous day.
 */
export async function renumberTodayTokens(): Promise<void> {
  if (todayTokensFixed) return;
  todayTokensFixed = true;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const storeRows = await prisma.order.findMany({
    where: { orderMode: 'TAKEAWAY', createdAt: { gte: todayStart, lte: todayEnd } },
    distinct: ['storeId'],
    select: { storeId: true },
  });

  for (const { storeId } of storeRows) {
    const todayOrders = await prisma.order.findMany({
      where: {
        storeId,
        orderMode: 'TAKEAWAY',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, queuePosition: true },
    });

    const updates = todayOrders
      .map((o, idx) => ({ o, correctPosition: idx + 1 }))
      .filter(({ o, correctPosition }) => o.queuePosition !== correctPosition)
      .map(({ o, correctPosition }) =>
        prisma.order.update({
          where: { id: o.id },
          data: { queuePosition: correctPosition },
        })
      );

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Assign queue slot when a new takeaway order is placed */
export async function assignTakeawayQueueSlot(
  storeId: string,
  orderId: string,
  requestedPickupAt?: Date | null,
): Promise<{
  queuePosition: number;
  scheduledPickupAt: Date;
}> {
  await ensureTakeawayQueueColumns();

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const active = await prisma.order.findMany({
    where: {
      storeId,
      orderMode: 'TAKEAWAY',
      status: { in: [...ACTIVE_STATUSES] },
      id: { not: orderId },
    },
    orderBy: [{ queuePosition: 'asc' }, { createdAt: 'asc' }],
    select: { queuePosition: true, scheduledPickupAt: true },
  });

  // Token numbers reset to 1 each calendar day per store.
  // Count-based so it's immune to any stale/wrong token values already in DB.
  const todayOrderCount = await prisma.order.count({
    where: {
      storeId,
      orderMode: 'TAKEAWAY',
      createdAt: { gte: todayStart, lte: todayEnd },
      id: { not: orderId },
    },
  });

  const queuePosition = todayOrderCount + 1;

  const lastPickup = active
    .map((o) => o.scheduledPickupAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const customerTarget = requestedPickupAt
    ? new Date(Math.max(requestedPickupAt.getTime(), now.getTime()))
    : addMinutes(now, TAKEAWAY_SLOT_MINUTES);

  const queueTarget = lastPickup
    ? addMinutes(lastPickup, TAKEAWAY_SLOT_MINUTES)
    : addMinutes(now, TAKEAWAY_SLOT_MINUTES);

  const scheduledPickupAt = new Date(Math.max(customerTarget.getTime(), queueTarget.getTime()));

  await prisma.order.update({
    where: { id: orderId },
    data: { queuePosition, scheduledPickupAt },
  });

  return { queuePosition, scheduledPickupAt };
}

/** Recalculate pickup times after admin reorders the queue */
export async function reorderTakeawayQueue(
  storeId: string,
  orderedOrderIds: string[]
): Promise<void> {
  await ensureTakeawayQueueColumns();

  if (!orderedOrderIds.length) return;

  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderedOrderIds },
      storeId,
      orderMode: 'TAKEAWAY',
      status: { in: [...ACTIVE_STATUSES] },
    },
  });

  if (orders.length !== orderedOrderIds.length) {
    throw new Error('Some orders are not active takeaway orders for this store');
  }

  const now = new Date();
  const baseTime = addMinutes(now, TAKEAWAY_SLOT_MINUTES);

  await prisma.$transaction(
    orderedOrderIds.map((id, index) =>
      prisma.order.update({
        where: { id },
        data: {
          queuePosition: index + 1,
          scheduledPickupAt: addMinutes(baseTime, index * TAKEAWAY_SLOT_MINUTES),
          pickupReminderSent: false,
        },
      })
    )
  );
}

/** Send notifications ~5 minutes before scheduled pickup */
export async function processPickupReminders(): Promise<number> {
  await ensureTakeawayQueueColumns();

  const now = new Date();
  const windowEnd = addMinutes(now, PICKUP_REMINDER_MINUTES);

  const due = await prisma.order.findMany({
    where: {
      orderMode: 'TAKEAWAY',
      status: { in: [...ACTIVE_STATUSES] },
      pickupReminderSent: false,
      scheduledPickupAt: { lte: windowEnd, gt: now },
    },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      queuePosition: true,
      scheduledPickupAt: true,
    },
  });

  if (!due.length) return 0;

  const { notifyPickupSoon } = await import('./customerNotifications');

  for (const order of due) {
    await notifyPickupSoon(order);
    await prisma.order.update({
      where: { id: order.id },
      data: { pickupReminderSent: true },
    });
  }

  return due.length;
}

export async function getTakeawayQueue(storeId?: string) {
  await ensureTakeawayQueueColumns();

  return prisma.order.findMany({
    where: {
      orderMode: 'TAKEAWAY',
      status: { in: [...ACTIVE_STATUSES] },
      ...(storeId ? { storeId } : {}),
    },
    orderBy: [{ queuePosition: 'asc' }, { scheduledPickupAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      items: { select: { productName: true, quantity: true } },
      store: { select: { id: true, name: true } },
      user: { select: { name: true, phone: true } },
    },
  });
}
