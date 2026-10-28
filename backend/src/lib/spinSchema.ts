import { addColumnIfMissing, runtimeSchemaPatchesAllowed, tableHasColumn } from './schemaPatch';
import { prisma } from './prisma';

let ensured = false;

/** Runtime patches for spin wheel tables (PostgreSQL-safe). */
export async function ensureSpinWheelSchema(): Promise<void> {
  if (ensured) return;
  if (!runtimeSchemaPatchesAllowed()) {
    ensured = true;
    return;
  }
  await addColumnIfMissing('spin_wheel_offers', 'deletedAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('spin_wheel_offers', 'storeId', 'TEXT NULL');
  ensured = true;
}

export function isUnknownPrismaArg(err: unknown, arg: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(`Unknown argument \`${arg}\``) || msg.includes(`Unknown arg \`${arg}\``);
}

async function deletedSpinOfferIds(): Promise<string[]> {
  await ensureSpinWheelSchema();
  if (!(await tableHasColumn('spin_wheel_offers', 'deletedAt'))) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM spin_wheel_offers WHERE "deletedAt" IS NOT NULL`,
  );
  return rows.map((row) => row.id);
}

export async function notDeletedSpinOfferFilter() {
  const ids = await deletedSpinOfferIds();
  if (ids.length === 0) return {};
  return { id: { notIn: ids } };
}

export async function markSpinOfferDeleted(id: string): Promise<void> {
  await ensureSpinWheelSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE spin_wheel_offers SET "isActive" = false, "deletedAt" = NOW() WHERE id = $1`,
    id,
  );
}

export async function isSpinOfferDeleted(id: string): Promise<boolean> {
  await ensureSpinWheelSchema();
  if (!(await tableHasColumn('spin_wheel_offers', 'deletedAt'))) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM spin_wheel_offers WHERE id = $1 AND "deletedAt" IS NOT NULL`,
    id,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}
