'use client';

import { useEffect, useState } from 'react';
import { isCartStorageReady, onCartStorageReady } from '@/lib/cartAuthSync';

/** True once persisted cart state (scoped per user/guest) has been restored. */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isCartStorageReady()) {
      setHydrated(true);
      return;
    }
    return onCartStorageReady(() => setHydrated(true));
  }, []);

  return hydrated;
}
