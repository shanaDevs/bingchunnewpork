'use client';

import { getApiBaseUrl } from './apiBase';

const TOKEN_KEY = 'bc_token';
const REFRESH_KEY = 'bc_refresh';
const USER_KEY = 'bc_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setRefreshToken(refreshToken: string) {
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
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
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isCustomerAccessTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  const exp = getTokenExpiryMs(token);
  if (!exp) return true;
  return exp > Date.now();
}

export async function refreshCustomerAuth(): Promise<string> {
  const refreshToken = getCustomerRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Session expired');

  const { token, refreshToken: newRefresh } = json.data as {
    token: string;
    refreshToken?: string;
  };

  setToken(token);
  if (newRefresh) setRefreshToken(newRefresh);

  const { useAuthStore } = await import('@/store/authStore');
  useAuthStore.setState({ token, isAuthenticated: true });

  return token;
}

/** Refresh access token when missing, expired, or about to expire. */
export async function ensureCustomerAccessToken(): Promise<boolean> {
  const refreshToken = getCustomerRefreshToken();
  const token = getToken();
  if (!token && !refreshToken) return false;

  const exp = token ? getTokenExpiryMs(token) : null;
  const needsRefresh = !token || (exp != null && exp - Date.now() < 2 * 60 * 1000);

  if (!needsRefresh) return true;
  if (!refreshToken) return !!token && exp == null;

  try {
    await refreshCustomerAuth();
    return true;
  } catch {
    return false;
  }
}
