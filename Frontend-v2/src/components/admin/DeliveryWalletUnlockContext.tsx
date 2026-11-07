'use client';

import { createContext, useContext, type ReactNode } from 'react';

const DeliveryWalletUnlockContext = createContext<string | null>(null);

export function DeliveryWalletUnlockProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  return (
    <DeliveryWalletUnlockContext.Provider value={token}>
      {children}
    </DeliveryWalletUnlockContext.Provider>
  );
}

export function useDeliveryWalletUnlockToken(): string {
  const token = useContext(DeliveryWalletUnlockContext);
  if (!token) {
    throw new Error('Delivery wallet unlock token is missing');
  }
  return token;
}

export function useOptionalDeliveryWalletUnlockToken(): string | null {
  return useContext(DeliveryWalletUnlockContext);
}
