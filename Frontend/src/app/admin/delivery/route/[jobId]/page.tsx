'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Route detail opens inside Delivery. The job panel lives on that page. */
export default function DeliveryRoutePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/delivery');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
      Redirecting…
    </div>
  );
}
