/** Sub-path under `/admin` routed to delivery-service (mirrors core `isAdminDeliveryServicePath`). */
export function isDeliveryAdminServiceSubPath(adminSubPath: string): boolean {
  const path = adminSubPath.startsWith('/') ? adminSubPath : `/${adminSubPath}`;
  if (path === '/health' || path.startsWith('/health/')) return true;
  if (path.startsWith('/delivery')) return true;
  if (path.startsWith('/delivery-jobs')) return true;
  if (path.startsWith('/delivery-wallet')) return true;
  if (path.startsWith('/delivery-dashboard')) return true;
  if (path.startsWith('/delivery-failures')) return true;
  if (path.startsWith('/drivers')) return true;
  if (path.startsWith('/driver-analytics')) return true;
  if (path.startsWith('/driver-complaints')) return true;
  if (path.startsWith('/driver-branch-requests')) return true;
  if (path.startsWith('/live-drivers')) return true;
  if (/^\/branches\/[^/]+\/driver-pool/.test(path)) return true;
  if (path.startsWith('/stores/delivery-access')) return true;
  if (/^\/stores\/[^/]+\/delivery-access/.test(path)) return true;
  if (path.startsWith('/reports/monthly-delivery-orders')) return true;
  return false;
}

/** True when this admin API path should hit delivery-service `/delivery-api/admin/*`. */
export function isDeliveryAdminEndpoint(endpoint: string): boolean {
  const [pathOnly] = endpoint.split('?');
  const path = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  if (!path.startsWith('/admin/') && path !== '/admin') return false;
  const sub = path === '/admin' ? '/' : path.slice('/admin'.length);
  return isDeliveryAdminServiceSubPath(sub);
}
