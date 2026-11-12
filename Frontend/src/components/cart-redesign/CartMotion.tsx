'use client';

import { useRef, type RefObject } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import { gsap, useGSAP } from '@/components/home-redesign/lib/gsap';

const AFTER_HERO = 0.35;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCartEntrance(scope: RefObject<HTMLElement | null>, ready: boolean) {
  const played = useRef(false);

  useGSAP(
    () => {
      if (!ready || played.current) return;
      played.current = true;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const q = gsap.utils.selector(scope);
        const sideBySide = window.matchMedia('(min-width: 64rem)').matches;
        gsap
          .timeline({ delay: AFTER_HERO, defaults: { duration: 0.7, ease: 'power3.out' } })
          .from(q('[data-cart="list-header"] > *'), { y: 20, autoAlpha: 0, stagger: 0.08 }, 0)
          .from(q('[data-cart="item"]'), { y: 36, autoAlpha: 0, stagger: 0.1 }, 0.1)
          .from(
            q('[data-cart="item-photo"]'),
            { scale: 0.6, rotation: -12, autoAlpha: 0, transformOrigin: '50% 80%', ease: 'back.out(1.8)', stagger: 0.1 },
            0.3,
          )
          .from(q('[data-cart="summary"]'), { x: sideBySide ? 48 : 0, y: sideBySide ? 0 : 36, autoAlpha: 0, duration: 0.8 }, 0.15)
          .from(q('[data-cart="summary"] > *'), { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.07 }, 0.35);
      });
    },
    { scope, dependencies: [ready] },
  );
}

export function useEmptyBagEntrance(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const q = gsap.utils.selector(scope);
        const part = (name: string) => q(`[data-cart-empty="${name}"]`);
        gsap
          .timeline({ delay: 0.2, defaults: { duration: 0.7, ease: 'power3.out' } })
          .from(scope.current, { y: 32, autoAlpha: 0, duration: 0.8 }, 0)
          .from(part('mascot'), { y: 40, scale: 0.6, autoAlpha: 0, transformOrigin: '50% 100%', duration: 0.9, ease: 'back.out(1.9)' }, 0.15)
          .from(part('title'), { y: 24, autoAlpha: 0 }, 0.35)
          .from(part('highlight'), { scaleX: 0, transformOrigin: 'left center', duration: 0.6, ease: 'power3.inOut' }, 0.7)
          .from(part('text'), { y: 16, autoAlpha: 0, duration: 0.6 }, 0.5)
          .from(part('cta'), { y: 16, scale: 0.9, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)' }, 0.65);
      });
    },
    { scope },
  );
}

export function animateItemOut(item: HTMLElement | null, done: () => void) {
  if (!item || reducedMotion()) return done();
  const gap = parseFloat(getComputedStyle(item.parentElement ?? item).rowGap) || 0;
  const closeGap = item.nextElementSibling
    ? { marginBottom: -gap }
    : item.previousElementSibling
      ? { marginTop: -gap }
      : {};
  gsap
    .timeline({ onComplete: done })
    .to(item, { x: -40, autoAlpha: 0, duration: 0.25, ease: 'power2.in' })
    .to(item, { height: 0, paddingTop: 0, paddingBottom: 0, ...closeGap, duration: 0.3, ease: 'power2.inOut' });
}

export function PopValue({ value, className }: { value: string; className?: string }) {
  return (
    <span
      key={value}
      className={cn(
        'inline-block transition-[scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] starting:scale-115',
        className,
      )}
    >
      {value}
    </span>
  );
}
