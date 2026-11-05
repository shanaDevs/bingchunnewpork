import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:4000/api',
}));

import {
  ADMIN_ACCESS_REFRESH_BUFFER_MS,
  ensureAdminAccessToken,
  getAdminAccessExpiry,
  getIdleTimeoutMs,
  installAdminFetch,
  refreshAdminSessionIfNeeded,
  saveAdminAuth,
} from '@/lib/adminSession';

const admin = {
  id: 'a1',
  name: 'Admin',
  email: 'a@example.com',
  role: 'STORE_MANAGER' as const,
};

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

function stubBrowserStorage() {
  const storage = createStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
}

describe('getIdleTimeoutMs', () => {
  it('disables idle auto-logout for all admin roles', () => {
    expect(getIdleTimeoutMs('SYSTEM_ADMIN')).toBeNull();
    expect(getIdleTimeoutMs('DELIVERY_ADMIN')).toBeNull();
    expect(getIdleTimeoutMs('STORE_MANAGER')).toBeNull();
    expect(getIdleTimeoutMs('CASHIER')).toBeNull();
  });
});

describe('saveAdminAuth', () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores access expiry metadata for proactive refresh', () => {
    const exp = Date.now() + 60_000;
    saveAdminAuth(admin, exp);
    expect(getAdminAccessExpiry()).toBe(exp);
  });
});

describe('ensureAdminAccessToken', () => {
  beforeEach(() => {
    stubBrowserStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips refresh when access expiry is outside the buffer', async () => {
    saveAdminAuth(admin, Date.now() + 30 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ok = await ensureAdminAccessToken();
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes when access expiry is inside the buffer', async () => {
    saveAdminAuth(admin, Date.now() + ADMIN_ACCESS_REFRESH_BUFFER_MS - 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            accessExpiresAt: Date.now() + 900_000,
            admin,
          },
        }),
      }),
    );

    const ok = await ensureAdminAccessToken();
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/admin/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

describe('installAdminFetch 401 retry', () => {
  beforeEach(() => {
    stubBrowserStorage();
    vi.stubGlobal('document', { cookie: '' });
    const storage = createStorage();
    vi.stubGlobal('window', {
      localStorage: storage,
      fetch: vi.fn(),
      __bcAdminFetch: false,
    });
    vi.stubGlobal('localStorage', storage);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes once and retries admin API calls on 401', async () => {
    saveAdminAuth(admin, Date.now() + ADMIN_ACCESS_REFRESH_BUFFER_MS - 1000);

    const originalFetch = vi.fn();
    const win = window as Window & { __bcAdminFetch?: boolean };
    win.fetch = originalFetch as typeof fetch;
    win.__bcAdminFetch = false;
    let walletCalls = 0;
    originalFetch.mockImplementation((url: string) => {
      if (String(url).includes('/auth/admin/refresh')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              accessExpiresAt: Date.now() + 900_000,
              admin,
            },
          }),
        });
      }
      if (String(url).includes('/admin/wallet')) {
        walletCalls += 1;
        if (walletCalls === 1) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', originalFetch);

    installAdminFetch();

    const res = await window.fetch('http://localhost:4000/api/admin/wallet');
    expect(res.ok).toBe(true);
    expect(walletCalls).toBe(2);
    expect(originalFetch.mock.calls.filter((c) => String(c[0]).includes('/refresh')).length).toBe(1);
  });
});

describe('refreshAdminSessionIfNeeded single-flight', () => {
  beforeEach(() => {
    stubBrowserStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deduplicates concurrent refresh attempts', async () => {
    saveAdminAuth(admin, Date.now() + 1000);
    let refreshCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        refreshCalls += 1;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              accessExpiresAt: Date.now() + 900_000,
              admin,
            },
          }),
        });
      }),
    );

    const [a, b] = await Promise.all([refreshAdminSessionIfNeeded(), refreshAdminSessionIfNeeded()]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(refreshCalls).toBe(1);
  });
});
