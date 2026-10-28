import type { Request } from 'express';
import { config } from '../config';
import { resolveFrontendUrl, getEffectiveFrontendUrl, CUSTOMER_SHOP_URL, isProductionDeployment } from './resolveFrontendUrl';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Collapse duplicate slashes while preserving `https://`. */
export function normalizeUrlPath(url: string): string {
  return url.replace(/([^:]\/)\/+/g, '$1');
}

export function joinUrlPath(base: string, pathname: string): string {
  const root = stripTrailingSlash(base);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalizeUrlPath(`${root}${path}`);
}

const PRODUCTION_BACKEND_ORIGIN = 'https://bing-chung-b.mp.dartcodes.com';
const PRODUCTION_FRONTEND_HOST = 'bing-chung.mp.dartcodes.com';

/** Public API origin (never the Next.js storefront). */
export function serverRootUrl(): string {
  let root = stripTrailingSlash(config.apiBaseUrl.replace(/\/api\/?$/, ''));
  try {
    const host = new URL(root.includes('://') ? root : `https://${root}`).hostname;
    if (host === PRODUCTION_FRONTEND_HOST) return PRODUCTION_BACKEND_ORIGIN;
    if (host.endsWith('.mp.dartcodes.com') && !host.includes('-b.')) {
      return `https://${host.replace(/\.mp\.dartcodes\.com$/i, '-b.mp.dartcodes.com')}`;
    }
  } catch {
    /* keep parsed root */
  }
  if (!root || root.startsWith('/') || /localhost|127\.0\.0\.1/i.test(root)) {
    if (PRODUCTION_FRONTEND_HOST) {
      try {
        const fe = new URL(config.frontendUrl);
        if (fe.hostname === PRODUCTION_FRONTEND_HOST) return PRODUCTION_BACKEND_ORIGIN;
      } catch {
        /* ignore */
      }
    }
  }
  return root || PRODUCTION_BACKEND_ORIGIN;
}

export function payhereNotifyUrl(): string {
  return joinUrlPath(serverRootUrl(), '/api/orders/payment-notify');
}

/** PayHere redirects here after checkout; we verify, mark paid, then send user to the order page. */
export function buildPayhereReturnUrl(req: Request, orderNumber: string, frontendBase?: string): string {
  const frontend = frontendBase ?? resolveFrontendUrl(req);
  const origin = encodeURIComponent(frontend);
  return `${joinUrlPath(serverRootUrl(), `/api/payments/payhere-return/${encodeURIComponent(orderNumber)}`)}?returnOrigin=${origin}`;
}

/**
 * WebXPay redirects here after checkout — set this URL in WebXPay Dashboard → Settings → Return URL.
 * The query must include `returnOrigin` pointing at the Next.js storefront (e.g. `http://localhost:3000`),
 * not the API host (`http://localhost:4000`). After payment, the API redirects to `{returnOrigin}/order/...`.
 * Regenerate via this helper whenever `FRONTEND_URL` changes; the server ignores a self-referential API origin.
 */
export function webxpayReturnUrl(): string {
  const shop = isProductionDeployment() ? CUSTOMER_SHOP_URL : getEffectiveFrontendUrl();
  const origin = encodeURIComponent(shop);
  return `${joinUrlPath(serverRootUrl(), '/api/payments/webxpay-return')}?returnOrigin=${origin}`;
}

export function webxpayCheckoutPageUrl(orderNumber: string, frontendOrigin?: string): string {
  const frontend = frontendOrigin || getEffectiveFrontendUrl();
  const origin = encodeURIComponent(frontend);
  return `${joinUrlPath(serverRootUrl(), `/api/payments/webxpay/${encodeURIComponent(orderNumber)}`)}?returnOrigin=${origin}`;
}
