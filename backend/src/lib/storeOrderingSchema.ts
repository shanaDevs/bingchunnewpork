import { prisma } from './prisma';
import { addColumnIfMissing } from './schemaPatch';

export type StoreOrderingHoursRow = {
  openTime: string;
  closeTime: string;
  onlineOrderStartTime: string | null;
  onlineOrderStopTime: string | null;
  pickupCutoffMinutes: number;
};

type StoreOrderingHoursPatch = Partial<{
  openTime: string;
  closeTime: string;
  onlineOrderStartTime: string | null;
  onlineOrderStopTime: string | null;
  pickupCutoffMinutes: number;
}>;

export async function ensureStoreOrderingHoursColumns(): Promise<void> {
  await addColumnIfMissing('stores', 'onlineOrderStartTime', 'VARCHAR(191) NULL');
  await addColumnIfMissing('stores', 'onlineOrderStopTime', 'VARCHAR(191) NULL');
  await addColumnIfMissing('stores', 'pickupCutoffMinutes', 'INT NOT NULL DEFAULT 50');
  await addColumnIfMissing('stores', 'branchClosedAt', 'TIMESTAMP(3) NULL');
}

function normalizePickupCutoffMinutes(value: unknown): number {
  return Number(value ?? 50);
}

async function withOrderingHoursSchema<T>(run: () => Promise<T>): Promise<T> {
  await ensureStoreOrderingHoursColumns();
  return run();
}

function rowToStoreOrderingHours(row: StoreOrderingHoursRow): StoreOrderingHoursRow {
  return {
    openTime: row.openTime,
    closeTime: row.closeTime,
    onlineOrderStartTime: row.onlineOrderStartTime,
    onlineOrderStopTime: row.onlineOrderStopTime,
    pickupCutoffMinutes: normalizePickupCutoffMinutes(row.pickupCutoffMinutes),
  };
}

/** branchClosedAt may exist in DB before Prisma client is regenerated — read via SQL. */
export async function fetchBranchClosedAtByStoreIds(
  storeIds: string[],
): Promise<Map<string, Date | null>> {
  const map = new Map<string, Date | null>();
  if (!storeIds.length) return map;

  return withOrderingHoursSchema(async () => {
    const placeholders = storeIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; branchClosedAt: Date | null }>>(
      `SELECT "id", "branchClosedAt" FROM "stores" WHERE "id" IN (${placeholders})`,
      ...storeIds,
    );
    for (const row of rows) {
      map.set(row.id, row.branchClosedAt);
    }
    return map;
  });
}

export async function fetchActiveStoreBranchCloseState(
  storeId: string,
): Promise<{ name: string; branchClosedAt: Date | null } | null> {
  return withOrderingHoursSchema(async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ name: string; branchClosedAt: Date | null }>
    >(
      `SELECT "name", "branchClosedAt" FROM "stores" WHERE "id" = $1 AND "isActive" = true LIMIT 1`,
      storeId,
    );
    return rows[0] ?? null;
  });
}

export async function fetchStoreBranchOperatingRow(
  storeId: string,
): Promise<{ id: string; isActive: boolean; branchClosedAt: Date | null } | null> {
  return withOrderingHoursSchema(async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; isActive: boolean; branchClosedAt: Date | null }>
    >(
      `SELECT "id", "isActive", "branchClosedAt" FROM "stores" WHERE "id" = $1 LIMIT 1`,
      storeId,
    );
    return rows[0] ?? null;
  });
}

export async function updateStoreBranchClosedAt(
  storeId: string,
  closedAt: Date | null,
): Promise<Date | null> {
  return withOrderingHoursSchema(async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "stores" SET "branchClosedAt" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`,
      closedAt,
      storeId,
    );
    return closedAt;
  });
}

export async function fetchStoreOrderingHours(
  storeId: string,
): Promise<(StoreOrderingHoursRow & { id: string; name: string }) | null> {
  return withOrderingHoursSchema(async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<StoreOrderingHoursRow & { id: string; name: string }>
    >(
      `SELECT "id", "name", "openTime", "closeTime", "onlineOrderStartTime", "onlineOrderStopTime", "pickupCutoffMinutes"
     FROM "stores" WHERE "id" = $1 LIMIT 1`,
      storeId,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      ...rowToStoreOrderingHours(row),
    };
  });
}

export async function fetchOrderingHoursMap(
  storeIds: string[],
): Promise<Map<string, StoreOrderingHoursRow>> {
  const map = new Map<string, StoreOrderingHoursRow>();
  if (!storeIds.length) return map;

  return withOrderingHoursSchema(async () => {
    const placeholders = storeIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<StoreOrderingHoursRow & { id: string }>>(
      `SELECT "id", "openTime", "closeTime", "onlineOrderStartTime", "onlineOrderStopTime", "pickupCutoffMinutes"
     FROM "stores" WHERE "id" IN (${placeholders})`,
      ...storeIds,
    );

    for (const row of rows) {
      map.set(row.id, rowToStoreOrderingHours(row));
    }
    return map;
  });
}

export async function updateStoreOrderingHours(
  storeId: string,
  patch: StoreOrderingHoursPatch,
): Promise<StoreOrderingHoursRow & { id: string; name: string }> {
  return withOrderingHoursSchema(async () => {
    const parts: string[] = [];
    const params: (string | number | null)[] = [];

    if (patch.openTime !== undefined) {
      parts.push('"openTime" = $' + (params.length + 1));
      params.push(patch.openTime);
    }
    if (patch.closeTime !== undefined) {
      parts.push(`"closeTime" = $${params.length + 1}`);
      params.push(patch.closeTime);
    }
    if (patch.onlineOrderStartTime !== undefined) {
      parts.push(`"onlineOrderStartTime" = $${params.length + 1}`);
      params.push(patch.onlineOrderStartTime);
    }
    if (patch.onlineOrderStopTime !== undefined) {
      parts.push(`"onlineOrderStopTime" = $${params.length + 1}`);
      params.push(patch.onlineOrderStopTime);
    }
    if (patch.pickupCutoffMinutes !== undefined) {
      parts.push(`"pickupCutoffMinutes" = $${params.length + 1}`);
      params.push(patch.pickupCutoffMinutes);
    }

    if (parts.length) {
      params.push(storeId);
      await prisma.$executeRawUnsafe(
        `UPDATE "stores" SET ${parts.join(', ')} WHERE "id" = $${params.length}`,
        ...params,
      );
    }

    const row = await fetchStoreOrderingHours(storeId);
    if (!row) throw new Error('Store not found');
    return row;
  });
}

export function mergeStoreOrderingHours<T extends { id: string; openTime: string; closeTime: string }>(
  store: T,
  hours?: StoreOrderingHoursRow | null,
): T & StoreOrderingHoursRow {
  if (!hours) return { ...store, onlineOrderStartTime: null, onlineOrderStopTime: null, pickupCutoffMinutes: 50 };
  return { ...store, ...hours };
}
