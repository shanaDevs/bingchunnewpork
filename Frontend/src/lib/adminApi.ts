import { getApiBaseUrl } from '@/lib/apiBase';
import { adminAuthHeaders, withAdminCredentials } from '@/lib/adminSession';

function resolveUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${getApiBaseUrl()}${path}`;
}

/** Full JSON body after success check (`{ success, data, meta, ... }`). */
export async function adminApiJson(
  endpoint: string,
  init?: RequestInit,
): Promise<Record<string, unknown> & { success?: boolean; data?: unknown; message?: string }> {
  const headers = new Headers(adminAuthHeaders({ 'Content-Type': 'application/json' }));
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  const res = await fetch(resolveUrl(endpoint), withAdminCredentials({ ...init, headers }));

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    success?: boolean;
    message?: string;
  };

  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Request failed');
  }

  return json;
}

/** Unwrapped `data` payload (or the whole body when `data` is absent). */
export async function adminApiFetch<T = unknown>(endpoint: string, init?: RequestInit): Promise<T> {
  const json = await adminApiJson(endpoint, init);
  if (json.data !== undefined) return json.data as T;
  return json as T;
}

/** Standard admin envelope `{ success, data }` used across delivery ops pages. */
export async function adminFetch(
  endpoint: string,
  options?: RequestInit,
): Promise<{ success?: boolean; data?: unknown; message?: string } & Record<string, unknown>> {
  const headers = adminAuthHeaders({
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  });
  const res = await fetch(
    resolveUrl(endpoint),
    withAdminCredentials({
      ...options,
      headers,
    }),
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Request failed');
  }
  return json;
}
