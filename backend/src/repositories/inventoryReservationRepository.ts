import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { ReservationLineInput, ReservationRow, ReservationStatus } from '../lib/inventoryReservationSchema';

type DbClient = Prisma.TransactionClient | typeof prisma;
type Tx = Prisma.TransactionClient;

type LockedStockRow = {
  stock: number;
  isAvailable: boolean | number;
  weeklyRemainingQty: number;
  onlineOutOfStockThreshold: number | null;
};

export class InsufficientStockError extends Error {
  constructor(
    message: string,
    public readonly productId?: string,
    public readonly available?: number,
  ) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

function aggregateLines(items: ReservationLineInput[]): Map<string, { quantity: number; productName?: string }> {
  const totals = new Map<string, { quantity: number; productName?: string }>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const existing = totals.get(item.productId);
    totals.set(item.productId, {
      quantity: (existing?.quantity ?? 0) + item.quantity,
      productName: item.productName ?? existing?.productName,
    });
  }
  return totals;
}

async function lockStoreProduct(tx: Tx, storeId: string, productId: string): Promise<LockedStockRow | null> {
  const rows = await tx.$queryRaw<LockedStockRow[]>`
    SELECT stock, "isAvailable", "weeklyRemainingQty", "onlineOutOfStockThreshold"
    FROM store_products
    WHERE "storeId" = ${storeId} AND "productId" = ${productId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

function onlineSellableFromLocked(locked: LockedStockRow, reserved: number): number {
  const buffer = locked.onlineOutOfStockThreshold ?? 5;
  return Math.max(0, locked.stock - reserved - buffer);
}

export type ReservationStockChannel = 'WEB' | 'POS';

function sellableFromLocked(
  locked: LockedStockRow,
  reserved: number,
  channel: ReservationStockChannel,
): number {
  if (channel === 'POS') {
    return Math.max(0, locked.stock - reserved);
  }
  return onlineSellableFromLocked(locked, reserved);
}

/**
 * FIFO deduction can only take ACTIVE batch remaining. When a product is
 * batch-tracked, sellable stock is the lower of the branch row and the batches.
 */
async function sellableAgainstBatches(
  db: DbClient,
  storeId: string,
  productId: string,
  locked: LockedStockRow,
  reserved: number,
  channel: ReservationStockChannel,
): Promise<number> {
  const fromRow = sellableFromLocked(locked, reserved, channel);
  const rows = await db.$queryRaw<Array<{ batches: bigint | number | null; active: bigint | number | null }>>`
    SELECT
      COUNT(*) AS batches,
      COALESCE(SUM("remainingQty") FILTER (WHERE status = 'ACTIVE' AND "remainingQty" > 0), 0) AS active
    FROM stock_batches
    WHERE "storeId" = ${storeId} AND "productId" = ${productId}
  `;
  const batches = Number(rows[0]?.batches ?? 0);
  if (batches <= 0) return fromRow;

  const active = Number(rows[0]?.active ?? 0);
  const buffer = channel === 'POS' ? 0 : (locked.onlineOutOfStockThreshold ?? 5);
  const fromBatches = Math.max(0, active - reserved - buffer);
  return Math.min(fromRow, fromBatches);
}

/** Validate availability inside an open transaction with row locks (TOCTOU-safe). */
export async function validateStockAvailabilityInTx(
  tx: Tx,
  storeId: string,
  items: ReservationLineInput[],
  channel: ReservationStockChannel = 'WEB',
): Promise<void> {
  const totals = aggregateLines(items);
  if (totals.size === 0) {
    throw new InsufficientStockError('Cart is empty');
  }

  for (const [productId, { quantity, productName }] of totals) {
    const locked = await lockStoreProduct(tx, storeId, productId);
    if (!locked || !locked.isAvailable) {
      throw new InsufficientStockError(
        `Product "${productName ?? productId}" is not available at this branch`,
        productId,
        0,
      );
    }

    const reserved = await sumActiveReservedQty(tx, storeId, productId);
    const available = await sellableAgainstBatches(tx, storeId, productId, locked, reserved, channel);
    if (available < quantity) {
      throw new InsufficientStockError(
        `Insufficient stock for "${productName ?? 'Product'}". Only ${available} available.`,
        productId,
        available,
      );
    }
  }
}

async function sumActiveReservedQty(
  db: DbClient,
  storeId: string,
  productId: string,
  excludeReservationUuid?: string,
): Promise<number> {
  if (excludeReservationUuid) {
    const rows = await db.$queryRaw<Array<{ total: bigint | number | null }>>`
      SELECT COALESCE(SUM(quantity), 0) AS total
      FROM store_product_reservations
      WHERE "storeId" = ${storeId}
        AND "productId" = ${productId}
        AND status = 'ACTIVE'
        AND "expiresAt" > NOW()
        AND "reservationUuid" <> ${excludeReservationUuid}
    `;
    return Number(rows[0]?.total ?? 0);
  }

  const rows = await db.$queryRaw<Array<{ total: bigint | number | null }>>`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM store_product_reservations
    WHERE "storeId" = ${storeId}
      AND "productId" = ${productId}
      AND status = 'ACTIVE'
      AND "expiresAt" > NOW()
  `;
  return Number(rows[0]?.total ?? 0);
}

function activeReservationWhere(
  storeId: string,
  productId: string | { in: string[] },
  excludeReservationUuid?: string,
) {
  return {
    storeId,
    productId,
    status: 'ACTIVE' as const,
    expiresAt: { gt: new Date() },
    ...(excludeReservationUuid ? { reservationUuid: { not: excludeReservationUuid } } : {}),
  };
}

export async function getActiveReservedQuantity(
  storeId: string,
  productId: string,
  excludeReservationUuid?: string,
): Promise<number> {
  return sumActiveReservedQty(prisma, storeId, productId, excludeReservationUuid);
}

export async function getActiveReservedQuantitiesBatch(
  storeId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const productId of productIds) totals.set(productId, 0);
  if (productIds.length === 0) return totals;

  const rows = await prisma.$queryRaw<Array<{ productId: string; total: bigint | number | null }>>`
    SELECT "productId", COALESCE(SUM(quantity), 0) AS total
    FROM store_product_reservations
    WHERE "storeId" = ${storeId}
      AND "productId" IN (${Prisma.join(productIds)})
      AND status = 'ACTIVE'
      AND "expiresAt" > NOW()
    GROUP BY "productId"
  `;

  for (const row of rows) {
    totals.set(row.productId, Number(row.total ?? 0));
  }
  return totals;
}

export async function getActiveReservedQuantityBatch(
  storeId: string,
  productIds: string[],
  excludeReservationUuid?: string,
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(productIds)];
  const reserved = new Map<string, number>();
  if (uniqueIds.length === 0) return reserved;

  const groups = await prisma.storeProductReservation.groupBy({
    by: ['productId'],
    where: activeReservationWhere(storeId, { in: uniqueIds }, excludeReservationUuid),
    _sum: { quantity: true },
  });

  for (const group of groups) {
    reserved.set(group.productId, group._sum.quantity ?? 0);
  }
  return reserved;
}

export async function getPhysicalStock(storeId: string, productId: string): Promise<number | null> {
  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { stock: true, isAvailable: true },
  });
  if (!row || !row.isAvailable) return null;
  return row.stock;
}

export async function getAvailableStock(
  storeId: string,
  productId: string,
  excludeReservationUuid?: string,
): Promise<number> {
  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { stock: true, isAvailable: true, onlineOutOfStockThreshold: true },
  });
  if (!row || !row.isAvailable) return 0;
  const reserved = await getActiveReservedQuantity(storeId, productId, excludeReservationUuid);
  const buffer = row.onlineOutOfStockThreshold ?? 5;
  return Math.max(0, row.stock - reserved - buffer);
}

export async function getAvailableStockBatch(
  storeId: string,
  productIds: string[],
  excludeReservationUuid?: string,
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(productIds)];
  const availability: Record<string, number> = {};
  if (uniqueIds.length === 0) return availability;

  const [rows, reserved] = await Promise.all([
    prisma.storeProduct.findMany({
      where: { storeId, productId: { in: uniqueIds } },
      select: { productId: true, stock: true, isAvailable: true, onlineOutOfStockThreshold: true },
    }),
    getActiveReservedQuantityBatch(storeId, uniqueIds, excludeReservationUuid),
  ]);

  const rowByProduct = new Map(rows.map((row) => [row.productId, row]));
  for (const productId of uniqueIds) {
    const row = rowByProduct.get(productId);
    if (!row || !row.isAvailable) {
      availability[productId] = 0;
      continue;
    }
    const buffer = row.onlineOutOfStockThreshold ?? 5;
    availability[productId] = Math.max(0, row.stock - (reserved.get(productId) ?? 0) - buffer);
  }
  return availability;
}

export async function findReservationsByUuid(reservationUuid: string): Promise<ReservationRow[]> {
  return prisma.storeProductReservation.findMany({
    where: { reservationUuid },
    orderBy: { createdAt: 'asc' },
  }) as Promise<ReservationRow[]>;
}

export async function findActiveReservationsByUuid(reservationUuid: string): Promise<ReservationRow[]> {
  return prisma.storeProductReservation.findMany({
    where: {
      reservationUuid,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'asc' },
  }) as Promise<ReservationRow[]>;
}

export async function createReservationSession(input: {
  storeId: string;
  items: ReservationLineInput[];
  userId?: string | null;
  cartId?: string | null;
  reservationUuid?: string;
  expiresAt: Date;
  replaceExistingUuid?: string;
  channel?: ReservationStockChannel;
}): Promise<{ reservationUuid: string; rows: ReservationRow[]; expiresAt: Date }> {
  const totals = aggregateLines(input.items);
  if (totals.size === 0) {
    throw new InsufficientStockError('Cart is empty');
  }

  const reservationUuid = input.reservationUuid ?? randomUUID();

  return prisma.$transaction(async (tx) => {
    if (input.replaceExistingUuid) {
      await tx.storeProductReservation.deleteMany({
        where: {
          reservationUuid: input.replaceExistingUuid,
          status: 'ACTIVE',
        },
      });
    }

    const channel = input.channel ?? 'WEB';
    for (const [productId, { quantity, productName }] of totals) {
      const locked = await lockStoreProduct(tx, input.storeId, productId);
      if (!locked || !locked.isAvailable) {
        throw new InsufficientStockError(
          `Product "${productName ?? productId}" is not available at this branch`,
          productId,
          0,
        );
      }

      const reserved = await sumActiveReservedQty(tx, input.storeId, productId, reservationUuid);
      const available = sellableFromLocked(locked, reserved, channel);
      if (available < quantity) {
        throw new InsufficientStockError(
          `Insufficient stock for "${productName ?? 'Product'}". Only ${available} available.`,
          productId,
          available,
        );
      }
    }

    const now = new Date();
    const rows: ReservationRow[] = [];
    for (const [productId, { quantity }] of totals) {
      const id = randomUUID();
      await tx.storeProductReservation.create({
        data: {
          id,
          reservationUuid,
          userId: input.userId ?? null,
          cartId: input.cartId ?? null,
          storeId: input.storeId,
          productId,
          quantity,
          status: 'ACTIVE',
          expiresAt: input.expiresAt,
          updatedAt: now,
        },
      });
      rows.push({
        id,
        reservationUuid,
        userId: input.userId ?? null,
        cartId: input.cartId ?? null,
        storeId: input.storeId,
        productId,
        quantity,
        orderId: null,
        status: 'ACTIVE',
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { reservationUuid, rows, expiresAt: input.expiresAt };
  });
}

export async function attachOrderToReservations(
  reservationUuid: string,
  orderId: string,
  storeId: string,
  items: ReservationLineInput[],
): Promise<void> {
  const active = await findActiveReservationsByUuid(reservationUuid);
  if (active.length === 0) {
    throw new InsufficientStockError('Reservation expired or not found');
  }

  const expected = aggregateLines(items);
  const reserved = aggregateLines(
    active.map((row) => ({ productId: row.productId, quantity: row.quantity })),
  );

  if (active[0]?.storeId !== storeId) {
    throw new InsufficientStockError('Reservation store mismatch');
  }

  for (const [productId, { quantity }] of expected) {
    const held = reserved.get(productId)?.quantity ?? 0;
    if (held !== quantity) {
      throw new InsufficientStockError(`Reservation quantities changed for product ${productId}`);
    }
  }

  for (const [productId] of reserved) {
    if (!expected.has(productId)) {
      throw new InsufficientStockError(`Reservation quantities changed for product ${productId}`);
    }
  }

  await prisma.storeProductReservation.updateMany({
    where: {
      reservationUuid,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    data: { orderId },
  });
}

export async function updateReservationStatusByUuid(
  reservationUuid: string,
  fromStatus: ReservationStatus | ReservationStatus[],
  toStatus: ReservationStatus,
  orderId?: string,
): Promise<number> {
  const from = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
  const result = await prisma.storeProductReservation.updateMany({
    where: {
      reservationUuid,
      status: { in: from as any },
      ...(orderId ? { orderId } : {}),
    },
    data: { status: toStatus as any },
  });
  return result.count;
}

export async function completeReservationsForOrder(orderId: string): Promise<number> {
  const result = await prisma.storeProductReservation.deleteMany({
    where: {
      orderId,
      status: 'ACTIVE',
    },
  });
  return result.count;
}

export async function cancelReservationsByUuid(reservationUuid: string): Promise<number> {
  const result = await prisma.storeProductReservation.deleteMany({
    where: {
      reservationUuid,
      status: 'ACTIVE',
    },
  });
  return result.count;
}

export async function cancelReservationsForOrder(orderId: string): Promise<number> {
  const result = await prisma.storeProductReservation.deleteMany({
    where: {
      orderId,
      status: 'ACTIVE',
    },
  });
  return result.count;
}

export async function expireStaleReservations(): Promise<number> {
  const result = await prisma.storeProductReservation.deleteMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

export async function renewReservationSession(
  reservationUuid: string,
  expiresAt: Date,
): Promise<{ reservationUuid: string; expiresAt: Date }> {
  const active = await findActiveReservationsByUuid(reservationUuid);
  if (active.length === 0) {
    throw new InsufficientStockError('Reservation expired or not found');
  }

  await prisma.storeProductReservation.updateMany({
    where: { reservationUuid, status: 'ACTIVE' },
    data: { expiresAt },
  });

  return { reservationUuid, expiresAt };
}
