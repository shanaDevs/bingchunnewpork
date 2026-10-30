import { getApiBaseUrl } from './apiBase';
import { isDeliveryAdminEndpoint } from './deliveryAdminPaths';

/** Delivery-service API (same-origin rewrite → :4100). */
export function getDeliveryApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_DELIVERY_API_URL || '/delivery-api';
  }
  return '/delivery-api';
}

/** Core backend — auth, stores, notifications, permissions. */
export function getCoreApiBaseUrl(): string {
  return getApiBaseUrl();
}

/**
 * Route delivery admin list/detail APIs through shop `/api/admin/*` instead of `/delivery-api`.
 * Used when App Platform ingress still sends `/delivery-api` to Engine.IO (Transport unknown),
 * and for explicit debugging via `NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true`.
 */
export function deliveryAdminViaCore(): boolean {
  if (process.env.NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE === 'true') return true;
  if (process.env.DELIVERY_ADMIN_VIA_CORE === 'true') return true;
  if (typeof window !== 'undefined' && /\.ondigitalocean\.app$/i.test(window.location.hostname)) {
    return true;
  }
  return false;
}

/**
 * Delivery ops console: delivery admin APIs go to `/delivery-api/admin/...`.
 * Set `NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true` to force core `/api/admin/...` (e.g. debugging).
 */
export function resolveAdminRequestUrl(endpoint: string): string {
  const qIndex = endpoint.indexOf('?');
  const path = qIndex >= 0 ? endpoint.slice(0, qIndex) : endpoint;
  const qs = qIndex >= 0 ? endpoint.slice(qIndex) : '';
  const normalized = path.startsWith('/') ? path : `/${path}`;

  const viaCore = deliveryAdminViaCore();

  if (!viaCore && isDeliveryAdminEndpoint(normalized)) {
    return `${getDeliveryApiBaseUrl()}${normalized}${qs}`;
  }
  return `${getCoreApiBaseUrl()}${normalized}${qs}`;
}
