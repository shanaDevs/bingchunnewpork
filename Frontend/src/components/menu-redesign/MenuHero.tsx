'use client';

import Image from 'next/image';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Container } from '@/components/home-redesign/ui/Container';
import { menuScript } from '@/components/home-redesign/fonts';
import { heroBackdropImage } from '@/components/home-redesign/sections/hero/hero.config';
import { cn } from '@/components/home-redesign/lib/cn';
import { gsap, SplitText, useGSAP } from '@/components/home-redesign/lib/gsap';
import { MenuBranchBar } from '@/components/menu-redesign/MenuBranchBar';
import { menuCopy } from '@/components/menu-redesign/menuCopy';

type From = 'left' | 'right';

type Drink = {
  src: string;
  width: number;
  height: number;
  from: From;
  className: string;
  z: number;
  sizes: string;
  preload?: boolean;
};

const drinks: Drink[] = [
  {
    src: '/images/products/Strawberry-Mango-Lemon-Tea-v2.png',
    width: 463,
    height: 800,
    from: 'left',
    className: 'bottom-[6%] left-[17%] h-[80%] -rotate-[8deg]',
    z: 10,
    sizes: '(min-width: 1024px) 180px, 120px',
  },
  {
    src: '/images/products/Mango-Pomelo-Sago.png',
    width: 463,
    height: 800,
    from: 'right',
    className: 'bottom-[4%] left-[45%] h-[88%] rotate-[7deg]',
    z: 20,
    sizes: '(min-width: 1024px) 240px, 160px',
    preload: true,
  },
];

const ENTER_FROM: Record<From, gsap.TweenVars> = {
  left: { x: -120, y: 40, rotation: -16 },
  right: { x: 120, y: 40, rotation: 16 },
};

type Bit = { left: number; top: number; size: number; z: number; rotate?: number };

const photos = {
  strawberry: { src: '/images/ingredients/strawberry-half.png', width: 448, height: 512 },
  mango: { src: '/images/ingredients/mango-cube.png', width: 497, height: 512 },
  lemon: { src: '/images/ingredients/lemon-slice.png', width: 512, height: 496 },
  pomelo: { src: '/images/ingredients/pomelo.png', width: 512, height: 446 },
  ice: { src: '/images/ingredients/ice-cube.png', width: 512, height: 510 },
  mint: { src: '/images/ingredients/mint-leaf.png', width: 512, height: 397 },
};

const ingredients: (Bit & { photo: keyof typeof photos })[] = [
  { photo: 'mint', left: 0, top: 31, size: 13, z: 5, rotate: -40 },
  { photo: 'strawberry', left: 1, top: 17, size: 14, z: 30, rotate: -18 },
  { photo: 'mango', left: 3, top: 66, size: 11, z: 30, rotate: -14 },
  { photo: 'mango', left: 14, top: 80, size: 8, z: 30, rotate: 18 },
  { photo: 'mint', left: 0, top: 84, size: 11, z: 5, rotate: 30 },
  { photo: 'strawberry', left: 21, top: 72, size: 11, z: 30, rotate: 24 },
  { photo: 'ice', left: 23, top: 1, size: 7.5, z: 30, rotate: 16 },
  { photo: 'lemon', left: 35, top: 0, size: 10, z: 5, rotate: 20 },
  { photo: 'mango', left: 84, top: 20, size: 10, z: 5, rotate: 12 },
  { photo: 'ice', left: 87, top: 41, size: 10, z: 30, rotate: 8 },
  { photo: 'pomelo', left: 76, top: 63, size: 17, z: 30, rotate: -28 },
  { photo: 'mango', left: 68, top: 83, size: 9, z: 30, rotate: -12 },
  { photo: 'mango', left: 92, top: 83, size: 7, z: 30, rotate: 20 },
];

const pearls: Bit[] = [
  { left: 94, top: 20, size: 3.4, z: 5 },
  { left: 97, top: 72, size: 3.8, z: 30 },
  { left: 28, top: 92, size: 3.6, z: 30 },
  { left: 60, top: 94, size: 3.4, z: 30 },
];

const stars: (Bit & { tone: string })[] = [
  { left: 25, top: 7, size: 3, z: 5, tone: 'text-sun-300' },
  { left: 1, top: 15, size: 2.4, z: 5, tone: 'text-snow' },
  { left: 98, top: 42, size: 2.6, z: 5, tone: 'text-snow' },
];

function heroLabel(lines: readonly [string, string]) {
  return (
    <>
      {lines[0]}
      <br />
      <span className="pl-[0.5em]">{lines[1]}</span>
    </>
  );
}

const labelCopy: Record<string, ReactNode> = {
  labelFreshFruits: heroLabel(menuCopy.hero.labelFreshFruits),
  labelChewyBoba: heroLabel(menuCopy.hero.labelChewyBoba),
  labelRealGoodness: heroLabel(menuCopy.hero.labelRealGoodness),
};

const labels: { id: keyof typeof labelCopy; left: number; top: number; rotate: number }[] = [
  { id: 'labelFreshFruits', left: 3, top: 2, rotate: -10 },
  { id: 'labelChewyBoba', left: 80, top: 4, rotate: -8 },
  { id: 'labelRealGoodness', left: -3, top: 47, rotate: -8 },
];

const bitStyle = ({ left, top, size, z, rotate }: Bit): CSSProperties => ({
  left: `${left}%`,
  top: `${top}%`,
  width: `${size}%`,
  zIndex: z,
  rotate: rotate ? `${rotate}deg` : undefined,
});

const STAR_PATH =
  'M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z';

const enters = 'motion-safe:opacity-0';

type MenuHeroProps = {
  ready: boolean;
};

export function MenuHero({ ready }: MenuHeroProps) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!ready) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const q = gsap.utils.selector(rootRef);
        const all = (name: string) => q<HTMLElement>(`[data-menu-hero="${name}"]`);
        const drinkLayers = all('drink');
        const shapes = all('shape');
        const bits = all('bit');
        const labelEls = all('label');
        const sparkles = all('sparkle');
        const spinners = q<HTMLElement>('[data-menu-hero-spin]');
        const [headline] = all('headline');

        const words = SplitText.create(headline, { type: 'words' }).words;

        const ambient = () => {
          drinkLayers.forEach((layer, i) => {
            gsap.to(layer, {
              y: i % 2 ? 7 : -7,
              rotation: i % 2 ? 1.2 : -1.2,
              duration: 2.6 + i * 0.4,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            });
          });
          bits.forEach((bit, i) => {
            gsap.to(bit, {
              y: i % 2 ? -9 : 9,
              rotation: i % 3 ? 8 : -8,
              duration: 2.2 + (i % 4) * 0.5,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            });
          });
          labelEls.forEach((label, i) => {
            gsap.to(label, {
              rotation: i % 2 ? -3 : 3,
              y: -4,
              duration: 1.8 + i * 0.3,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            });
          });
          gsap.to(sparkles, {
            scale: 0.6,
            opacity: 0.5,
            duration: 1.4,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            stagger: { each: 0.35, from: 'random' },
          });
          gsap.to(shapes, {
            scale: 1.03,
            duration: 3.4,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            stagger: 0.6,
          });
          gsap.to(spinners, { rotation: 360, duration: 90, ease: 'none', repeat: -1 });
        };

        const intro = gsap.timeline({ defaults: { duration: 0.9, ease: 'back.out(1.6)' }, onComplete: ambient });

        intro.fromTo(
          shapes,
          { scale: 0.5, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.3)', stagger: 0.1 },
          0,
        );

        intro
          .fromTo(all('eyebrow'), { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.6 }, 0.05)
          .set(headline, { opacity: 1 }, 0.15)
          .from(
            words,
            {
              opacity: 0,
              yPercent: 55,
              rotation: 6,
              scale: 0.9,
              transformOrigin: '50% 100%',
              duration: 0.8,
              stagger: 0.09,
            },
            0.15,
          )
          .fromTo(all('intro'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.5)
          .fromTo(
            all('bar'),
            { opacity: 0, y: 22, scale: 0.97 },
            { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.4)' },
            0.62,
          );

        drinkLayers.forEach((layer, i) => {
          intro.fromTo(
            layer,
            { ...ENTER_FROM[(layer.dataset.from as From) ?? 'left'], scale: 0.75, opacity: 0 },
            { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
            0.3 + i * 0.15,
          );
        });
        intro.fromTo(
          [...bits, ...sparkles],
          { scale: 0, opacity: 0, rotation: -40 },
          {
            scale: 1,
            opacity: 1,
            rotation: 0,
            duration: 0.55,
            ease: 'back.out(2.2)',
            stagger: { each: 0.035, from: 'random' },
          },
          0.7,
        );
        intro.fromTo(
          labelEls,
          { scale: 0.3, opacity: 0, rotation: -18 },
          { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.4)', stagger: 0.15 },
          1.0,
        );

        const parallax = {
          ease: 'none',
          scrollTrigger: { trigger: rootRef.current, start: 'top top', end: 'bottom top', scrub: true },
        };
        gsap.to(q('[data-menu-hero-parallax="copy"]'), { y: -36, ...parallax });
        gsap.to(q('[data-menu-hero-parallax="art"]'), { y: 48, ...parallax });
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [ready] },
  );

  return (
    <section
      ref={rootRef}
      data-menu-hero="root"
      className="relative isolate overflow-hidden pt-22 text-snow"
      style={{ backgroundImage: heroBackdropImage }}
    >
      <Container
        className={cn(
          "relative grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 pt-6 pb-14 [grid-template-areas:'copy''bar''art'] sm:pt-8 sm:pb-16",
          "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pt-4 md:[grid-template-areas:'copy_art''bar_bar']",
          "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-y-0 lg:pb-12 lg:[grid-template-areas:'copy_art''bar_art']",
        )}
      >
        <div data-menu-hero-parallax="copy" className="relative z-10 [grid-area:copy] md:self-center lg:self-end">
          <p
            data-menu-hero="eyebrow"
            className={cn(
              'mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-snow uppercase ring-1 ring-white/25 backdrop-blur-sm sm:mb-5 sm:text-sm',
              enters,
            )}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              data-menu-hero="sparkle"
              className={cn('size-3.5 shrink-0 fill-sun-300', enters)}
            >
              <path d={STAR_PATH} />
            </svg>
            {menuCopy.hero.eyebrow}
          </p>
          <h1
            data-menu-hero="headline"
            className={cn(
              'font-display-condensed text-[clamp(2.75rem,7vw,5rem)] leading-[0.9] uppercase text-snow [text-shadow:0_0.05em_0_var(--color-brand-800)] motion-safe:opacity-0',
              enters,
            )}
          >
            {menuCopy.hero.headlineBefore}
            <span className="text-sun-300">{menuCopy.hero.headlineHighlight}</span>
          </h1>
          <p data-menu-hero="intro" className={cn('mt-3 text-base text-snow/85 sm:text-lg', enters)}>
            {menuCopy.hero.intro}
          </p>
        </div>
        <div data-menu-hero-parallax="copy" className="relative z-10 min-w-0 [grid-area:bar] lg:self-start lg:pt-6">
          <div data-menu-hero="bar" className={enters}>
            <MenuBranchBar />
          </div>
        </div>

        <div
          aria-hidden="true"
          data-menu-hero-parallax="art"
          className="relative -mb-6 [grid-area:art] md:mb-0 md:self-center lg:-mb-4"
        >
          <div className="@container relative mx-auto aspect-7/5 w-[82%] max-w-[24rem] sm:w-full sm:max-w-[32rem] md:max-w-none lg:max-w-[38rem]">
            <div className="absolute top-[52%] left-1/2 z-0 aspect-square w-[92%] -translate-1/2">
              <span
                data-menu-hero="shape"
                className={cn(
                  'absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.3),rgb(188_215_255/0.14)_55%,transparent)]',
                  enters,
                )}
              />
            </div>
            <div className="absolute top-[52%] left-1/2 z-0 aspect-square w-[84%] -translate-1/2">
              <span data-menu-hero="shape" className={cn('absolute inset-0 rounded-full border border-white/10', enters)} />
            </div>
            <div className="absolute top-[52%] left-1/2 z-0 aspect-square w-[66%] -translate-1/2">
              <span
                data-menu-hero="shape"
                data-menu-hero-spin
                className={cn('absolute inset-0 rounded-full border-2 border-dashed border-white/20', enters)}
              />
            </div>
            <div className="absolute top-[52%] left-1/2 z-0 aspect-square w-[48%] -translate-1/2">
              <span data-menu-hero="shape" className={cn('absolute inset-0 rounded-full border border-white/15', enters)} />
            </div>
            <span
              data-menu-hero="shape"
              className={cn(
                'absolute bottom-[1%] left-[18%] z-[8] h-[9%] w-[66%] rounded-full bg-[radial-gradient(closest-side,rgb(15_33_71/0.4),transparent)]',
                enters,
              )}
            />

            {drinks.map((drink) => (
              <div key={drink.src} className={cn('absolute', drink.className)} style={{ zIndex: drink.z }}>
                <div data-menu-hero="drink" data-from={drink.from} className={cn('h-full', enters)}>
                  <Image
                    src={drink.src}
                    alt=""
                    width={drink.width}
                    height={drink.height}
                    sizes={drink.sizes}
                    priority={drink.preload}
                    className="h-full w-auto max-w-none drop-shadow-[0_18px_20px_rgb(15_33_71/0.35)]"
                  />
                </div>
              </div>
            ))}

            {ingredients.map(({ photo, ...bit }, i) => (
              <span key={`${photo}-${i}`} data-menu-hero="bit" className={cn('absolute block', enters)} style={bitStyle(bit)}>
                <Image
                  {...photos[photo]}
                  alt=""
                  sizes="(min-width: 1024px) 110px, 80px"
                  className="block h-auto w-full drop-shadow-[0_8px_10px_rgb(15_33_71/0.35)]"
                />
              </span>
            ))}
            {pearls.map((pearl, i) => (
              <span
                key={`pearl-${i}`}
                data-menu-hero="bit"
                className={cn(
                  'absolute block aspect-square rounded-full bg-[radial-gradient(circle_at_32%_28%,#5a4a63_0%,#231a2b_38%,#0b0710_100%)] shadow-[0_4px_8px_rgb(15_33_71/0.35)]',
                  enters,
                )}
                style={bitStyle(pearl)}
              />
            ))}
            {stars.map((star, i) => (
              <svg
                key={`star-${i}`}
                viewBox="0 0 24 24"
                data-menu-hero="sparkle"
                className={cn('absolute block fill-current', star.tone, enters)}
                style={bitStyle(star)}
              >
                <path d={STAR_PATH} />
              </svg>
            ))}

            {labels.map((label) => (
              <span
                key={label.id}
                data-menu-hero="label"
                className={cn(
                  'absolute z-40 block text-[4.6cqw] leading-[0.85] whitespace-nowrap text-snow [text-shadow:0_0.06em_0_var(--color-brand-800)]',
                  menuScript.className,
                  enters,
                )}
                style={{ left: `${label.left}%`, top: `${label.top}%`, rotate: `${label.rotate}deg` }}
              >
                {labelCopy[label.id]}
                <svg
                  viewBox="0 0 20 20"
                  className="absolute -top-[0.35em] -right-[0.7em] w-[0.7em] stroke-current"
                  fill="none"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <path d="M2 17 7 14M8 4 9.5 10M17 3 13 9" />
                </svg>
              </span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
