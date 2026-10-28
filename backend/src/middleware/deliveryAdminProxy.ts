import type { Request } from 'express';
import { createDeliveryServiceProxy } from './deliveryProxy';
import { config } from '../config';

/** Admin paths served by delivery-service when `DELIVERY_ADMIN_SERVICE_ENABLED` is on. */
export function isAdminDeliveryServicePath(path: string): boolean {
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

const forwardProxy = createDeliveryServiceProxy(
  (req) => `/delivery-api/admin${req.url}`,
  {
    enabled: () => config.deliveryAdminServiceEnabled,
    forwardAdminSession: true,
  },
);

/** Proxies delivery admin APIs to delivery-service; falls through to in-process handlers when flag is off. */
export async function deliveryAdminServiceProxy(
  req: Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): Promise<void> {
  if (!config.deliveryAdminServiceEnabled) return next();
  if (!isAdminDeliveryServicePath(req.path)) return next();
  return forwardProxy(req, res, next);
}
