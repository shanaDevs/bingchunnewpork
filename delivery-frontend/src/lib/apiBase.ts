const LOCAL_BACKEND = 'http://localhost:4000';
const LOCAL_API = `${LOCAL_BACKEND}/api`;

/** localStorage key — set via 5-tap on Staff Login padlock. */
export const API_BASE_OVERRIDE_KEY = 'bc_api_base_override';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeUrlPath(url: string): string {
  return url.replace(/([^:]\/)\/+/g, '$1');
}

function joinUrl(base: string, path: string): string {
  const root = stripTrailingSlash(base);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return normalizeUrlPath(`${root}${suffix}`);
}

/** Runtime override from Staff Login (browser only). Includes `/api` suffix when set. */
export function getApiBaseOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(API_BASE_OVERRIDE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

/** Persist API base (must be absolute, preferably ending with `/api`). */
export function setApiBaseOverride(url: string) {
  if (typeof window === 'undefined') return;
  const cleaned = stripTrailingSlash(url.trim());
  localStorage.setItem(API_BASE_OVERRIDE_KEY, cleaned);
}

export function clearApiBaseOverride() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_BASE_OVERRIDE_KEY);
}

function ensureApiSuffix(url: string): string {
  const base = stripTrailingSlash(url);
  if (base.endsWith('/api')) return base;
  return `${base}/api`;
}

const PRODUCTION_BACKEND_ORIGIN = 'https://bing-chung-b.mp.dartcodes.com';
const PRODUCTION_FRONTEND_HOST = 'bing-chung.mp.dartcodes.com';

/** Origin used for payment gateway callbacks (always the API host, never the storefront). */
export function getPublicApiOrigin(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === PRODUCTION_FRONTEND_HOST) return PRODUCTION_BACKEND_ORIGIN;
    if (host.endsWith('.mp.dartcodes.com') && !host.includes('-b.')) {
      return `https://${host.replace(/\.mp\.dartcodes\.com$/i, '-b.mp.dartcodes.com')}`;
    }
  }
  const origin = getBackendOrigin();
  try {
    const host = new URL(origin).hostname;
    if (host === PRODUCTION_FRONTEND_HOST) return PRODUCTION_BACKEND_ORIGIN;
  } catch {
    /* keep */
  }
  return origin;
}

export function getWebxpayReturnUrlHint(): string {
  return `${getPublicApiOrigin()}/api/payments/webxpay-return`;
}

/** Backend server origin from env (no /api suffix). */
export function getBackendOrigin(): string {
  const override = getApiBaseOverride();
  if (override) {
    return stripTrailingSlash(override.replace(/\/api\/?$/, ''));
  }

  const fromEnv = process.env.BACKEND_URL || process.env.API_PROXY_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);

  const api = process.env.NEXT_PUBLIC_API_URL || LOCAL_API;
  if (api.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return LOCAL_BACKEND;
  }

  return stripTrailingSlash(api.replace(/\/api\/?$/, ''));
}

/**
 * API base URL (includes /api suffix).
 * Set NEXT_PUBLIC_API_URL in .env — use `/api` in production (proxied via BACKEND_URL).
 * Staff Login 5-tap override wins in the browser when set.
 */
export function getApiBaseUrl(): string {
  const override = getApiBaseOverride();
  if (override) return ensureApiSuffix(override);

  const configured = process.env.NEXT_PUBLIC_API_URL || LOCAL_API;

  if (configured.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return joinUrl(window.location.origin, configured);
    }
    return joinUrl(getBackendOrigin(), configured);
  }

  return normalizeUrlPath(configured);
}

/** Socket.io server origin (no /api suffix). Follows API override when set. */
export function getSocketUrl(): string {
  if (getApiBaseOverride()) {
    return getBackendOrigin();
  }
  const configuredSocket = (process.env.NEXT_PUBLIC_SOCKET_URL || '').trim();
  if (configuredSocket) {
    return stripTrailingSlash(configuredSocket);
  }
  const configured = process.env.NEXT_PUBLIC_API_URL || LOCAL_API;
  // Same-origin `/api` on the delivery host: connect to this origin; /socket.io is rewritten to shop.
  if (configured.startsWith('/') && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return getBackendOrigin();
}

/** @deprecated Use getBackendOrigin() */
export function getApiOrigin(): string {
  return getBackendOrigin();
}

export function getFrontendOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

/** PayHere redirect — uses BACKEND_URL from env. */
export function getPayhereCheckoutUrl(orderNumber: string, trackToken?: string): string {
  const returnOrigin = encodeURIComponent(getFrontendOrigin());
  const tokenQuery = trackToken ? `&t=${encodeURIComponent(trackToken)}` : '';
  return joinUrl(getApiBaseUrl(), `/payments/payhere/${encodeURIComponent(orderNumber)}?returnOrigin=${returnOrigin}${tokenQuery}`);
}

/** WebXPay redirect — backend auto-submit form POSTs to WebXPay. */
export function getWebxpayCheckoutUrl(orderNumber: string, trackToken?: string): string {
  const returnOrigin = encodeURIComponent(getFrontendOrigin());
  const tokenQuery = trackToken ? `&t=${encodeURIComponent(trackToken)}` : '';
  return joinUrl(getApiBaseUrl(), `/payments/webxpay/${encodeURIComponent(orderNumber)}?returnOrigin=${returnOrigin}${tokenQuery}`);
}

/** Default API base shown in the override dialog (current effective or local). */
export function getDefaultApiBaseForEditor(): string {
  return getApiBaseUrl() || LOCAL_API;
}
