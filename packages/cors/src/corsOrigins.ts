/**
 * Env-driven CORS origin allowlist (no Express dependency).
 */

export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isLocalhostOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

export function parseExtraCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const origin = normalizeOrigin(part);
    if (origin) out.push(origin);
  }
  return out;
}

/** Deduped browser origins allowed in production CORS checks. */
export function buildConfiguredCorsOrigins(input: {
  customerShopUrl: string;
  frontendUrl: string;
  adminUrl: string;
  corsExtraOrigins?: string;
}): string[] {
  const set = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value?.trim()) return;
    const origin = normalizeOrigin(value.replace(/\/$/, ''));
    if (origin) set.add(origin);
  };
  add(input.customerShopUrl);
  add(input.frontendUrl);
  add(input.adminUrl);
  for (const origin of parseExtraCorsOrigins(input.corsExtraOrigins)) {
    set.add(origin);
  }
  return [...set];
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowlist: string[],
  nodeEnv: string,
): boolean {
  if (!origin) return true;
  if (allowlist.includes(origin)) return true;
  if (nodeEnv !== 'production') {
    if (isLocalhostOrigin(origin)) return true;
    if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) return true;
  }
  return false;
}

/** LIVE_SHOP + configured URLs — shared by order/payment/notification services. */
export function buildMicroserviceCorsAllowlist(config: {
  frontendUrl: string;
  adminUrl: string;
}): string[] {
  const liveShop =
    process.env.LIVE_SHOP_URL?.replace(/\/$/, '')
    || process.env.FRONTEND_URL?.replace(/\/$/, '')
    || config.frontendUrl;
  return buildConfiguredCorsOrigins({
    customerShopUrl: liveShop,
    frontendUrl: config.frontendUrl,
    adminUrl: config.adminUrl,
    corsExtraOrigins: process.env.CORS_EXTRA_ORIGINS,
  });
}
