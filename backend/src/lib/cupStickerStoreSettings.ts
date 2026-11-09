import { prisma } from './prisma';
import { addColumnIfMissing, tableHasColumn } from './schemaPatch';

const COLUMN = 'cupStickerPrinterName';
let columnReady = false;

/** Per-branch Windows printer queue name for cup stickers. */
export async function ensureCupStickerStoreSettings(): Promise<void> {
  if (columnReady) return;
  await addColumnIfMissing('stores', COLUMN, 'VARCHAR(256) NULL');
  columnReady = await tableHasColumn('stores', COLUMN);
}

export async function getStoreCupStickerPrinterName(storeId: string): Promise<string> {
  if (!storeId) return '';
  await ensureCupStickerStoreSettings();
  if (!(await tableHasColumn('stores', COLUMN))) return '';
  const rows = await prisma.$queryRawUnsafe<Array<{ cupStickerPrinterName: string | null }>>(
    `SELECT "cupStickerPrinterName" FROM "stores" WHERE "id" = $1 LIMIT 1`,
    storeId,
  );
  return String(rows[0]?.cupStickerPrinterName ?? '').trim();
}

export async function setStoreCupStickerPrinterName(
  storeId: string,
  printerName: string,
): Promise<string> {
  if (!storeId) throw new Error('storeId required');
  await ensureCupStickerStoreSettings();
  const value = printerName.trim();
  await prisma.$executeRawUnsafe(
    `UPDATE "stores" SET "cupStickerPrinterName" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
    value || null,
    storeId,
  );
  return value;
}
