'use client';
import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from '@/lib/queryClient';
import { APP_DOWNLOAD_SETTINGS_QUERY_KEY, fetchAppDownloadSettings } from '@/lib/appDownload';
import SiteOrderPrompt from '@/components/order/SiteOrderPrompt';
import ThemeProvider from '@/components/ui/ThemeProvider';
import CartCelebration from '@/components/cart/CartCelebration';
import CartAuthSync from '@/components/cart/CartAuthSync';
import CustomerAuthSync from '@/components/auth/CustomerAuthSync';
import CupPourOverlay from '@/components/cart/CupPourOverlay';
import LoyaltyPointsFloat from '@/components/cart/LoyaltyPointsFloat';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CustomerSocketProvider from '@/components/notifications/CustomerSocketProvider';
import BranchOperatingLiveSync from '@/hooks/useBranchOperatingLiveSync';
import { useSpinStore } from '@/store/spinStore';
import { RouteProgress } from '@/components/ui/RouteProgress';

const SpinWheelModal = dynamic(() => import('@/components/promo/SpinWheelModal'), {
  ssr: false,
  loading: () => null,
});

/** Mount spin UI after first paint (or immediately when the FAB requests it). */
function DeferredSpinWheelModal() {
  const openRequestId = useSpinStore((s) => s.openRequestId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (openRequestId > 0) {
      setReady(true);
      return;
    }
    if (ready) return;

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 3500 });
      return () => win.cancelIdleCallback?.(id);
    }

    const t = window.setTimeout(() => setReady(true), 2200);
    return () => window.clearTimeout(t);
  }, [openRequestId, ready]);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <SpinWheelModal />
    </Suspense>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // App download settings are light and used by claim destinations; spin offers load with the deferred modal.
    void queryClient.prefetchQuery({
      queryKey: APP_DOWNLOAD_SETTINGS_QUERY_KEY,
      queryFn: fetchAppDownloadSettings,
      staleTime: 5 * 60 * 1000,
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouteProgress />
        <CustomerSocketProvider>
        <BranchOperatingLiveSync />
        <CustomerAuthSync />
        <CartAuthSync />
        <DeferredSpinWheelModal />
        <SiteOrderPrompt />
        <CupPourOverlay />
        <LoyaltyPointsFloat />
        <CartCelebration />
        <ConfirmDialog />
        {children}
        </CustomerSocketProvider>
      </ThemeProvider>
      <Toaster
        position="top-center"
        containerStyle={{ zIndex: 10080 }}
        toastOptions={{
          style: {
            background: 'var(--color-navy-card)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-navy-border)',
            borderRadius: '10px',
            fontFamily: 'Poppins, sans-serif',
          },
          success: { iconTheme: { primary: '#307ef2', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  );
}
