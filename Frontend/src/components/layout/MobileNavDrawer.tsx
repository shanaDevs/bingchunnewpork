'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  Home,
  LayoutList,
  Heart,
  Tag,
  MapPin,
  Gift,
  ClipboardList,
  User,
  Settings,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';

const PRIMARY_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/menu', label: 'Menu', icon: LayoutList },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/promotions', label: 'Offers', icon: Tag },
  { href: '/stores', label: 'Stores', icon: MapPin },
  { href: '/account/loyalty', label: 'Rewards', icon: Gift },
  { href: '/account/orders', label: 'My Orders', icon: ClipboardList },
  { href: '/account', label: 'Profile', icon: User },
];

const FOOTER_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/account/notifications', label: 'Settings', icon: Settings },
  { href: '/contact', label: 'Help & Support', icon: CircleHelp },
];

function isLinkActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/account') {
    return (
      pathname === '/account'
      || (pathname.startsWith('/account/')
        && !pathname.startsWith('/account/login')
        && !pathname.startsWith('/account/loyalty')
        && !pathname.startsWith('/account/orders')
        && !pathname.startsWith('/account/notifications'))
    );
  }
  return pathname.startsWith(href);
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      document.documentElement.setAttribute('data-mobile-nav-open', '');
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.removeAttribute('data-mobile-nav-open');
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.removeAttribute('data-mobile-nav-open');
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    onCloseRef.current();
  }, [pathname]);

  function renderLink(link: { href: string; label: string; icon: LucideIcon }) {
    const active = isLinkActive(pathname ?? '', link.href);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        data-loyalty-target={link.href === '/account/loyalty' ? 'rewards' : undefined}
        className={`mobile-nav-drawer__link${active ? ' mobile-nav-drawer__link--active' : ''}`}
      >
        <Icon size={20} strokeWidth={active ? 2.25 : 1.9} className="mobile-nav-drawer__link-icon" aria-hidden />
        <span className="mobile-nav-drawer__link-label">{link.label}</span>
        <ChevronRight size={16} className="mobile-nav-drawer__link-chevron" aria-hidden />
      </Link>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="mobile-nav-backdrop fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-label="Close menu"
            onClick={onClose}
          />
          <motion.aside
            className="mobile-nav-drawer fixed left-0 top-0 z-[70]"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            aria-label="Main navigation"
          >
            <div className="mobile-nav-drawer__header">
              <BrandLogo size={40} className="mobile-nav-drawer__brand min-w-0" />
              <button
                type="button"
                onClick={onClose}
                className="mobile-nav-drawer__close"
                aria-label="Close menu"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <nav className="mobile-nav-drawer__body">
              <div className="mobile-nav-drawer__list">
                {PRIMARY_LINKS.map(renderLink)}
              </div>

              <div className="mobile-nav-drawer__divider" role="separator" />

              <div className="mobile-nav-drawer__list mobile-nav-drawer__list--footer">
                {FOOTER_LINKS.map(renderLink)}
              </div>
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
