'use client';

import { Suspense } from 'react';
import { CreditCard } from 'lucide-react';
import PaymentHistoryContent from '@/components/admin/PaymentHistoryContent';

export default function DeliveryPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-dashboard mx-auto max-w-[1400px] py-16 text-center text-sm text-muted">
          Loading delivery payment…
        </div>
      }
    >
      <PaymentHistoryContent
        title="Delivery Payment"
        subtitle="Commission dues and settlement records for your branch"
        headerIcon={CreditCard}
      />
    </Suspense>
  );
}
