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
 * Route delivery admin APIs through shop/core `/api/admin/*` instead of `/delivery-api`.
 * Default is core (shop). Opt out only with NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=false
 * for local dual-backend CapRover-style setups.
 */
export function deliveryAdminViaCore(): boolean {
  if (process.env.NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE === 'false') return false;
  if (process.env.DELIVERY_ADMIN_VIA_CORE === 'false') return false;
  return true;
}

/**
 * Delivery ops console: always prefer shop/core `/api/admin/...` unless via-core is opted out.
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
