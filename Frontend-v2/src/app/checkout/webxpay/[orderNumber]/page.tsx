'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getWebxpayCheckoutUrl } from '@/lib/apiBase';

/** Legacy / bookmarked path — forwards to backend WebXPay checkout proxy. */
export default function WebXPayLegacyRedirectPage() {
  const params = useParams();
  const orderNumber = typeof params.orderNumber === 'string' ? params.orderNumber : '';

  useEffect(() => {
    if (orderNumber) {
      window.location.replace(getWebxpayCheckoutUrl(orderNumber));
    }
  }, [orderNumber]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-muted text-sm">
      Redirecting to online payment…
    </div>
  );
}
