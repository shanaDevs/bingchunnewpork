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
 * Delivery ops console: delivery admin APIs go to `/delivery-api/admin/...`.
 * Set `NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true` to force core `/api/admin/...` (e.g. debugging).
 */
export function resolveAdminRequestUrl(endpoint: string): string {
  const qIndex = endpoint.indexOf('?');
  const path = qIndex >= 0 ? endpoint.slice(0, qIndex) : endpoint;
  const qs = qIndex >= 0 ? endpoint.slice(qIndex) : '';
  const normalized = path.startsWith('/') ? path : `/${path}`;

  const viaCore =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE === 'true';

  if (!viaCore && isDeliveryAdminEndpoint(normalized)) {
    return `${getDeliveryApiBaseUrl()}${normalized}${qs}`;
  }
  return `${getCoreApiBaseUrl()}${normalized}${qs}`;
}
