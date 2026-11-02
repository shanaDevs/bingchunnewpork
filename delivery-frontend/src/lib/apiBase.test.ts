import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './apiBase';

describe('getApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the page origin in the browser even when the admin API URL is absolute', () => {
    vi.stubGlobal('window', { location: { origin: 'https://delivery.example' } });
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://admin.example/api');
    expect(getApiBaseUrl()).toBe('https://delivery.example/api');
  });

  it('keeps an absolute URL for server-side calls', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://admin.example/api');
    expect(getApiBaseUrl()).toBe('https://admin.example/api');
  });
});
