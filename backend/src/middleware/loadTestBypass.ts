import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const bypassKey = (process.env.LOAD_TEST_BYPASS_KEY || '').trim();

let bypassLogged = false;

/** Fail-closed bypass for controlled load tests — requires x-load-test-key header. */
function isLoadTestRequest(req: Request): boolean {
  if (!bypassKey || bypassKey.length < 32) return false;
  const header = req.get('x-load-test-key');
  if (!header || header.length !== bypassKey.length) return false;
  try {
    const ok = timingSafeEqual(Buffer.from(header), Buffer.from(bypassKey));
    if (ok && !bypassLogged) {
      bypassLogged = true;
      console.warn('[rateLimiter] Load-test bypass active for matching x-load-test-key');
    }
    return ok;
  } catch {
    return false;
  }
}

export function shouldSkipRateLimit(req: Request): boolean {
  const path = req.path || '';
  if (
    path.includes('/whatsapp/webhook') ||
    path.includes('/telegram/webhook') ||
    path === '/health'
  ) {
    return true;
  }
  return isLoadTestRequest(req);
}
