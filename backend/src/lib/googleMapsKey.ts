import { prisma } from './prisma';
import { ensureAppSchema } from './appSchema';
import { tableHasColumn } from './schemaPatch';

const COLUMN = 'googleMapsApiKey';
const TTL_MS = 15_000;

let cached: { value: string; at: number } | null = null;

export function invalidateGoogleMapsApiKeyCache(): void {
  cached = null;
}

async function readStoredKey(): Promise<string> {
  if (!(await tableHasColumn('app_settings', COLUMN))) return '';
  const rows = await prisma.$queryRawUnsafe<Array<{ googleMapsApiKey: string | null }>>(
    `SELECT "googleMapsApiKey" FROM "app_settings" WHERE "id" = 'default' LIMIT 1`,
  );
  return rows[0]?.googleMapsApiKey?.trim() || '';
}

/** Saved settings key, or the server env key when settings are blank. */
export async function getGoogleMapsApiKey(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let stored = '';
  try {
    stored = await readStoredKey();
  } catch {
    stored = '';
  }
  const value = stored || process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
  cached = { value, at: Date.now() };
  return value;
}

export async function setGoogleMapsApiKey(value: string | null): Promise<string> {
  const next = value?.trim() || '';
  await ensureAppSchema();
  if (!(await tableHasColumn('app_settings', COLUMN))) {
    throw new Error('Google Maps API key storage is not ready yet');
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "app_settings" SET "googleMapsApiKey" = $1 WHERE "id" = 'default'`,
    next || null,
  );
  invalidateGoogleMapsApiKeyCache();
  return getGoogleMapsApiKey();
}
