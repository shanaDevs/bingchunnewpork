"use client";

import { BadgePercent, Bike, IceCreamBowl, Percent, RotateCcw, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";
import { resolveProductImageUrl } from "@/lib/productImageUrl";
import type { SpinOffer } from "@/lib/spinStorage";
import { playSpinTick } from "./spinSounds";
import {
  fitFont,
  landingRotation,
  photoSize,
  RADIAL_LABELS_FROM,
  radialFontSize,
  seamOnFill,
  sliceAngle,
  sliceAt,
  sliceLines,
  spinTiming,
  textOnFill,
  WIND_UP_S,
  wrapLines,
} from "./wheel";

/** The wheel's drawing, in SVG units: the slices' radius, inside a rim reaching RIM. */
const R = 146;
const RIM = 160;
/** Half the drawing's width and height: the rim plus room for the pointer above it (square and centred, so the hub lines up). */
const VIEW = 182;
const BULBS = 18;

/** How far it sways either way while it waits to be spun. */
const IDLE_SWAY = 5;
/** The little pull back before it goes. */
const WIND_UP_DEGREES = 14;
/** The tick felt (phones that can vibrate) and heard as a slice edge passes the pointer, at most once per TICK_GAP_MS. */
const TICK_MS = 6;
const TICK_GAP_MS = 70;
/** On a half or third of the wheel, the landed slice popping out would cover the rim. */
const POP_FROM = 4;

export const OFFER_ICONS: Record<SpinOffer["offerType"], LucideIcon> = {
  PERCENTAGE: Percent,
  FIXED: BadgePercent,
  FREE_DELIVERY: Bike,
  GIFT: IceCreamBowl,
  NO_PRIZE: RotateCcw,
};

/** The point `radius` out from the centre, `degrees` clockwise from the top. */
const point = (degrees: number, radius: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: Number((radius * Math.cos(radians)).toFixed(2)), y: Number((radius * Math.sin(radians)).toFixed(2)) };
};
const polar = (degrees: number, radius: number) => {
  const { x, y } = point(degrees, radius);
  return `${x} ${y}`;
};

/** Slice `i` of `count`'s wedge, clockwise from the top. */
const wedge = (i: number, count: number) => {
  const slice = sliceAngle(count);
  return `M0 0L${polar(i * slice, R)}A${R} ${R} 0 0 1 ${polar((i + 1) * slice, R)}Z`;
};

export type WheelHandle = {
  /** Spins to land on slice `index` (somewhere inside it, never on an edge); resolves once it has stopped. */
  spinTo: (index: number, options: { reduced: boolean; totalSeconds: number }) => Promise<void>;
  /** The mascot in the hub jumps for joy (a win). */
  celebrate: () => void;
};

/**
 * A gift's product photo standing on the slice itself: the menu's photos are cut-outs on a transparent background, and
 * the whole product shows (tall cups and sundaes aren't cropped), in a box a little taller than wide, centred on `cy`.
 * A soft shadow (`shadow`, an SVG filter's id) keeps it apart from a slice of its own colour. Its icon if the photo
 * won't load.
 */
function GiftPhoto({ src, size, cy, color, shadow }: { src: string; size: number; cy: number; color: string; shadow: string }) {
  const [failed, setFailed] = useState(false);
  // Fetched ahead (so it doesn't pop in mid-spin) and to catch a bad image: SVG <image> reports no error to React.
  useEffect(() => {
    const probe = new window.Image();
    probe.onerror = () => setFailed(true);
    probe.src = src;
    return () => {
      probe.onerror = null;
    };
  }, [src]);
  if (failed) {
    return <IceCreamBowl x={-size / 2} y={cy - size / 2} width={size} height={size} color={color} strokeWidth={2.4} />;
  }
  const height = size * 1.25;
  return (
    <image
      href={src}
      x={-size / 2}
      y={cy - height / 2}
      width={size}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      filter={`url(#${shadow})`}
    />
  );
}

/**
 * A slice: its wedge and the admin's label, in the colour the admin chose with whichever of white or navy reads on it.
 * Up to six slices the label runs across the slice: tablets and desktop show the icon over a big and a small line, and
 * phones, where the wheel is smallest, drop the icon so the label can be much bigger. A gift shows its product photo
 * over the label. From seven slices there's no room across, so one line runs along the radius. Every line shrinks to
 * fit, so a long label stays inside its slice.
 */
function SliceFace({ offer, index, count, shadow }: { offer: SpinOffer; index: number; count: number; shadow: string }) {
  const Icon = OFFER_ICONS[offer.offerType];
  const line = offer.label.trim();
  const { top, bottom } = sliceLines(line);
  const bottomLines = bottom ? wrapLines(bottom) : [];
  const text = textOnFill(offer.color);
  const photo = offer.offerType === "GIFT" ? resolveProductImageUrl(offer.giftProduct?.imageUrl) : undefined;
  const slice = sliceAngle(count);

  let label;
  if (count >= RADIAL_LABELS_FROM) {
    // With a photo, the text only has the inner part of the slice.
    const centre = photo ? -74 : -96;
    label = (
      <>
        {photo && <GiftPhoto src={photo} size={photoSize(count)} cy={-118} color={text} shadow={shadow} />}
        <text
          transform={`translate(0 ${centre}) rotate(90)`}
          dominantBaseline="central"
          className="font-display-condensed uppercase"
          fontSize={radialFontSize(count, line, photo ? 44 : undefined)}
        >
          {line}
        </text>
      </>
    );
  } else if (photo) {
    const lines = wrapLines(line, 10);
    const size = lines.length > 1 ? fitFont(lines, 16, 56, count) : fitFont(lines, 28, 65, count);
    label = (
      <>
        <GiftPhoto src={photo} size={photoSize(count)} cy={-112} color={text} shadow={shadow} />
        {lines.map((part, n) => (
          <text key={n} y={lines.length > 1 ? -70 + n * 14 : -65} className="font-display-condensed uppercase" fontSize={size}>
            {part}
          </text>
        ))}
      </>
    );
  } else {
    const desktopBottom = fitFont(bottomLines, bottomLines.length > 1 ? 10.5 : 12, bottomLines.length > 1 ? 52 : 64, count, 0.7);
    const phoneBottom = fitFont(bottomLines, bottomLines.length > 1 ? 16 : 19, bottomLines.length > 1 ? 58 : 70, count, 0.55);
    label = (
      <>
        <g className="max-sm:hidden">
          <Icon x={-11} y={-R + 18} width={22} height={22} color={text} strokeWidth={2.4} />
          <text y={-R + 66} className="font-display-condensed uppercase" fontSize={fitFont([top], 28, 80, count)}>
            {top}
          </text>
          {bottomLines.map((part, n) => (
            <text key={n} y={-R + 82 + n * 12} fontSize={desktopBottom} fontWeight={800} letterSpacing="0.6" className="uppercase">
              {part}
            </text>
          ))}
        </g>
        <g className="sm:hidden">
          <text y={-R + 52} className="font-display-condensed uppercase" fontSize={fitFont([top], 40, 94, count)}>
            {top}
          </text>
          {bottomLines.map((part, n) => (
            <text key={n} y={-R + (bottomLines.length > 1 ? 72 + n * 16 : 76)} className="font-display-condensed uppercase" fontSize={phoneBottom} letterSpacing="0.5">
              {part}
            </text>
          ))}
        </g>
      </>
    );
  }

  return (
    <g>
      <path d={wedge(index, count)} fill={offer.color} stroke={seamOnFill(offer.color)} strokeWidth="2.5" strokeLinejoin="round" />
      <g transform={`rotate(${index * slice + slice / 2})`} fill={text} textAnchor="middle">
        {label}
      </g>
    </g>
  );
}

/**
 * The Spin & Win wheel (decorative to screen readers: the dialog says what it does and announces the result).
 * The admin's slices, turning inside a fixed navy rim lit by bulbs that chase round it (quicker while it spins), under
 * a fixed yellow pointer at the top; the mascot sits upright in the middle on a white hub.
 *
 * While it waits it isn't still: the wheel sways gently and the hub mascot hops now and then.
 * `spinTo` turns it with GSAP to the slice the server picked: a little wind-up, then whole turns and on to that slice,
 * slowing smoothly to a stop, the pointer flicking and ticking (phones that can vibrate buzz too) each time a slice
 * edge passes it. With reduced motion it jumps straight to the result. It always stops inside the chosen slice, so
 * what it shows is what was won. Once it has stopped (`landed`), the other slices dim and that one pops out a little,
 * outlined. `celebrate` makes the mascot jump.
 */
export function SpinWheel({ ref, offers, spinning, landed = null, className }: { ref: Ref<WheelHandle>; offers: SpinOffer[]; spinning: boolean; landed?: number | null; className?: string }) {
  const count = offers.length;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rotorRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<SVGGElement>(null);
  const landedRef = useRef<SVGGElement>(null);
  const mascotRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** The waiting motion (the sway and the mascot's hops), stopped once it spins. */
  const idle = useRef<gsap.core.Animation[]>([]);
  /** Where the wheel has turned to, in degrees clockwise (it only ever grows). */
  const rotation = useRef(0);
  /** The running spin, so leaving mid-spin (the browser can force a close) stops it and lets the caller carry on. */
  const running = useRef<{ timeline: gsap.core.Timeline; finish: () => void } | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const sway = gsap
          .timeline({ repeat: -1, defaults: { svgOrigin: "0 0", ease: "sine.inOut" } })
          .to(rotorRef.current, { rotation: IDLE_SWAY, duration: 1.1 })
          .to(rotorRef.current, { rotation: -IDLE_SWAY, duration: 2.2 })
          .to(rotorRef.current, { rotation: 0, duration: 1.1 });
        const hop = gsap
          .timeline({ repeat: -1, repeatDelay: 2.2, delay: 1 })
          .to(mascotRef.current, { y: -8, duration: 0.22, ease: "power2.out" })
          .to(mascotRef.current, { y: 0, duration: 0.55, ease: "bounce.out" });
        idle.current = [sway, hop];
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  useEffect(
    () => () => {
      running.current?.timeline.kill();
      running.current?.finish();
    },
    [],
  );

  // The slice it landed on pops out a little.
  useEffect(() => {
    if (landed === null || count < POP_FROM || !landedRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(landedRef.current, { scale: 1 }, { scale: 1.08, svgOrigin: "0 0", duration: 0.6, ease: "back.out(2.5)" });
  }, [landed, count]);

  useImperativeHandle(ref, () => ({
    celebrate: () => {
      gsap
        .timeline()
        .to(mascotRef.current, { y: -12, scale: 1.1, duration: 0.2, ease: "power2.out", overwrite: "auto" })
        .to(mascotRef.current, { y: 0, scale: 1, duration: 0.45, ease: "bounce.out" })
        .to(mascotRef.current, { y: -10, scale: 1.08, duration: 0.2, ease: "power2.out" })
        .to(mascotRef.current, { y: 0, scale: 1, duration: 0.5, ease: "bounce.out" });
    },
    spinTo: (index, { reduced, totalSeconds }) =>
      new Promise<void>((resolve) => {
        const rotor = rotorRef.current;
        if (!rotor) return resolve();
        // Stop waiting: no more sway or hops (the wind-up below carries on from wherever the sway had got to).
        idle.current.forEach((animation) => animation.kill());
        gsap.to(mascotRef.current, { y: 0, duration: 0.2 });
        const { turns, spinS, ease } = spinTiming(totalSeconds);
        // Land somewhere inside the slice (its middle 70%), so it's never left on a line between two.
        const slice = sliceAngle(count);
        const current = rotation.current;
        const target = landingRotation(current, index, count, turns, gsap.utils.random(-slice * 0.35, slice * 0.35));
        rotation.current = target;

        if (reduced) {
          gsap.set(rotor, { rotation: target, svgOrigin: "0 0" });
          return resolve();
        }
        let lastSlice = sliceAt(current, count);
        let lastTick = 0;
        const kickPointer = () => {
          const passing = sliceAt(Number(gsap.getProperty(rotor, "rotation")), count);
          if (passing === lastSlice) return;
          lastSlice = passing;
          const now = performance.now();
          if (now - lastTick > TICK_GAP_MS) {
            lastTick = now;
            navigator.vibrate?.(TICK_MS);
            playSpinTick();
          }
          gsap.fromTo(pointerRef.current, { rotation: -16 }, { rotation: 0, duration: 0.3, ease: "elastic.out(1.2, 0.4)", svgOrigin: "0 -166", overwrite: true });
        };
        const timeline = gsap
          .timeline({ paused: true })
          .to(rotor, { rotation: current - WIND_UP_DEGREES, svgOrigin: "0 0", duration: WIND_UP_S, ease: "power2.out" })
          .to(rotor, { rotation: target, svgOrigin: "0 0", duration: spinS, ease, onUpdate: kickPointer });
        // Driven by the clock, not played: GSAP stretches an animation over slow frames, and the admin's spin length
        // should be the real length on any device. A slow phone drops frames instead.
        const startedAt = performance.now();
        const follow = () => {
          const elapsed = (performance.now() - startedAt) / 1000;
          timeline.time(Math.min(elapsed, timeline.duration()));
          if (elapsed >= timeline.duration()) finish();
        };
        const finish = () => {
          gsap.ticker.remove(follow);
          running.current = null;
          resolve();
        };
        gsap.ticker.add(follow);
        running.current = { timeline, finish };
      }),
  }));

  return (
    <div ref={rootRef} data-spinning={spinning || undefined} className={cn("group relative aspect-square [--bulb-s:1.2s] data-spinning:[--bulb-s:0.36s]", className)}>
      {/* A warm glow behind the wheel. */}
      <div aria-hidden="true" className="absolute -inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(255_226_122/0.55),rgb(255_226_122/0.15)_60%,transparent)]" />
      <svg viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`} aria-hidden="true" className="relative size-full overflow-visible drop-shadow-[0_18px_28px_rgb(15_33_71/0.45)]">
        <defs>
          <radialGradient id={`${id}-gloss`} cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a4fb2" />
            <stop offset="100%" stopColor="#0f2147" />
          </linearGradient>
          {/* Under a gift's photo, so it lifts off the slice. */}
          <filter id={`${id}-photo`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f2147" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* The rim, with a gold inner edge. */}
        <circle r={RIM} fill={`url(#${id}-rim)`} />
        <circle r={R + 3} fill="none" stroke="#ffd23f" strokeWidth="4" />

        <g ref={rotorRef}>
          {offers.map((offer, i) => (
            <SliceFace key={offer.id} offer={offer} index={i} count={count} shadow={`${id}-photo`} />
          ))}
          {/* Once it has stopped: the other slices dim, and the one under the pointer pops out with a glowing outline. */}
          {offers.map((offer, i) => (
            <path key={offer.id} d={wedge(i, count)} fill="#0f2147" className={cn("transition-opacity duration-500", landed !== null && landed !== i ? "opacity-35" : "opacity-0")} />
          ))}
          {landed !== null && (
            <g ref={landedRef}>
              <SliceFace offer={offers[landed]} index={landed} count={count} shadow={`${id}-photo`} />
              <path
                d={wedge(landed, count)}
                fill="none"
                stroke="#ffe27a"
                strokeWidth="6"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_6px_#ffd23f] transition-opacity duration-500 motion-safe:animate-pulse starting:opacity-0"
              />
            </g>
          )}
        </g>
        <circle r={R} fill={`url(#${id}-gloss)`} pointerEvents="none" />

        {/* Rim lights, chasing round clockwise. */}
        {Array.from({ length: BULBS }, (_, i) => point((i * 360) / BULBS, (RIM + R + 3) / 2)).map(({ x, y }, i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="3.6"
            fill="#ffe27a"
            className="animate-bulb drop-shadow-[0_0_3px_#ffd23f] [animation-duration:var(--bulb-s)]"
            style={{ animationDelay: `calc(var(--bulb-s) * ${-i / BULBS})` }}
          />
        ))}

        {/* The pointer, fixed at the top. */}
        <g ref={pointerRef}>
          <path d="M0 -133 L-16 -161 A18 18 0 1 1 16 -161 Z" fill="#ffd23f" stroke="#0f2147" strokeWidth="4" strokeLinejoin="round" />
          <circle cy={-166} r="6" fill="#ff6fb5" stroke="#0f2147" strokeWidth="2.5" />
        </g>
      </svg>

      {/* The hub, with the logo's mascot (as in the navbar) upright in it (it never turns). The drawing fills its image
          edge to edge, so centring the image centres the mascot, drink and all. That's done with inset and auto margins,
          not a translate: GSAP animates this image's transform (the hops), and would freeze a % translate into pixels
          at the size it first saw, leaving the mascot off-centre once the wheel is drawn any other size. */}
      <div className="absolute top-1/2 left-1/2 aspect-square w-[23%] -translate-1/2 overflow-hidden rounded-full bg-white shadow-[0_6px_14px_rgb(15_33_71/0.4)] ring-[0.45rem] ring-sun-300">
        <Image ref={mascotRef} src="/brand/logo.avif" alt="" width={467} height={600} sizes="80px" className="absolute inset-0 m-auto h-[60%] w-auto max-w-none" />
      </div>
    </div>
  );
}
