const DELIVERY_WALLET_UNLOCK_KEY = 'bc_delivery_wallet_unlock';

export function readDeliveryWalletUnlockToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(DELIVERY_WALLET_UNLOCK_KEY) ?? '';
}

export function writeDeliveryWalletUnlockToken(token: string) {
  if (typeof window === 'undefined') return;
  if (!token) {
    sessionStorage.removeItem(DELIVERY_WALLET_UNLOCK_KEY);
    return;
  }
  sessionStorage.setItem(DELIVERY_WALLET_UNLOCK_KEY, token);
}

export function clearDeliveryWalletUnlockToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(DELIVERY_WALLET_UNLOCK_KEY);
}
