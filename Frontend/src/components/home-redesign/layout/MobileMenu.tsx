"use client";

import { ArrowUpRight, ChevronRight, Clock, MapPin, Phone, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Container } from "@/components/home-redesign/ui/Container";
import { contactInfo, mainNav } from "@/components/home-redesign/config/site";
import { usePrefersReducedMotion } from "@/components/home-redesign/hooks/usePrefersReducedMotion";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { useHeaderState } from "@/components/home-redesign/hooks/useHeaderState";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";

export const MOBILE_MENU_ID = "mobile-menu";

/** Roughly how long the closing animation takes. */
const MENU_CLOSE_MS = 500;

/** The menu only exists below lg; from lg up the header shows the nav pill instead. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/** Distance of each hamburger bar from the icon's centre, in px (h-3.5 icon, bars inset by 0.5). */
const BAR_OFFSET = 4;

/**
 * Two-bar menu icon. As a cross the bars are rotated with `transform` (not the `rotate` property)
 * so GSAP reads the angle and can morph them in from the hamburger pose.
 */
export function MenuIcon({ cross }: { cross: boolean }) {
  const bar = "absolute inset-x-0 h-0.5 rounded-full bg-current";
  return (
    <span aria-hidden="true" className="relative block h-3.5 w-[1.125rem]">
      <span data-menu-bar className={cn(bar, cross ? "top-1/2 -mt-px [transform:rotate(45deg)]" : "top-0.5")} />
      <span data-menu-bar className={cn(bar, cross ? "top-1/2 -mt-px [transform:rotate(-45deg)]" : "bottom-0.5")} />
    </span>
  );
}

/** Glossy boba pearl, as in the hero. */
function Pearl({ className }: { className: string }) {
  return (
    <span
      data-menu-pop
      className={cn(
        "absolute block aspect-square rounded-full bg-[radial-gradient(circle_at_32%_28%,#5a4a63_0%,#231a2b_38%,#0b0710_100%)] shadow-[0_6px_10px_rgb(15_33_71/0.35)]",
        className,
      )}
    />
  );
}

/** Four-point sparkle, as in the hero. */
function Sparkle({ className, pop = true }: { className: string; pop?: boolean }) {
  return (
    <svg
      data-menu-pop={pop || undefined}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("block", className)}
    >
      <path d="M12 0C12.9 6.6 17.4 11.1 24 12 17.4 12.9 12.9 17.4 12 24 11.1 17.4 6.6 12.9 0 12 6.6 11.1 11.1 6.6 12 0Z" />
    </svg>
  );
}

/**
 * Opening choreography: the panel grows as a circle out of the menu button (like a bubble), the
 * cross morphs in from the hamburger, links rise into place, then the details and mascot pop in.
 * Closing plays it backwards, faster.
 */
function buildOpenTimeline(dialog: HTMLDialogElement, origin: HTMLElement | null) {
  const q = gsap.utils.selector(dialog);
  const panel = q("[data-menu-panel]");
  const box = origin?.getBoundingClientRect();
  const cx = box ? box.left + box.width / 2 : window.innerWidth - 42;
  const cy = box ? box.top + box.height / 2 : 44;
  const from = box ? box.width / 2 : 22;
  const to = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));

  return gsap
    .timeline({ defaults: { ease: "power3.out" } })
    .fromTo(
      panel,
      { clipPath: `circle(${from}px at ${cx}px ${cy}px)` },
      { clipPath: `circle(${to}px at ${cx}px ${cy}px)`, duration: 0.75, ease: "power3.inOut" },
      0,
    )
    .from(
      q("[data-menu-close] [data-menu-bar]"),
      { rotation: 0, y: (i: number) => (i === 0 ? -BAR_OFFSET : BAR_OFFSET), duration: 0.45, ease: "back.out(2)" },
      0.12,
    )
    .from(q("[data-menu-link]"), { yPercent: 110, duration: 0.7, stagger: 0.06 }, 0.22)
    .from(q("[data-menu-pop]"), { autoAlpha: 0, scale: 0, duration: 0.55, stagger: 0.07, ease: "back.out(2.2)" }, 0.4)
    .from(q("[data-menu-fade]"), { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.08 }, 0.42)
    .from(q("[data-menu-mascot]"), { yPercent: 80, rotation: 18, duration: 0.95, ease: "back.out(1.5)" }, 0.38);
}

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  /** The menu button: the panel grows out of it, and focus returns to it on close. */
  originRef: RefObject<HTMLButtonElement | null>;
  /** The header row, repeated at the top of the panel; its menu button is a close button (data-menu-close). */
  renderRow: (close: () => void) => ReactNode;
};

/**
 * Full-screen navigation for phones and tablets, in the hero's look: the same blue backdrop,
 * big condensed type, pearls, sparkles and the mascot.
 * A native modal <dialog>, so the page behind is inert, focus stays inside and Escape closes it.
 * The page is kept from scrolling while it is open.
 */
export function MobileMenu({ open, onClose, originRef, renderRow }: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const openRef = useRef(open);
  const reduceMotion = usePrefersReducedMotion();
  const { accountHref, storeKicker, storeLabel } = useHeaderState();

  // The order setup opens once the menu has finished closing, so it isn't hidden behind the modal menu.
  const chooseStore = () => {
    onClose();
    window.setTimeout(() => openOrderModal({ allowSkip: true }), MENU_CLOSE_MS);
  };

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // The menu button disappears from lg up, so close the menu if the viewport grows past it.
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (query.matches) onClose();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, onClose]);

  // Never leave the page scroll-locked, even if the header unmounts with the menu open.
  useEffect(() => () => void document.documentElement.style.removeProperty("overflow"), []);

  useGSAP(
    () => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (open) {
        if (!dialog.open) {
          dialog.showModal();
          dialog.scrollTop = 0;
          document.documentElement.style.overflow = "hidden";
        }
        dialog.querySelector<HTMLElement>("[data-menu-close]")?.focus();
        if (reduceMotion) return;
        if (timeline.current) {
          // Reopened while closing: carry on forwards from where it is.
          timeline.current.eventCallback("onReverseComplete", null).timeScale(1).play();
          return;
        }
        timeline.current = buildOpenTimeline(dialog, originRef.current);
        return;
      }

      if (!dialog.open) return;
      const finish = () => {
        dialog.close();
        originRef.current?.focus({ preventScroll: true });
      };
      if (!timeline.current || reduceMotion) return finish();
      timeline.current.eventCallback("onReverseComplete", finish).timeScale(1.6).reverse();
    },
    { dependencies: [open], scope: dialogRef },
  );

  /** Runs on every close, including one the browser forces (e.g. a repeated Escape). */
  const handleDialogClose = () => {
    document.documentElement.style.removeProperty("overflow");
    timeline.current?.revert();
    timeline.current = null;
    if (openRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id={MOBILE_MENU_ID}
      aria-label="Menu"
      onCancel={(event) => {
        // Escape: play the closing animation instead of vanishing at once.
        event.preventDefault();
        onClose();
      }}
      onClose={handleDialogClose}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-transparent p-0 text-snow backdrop:bg-transparent"
    >
      <div
        data-menu-panel
        className="relative isolate flex min-h-full flex-col overflow-hidden"
        style={{ backgroundImage: heroBackdropImage }}
      >
        {renderRow(onClose)}

        {/* Kept to the lower part of the panel, around the mascot, clear of the links. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <Sparkle className="absolute right-[10%] bottom-[23%] w-5 text-snow/90 sm:w-6" />
          <Sparkle className="absolute bottom-[9%] left-[40%] w-4 text-sun-400 sm:w-5" />
          <Pearl className="bottom-[15%] left-[8%] w-7 sm:w-9" />
          <Pearl className="bottom-[5%] left-[60%] w-4 sm:w-5" />
        </div>

        <Container as="nav" aria-label="Main" className="relative mt-2 sm:mt-6">
          <ul>
            {mainNav.map((item, index) => {
              const isCurrent = index === 0;
              return (
                <li key={item.label} className="overflow-hidden border-b border-white/15">
                  <Link
                    data-menu-link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={onClose}
                    className="group flex items-center justify-between gap-4 rounded-2xl py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white sm:py-5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="font-display-condensed text-[clamp(2.75rem,14vw,4.5rem)] leading-[0.85] uppercase [text-shadow:0_0.05em_0_var(--color-brand-800)]">
                        {item.label}
                      </span>
                      {isCurrent && <Sparkle pop={false} className="w-5 text-sun-400 sm:w-6" />}
                    </span>
                    <span
                      className={cn(
                        "grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors",
                        isCurrent ? "bg-white text-brand-700 ring-white" : "ring-white/30 group-hover:bg-white/10",
                      )}
                    >
                      <ArrowUpRight className="size-5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>

        <Container className="relative mt-6 flex flex-col gap-3 sm:mt-8">
          {/* Tablets keep the pickup control in the header row; phones get it here. */}
          <button
            type="button"
            onClick={chooseStore}
            data-menu-fade
            className="flex items-center gap-3 rounded-full bg-white/10 py-2 pr-5 pl-2 text-left ring-1 ring-white/20 ring-inset transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-600">
              <MapPin className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col leading-tight">
              <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-snow/70 uppercase">
                {storeKicker}
              </span>
              <span className="text-base font-semibold">{storeLabel}</span>
            </span>
            <ChevronRight className="size-5 text-snow/80" aria-hidden="true" />
          </button>

          {/* The header drops its account button below 360px to fit; it lives here instead. */}
          <Link
            href={accountHref}
            onClick={onClose}
            data-menu-fade
            className="flex items-center gap-3 rounded-full bg-white/10 py-2 pr-5 pl-2 text-left font-semibold ring-1 ring-white/20 ring-inset transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white min-[360px]:hidden"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-700">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            My Account
          </Link>

          <div data-menu-fade className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-snow/75">
            <span className="flex items-center gap-2">
              <Clock className="size-4" aria-hidden="true" />
              {contactInfo.hours}
            </span>
            <a
              href={contactInfo.inquiries.href}
              className="flex items-center gap-2 rounded-md transition-colors hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Phone className="size-4" aria-hidden="true" />
              {contactInfo.inquiries.label}
            </a>
          </div>
        </Container>

        {/* Mascot peeking up from the bottom edge, waving the cup. */}
        <div aria-hidden="true" className="relative mt-auto h-40 shrink-0 sm:h-56">
          <div data-menu-mascot className="absolute right-[6%] -bottom-6 w-32 sm:w-44">
            <Image
              src="/images/mascot-hover.png"
              alt=""
              width={463}
              height={594}
              sizes="(min-width: 640px) 176px, 128px"
              className="sticker block h-auto w-full animate-float [animation-duration:6s]"
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
