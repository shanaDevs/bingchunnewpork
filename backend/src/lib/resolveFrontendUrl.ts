import type { Request } from 'express';
import { config } from '../config';
import { buildConfiguredCorsOrigins, isLocalhostOrigin, normalizeOrigin } from '@bingchun/cors';

/**
 * Live customer shop — never the CapRover default `*.server.dartcodes.com` host.
 * Set LIVE_SHOP_URL in production env; falls back to FRONTEND_URL, then the legacy mp domain
 * (kept only so old deployments keep working without an env change).
 */
export const CUSTOMER_SHOP_URL =
  process.env.LIVE_SHOP_URL?.replace(/\/$/, '')
  || process.env.FRONTEND_URL?.replace(/\/$/, '')
  || 'https://bingchunsrilanka.com';

const LIVE_SHOP = CUSTOMER_SHOP_URL;

/** Delivery ops admin — not the customer shop; must stay on the CORS allowlist. */
const DELIVERY_ADMIN_ORIGIN = 'https://bing-chun-delivery-frontend.bc.dartcodes.com';

/** CapRover surface frontends (split from the old monolith). Always allowlisted. */
const ADMIN_WEB_ORIGIN = 'https://bing-chun-admin-web.bc.dartcodes.com';
const POS_WEB_ORIGIN = 'https://bing-chun-pos-web.bc.dartcodes.com';

/** Legacy CapRover app hostnames that must be redirected to LIVE_SHOP (never the API host itself). */
const LEGACY_DEAD_HOSTNAME_PATTERNS = [
  /server\.dartcodes\.com$/i,
  /^bing-chung-b\./i,
  // Exact shop host only — do not match bing-chun-core / admin-web / pos-web / delivery-frontend.
  /^bing-chun\.bc\.dartcodes\.com$/i,
];

/** Always-allowlisted live shop hosts (custom domain + CapRover default). */
const LIVE_SHOP_ORIGINS = [
  'https://bingchunsrilanka.com',
  'https://www.bingchunsrilanka.com',
  'https://bing-chun.bc.dartcodes.com',
];

function productionCorsOrigins(): string[] {
  const extras = [
    process.env.CORS_EXTRA_ORIGINS,
    process.env.DELIVERY_FRONTEND_URL,
    process.env.ADMIN_WEB_URL,
    process.env.POS_WEB_URL,
    DELIVERY_ADMIN_ORIGIN,
    ADMIN_WEB_ORIGIN,
    POS_WEB_ORIGIN,
    ...LIVE_SHOP_ORIGINS,
  ].filter((value): value is string => Boolean(value?.trim()));

  return buildConfiguredCorsOrigins({
    customerShopUrl: CUSTOMER_SHOP_URL,
    frontendUrl: config.frontendUrl,
    adminUrl: config.adminUrl,
    corsExtraOrigins: extras.join(','),
  }).map((origin) => canonicalizeFrontendUrl(origin));
}

/** Exported for tests and deployment smoke checks. */
export function getConfiguredCorsOrigins(): string[] {
  return productionCorsOrigins();
}

function apiHostname(): string | null {
  const raw = (config.apiBaseUrl || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return null;
  }
}

/** Public API origin (no `/api` path) — must never be used as the customer shop redirect target. */
function apiOrigin(): string | null {
  const raw = (config.apiBaseUrl || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

function isBackendApiOrigin(origin: string): boolean {
  const api = apiOrigin();
  const candidate = normalizeOrigin(origin);
  if (!api || !candidate) return false;
  return candidate === api;
}

/** True when deployed on CapRover/production hosts, even if NODE_ENV was not set. */
export function isProductionDeployment(): boolean {
  if (config.nodeEnv === 'production') return true;
  const host = apiHostname();
  if (!host) return false;
  return /server\.dartcodes\.com$/i.test(host);
}

/**
 * Old CapRover default hosts / API host must never be used as the customer shop.
 * Those hostnames 502 (no Next app) after WebXPay redirects.
 */
export function canonicalizeFrontendUrl(origin: string): string {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return LIVE_SHOP;
  try {
    const { hostname } = new URL(normalized);
    if (LEGACY_DEAD_HOSTNAME_PATTERNS.some((re) => re.test(hostname))) return LIVE_SHOP;
  } catch {
    return LIVE_SHOP;
  }
  if (isProductionDeployment() && isLocalhostOrigin(normalized)) return LIVE_SHOP;
  return normalized;
}

function inferProductionFrontendUrl(): string {
  return LIVE_SHOP;
}

/** Customer site origin — never localhost or dead CapRover hosts in production. */
export function getEffectiveFrontendUrl(): string {
  const configured = canonicalizeFrontendUrl(config.frontendUrl.replace(/\/$/, ''));
  if (!isLocalhostOrigin(configured)) return configured;
  if (isProductionDeployment()) return inferProductionFrontendUrl();
  return configured;
}

/** CapRover surface web apps: bing-chun, bing-chun-admin-web, bing-chun-pos-web, … */
function isBingChunSurfaceWebOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    // Web UIs only — not API hosts (bing-chun-admin, bing-chun-pos, bing-chun-core, …).
    if (/^bing-chun-(admin|pos|shop|core|delivery)(\.|$)/i.test(hostname)) return false;
    return /^bing-chun([\w-]*)?\.bc\.dartcodes\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

function isAllowedFrontendOrigin(origin: string): boolean {
  const canonical = canonicalizeFrontendUrl(origin);
  if (isBackendApiOrigin(canonical)) return false;
  if (productionCorsOrigins().includes(canonical)) return true;
  if (isBingChunSurfaceWebOrigin(canonical)) return true;

  const configured = getEffectiveFrontendUrl();
  if (canonical === configured) return true;

  if (isProductionDeployment()) {
    return false;
  }

  if (isLocalhostOrigin(origin)) return true;
  if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) return true;
  return false;
}

export function isCorsAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return isAllowedFrontendOrigin(origin);
}

/** Prefer the browser origin (local dev) over server FRONTEND_URL for payment return links. */
export function resolveFrontendUrl(req: Request, explicit?: string): string {
  const candidates: string[] = [];

  if (explicit) candidates.push(explicit);

  for (const key of ['returnOrigin', 'frontendUrl', 'frontendOrigin'] as const) {
    const q = req.query[key];
    if (typeof q === 'string') candidates.push(q);
  }

  const headerOrigin = req.headers['x-frontend-origin'];
  if (typeof headerOrigin === 'string') candidates.push(headerOrigin);

  if (typeof req.headers.origin === 'string') candidates.push(req.headers.origin);

  if (typeof req.headers.referer === 'string') {
    const fromReferer = normalizeOrigin(req.headers.referer);
    if (fromReferer) candidates.push(fromReferer);
  }

  for (const raw of candidates) {
    const origin = normalizeOrigin(raw);
    if (!origin || isBackendApiOrigin(origin)) continue;
    if (isAllowedFrontendOrigin(origin)) {
      return canonicalizeFrontendUrl(origin);
    }
  }

  return getEffectiveFrontendUrl();
}
