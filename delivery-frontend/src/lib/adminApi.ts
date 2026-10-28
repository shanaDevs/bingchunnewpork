import { resolveAdminRequestUrl } from '@/lib/deliveryApi';
import { adminAuthHeaders, withAdminCredentials } from '@/lib/adminSession';

function resolveUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  return resolveAdminRequestUrl(endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
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

/** Multipart driver create/update (do not set Content-Type). */
export async function adminFetchForm(
  endpoint: string,
  formData: FormData,
  method: 'POST' | 'PATCH' = 'POST',
) {
  const res = await fetch(
    resolveUrl(endpoint),
    withAdminCredentials({
      method,
      headers: adminAuthHeaders(),
      body: formData,
    }),
  );
  let json: { success?: boolean; message?: string; data?: unknown };
  try {
    json = await res.json();
  } catch {
    throw new Error(res.ok ? 'Invalid server response' : `Upload failed (${res.status})`);
  }
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}
