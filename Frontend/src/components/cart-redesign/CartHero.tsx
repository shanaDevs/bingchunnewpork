'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { Container } from '@/components/home-redesign/ui/Container';
import { cn } from '@/components/home-redesign/lib/cn';
import { gsap, useGSAP } from '@/components/home-redesign/lib/gsap';
import { heroBackdropImage } from '@/components/home-redesign/sections/hero/hero.config';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import { cartCopy } from './cartCopy';

const STAR_PATH =
  'M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z';

const enters = 'motion-safe:opacity-0';

const sparkles: { tone: 'sun' | 'white'; left: number; top: number; size: number; wide?: boolean }[] = [
  { tone: 'sun', left: -4, top: -2, size: 13 },
  { tone: 'white', left: 104, top: 30, size: 9 },
  { tone: 'sun', left: 98, top: 78, size: 8 },
  { tone: 'white', left: -18, top: 14, size: 7, wide: true },
];

/** Short blue hero band for the cart — matches the homepage redesign prototype. */
export function CartHero() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const q = gsap.utils.selector(rootRef);
        const all = (name: string) => q<HTMLElement>(`[data-cart-hero="${name}"]`);
        const shapes = all('shape');
        const twinkles = all('sparkle');
        const [mascot] = all('mascot');
        const [float] = all('float');
        const [art] = q<HTMLElement>('[data-cart-hero-parallax="art"]');
        const [headline] = all('headline');

        const ambient = () => {
          gsap.to(float, { y: -6, rotation: 2, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
          gsap.to(twinkles, {
            scale: 0.55,
            opacity: 0.45,
            duration: 1.3,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            stagger: { each: 0.4, from: 'random' },
          });
          gsap.to(shapes, { scale: 1.04, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.5 });
          gsap.to(q('[data-cart-hero-spin]'), { rotation: 360, duration: 90, ease: 'none', repeat: -1 });
        };

        const intro = gsap.timeline({ defaults: { duration: 0.9, ease: 'back.out(1.6)' }, onComplete: ambient });

        intro
          .fromTo(shapes, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, ease: 'back.out(1.3)', stagger: 0.1 }, 0)
          .fromTo(all('eyebrow'), { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.6 }, 0.05)
          .fromTo(all('eyebrow-sparkle'), { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.4)' }, 0.3)
          .fromTo(headline, { opacity: 0, y: 28, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.8 }, 0.15)
          .fromTo(all('intro'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.5)
          .fromTo(
            mascot,
            { opacity: 0, y: 48, scale: 0.6, rotation: -12, transformOrigin: '50% 100%' },
            { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 1, ease: 'back.out(1.9)' },
            0.25,
          )
          .fromTo(
            twinkles,
            { scale: 0, opacity: 0, rotation: -40 },
            { scale: 1, opacity: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.2)', stagger: { each: 0.08, from: 'random' } },
            0.75,
          );

        const hop = gsap
          .timeline({ paused: true })
          .to(mascot, { y: -16, rotation: -6, scale: 1.06, duration: 0.22, ease: 'power2.out' })
          .to(mascot, { y: 0, rotation: 0, scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
        const onHop = () => {
          if (!intro.isActive() && !hop.isActive()) hop.restart();
        };
        art?.addEventListener('pointerenter', onHop);

        gsap.to(q('[data-cart-hero-parallax="copy"]'), {
          y: -24,
          ease: 'none',
          scrollTrigger: { trigger: rootRef.current, start: 'top top', end: 'bottom top', scrub: true },
        });
        if (art) {
          gsap.to(art, {
            y: 30,
            ease: 'none',
            scrollTrigger: { trigger: rootRef.current, start: 'top top', end: 'bottom top', scrub: true },
          });
        }

        return () => art?.removeEventListener('pointerenter', onHop);
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      className="relative isolate overflow-hidden pt-22 text-snow"
      style={{ backgroundImage: heroBackdropImage }}
    >
      <Container className="flex items-center justify-between gap-4 pt-3 pb-12 sm:pt-4 sm:pb-14">
        <div data-cart-hero-parallax="copy" className="relative z-10 min-w-0">
          <p
            data-cart-hero="eyebrow"
            className={cn(
              'mb-3 inline-flex items-center gap-2 rounded-full bg-snow/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-snow uppercase ring-1 ring-snow/25 backdrop-blur-sm sm:mb-4 sm:text-sm',
              enters,
            )}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" data-cart-hero="eyebrow-sparkle" className="size-3.5 shrink-0 fill-sun-300">
              <path d={STAR_PATH} />
            </svg>
            {cartCopy.eyebrow}
          </p>
          <h1
            data-cart-hero="headline"
            className={cn(
              'font-display-condensed text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.9] uppercase [text-shadow:0_0.05em_0_var(--color-brand-800)]',
              enters,
            )}
          >
            {cartCopy.headlineBefore}
            <span className="text-sun-300">{cartCopy.headlineHighlight}</span>
            {cartCopy.headlineAfter}
          </h1>
          <p data-cart-hero="intro" className={cn('mt-1.5 text-sm text-snow/85 sm:text-base', enters)}>
            {cartCopy.intro}
          </p>
        </div>

        <div
          aria-hidden="true"
          data-cart-hero-parallax="art"
          className="relative size-24 shrink-0 sm:size-32 lg:mr-4 lg:size-40 xl:mr-16"
        >
          <span
            data-cart-hero="shape"
            className={cn(
              'absolute -inset-[22%] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.3),rgb(188_215_255/0.14)_55%,transparent)]',
              enters,
            )}
          />
          <span data-cart-hero="shape" className={cn('absolute -inset-[16%] rounded-full border border-snow/10', enters)} />
          <span
            data-cart-hero="shape"
            data-cart-hero-spin
            className={cn('absolute -inset-[2%] rounded-full border-2 border-dashed border-snow/20', enters)}
          />
          <span data-cart-hero="shape" className={cn('absolute inset-[14%] rounded-full border border-snow/15', enters)} />
          <span
            data-cart-hero="shape"
            className={cn(
              'absolute bottom-[8%] left-1/2 h-[9%] w-[62%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(15_33_71/0.4),transparent)]',
              enters,
            )}
          />
          <div data-cart-hero="float" className="relative size-full">
            <div data-cart-hero="mascot" className={cn('size-full', enters)}>
              <Image
                src={MASCOT_IMAGES.takeaway}
                alt=""
                width={500}
                height={500}
                sizes="(min-width: 1024px) 160px, (min-width: 640px) 128px, 96px"
                priority
                className="sticker size-full object-contain"
              />
            </div>
          </div>
          {sparkles.map((sparkle) => (
            <span
              key={`${sparkle.left}-${sparkle.top}`}
              className={cn('absolute block', sparkle.wide && 'max-sm:hidden')}
              style={{ left: `${sparkle.left}%`, top: `${sparkle.top}%`, width: `${sparkle.size}%` }}
            >
              <svg
                viewBox="0 0 24 24"
                data-cart-hero="sparkle"
                className={cn('block w-full fill-current', sparkle.tone === 'sun' ? 'text-sun-300' : 'text-snow', enters)}
              >
                <path d={STAR_PATH} />
              </svg>
            </span>
          ))}
        </div>
      </Container>
    </section>
  );
}
