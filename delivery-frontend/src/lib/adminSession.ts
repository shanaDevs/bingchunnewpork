'use client';

import type { AdminSession } from './adminAuth';
import { getAdminSession } from './adminAuth';
import { getApiBaseUrl } from './apiBase';
import { getDeliveryApiBaseUrl } from './deliveryApi';

/** Idle auto-logout disabled — sessions stay alive via access/refresh token rotation. */
export const ADMIN_IDLE_TIMEOUT_MS: number | null = null;
export const ADMIN_ACCESS_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const ADMIN_ACCESS_EXP_KEY = 'bc_admin_access_exp';
const ADMIN_CSRF_STORAGE_KEY = 'bc_admin_csrf';
const ADMIN_REFRESH_LOCK = 'bc-admin-refresh';

export class AdminRefreshError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RefreshOutcome = 'ok' | 'auth_failed' | 'retryable_failed';

let refreshInFlight: Promise<RefreshOutcome> | null = null;
let forceLogoutHandler: ((reason: string) => void) | null = null;

export function registerAdminForceLogoutHandler(handler: (reason: string) => void): void {
  forceLogoutHandler = handler;
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bc_admin_token');
}

export function getAdminRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bc_admin_refresh');
}

export function getAdminAccessExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ADMIN_ACCESS_EXP_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAdminAccessTokenValid(): boolean {
  const exp = getAdminAccessExpiry();
  if (!exp) return !!getAdminSession();
  return exp > Date.now();
}

/** Cookie-based admin API calls — no Authorization header required. */
export function adminAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra };
}

/** CSRF available via same-origin cookie or stored token (cross-origin shop API). */
export function hasAdminCsrfCookie(): boolean {
  return readCsrfToken() != null;
}

/** Persist CSRF from login/refresh body when the shop cookie is not readable cross-origin. */
export function saveAdminCsrfToken(csrfToken: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const value = csrfToken?.trim();
  if (!value) return;
  localStorage.setItem(ADMIN_CSRF_STORAGE_KEY, value);
}

/** Merge optional fetch init with cookie credentials and admin header defaults. */
export function withAdminCredentials(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(adminAuthHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const csrf = readCsrfToken();
  if (csrf && method !== 'GET' && method !== 'HEAD' && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrf);
  }
  return { ...init, credentials: 'include', headers };
}

export function getIdleTimeoutMs(_role?: string): number | null {
  return ADMIN_IDLE_TIMEOUT_MS;
}

function isAdminIdleExceeded(): boolean {
  const session = getAdminSession();
  if (!session) return false;
  const limit = getIdleTimeoutMs(session.role);
  if (!limit) return false;
  const lastActivity = getAdminLastActivity();
  if (!lastActivity) return false;
  return Date.now() - lastActivity > limit;
}

function accessNeedsRefresh(): boolean {
  const exp = getAdminAccessExpiry();
  if (!exp) return true;
  return exp - Date.now() < ADMIN_ACCESS_REFRESH_BUFFER_MS;
}

function persistAccessExpiry(accessExpiresAt?: number | null, token?: string) {
  const exp = accessExpiresAt ?? (token ? getTokenExpiryMs(token) : null);
  if (exp) localStorage.setItem(ADMIN_ACCESS_EXP_KEY, String(exp));
}

export function saveAdminAuth(admin: AdminSession, accessExpiresAt?: number | null) {
  localStorage.removeItem('bc_admin_token');
  localStorage.removeItem('bc_admin_refresh');
  localStorage.setItem('bc_admin', JSON.stringify(admin));
  localStorage.setItem('bc_admin_last_activity', String(Date.now()));
  persistAccessExpiry(accessExpiresAt);
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)bc_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function readStoredCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ADMIN_CSRF_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function readCsrfToken(): string | null {
  return readCsrfCookie() || readStoredCsrfToken();
}

function isApiUrl(url: string): boolean {
  const api = getApiBaseUrl();
  const deliveryApi = getDeliveryApiBaseUrl();
  if (url.startsWith(api) || url.includes('/api/')) return true;
  if (url.includes('/delivery-api/')) return true;
  if (deliveryApi.startsWith('http') && url.startsWith(deliveryApi)) return true;
  return false;
}

function isAdminAuthRoute(url: string): boolean {
  return /\/auth\/admin\/(login|refresh|logout|password\/)/.test(url);
}

function hasValidBearerJwt(headers: Headers): boolean {
  const auth = headers.get('Authorization') || '';
  const raw = auth.replace(/^Bearer\s+/i, '');
  return raw.split('.').length === 3;
}

function bodyIsReplayable(body: BodyInit | null | undefined): boolean {
  if (body == null) return true;
  if (typeof body === 'string') return true;
  if (body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer) return true;
  return false;
}

async function doRefreshAdminAuth(): Promise<RefreshOutcome> {
  if (getAdminSession() && !accessNeedsRefresh()) return 'ok';
  try {
    await refreshAdminAuth();
    return 'ok';
  } catch (err) {
    if (err instanceof AdminRefreshError && (err.status === 401 || err.status === 403)) {
      return 'auth_failed';
    }
    return 'retryable_failed';
  }
}

async function withRefreshLock(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(ADMIN_REFRESH_LOCK, task);
  }
  return task();
}

/** Single-flight refresh shared by interceptor and keep-alive. Cookie sessions can refresh before localStorage has a profile. */
export async function refreshAdminSessionIfNeeded(): Promise<RefreshOutcome> {
  if (getAdminSession() && !accessNeedsRefresh()) return 'ok';

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = withRefreshLock(async () => {
    if (getAdminSession() && !accessNeedsRefresh()) return 'ok';
    return doRefreshAdminAuth();
  }).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export function forceAdminLogout(reason: string): void {
  clearAdminAuth();
  if (forceLogoutHandler) {
    forceLogoutHandler(reason);
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}

/** Attach cookie credentials, CSRF header, and 401 refresh-and-retry for admin API calls. */
export function installAdminFetch(): void {
  if (typeof window === 'undefined' || (window as Window & { __bcAdminFetch?: boolean }).__bcAdminFetch) return;
  (window as Window & { __bcAdminFetch?: boolean }).__bcAdminFetch = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!isApiUrl(url)) return original(input, init);

    const baseHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const auth = baseHeaders.get('Authorization') || '';
    const raw = auth.replace(/^Bearer\s+/i, '');
    if (auth && raw.split('.').length !== 3) baseHeaders.delete('Authorization');

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const csrf = readCsrfToken();
    if (csrf && method !== 'GET' && method !== 'HEAD') baseHeaders.set('X-CSRF-Token', csrf);

    const retried = (init as RequestInit & { _bcAdminRetried?: boolean })?._bcAdminRetried === true;
    const send = (retryInit?: RequestInit & { _bcAdminRetried?: boolean }) =>
      original(input, {
        ...init,
        ...retryInit,
        headers: retryInit?.headers ?? baseHeaders,
        credentials: 'include',
      });

    const response = await send();

    if (
      response.status !== 401 ||
      retried ||
      isAdminAuthRoute(url) ||
      hasValidBearerJwt(baseHeaders) ||
      !getAdminSession()
    ) {
      return response;
    }

    if (!bodyIsReplayable(init?.body ?? (input instanceof Request ? input.body : null))) {
      return response;
    }

    const outcome = await refreshAdminSessionIfNeeded();
    if (outcome === 'ok') {
      return send({ _bcAdminRetried: true });
    }
    if (outcome === 'auth_failed') {
      forceAdminLogout('Session expired. Please sign in again.');
    }
    return response;
  };
}

export function touchAdminActivity() {
  if (typeof window === 'undefined') return;
  if (!getAdminSession()) return;
  localStorage.setItem('bc_admin_last_activity', String(Date.now()));
}

export function getAdminLastActivity(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem('bc_admin_last_activity');
  return raw ? Number(raw) : 0;
}

export function clearAdminAuth() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('bc_delivery_wallet_unlock');
  }
  localStorage.removeItem('bc_admin_token');
  localStorage.removeItem('bc_admin_refresh');
  localStorage.removeItem('bc_admin');
  localStorage.removeItem('bc_admin_last_activity');
  localStorage.removeItem(ADMIN_ACCESS_EXP_KEY);
  localStorage.removeItem(ADMIN_CSRF_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    const csrf = readCsrfToken();
    void fetch(`${getApiBaseUrl()}/auth/admin/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }).catch(() => undefined);
  }
}

export async function refreshAdminAuth(): Promise<AdminSession> {
  const refreshToken = getAdminRefreshToken();
  const csrf = readCsrfToken();

  const res = await fetch(`${getApiBaseUrl()}/auth/admin/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminRefreshError((json as { message?: string }).message || 'Session expired', res.status);
  }

  const payload = json.data as {
    admin?: AdminSession;
    accessExpiresAt?: number;
    csrfToken?: string;
  } | undefined;

  if (!payload?.admin?.role) {
    throw new AdminRefreshError('Unexpected refresh response from server', res.status);
  }

  saveAdminAuth(payload.admin, payload.accessExpiresAt ?? null);
  saveAdminCsrfToken(payload.csrfToken);
  return payload.admin;
}

export async function ensureAdminAccessToken(): Promise<boolean> {
  if (!getAdminSession()) return false;

  if (isAdminIdleExceeded()) {
    clearAdminAuth();
    return false;
  }

  if (!accessNeedsRefresh()) {
    touchAdminActivity();
    return true;
  }

  const outcome = await refreshAdminSessionIfNeeded();
  if (outcome === 'ok') {
    touchAdminActivity();
    return true;
  }
  if (outcome === 'auth_failed') {
    clearAdminAuth();
    return false;
  }
  return isAdminAccessTokenValid();
}

/** Refresh the access token if needed. Cookie sessions do not expose a JWT to JavaScript. */
export async function getValidAdminAccessToken(): Promise<string> {
  const ok = await ensureAdminAccessToken();
  if (!ok) throw new Error('Session expired');
  return getAdminToken() || '';
}

export { adminApiFetch, adminApiJson } from './adminApi';
