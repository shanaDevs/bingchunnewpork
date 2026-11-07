"use client";

import { useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Confetti colours: brand blues, the sun yellow, and a few party colours. */
const CONFETTI_COLOURS = ["#1f62d6", "#5b9bff", "#ffd23f", "#ffe27a", "#fb7185", "#34d399", "#a78bfa"];
const CONFETTI_COUNT = 150;
/** The pieces go up in this many quick waves, so the shower lasts a little longer than one pop. */
const CONFETTI_WAVES = 3;
const CONFETTI_WAVE_GAP_S = 0.18;
/** Dots, rectangles, thin streamers and tiny squares, in turn. */
const CONFETTI_SHAPES = ["size-2.5 rounded-full", "h-3.5 w-2 rounded-[2px]", "h-4.5 w-1 rounded-full", "size-2 rounded-[1px]"];

/**
 * A one-off burst of confetti, in three quick waves: pieces fly up and out, then tumble down past the bottom edge and
 * are removed. Decorative; none under reduced motion. Mount it again, with a new key, to replay it.
 */
export function Confetti() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const pieces = gsap.utils.toArray<HTMLElement>("[data-confetti]", ref.current);
        const { innerWidth: width, innerHeight: height } = window;
        const timeline = gsap.timeline({ onComplete: () => setDone(true) });
        pieces.forEach((piece, index) => {
          const start = (index % CONFETTI_WAVES) * CONFETTI_WAVE_GAP_S + gsap.utils.random(0, 0.08);
          const rise = gsap.utils.random(height * 0.1, height * 0.36);
          const lift = gsap.utils.random(0.45, 0.75);
          const fall = gsap.utils.random(1.6, 2.8);
          timeline
            .set(piece, { autoAlpha: 1 }, start)
            .to(piece, { x: gsap.utils.random(-width * 0.52, width * 0.52), duration: lift + fall, ease: "power1.out" }, start)
            .to(piece, { y: -rise, duration: lift, ease: "power2.out" }, start)
            .to(piece, { y: height, duration: fall, ease: "power1.in" }, start + lift)
            .to(
              piece,
              { rotation: gsap.utils.random(-900, 900), rotationX: gsap.utils.random(0, 720), duration: lift + fall, ease: "none" },
              start,
            );
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  if (done) return null;
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[30%] z-40 flex justify-center">
      {Array.from({ length: CONFETTI_COUNT }, (_, index) => (
        <span
          key={index}
          data-confetti
          className={cn("invisible absolute", CONFETTI_SHAPES[index % CONFETTI_SHAPES.length])}
          style={{ backgroundColor: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length] }}
        />
      ))}
    </div>
  );
}
