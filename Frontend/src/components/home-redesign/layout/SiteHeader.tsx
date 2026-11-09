"use client";

import { ChevronDown, Globe, MapPin, ShoppingBag, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from "react";
import { Container } from "@/components/home-redesign/ui/Container";
import { Wordmark } from "@/components/home-redesign/ui/Wordmark";
import { isCurrentNav, mainNav } from "@/components/home-redesign/config/site";
import { cn } from "@/components/home-redesign/lib/cn";
import { useHeaderState } from "@/components/home-redesign/hooks/useHeaderState";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { useSpinHeaderButton } from "@/hooks/useSpinHeaderButton";
import { useSpinStore } from "@/store/spinStore";
import { MOBILE_MENU_ID, MenuIcon, MobileMenu } from "./MobileMenu";

/**
 * top  – page at the very top: no scrim, white items over the hero (the original look).
 * hero – scrolled, with the hero's blue backdrop still behind the header: white items.
 * page – the hero has scrolled away: blue items.
 */
type HeaderMode = "top" | "hero" | "page";

const HEADER_HEIGHT = 88;
/** Roughly how long the mobile menu takes to play its closing animation. */
const MENU_CLOSE_MS = 500;
/** Scroll distance over which the scrim fades in, so it grows with the scroll instead of popping on. */
const SCRIM_FADE_DISTANCE = 96;
/** The hero's white wave starts about a quarter of the way down its SVG (the highest crest). */
const WAVE_CREST = 0.25;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * scrim  – 0 at the top of the page, 1 once scrolled SCRIM_FADE_DISTANCE px.
 * onHero – how much of the header the hero's blue area still covers (1 = all of it, 0 = none).
 *          Measured from the hero's wave (read only), so the tint crossfades exactly as the blue
 *          slides out from under the header.
 */
function readScroll() {
  const scrim = clamp01(window.scrollY / SCRIM_FADE_DISTANCE);
  const wave = document.querySelector('[data-hero="root"] [data-decor="wave"]');
  if (wave) {
    const { top, height } = wave.getBoundingClientRect();
    return { scrim, onHero: clamp01((top + height * WAVE_CREST) / HEADER_HEIGHT) };
  }
  const menuHero = document.querySelector('[data-menu-hero="root"]');
  if (menuHero) {
    const { bottom } = menuHero.getBoundingClientRect();
    return { scrim, onHero: clamp01(bottom / HEADER_HEIGHT) };
  }
  return { scrim, onHero: 0 };
}

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getMode(): HeaderMode {
  const { scrim, onHero } = readScroll();
  if (scrim === 0) return "top";
  return onHero >= 0.5 ? "hero" : "page";
}

// The server has no scroll position, so it always renders the top-of-page state.
const getServerMode = (): HeaderMode => "top";

/**
 * The scrim is taller than the header so content just below it still feeds the blur
 * (backdrop-filter only samples what is under its own box); the mask hides that extra part and
 * dissolves the lower edge, so there is never a visible bar edge, line or shadow.
 * Both the fade and the extra sampled area are kept short: a long fade, or blur pulled up from far
 * below, reads as a soft shadow under the nav.
 */
const SCRIM_SOLID_END = 80;
const SCRIM_FADE_END = 104;
const SCRIM_HEIGHT = 128;
const scrimMask = `linear-gradient(to bottom, black 0, black ${SCRIM_SOLID_END}px, transparent ${SCRIM_FADE_END}px)`;
const scrimStyle: CSSProperties = {
  height: SCRIM_HEIGHT,
  maskImage: scrimMask,
  WebkitMaskImage: scrimMask,
  opacity: "var(--scrim, 0)",
};

// Only colour, background and shadow (rings are shadows) transition; GSAP owns opacity and transform.
const fade = "transition-[color,background-color,box-shadow] duration-300 ease-out";

const focusBase = "focus-visible:outline-2 focus-visible:outline-offset-2";

/** Shared with the mobile menu's top row, which must line up with it exactly. */
const headerRowClass =
  "relative grid h-22 grid-cols-[1fr_auto] items-center gap-2 min-[400px]:gap-3 sm:gap-6 lg:grid-cols-[1fr_auto_1fr]";

/** Past the hero the action buttons turn solid blue, mirroring the blue nav pill (white stays the highlight). */
const solidBlue = "bg-brand-600 text-snow shadow-lg shadow-brand-600/25 hover:bg-brand-700";

/**
 * Header fixed to the top of the viewport, with no bar of its own.
 * Content scrolling up behind it is hidden by a scrim: a strong backdrop blur plus a light tint of
 * the colour already behind it (hero blue, or the page's white), faded out at the bottom. Because it
 * is built from what is behind it, it reads as the page itself rather than as a coloured bar.
 * Scrim strength and the blue-to-white tint follow the scroll position frame by frame (CSS variables
 * written directly, no re-render); only the item colours switch, with a short transition.
 * Below lg the nav links move: on tablets (md to lg) into MobileMenu, opened from a menu button beside
 * the cart; on phones (below md) into BottomNav, a tab bar at the bottom of the screen.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode);
  const onLight = mode === "page";

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { scrim, onHero } = readScroll();
      header.style.setProperty("--scrim", scrim.toFixed(3));
      header.style.setProperty("--on-hero", onHero.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const unsubscribe = subscribe(schedule);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300 ease-out",
        onLight ? "text-brand-700" : "text-snow",
      )}
    >
      <div
        aria-hidden="true"
        style={scrimStyle}
        className="pointer-events-none absolute inset-x-0 top-0 backdrop-blur-[40px]"
      >
        <div className="absolute inset-0 bg-brand-600/70 opacity-(--on-hero,1)" />
        <div className="absolute inset-0 bg-white/90 opacity-[calc(1-var(--on-hero,1))]" />
      </div>

      <Container
        data-header-row
        className={headerRowClass}
      >
        <Wordmark compact className="justify-self-start" />

        <nav aria-label="Main" className="hidden lg:block">
          <ul
            className={cn(
              "flex items-center gap-1 rounded-full p-1.5 ring-1 ring-inset",
              fade,
              // Past the hero the pill turns solid blue, so the links inside keep their hero styling.
              onLight
                ? "bg-brand-600 shadow-lg shadow-brand-600/25 ring-brand-500"
                : "bg-white/10 ring-white/20",
            )}
          >
            {mainNav.map((item) => {
              const isCurrent = isCurrentNav(item.href, pathname);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "block rounded-full px-5 py-2 text-sm font-semibold focus-visible:outline-white",
                      fade,
                      focusBase,
                      isCurrent
                        ? "bg-white text-brand-700"
                        : "text-snow/85 hover:bg-white/12 hover:text-snow",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <HeaderActions
          onLight={onLight}
          menuOpen={menuOpen}
          menuButtonRef={menuButtonRef}
          onMenuClick={() => setMenuOpen(true)}
        />
      </Container>

      <MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        originRef={menuButtonRef}
        renderRow={(close) => (
          <Container className={headerRowClass}>
            <Wordmark compact className="justify-self-start" onClick={close} />
            <HeaderActions onLight={false} inMenu onMenuClick={close} />
          </Container>
        )}
      />
    </header>
  );
}

type HeaderActionsProps = {
  /** Past the hero: solid blue buttons. Otherwise white buttons over blue. */
  onLight: boolean;
  /** Whether the mobile menu is open (for the menu button's aria-expanded). */
  menuOpen?: boolean;
  /** The copy in the open menu's top row: the menu button shows a cross and closes the menu. */
  inMenu?: boolean;
  onMenuClick: () => void;
  menuButtonRef?: Ref<HTMLButtonElement>;
};

/**
 * Language, Spin & Win (when the customer may spin), account, cart, pickup and (on tablets) the menu button. Rendered in
 * the header and again in the open mobile menu's top row, so opening the menu reads as the same row with the icon
 * turning into a cross. Below 400px the buttons and gaps tighten a little (the wordmark shrinks too), so the row fits
 * with the Spin & Win button; on the narrowest phones (below 360px) the language, account and spin buttons move out to
 * make room. Account and cart link to their pages; the store control opens the app's order setup (delivery or pickup).
 * The language pill is only in place for now: the site is English only, so it doesn't open anything yet.
 */
function HeaderActions({ onLight, menuOpen = false, inMenu = false, onMenuClick, menuButtonRef }: HeaderActionsProps) {
  const { accountHref, cartCount, storeKicker, storeLabel } = useHeaderState();
  const { visible: showSpin } = useSpinHeaderButton();
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  // In the open menu, links close it on the way out; the order setup and the wheel wait for it to finish closing.
  const leaveMenu = inMenu ? onMenuClick : undefined;
  const chooseStore = () => {
    if (!inMenu) return openOrderModal({ allowSkip: true });
    onMenuClick();
    window.setTimeout(() => openOrderModal({ allowSkip: true }), MENU_CLOSE_MS);
  };
  const openSpin = () => {
    if (!inMenu) return requestOpenSpin();
    onMenuClick();
    window.setTimeout(requestOpenSpin, MENU_CLOSE_MS);
  };

  const focusRing = cn(focusBase, onLight ? "focus-visible:outline-brand-600" : "focus-visible:outline-white");
  const roundButton = cn(
    "grid size-11 place-items-center rounded-full max-[400px]:size-10",
    fade,
    focusRing,
    onLight ? solidBlue : "bg-white text-brand-700 shadow-md shadow-brand-950/20 hover:bg-brand-50",
  );

  return (
    <div className="flex items-center justify-self-end gap-1 min-[400px]:gap-1.5 sm:gap-2">
      {/* Placeholder for the language choice (English / 中文), as in the design: no menu behind it yet. */}
      <button
        type="button"
        aria-label="Language: English"
        title="Language"
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset max-[400px]:px-2.5 max-[359px]:hidden",
          fade,
          focusRing,
          onLight ? "text-brand-700 ring-brand-200 hover:bg-brand-50" : "text-snow ring-white/30 hover:bg-white/10",
        )}
      >
        {/* Phones: just the code, so it fits the row beside the other buttons. */}
        <Globe className="size-4 max-sm:hidden" aria-hidden="true" />
        <span>EN</span>
      </button>

      {showSpin && (
        <button
          type="button"
          data-loyalty-target="spin-wheel"
          onClick={openSpin}
          aria-label="Spin to win"
          title="Spin to win"
          className={cn(roundButton, "cursor-pointer max-[359px]:hidden")}
        >
          <Sparkles className="size-5" aria-hidden="true" />
        </button>
      )}

      <Link href={accountHref} onClick={leaveMenu} aria-label="Account" className={cn(roundButton, "max-[359px]:hidden")}>
        <UserRound className="size-5" aria-hidden="true" />
      </Link>

      <Link
        href="/cart"
        onClick={leaveMenu}
        data-cart-target
        aria-label={cartCount > 0 ? `Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}` : "Cart"}
        className={cn(roundButton, "relative")}
      >
        <ShoppingBag className="size-5" aria-hidden="true" />
        {cartCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-sun-400 px-1 text-[0.6875rem] font-bold text-brand-950 ring-2 ring-white"
          >
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={chooseStore}
        className={cn(
          "hidden items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 ring-1 ring-inset whitespace-nowrap md:flex lg:hidden xl:flex",
          fade,
          focusRing,
          onLight ? cn(solidBlue, "ring-brand-500") : "ring-white/25 hover:bg-white/10",
        )}
      >
        <span className="grid size-8 place-items-center rounded-full bg-white text-brand-600">
          <MapPin className="size-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col text-left leading-tight">
          <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-snow/70 uppercase">
            {storeKicker}
          </span>
          <span className="max-w-40 truncate text-sm font-semibold">{storeLabel}</span>
        </span>
        <ChevronDown className="size-4 text-snow/80" aria-hidden="true" />
      </button>

      <button
        ref={menuButtonRef}
        type="button"
        {...(inMenu
          ? { "aria-label": "Close menu", "data-menu-close": true }
          : {
              "aria-label": "Open menu",
              "aria-haspopup": "dialog" as const,
              "aria-expanded": menuOpen,
              "aria-controls": MOBILE_MENU_ID,
            })}
        onClick={onMenuClick}
        className={cn(roundButton, "max-md:hidden lg:hidden")}
      >
        <MenuIcon cross={inMenu} />
      </button>
    </div>
  );
}
