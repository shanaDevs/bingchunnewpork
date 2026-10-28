import { prisma } from './prisma';
import { config } from '../config';
import { addColumnIfMissing } from './schemaPatch';
import { ensurePaymentSettingsTables } from './paymentSettings';

export type SmsProvider = 'smslenz' | 'mock' | 'dialog';

export type SmsRuntimeConfig = {
  enabled: boolean;
  provider: SmsProvider;
  baseUrl: string;
  userId: string;
  apiKey: string;
  senderId: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
  configured: boolean;
};

export type SmsAdminView = {
  enabled: boolean;
  provider: SmsProvider;
  userId: string;
  senderId: string;
  baseUrl: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
  apiKeySet: boolean;
  configured: boolean;
};

type SmsSettingRow = {
  smsEnabled: boolean | null;
  smsProvider: string | null;
  smsUserId: string | null;
  smsApiKey: string | null;
  smsSenderId: string | null;
  smsBaseUrl: string | null;
  smsConnectionTimeoutMs: number | null;
  smsReadTimeoutMs: number | null;
};

const DEFAULT_BASE_URL = 'https://smslenz.lk';
const DEFAULT_TIMEOUT_MS = 30_000;

let columnsReady = false;
let runtimeCache: { at: number; value: SmsRuntimeConfig } | null = null;
const RUNTIME_CACHE_MS = 5_000;

function parseProvider(raw: string | null | undefined): SmsProvider {
  const value = (raw || '').toLowerCase().trim();
  if (value === 'mock' || value === 'dialog' || value === 'smslenz') return value;
  return 'smslenz';
}

function parseTimeout(raw: number | null | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(120_000, Math.round(n));
}

function fromEnv(): SmsRuntimeConfig {
  const userId = config.sms.smslenz.userId || '';
  const apiKey = config.sms.smslenz.apiKey || '';
  const senderId = config.sms.smslenz.senderId || config.sms.senderId || 'BingChun';
  const baseUrl = config.sms.smslenz.baseUrl || DEFAULT_BASE_URL;
  const provider = parseProvider(config.sms.provider || (apiKey ? 'smslenz' : 'mock'));
  const configured = Boolean(userId && apiKey && senderId);
  return {
    enabled: configured && provider === 'smslenz',
    provider,
    baseUrl,
    userId,
    apiKey,
    senderId,
    connectionTimeoutMs: parseTimeout(config.sms.smslenz.connectionTimeoutMs, DEFAULT_TIMEOUT_MS),
    readTimeoutMs: parseTimeout(config.sms.smslenz.readTimeoutMs, DEFAULT_TIMEOUT_MS),
    configured,
  };
}

export async function ensureSmsSettingsColumns(): Promise<void> {
  if (columnsReady) return;
  await ensurePaymentSettingsTables();
  await addColumnIfMissing('system_settings', 'smsEnabled', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('system_settings', 'smsProvider', "VARCHAR(32) NOT NULL DEFAULT 'smslenz'");
  await addColumnIfMissing('system_settings', 'smsUserId', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'smsApiKey', 'TEXT NULL');
  await addColumnIfMissing('system_settings', 'smsSenderId', 'VARCHAR(64) NULL');
  await addColumnIfMissing('system_settings', 'smsBaseUrl', 'VARCHAR(512) NULL');
  await addColumnIfMissing('system_settings', 'smsConnectionTimeoutMs', 'INTEGER NOT NULL DEFAULT 30000');
  await addColumnIfMissing('system_settings', 'smsReadTimeoutMs', 'INTEGER NOT NULL DEFAULT 30000');
  columnsReady = true;
}

function invalidateSmsRuntimeCache() {
  runtimeCache = null;
}

async function readSmsRow(): Promise<SmsSettingRow | null> {
  const rows = await prisma.$queryRawUnsafe<SmsSettingRow[]>(
    `SELECT "smsEnabled", "smsProvider", "smsUserId", "smsApiKey", "smsSenderId",
            "smsBaseUrl", "smsConnectionTimeoutMs", "smsReadTimeoutMs"
     FROM "system_settings" WHERE "id" = 'default' LIMIT 1`,
  );
  return rows[0] ?? null;
}

function mergeRuntime(row: SmsSettingRow | null, env: SmsRuntimeConfig): SmsRuntimeConfig {
  if (!row) return env;

  const userId = (row.smsUserId?.trim() || env.userId).trim();
  const apiKey = (row.smsApiKey?.trim() || env.apiKey).trim();
  const senderId = (row.smsSenderId?.trim() || env.senderId).trim();
  const baseUrl = (row.smsBaseUrl?.trim() || env.baseUrl).trim() || DEFAULT_BASE_URL;
  const provider = parseProvider(row.smsProvider || env.provider);
  const hasCreds = Boolean(userId && apiKey && senderId);
  const adminTouched = Boolean(
    row.smsApiKey?.trim() ||
      row.smsUserId?.trim() ||
      row.smsSenderId?.trim() ||
      row.smsBaseUrl?.trim(),
  );
  const enabled =
    hasCreds &&
    provider === 'smslenz' &&
    (adminTouched ? Boolean(row.smsEnabled) : env.enabled);

  return {
    enabled,
    provider,
    baseUrl,
    userId,
    apiKey,
    senderId,
    connectionTimeoutMs: parseTimeout(row.smsConnectionTimeoutMs, env.connectionTimeoutMs),
    readTimeoutMs: parseTimeout(row.smsReadTimeoutMs, env.readTimeoutMs),
    configured: hasCreds,
  };
}

/**
 * Resolve SMS credentials: DB overrides env when present.
 * Sending requires enabled + SMSlenz user id, api key, and sender id.
 */
export async function getSmsRuntimeConfig(): Promise<SmsRuntimeConfig> {
  const now = Date.now();
  if (runtimeCache && now - runtimeCache.at < RUNTIME_CACHE_MS) {
    return runtimeCache.value;
  }

  await ensureSmsSettingsColumns();
  const env = fromEnv();
  const row = await readSmsRow().catch(() => null);
  const value = mergeRuntime(row, env);
  runtimeCache = { at: now, value };
  return value;
}

export async function getSmsAdminView(): Promise<SmsAdminView> {
  const runtime = await getSmsRuntimeConfig();
  const row = await readSmsRow().catch(() => null);

  const userId = row?.smsUserId?.trim() || config.sms.smslenz.userId || '';
  const senderId = row?.smsSenderId?.trim() || config.sms.smslenz.senderId || config.sms.senderId || '';
  const baseUrl = row?.smsBaseUrl?.trim() || config.sms.smslenz.baseUrl || DEFAULT_BASE_URL;
  const apiKeySet = Boolean(
    (row?.smsApiKey && row.smsApiKey.trim()) || config.sms.smslenz.apiKey,
  );

  return {
    enabled: row?.smsEnabled ?? runtime.enabled,
    provider: parseProvider(row?.smsProvider || runtime.provider),
    userId,
    senderId,
    baseUrl,
    connectionTimeoutMs: parseTimeout(row?.smsConnectionTimeoutMs, runtime.connectionTimeoutMs),
    readTimeoutMs: parseTimeout(row?.smsReadTimeoutMs, runtime.readTimeoutMs),
    apiKeySet,
    configured: runtime.configured,
  };
}

export async function updateSmsSettings(input: {
  enabled?: boolean;
  provider?: string;
  userId?: string;
  apiKey?: string;
  senderId?: string;
  baseUrl?: string;
  connectionTimeoutMs?: number;
  readTimeoutMs?: number;
}): Promise<SmsAdminView> {
  await ensureSmsSettingsColumns();
  invalidateSmsRuntimeCache();

  const env = fromEnv();
  const existing = await prisma.systemSetting.findUnique({
    where: { id: 'default' },
    select: { id: true },
  });

  if (!existing) {
    await prisma.systemSetting.create({
      data: { id: 'default', paymentMethods: {} },
    });
  }

  const current = await readSmsRow();
  const next: SmsSettingRow = {
    smsEnabled: input.enabled ?? current?.smsEnabled ?? env.enabled,
    smsProvider: parseProvider(input.provider ?? current?.smsProvider ?? env.provider),
    smsUserId:
      input.userId !== undefined ? input.userId.trim() || null : (current?.smsUserId ?? env.userId) || null,
    smsApiKey:
      input.apiKey !== undefined && input.apiKey.trim()
        ? input.apiKey.trim()
        : (current?.smsApiKey ?? env.apiKey) || null,
    smsSenderId:
      input.senderId !== undefined
        ? input.senderId.trim() || null
        : (current?.smsSenderId ?? env.senderId) || null,
    smsBaseUrl:
      input.baseUrl !== undefined
        ? input.baseUrl.trim() || DEFAULT_BASE_URL
        : (current?.smsBaseUrl ?? env.baseUrl ?? DEFAULT_BASE_URL),
    smsConnectionTimeoutMs: parseTimeout(
      input.connectionTimeoutMs ?? current?.smsConnectionTimeoutMs,
      env.connectionTimeoutMs,
    ),
    smsReadTimeoutMs: parseTimeout(
      input.readTimeoutMs ?? current?.smsReadTimeoutMs,
      env.readTimeoutMs,
    ),
  };

  await prisma.$executeRawUnsafe(
    `UPDATE "system_settings"
     SET "smsEnabled" = $1,
         "smsProvider" = $2,
         "smsUserId" = $3,
         "smsApiKey" = $4,
         "smsSenderId" = $5,
         "smsBaseUrl" = $6,
         "smsConnectionTimeoutMs" = $7,
         "smsReadTimeoutMs" = $8
     WHERE "id" = 'default'`,
    next.smsEnabled,
    next.smsProvider,
    next.smsUserId,
    next.smsApiKey,
    next.smsSenderId,
    next.smsBaseUrl,
    next.smsConnectionTimeoutMs,
    next.smsReadTimeoutMs,
  );

  invalidateSmsRuntimeCache();
  return getSmsAdminView();
}
