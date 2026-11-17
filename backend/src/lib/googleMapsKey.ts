import { prisma } from './prisma';
import { ensureAppSchema } from './appSchema';
import { tableHasColumn } from './schemaPatch';

const COLUMN = 'googleMapsApiKey';
const TTL_MS = 15_000;

type Cached = { browser: string; server: string; at: number };
let cached: Cached | null = null;

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

function envBrowserKey(): string {
  return (
    process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim()
    || process.env.GOOGLE_MAPS_API_KEY?.trim()
    || ''
  );
}

function envServerKey(): string {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim()
    || process.env.GOOGLE_MAPS_API_KEY?.trim()
    || ''
  );
}

async function resolveKeys(): Promise<{ browser: string; server: string }> {
  if (cached && Date.now() - cached.at < TTL_MS) {
    return { browser: cached.browser, server: cached.server };
  }
  let stored = '';
  try {
    stored = await readStoredKey();
  } catch {
    stored = '';
  }
  const browser = stored || envBrowserKey();
  const server = envServerKey() || stored;
  cached = { browser, server, at: Date.now() };
  return { browser, server };
}

/** Key exposed to browsers via GET /settings/app (HTTP-referrer restricted in GCP). */
export async function getGoogleMapsBrowserApiKey(): Promise<string> {
  const { browser } = await resolveKeys();
  return browser;
}

/** Key for server-side Maps calls (geocoding, Directions, Map Tiles createSession). */
export async function getGoogleMapsServerApiKey(): Promise<string> {
  const { server } = await resolveKeys();
  return server;
}

/** Saved settings key, or the server env key when settings are blank. */
export async function getGoogleMapsApiKey(): Promise<string> {
  return getGoogleMapsServerApiKey();
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
  return getGoogleMapsBrowserApiKey();
}