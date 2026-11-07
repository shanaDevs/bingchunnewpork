"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/components/home-redesign/lib/gsap";

/** Drift speed of the loop, in px per second. */
const SPEED = 85;
/** How quickly the loop eases back up to speed after keyboard focus or a touch leaves it. */
const EASE_SECONDS = 0.6;
/** Keep a keyboard-focused card at least this far (px) inside the faded edges. */
const FOCUS_MARGIN = 96;

/** Below lg there is no hover, so the cards get a spotlight and touch control instead. */
const COMPACT = "(max-width: 1023px)";
/** Attribute that gives a card its hover look (see DrinkCard). */
const SPOTLIGHT = "data-spotlight";
/**
 * The spotlight aims this far (in card widths) right of centre: cards drift in from the right, so a card
 * lights up as it arrives and hands over before it slides half off the left edge.
 */
const SPOTLIGHT_LEAD = 0.2;
/** A touch that moves less than this (px) is a tap, not a swipe. */
const TAP_SLOP = 8;
/** After a tap the loop stays still this long (s), so the tapped card's button can be pressed calmly. */
const RESUME_AFTER_TAP = 4;
/** After a swipe the loop picks up again this soon (s). */
const RESUME_AFTER_SWIPE = 1.5;
/** How far (ms of travel at release speed) a swipe keeps gliding after the finger lifts. */
const FLING_MS = 300;

// The trailing padding matches the gap, so both sets are the same width and the loop wraps seamlessly.
const setClassName = "flex gap-10 pr-10";

/**
 * Lights one card at a time: a tapped card while it is pinned, otherwise the card whose centre is closest
 * to the middle of the carousel (nudged right by SPOTLIGHT_LEAD). Works on both copies of the cards; the copy is only hidden from
 * assistive tech, it is still on screen.
 */
function createSpotlight(view: HTMLElement) {
  let lit: HTMLElement | null = null;
  let pinned: HTMLElement | null = null;
  const cards = () => Array.from(view.querySelectorAll<HTMLElement>("article"));

  const light = (card: HTMLElement | null) => {
    if (card === lit) return;
    lit?.removeAttribute(SPOTLIGHT);
    card?.setAttribute(SPOTLIGHT, "");
    lit = card;
  };

  const nearestCentre = () => {
    const all = cards();
    const { left, width } = view.getBoundingClientRect();
    const middle = left + width / 2 + (all[0]?.offsetWidth ?? 0) * SPOTLIGHT_LEAD;
    let nearest: HTMLElement | null = null;
    let distance = Infinity;
    for (const card of all) {
      const box = card.getBoundingClientRect();
      const d = Math.abs(box.left + box.width / 2 - middle);
      if (d < distance) {
        distance = d;
        nearest = card;
      }
    }
    return nearest;
  };

  return {
    update: () => light(pinned ?? nearestCentre()),
    /** Pins the card under a screen x position (a tap), or unpins with null. */
    pinAt: (x: number | null) => {
      pinned =
        x === null
          ? null
          : (cards().find((card) => {
              const box = card.getBoundingClientRect();
              return x >= box.left && x <= box.right;
            }) ?? null);
    },
    clear: () => {
      pinned = null;
      light(null);
    },
  };
}

/**
 * Endless right-to-left carousel of cards, no controls. The cards are rendered twice side by side and
 * the track slides left by exactly one set (xPercent -50), then wraps, so the loop is seamless. The copy
 * is hidden from screen readers and keyboard focus. It keeps moving under the mouse; only tabbing to a
 * card stops it (and brings that card into view), so keyboard users aren't chasing a moving button.
 * It only drifts while the user is at this section; anywhere else on the page it stays still.
 * At every width a touch or mouse drag moves it (with a short glide), as do sideways trackpad swipes and
 * Shift+wheel; the loop pauses while it is handled and drifts on again shortly after.
 * Below lg (touch screens, no hover) the card passing the centre is also spotlit with the hover look, and
 * a tap spotlights the tapped card.
 * Under reduced motion nothing moves: the copy is dropped and the row simply scrolls sideways (below lg,
 * the card nearest the centre, or a tapped one, is still spotlit).
 */
export function DrinkMarquee({
  children,
  className,
  contentKey,
}: {
  children: ReactNode;
  className?: string;
  /** Changes when the cards change, so the loop is rebuilt around the new set. */
  contentKey?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // Shared with the touch context below, which attaches to the running loop.
      let loop: gsap.core.Tween | undefined;
      const setWidth = () => (track.current?.offsetWidth ?? 0) / 2;

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const view = viewport.current;
        const row = track.current;
        if (!view || !row) return;

        const tween = gsap.to(row, {
          xPercent: -50,
          ease: "none",
          duration: setWidth() / SPEED,
          repeat: -1,
          paused: true,
        });
        loop = tween;

        // Card widths change at breakpoints; keep the speed constant in px/s.
        const resize = new ResizeObserver(() => tween.duration(setWidth() / SPEED));
        resize.observe(row);

        // Only run while the user is actually at this section: the carousel's top has come a quarter of
        // the way up the screen and its bottom hasn't yet passed the top quarter. Elsewhere it stays still.
        ScrollTrigger.create({
          trigger: view,
          start: "top 75%",
          end: "bottom 25%",
          onToggle: (self) => void (self.isActive ? tween.play() : tween.pause()),
        });

        const onFocusIn = (e: FocusEvent) => {
          // Keyboard focus only: a mouse click also focuses the button, and that shouldn't stop the loop.
          if (!(e.target as HTMLElement).matches(":focus-visible")) return;
          gsap.killTweensOf(tween, "timeScale");
          tween.timeScale(0);
          // overflow-x: clip stops the browser scrolling to the focused card, so shift the loop instead.
          const card = (e.target as HTMLElement).closest("article");
          if (!card) return;
          const bounds = view.getBoundingClientRect();
          const { left, right } = card.getBoundingClientRect();
          const shift =
            left < bounds.left + FOCUS_MARGIN
              ? left - bounds.left - FOCUS_MARGIN
              : right > bounds.right - FOCUS_MARGIN
                ? right - bounds.right + FOCUS_MARGIN
                : 0;
          if (shift) tween.progress(gsap.utils.wrap(0, 1, tween.progress() + shift / setWidth()));
        };
        const onFocusOut = (e: FocusEvent) => {
          if (view.contains(e.relatedTarget as Node | null)) return;
          gsap.to(tween, { timeScale: 1, duration: EASE_SECONDS, ease: "power2.out", overwrite: true });
        };

        view.addEventListener("focusin", onFocusIn);
        view.addEventListener("focusout", onFocusOut);

        return () => {
          resize.disconnect();
          view.removeEventListener("focusin", onFocusIn);
          view.removeEventListener("focusout", onFocusOut);
          loop = undefined;
        };
      });

      // Drag / swipe / sideways-wheel control on top of the running loop at every width; below lg also
      // the spotlight (desktop has hover for that).
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", compact: COMPACT }, (context) => {
        const view = viewport.current;
        const tween = loop;
        if (!context.conditions?.motion || !view || !tween) return;

        const spotlight = context.conditions.compact
          ? createSpotlight(view)
          : { update: () => {}, pinAt: (_x: number | null) => {}, clear: () => {} };
        let resume: gsap.core.Tween | undefined;
        let glide: gsap.core.Tween | undefined;
        let suppressClick = false;
        let touch: { id: number; startX: number; startProgress: number; swiping: boolean; lastX: number; lastTime: number; velocity: number } | null =
          null;

        const shiftTo = (startProgress: number, px: number) => {
          tween.progress(gsap.utils.wrap(0, 1, startProgress - px / setWidth()));
          spotlight.update();
        };

        /** Stops the loop in place (and any pending resume or glide). */
        const hold = () => {
          resume?.kill();
          glide?.kill();
          gsap.killTweensOf(tween, "timeScale");
          tween.timeScale(0);
        };
        /** Eases the loop back up to speed after `delay` seconds, releasing any tapped card. */
        const release = (delay: number) => {
          resume?.kill();
          resume = gsap.delayedCall(delay, () => {
            spotlight.pinAt(null);
            gsap.to(tween, { timeScale: 1, duration: EASE_SECONDS, ease: "power2.out", overwrite: true });
          });
        };

        const onDown = (e: PointerEvent) => {
          // Fingers, pens and (in a narrow desktop window) the mouse's main button.
          if (touch || (e.pointerType === "mouse" && e.button !== 0)) return;
          // A mouse press on a button or link is a click, never a drag: it keeps its pointer cursor and
          // a slight hand movement can't turn Order Now into a row drag. Fingers can still swipe from there.
          if (e.pointerType === "mouse" && (e.target as HTMLElement).closest("button, a")) return;
          hold();
          const now = e.timeStamp;
          touch = { id: e.pointerId, startX: e.clientX, startProgress: tween.progress(), swiping: false, lastX: e.clientX, lastTime: now, velocity: 0 };
        };
        const onMove = (e: PointerEvent) => {
          if (!touch || e.pointerId !== touch.id) return;
          const dx = e.clientX - touch.startX;
          if (!touch.swiping) {
            if (Math.abs(dx) < TAP_SLOP) return;
            touch.swiping = true;
            spotlight.pinAt(null);
            view.setPointerCapture(e.pointerId);
          }
          const dt = e.timeStamp - touch.lastTime;
          if (dt > 0) touch.velocity = (e.clientX - touch.lastX) / dt;
          touch.lastX = e.clientX;
          touch.lastTime = e.timeStamp;
          shiftTo(touch.startProgress, dx);
        };
        const onUp = (e: PointerEvent) => {
          if (!touch || e.pointerId !== touch.id) return;
          const { swiping, velocity } = touch;
          touch = null;
          if (!swiping) {
            spotlight.pinAt(e.clientX);
            spotlight.update();
            release(RESUME_AFTER_TAP);
            return;
          }
          // Swallow the click a swipe would otherwise fire on the button it ends over.
          suppressClick = true;
          setTimeout(() => (suppressClick = false), 0);
          const from = tween.progress();
          const glideBy = { px: 0 };
          glide = gsap.to(glideBy, {
            px: velocity * FLING_MS,
            duration: 0.8,
            ease: "power3.out",
            onUpdate: () => shiftTo(from, glideBy.px),
          });
          release(RESUME_AFTER_SWIPE);
        };
        // The browser took the gesture over (e.g. a vertical page scroll): just carry on drifting.
        const onCancel = (e: PointerEvent) => {
          if (!touch || e.pointerId !== touch.id) return;
          touch = null;
          release(0);
        };
        const onClick = (e: MouseEvent) => {
          if (!suppressClick) return;
          e.preventDefault();
          e.stopPropagation();
        };
        // A mouse drag would otherwise pick up the product image (or select text) instead of the row.
        const onDragStart = (e: DragEvent) => e.preventDefault();
        // Trackpad sideways swipes and Shift+wheel move the row; plain vertical wheel still scrolls the page.
        const onWheel = (e: WheelEvent) => {
          const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
          let dx = sideways ? e.deltaX : e.shiftKey ? e.deltaY : 0;
          if (!dx || touch) return;
          if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dx *= 16;
          e.preventDefault();
          hold();
          spotlight.pinAt(null);
          shiftTo(tween.progress(), -dx);
          release(RESUME_AFTER_SWIPE);
        };

        tween.eventCallback("onUpdate", spotlight.update);
        spotlight.update();
        view.addEventListener("pointerdown", onDown);
        view.addEventListener("pointermove", onMove);
        view.addEventListener("pointerup", onUp);
        view.addEventListener("pointercancel", onCancel);
        view.addEventListener("click", onClick, true);
        view.addEventListener("dragstart", onDragStart);
        view.addEventListener("wheel", onWheel, { passive: false });

        return () => {
          view.removeEventListener("wheel", onWheel);
          view.removeEventListener("pointerdown", onDown);
          view.removeEventListener("pointermove", onMove);
          view.removeEventListener("pointerup", onUp);
          view.removeEventListener("pointercancel", onCancel);
          view.removeEventListener("click", onClick, true);
          view.removeEventListener("dragstart", onDragStart);
          tween.eventCallback("onUpdate", null);
          resume?.kill();
          glide?.kill();
          tween.timeScale(1);
          spotlight.clear();
        };
      });

      // Reduced motion, phones and tablets: the row scrolls natively; spotlight the centred or tapped card.
      mm.add(`(prefers-reduced-motion: reduce) and ${COMPACT}`, () => {
        const view = viewport.current;
        if (!view) return;
        const spotlight = createSpotlight(view);
        const onScroll = () => {
          spotlight.pinAt(null);
          spotlight.update();
        };
        const onClick = (e: MouseEvent) => {
          spotlight.pinAt(e.clientX);
          spotlight.update();
        };
        spotlight.update();
        view.addEventListener("scroll", onScroll, { passive: true });
        view.addEventListener("click", onClick);
        return () => {
          view.removeEventListener("scroll", onScroll);
          view.removeEventListener("click", onClick);
          spotlight.clear();
        };
      });
    },
    { scope: viewport, dependencies: [contentKey], revertOnUpdate: true },
  );

  return (
    // Vertical padding leaves room for the cards' hover lift and shadow inside the edge-fade mask.
    // With motion: touch-pan-y leaves vertical page scrolling to the browser and horizontal swipes to the
    // loop; the grab cursor and select-none are for dragging it with a mouse.
    // Reduced motion scrolls natively, with the scrollbar hidden.
    <div
      ref={viewport}
      className={`overflow-x-clip py-8 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] motion-reduce:overflow-x-auto motion-reduce:[scrollbar-width:none] motion-reduce:[&::-webkit-scrollbar]:hidden motion-safe:cursor-grab motion-safe:touch-pan-y motion-safe:select-none motion-safe:active:cursor-grabbing ${className ?? ""}`}
    >
      <div ref={track} className="flex w-max">
        <div className={setClassName}>{children}</div>
        <div aria-hidden="true" inert className={`${setClassName} motion-reduce:hidden`}>
          {children}
        </div>
      </div>
    </div>
  );
}
