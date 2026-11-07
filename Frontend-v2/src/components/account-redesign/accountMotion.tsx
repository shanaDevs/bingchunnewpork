"use client";

import { useRef, type RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/components/home-redesign/lib/gsap";

/**
 * Motion for the account pages, all of it skipped when reduced motion is requested.
 *
 * Page entrance (useAccountPageMotion): each time an account page opens, its sections rise in one after
 * another; those below the fold wait and rise as they scroll into view. Inside a section, hooks add to it:
 * - `data-motion-group` on a wrapper of sections side by side: each of its children rises on its own instead.
 * - `data-stagger` on a list: its items follow the section in, one after another.
 * - `data-pop` on a picture: it pops into place with a little bounce.
 * Their own CSS transitions must not cover transform or opacity, or they would lag behind the tweens.
 */

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One section's reveal: the section rises, then its lists' items follow and its pictures pop. */
function revealTimeline(section: HTMLElement) {
  const q = gsap.utils.selector(section);
  const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
  timeline.from(section, { y: 28, autoAlpha: 0, duration: 0.7 }, 0);
  const lists = [...(section.matches("[data-stagger]") ? [section] : []), ...q<HTMLElement>("[data-stagger]")];
  lists.forEach((list) => timeline.from(list.children, { y: 18, autoAlpha: 0, duration: 0.5, stagger: 0.06 }, 0.15));
  const pops = q<HTMLElement>("[data-pop]");
  if (pops.length) timeline.from(pops, { scale: 0.6, rotation: -8, autoAlpha: 0, duration: 0.8, ease: "back.out(1.8)", stagger: 0.08 }, 0.2);
  return timeline;
}

/** Elements that are content in their own right, not a wrapper of sections. */
const LEAVES = new Set(["P", "A", "BUTTON", "SPAN", "H1", "H2", "H3", "H4", "LABEL"]);

/**
 * The sections of the page in `panel`: the children of its view's top-level elements (a page may return a
 * wrapper, a list or several pieces), a top-level element that is content itself counting as one; each
 * `data-motion-group` opened up into its own children. Closed pop-ups and hidden elements are left out.
 */
function pageSections(panel: HTMLElement) {
  const visible = (element: Element) => element.tagName !== "DIALOG" && (element as HTMLElement).offsetParent !== null;
  const roots = [...panel.children].filter((child) => !child.hasAttribute("aria-hidden") && visible(child));
  return roots
    .flatMap((root) => (LEAVES.has(root.tagName) || root.children.length === 0 ? [root] : [...root.children]))
    .flatMap((child) => (child.hasAttribute("data-motion-group") ? [...child.children] : [child]))
    .filter(visible) as HTMLElement[];
}

/**
 * Plays the entrance of the page in `panel` (the shell's white panel) whenever `route` changes, once `ready`.
 * The panel scrolls itself on tall desktop screens, the window otherwise; reveals follow whichever scrolls.
 */
export function useAccountPageMotion(panel: RefObject<HTMLElement | null>, route: string, ready: boolean) {
  useGSAP(
    () => {
      const element = panel.current;
      if (!ready || !element || reducedMotion()) return;
      const scroller = getComputedStyle(element).overflowY === "auto" ? element : undefined;
      const fold = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      let inView = 0;
      for (const section of pageSections(element)) {
        if (section.getBoundingClientRect().top < fold - 40) {
          revealTimeline(section).delay(0.1 + inView++ * 0.1);
        } else {
          const timeline = revealTimeline(section).pause();
          ScrollTrigger.create({ trigger: section, scroller, start: "top 92%", once: true, onEnter: () => timeline.play() });
        }
      }
    },
    { dependencies: [route, ready], revertOnUpdate: true },
  );
}

/** The page title's entrance on each page: it rises, then the yellow highlighter (`data-highlight`) swipes in behind its word. */
export function useTitleMotion(title: RefObject<HTMLElement | null>, page: string) {
  useGSAP(
    () => {
      const element = title.current;
      if (!element || reducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(element, { y: 18, autoAlpha: 0, duration: 0.6 }, 0)
        .from(element.querySelectorAll("[data-highlight]"), { scaleX: 0, transformOrigin: "left center", duration: 0.55, ease: "power3.inOut" }, 0.25);
    },
    { dependencies: [page], revertOnUpdate: true },
  );
}

/**
 * The navigation's entrance, once, from lg: the member card slides in from the left, the links follow one after
 * another (`data-nav-item`), then Log Out (`data-nav-logout`) rises.
 */
export function useNavEntrance(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 64rem) and (prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from(q("[data-nav-card]"), { x: -28, autoAlpha: 0, duration: 0.7 }, 0)
          .from(q("[data-nav-item]"), { x: -18, autoAlpha: 0, duration: 0.5, stagger: 0.05 }, 0.15)
          .from(q("[data-nav-logout]"), { y: 16, autoAlpha: 0, duration: 0.5 }, 0.45);
      });
    },
    { scope },
  );
}

/**
 * A whole number that counts up to `value` when it first shows (from 0) and to each new value from the last.
 * Shown straight away under reduced motion. Thousands are separated (1,250).
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      const text = (n: number) => Math.round(n).toLocaleString("en-US");
      if (reducedMotion() || Math.round(shown.current) === value) {
        element.textContent = text(value);
        shown.current = value;
        return;
      }
      const counter = { n: shown.current };
      element.textContent = text(counter.n);
      gsap.to(counter, {
        n: value,
        duration: 1.2,
        delay: 0.2,
        ease: "power2.out",
        onUpdate: () => {
          element.textContent = text(counter.n);
          // Where it has got to, so a new value counts on from here.
          shown.current = counter.n;
        },
      });
    },
    { dependencies: [value], revertOnUpdate: true },
  );

  // The text is written by the effect above (before the first paint), never by React, so the two don't fight.
  return <span ref={ref} className={className} />;
}

/** Replays a little cascade of `selector` inside `scope` whenever `key` changes (not on the first render, which the page entrance covers). */
export function useCascadeOnChange(scope: RefObject<HTMLElement | null>, selector: string, key: unknown) {
  const first = useRef(true);
  useGSAP(
    () => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (!scope.current || reducedMotion()) return;
      gsap.from(scope.current.querySelectorAll(selector), { y: 22, autoAlpha: 0, duration: 0.5, ease: "power3.out", stagger: 0.07 });
    },
    { scope, dependencies: [key] },
  );
}
