import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:3100/api',
}));

vi.mock('@/lib/deliveryApi', () => ({
  getDeliveryApiBaseUrl: () => '/delivery-api',
}));

import { installAdminFetch, withAdminCredentials } from '@/lib/adminSession';

describe('installAdminFetch delivery-api CSRF', () => {
  let originalFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('document', { cookie: 'bc_csrf=delivery-csrf-token' });
    vi.stubGlobal('window', {
      fetch: originalFetch,
      __bcAdminFetch: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends X-CSRF-Token on POST to /delivery-api admin routes', async () => {
    const win = window as Window & { __bcAdminFetch?: boolean };
    win.__bcAdminFetch = false;
    installAdminFetch();

    await window.fetch('/delivery-api/admin/delivery-wallet/unlock', {
      method: 'POST',
      body: '{}',
    });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const init = originalFetch.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBe('delivery-csrf-token');
    expect(init.credentials).toBe('include');
  });
});

describe('withAdminCredentials', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: 'bc_csrf=wallet-csrf-token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds X-CSRF-Token on POST without installAdminFetch', () => {
    const init = withAdminCredentials({ method: 'POST', body: '{}' });
    const headers = new Headers(init.headers);
    expect(headers.get('X-CSRF-Token')).toBe('wallet-csrf-token');
    expect(init.credentials).toBe('include');
  });
});
