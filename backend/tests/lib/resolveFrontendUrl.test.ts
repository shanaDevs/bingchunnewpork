import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

function mockRequest(overrides: {
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): Request {
  return {
    query: overrides.query ?? {},
    headers: overrides.headers ?? {},
  } as Request;
}

describe('resolveFrontendUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects returnOrigin equal to the API origin and falls back to FRONTEND_URL', async () => {
    vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();

    const { resolveFrontendUrl } = await import('../../src/lib/resolveFrontendUrl');
    const req = mockRequest({ query: { returnOrigin: 'http://localhost:4000' } });

    expect(resolveFrontendUrl(req)).toBe('http://localhost:3000');
  });

  it('accepts returnOrigin for the Next.js storefront when API is on another port', async () => {
    vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();

    const { resolveFrontendUrl } = await import('../../src/lib/resolveFrontendUrl');
    const req = mockRequest({ query: { returnOrigin: 'http://localhost:3000' } });

    expect(resolveFrontendUrl(req)).toBe('http://localhost:3000');
  });

  it('rejects Origin header pointing at the API host', async () => {
    vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();

    const { resolveFrontendUrl } = await import('../../src/lib/resolveFrontendUrl');
    const req = mockRequest({ headers: { origin: 'http://localhost:4000' } });

    expect(resolveFrontendUrl(req)).toBe('http://localhost:3000');
  });
});

describe('isAllowedFrontendOrigin (via isCorsAllowedOrigin)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not treat the API origin as an allowed frontend CORS origin', async () => {
    vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();

    const { isCorsAllowedOrigin } = await import('../../src/lib/resolveFrontendUrl');

    expect(isCorsAllowedOrigin('http://localhost:4000')).toBe(false);
    expect(isCorsAllowedOrigin('http://localhost:3000')).toBe(true);
  });
});
