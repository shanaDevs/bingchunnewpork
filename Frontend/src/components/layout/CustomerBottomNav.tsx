'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, Gift, User } from 'lucide-react';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import LoyaltyRewardsNavBadge from '@/components/layout/LoyaltyRewardsNavBadge';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed, match: (p: string) => p.startsWith('/menu') },
  { href: '__order__', label: 'Order Now', match: () => false, primary: true },
  {
    href: '/account/rewards',
    label: 'Rewards',
    icon: Gift,
    match: (p: string) => p.startsWith('/account/rewards'),
    loyaltyTarget: true,
  },
  {
    href: '/account',
    label: 'Account',
    icon: User,
    match: (p: string) =>
      p === '/account'
      || (p.startsWith('/account/')
        && !p.startsWith('/account/orders')
        && !p.startsWith('/account/login')
        && !p.startsWith('/account/rewards')),
  },
] as const;

export default function CustomerBottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/checkout')) return null;

  return (
    <nav className="customer-bottom-nav xl:hidden" aria-label="Main navigation">
      <div className="customer-bottom-nav__inner">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname ?? '');

          if ('primary' in item && item.primary) {
            return (
              <button
                key={item.label}
                type="button"
                className="customer-bottom-nav__fab"
                onClick={() => openOrderModal({ allowSkip: true })}
                aria-label={item.label}
              >
                <span className="customer-bottom-nav__fab-mascot" aria-hidden>
                  <Image
                    src="/brand/order-now-mascot.png"
                    alt=""
                    width={56}
                    height={56}
                    className="customer-bottom-nav__fab-img"
                    priority
                  />
                </span>
                <span className="customer-bottom-nav__fab-label">{item.label}</span>
              </button>
            );
          }

          if (!('icon' in item)) return null;

          const Icon = item.icon;
          const isRewards = 'loyaltyTarget' in item && Boolean((item as any).loyaltyTarget);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-loyalty-target={isRewards ? 'rewards' : undefined}
              className={`customer-bottom-nav__item ${active ? 'customer-bottom-nav__item--active' : ''}${
                isRewards ? ' customer-bottom-nav__item--rewards' : ''
              }`}
            >
              <span className="customer-bottom-nav__icon-wrap">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {isRewards ? <LoyaltyRewardsNavBadge /> : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
