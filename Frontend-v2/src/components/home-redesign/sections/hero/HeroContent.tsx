import { ArrowRight } from "lucide-react";
import { Button } from "@/components/home-redesign/ui/Button";
import { HERO_TARGETS, heroCopy } from "./hero.config";

// Sizes in cqw scale with the canvas, so each line keeps its width relative to the composition.
const headlineSizes = [
  // "Sip into"
  "text-[13.9cqw] sm:text-[12.3cqw] wide:text-[10.6cqw]",
  // "Happiness"
  "text-[21.5cqw] sm:text-[19cqw] wide:text-[16.4cqw]",
];

/**
 * The headline sits behind the front drinks (z-10); the CTA sits in front (z-40) in the
 * lower-left corner on desktop and tablet, and centred below the drinks on phones.
 * Its desktop offsets are min(rem, cqw) pairs that are equal on a 1280px canvas: from there up they
 * stay fixed, and on smaller landscape canvases (1024–1279px) they shrink with the composition.
 */
export function HeroContent() {
  return (
    <>
      <div className="absolute inset-x-0 top-[4.8%] z-10 text-center sm:top-[3%] wide:top-[calc(max(11.5%,6rem)+1.2cqw+1.83rem)]">
        <h1
          id="hero-heading"
          data-hero={HERO_TARGETS.headline}
          className="font-display-condensed leading-[0.78] tracking-[-0.01em] text-snow uppercase"
        >
          {heroCopy.headlineLines.map((line, i) => (
            <span
              key={line}
              data-hero={HERO_TARGETS.headlineLine}
              className={`block ${headlineSizes[i]} [text-shadow:0_0.05em_0_var(--color-brand-800)]`}
            >
              {line}
            </span>
          ))}
        </h1>
      </div>

      <div className="absolute bottom-[15.2%] left-1/2 z-40 w-max -translate-x-1/2 sm:bottom-[6.5%] sm:left-[5%] sm:w-auto sm:translate-x-0 wide:bottom-[calc(13%+min(6.875rem,8.594cqw))] wide:left-[min(3rem,3.75cqw)] wide:w-[min(21rem,21cqw)] wide:text-left">
        <div data-hero={HERO_TARGETS.cta}>
          <Button
            href={heroCopy.cta.href}
            variant="inverse"
            className="px-7 py-3.5 text-base"
          >
            {heroCopy.cta.label}
            <ArrowRight className="size-4.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </>
  );
}
