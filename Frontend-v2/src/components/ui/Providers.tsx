'use client';
import { Suspense, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from '@/lib/queryClient';
import { fetchSpinOffers, SPIN_OFFERS_QUERY_KEY } from '@/lib/spinOffers';
import { fetchSpinEligibility, SPIN_ELIGIBILITY_QUERY_KEY } from '@/lib/spinEligibility';
import { APP_DOWNLOAD_SETTINGS_QUERY_KEY, fetchAppDownloadSettings } from '@/lib/appDownload';
import SiteOrderPrompt from '@/components/order/SiteOrderPrompt';
import SpinWheelModal from '@/components/promo/SpinWheelModal';
import ThemeProvider from '@/components/ui/ThemeProvider';
import CartCelebration from '@/components/cart/CartCelebration';
import CartAuthSync from '@/components/cart/CartAuthSync';
import CustomerAuthSync from '@/components/auth/CustomerAuthSync';
import CupPourOverlay from '@/components/cart/CupPourOverlay';
import LoyaltyPointsFloat from '@/components/cart/LoyaltyPointsFloat';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CustomerSocketProvider from '@/components/notifications/CustomerSocketProvider';
import BranchOperatingLiveSync from '@/hooks/useBranchOperatingLiveSync';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: SPIN_OFFERS_QUERY_KEY,
      queryFn: () => fetchSpinOffers(),
      staleTime: 5 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, 'guest'],
      queryFn: () => fetchSpinEligibility(false),
      staleTime: 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: APP_DOWNLOAD_SETTINGS_QUERY_KEY,
      queryFn: fetchAppDownloadSettings,
      staleTime: 5 * 60 * 1000,
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CustomerSocketProvider>
        <BranchOperatingLiveSync />
        <CustomerAuthSync />
        <CartAuthSync />
        <Suspense fallback={null}>
          <SpinWheelModal />
        </Suspense>
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
