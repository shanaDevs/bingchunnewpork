import { prisma } from './prisma';
import { config } from '../config';
import { addColumnIfMissing } from './schemaPatch';
import { ensurePaymentSettingsTables } from './paymentSettings';

export type WhatsAppRuntimeConfig = {
  enabled: boolean;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  configured: boolean;
};

export type WhatsAppAdminView = {
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  accessTokenSet: boolean;
  verifyTokenSet: boolean;
  configured: boolean;
  /** Public webhook path for Meta callback URL */
  webhookPath: string;
  /** Full callback URL to paste in Meta (HTTPS preferred) */
  webhookUrl: string;
};

const DEFAULT_WEBHOOK_PATH = '/api/whatsapp/webhook';
const DEFAULT_CALLBACK_URL = `https://bing-chung-b.mp.dartcodes.com${DEFAULT_WEBHOOK_PATH}`;

let columnsReady = false;

function defaultCallbackUrlFromEnv(): string {
  const apiBase = (config.apiBaseUrl || '').replace(/\/+$/, '').replace(/\/api$/i, '');
  const origin = (apiBase || 'https://bing-chung-b.mp.dartcodes.com').replace(
    /^http:\/\//i,
    'https://',
  );
  return `${origin}${DEFAULT_WEBHOOK_PATH}`;
}

function normalizeCallbackUrl(raw: string | null | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return defaultCallbackUrlFromEnv();
  // Meta only accepts HTTPS callbacks
  return trimmed.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
}

async function readCallbackUrlFromDb(): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ whatsappCallbackUrl: string | null }>>(
    `SELECT "whatsappCallbackUrl" FROM "system_settings" WHERE "id" = 'default' LIMIT 1`,
  );
  return rows[0]?.whatsappCallbackUrl ?? null;
}

async function writeCallbackUrlToDb(url: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "system_settings" SET "whatsappCallbackUrl" = $1 WHERE "id" = 'default'`,
    url,
  );
}

async function backfillCallbackUrlIfEmpty(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "system_settings"
     SET "whatsappCallbackUrl" = $1
     WHERE "id" = 'default'
       AND ("whatsappCallbackUrl" IS NULL OR TRIM("whatsappCallbackUrl") = '')`,
    defaultCallbackUrlFromEnv() || DEFAULT_CALLBACK_URL,
  );
}

export async function ensureWhatsAppSettingsColumns(): Promise<void> {
  if (columnsReady) return;
  await ensurePaymentSettingsTables();
  await addColumnIfMissing('system_settings', 'whatsappEnabled', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('system_settings', 'whatsappAccessToken', 'TEXT NULL');
  await addColumnIfMissing('system_settings', 'whatsappPhoneNumberId', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'whatsappBusinessAccountId', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'whatsappVerifyToken', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'whatsappCallbackUrl', 'TEXT NULL');
  await backfillCallbackUrlIfEmpty();
  columnsReady = true;
}

function fromEnv(): WhatsAppRuntimeConfig {
  const accessToken = config.whatsapp.accessToken || '';
  const phoneNumberId = config.whatsapp.phoneNumberId || '';
  const businessAccountId = config.whatsapp.businessAccountId || '';
  const verifyToken = config.whatsapp.verifyToken || '';
  const configured = Boolean(accessToken && phoneNumberId);
  return {
    enabled: configured,
    accessToken,
    phoneNumberId,
    businessAccountId,
    verifyToken,
    configured,
  };
}

/**
 * Resolve WhatsApp credentials: DB overrides env when present.
 * Sending/receiving requires enabled + access token + phone number id.
 */
export async function getWhatsAppRuntimeConfig(): Promise<WhatsAppRuntimeConfig> {
  await ensureWhatsAppSettingsColumns();
  const env = fromEnv();

  const row = await prisma.systemSetting.findUnique({
    where: { id: 'default' },
    select: {
      whatsappEnabled: true,
      whatsappAccessToken: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessAccountId: true,
      whatsappVerifyToken: true,
    },
  }).catch(() => null);

  if (!row) return env;

  const accessToken = (row.whatsappAccessToken?.trim() || env.accessToken).trim();
  const phoneNumberId = (row.whatsappPhoneNumberId?.trim() || env.phoneNumberId).trim();
  const businessAccountId = (row.whatsappBusinessAccountId?.trim() || env.businessAccountId).trim();
  const verifyToken = (row.whatsappVerifyToken?.trim() || env.verifyToken).trim();
  const hasCreds = Boolean(accessToken && phoneNumberId);
  const adminTouched = Boolean(
    row.whatsappAccessToken?.trim() ||
      row.whatsappPhoneNumberId?.trim() ||
      row.whatsappVerifyToken?.trim() ||
      row.whatsappBusinessAccountId?.trim(),
  );
  // If admin never saved WhatsApp fields, keep env-based behaviour.
  // If creds exist, enable unless admin explicitly disabled.
  const enabled =
    hasCreds && (adminTouched ? Boolean(row.whatsappEnabled) : true);

  return {
    enabled,
    accessToken,
    phoneNumberId,
    businessAccountId,
    verifyToken,
    configured: hasCreds,
  };
}

export async function getWhatsAppAdminView(): Promise<WhatsAppAdminView> {
  const runtime = await getWhatsAppRuntimeConfig();
  const row = await prisma.systemSetting.findUnique({
    where: { id: 'default' },
    select: {
      whatsappEnabled: true,
      whatsappAccessToken: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessAccountId: true,
      whatsappVerifyToken: true,
    },
  }).catch(() => null);

  const phoneNumberId = row?.whatsappPhoneNumberId?.trim() || config.whatsapp.phoneNumberId || '';
  const businessAccountId =
    row?.whatsappBusinessAccountId?.trim() || config.whatsapp.businessAccountId || '';
  const accessTokenSet = Boolean(
    (row?.whatsappAccessToken && row.whatsappAccessToken.trim()) || config.whatsapp.accessToken,
  );
  const verifyTokenSet = Boolean(
    (row?.whatsappVerifyToken && row.whatsappVerifyToken.trim()) || config.whatsapp.verifyToken,
  );

  const storedCallback = await readCallbackUrlFromDb().catch(() => null);
  const webhookUrl = normalizeCallbackUrl(storedCallback);
  let webhookPath = DEFAULT_WEBHOOK_PATH;
  try {
    webhookPath = new URL(webhookUrl).pathname || DEFAULT_WEBHOOK_PATH;
  } catch {
    webhookPath = DEFAULT_WEBHOOK_PATH;
  }

  return {
    enabled: row?.whatsappEnabled ?? runtime.enabled,
    phoneNumberId,
    businessAccountId,
    accessTokenSet,
    verifyTokenSet,
    configured: runtime.configured,
    webhookPath,
    webhookUrl,
  };
}

export async function updateWhatsAppSettings(input: {
  enabled?: boolean;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  verifyToken?: string;
  /** Meta webhook callback URL */
  callbackUrl?: string;
  webhookUrl?: string;
}): Promise<WhatsAppAdminView> {
  await ensureWhatsAppSettingsColumns();

  const callbackRaw = input.callbackUrl ?? input.webhookUrl;
  const callbackUrl =
    callbackRaw !== undefined ? normalizeCallbackUrl(callbackRaw) : undefined;

  const existing = await prisma.systemSetting.findUnique({ where: { id: 'default' } });
  if (!existing) {
    // Ensure singleton row exists (payment settings create path).
    await prisma.systemSetting.create({
      data: {
        id: 'default',
        paymentMethods: {},
        whatsappEnabled: input.enabled ?? false,
        whatsappAccessToken: input.accessToken?.trim() || config.whatsapp.accessToken || null,
        whatsappPhoneNumberId: input.phoneNumberId?.trim() || config.whatsapp.phoneNumberId || null,
        whatsappBusinessAccountId:
          input.businessAccountId?.trim() || config.whatsapp.businessAccountId || null,
        whatsappVerifyToken: input.verifyToken?.trim() || config.whatsapp.verifyToken || null,
      },
    });
    await writeCallbackUrlToDb(callbackUrl || defaultCallbackUrlFromEnv());
    return getWhatsAppAdminView();
  }

  await prisma.systemSetting.update({
    where: { id: 'default' },
    data: {
      ...(input.enabled !== undefined ? { whatsappEnabled: input.enabled } : {}),
      ...(input.accessToken !== undefined && input.accessToken.trim()
        ? { whatsappAccessToken: input.accessToken.trim() }
        : {}),
      ...(input.phoneNumberId !== undefined
        ? { whatsappPhoneNumberId: input.phoneNumberId.trim() || null }
        : {}),
      ...(input.businessAccountId !== undefined
        ? { whatsappBusinessAccountId: input.businessAccountId.trim() || null }
        : {}),
      ...(input.verifyToken !== undefined && input.verifyToken.trim()
        ? { whatsappVerifyToken: input.verifyToken.trim() }
        : {}),
    },
  });

  if (callbackUrl !== undefined) {
    await writeCallbackUrlToDb(callbackUrl);
  } else {
    await backfillCallbackUrlIfEmpty();
  }

  return getWhatsAppAdminView();
}
