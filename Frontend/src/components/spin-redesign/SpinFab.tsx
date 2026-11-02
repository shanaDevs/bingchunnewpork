'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/components/home-redesign/lib/cn';
import { useSpinEligibility } from '@/hooks/useSpinEligibility';
import { formatSpinCooldownMessage, shouldShowSpinFab } from '@/lib/spinEligibility';
import { isSpinConsumedLocally } from '@/lib/spinStorage';
import { useSpinStore } from '@/store/spinStore';
import { MiniWheel } from './MiniWheel';

/** The bottom band of the screen the button takes up (its size, its gap from the edge and a little room). */
const CORNER_PX = 120;

/** True while the page's hero (`data-hero="root"`, on the home and Offers pages) still reaches into that band. */
const heroInCorner = () => {
  const hero = document.querySelector('[data-hero="root"]');
  return hero ? hero.getBoundingClientRect().bottom > window.innerHeight - CORNER_PX : false;
};

/**
 * Whether the hero is still behind the button's corner, kept up to date on scroll and resize. It checks again just
 * after each page change, once the new page (and its hero, if it has one) is on screen.
 */
function useHeroInCorner() {
  const pathname = usePathname();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const frame = requestAnimationFrame(onChange);
      window.addEventListener('scroll', onChange, { passive: true });
      window.addEventListener('resize', onChange);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onChange);
        window.removeEventListener('resize', onChange);
      };
    },
    // A new page needs a fresh look for its hero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname],
  );
  return useSyncExternalStore(subscribe, heroInCorner, () => false);
}

/**
 * The floating Spin & Win button (the Super Admin's "Floating spin button"), on every screen size while the visitor
 * may spin: a little prize wheel fixed in the bottom-right corner, slowly turning, in a sunny yellow ring. It wiggles
 * every few seconds to catch the eye, and on hover (desktop) a "Spin & Win" label slides out beside it. It opens the
 * Spin & Win pop-up (SpinWheelModal).
 *
 * On pages that open with a big hero (home, Offers) it stays out of the way while the hero fills the corner, and pops
 * in once the customer scrolls past it.
 *
 * `aboveCup`: on pages with the floating cart cup (below 1280px, where the cup lives in the same corner), it sits just
 * above the cup, and on phones above the bottom navigation too.
 */
export function SpinFab({ aboveCup = false }: { aboveCup?: boolean }) {
  const { eligibility } = useSpinEligibility();
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const overHero = useHeroInCorner();

  if (!shouldShowSpinFab(eligibility)) return null;

  const open = () => {
    if (!eligibility?.canSpin || isSpinConsumedLocally()) {
      toast.error(formatSpinCooldownMessage(eligibility?.nextSpinAt, eligibility?.reason ?? undefined));
      return;
    }
    requestOpenSpin();
  };

  return (
    <div
      // Out of the way over the hero: invisible, and not reachable by keyboard or screen readers either.
      inert={overHero}
      className={cn(
        'spin-fab no-print fixed z-915 transition-[opacity,scale] duration-300 ease-out',
        overHero ? 'pointer-events-none scale-50 opacity-0' : 'scale-100 opacity-100',
        // The cup (FloatingCart): 56px, 12px in from the edge, above the bottom nav on phones; none from 1280px.
        aboveCup
          ? 'right-3 bottom-[calc(11.5rem+env(safe-area-inset-bottom,0))] md:bottom-24 xl:right-6 xl:bottom-6'
          : 'right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0))] sm:right-6 sm:bottom-6',
      )}
    >
      <button
        type="button"
        data-loyalty-target="spin-wheel"
        onClick={open}
        aria-haspopup="dialog"
        aria-label="Spin & Win: open the prize wheel"
        className="group relative block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 motion-safe:animate-fab-nudge"
      >
        {/* Desktop: the label slides out to the left on hover or keyboard focus. */}
        <span className="pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 translate-x-2 rounded-full bg-brand-950 px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-snow opacity-0 shadow-lg transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-sm:hidden">
          Spin &amp; Win
        </span>
        <span className="block rounded-full bg-sun-300 p-1 shadow-[0_10px_24px_-6px_rgb(15_33_71/0.55)] ring-1 ring-sun-400 transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
          <MiniWheel
            className="size-13 sm:size-14"
            shadow="shadow-none"
            faceClassName="motion-safe:animate-spin motion-safe:[animation-duration:14s]"
          />
        </span>
      </button>
    </div>
  );
}
