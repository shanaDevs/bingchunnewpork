"use client";

import { ArrowDown, ShoppingBag, Sparkles, TicketPercent } from "lucide-react";
import { Caveat_Brush } from "next/font/google";
import { useRef, type CSSProperties } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { Container } from "@/components/home-redesign/ui/Container";
import { DealMachine } from "./DealMachine";
import { gsap, SplitText, useGSAP } from "./gsap";
import { enters, focusRing, Sparkle } from "./parts";

// Handwritten face for the callout beside the machine.
const script = Caveat_Brush({ weight: "400", subsets: ["latin"] });

/** Sparkles round the machine: `left`, `top` and `size` (width) in % of the art canvas. */
type Bit = { left: number; top: number; size: number };

const sparkles: (Bit & { tone: string })[] = [
  { left: 30, top: 34, size: 3.2, tone: "text-sun-300" },
  { left: 88, top: 54, size: 2.6, tone: "text-snow" },
  { left: 96, top: 18, size: 3, tone: "text-sun-300" },
  { left: 33, top: 6, size: 2.2, tone: "text-snow" },
];

const bitStyle = ({ left, top, size }: Bit): CSSProperties => ({ left: `${left}%`, top: `${top}%`, width: `${size}%` });

/**
 * The Offers page hero, "Good Sips. Better Deals.": an oversized headline (two lines on phones and tablets, one on
 * desktop, the second part sunny yellow), the intro, then Explore Deals (down to the deals) on tablets, or a
 * frosted bar of facts on desktop (deals live, Spin & Win, one deal per order). On the right the Deal Machine
 * (DealMachine: a capsule-toy machine that drops and opens a capsule with an offer every few seconds) on a soft
 * glow, with sparkles and a handwritten callout around it.
 *
 * `dealCount` is the number of live deals, or null while they load.
 *
 * The section is `data-hero="root"` with a `data-decor="wave"` marker on its bottom edge, which is how the site
 * header tells it's over a blue hero (it keeps its white items until the blue has scrolled away).
 *
 * GSAP:
 * - Entrance (~1.6s): the glow and ring grow in; the eyebrow slides up, the headline punches up word by word,
 *   then the intro and button (or facts bar); the machine bounces up, then the sparkles pop in and the callout
 *   last. The machine's own loop starts after that.
 * - Ambient: the callout rocks, sparkles twinkle.
 * - Scroll: a light parallax as the hero leaves, the copy drifting up and the art lagging behind.
 * Nothing moves when reduced motion is requested.
 */
export function OffersHero({ dealCount }: { dealCount: number | null }) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(rootRef);
        const all = (name: string) => q<HTMLElement>(`[data-offers-hero="${name}"]`);
        const shapes = all("shape");
        const twinkles = all("sparkle");
        const [machine] = all("machine");
        const [label] = all("label");
        const [art] = q<HTMLElement>('[data-offers-hero-parallax="art"]');
        const [headline] = all("headline");

        // Words only (no line split), so wrapping stays natural if the display font swaps in later.
        const words = SplitText.create(headline, { type: "words" }).words;

        const ambient = () => {
          gsap.to(label, { rotation: 3, y: -4, duration: 1.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
          gsap.to(twinkles, { scale: 0.55, opacity: 0.45, duration: 1.3, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: 0.35, from: "random" } });
        };

        const intro = gsap.timeline({ defaults: { duration: 0.9, ease: "back.out(1.6)" }, onComplete: ambient });

        intro
          .fromTo(shapes, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, ease: "back.out(1.3)", stagger: 0.1 }, 0)
          .fromTo(all("eyebrow"), { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.6 }, 0.05)
          .set(headline, { opacity: 1 }, 0.15)
          .from(words, { opacity: 0, yPercent: 60, rotation: 6, scale: 0.88, transformOrigin: "50% 100%", duration: 0.85, stagger: 0.1 }, 0.15)
          .fromTo(all("intro"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.6)
          .fromTo(all("cta"), { opacity: 0, y: 20, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.1 }, 0.72)
          .fromTo(
            machine,
            { opacity: 0, y: 70, scale: 0.7, transformOrigin: "50% 100%" },
            { opacity: 1, y: 0, scale: 1, duration: 1.05, ease: "back.out(1.7)" },
            0.3,
          )
          .fromTo(
            twinkles,
            { scale: 0, opacity: 0, rotation: -40 },
            { scale: 1, opacity: 1, rotation: 0, duration: 0.55, ease: "back.out(2.2)", stagger: { each: 0.04, from: "random" } },
            0.85,
          )
          .fromTo(label, { scale: 0.3, opacity: 0, rotation: -18 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(2.4)" }, 1.15);

        const parallax = { ease: "none", scrollTrigger: { trigger: rootRef.current, start: "top top", end: "bottom top", scrub: true } };
        gsap.to(q('[data-offers-hero-parallax="copy"]'), { y: -40, ...parallax });
        gsap.to(art, { y: 50, ...parallax });
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  const facts = [
    { Icon: TicketPercent, kicker: "Live now", value: dealCount === null ? "…" : `${dealCount} ${dealCount === 1 ? "deal" : "deals"}` },
    { Icon: Sparkles, kicker: "Spin & Win", value: "One free spin a visit" },
    { Icon: ShoppingBag, kicker: "Good to know", value: "One deal per order", className: "max-[87.5rem]:hidden" },
  ];

  return (
    <section
      ref={rootRef}
      data-hero="root"
      aria-labelledby="offers-hero-heading"
      className="relative isolate overflow-hidden pt-22 text-snow"
      style={{ backgroundImage: heroBackdropImage }}
    >
      {/* Phones and 640px: one column, copy, button, art. 768px: copy and button centred together on the left (the
          1fr rows either side), the art across all four rows on the right. Desktop: copy | art, with room at the
          bottom for the ribbons, which overlap the hero by 5rem there. */}
      <Container className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-x-8 gap-y-6 pt-6 pb-14 sm:gap-y-4 sm:pt-8 sm:pb-[clamp(4.5rem,9vw,8rem)] md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:max-lg:grid-rows-[1fr_auto_auto_1fr] md:max-lg:gap-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-x-10 lg:pt-4 lg:pb-26">
        <div data-offers-hero-parallax="copy" className="relative z-10 md:max-lg:col-start-1 md:max-lg:row-start-2">
          <p
            data-offers-hero="eyebrow"
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-snow uppercase ring-1 ring-white/25 backdrop-blur-sm sm:mb-5 sm:text-sm",
              enters,
            )}
          >
            <Sparkle className="size-3.5 shrink-0 text-sun-300" />
            Bing Chun Deals
          </p>
          <h1
            id="offers-hero-heading"
            data-offers-hero="headline"
            className={cn(
              "font-display-condensed text-[clamp(3.25rem,15vw,6rem)] leading-[0.86] tracking-[-0.01em] uppercase [text-shadow:0_0.05em_0_var(--color-brand-800)] md:text-[7vw] lg:text-[clamp(2.75rem,7vw,5rem)] lg:leading-[0.9] lg:tracking-normal lg:whitespace-nowrap",
              // Phones: the menu hero's headline size.
              "max-sm:text-[2.75rem] max-sm:leading-[0.9]",
              enters,
            )}
          >
            <span className="block lg:inline">Good Sips.</span> <span className="block text-sun-300 lg:inline">Better Deals.</span>
          </h1>
          <p data-offers-hero="intro" className={cn("mt-4 max-w-md text-base text-snow/85 max-sm:mt-3 sm:mt-5 sm:text-lg lg:mt-3 lg:max-w-[31rem] lg:text-base xl:text-lg", enters)}>
            Sweet savings on bubble teas, fruit teas and soft-serve. Grab a deal, fill your bag and sip happy.
          </p>
          {/* Desktop, in place of the button: the deals at a glance, in a frosted bar. The third fact joins once the
              column is wide enough (1400px). */}
          <ul data-offers-hero="cta" className={cn("mt-5 hidden items-center gap-5 rounded-full bg-white/10 py-2 pr-6 pl-2 ring-1 ring-white/25 ring-inset backdrop-blur-sm lg:inline-flex", enters)}>
            {facts.map(({ Icon, kicker, value, className }, i) => (
              <li key={kicker} className={cn("flex items-center gap-2.5", i > 0 && "border-l border-white/20 pl-5", className)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-600">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <p className="flex flex-col leading-tight whitespace-nowrap">
                  <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-snow/70 uppercase">{kicker}</span>
                  <span className="text-sm font-semibold xl:text-base">{value}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Tablets only: the deals are right below there on desktop, and phones go without it. */}
        <div
          data-offers-hero-parallax="copy"
          className="relative z-10 hidden sm:mt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-3 md:mt-8 md:max-lg:col-start-1 md:max-lg:row-start-3 md:max-lg:self-start lg:hidden"
        >
          <a
            href="#deals"
            data-offers-hero="cta"
            className={cn(
              "group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-brand-700 shadow-lg shadow-brand-950/20 transition-colors hover:bg-brand-50 focus-visible:outline-white",
              focusRing,
              enters,
            )}
          >
            Explore Deals
            <ArrowDown className="size-4.5 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
          </a>
        </div>

        {/* The art: decorative only. A 6:5 canvas sized by its width; every piece is placed in % of it and the
            callout in cqw, so the whole composition scales together. */}
        <div aria-hidden="true" data-offers-hero-parallax="art" className="relative md:max-lg:col-start-2 md:max-lg:row-span-4 md:max-lg:row-start-1 lg:-mb-4">
          <div className="@container relative mx-auto aspect-6/5 w-[82%] max-w-[24rem] sm:w-full sm:max-w-[34rem] md:max-w-none lg:mr-0 lg:w-[calc(100%*6/7-4.2rem)] xl:mr-[9%] lg:max-w-[calc(38rem*6/7-4.2rem)]">
            {/* Stage: a soft glow and a ring round the dome, and a ground shadow, each centred in a wrapper so
                GSAP's scale never fights the translate. */}
            <div className="absolute top-[37%] left-[61.5%] aspect-square w-[64%] -translate-1/2">
              <span
                data-offers-hero="shape"
                className={cn("absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgb(255_226_122/0.45),rgb(255_226_122/0.12)_55%,transparent)]", enters)}
              />
            </div>
            <div className="absolute top-[37%] left-[61.5%] aspect-square w-[54%] -translate-1/2">
              <span data-offers-hero="shape" className={cn("absolute inset-0 rounded-full border-2 border-dashed border-white/25", enters)} />
            </div>
            <span
              data-offers-hero="shape"
              className={cn("absolute bottom-[1%] left-[4%] h-[8%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgb(15_33_71/0.42),transparent)]", enters)}
            />

            <DealMachine />

            {sparkles.map((sparkle) => (
              <span key={`sparkle-${sparkle.left}`} className="absolute z-30 block" style={bitStyle(sparkle)}>
                <Sparkle data-offers-hero="sparkle" className={cn("block w-full", sparkle.tone, enters)} />
              </span>
            ))}

            <span
              data-offers-hero="label"
              className={cn(
                "absolute top-[0%] left-[75%] z-40 block text-[5.2cqw] leading-[0.85] whitespace-nowrap text-snow [text-shadow:0_0.06em_0_var(--color-brand-800)]",
                script.className,
                enters,
              )}
              style={{ rotate: "-8deg" }}
            >
              sweet
              <br />
              <span className="pl-[0.5em]">savings!</span>
              <svg viewBox="0 0 20 20" className="absolute -top-[0.35em] -right-[0.7em] w-[0.7em] stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M2 17 7 14M8 4 9.5 10M17 3 13 9" />
              </svg>
            </span>
          </div>
        </div>
      </Container>

      {/* The white wave into the page, as on the homepage hero. Not on phones or desktop, where it would leave a band
          of white between the hero and the ribbons: there the blue runs straight into them. */}
      <svg aria-hidden="true" className="absolute inset-x-0 -bottom-px z-1 h-[clamp(2.5rem,5vw,5.5rem)] w-full text-snow max-sm:hidden lg:hidden" viewBox="0 0 1440 100" preserveAspectRatio="none">
        <path fill="currentColor" d="M0 58C180 30 330 20 520 38C700 55 820 82 1010 72C1180 63 1320 32 1440 26V100H0Z" />
      </svg>
      {/* Where the blue ends, for the site header (see above). */}
      <span aria-hidden="true" data-decor="wave" className="pointer-events-none absolute inset-x-0 bottom-0 h-0" />
    </section>
  );
}

/**
 * Two crossing ticker ribbons under the hero, campaign style: a sunny one sliding left over a blue one sliding
 * right, each holding its words twice so the loop is seamless (offers-ticker in offers.css). Decorative; the words
 * repeat the hero's message.
 */
export function OffersTicker() {
  const words = ["Good sips", "Better deals", "Sweet savings", "Fresh flavours", "Happy bags"];

  const strip = (tone: string, reverse = false) => (
    <div className={cn("flex w-max animate-[offers-ticker_38s_linear_infinite]", reverse && "[animation-direction:reverse]")}>
      {[0, 1].map((copy) => (
        <ul key={copy} className="flex shrink-0 items-center">
          {[...words, ...words].map((word, i) => (
            <li key={i} className="flex items-center">
              <span className="px-5 sm:px-7">{word}</span>
              <Sparkle className={cn("size-4 sm:size-5", tone)} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );

  return (
    // Phones: the blue ribbon lies across the hero's bottom edge and the yellow one crosses it only a little, so on
    // a narrow screen both read.
    <div aria-hidden="true" className="relative z-10 -mt-[clamp(2.5rem,4vw,3.5rem)] overflow-hidden py-6 max-sm:-mt-11 sm:py-8 lg:-mt-20">
      <div className="font-display-condensed relative -mx-4 rotate-[2.5deg] bg-brand-700 py-2 text-lg text-snow/90 uppercase max-sm:rotate-2 sm:py-2.5 sm:text-2xl">
        {strip("text-sun-300", true)}
      </div>
      <div className="font-display-condensed relative -mx-4 -mt-9 -rotate-2 bg-sun-300 py-2.5 text-xl text-brand-900 uppercase shadow-[0_10px_24px_rgb(15_33_71/0.18)] max-sm:-mt-4 max-sm:-rotate-2 sm:-mt-12 sm:py-3 sm:text-3xl">
        {strip("text-brand-600")}
      </div>
    </div>
  );
}
