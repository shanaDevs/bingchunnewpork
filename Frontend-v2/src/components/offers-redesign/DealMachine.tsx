"use client";

import { useRef } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, ScrollTrigger, useGSAP } from "./gsap";
import { Sparkle } from "./parts";

/**
 * The machine's own offers (illustrative, not the page's deals): a percentage and a name each, with the colour of
 * the capsule it comes out of. They take turns, in this order.
 */
const MACHINE_DEALS = [
  { id: "milkTea", name: "Milk Tea Mondays", percent: 15, colour: "#3079ea" },
  { id: "mango", name: "Mango Madness", percent: 20, colour: "#ffd23f" },
  { id: "berry", name: "Berry Sundae Treat", percent: 25, colour: "#ff6fb5" },
  { id: "fruitTea", name: "Fruit Tea Fiesta", percent: 10, colour: "#34d399" },
  { id: "shakes", name: "Shake It Up", percent: 30, colour: "#8ebcff" },
  { id: "weekend", name: "Sweet Weekend", percent: 20, colour: "#a78bfa" },
] as const;

const NAVY = "#0f2147";
/** The mascot logo (as in the header), 467 x 600. */
const LOGO = "/images/logo.avif";

/** The capsules piled in the dome (SVG units: the dome is centred at 130,120 with radius 100). */
const PILE: { x: number; y: number; r: number; colour: string }[] = [
  { x: 112, y: 198, r: 20, colour: "#ff6fb5" },
  { x: 148, y: 198, r: -35, colour: "#3079ea" },
  { x: 70, y: 171, r: 50, colour: "#ffd23f" },
  { x: 103, y: 171, r: -15, colour: "#34d399" },
  { x: 136, y: 171, r: 70, colour: "#a78bfa" },
  { x: 169, y: 171, r: -60, colour: "#ffd23f" },
  { x: 199, y: 168, r: 25, colour: "#ff6fb5" },
  { x: 56, y: 143, r: -40, colour: "#8ebcff" },
  { x: 89, y: 143, r: 15, colour: "#ff6fb5" },
  { x: 122, y: 143, r: -80, colour: "#3079ea" },
  { x: 155, y: 143, r: 40, colour: "#34d399" },
  { x: 188, y: 145, r: -20, colour: "#ffd23f" },
  { x: 82, y: 116, r: 60, colour: "#a78bfa" },
  { x: 118, y: 115, r: -25, colour: "#ffd23f" },
  { x: 158, y: 117, r: 10, colour: "#8ebcff" },
  { x: 104, y: 92, r: 35, colour: "#34d399" },
];

/** The burst of sparkles round the opened capsule: `left`, `top` and `size` in % of the art canvas. */
const SPARKS = [
  { left: 8, top: 78, size: 3 },
  { left: 30, top: 79, size: 2.4 },
  { left: 7, top: 92, size: 2.2 },
  { left: 30, top: 93, size: 2.8 },
];

/** The white flower on Bing Chun's cups (and the mascot logo's), centred on 0,0 with petals about 9 units long. */
function Flower({ outline = true }: { outline?: boolean }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cy="-4.6" rx="3.4" ry="4.8" fill="#fff" stroke={outline ? NAVY : "none"} strokeWidth="1.4" transform={`rotate(${angle})`} />
      ))}
      <circle r="2.4" fill="#f5a524" />
    </g>
  );
}

/** One capsule in the dome, two-tone with a seam, a shine and the cup flower printed on its coloured half. */
function PileCapsule({ x, y, r, colour }: (typeof PILE)[number]) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <circle r="17" fill="#fff" stroke={NAVY} strokeWidth="2.5" />
      <path d="M-17 0A17 17 0 0 1 17 0Z" fill={colour} stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
      <g transform="translate(3 -8) scale(0.62)">
        <Flower outline={false} />
      </g>
      <ellipse cx="-8" cy="-9" rx="4" ry="2.2" fill="#fff" opacity="0.7" transform="rotate(-30 -8 -9)" />
    </g>
  );
}

/**
 * The Offers hero's art: Bing Chun's own capsule-toy deal machine (decorative). A glass dome piled with two-tone
 * capsules printed with the cup flower, the flower as the knob on its lid, on a bright pink body (warm, so it
 * stands out from the hero's blue) with the Bing Chun wordmark and mascot logo on a sunny name plate, a crank and a
 * chute. Every few seconds the crank turns, the pile jostles, a
 * capsule drops out of the chute, rolls out to the left, bounces and pops open, and a ticket rises out of it with
 * one of the machine's offers (MACHINE_DEALS): a compact ticket styled like the page's deal cards, with its
 * percentage and name; the next turn brings the next offer.
 *
 * Laid out on the hero's 6:5 art canvas in %, type in cqw, so it scales with it. The markup is the capsule already
 * open on the first deal: that is the picture under reduced motion. With motion, the capsule, sparkles and card
 * start hidden until GSAP takes them over, so none shows before the machine has popped in. The loop waits for the hero's entrance and pauses while the hero is off screen. The machine itself is
 * `data-offers-hero="machine"`, which the hero's entrance pops in.
 */
export function DealMachine({ className }: { className?: string }) {
  const deals = MACHINE_DEALS;
  const scope = useRef<HTMLDivElement>(null);
  const crankRef = useRef<SVGGElement>(null);
  const knobRef = useRef<SVGGElement>(null);
  const pileRef = useRef<SVGGElement>(null);
  const flapRef = useRef<SVGRectElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        const tickets = q<HTMLElement>("[data-deal-ticket]");
        const sparks = q<HTMLElement>("[data-deal-spark]");
        let shown = -1;
        // Each turn: the next deal's ticket, and its colour on the capsule.
        const nextDeal = () => {
          shown = (shown + 1) % deals.length;
          tickets.forEach((ticket, i) => gsap.set(ticket, { autoAlpha: i === shown ? 1 : 0 }));
          gsap.set(lidRef.current, { backgroundColor: deals[shown].colour });
        };

        const loop = gsap.timeline({ repeat: -1, delay: 1.5, repeatDelay: 0.2, onStart: nextDeal, onRepeat: nextDeal });
        loop
          // The crank turns once and the pile jostles.
          .fromTo(crankRef.current, { rotation: 0 }, { rotation: 360, svgOrigin: "178 298", duration: 1.1, ease: "power2.inOut" }, 0)
          .fromTo(knobRef.current, { rotation: 0 }, { rotation: 72, svgOrigin: "130 5", duration: 1.1, ease: "power2.inOut" }, 0)
          .fromTo(pileRef.current, { y: 0, rotation: 0 }, { y: -4, rotation: 1.5, svgOrigin: "130 200", duration: 0.09, ease: "sine.inOut", yoyo: true, repeat: 7 }, 0.15)
          // The chute's flap folds up and the capsule drops out, rolling left and bouncing to a stop.
          .fromTo(flapRef.current, { scaleY: 1 }, { scaleY: 0.15, transformOrigin: "50% 0%", duration: 0.16, ease: "power2.out" }, 1.0)
          .to(flapRef.current, { scaleY: 1, duration: 0.3, ease: "back.out(2)" }, 1.55)
          .fromTo(capsuleRef.current, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.15 }, 1.05)
          .fromTo(capsuleRef.current, { xPercent: 344, rotation: 0 }, { xPercent: 0, rotation: -360, duration: 0.85, ease: "power1.out" }, 1.05)
          .fromTo(capsuleRef.current, { yPercent: -56 }, { yPercent: 0, duration: 0.85, ease: "bounce.out" }, 1.05)
          // It pops open, sparkles burst and the deal rises out of it.
          .fromTo(lidRef.current, { rotation: 0, x: 0, y: 0, xPercent: 0, yPercent: 0 }, { rotation: -35, xPercent: -18, yPercent: -60, duration: 0.45, ease: "back.out(2)" }, 1.95)
          .fromTo(sparks, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(3)", stagger: 0.05 }, 2.0)
          .to(sparks, { scale: 0.4, autoAlpha: 0, duration: 0.4 }, 2.7)
          .fromTo(ticketRef.current, { autoAlpha: 0, yPercent: 70, scale: 0.2, rotation: 0 }, { autoAlpha: 1, yPercent: 0, scale: 1, rotation: -6, duration: 0.7, ease: "back.out(1.8)" }, 2.0)
          .to(ticketRef.current, { y: -6, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 1 }, 2.8)
          // Then both go, ready for the next turn.
          .to([ticketRef.current, capsuleRef.current], { autoAlpha: 0, scale: 0.85, duration: 0.35, ease: "power2.in" }, 5.2);

        const visibility = ScrollTrigger.create({
          trigger: scope.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => (self.isActive ? loop.resume() : loop.pause()),
        });
        return () => visibility.kill();
      });
      return () => mm.revert();
    },
    { scope },
  );

  const first = deals[0];

  return (
    <div ref={scope} className={cn("absolute inset-0", className)}>
      {/* The machine. */}
      <div data-offers-hero="machine" className="absolute top-[4%] left-[33%] z-20 w-[57%] motion-safe:opacity-0">
        <svg viewBox="0 0 260 340" className="block w-full overflow-visible drop-shadow-[0_18px_24px_rgb(15_33_71/0.4)]">
          <defs>
            <linearGradient id="deal-machine-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7ab8" />
              <stop offset="100%" stopColor="#e0447f" />
            </linearGradient>
            <radialGradient id="deal-machine-jar" cx="45%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#eef5ff" />
              <stop offset="100%" stopColor="#8ebcff" />
            </radialGradient>
            <radialGradient id="deal-machine-glass" cx="38%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.4" />
              <stop offset="45%" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#bcd7ff" stopOpacity="0.25" />
            </radialGradient>
            <clipPath id="deal-machine-badge">
              <circle cx="72" cy="252" r="17.5" />
            </clipPath>
            <clipPath id="deal-machine-dome">
              <circle cx="130" cy="120" r="97" />
            </clipPath>
          </defs>

          {/* The dome: a bright sky-blue inside (so it glows against the hero's blue), the pile, then the glass over
              it with its shine. */}
          <circle cx="130" cy="120" r="100" fill="url(#deal-machine-jar)" />
          <g clipPath="url(#deal-machine-dome)">
            <g ref={pileRef}>
              {PILE.map((capsule) => (
                <PileCapsule key={`${capsule.x}-${capsule.y}`} {...capsule} />
              ))}
            </g>
          </g>
          <circle cx="130" cy="120" r="100" fill="url(#deal-machine-glass)" stroke={NAVY} strokeWidth="4" />
          <path d="M60 92A74 74 0 0 1 108 44" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="8" strokeLinecap="round" />
          <circle cx="66" cy="112" r="4" fill="#fff" opacity="0.7" />

          {/* The lid, with the cup flower for a knob (it twirls a petal with each turn of the crank). */}
          <rect x="96" y="8" width="68" height="22" rx="11" fill="#ffd23f" stroke={NAVY} strokeWidth="3" />
          <g ref={knobRef}>
            <g transform="translate(130 5) scale(1.45)">
              <Flower />
            </g>
          </g>

          {/* The collar and the body, with the name plate. */}
          <rect x="70" y="206" width="120" height="26" rx="8" fill="#ffd23f" stroke={NAVY} strokeWidth="3" />
          <rect x="36" y="226" width="188" height="100" rx="24" fill="url(#deal-machine-body)" stroke={NAVY} strokeWidth="4" />
          <rect x="46" y="236" width="6" height="66" rx="3" fill="#fff" opacity="0.35" />
          {/* The name plate: the mascot logo in a round badge and the wordmark, as in the header. */}
          <rect x="60" y="236" width="144" height="32" rx="16" fill="#ffe27a" stroke={NAVY} strokeWidth="3" />
          <circle cx="72" cy="252" r="19" fill="#fff" stroke={NAVY} strokeWidth="3" />
          <image href={LOGO} x="59.5" y="237" width="23.4" height="30" clipPath="url(#deal-machine-badge)" />
          <text x="148" y="254" textAnchor="middle" fill={NAVY} fontSize="16" fontWeight="800" letterSpacing="-0.2" className="font-display uppercase">
            Bing Chun
          </text>
          <text x="148" y="263.5" textAnchor="middle" fill={NAVY} fillOpacity="0.7" fontSize="5.5" fontWeight="600" letterSpacing="2.4" className="uppercase">
            Sri Lanka
          </text>

          {/* The chute, with its flap. */}
          <rect x="56" y="276" width="56" height="38" rx="10" fill={NAVY} />
          <rect ref={flapRef} x="60" y="279" width="48" height="16" rx="6" fill="#ffd23f" stroke={NAVY} strokeWidth="2.5" />

          {/* The crank. */}
          <circle cx="178" cy="298" r="18" fill="#fff" stroke={NAVY} strokeWidth="3" />
          <g ref={crankRef}>
            <rect x="174" y="279" width="8" height="19" rx="4" fill="#ffd23f" stroke={NAVY} strokeWidth="2.5" />
            <circle cx="178" cy="279" r="6.5" fill="#3079ea" stroke={NAVY} strokeWidth="3" />
          </g>
          <circle cx="178" cy="298" r="6" fill={NAVY} />

          {/* The feet. */}
          <rect x="52" y="322" width="34" height="14" rx="5" fill={NAVY} />
          <rect x="174" y="322" width="34" height="14" rx="5" fill={NAVY} />
        </svg>
      </div>

      {first && (
        <>
          {/* The capsule out of the chute, open (as the loop leaves it each turn): its lid lifted and tipped back. */}
          <div ref={capsuleRef} className="absolute top-[84.2%] left-[15.5%] z-30 aspect-square w-[9%] motion-safe:opacity-0">
            <div className="absolute inset-x-0 bottom-0 h-1/2 rounded-b-full border-[0.5cqw] border-t-0 border-brand-950 bg-white" />
            <div
              ref={lidRef}
              className="absolute inset-x-0 top-0 h-1/2 overflow-hidden rounded-t-full border-[0.5cqw] border-brand-950"
              style={{ backgroundColor: first.colour, transformOrigin: "0% 100%", transform: "translate(-18%, -60%) rotate(-35deg)" }}
            >
              <span className="absolute top-[22%] left-[14%] h-[20%] w-[26%] -rotate-30 rounded-full bg-white/70" />
              <svg viewBox="-6 -6 12 12" className="absolute top-[30%] left-[50%] w-[34%]">
                <Flower outline={false} />
              </svg>
            </div>
          </div>

          {SPARKS.map((spark) => (
            <span key={`${spark.left}-${spark.top}`} className="absolute z-30 block" style={{ left: `${spark.left}%`, top: `${spark.top}%`, width: `${spark.size}%` }}>
              <Sparkle data-deal-spark="" className="block w-full text-sun-300 motion-safe:opacity-0" />
            </span>
          ))}

          {/* The deal that came out: a compact ticket styled like the page's deal cards (light "ice" colourway): the figure
              and its tag over the title. One per deal, stacked, the current one shown. Sized in cqw, with a floor on the
              title so it stays readable on phones (where a long one takes two lines). */}
          <div className="absolute bottom-[23%] left-[20%] z-40 -translate-x-1/2">
            <div ref={ticketRef} className="grid motion-safe:opacity-0" style={{ transformOrigin: "50% 100%", transform: "rotate(-6deg)" }}>
              {deals.map((deal, i) => {
                return (
                  <div
                    key={deal.id}
                    data-deal-ticket=""
                    className={cn(
                      // Notches cut into both sides, halfway down.
                      "relative col-start-1 row-start-1 w-[29cqw] overflow-hidden rounded-[1.8cqw] bg-brand-50 px-[2.4cqw] py-[1.6cqw] shadow-[0_1.2cqw_2.2cqw_rgb(15_33_71/0.4)] ring-[0.3cqw] ring-brand-100 ring-inset [mask:radial-gradient(circle_at_0_50%,transparent_1.1cqw,#000_1.2cqw)_left/51%_100%_no-repeat,radial-gradient(circle_at_100%_50%,transparent_1.1cqw,#000_1.2cqw)_right/51%_100%_no-repeat]",
                      i > 0 && "invisible opacity-0",
                    )}
                  >
                    <Sparkle className="absolute top-[1.6cqw] right-[2cqw] w-[2.2cqw] text-sun-400" />

                    <div className="relative">
                      <p className="flex items-start gap-[0.8cqw] whitespace-nowrap">
                        <span className={"font-display-condensed text-[5.2cqw] leading-[0.85] text-brand-700 uppercase"}>
                          {deal.percent}%
                        </span>
                        <span className={"font-display-condensed rounded-[0.6cqw] bg-sun-300 px-[0.7cqw] py-[0.4cqw] text-[2cqw] leading-none text-brand-950 uppercase"}>
                          OFF
                        </span>
                      </p>
                      <p className="mt-[0.8cqw] line-clamp-2 text-[max(2.3cqw,10px)] leading-tight font-bold text-brand-950">{deal.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

