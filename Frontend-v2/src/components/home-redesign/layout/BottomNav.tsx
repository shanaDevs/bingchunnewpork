"use client";

import { House, MapPin, TicketPercent, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { mainNav, type NavItem } from "@/components/home-redesign/config/site";
import { cn } from "@/components/home-redesign/lib/cn";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";

const tabIcons: Record<string, LucideIcon> = {
  "/": House,
  "/menu": UtensilsCrossed,
  "/promotions": TicketPercent,
  "/stores": MapPin,
};

const isCurrentNav = (href: string, pathname: string) =>
  href === pathname || (href !== "/" && pathname.startsWith(`${href}/`));

/** Order Now takes the middle of the five columns; the links fill the two either side. */
const ORDER_COLUMN = 2;

/** Every label sits on one baseline. The narrowest phones (320px) go a size down so "Locations" fits. */
const labelClass = "max-w-full truncate text-[0.6875rem] leading-none max-[359px]:text-[0.625rem]";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/** How far the raised Order Now button (with its rim) rises above the bar, in px. */
const RAISED_PX = 20;

/**
 * Whether the bar shows. Always, unless the page marks a section it waits for (`data-bottom-nav-after`,
 * the homepage hero): then once that section has scrolled up clear of the bar, and not again until it
 * scrolls back down. Checked after each navigation (once the new page is in place) and on scroll and
 * resize, at most once a frame. Starts hidden, so on other pages the bar slides up just after load.
 */
function useBottomNavVisible(navRef: RefObject<HTMLElement | null>, listRef: RefObject<HTMLElement | null>) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nav = navRef.current;
      const list = listRef.current;
      const section = document.querySelector("[data-bottom-nav-after]");
      if (!nav || !list || !section) return setVisible(true);
      // The bar's top edge on screen, from its layout (not its slide, which moves it while hidden).
      const barTop = window.innerHeight - parseFloat(getComputedStyle(nav).bottom) - list.offsetHeight - RAISED_PX;
      setVisible(section.getBoundingClientRect().bottom <= barTop);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname, navRef, listRef]);

  return visible;
}

/**
 * App-style tab bar for phones (below md) on the redesigned pages, in place of the header's menu button:
 * a white bar with rounded corners floating at the bottom of the screen, with the main links either side
 * of a raised Order Now button where the mascot peeks out. Tablets keep the header's menu button
 * (MobileMenu); desktop shows the nav pill.
 * It is always visible, except on the homepage hero: there it waits below the screen and slides up once
 * the hero has scrolled clear of it (useBottomNavVisible), so it never covers the composition.
 * The current tab turns brand blue; the others are grey. Order Now opens the app's order setup (delivery
 * or pickup and the branch), which goes on to the menu.
 * Its room at the bottom of the screen is --bottom-nav-space (theme.css), which the footer, the Locations
 * page and the floating spin button use to stay clear of it.
 */
export function BottomNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useBottomNavVisible(navRef, listRef);

  const tab = (item: NavItem) => {
    const Icon = tabIcons[item.href] ?? House;
    const isCurrent = isCurrentNav(item.href, pathname);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            "flex h-full flex-col items-center justify-end gap-1.5 rounded-2xl px-0.5 pb-2.5 transition-[color,scale] duration-200 ease-out active:scale-92 max-[359px]:px-0",
            focusRing,
            isCurrent ? "text-brand-600" : "text-slate-500 hover:text-brand-600",
          )}
        >
          <Icon className="size-5.5 shrink-0" strokeWidth={isCurrent ? 2 : 1.6} aria-hidden="true" />
          <span className={cn(labelClass, isCurrent ? "font-semibold" : "font-medium")}>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      ref={navRef}
      data-bottom-nav
      aria-label="Main"
      // Hidden: slid below the screen (raised button included) and inert, so it can't be tapped or focused.
      inert={!visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-(--bottom-nav-offset) z-40 px-3 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] min-[400px]:px-4 md:hidden print:hidden",
        !visible && "translate-y-[calc(100%+var(--bottom-nav-offset)+1.5rem)] opacity-0",
      )}
    >
      <ul ref={listRef} className="pointer-events-auto relative mx-auto grid h-16 max-w-md grid-cols-5 rounded-3xl bg-white px-1 shadow-[0_-4px_24px_-8px_rgb(15_33_71/0.16),0_12px_32px_-12px_rgb(15_33_71/0.35)] ring-1 ring-brand-950/5">
        {mainNav.slice(0, ORDER_COLUMN).map(tab)}

        {/* Rises out of the bar, its label on the tabs' baseline: a blue circle with a white rim (so it
            stands clear of the blue hero too) and a soft glow, the mascot peeking up from its lower edge. */}
        <li className="relative">
          <button
            type="button"
            onClick={() => openOrderModal({ allowSkip: true })}
            aria-haspopup="dialog"
            className="group absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 pb-2.5 text-brand-600 focus-visible:outline-none"
          >
            <span className="relative grid size-14 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_30%,var(--color-brand-400),var(--color-brand-600)_75%)] shadow-[inset_0_1px_1px_rgb(255_255_255/0.45),0_8px_20px_-4px_rgb(48_121_234/0.6)] ring-3 ring-white transition-[scale] duration-200 ease-out group-active:scale-92 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand-600 max-[359px]:size-13">
              {/* The artwork fills only part of the PNG (x 180-446, y 78-283 of 612 x 408): sized so it spans
                  78% of the circle and centred both ways. */}
              <Image
                src="/images/order-now-mascot.png"
                alt=""
                width={612}
                height={408}
                sizes="112px"
                className="absolute top-[-2.9%] left-[-41.8%] w-[179.5%] max-w-none transition-[translate] duration-300 ease-out group-hover:-translate-y-0.5"
              />
            </span>
            <span className={cn(labelClass, "font-semibold")}>Order Now</span>
          </button>
        </li>

        {mainNav.slice(ORDER_COLUMN).map(tab)}
      </ul>
    </nav>
  );
}
