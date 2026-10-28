'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Older drivers URL opens the in-app Delivery drivers tab. */
export default function DriversPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/delivery?tab=drivers');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
      Redirecting…
    </div>
  );
}
