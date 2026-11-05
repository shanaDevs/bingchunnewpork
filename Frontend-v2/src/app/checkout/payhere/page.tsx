'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPayhereCheckoutUrl } from '@/lib/apiBase';

function PayHereLegacyRedirect() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');

  useEffect(() => {
    if (orderNumber) {
      window.location.replace(getPayhereCheckoutUrl(orderNumber));
    }
  }, [orderNumber]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-muted text-sm">
      Redirecting to online payment…
    </div>
  );
}

export default function PayHereLegacyRedirectPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-muted text-sm">Loading…</div>}>
      <PayHereLegacyRedirect />
    </Suspense>
  );
}
