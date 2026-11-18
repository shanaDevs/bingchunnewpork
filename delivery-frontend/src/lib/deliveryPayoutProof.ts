import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import { openAdminProtectedFile } from '@/lib/adminProtectedFile';

/** Fetch a presigned (or legacy) proof URL and open it in a new tab. */
export async function openDeliveryPayoutProof(
  payoutId: string,
  unlockToken: string,
): Promise<void> {
  const access = await deliveryWalletFetch<{ url: string; legacyLocal?: boolean }>(
    `/admin/delivery-wallet/payouts/${encodeURIComponent(payoutId)}/proof-url`,
    unlockToken,
  );
  if (access.legacyLocal) {
    await openAdminProtectedFile(access.url);
    return;
  }
  window.open(access.url, '_blank', 'noopener,noreferrer');
}