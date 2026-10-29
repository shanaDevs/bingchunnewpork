'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Platform payment details live on Wallet → Platform Payments. */
export default function PlatformEarningsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/wallet?tab=platform');
  }, [router]);

  return (
    <div className="py-16 text-center text-sm text-muted">
      Opening platform payments…
    </div>
  );
}
