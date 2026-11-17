'use client';

import { useCustomerSocket } from '@/hooks/useCustomerSocket';

/** Keeps customer WebSocket connected app-wide when logged in */
export default function CustomerSocketProvider({ children }: { children: React.ReactNode }) {
  useCustomerSocket();
  return <>{children}</>;
}
