import Image from "next/image";
import type { ComponentType } from "react";
import { Container } from "@/components/home-redesign/ui/Container";
import { cn } from "@/components/home-redesign/lib/cn";
import { AppPromoMotion } from "./AppPromoMotion";
import {
  Droplet,
  IceCube,
  Mango,
  MangoCube,
  MangoCup,
  OrangeBuddyWave,
  Sparkle,
  TeaLeaf,
} from "./Illustrations";
import { PhoneMockup } from "./PhoneMockup";
import { StoreBadges } from "./StoreBadges";

type Garnish = {
  art: ComponentType;
  /** Position, size, rotation (and colour for sparkles), in rem on the 38×40rem stage. */
  className: string;
  /** In front of the phone rather than behind it. */
  front?: boolean;
  /** Seconds of animation delay; set it to make the piece bob gently. */
  float?: number;
};

// Ingredients around the phone and cup. Mango cubes and drops fly up out of the cup's splash.
const garnishes: Garnish[] = [
  { art: Mango, float: 0, className: "left-[1rem] top-[5rem] w-[7.5rem] -rotate-[24deg]" },
  { art: IceCube, className: "left-[10.5rem] top-[8.5rem] w-[4rem] rotate-12" },
  { art: TeaLeaf, className: "left-[12.5rem] top-0 w-[3.25rem] -rotate-[20deg]" },
  { art: Sparkle, className: "left-[7.5rem] top-[1.5rem] w-[1.75rem] text-sun-400" },
  { art: Sparkle, className: "right-[0.5rem] top-[14rem] w-[1.25rem] text-sun-300" },
  { art: MangoCube, front: true, float: 1, className: "left-[9.5rem] top-[16.5rem] w-[3rem] rotate-6" },
  { art: MangoCube, front: true, className: "left-[3rem] top-[18.5rem] w-[2.4rem] -rotate-12" },
  { art: MangoCube, front: true, float: 2.2, className: "left-[12.75rem] top-[13rem] w-[2.2rem] rotate-[20deg]" },
  { art: Droplet, front: true, className: "left-[6.5rem] top-[15rem] w-[1.3rem] -rotate-[20deg]" },
  { art: Droplet, front: true, className: "left-[0.5rem] top-[22.5rem] w-[1.1rem] -rotate-[45deg]" },
  { art: IceCube, front: true, className: "left-[14rem] bottom-[-1.5rem] w-[5rem] rotate-[16deg]" },
  { art: IceCube, front: true, float: 1.6, className: "right-[-0.5rem] bottom-[8rem] w-[4.5rem] -rotate-12" },
  { art: TeaLeaf, front: true, float: 2.8, className: "right-0 top-[19rem] w-[5rem] rotate-[30deg]" },
  { art: TeaLeaf, front: true, className: "left-[-1.75rem] bottom-0 w-[5rem] -rotate-[50deg]" },
  // From xl the copy and the stage leave a gap; a single orange buddy (after the brand art) sits in it, off
  // the stage's left edge beside the cup (larger from 2xl, where the gap is wider). Kept to one piece so
  // the banner stays uncluttered.
  { art: OrangeBuddyWave, front: true, className: "hidden xl:block left-[-9.5rem] bottom-[0.5rem] w-[8rem] 2xl:left-[-13.5rem] 2xl:w-[11.5rem]" },
];

function GarnishPiece({ art: Art, className, front, float }: Garnish) {
  return (
    // Rotation lives on the wrapper and the bob on the inner box, as both use the `rotate` property.
    <div
      data-app-garnish
      className={cn("absolute drop-shadow-[0_8px_8px_rgb(15_33_71/0.25)]", front ? "z-20" : "z-0", className)}
    >
      <div className={float === undefined ? undefined : "animate-float"} style={float === undefined ? undefined : { animationDelay: `${float}s` }}>
        <Art />
      </div>
    </div>
  );
}

/**
 * The illustrated composition: phone, mango cup, flying mascot and ingredients. It is laid out once on a
 * fixed 38×40rem stage and scaled per breakpoint with `zoom` (which, unlike a transform, also shrinks the
 * layout box), so the composition keeps its proportions at every size.
 */
function PromoStage() {
  return (
    <div className="relative h-[40rem] w-[38rem] shrink-0 [zoom:0.48] min-[400px]:[zoom:0.54] sm:[zoom:0.74] lg:[zoom:0.6] xl:[zoom:0.72] 2xl:[zoom:0.8]">
      {/* Soft pool and dashed orbit behind the phone, as on the offer cards. */}
      <div className="absolute top-[4rem] left-[9rem] size-[30rem] rounded-full bg-white/10" />
      <div className="absolute top-[2rem] left-[7rem] size-[34rem] rounded-full border-2 border-dashed border-white/20" />

      {garnishes.map((g, i) => !g.front && <GarnishPiece key={i} {...g} />)}

      <div data-app-phone className="absolute top-[1.5rem] left-[15rem] z-10">
        <div className="rotate-6 transition-[translate,rotate] duration-500 ease-out group-hover:-translate-y-2 group-hover:rotate-3">
          <PhoneMockup />
        </div>
      </div>

      <div data-app-cup className="absolute bottom-[-3rem] left-[-0.5rem] z-20 w-[16.5rem]">
        <div className="-rotate-12 drop-shadow-[0_18px_20px_rgb(15_33_71/0.35)]">
          <MangoCup />
        </div>
      </div>

      {garnishes.map((g, i) => g.front && <GarnishPiece key={i} {...g} />)}

      {/* Bing Chun swooping in over the phone's top corner, from the original brand artwork. */}
      <div data-app-mascot className="absolute top-[-1rem] right-[-3.5rem] z-30 w-[13rem]">
        <Image
          src="/images/mascot-hero.avif"
          alt=""
          width={600}
          height={602}
          sizes="200px"
          className="sticker block h-auto w-full animate-float [animation-duration:6s]"
        />
      </div>
    </div>
  );
}

/** Banner surface, clipped to its rounded corners; the stage sits outside it so pieces can overlap the edge. */
function BannerBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem]">
      {/* Same blue as the offer cards, with the hero's light and deep colour pools. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(55% 60% at 8% 0%, color-mix(in oklab, var(--color-brand-400) 60%, transparent), transparent 70%)",
            "radial-gradient(50% 60% at 100% 100%, color-mix(in oklab, var(--color-brand-800) 60%, transparent), transparent 70%)",
            "linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))",
          ].join(", "),
        }}
      />
      <div className="absolute -top-24 -left-24 size-80 rounded-full bg-white/10" />
      <svg viewBox="0 0 24 24" className="absolute top-10 left-[44%] hidden size-5 fill-sun-400 lg:block">
        <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" />
      </svg>

      {/* Deep-blue waves along the bottom, after the brand artwork (and echoing the hero's wave). */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[clamp(3.5rem,8vw,7rem)] w-full"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
      >
        <path
          className="fill-brand-700/70"
          d="M0 36C200 66 380 78 600 54C800 32 980 18 1180 38C1300 50 1380 58 1440 50V100H0Z"
        />
        <path
          className="fill-brand-800"
          d="M0 58C180 30 330 20 520 38C700 55 820 82 1010 72C1180 63 1320 32 1440 26V100H0Z"
        />
      </svg>
    </div>
  );
}

/**
 * Rounded blue banner promoting the mobile app: copy and store badges on the left; on the right a phone,
 * a splashing mango cup, the flying mascot and ingredients, breaking out over the banner's edges.
 * On phones (below sm) the copy is centred over the centred illustration, with tighter spacing. The
 * column is pinned to the banner's width there: otherwise the illustration, wider than the banner on the
 * narrowest phones, would widen the column and push the centred copy off to the right.
 */
export function AppPromoSection() {
  return (
    // overflow-x-clip is a safety
    // net so decoration can never cause sideways scroll (unlike overflow-hidden it doesn't clip vertically).
    // AppPromoMotion reveals the banner on scroll; the `data-app-*` attributes are its hooks.
    <AppPromoMotion
      aria-labelledby="app-promo-heading"
      className="overflow-x-clip bg-white pt-6 pb-24 sm:pt-8 sm:pb-28 lg:pt-10 lg:pb-32"
    >
      <Container>
        <div
          data-app-banner
          className="group relative isolate grid items-center px-6 pt-12 text-snow max-sm:grid-cols-[minmax(0,1fr)] max-sm:px-5 max-sm:pt-10 max-sm:text-center sm:px-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-x-10 xl:grid-cols-[1fr_1.1fr] lg:px-16 lg:pt-0 xl:px-20"
        >
          <BannerBackdrop />

          <div className="relative z-10 max-w-xl max-sm:mx-auto lg:py-16">
            {/* Same type treatment as the other section headings, in white with the sun accent. */}
            <h2
              id="app-promo-heading"
              data-app-heading
              className="font-display font-semibold [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] text-[clamp(2.5rem,5vw,4.25rem)] leading-[1.08] tracking-[-0.01em] uppercase"
            >
              Your Favourite Sips. <span className="block whitespace-nowrap text-sun-300">One Tap Away.</span>
            </h2>
            <p data-app-copy className="mt-6 max-w-md text-lg leading-relaxed text-brand-100 max-sm:mx-auto max-sm:mt-4 max-sm:text-base">
              Your favourite Bing Chun drinks, always within reach. Discover, choose, and order from the app.
            </p>
            <div data-app-copy className="mt-9 max-sm:mt-7">
              <StoreBadges />
            </div>
          </div>

          {/* Wholly decorative. Anchored to the banner's bottom, so the cup dips over the edge. */}
          <div aria-hidden="true" className="relative mt-12 flex justify-center max-sm:mt-8 lg:mt-0 lg:self-end">
            <PromoStage />
          </div>
        </div>
      </Container>
    </AppPromoMotion>
  );
}
