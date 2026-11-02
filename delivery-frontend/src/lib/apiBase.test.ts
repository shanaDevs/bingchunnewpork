import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './apiBase';

describe('getApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps an absolute admin API URL in the browser', () => {
    vi.stubGlobal('window', { location: { origin: 'https://delivery.example' } });
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://admin.example/api');
    expect(getApiBaseUrl()).toBe('https://admin.example/api');
  });

  it('prefers injected admin API base over same-origin /api', () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://delivery.example' },
      __BC_ADMIN_API_BASE__: 'https://admin.example/api',
    });
    vi.stubEnv('NEXT_PUBLIC_API_URL', '/api');
    expect(getApiBaseUrl()).toBe('https://admin.example/api');
  });

  it('keeps an absolute URL for server-side calls', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://admin.example/api');
    expect(getApiBaseUrl()).toBe('https://admin.example/api');
  });
});
