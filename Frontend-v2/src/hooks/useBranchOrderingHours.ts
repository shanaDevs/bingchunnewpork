'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCartStore } from '@/store/cartStore';
import {
  isCustomerOnlineOrderingOpen,
  customerOnlineOrderingClosedMessage,
  orderingConfigFromFulfillment,
  resolveStoreOrderingHours,
} from '@/lib/storeOrderingHours';

export function useBranchOrderingHours() {
  const deliveryInfo = useCartStore((s) => s.deliveryInfo);
  const takeawayInfo = useCartStore((s) => s.takeawayInfo);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const config = orderingConfigFromFulfillment(deliveryInfo ?? takeawayInfo);
    if (!config) {
      return {
        hasBranch: false,
        isOpen: true,
        closedMessage: '',
        resolved: null,
        config: null,
      };
    }
    const resolved = resolveStoreOrderingHours(config);
    const isOpen = isCustomerOnlineOrderingOpen(config, now);
    return {
      hasBranch: true,
      isOpen,
      closedMessage: customerOnlineOrderingClosedMessage(config),
      resolved,
      config,
    };
  }, [deliveryInfo, takeawayInfo, now]);
}

/** Read ordering state from cart without subscribing (for cartStore). */
export function getBranchOrderingOpenFromCart(now = new Date()): boolean {
  const { deliveryInfo, takeawayInfo } = useCartStore.getState();
  const config = orderingConfigFromFulfillment(deliveryInfo ?? takeawayInfo);
  if (!config) return true;
  return isCustomerOnlineOrderingOpen(config, now);
}
