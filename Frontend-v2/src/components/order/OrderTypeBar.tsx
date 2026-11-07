'use client';

import { Truck, ShoppingBag, MapPin, ChevronRight, Pencil } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { selectActiveStoreName, useCartStore } from '@/store/cartStore';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';

function isHiddenRoute(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout') ||
    pathname === '/account/login' ||
    pathname === '/account/register' ||
    pathname.startsWith('/mock-payment')
  );
}

function shortStoreName(name: string) {
  return name.replace(/^Bing Chun\s*[-–—]\s*/i, '').trim() || name;
}

export default function OrderTypeBar() {
  const pathname = usePathname() ?? '';
  const hydrated = useCartHydrated();
  const orderMode = useCartStore((s) => s.orderMode);
  const deliveryInfo = useCartStore((s) => s.deliveryInfo);
  const takeawayInfo = useCartStore((s) => s.takeawayInfo);
  const activeStoreName = useCartStore(selectActiveStoreName);

  if (isHiddenRoute(pathname)) return null;

  const hasSetup = hydrated && hasCompletedOrderSetup({ orderMode, deliveryInfo, takeawayInfo });

  if (!hasSetup) {
    return (
      <div className="order-type-bar order-type-bar--prompt order-type-bar--nav" role="region" aria-label="Choose order type">
        <div className="order-type-bar__inner order-type-bar__inner--nav">
          <p className="order-type-bar__prompt-text">
            <span className="order-type-bar__prompt-lead">Delivery or Pickup?</span>
            <span className="order-type-bar__prompt-sub">Set your area to see the right menu &amp; prices</span>
          </p>
          <div className="order-type-bar__actions">
            <button
              type="button"
              className="order-type-bar__mode-btn order-type-bar__mode-btn--delivery"
              onClick={() =>
                openOrderModal({ allowSkip: true, initialMode: 'DELIVERY', startAtSetup: true })
              }
            >
              <Truck size={15} aria-hidden />
              Delivery
            </button>
            <button
              type="button"
              className="order-type-bar__mode-btn order-type-bar__mode-btn--pickup"
              onClick={() =>
                openOrderModal({ allowSkip: true, initialMode: 'TAKEAWAY', startAtSetup: true })
              }
            >
              <ShoppingBag size={15} aria-hidden />
              Pickup
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isDelivery = orderMode === 'DELIVERY';
  const ModeIcon = isDelivery ? Truck : ShoppingBag;
  const modeLabel = isDelivery ? 'Delivery' : 'Pickup';
  const detail = isDelivery
    ? deliveryInfo?.address
    : takeawayInfo?.storeName
      ? shortStoreName(takeawayInfo.storeName)
      : activeStoreName
        ? shortStoreName(activeStoreName)
        : 'Select store';

  return (
    <button
      type="button"
      className="order-type-bar order-type-bar--set order-type-bar--nav"
      onClick={() => openOrderModal()}
      aria-label={`${modeLabel} to ${detail}. Tap to change order type.`}
    >
      <div className="order-type-bar__inner order-type-bar__inner--nav">
        <span className={`order-type-bar__mode-badge order-type-bar__mode-badge--${isDelivery ? 'delivery' : 'pickup'}`}>
          <ModeIcon size={14} aria-hidden />
          {modeLabel}
        </span>

        <span className="order-type-bar__detail">
          <MapPin size={13} className="order-type-bar__detail-icon" aria-hidden />
          <span className="order-type-bar__detail-text">{detail}</span>
        </span>

        <span className="order-type-bar__change">
          <Pencil size={12} aria-hidden />
          <span className="order-type-bar__change-label">Change</span>
          <ChevronRight size={14} className="order-type-bar__change-chevron" aria-hidden />
        </span>
      </div>
    </button>
  );
}
