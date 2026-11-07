'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminSession, isPickupOnlyBranchAdmin } from '@/lib/adminAuth';
import { deliveryFrontendHref } from '@/lib/deliveryFrontendUrl';

/** Sends bookmarked delivery-ops URLs to the standalone console. */
export default function DeliveryOpsRedirect() {
  const router = useRouter();

  useEffect(() => {
    const admin = getAdminSession();
    if (isPickupOnlyBranchAdmin(admin)) {
      router.replace('/admin/orders');
      return;
    }
    const target = deliveryFrontendHref(window.location.pathname);
    if (target) {
      window.location.assign(target);
      return;
    }
    router.replace('/admin');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
      Redirecting…
    </div>
  );
}
