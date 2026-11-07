import Image from "next/image";
import { Container } from "@/components/home-redesign/ui/Container";
import { BrandStatementMotion } from "./BrandStatementMotion";

type InlineTreatProps = {
  src: string;
  width: number;
  height: number;
  /** Tailwind rotate class, so neighbouring treats can tilt different ways. */
  tilt: string;
};

/**
 * Product image set inline like a word. Sized in em so it scales with the text;
 * the negative margins keep it from pushing the lines apart.
 */
function InlineTreat({ src, width, height, tilt }: InlineTreatProps) {
  return (
    <Image
      src={src}
      alt=""
      width={width}
      height={height}
      sizes="(min-width: 1024px) 80px, 56px"
      data-treat
      className={`mx-[-0.05em] my-[-0.15em] inline-block h-[1.5em] w-auto align-middle drop-shadow-[0_8px_10px_rgb(15_33_71/0.25)] ${tilt}`}
    />
  );
}

/**
 * Calm statement banner that bridges the hero and the product section:
 * one bold centred line of copy with three treats set inline, spread across different lines
 * and positions so they never stack on top of each other.
 * BrandStatementMotion reveals it word by word on scroll; `data-statement` / `data-treat` are its hooks.
 */
export function BrandStatementSection() {
  return (
    // Starts on the page background (the colour of the hero's bottom wave) so there is no seam.
    // Top padding adds to the 4rem white strip at the bottom of the hero.
    <BrandStatementMotion className="bg-linear-to-b from-white to-brand-50 pt-10 pb-20 sm:pt-14 sm:pb-24 lg:pt-20 lg:pb-32">
      <Container>
        {/* Same condensed cut as the hero headline, but at semibold (600) with wider word gaps for a calmer read.
            Width is in em so the statement wraps to the same ~4 lines at every desktop/tablet size. */}
        <h2
          data-statement
          className="font-display mx-auto max-w-[18em] text-center font-semibold [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.15em] text-[clamp(2rem,4.75vw,4.5rem)] leading-[1.2] tracking-[-0.01em] text-balance text-brand-700 uppercase"
        >
          {/* nowrap keeps "soft-serve" from splitting at its hyphen, and keeps each treat on the
              same line as the word before it. */}
          Every{" "}
          <span className="whitespace-nowrap">
            swirl{" "}
            <InlineTreat
              src="/images/products/Mix-Choco-Vanilla-Ice-Cream.png"
              width={249}
              height={800}
              tilt="rotate-6"
            />
          </span>{" "}
          is a little celebration&nbsp; silky <span className="whitespace-nowrap">soft-serve</span>{" "}
          cones, rich chocolate twists, and loaded{" "}
          <span className="whitespace-nowrap">
            sundaes{" "}
            <InlineTreat
              src="/images/products/Strawberry-Sundae-360.png"
              width={463}
              height={800}
              tilt="-rotate-6"
            />
          </span>{" "}
          topped with{" "}
          <span className="whitespace-nowrap">
            fruit{" "}
            <InlineTreat
              src="/images/products/Mango-Sundae.png"
              width={426}
              height={800}
              tilt="rotate-6"
            />
          </span>{" "}
          and cookies to brighten your day.
        </h2>
      </Container>
    </BrandStatementMotion>
  );
}
