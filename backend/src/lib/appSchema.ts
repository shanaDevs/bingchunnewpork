import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import {
  addColumnIfMissing,
  createIndexIfMissing,
  runtimeSchemaPatchesAllowed,
  tableExists,
  tableHasColumn,
} from './schemaPatch';
import { getDeliveryZonesSqlRef, primeDeliverySqlRefs } from './deliveryPg';
import { ensureCancelReasonSchema } from './cancelReasonConfig';
import { ensureOrderStatusRefundSchema } from './orderStatusRefundConfig';
import {
  DEFAULT_SPIN_DISPLAY,
  hasSpinCriterion,
  parseSpinCriteria,
  parseSpinDisplay,
  type SpinCriterion,
  type SpinDisplaySettings,
} from './spinDisplay';

let appSchemaReady = false;

async function ensureDeliveryZonesTable(): Promise<void> {
  if (await tableExists('delivery_zones')) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "delivery_zones" (
      "id" TEXT NOT NULL,
      "storeId" TEXT,
      "name" TEXT NOT NULL,
      "radiusKm" DOUBLE PRECISION NOT NULL,
      "fee" INTEGER NOT NULL,
      "minOrder" INTEGER NOT NULL DEFAULT 500,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isGlobal" BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "delivery_zones_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
}

export async function ensureAppSchema(): Promise<void> {
  if (appSchemaReady) return;
  // Non-core surfaces must not run DDL on the request path (pool exhaustion / locks).
  if (!runtimeSchemaPatchesAllowed()) {
    await primeDeliverySqlRefs().catch(() => undefined);
    appSchemaReady = true;
    return;
  }

  await ensureDeliveryZonesTable();

  await addColumnIfMissing('orders', 'convenientFee', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(
    'promo_codes',
    'showOnHome',
    'BOOLEAN NOT NULL DEFAULT true',
  );
  await addColumnIfMissing('promo_codes', 'contributionSource', "TEXT DEFAULT 'JASON'");
  await addColumnIfMissing('promotion_usages', 'contributionSource', "TEXT DEFAULT 'JASON'");
  await addColumnIfMissing(
    'products',
    'isDeliveryAvailable',
    'TINYINT(1) NOT NULL DEFAULT 1',
  );

  await addColumnIfMissing(
    'app_settings',
    'pickupAllowAddItemsPaidOnline',
    'TINYINT(1) NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing(
    'app_settings',
    'pickupAllowEditCashUnpaid',
    'TINYINT(1) NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing(
    'app_settings',
    'maxCupsPerRider',
    'INT NOT NULL DEFAULT 20',
  );
  await addColumnIfMissing(
    'app_settings',
    'deliveryMilestone1Orders',
    'INT NOT NULL DEFAULT 50',
  );
  await addColumnIfMissing(
    'app_settings',
    'deliveryMilestone2Orders',
    'INT NOT NULL DEFAULT 150',
  );
  await addColumnIfMissing(
    'app_settings',
    'deliveryMilestone3Orders',
    'INT NOT NULL DEFAULT 300',
  );

  await addColumnIfMissing('delivery_zones', 'isGlobal', 'BOOLEAN NOT NULL DEFAULT false');

  await addColumnIfMissing(
    'app_settings',
    'pickupConvenientFeeRate',
    'DOUBLE NOT NULL DEFAULT 0.06',
  );
  await addColumnIfMissing(
    'app_settings',
    'gatewayFeeRate',
    'DOUBLE NOT NULL DEFAULT 0.019',
  );
  await addColumnIfMissing(
    'app_settings',
    'deliveryPlatformFeeRate',
    'DOUBLE NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'app_settings',
    'requireAppDownload',
    'TINYINT(1) NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing(
    'app_settings',
    'androidStoreUrl',
    'VARCHAR(512) NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'iosStoreUrl',
    'VARCHAR(512) NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'androidAppIconUrl',
    'VARCHAR(512) NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'iosAppIconUrl',
    'VARCHAR(512) NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'googleMapsApiKey',
    'VARCHAR(256) NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'weeklyResetDay',
    'INT NULL',
  );
  await addColumnIfMissing(
    'app_settings',
    'spinDurationSeconds',
    'INT NOT NULL DEFAULT 8',
  );
  await addColumnIfMissing(
    'app_settings',
    'spinsPerWindow',
    'INT NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing(
    'app_settings',
    'spinWindowHours',
    'INT NOT NULL DEFAULT 24',
  );
  await addColumnIfMissing(
    'app_settings',
    'spinTrackByIp',
    'TINYINT(1) NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing('app_settings', 'spinEnabled', 'BOOLEAN NOT NULL DEFAULT true');
  await addColumnIfMissing('app_settings', 'spinFirstOrderOnly', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('app_settings', 'spinRequireLogin', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('app_settings', 'spinDaysOfWeekJson', 'JSON NULL');
  await addColumnIfMissing('app_settings', 'spinTimeStart', 'VARCHAR(5) NULL');
  await addColumnIfMissing('app_settings', 'spinTimeEnd', 'VARCHAR(5) NULL');
  await addColumnIfMissing('app_settings', 'spinStartsAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('app_settings', 'spinExpiresAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('app_settings', 'spinMaxPerDay', 'INT NULL');
  await addColumnIfMissing('app_settings', 'spinMaxPerCustomer', 'INT NULL');
  await addColumnIfMissing('app_settings', 'spinDisplayJson', 'JSON NULL');
  await addColumnIfMissing('app_settings', 'spinCriteriaJson', 'JSON NULL');
  await addColumnIfMissing('app_settings', 'cancelWindowMinutes', 'INT NOT NULL DEFAULT 10');
  await addColumnIfMissing(
    'app_settings',
    'branchCompletionRadiusM',
    'INT NOT NULL DEFAULT 100',
  );
  await addColumnIfMissing(
    'spin_results',
    'clientIp',
    'VARCHAR(64) NULL',
  );
  await createIndexIfMissing('spin_results', 'spin_results_clientIp_createdAt_idx', 'clientIp, createdAt');

  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "app_settings" ("id", "convenientFeeRate", "pickupConvenientFeeRate")
      VALUES ('default', 0.075, 0.06)
      ON CONFLICT ("id") DO NOTHING
    `);
    await prisma.$executeRawUnsafe(
      `UPDATE "app_settings" SET "convenientFeeRate" = 0.065 WHERE "id" = 'default' AND "convenientFeeRate" = 0.035`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "app_settings" SET "convenientFeeRate" = 0.075 WHERE "id" = 'default' AND "convenientFeeRate" = 0.065`,
    );
  } catch {
    /* table exists */
  }

  for (const col of ['sugarLevel', 'iceLevel']) {
    if (await tableHasColumn('cart_items', col)) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "cart_items" DROP COLUMN "${col}"`);
      } catch {
        /* ignore */
      }
    }
    if (await tableHasColumn('order_items', col)) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "order_items" DROP COLUMN "${col}"`);
      } catch {
        /* ignore */
      }
    }
  }

  await primeDeliverySqlRefs();
  const zonesTable = getDeliveryZonesSqlRef();

  // Raw SQL so startup succeeds even if Prisma client was not regenerated after schema changes.
  const globalZoneRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(
    `SELECT COUNT(*) AS cnt FROM ${zonesTable} WHERE "isGlobal" = true`,
  );
  const globalZoneCount = Number(globalZoneRows[0]?.cnt ?? 0);
  if (globalZoneCount === 0) {
    const defaults = [
      { name: 'Zone 1 (0–5 km)', radiusKm: 5, fee: 150, minOrder: 500 },
      { name: 'Zone 2 (5–10 km)', radiusKm: 10, fee: 250, minOrder: 500 },
      { name: 'Out of range', radiusKm: 999, fee: 400, minOrder: 800 },
    ];
    for (const zone of defaults) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO ${zonesTable} ("id", "name", "radiusKm", "fee", "minOrder", "isGlobal", "isActive")
         VALUES ($1, $2, $3, $4, $5, true, true)`,
        randomUUID(),
        zone.name,
        zone.radiusKm,
        zone.fee,
        zone.minOrder,
      );
    }
  }

  await ensureCancelReasonSchema();
  await ensureOrderStatusRefundSchema();

  appSchemaReady = true;
}

export async function getConvenientFeeRate(): Promise<number> {
  const rates = await getConvenienceFeeRates();
  return rates.delivery;
}

export type ConvenienceFeeRates = {
  pickup: number;
  delivery: number;
};

let convenienceFeeRatesCache: ConvenienceFeeRates | null = null;

export function invalidateConvenienceFeeRatesCache(): void {
  convenienceFeeRatesCache = null;
}

export async function getConvenienceFeeRates(): Promise<ConvenienceFeeRates> {
  if (convenienceFeeRatesCache) return convenienceFeeRatesCache;
  await ensureAppSchema();
  const row = await prisma.appSetting.findUnique({ where: { id: 'default' } });
  convenienceFeeRatesCache = {
    pickup: row?.pickupConvenientFeeRate ?? 0.06,
    delivery: row?.convenientFeeRate ?? 0.075,
  };
  return convenienceFeeRatesCache;
}

let gatewayFeeRateCache: number | null = null;

export function invalidateGatewayFeeRateCache(): void {
  gatewayFeeRateCache = null;
}

export async function getGatewayFeeRate(): Promise<number> {
  if (gatewayFeeRateCache !== null) return gatewayFeeRateCache;
  await ensureAppSchema();
  const row = await prisma.appSetting.findUnique({ where: { id: 'default' } });
  gatewayFeeRateCache = row?.gatewayFeeRate ?? 0.019;
  return gatewayFeeRateCache;
}

let deliveryPlatformFeeRateCache: number | null = null;

export function invalidateDeliveryPlatformFeeRateCache(): void {
  deliveryPlatformFeeRateCache = null;
}

function clampDeliveryPlatformFeeRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

async function readDeliveryPlatformFeeRateFromDb(): Promise<number> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ deliveryPlatformFeeRate: number | null }>>(
    'SELECT "deliveryPlatformFeeRate" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  return clampDeliveryPlatformFeeRate(Number(rows[0]?.deliveryPlatformFeeRate ?? 0));
}

export async function setDeliveryPlatformFeeRate(value: number): Promise<number> {
  const clamped = clampDeliveryPlatformFeeRate(value);
  await ensureAppSchema();
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "deliveryPlatformFeeRate" = $1 WHERE "id" = $2',
    clamped,
    'default',
  );
  deliveryPlatformFeeRateCache = clamped;
  return clamped;
}

export async function getDeliveryPlatformFeeRate(): Promise<number> {
  if (deliveryPlatformFeeRateCache !== null) return deliveryPlatformFeeRateCache;
  deliveryPlatformFeeRateCache = await readDeliveryPlatformFeeRateFromDb();
  return deliveryPlatformFeeRateCache;
}

export function computeConvenientFee(subtotal: number, rate: number): number {
  return Math.round(subtotal * rate);
}

export type PickupOrderEditSettings = {
  allowAddItemsPaidOnline: boolean;
  allowEditCashUnpaid: boolean;
};

const DEFAULT_PICKUP_ORDER_EDIT_SETTINGS: PickupOrderEditSettings = {
  allowAddItemsPaidOnline: true,
  allowEditCashUnpaid: true,
};

let pickupOrderEditSettingsCache: PickupOrderEditSettings | null = null;

export function invalidatePickupOrderEditSettingsCache(): void {
  pickupOrderEditSettingsCache = null;
  invalidateMaxCupsPerRiderCache();
  invalidateBranchCompletionRadiusMCache();
  invalidateWeeklyResetDayCache();
  invalidateConvenienceFeeRatesCache();
  invalidateGatewayFeeRateCache();
}

export async function getPickupOrderEditSettings(): Promise<PickupOrderEditSettings> {
  if (pickupOrderEditSettingsCache) return pickupOrderEditSettingsCache;
  await ensureAppSchema();
  const row = await prisma.appSetting.findUnique({ where: { id: 'default' } });
  pickupOrderEditSettingsCache = {
    allowAddItemsPaidOnline: row?.pickupAllowAddItemsPaidOnline ?? true,
    allowEditCashUnpaid: row?.pickupAllowEditCashUnpaid ?? true,
  };
  return pickupOrderEditSettingsCache;
}

export { DEFAULT_PICKUP_ORDER_EDIT_SETTINGS };

export const DEFAULT_MAX_CUPS_PER_RIDER = 20;

let maxCupsPerRiderCache: number | null = null;

export function invalidateMaxCupsPerRiderCache(): void {
  maxCupsPerRiderCache = null;
}

function clampMaxCupsPerRider(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

async function readMaxCupsPerRiderFromDb(): Promise<number> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ maxCupsPerRider: number | bigint | null }>>(
    'SELECT "maxCupsPerRider" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const raw = rows[0]?.maxCupsPerRider;
  const value = raw == null ? DEFAULT_MAX_CUPS_PER_RIDER : Number(raw);
  return clampMaxCupsPerRider(value);
}

export async function setMaxCupsPerRider(value: number): Promise<number> {
  const clamped = clampMaxCupsPerRider(value);
  await ensureAppSchema();
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "maxCupsPerRider" = $1 WHERE "id" = $2',
    clamped,
    'default',
  );
  maxCupsPerRiderCache = clamped;
  return clamped;
}

export async function getMaxCupsPerRider(): Promise<number> {
  if (maxCupsPerRiderCache != null) return maxCupsPerRiderCache;
  maxCupsPerRiderCache = await readMaxCupsPerRiderFromDb();
  return maxCupsPerRiderCache;
}

export const DEFAULT_BRANCH_COMPLETION_RADIUS_M = 100;

let branchCompletionRadiusMCache: number | null = null;

export function invalidateBranchCompletionRadiusMCache(): void {
  branchCompletionRadiusMCache = null;
}

function clampBranchCompletionRadiusM(value: number): number {
  return Math.max(20, Math.min(2000, Math.round(value)));
}

async function readBranchCompletionRadiusMFromDb(): Promise<number> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ branchCompletionRadiusM: number | bigint | null }>>(
    'SELECT "branchCompletionRadiusM" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const raw = rows[0]?.branchCompletionRadiusM;
  const value = raw == null ? DEFAULT_BRANCH_COMPLETION_RADIUS_M : Number(raw);
  return clampBranchCompletionRadiusM(value);
}

export async function setBranchCompletionRadiusM(value: number): Promise<number> {
  const clamped = clampBranchCompletionRadiusM(value);
  await ensureAppSchema();
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "branchCompletionRadiusM" = $1 WHERE "id" = $2',
    clamped,
    'default',
  );
  branchCompletionRadiusMCache = clamped;
  return clamped;
}

export async function getBranchCompletionRadiusM(): Promise<number> {
  if (branchCompletionRadiusMCache != null) return branchCompletionRadiusMCache;
  branchCompletionRadiusMCache = await readBranchCompletionRadiusMFromDb();
  return branchCompletionRadiusMCache;
}

export const DEFAULT_CANCEL_WINDOW_MINUTES = 10;

let cancelWindowMinutesCache: number | null = null;

export function invalidateCancelWindowMinutesCache(): void {
  cancelWindowMinutesCache = null;
}

function clampCancelWindowMinutes(value: number): number {
  return Math.max(1, Math.min(120, Math.round(value)));
}

async function readCancelWindowMinutesFromDb(): Promise<number> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ cancelWindowMinutes: number | bigint | null }>>(
    'SELECT "cancelWindowMinutes" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const raw = rows[0]?.cancelWindowMinutes;
  const value = raw == null ? DEFAULT_CANCEL_WINDOW_MINUTES : Number(raw);
  return clampCancelWindowMinutes(value);
}

export async function setCancelWindowMinutes(value: number): Promise<number> {
  const clamped = clampCancelWindowMinutes(value);
  await ensureAppSchema();
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "cancelWindowMinutes" = $1 WHERE "id" = $2',
    clamped,
    'default',
  );
  cancelWindowMinutesCache = clamped;
  return clamped;
}

export async function getCancelWindowMinutes(): Promise<number> {
  if (cancelWindowMinutesCache != null) return cancelWindowMinutesCache;
  cancelWindowMinutesCache = await readCancelWindowMinutesFromDb();
  return cancelWindowMinutesCache;
}

let weeklyResetDayCache: number | null | undefined;

export function invalidateWeeklyResetDayCache(): void {
  weeklyResetDayCache = undefined;
}

function clampWeeklyResetDay(value: number): number {
  return Math.max(0, Math.min(6, Math.round(value)));
}

async function readWeeklyResetDayFromDb(): Promise<number | null> {
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ weeklyResetDay: number | bigint | null }>>(
    'SELECT "weeklyResetDay" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const raw = rows[0]?.weeklyResetDay;
  if (raw == null) return null;
  return clampWeeklyResetDay(Number(raw));
}

export async function setWeeklyResetDay(value: number | null): Promise<number | null> {
  await ensureAppSchema();
  const next = value == null ? null : clampWeeklyResetDay(value);
  await prisma.$executeRawUnsafe(
    'UPDATE "app_settings" SET "weeklyResetDay" = $1 WHERE "id" = $2',
    next,
    'default',
  );
  weeklyResetDayCache = next;
  return next;
}

export async function getWeeklyResetDay(): Promise<number | null> {
  if (weeklyResetDayCache !== undefined) return weeklyResetDayCache;
  weeklyResetDayCache = await readWeeklyResetDayFromDb();
  return weeklyResetDayCache;
}

export type AppDownloadSettings = {
  requireAppDownload: boolean;
  androidStoreUrl: string;
  iosStoreUrl: string;
  androidAppIconUrl: string | null;
  iosAppIconUrl: string | null;
};

export const DEFAULT_ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.bingchun.customer';
export const DEFAULT_IOS_STORE_URL =
  'https://apps.apple.com/app/bing-chun/id0000000000';

let appDownloadSettingsCache: AppDownloadSettings | null = null;

export function invalidateAppDownloadSettingsCache(): void {
  appDownloadSettingsCache = null;
}

function normalizeStoreUrl(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

export async function getAppDownloadSettings(): Promise<AppDownloadSettings> {
  if (appDownloadSettingsCache) return appDownloadSettingsCache;
  await ensureAppSchema();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      requireAppDownload: number | boolean | null;
      androidStoreUrl: string | null;
      iosStoreUrl: string | null;
      androidAppIconUrl: string | null;
      iosAppIconUrl: string | null;
    }>
  >(
    'SELECT "requireAppDownload", "androidStoreUrl", "iosStoreUrl", "androidAppIconUrl", "iosAppIconUrl" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
    'default',
  );
  const row = rows[0];
  appDownloadSettingsCache = {
    requireAppDownload: row?.requireAppDownload == null ? true : Boolean(row.requireAppDownload),
    androidStoreUrl: normalizeStoreUrl(row?.androidStoreUrl, DEFAULT_ANDROID_STORE_URL),
    iosStoreUrl: normalizeStoreUrl(row?.iosStoreUrl, DEFAULT_IOS_STORE_URL),
    androidAppIconUrl: row?.androidAppIconUrl?.trim() || null,
    iosAppIconUrl: row?.iosAppIconUrl?.trim() || null,
  };
  return appDownloadSettingsCache;
}

export async function setAppDownloadSettings(input: {
  requireAppDownload?: boolean;
  androidStoreUrl?: string | null;
  iosStoreUrl?: string | null;
  androidAppIconUrl?: string | null;
  iosAppIconUrl?: string | null;
}): Promise<AppDownloadSettings> {
  await ensureAppSchema();
  const current = await getAppDownloadSettings();
  const next: AppDownloadSettings = {
    requireAppDownload: input.requireAppDownload ?? current.requireAppDownload,
    androidStoreUrl: input.androidStoreUrl !== undefined
      ? normalizeStoreUrl(input.androidStoreUrl, DEFAULT_ANDROID_STORE_URL)
      : current.androidStoreUrl,
    iosStoreUrl: input.iosStoreUrl !== undefined
      ? normalizeStoreUrl(input.iosStoreUrl, DEFAULT_IOS_STORE_URL)
      : current.iosStoreUrl,
    androidAppIconUrl: input.androidAppIconUrl !== undefined
      ? (input.androidAppIconUrl?.trim() || null)
      : current.androidAppIconUrl,
    iosAppIconUrl: input.iosAppIconUrl !== undefined
      ? (input.iosAppIconUrl?.trim() || null)
      : current.iosAppIconUrl,
  };
  await prisma.$executeRawUnsafe(
    `UPDATE "app_settings" SET
      "requireAppDownload" = $1,
      "androidStoreUrl" = $2,
      "iosStoreUrl" = $3,
      "androidAppIconUrl" = $4,
      "iosAppIconUrl" = $5
    WHERE "id" = $6`,
    next.requireAppDownload,
    next.androidStoreUrl,
    next.iosStoreUrl,
    next.androidAppIconUrl,
    next.iosAppIconUrl,
    'default',
  );
  appDownloadSettingsCache = next;
  return next;
}

export type SpinSettings = {
  spinDurationSeconds: number;
  spinsPerWindow: number;
  spinWindowHours: number;
  spinTrackByIp: boolean;
  spinEnabled: boolean;
  firstOrderOnly: boolean;
  requireLogin: boolean;
  daysOfWeek: string[];
  timeStart: string | null;
  timeEnd: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  maxPerDay: number | null;
  maxPerCustomer: number | null;
  display: SpinDisplaySettings;
  criteria: SpinCriterion[];
};

export const DEFAULT_SPIN_SETTINGS: SpinSettings = {
  spinDurationSeconds: 8,
  spinsPerWindow: 1,
  spinWindowHours: 24,
  spinTrackByIp: true,
  spinEnabled: true,
  firstOrderOnly: false,
  requireLogin: false,
  daysOfWeek: [],
  timeStart: null,
  timeEnd: null,
  startsAt: null,
  expiresAt: null,
  maxPerDay: null,
  maxPerCustomer: null,
  display: { ...DEFAULT_SPIN_DISPLAY },
  criteria: [],
};

let spinSettingsCache: SpinSettings | null = null;

export function invalidateSpinSettingsCache(): void {
  spinSettingsCache = null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseDaysOfWeek(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is string => typeof d === 'string' && d.length > 0);
}

function parseSpinSettingsRow(row: {
  spinDurationSeconds: number | null;
  spinsPerWindow: number | null;
  spinWindowHours: number | null;
  spinTrackByIp: number | boolean | null;
  spinEnabled?: number | boolean | null;
  spinFirstOrderOnly?: number | boolean | null;
  spinRequireLogin?: number | boolean | null;
  spinDaysOfWeekJson?: unknown;
  spinTimeStart?: string | null;
  spinTimeEnd?: string | null;
  spinStartsAt?: Date | string | null;
  spinExpiresAt?: Date | string | null;
  spinMaxPerDay?: number | null;
  spinMaxPerCustomer?: number | null;
  spinDisplayJson?: unknown;
  spinCriteriaJson?: unknown;
} | undefined): SpinSettings {
  const criteria = parseSpinCriteria(row?.spinCriteriaJson);
  const firstOrderOnly = criteria.length
    ? hasSpinCriterion(criteria, 'FIRST_ORDER_ONLY')
    : Boolean(row?.spinFirstOrderOnly);
  const requireLogin = criteria.length
    ? hasSpinCriterion(criteria, 'REQUIRE_LOGIN')
    : Boolean(row?.spinRequireLogin);
  return {
    spinDurationSeconds: clampInt(row?.spinDurationSeconds, 3, 20, DEFAULT_SPIN_SETTINGS.spinDurationSeconds),
    spinsPerWindow: clampInt(row?.spinsPerWindow, 1, 10, DEFAULT_SPIN_SETTINGS.spinsPerWindow),
    spinWindowHours: clampInt(row?.spinWindowHours, 1, 720, DEFAULT_SPIN_SETTINGS.spinWindowHours),
    spinTrackByIp: row?.spinTrackByIp == null ? true : Boolean(row.spinTrackByIp),
    spinEnabled: row?.spinEnabled == null ? true : Boolean(row.spinEnabled),
    firstOrderOnly,
    requireLogin,
    daysOfWeek: parseDaysOfWeek(row?.spinDaysOfWeekJson),
    timeStart: row?.spinTimeStart ?? null,
    timeEnd: row?.spinTimeEnd ?? null,
    startsAt: row?.spinStartsAt ? new Date(row.spinStartsAt).toISOString() : null,
    expiresAt: row?.spinExpiresAt ? new Date(row.spinExpiresAt).toISOString() : null,
    maxPerDay: row?.spinMaxPerDay != null ? clampInt(row.spinMaxPerDay, 1, 1000, 1) : null,
    maxPerCustomer: row?.spinMaxPerCustomer != null ? clampInt(row.spinMaxPerCustomer, 1, 10000, 1) : null,
    display: parseSpinDisplay(row?.spinDisplayJson),
    criteria,
  };
}

export async function getSpinSettings(): Promise<SpinSettings> {
  if (spinSettingsCache) return spinSettingsCache;
  await ensureAppSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        spinDurationSeconds: number | null;
        spinsPerWindow: number | null;
        spinWindowHours: number | null;
        spinTrackByIp: number | boolean | null;
        spinEnabled: number | boolean | null;
        spinFirstOrderOnly: number | boolean | null;
        spinRequireLogin: number | boolean | null;
        spinDaysOfWeekJson: unknown;
        spinTimeStart: string | null;
        spinTimeEnd: string | null;
        spinStartsAt: Date | null;
        spinExpiresAt: Date | null;
        spinMaxPerDay: number | null;
        spinMaxPerCustomer: number | null;
        spinDisplayJson: unknown;
        spinCriteriaJson: unknown;
      }>
    >(
      `SELECT "spinDurationSeconds", "spinsPerWindow", "spinWindowHours", "spinTrackByIp",
              "spinEnabled", "spinFirstOrderOnly", "spinRequireLogin", "spinDaysOfWeekJson",
              "spinTimeStart", "spinTimeEnd", "spinStartsAt", "spinExpiresAt",
              "spinMaxPerDay", "spinMaxPerCustomer", "spinDisplayJson", "spinCriteriaJson"
       FROM "app_settings" WHERE "id" = $1 LIMIT 1`,
      'default',
    );
    spinSettingsCache = parseSpinSettingsRow(rows[0]);
  } catch {
    spinSettingsCache = { ...DEFAULT_SPIN_SETTINGS };
  }
  return spinSettingsCache;
}

export async function setSpinSettings(input: Partial<SpinSettings>): Promise<SpinSettings> {
  await ensureAppSchema();
  const current = await getSpinSettings();
  const next: SpinSettings = {
    spinDurationSeconds: input.spinDurationSeconds != null
      ? clampInt(input.spinDurationSeconds, 3, 20, current.spinDurationSeconds)
      : current.spinDurationSeconds,
    spinsPerWindow: input.spinsPerWindow != null
      ? clampInt(input.spinsPerWindow, 1, 10, current.spinsPerWindow)
      : current.spinsPerWindow,
    spinWindowHours: input.spinWindowHours != null
      ? clampInt(input.spinWindowHours, 1, 720, current.spinWindowHours)
      : current.spinWindowHours,
    spinTrackByIp: input.spinTrackByIp ?? current.spinTrackByIp,
    spinEnabled: input.spinEnabled ?? current.spinEnabled,
    firstOrderOnly: input.firstOrderOnly ?? current.firstOrderOnly,
    requireLogin: input.requireLogin ?? current.requireLogin,
    daysOfWeek: input.daysOfWeek ?? current.daysOfWeek,
    timeStart: input.timeStart !== undefined ? input.timeStart : current.timeStart,
    timeEnd: input.timeEnd !== undefined ? input.timeEnd : current.timeEnd,
    startsAt: input.startsAt !== undefined ? input.startsAt : current.startsAt,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : current.expiresAt,
    maxPerDay: input.maxPerDay !== undefined ? input.maxPerDay : current.maxPerDay,
    maxPerCustomer: input.maxPerCustomer !== undefined ? input.maxPerCustomer : current.maxPerCustomer,
    display: input.display ? parseSpinDisplay(input.display) : current.display,
    criteria: input.criteria ? parseSpinCriteria(input.criteria) : current.criteria,
  };
  if (input.criteria) {
    next.firstOrderOnly = hasSpinCriterion(next.criteria, 'FIRST_ORDER_ONLY');
    next.requireLogin = hasSpinCriterion(next.criteria, 'REQUIRE_LOGIN');
  }
  const daysJson = next.daysOfWeek.length > 0 ? JSON.stringify(next.daysOfWeek) : null;
  await prisma.$executeRawUnsafe(
    `UPDATE "app_settings" SET
      "spinDurationSeconds" = $1,
      "spinsPerWindow" = $2,
      "spinWindowHours" = $3,
      "spinTrackByIp" = $4,
      "spinEnabled" = $5,
      "spinFirstOrderOnly" = $6,
      "spinRequireLogin" = $7,
      "spinDaysOfWeekJson" = $8::jsonb,
      "spinTimeStart" = $9,
      "spinTimeEnd" = $10,
      "spinStartsAt" = $11,
      "spinExpiresAt" = $12,
      "spinMaxPerDay" = $13,
      "spinMaxPerCustomer" = $14,
      "spinDisplayJson" = $15::jsonb,
      "spinCriteriaJson" = $16::jsonb
    WHERE "id" = $17`,
    next.spinDurationSeconds,
    next.spinsPerWindow,
    next.spinWindowHours,
    next.spinTrackByIp,
    next.spinEnabled,
    next.firstOrderOnly,
    next.requireLogin,
    daysJson,
    next.timeStart,
    next.timeEnd,
    next.startsAt ? new Date(next.startsAt) : null,
    next.expiresAt ? new Date(next.expiresAt) : null,
    next.maxPerDay,
    next.maxPerCustomer,
    JSON.stringify(next.display),
    JSON.stringify(next.criteria),
    'default',
  );
  spinSettingsCache = next;
  return next;
}
