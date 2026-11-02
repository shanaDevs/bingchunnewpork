import { describe, expect, it } from 'vitest';
import type { RequestHandler, Router } from 'express';
import orderRoutes from '../../src/routes/orders';
import { orderTrackRateLimiter } from '../../src/middleware/rateLimiter';

function getGetHandlers(router: Router, path: string): RequestHandler[] {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods.get);
  if (!layer?.route) return [];
  return layer.route.stack.map((entry) => entry.handle);
}

describe('orders guest track rate limit route wiring', () => {
  it('GET /:id still uses orderTrackRateLimiter (staff bypass is inside the limiter)', () => {
    const handlers = getGetHandlers(orderRoutes, '/:id');
    expect(handlers.length).toBeGreaterThan(1);
    expect(handlers[0]).toBe(orderTrackRateLimiter);
  });
});
