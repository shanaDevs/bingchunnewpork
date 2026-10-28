'use client';

import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from '@/lib/queryClient';
import ThemeProvider from '@/components/ui/ThemeProvider';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { AdminNotificationProvider } from '@/contexts/AdminNotificationProvider';
import { getAdminSession, type AdminSession } from '@/lib/adminAuth';

export default function DeliveryProviders({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminSession | null>(null);

  useEffect(() => {
    setAdminUser(getAdminSession());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'bc_admin') setAdminUser(getAdminSession());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AdminNotificationProvider adminUser={adminUser}>
          {children}
          <Toaster position="top-center" />
          <ConfirmDialog />
        </AdminNotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
