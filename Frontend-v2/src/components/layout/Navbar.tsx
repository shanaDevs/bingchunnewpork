'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  Bell,
  LogOut,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { selectActiveStoreName, useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { usePromoStore } from '@/store/promoStore';
import { displayPaidSubtotal } from '@/lib/promoFreeProduct';
import BrandLogo from '@/components/ui/BrandLogo';
import CupIcon, { cupFillFromCount } from '@/components/cart/CupIcon';
import { useCupPourPulse } from '@/hooks/useCupPourPulse';
import CustomerNotificationBell from '@/components/notifications/CustomerNotificationBell';
import SpinHeaderButton from '@/components/promo/SpinHeaderButton';
import ThemeToggle from '@/components/ui/ThemeToggle';
import OrderTypeBar from '@/components/order/OrderTypeBar';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { useClientHydrated } from '@/hooks/useClientHydrated';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { isDeletedAccountUser } from '@/hooks/useDeletedAccountGuard';
import { getAdminSession, type AdminSession } from '@/lib/adminAuth';
import { clearAdminAuth } from '@/lib/adminSession';
import { STORE_DISTRICT_ORDER } from '@/lib/groupStoresByDistrict';

interface NavbarProps {
  /** Tablet/desktop: navbar sits atop the scrollable content panel (beside sidebar). */
  inPanel?: boolean;
}

function shortStoreName(name: string) {
  return name.replace(/^Bing Chun\s*[-–—]\s*/i, '').trim() || name;
}

const SL_PROVINCE_RE = /\bProvince\b/i;
const SL_COUNTRY_RE = /^(Sri\s*Lanka|LK)$/i;
const KNOWN_DISTRICTS = new Set(
  STORE_DISTRICT_ORDER.map((d) => d.toLowerCase()),
);

function truncateLabel(value: string, max = 22) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Prefer district for the mobile “Deliver to” pill — skip country / province. */
function shortAddressLabel(address: string) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 'Your address';

  const withoutCountry = parts.filter((p) => !SL_COUNTRY_RE.test(p));
  const provinceIdx = withoutCountry.findIndex((p) => SL_PROVINCE_RE.test(p));

  const candidates =
    provinceIdx > 0
      ? withoutCountry.slice(0, provinceIdx)
      : withoutCountry.filter((p) => !SL_PROVINCE_RE.test(p));

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const cleaned = candidates[i].replace(/\s+District$/i, '').trim();
    if (KNOWN_DISTRICTS.has(cleaned.toLowerCase())) {
      return truncateLabel(cleaned);
    }
  }

  const fallback =
    candidates[candidates.length - 1]
    || (provinceIdx > 0 ? withoutCountry[provinceIdx - 1] : null)
    || withoutCountry[withoutCountry.length - 1]
    || parts[parts.length - 1];

  return truncateLabel(fallback.replace(/\s+District$/i, '').trim());
}

export default function Navbar({ inPanel = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useClientHydrated();
  const cartHydrated = useCartHydrated();
  const authHydrated = useAuthHydrated();
  const itemCount = useCartStore((s) => s.itemCount());
  const subtotal = useCartStore((s) => s.subtotal());
  const cartItems = useCartStore((s) => s.items);
  const reward = usePromoStore((s) => s.reward);
  const displaySubtotal = displayPaidSubtotal(subtotal, reward, cartItems);
  const orderMode = useCartStore((s) => s.orderMode);
  const deliveryInfo = useCartStore((s) => s.deliveryInfo);
  const takeawayInfo = useCartStore((s) => s.takeawayInfo);
  const activeStoreName = useCartStore(selectActiveStoreName);
  const pourPulse = useCupPourPulse();
  const displayCount = hydrated ? itemCount : 0;
  const fillLevel = cupFillFromCount(displayCount);
  const { isAuthenticated, logout, user } = useAuthStore();
  const showAsLoggedIn = authHydrated && isAuthenticated;
  const isDeleted = isDeletedAccountUser(user);
  const [adminUser, setAdminUser] = useState<AdminSession | null>(null);

  useEffect(() => {
    setAdminUser(getAdminSession());
  }, []);

  useEffect(() => {
    setAdminUser(getAdminSession());
  }, [pathname]);

  function signOutAdmin() {
    clearAdminAuth();
    setAdminUser(null);
    if (pathname.startsWith('/admin')) router.push('/');
  }

  function signOutCustomer() {
    logout();
    router.push('/');
  }

  const homeHref = isDeleted ? '/account' : '/';

  const mobileLocation = useMemo(() => {
    const hasSetup =
      cartHydrated && hasCompletedOrderSetup({ orderMode, deliveryInfo, takeawayInfo });
    if (!hasSetup) {
      return { eyebrow: 'Set location', place: 'Choose area' };
    }
    if (orderMode === 'DELIVERY') {
      return {
        eyebrow: 'Deliver to',
        place: deliveryInfo?.address
          ? shortAddressLabel(deliveryInfo.address)
          : 'Your address',
      };
    }
    const store =
      takeawayInfo?.storeName
        ? shortStoreName(takeawayInfo.storeName)
        : activeStoreName
          ? shortStoreName(activeStoreName)
          : 'Select store';
    return { eyebrow: 'Pickup at', place: store };
  }, [cartHydrated, orderMode, deliveryInfo, takeawayInfo, activeStoreName]);

  const notificationControl = showAsLoggedIn && !isDeleted ? (
    <CustomerNotificationBell compact />
  ) : (
    <Link
      href="/account/login"
      className="site-navbar__icon-btn flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-fg hover:bg-navy-light transition-colors shrink-0"
      aria-label="Notifications"
    >
      <Bell size={20} strokeWidth={2} />
    </Link>
  );

  const mobileNotificationControl = showAsLoggedIn && !isDeleted ? (
    <CustomerNotificationBell
      compact
      buttonClassName="site-navbar__round-btn site-navbar__round-btn--bell"
    />
  ) : (
    <Link
      href="/account/login"
      className="site-navbar__round-btn site-navbar__round-btn--bell"
      aria-label="Sign in for notifications"
    >
      <Bell size={18} strokeWidth={2} />
    </Link>
  );

  return (
    <>
      <nav className={`site-navbar sticky-nav glass z-50${inPanel ? ' site-navbar--in-panel' : ''}`}>
        <div className={`site-navbar__inner max-w-7xl mx-auto px-4 md:px-6 xl:px-8${inPanel ? ' site-navbar__inner--panel' : ''}`}>
          {/* Mobile / tablet header: brand · deliver-to · notifications */}
          <div className="site-navbar__mobile xl:hidden flex items-center h-[3.75rem] min-w-0 gap-2">
            <Link href={homeHref} className="site-navbar__brand-lockup flex items-center gap-2 min-w-0 shrink">
              <BrandLogo size={34} showText={false} className="shrink-0" />
              <div className="site-navbar__brand-text min-w-0 text-left">
                <p className="font-bold text-[13px] text-fg leading-tight truncate">Bing Chun</p>
                <p className="text-[10px] text-brand font-semibold leading-tight truncate">
                  Bubble Tea
                </p>
              </div>
            </Link>

            {!isDeleted && (
              <button
                type="button"
                className="site-navbar__deliver-pill min-w-0 flex-1"
                onClick={() => openOrderModal({ allowSkip: true })}
                aria-label={`${mobileLocation.eyebrow} ${mobileLocation.place}. Tap to change.`}
              >
                <MapPin size={15} className="site-navbar__deliver-pin shrink-0" aria-hidden />
                <span className="site-navbar__deliver-copy min-w-0 text-left">
                  <span className="site-navbar__deliver-eyebrow">{mobileLocation.eyebrow}</span>
                  <span className="site-navbar__deliver-place">{mobileLocation.place}</span>
                </span>
                <ChevronDown size={14} className="site-navbar__deliver-chevron shrink-0" aria-hidden />
              </button>
            )}

            <div className="shrink-0">{mobileNotificationControl}</div>
          </div>

          {/* Desktop header */}
          <div className="hidden xl:flex items-center h-14 md:h-16 min-w-0 gap-2 md:gap-3">
            <div className="flex items-center gap-2 shrink-0 min-w-0">
              <Link href={homeHref} className="group shrink-0 min-w-0">
                <BrandLogo size={40} />
              </Link>
            </div>

            <div className="flex items-center gap-1 md:gap-2 shrink-0 min-w-0 ml-auto">
              <ThemeToggle className="site-navbar__theme shrink-0" />

              {!isDeleted && showAsLoggedIn && <SpinHeaderButton compact />}

              {!isDeleted && <div className="site-navbar__notifications shrink-0">{notificationControl}</div>}

              {!isDeleted && (
              <Link
                href="/cart"
                data-loyalty-source="cart"
                className="site-navbar__cart-btn relative flex items-center justify-center gap-1.5 rounded-xl text-muted hover:text-fg hover:bg-navy-light transition-colors px-2 py-1.5"
                aria-label="Your cup"
                {...(hydrated && displayCount > 0
                  ? { 'aria-description': `${displayCount} items in cart` }
                  : {})}
              >
                <CupIcon
                  fillLevel={fillLevel}
                  fillFrom={hydrated ? pourPulse?.fillBefore : undefined}
                  pouring={hydrated && pourPulse != null}
                  size="sm"
                  itemCount={hydrated ? displayCount : undefined}
                />
                {hydrated && displayCount > 0 && (
                  <span className="hidden sm:inline text-brand font-semibold text-xs whitespace-nowrap">
                    LKR {displaySubtotal.toLocaleString()}
                  </span>
                )}
              </Link>
              )}

              <div className="site-navbar__account flex items-center gap-1.5 shrink-0">
                {showAsLoggedIn ? (
                  <button
                    type="button"
                    onClick={signOutCustomer}
                    className="site-navbar__login-btn site-navbar__login-btn--ghost px-4 py-2 text-sm inline-flex items-center gap-1.5"
                  >
                    <LogOut size={16} className="shrink-0" aria-hidden />
                    Logout
                  </button>
                ) : adminUser ? (
                  <button
                    type="button"
                    onClick={signOutAdmin}
                    className="site-navbar__login-btn site-navbar__login-btn--ghost px-4 py-2 text-sm inline-flex items-center gap-1.5"
                  >
                    <Shield size={16} className="shrink-0" aria-hidden />
                    Staff Logout
                  </button>
                ) : (
                  <Link href="/account/login" className="site-navbar__login-btn px-5 py-2 text-sm">
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Location bar on desktop; mobile/tablet use the deliver-to pill */}
        {!isDeleted && (
          <div className="hidden xl:block">
            <OrderTypeBar />
          </div>
        )}
      </nav>
    </>
  );
}
