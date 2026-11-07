import { adminAuthHeaders, withAdminCredentials } from '@/lib/adminSession';

/**
 * Pre-checks the signed-in admin password against POST /admin/verify-pin.
 * The same password must still be sent on the mutating request.
 */
export async function verifyWalletPin(apiBase: string, password: string): Promise<void> {
  const res = await fetch(
    `${apiBase}/admin/verify-pin`,
    withAdminCredentials({
      method: 'POST',
      headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password }),
    }),
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Invalid PIN');
  }
}
