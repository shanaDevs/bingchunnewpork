'use client';

import { useCustomerSocket } from '@/hooks/useCustomerSocket';

/** Connects the customer socket only while signed in (no anonymous connection). */
export default function CustomerSocketProvider({ children }: { children: React.ReactNode }) {
  useCustomerSocket();
  return <>{children}</>;
}
