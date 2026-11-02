import { describe, expect, it } from 'vitest';
import type { RequestHandler, Router } from 'express';
import authRoutes from '../../src/routes/auth';
import { refreshRateLimiter } from '../../src/middleware/rateLimiter';

function getPostHandlers(router: Router, path: string): RequestHandler[] {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods.post,
  );
  if (!layer?.route) return [];
  return layer.route.stack.map((entry) => entry.handle);
}

describe('auth refresh rate limit route wiring', () => {
  it('POST /refresh uses refreshRateLimiter as the first handler', () => {
    const handlers = getPostHandlers(authRoutes, '/refresh');
    expect(handlers.length).toBeGreaterThan(1);
    expect(handlers[0]).toBe(refreshRateLimiter);
  });

  it('POST /admin/refresh uses refreshRateLimiter as the first handler', () => {
    const handlers = getPostHandlers(authRoutes, '/admin/refresh');
    expect(handlers.length).toBeGreaterThan(1);
    expect(handlers[0]).toBe(refreshRateLimiter);
  });
});
