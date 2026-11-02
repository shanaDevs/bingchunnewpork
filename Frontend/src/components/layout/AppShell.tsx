'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FloatingCart from '@/components/cart/FloatingCart';
import { SpinFab } from '@/components/spin-redesign/SpinFab';
import CustomerBottomNav from '@/components/layout/CustomerBottomNav';
import CustomerSidebar from '@/components/layout/CustomerSidebar';
import { useDeletedAccountGuard, isDeletedAccountUser } from '@/hooks/useDeletedAccountGuard';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useDeletedAccountGuard();
  const authHydrated = useAuthHydrated();
  const user = useAuthStore((s) => s.user);
  const isDeleted = authHydrated && isDeletedAccountUser(user);
  const isAdminRoute = pathname?.startsWith('/admin');
  const isCheckout = pathname?.startsWith('/checkout');
  const useSidebarLayout = !isAdminRoute && !isCheckout;

  if (isAdminRoute) {
    return <>{children}</>;
  }

  // The home and offers pages bring their own header and footer (components/home-redesign).
  // The admin's floating spin button still shows there; elsewhere FloatingCart brings it.
  if (pathname === '/' || pathname === '/promotions') {
    return (
      <>
        {children}
        {!isDeleted && <SpinFab />}
      </>
    );
  }

  return (
    <div className="customer-app-canvas">
      <div className={`customer-app-shell${useSidebarLayout ? ' customer-app-shell--sidebar' : ''}`}>
        {useSidebarLayout ? (
          <div className="customer-app-frame">
            <CustomerSidebar className="customer-app-frame__sidebar" variant="app" />

            <div className="customer-app-panel">
              <Navbar inPanel />
              <main className="customer-app-main customer-app-main--with-nav customer-app-main--sidebar">
                {children}
              </main>
            </div>
          </div>
        ) : (
          <>
            <Navbar />
            <main className={`customer-app-main${isCheckout ? '' : ' customer-app-main--with-nav'}`}>
              {children}
            </main>
          </>
        )}

        {!isCheckout && !isDeleted && <FloatingCart />}
        {!isCheckout && !isDeleted && <CustomerBottomNav />}
      </div>
      {!isDeleted && (
        <Footer className={useSidebarLayout ? 'site-footer--sidebar' : ''} />
      )}
    </div>
  );
}
