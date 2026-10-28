import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/smsSettings', () => ({
  getSmsRuntimeConfig: vi.fn(),
}));

import { getSmsRuntimeConfig } from '../../src/lib/smsSettings';

const PROD_SECRETS: Record<string, string> = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  INTERNAL_SERVICE_SECRET: 'c'.repeat(32),
  DELIVERY_OTP_PEPPER: 'd'.repeat(32),
  DRIVER_PIN_PEPPER: 'e'.repeat(32),
  DATABASE_URL: 'postgresql://localhost/bingchun',
  SOCKET_AUTH_ENFORCED: 'true',
};

function stubProdEnv(extra: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({ ...PROD_SECRETS, ...extra })) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
}

describe('assertProductionSecrets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('requires REDIS_URL when REQUIRE_REDIS is true', async () => {
    stubProdEnv({ REQUIRE_REDIS: 'true', REDIS_URL: '' });
    const { assertProductionSecrets } = await import('../../src/lib/productionSecrets');
    expect(() => assertProductionSecrets()).toThrow(/REDIS_URL/);
  });

  it('passes with strong secrets and socket enforcement', async () => {
    stubProdEnv();
    const { assertProductionSecrets } = await import('../../src/lib/productionSecrets');
    expect(() => assertProductionSecrets()).not.toThrow();
  });
});

describe('assertProductionRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.mocked(getSmsRuntimeConfig).mockReset();
  });

  it('skips checks outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { assertProductionRuntimeConfig } = await import('../../src/lib/productionSecrets');
    await expect(assertProductionRuntimeConfig()).resolves.toBeUndefined();
    expect(getSmsRuntimeConfig).not.toHaveBeenCalled();
  });

  it('stays up when SMSlenz is not configured', async () => {
    stubProdEnv();
    vi.mocked(getSmsRuntimeConfig).mockResolvedValue({
      enabled: false,
      provider: 'mock',
      baseUrl: 'https://smslenz.lk',
      userId: '',
      apiKey: '',
      senderId: 'BingChun',
      connectionTimeoutMs: 30_000,
      readTimeoutMs: 30_000,
      configured: false,
    });
    const { assertProductionRuntimeConfig } = await import('../../src/lib/productionSecrets');
    await expect(assertProductionRuntimeConfig()).resolves.toBeUndefined();
  });

  it('accepts configured SMSlenz in production', async () => {
    stubProdEnv();
    vi.mocked(getSmsRuntimeConfig).mockResolvedValue({
      enabled: true,
      provider: 'smslenz',
      baseUrl: 'https://smslenz.lk',
      userId: 'u',
      apiKey: 'k',
      senderId: 'BingChun',
      connectionTimeoutMs: 30_000,
      readTimeoutMs: 30_000,
      configured: true,
    });
    const { assertProductionRuntimeConfig } = await import('../../src/lib/productionSecrets');
    await expect(assertProductionRuntimeConfig()).resolves.toBeUndefined();
  });
});
