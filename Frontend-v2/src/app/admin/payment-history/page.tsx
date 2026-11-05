'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PaymentHistoryContent from '@/components/admin/PaymentHistoryContent';
import { getAdminSession, isBranchAdmin, isSuperAdmin } from '@/lib/adminAuth';

/** Branch admins use Wallet → Platform Payments; keep this route for super admins / bookmarks. */
export default function PaymentHistoryPage() {
  const router = useRouter();

  useEffect(() => {
    const admin = getAdminSession();
    if (admin && isBranchAdmin(admin) && !isSuperAdmin(admin)) {
      router.replace('/admin/wallet?tab=platform');
    }
  }, [router]);

  return (
    <Suspense
      fallback={
        <div className="admin-dashboard mx-auto max-w-[1400px] py-16 text-center text-sm text-muted">
          Loading settlement payouts…
        </div>
      }
    >
      <PaymentHistoryContent />
    </Suspense>
  );
}
