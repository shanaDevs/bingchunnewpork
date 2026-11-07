'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  UtensilsCrossed,
  Tag,
  Gift,
  Store,
  User,
  ClipboardList,
  Heart,
  CircleHelp,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import LoyaltyRewardsNavBadge from '@/components/layout/LoyaltyRewardsNavBadge';

const MENU_SIDEBAR_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/promotions', label: 'Offers', icon: Tag },
  { href: '/stores', label: 'Stores', icon: Store },
  { href: '/account/rewards', label: 'Rewards', icon: Gift },
  { href: '/account/orders', label: 'My Orders', icon: ClipboardList },
  { href: '/contact', label: 'Help', icon: CircleHelp },
  { href: '/account', label: 'Profile', icon: User },
] as const;

const SIDEBAR_LINKS_PUBLIC = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/promotions', label: 'Offers', icon: Tag },
  { href: '/account/rewards', label: 'Rewards', icon: Gift },
  { href: '/stores', label: 'Stores', icon: Store },
  { href: '/contact', label: 'Help', icon: CircleHelp },
] as const;

const SIDEBAR_LINKS_AUTH = [
  { href: '/account/orders', label: 'My Orders', icon: ClipboardList },
  { href: '/account', label: 'Profile', icon: User },
] as const;

const SIDEBAR_LINK_LOGIN = { href: '/account/login', label: 'Sign In', icon: User } as const;

interface CustomerSidebarProps {
  className?: string;
  /** App shell: full nav in sidebar (theme / cart / notifications stay in header). */
  variant?: 'legacy' | 'app';
}

function isLinkActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/account') {
    return (
      pathname === '/account' ||
      (pathname.startsWith('/account') &&
        !pathname.startsWith('/account/login') &&
        !pathname.startsWith('/account/rewards') &&
        !pathname.startsWith('/account/orders'))
    );
  }
  return pathname.startsWith(href);
}

export default function CustomerSidebar({
  className = '',
  variant = 'app',
}: CustomerSidebarProps) {
  const pathname = usePathname();
  const authHydrated = useAuthHydrated();
  const { isAuthenticated, user } = useAuthStore();
  const showAuthLinks = authHydrated && isAuthenticated;
  const isDeleted = Boolean(user?.isDeleted);
  const isAppVariant = variant === 'app';

  const deletedSidebarLinks = [{ href: '/account', label: 'Profile', icon: User }] as const;

  const sidebarLinks = isDeleted && showAuthLinks
    ? deletedSidebarLinks
    : isAppVariant
    ? MENU_SIDEBAR_LINKS
    : showAuthLinks
      ? [...SIDEBAR_LINKS_PUBLIC, ...SIDEBAR_LINKS_AUTH]
      : [...SIDEBAR_LINKS_PUBLIC, SIDEBAR_LINK_LOGIN];

  const sidebarClass = [
    'home-desktop__sidebar',
    'customer-sidebar',
    isAppVariant ? 'customer-sidebar--app' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sidebarClass} aria-label="Quick navigation">
      <Link href={isDeleted ? '/account' : '/'} className="home-desktop__sidebar-logo">
        <Image src="/brand/logo.avif" alt="Bing Chun" width={40} height={40} className="rounded-xl" />
      </Link>

      <nav className="home-desktop__sidebar-nav">
        {sidebarLinks.map((link) => {
          const Icon = link.icon;
          const active = isLinkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              data-loyalty-target={link.href === '/account/rewards' ? 'rewards' : undefined}
              className={`home-desktop__sidebar-link${active ? ' home-desktop__sidebar-link--active' : ''}${
                link.href === '/account/rewards' ? ' home-desktop__sidebar-link--rewards' : ''
              }`}
              title={link.href === '/contact' ? 'Help & Support' : link.label}
              aria-label={link.href === '/contact' ? 'Help & Support' : undefined}
            >
              <span className="home-desktop__sidebar-link-icon-wrap">
                <Icon size={20} strokeWidth={2} />
                {link.href === '/account/rewards' ? <LoyaltyRewardsNavBadge /> : null}
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="home-desktop__sidebar-app">
        <Image src="/brand/mascot-hero.avif" alt="" width={56} height={56} className="home-desktop__sidebar-mascot" />
        <p className="home-desktop__sidebar-app-title">Download Our App</p>
        <p className="home-desktop__sidebar-app-sub">Order faster on mobile</p>
      </div>
    </aside>
  );
}
