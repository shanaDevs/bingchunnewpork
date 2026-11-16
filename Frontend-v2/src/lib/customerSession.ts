'use client';

import { getApiBaseUrl } from './apiBase';

const LEGACY_TOKEN_KEY = 'bc_token';
const LEGACY_REFRESH_KEY = 'bc_refresh';
const USER_KEY = 'bc_user';
const ACCESS_EXP_KEY = 'bc_customer_access_exp';

export const CUSTOMER_ACCESS_REFRESH_BUFFER_MS = 2 * 60 * 1000;

export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)bc_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Cookie-based customer API calls — no Authorization header required. */
export function customerAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Auth-Transport': 'cookie',
    ...extra,
  };
  const csrf = readCsrfCookie();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return headers;
}

export function getToken(): string | null {
  return null;
}

export function setToken(_token: string) {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function setRefreshToken(_refreshToken: string) {
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

export function clearToken() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCESS_EXP_KEY);
  if (typeof window !== 'undefined') {
    const csrf = readCsrfCookie();
    void fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf, 'X-Auth-Transport': 'cookie' } : { 'X-Auth-Transport': 'cookie' },
    }).catch(() => undefined);
  }
}

export function setUser(user: unknown) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getCustomerRefreshToken(): string | null {
  return null;
}

export function getCustomerAccessExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ACCESS_EXP_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function saveCustomerAuth(user: unknown, accessExpiresAt?: number | null) {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  setUser(user);
  if (accessExpiresAt) {
    localStorage.setItem(ACCESS_EXP_KEY, String(accessExpiresAt));
  } else {
    localStorage.removeItem(ACCESS_EXP_KEY);
  }
}

function accessNeedsRefresh(): boolean {
  const exp = getCustomerAccessExpiry();
  // Missing expiry (legacy / non-expiring): skip proactive refresh; 401 retry
  // still rotates via refreshCustomerAuth.
  if (!exp) return false;
  return exp - Date.now() < CUSTOMER_ACCESS_REFRESH_BUFFER_MS;
}

export function isCustomerAccessTokenValid(): boolean {
  const user = getStoredUser();
  if (!user) return false;
  const exp = getCustomerAccessExpiry();
  if (!exp) return true;
  return exp > Date.now();
}

export async function refreshCustomerAuth(): Promise<void> {
  const csrf = readCsrfCookie();
  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Transport': 'cookie',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message || 'Session expired');

  const payload = json.data as { accessExpiresAt?: number } | undefined;
  if (payload?.accessExpiresAt) {
    localStorage.setItem(ACCESS_EXP_KEY, String(payload.accessExpiresAt));
  } else {
    localStorage.removeItem(ACCESS_EXP_KEY);
  }

  const { useAuthStore } = await import('@/store/authStore');
  useAuthStore.setState({ isAuthenticated: true });
}

/**
 * Keep the customer session alive via refresh token (Facebook-style).
 * Access may expire; refresh rotation renews it. Only logout when refresh fails.
 */
export async function ensureCustomerAccessToken(): Promise<boolean> {
  if (!getStoredUser()) {
    return true;
  }

  if (!accessNeedsRefresh()) return true;

  try {
    await refreshCustomerAuth();
    return true;
  } catch {
    return false;
  }
}
