import { getApiBaseUrl } from '@/lib/apiBase';
import {
  clearToken,
  ensureCustomerAccessToken,
  getToken,
  isCustomerAccessTokenValid,
  refreshCustomerAuth,
  setRefreshToken,
  setToken,
  setUser,
  getStoredUser,
} from '@/lib/customerSession';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export { clearToken, setToken, setRefreshToken, setUser, getStoredUser };

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshCustomerToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      await refreshCustomerAuth();
      return true;
    } catch {
      clearToken();
      const { useAuthStore } = await import('@/store/authStore');
      useAuthStore.getState().logout();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  authenticated = false,
  allowRetry = true,
): Promise<T> {
  if (authenticated && typeof window !== 'undefined') {
    await ensureCustomerAccessToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authenticated && isCustomerAccessTokenValid()) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Cannot reach server. Is the API running on port 4000?', 0);
  }

  if (authenticated && res.status === 401 && allowRetry) {
    const refreshed = await tryRefreshCustomerToken();
    if (refreshed) {
      return request<T>(endpoint, options, authenticated, false);
    }
  }

  let data: { data?: T; message?: string; code?: string };
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.ok ? 'Invalid response from server' : `Request failed (${res.status})`, res.status);
  }

  if (!res.ok) {
    throw new ApiError(data.message || 'Request failed', res.status, data.code);
  }

  return data.data as T;
}

export const api = {
  get: <T>(endpoint: string, auth = false) => request<T>(endpoint, { method: 'GET' }, auth),
  post: <T>(endpoint: string, body: unknown, auth = false, extraHeaders?: Record<string, string>) =>
    request<T>(
      endpoint,
      { method: 'POST', body: JSON.stringify(body), headers: extraHeaders },
      auth,
    ),
  put: <T>(endpoint: string, body: unknown, auth = false) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }, auth),
  patch: <T>(endpoint: string, body: unknown, auth = false) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }, auth),
  delete: <T>(endpoint: string, auth = false) => request<T>(endpoint, { method: 'DELETE' }, auth),
};
