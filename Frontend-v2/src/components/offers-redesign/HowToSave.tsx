"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cn } from "@/components/home-redesign/lib/cn";
import { Button } from "@/components/home-redesign/ui/Button";
import { Container } from "@/components/home-redesign/ui/Container";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { hasCompletedOrderSetup } from "@/lib/orderSetup";
import { useCartStore } from "@/store/cartStore";
import { SectionHeading, Sparkle } from "./parts";

/** The three steps, each with its mascot and a tint for its circle. */
const STEPS = [
  {
    id: "pick",
    title: "Pick a deal",
    text: "Find one you love and copy its code. Deals marked “No code needed” are waiting for you in your bag.",
    mascot: "/images/mascots/thinking.png",
    tint: "bg-sun-300/60",
    tilt: "-rotate-3",
  },
  {
    id: "fill",
    title: "Fill your bag",
    text: "Add the treats the deal is for, and check its day, time or minimum spend.",
    mascot: "/images/mascots/takeaway.png",
    tint: "bg-brand-100",
    tilt: "rotate-2",
  },
  {
    id: "save",
    title: "Save in your bag",
    text: "Paste your code in the coupon box, or tap the deal under Available offers. One deal per order.",
    mascot: "/images/mascots/Character_holding_money.png",
    tint: "bg-[#ffd6ea]",
    tilt: "-rotate-2",
  },
] as const;

/**
 * How to Save: three steps from deal to discount. Each step is a mascot in a tinted circle with a numbered sun
 * badge, its title and line. On tablets and desktop a dashed squiggle links the circles, wiping in from the left
 * as the section arrives (OffersReveal: `data-reveal-wipe`); phones list the steps as rows, the circle beside its
 * text. Then Start Your Order: to the menu, or first the order prompt (delivery or takeaway, and the branch) when
 * the customer hasn't set that up yet.
 */
export function HowToSave() {
  const router = useRouter();

  const startOrder = () => {
    if (hasCompletedOrderSetup(useCartStore.getState())) router.push("/menu");
    else openOrderModal({ allowSkip: true });
  };

  return (
    <section aria-labelledby="how-heading" className="relative overflow-hidden bg-[linear-gradient(180deg,#fff,var(--color-brand-50)_35%,var(--color-brand-50)_70%,#fff)] pt-2 pb-14 sm:pb-16 lg:pb-20">
      <Container>
        <SectionHeading id="how-heading" eyebrow="Easy as 1, 2, 3" heading={(highlight) => <>How to {highlight("Save")}</>} />

        <div data-reveal className="relative mt-8 sm:mt-10">
          {/* The squiggle joining the three circles (tablet and desktop). */}
          <svg
            aria-hidden="true"
            data-reveal-wipe
            viewBox="0 0 1000 80"
            preserveAspectRatio="none"
            className="absolute top-6 left-[16.6%] hidden h-16 w-[66.8%] text-brand-300 md:block lg:top-8"
          >
            <path d="M0 40C120 -5 210 85 330 40S540 -5 660 40 880 85 1000 40" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="10 12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          <ol className="relative grid gap-6 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.id} className="flex items-center gap-5 text-left md:flex-col md:gap-0 md:text-center">
                <div data-reveal-pop className={cn("relative grid size-24 shrink-0 place-items-center rounded-full ring-6 ring-white md:size-28 lg:size-32", step.tint, step.tilt)}>
                  <Image src={step.mascot} alt="" width={500} height={500} sizes="128px" className="sticker size-[88%] object-contain" />
                  <span
                    aria-hidden="true"
                    className="font-display-condensed absolute -top-1.5 -left-1.5 grid size-9 place-items-center rounded-full bg-brand-600 text-xl text-snow shadow-lg ring-3 ring-white md:size-10 lg:size-11 lg:text-2xl"
                  >
                    {i + 1}
                  </span>
                  <Sparkle className="absolute -right-2 bottom-3 size-4 text-sun-400" />
                </div>
                <div className="min-w-0 md:mt-4">
                  <p className="text-xs font-bold tracking-[0.18em] text-brand-600 uppercase">Step {i + 1}</p>
                  <h3 className="mt-0.5 text-lg font-bold text-brand-950 sm:text-xl">{step.title}</h3>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600 sm:text-[0.9375rem] md:mx-auto">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div data-reveal className="mt-8 flex justify-center sm:mt-10">
          <Button onClick={startOrder} className="px-8 py-3.5 text-base shadow-lg shadow-brand-600/25">
            Start Your Order
            <ArrowRight className="size-4.5" aria-hidden="true" />
          </Button>
        </div>
      </Container>
    </section>
  );
}
