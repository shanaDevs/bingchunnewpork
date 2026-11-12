import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

const PROXY_TIMEOUT_MS = 15_000;

/** Driver complaint/branch-request writes stay on core when the DS is slow or DB-flaky. */
const CORE_ONLY_PREFIXES = ['/me/complaints', '/me/branch-requests', '/me/notifications'];

export type DeliveryProxyOptions = {
  /** When omitted, uses `DELIVERY_SERVICE_ENABLED`. */
  enabled?: () => boolean;
  /** Forward admin cookies and CSRF for httpOnly session auth. */
  forwardAdminSession?: boolean;
};

/** Builds proxy middleware that forwards to the delivery service when the
 *  `DELIVERY_SERVICE_ENABLED` flag is on, and is a no-op passthrough otherwise —
 *  so the legacy in-process routes keep working unchanged by default. */
export function createDeliveryServiceProxy(
  targetPath: (req: Request) => string,
  options: DeliveryProxyOptions = {},
) {
  const isEnabled = options.enabled ?? (() => config.deliveryServiceEnabled);

  return async function deliveryServiceProxy(req: Request, res: Response, next: NextFunction) {
    if (!isEnabled()) return next();
    if (CORE_ONLY_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

    try {
      const targetUrl = `${config.deliveryServiceUrl}${targetPath(req)}`;
      const requestContentType = req.headers['content-type'] || '';
      const isMultipart = requestContentType.includes('multipart/form-data');
      const headers: Record<string, string> = {};
      if (!isMultipart) headers['Content-Type'] = 'application/json';
      else if (requestContentType) headers['Content-Type'] = requestContentType;

      if (req.headers.authorization) headers.authorization = req.headers.authorization as string;
      if (options.forwardAdminSession) {
        if (req.headers.cookie) headers.cookie = req.headers.cookie as string;
        const csrf = req.headers['x-csrf-token'];
        if (csrf) headers['x-csrf-token'] = String(csrf);
      }

      const init: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      };
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (isMultipart && req.readable) {
          const { Readable } = await import('stream');
          const streamingInit = init as RequestInit & { duplex?: 'half' };
          streamingInit.body = Readable.toWeb(req) as unknown as RequestInit['body'];
          streamingInit.duplex = 'half';
        } else if (req.body && Object.keys(req.body).length > 0) {
          init.body = JSON.stringify(req.body);
        }
      }

      const upstream = await fetch(targetUrl, init);
      const text = await upstream.text();

      res.status(upstream.status);
      const responseContentType = upstream.headers.get('content-type');
      if (responseContentType) res.setHeader('content-type', responseContentType);
      res.send(text);
    } catch (err) {
      logger.error('Delivery service proxy error', err);
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      res.status(502).json({
        success: false,
        message: timedOut ? 'Delivery service timed out' : 'Delivery service unavailable',
      });
    }
  };
}

/** Preserves the request path/query as-is under `/delivery-api` — for routers
 *  mounted at `/api/delivery/*` where the delivery service exposes the identical
 *  sub-path (e.g. `/jobs/:id/assign`). */
export const deliveryProxy = createDeliveryServiceProxy((req) => `/delivery-api${req.url}`);
