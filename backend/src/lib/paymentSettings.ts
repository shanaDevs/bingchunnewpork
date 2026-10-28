import { prisma } from './prisma';
import { config } from '../config';
import { webxpayReturnUrl as computeWebxpayReturnUrl } from './payhereUrls';
import { AppError } from '../middleware/errorHandler';
import { isProductionDeployment } from './resolveFrontendUrl';
import { addColumnIfMissing } from './schemaPatch';

export type PaymentMethodKey = 'PAYHERE' | 'CASH_AT_COUNTER' | 'CARD';
export type OnlineGateway = 'PAYHERE' | 'WEBXPAY';

/** Pickup orders above this subtotal (LKR) must be paid online. */
export const PICKUP_ONLINE_PAYMENT_THRESHOLD = 1000;

export function requiresOnlinePaymentForPickup(subtotal: number): boolean {
  return subtotal >= PICKUP_ONLINE_PAYMENT_THRESHOLD;
}

export interface PaymentMethodConfig {
  enabled: boolean;
  label: string;
  icon?: string;
  modes: ('DELIVERY' | 'TAKEAWAY')[];
}

export interface PaymentSettings {
  activeOnlineGateway: OnlineGateway;
  methods: Record<PaymentMethodKey, PaymentMethodConfig>;
  payhere: {
    merchantId: string;
    merchantSecret: string;
    mode: 'sandbox' | 'live';
    configured: boolean;
  };
  webxpay: {
    publicKey: string;
    secretKey: string;
    apiUsername: string;
    apiPassword: string;
    mode: 'sandbox' | 'live';
    returnUrl: string;
    configured: boolean;
  };
}

const DEFAULT_METHODS: Record<PaymentMethodKey, PaymentMethodConfig> = {
  PAYHERE: {
    enabled: true,
    label: 'Online Payment',
    icon: '💳',
    modes: ['DELIVERY', 'TAKEAWAY'],
  },
  CARD: {
    enabled: false,
    label: 'Online Payment',
    icon: '💳',
    modes: ['DELIVERY', 'TAKEAWAY'],
  },
  CASH_AT_COUNTER: {
    enabled: false,
    label: 'Cash at Counter',
    icon: '🏪',
    modes: ['TAKEAWAY'],
  },
};

const CHECKOUT_ONLINE_METHODS = new Set<PaymentMethodKey>(['PAYHERE', 'CARD']);

let tablesReady = false;

export async function ensurePaymentSettingsTables(): Promise<void> {
  if (tablesReady) return;

  await addColumnIfMissing('system_settings', 'activeOnlineGateway', "VARCHAR(191) NOT NULL DEFAULT 'PAYHERE'");
  await addColumnIfMissing('system_settings', 'webxpayPublicKey', 'TEXT NULL');
  await addColumnIfMissing('system_settings', 'webxpaySecretKey', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'webxpayApiUsername', 'VARCHAR(191) NULL');
  await addColumnIfMissing('system_settings', 'webxpayApiPassword', 'TEXT NULL');
  await addColumnIfMissing('system_settings', 'webxpayMode', "VARCHAR(191) NOT NULL DEFAULT 'sandbox'");
  await addColumnIfMissing('system_settings', 'webxpayReturnUrl', 'VARCHAR(512) NULL');

  await addColumnIfMissing('admin_notifications', 'productId', 'VARCHAR(191) NULL');

  tablesReady = true;
}

function mergeMethods(stored: unknown): Record<PaymentMethodKey, PaymentMethodConfig> {
  const base = { ...DEFAULT_METHODS };
  if (!stored || typeof stored !== 'object') return base;
  for (const key of Object.keys(DEFAULT_METHODS) as PaymentMethodKey[]) {
    const row = (stored as Record<string, Partial<PaymentMethodConfig>>)[key];
    if (row) {
      base[key] = {
        ...base[key],
        ...row,
        icon: base[key].icon,
      };
    }
  }
  if (base.PAYHERE.enabled && !base.PAYHERE.modes.includes('TAKEAWAY')) {
    base.PAYHERE.modes = [...base.PAYHERE.modes, 'TAKEAWAY'];
  }
  base.PAYHERE.label = 'Online Payment';
  base.CARD.label = 'Online Payment';
  return base;
}

function parseGateway(value: string | null | undefined): OnlineGateway {
  return value === 'WEBXPAY' ? 'WEBXPAY' : 'PAYHERE';
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  await ensurePaymentSettingsTables();

  let row = await prisma.systemSetting.findUnique({ where: { id: 'default' } });

  if (!row) {
    const envId = config.payhere.merchantId.trim();
    const envSecret = config.payhere.merchantSecret.trim();
    row = await prisma.systemSetting.create({
      data: {
        id: 'default',
        paymentMethods: DEFAULT_METHODS as any,
        activeOnlineGateway: 'PAYHERE',
        payhereMerchantId: isValidPayHereCredentials(envId, envSecret) ? envId : null,
        payhereMerchantSecret: isValidPayHereCredentials(envId, envSecret) ? envSecret : null,
        payhereMode: config.payhere.mode === 'live' ? 'live' : 'sandbox',
        webxpayPublicKey: config.webxpay.publicKey || null,
        webxpaySecretKey: config.webxpay.secretKey || null,
        webxpayApiUsername: config.webxpay.apiUsername || null,
        webxpayApiPassword: config.webxpay.apiPassword || null,
        webxpayMode: config.webxpay.mode === 'live' ? 'live' : 'sandbox',
        webxpayReturnUrl: config.webxpay.returnUrl || null,
      },
    });
  } else {
    const dbId = (row.payhereMerchantId || '').trim();
    const dbSecret = (row.payhereMerchantSecret || '').trim();
    const envId = config.payhere.merchantId.trim();
    const envSecret = config.payhere.merchantSecret.trim();
    const envValid = isValidPayHereCredentials(envId, envSecret);
    const dbValid = isValidPayHereCredentials(dbId, dbSecret);

    if (envValid && (!dbValid || dbId !== envId || dbSecret !== envSecret)) {
      row = await prisma.systemSetting.update({
        where: { id: 'default' },
        data: {
          payhereMerchantId: envId,
          payhereMerchantSecret: envSecret,
          payhereMode: config.payhere.mode === 'live' ? 'live' : 'sandbox',
        },
      });
    }
  }

  const merchantId = (row.payhereMerchantId || config.payhere.merchantId || '').trim();
  const merchantSecret = (row.payhereMerchantSecret || config.payhere.merchantSecret || '').trim();
  const payhereConfigured = isValidPayHereCredentials(merchantId, merchantSecret);

  const rowData = row as typeof row & {
    activeOnlineGateway?: string | null;
    webxpayPublicKey?: string | null;
    webxpaySecretKey?: string | null;
    webxpayApiUsername?: string | null;
    webxpayApiPassword?: string | null;
    webxpayMode?: string | null;
    webxpayReturnUrl?: string | null;
  };

  const publicKey = (rowData.webxpayPublicKey || config.webxpay.publicKey || '').trim();
  const secretKey = (rowData.webxpaySecretKey || config.webxpay.secretKey || '').trim();
  const apiUsername = (rowData.webxpayApiUsername || config.webxpay.apiUsername || '').trim();
  const apiPassword = (rowData.webxpayApiPassword || config.webxpay.apiPassword || '').trim();
  const webxpayConfigured = isValidWebXPayCredentials(publicKey, secretKey);
  const storedReturnUrl = rowData.webxpayReturnUrl?.trim() || '';
  let resolvedReturnUrl = (
    storedReturnUrl ||
    config.webxpay.returnUrl ||
    computeWebxpayReturnUrl()
  ).trim();

  if (webxpayReturnUrlNeedsRefresh(storedReturnUrl)) {
    resolvedReturnUrl = computeWebxpayReturnUrl();
  }

  if (resolvedReturnUrl !== storedReturnUrl) {
    await prisma.systemSetting.update({
      where: { id: 'default' },
      data: { webxpayReturnUrl: resolvedReturnUrl },
    });
  }

  return {
    activeOnlineGateway: parseGateway(rowData.activeOnlineGateway),
    methods: mergeMethods(row.paymentMethods),
    payhere: {
      merchantId,
      merchantSecret,
      mode: row.payhereMode === 'live' ? 'live' : 'sandbox',
      configured: payhereConfigured,
    },
    webxpay: {
      publicKey,
      secretKey,
      apiUsername,
      apiPassword,
      mode: rowData.webxpayMode === 'live' ? 'live' : 'sandbox',
      returnUrl: resolvedReturnUrl,
      configured: webxpayConfigured,
    },
  };
}

/** Reject mock, placeholder, and template values from .env / admin form */
export function isValidPayHereCredentials(merchantId: string, merchantSecret: string): boolean {
  if (!merchantId || !merchantSecret) return false;
  const blocked = new Set([
    'mock_merchant',
    'mock_secret',
    'your_sandbox_merchant_id',
    'your_sandbox_secret',
    'merchant_id',
    'merchant_secret',
  ]);
  if (blocked.has(merchantId) || blocked.has(merchantSecret)) return false;
  if (/^your_|^change|^xxx|placeholder|example/i.test(merchantId)) return false;
  if (/^your_|^change|^xxx|placeholder|example/i.test(merchantSecret)) return false;
  return merchantId.length >= 4 && merchantSecret.length >= 8;
}

export function isValidWebXPayCredentials(publicKey: string, secretKey: string): boolean {
  if (!publicKey || !secretKey) return false;
  const blocked = new Set(['mock_secret', 'your_secret_key', 'secret_key']);
  if (blocked.has(secretKey)) return false;
  if (/^your_|^change|^xxx|placeholder|example/i.test(secretKey)) return false;
  if (/^your_|^change|^xxx|placeholder|example/i.test(publicKey)) return false;
  return publicKey.length >= 40 && secretKey.length >= 8;
}

function webxpayReturnUrlNeedsRefresh(stored: string | null | undefined): boolean {
  const url = (stored || '').trim();
  if (!url) return true;
  if (!isProductionDeployment()) return false;
  const expected = computeWebxpayReturnUrl();
  if (url !== expected) return true;
  if (/localhost|127\.0\.0\.1/i.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    if (host === 'bing-chung.mp.dartcodes.com') return true;
    if (host.endsWith('.mp.dartcodes.com') && !host.includes('-b.')) return true;
    const returnOrigin = new URL(url).searchParams.get('returnOrigin');
    const decodedOrigin = returnOrigin ? decodeURIComponent(returnOrigin) : '';
    if (/localhost|127\.0\.0\.1|server\.dartcodes\.com|bing-chun\./i.test(url)) return true;
    if (decodedOrigin && /localhost|127\.0\.0\.1|server\.dartcodes\.com|bing-chun\./i.test(decodedOrigin)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isActiveOnlineGatewayConfigured(settings: PaymentSettings): boolean {
  if (settings.activeOnlineGateway === 'WEBXPAY') {
    return settings.webxpay.configured;
  }
  return settings.payhere.configured;
}

export async function getEnabledMethodsForCheckout(
  orderMode: 'DELIVERY' | 'TAKEAWAY',
  orderSubtotal?: number,
): Promise<{ id: PaymentMethodKey; label: string; icon?: string }[]> {
  const settings = await getPaymentSettings();
  const gatewayConfigured = isActiveOnlineGatewayConfigured(settings);

  const methods = (Object.entries(settings.methods) as [PaymentMethodKey, PaymentMethodConfig][])
    .filter(([id, m]) => {
      if (!CHECKOUT_ONLINE_METHODS.has(id)) return false;
      if (!m.enabled || !m.modes.includes(orderMode)) return false;
      if (id === 'PAYHERE' && !gatewayConfigured) return false;
      if (id === 'CARD') return false;
      return true;
    })
    .map(([id, m]) => ({ id, label: m.label, icon: DEFAULT_METHODS[id].icon }));

  if (
    orderMode === 'TAKEAWAY' &&
    orderSubtotal != null &&
    !requiresOnlinePaymentForPickup(orderSubtotal)
  ) {
    const cash = settings.methods.CASH_AT_COUNTER;
    if (
      cash.enabled &&
      cash.modes.includes('TAKEAWAY') &&
      !methods.some((m) => m.id === 'CASH_AT_COUNTER')
    ) {
      methods.unshift({
        id: 'CASH_AT_COUNTER',
        label: cash.label || DEFAULT_METHODS.CASH_AT_COUNTER.label,
        icon: DEFAULT_METHODS.CASH_AT_COUNTER.icon,
      });
    }
  }

  return methods;
}

export async function assertPaymentMethodAllowed(
  method: string,
  orderMode: 'DELIVERY' | 'TAKEAWAY',
  orderSubtotal?: number,
): Promise<void> {
  if (
    orderMode === 'TAKEAWAY' &&
    method === 'CASH_AT_COUNTER' &&
    orderSubtotal != null &&
    requiresOnlinePaymentForPickup(orderSubtotal)
  ) {
    throw new AppError(
      `Takeaway orders of LKR ${PICKUP_ONLINE_PAYMENT_THRESHOLD.toLocaleString()} or more must be paid online`,
      400,
    );
  }

  if (
    method === 'CASH_AT_COUNTER' &&
    orderMode === 'TAKEAWAY' &&
    orderSubtotal != null &&
    !requiresOnlinePaymentForPickup(orderSubtotal)
  ) {
    const settings = await getPaymentSettings();
    const cash = settings.methods.CASH_AT_COUNTER;
    if (cash.enabled && cash.modes.includes('TAKEAWAY')) return;
  }

  const enabled = await getEnabledMethodsForCheckout(orderMode, orderSubtotal);
  const allowed = enabled.some((m) => m.id === method || (method === 'CARD' && m.id === 'PAYHERE'));
  if (!allowed) {
    throw new AppError('This payment method is not available', 400);
  }
}

export async function updatePaymentSettings(data: {
  paymentMethods?: Record<string, PaymentMethodConfig>;
  activeOnlineGateway?: OnlineGateway;
  payhereMerchantId?: string;
  payhereMerchantSecret?: string;
  payhereMode?: 'sandbox' | 'live';
  webxpayPublicKey?: string;
  webxpaySecretKey?: string;
  webxpayApiUsername?: string;
  webxpayApiPassword?: string;
  webxpayMode?: 'sandbox' | 'live';
  webxpayReturnUrl?: string;
}): Promise<PaymentSettings> {
  await ensurePaymentSettingsTables();

  const existing = await getPaymentSettings();
  const merged = mergeMethods({ ...existing.methods, ...(data.paymentMethods || {}) });
  const returnUrl =
    data.webxpayReturnUrl !== undefined
      ? data.webxpayReturnUrl.trim() || computeWebxpayReturnUrl()
      : existing.webxpay.returnUrl || computeWebxpayReturnUrl();

  await prisma.systemSetting.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      paymentMethods: merged as any,
      activeOnlineGateway: data.activeOnlineGateway ?? existing.activeOnlineGateway,
      payhereMerchantId: data.payhereMerchantId ?? existing.payhere.merchantId,
      payhereMerchantSecret: data.payhereMerchantSecret ?? existing.payhere.merchantSecret,
      payhereMode: data.payhereMode ?? existing.payhere.mode,
      webxpayPublicKey: data.webxpayPublicKey ?? existing.webxpay.publicKey,
      webxpaySecretKey: data.webxpaySecretKey ?? existing.webxpay.secretKey,
      webxpayApiUsername: data.webxpayApiUsername ?? existing.webxpay.apiUsername,
      webxpayApiPassword: data.webxpayApiPassword ?? existing.webxpay.apiPassword,
      webxpayMode: data.webxpayMode ?? existing.webxpay.mode,
      webxpayReturnUrl: returnUrl,
    },
    update: {
      paymentMethods: merged as any,
      ...(data.activeOnlineGateway !== undefined && { activeOnlineGateway: data.activeOnlineGateway }),
      ...(data.payhereMerchantId !== undefined && { payhereMerchantId: data.payhereMerchantId || null }),
      ...(data.payhereMerchantSecret !== undefined && {
        payhereMerchantSecret: data.payhereMerchantSecret || null,
      }),
      ...(data.payhereMode !== undefined && { payhereMode: data.payhereMode }),
      ...(data.webxpayPublicKey !== undefined && { webxpayPublicKey: data.webxpayPublicKey || null }),
      ...(data.webxpaySecretKey !== undefined && { webxpaySecretKey: data.webxpaySecretKey || null }),
      ...(data.webxpayApiUsername !== undefined && { webxpayApiUsername: data.webxpayApiUsername || null }),
      ...(data.webxpayApiPassword !== undefined && { webxpayApiPassword: data.webxpayApiPassword || null }),
      ...(data.webxpayMode !== undefined && { webxpayMode: data.webxpayMode }),
      ...(data.webxpayReturnUrl !== undefined && { webxpayReturnUrl: returnUrl || null }),
    },
  });

  return getPaymentSettings();
}
