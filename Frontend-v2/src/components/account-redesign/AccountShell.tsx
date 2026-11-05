"use client";

import { Bell, CircleQuestionMark, Gift, LayoutGrid, LoaderCircle, MapPin, PencilLine, ReceiptText, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import toast from "react-hot-toast";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { BottomNav } from "@/components/home-redesign/layout/BottomNav";
import { SiteHeader } from "@/components/home-redesign/layout/SiteHeader";
import { cn } from "@/components/home-redesign/lib/cn";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { Container } from "@/components/home-redesign/ui/Container";
import { displayPhone } from "@/components/login-redesign/loginHelpers";
import { useAuthHydrated } from "@/hooks/useAuthHydrated";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { useMe } from "./accountData";
import { AccountHero } from "./AccountHero";
import { useAccountPageMotion, useNavEntrance } from "./accountMotion";
import { focusRing, MemberAvatar } from "./accountUi";
import { ProfileDialog } from "./ProfileDialog";

export type NavId = "overview" | "orders" | "addresses" | "rewards" | "notifications" | "help";

/** The account's pages, in the navigation's order. */
export const accountNav: { id: NavId; label: string; href: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", href: "/account", icon: LayoutGrid },
  { id: "orders", label: "My Orders", href: "/account/orders", icon: ReceiptText },
  { id: "addresses", label: "Addresses", href: "/account/addresses", icon: MapPin },
  { id: "rewards", label: "Rewards", href: "/account/rewards", icon: Gift },
  { id: "notifications", label: "Notifications", href: "/account/notifications", icon: Bell },
  { id: "help", label: "Help", href: "/account/help", icon: CircleQuestionMark },
];

/** The paths that use this shell (each page moves in as its new design is built). */
export const ACCOUNT_SHELL_PATHS = new Set(["/account", "/account/orders", "/account/addresses", "/account/rewards", "/account/notifications", "/account/help"]);

/** Fizzy bubbles rising up the navigation column, as on the sign-in page: `left` in %, `size` in rem, seconds. */
const bubbles = [
  { left: 14, size: 1.4, duration: 17, delay: -3 },
  { left: 38, size: 0.6, duration: 12, delay: -9 },
  { left: 62, size: 1, duration: 15, delay: -1 },
  { left: 80, size: 1.8, duration: 21, delay: -13 },
  { left: 50, size: 0.75, duration: 13, delay: -6 },
];

type AccountContextValue = {
  user: User;
  /** A soft-deleted account: it can still sign in, but only sees the Overview (with a notice) and Log Out. */
  deleted: boolean;
  logOut: () => void;
  editDetails: () => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

/** The signed-in customer, Log Out and opening the details pop-up (ProfileDialog), for the pages inside AccountShell (which only renders them when signed in). */
export function useSignedInAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useSignedInAccount() is only for pages inside AccountShell");
  return context;
}

/** The customer's number for showing, or null when the account has none yet (a social sign-in). */
export const accountPhone = (user: User) => (user.phone ? displayPhone(user.phone) : null);

/** The path without a trailing slash, so it matches the nav's hrefs. */
const routeOf = (pathname: string) => pathname.replace(/(.)\/$/, "$1");

/**
 * Every redesigned /account page (ACCOUNT_SHELL_PATHS), with the redesigned header and the phones' bottom nav (no
 * footer). From lg, one blue surface (the hero's backdrop) runs edge to edge behind the navigation column on the
 * left (from the screen's left edge, the full height: the customer's member card, the links, Log Out) and the short
 * hero on the right (AccountHero: the current page's name); the page sits on a white panel under the hero, with
 * icing poured over its top: periwinkle cream melting into drips, sprinkles and all (the `icing` utilities). On
 * desktop screens tall enough (the `shell` variant) the hero and the navigation stay put and only the panel scrolls
 * (back at the top on each new page) under its icing; the window itself never scrolls, so the header keeps its look
 * for the blue behind it. Shorter windows scroll the whole page. Below lg the hero is a blue band melting into the
 * white page, and on tablets (md to lg) the navigation is a row of pills, sticking under the header, that scrolls
 * sideways. Phones (below md) work like an app instead: the Overview is the account's home, with the customer and
 * their points in the hero and the other pages as a list (AccountHome); every other page has only a slim bar in the
 * hero (back to the home, and its name). The customer's details are edited in a pop-up (ProfileDialog), opened from
 * the member card's (or, below lg, the hero's) Edit button.
 *
 * The customer comes from authStore (kept from sign-in) and is refreshed from GET /auth/me (useMe). Anyone signed out
 * is sent to /account/login once the session is known; logging out goes home with a toast.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storedUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const route = routeOf(usePathname() ?? "/account");
  const [editing, setEditing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Set while logging out, so the page goes home rather than to /account/login. */
  const loggingOut = useRef(false);
  useMe();

  useEffect(() => {
    if (hydrated && !isAuthenticated && !loggingOut.current) router.replace("/account/login");
  }, [hydrated, isAuthenticated, router]);

  // The panel keeps its scroll position between pages (the shell stays), so each page starts at its top. In braces:
  // newer browsers return a Promise from scrollTo, and an effect may only return its clean-up.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [route]);

  /** Signs out (here and on the server's cookie) and goes to the homepage with `message`. */
  const signOut = (message: string) => {
    loggingOut.current = true;
    logout();
    toast.success(message);
    router.replace("/");
  };
  const logOut = () => signOut("You have logged out. See you soon!");

  const page = accountNav.find(({ href }) => href === route)?.id ?? "overview";
  const user = hydrated && isAuthenticated ? storedUser : null;
  const editDetails = () => setEditing(true);
  useAccountPageMotion(panelRef, route, user !== null);

  return (
    <div className={`home-redesign ${homeFontVariables} relative min-h-dvh bg-white antialiased`}>
      <SiteHeader />
      {/* Around the hero too, which shows the customer's points on phones (null until signed in). */}
      <AccountContext value={user ? { user, deleted: Boolean(user.isDeleted), logOut, editDetails } : null}>
        <div
          className="lg:grid lg:min-h-dvh lg:grid-cols-[var(--account-nav-width)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:bg-fixed lg:[background-image:var(--account-backdrop)] shell:h-dvh"
          style={{ "--account-backdrop": heroBackdropImage, "--account-nav-width": "19.25rem" } as CSSProperties}
        >
          <AccountHero page={page} user={user} onEdit={editDetails} />
          {editing && user && (
            <ProfileDialog
              user={user}
              onClose={() => setEditing(false)}
              // A deleted account is signed out and sent home; signing in again with the number offers to recover it.
              onDeleted={() => {
                setEditing(false);
                signOut("Your account has been deleted. Sign in again with your number any time to recover it.");
              }}
            />
          )}

          {/* No footer here, so on phones the page itself clears the bottom nav (--bottom-nav-space is 0 from md up). */}
          {/* From lg its two children are the shell's own grid cells (display: contents), edge to edge. */}
          <Container className="pb-[calc(var(--bottom-nav-space)+3rem)] lg:contents">
            {user ? (
              <>
                <AccountNav route={route} />
                {/* The white panel (from lg), its icing laid over its top below; on `shell` screens the part that scrolls. */}
                <div
                  ref={panelRef}
                  className="min-w-0 pt-4 lg:col-start-2 lg:row-start-2 lg:min-h-0 lg:pt-0 lg:[clip-path:inset(0_round_2.5rem_0_0_0)] lg:bg-white lg:pr-12 lg:pb-12 lg:pl-10 shell:overflow-y-auto shell:overscroll-contain shell:pb-10 shell:[scrollbar-color:var(--color-brand-200)_transparent] shell:[scrollbar-width:thin]"
                >
                  {/* The room under the icing. On `shell` screens it stays at the top while the page scrolls: a white fade
                      the page dissolves into before it slides under the drips. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none z-10 -mr-12 -ml-10 hidden h-[calc(var(--icing-height)+1.25rem)] bg-linear-to-b from-white from-60% to-white/0 lg:block shell:sticky shell:top-0"
                  />
                  {children}
                </div>
              </>
            ) : (
              <p role="status" className="flex min-h-96 items-center justify-center gap-3 text-sm text-slate-500 lg:col-start-2 lg:row-start-2 lg:[clip-path:inset(0_round_2.5rem_0_0_0)] lg:bg-white">
                <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
                Loading your account…
              </p>
            )}

            {/* From lg, the icing over the top of the panel (same cell, laid on top; the page scrolls under it): the
                cream in the hero's own blue (the shell's backdrop, fixed to the screen like the shell's, so the two line
                up and the band melts out of the hero with no edge), a touch brighter towards the tips, its soft shadow on
                the panel (the sprinkles and shine are the next layer). Rounded like the panel's corner (a pixel past its edge, so
                no white rim shows). */}
            <div
              aria-hidden="true"
              className="pointer-events-none relative z-10 hidden h-[calc(var(--icing-height)+0.5rem)] self-start [clip-path:inset(0_round_2.5rem_0_0_0)] lg:col-start-2 lg:row-start-2 lg:-mt-px lg:-ml-px lg:block"
            >
              <div className="icing-shape absolute inset-x-0 top-[3px] h-(--icing-height) bg-brand-950/12 blur-[3px]" />
              <div
                className="icing-shape absolute inset-x-0 top-0 h-(--icing-height) bg-fixed"
                style={{ backgroundImage: `linear-gradient(to bottom, transparent 30%, rgb(255 255 255 / 0.12)), ${heroBackdropImage}`, backgroundAttachment: "scroll, fixed" }}
              />
            </div>
            {/* The sprinkles (and tip shines), on top of the icing and scattered up into the hero above it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none icing-decor relative z-20 hidden h-[calc(var(--icing-height)+var(--icing-sprinkle-reach))] self-start lg:col-start-2 lg:row-start-2 lg:-mt-[calc(var(--icing-sprinkle-reach)+1px)] lg:-ml-px lg:block"
            />
          </Container>
        </div>
      </AccountContext>
      <BottomNav />
    </div>
  );
}

/**
 * The navigation. From lg, the left column on the shell's blue, the full height from under the header, from the
 * screen's left edge: the customer's member card (MemberCard), then the links, each icon on a little frosted
 * tile, the current page a white pill (its icon in brand blue) with a sunny dot, the pill sliding from link to
 * link as the page changes (useNavIndicator), and Log Out as an outlined button at the foot, with fizzy bubbles rising
 * in any room left above it. On `shell` screens it fills the height, a little tighter under 760px tall (the `tall`
 * variant); on shorter ones the links stay in view (sticky) while the page scrolls. On tablets (md to lg), the links
 * are pills in a row that sticks under the header and scrolls sideways, with the current one scrolled into view, Log
 * Out (in rose) last. Phones have none: the account home lists the pages (AccountHome). A deleted account only has
 * the Overview.
 */
function AccountNav({ route }: { route: string }) {
  const { logOut, deleted } = useSignedInAccount();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const indicator = useNavIndicator(listRef, route);
  useNavEntrance(rootRef);
  const items = deleted ? accountNav.filter(({ id }) => id === "overview") : accountNav;

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current='page']");
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    // Not scrollIntoView, which would also scroll the page.
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [route]);

  return (
    // From lg a grid item, which z-index would lift above the hero even unpositioned: z-auto.
    <div
      ref={rootRef}
      className="sticky top-22 z-20 -mx-5 bg-white/90 py-2 backdrop-blur-md max-md:hidden sm:-mx-8 lg:relative lg:top-0 lg:z-auto lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:flex lg:min-h-0 lg:flex-col lg:gap-5 lg:bg-transparent lg:pt-22 lg:pr-4 lg:pb-5 lg:pl-12 lg:backdrop-blur-none lg:tall:gap-7 shell:overflow-y-auto shell:[scrollbar-width:none]"
    >
      <MemberCard />

      <nav aria-label="Account" className="relative lg:sticky lg:top-24 shell:static shell:flex shell:flex-1 shell:flex-col">
        <ul
          ref={listRef}
          className="flex gap-2 overflow-x-auto px-5 py-1 [scrollbar-width:none] sm:px-8 lg:relative lg:flex-col lg:gap-2.5 lg:overflow-visible lg:p-0 lg:tall:gap-3.5 shell:flex-1 [&::-webkit-scrollbar]:hidden"
        >
          {/* From lg, the white pill behind the current link, sliding to the new one as the page changes. */}
          <li
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 hidden rounded-2xl bg-white shadow-md shadow-brand-950/25 lg:block",
              indicator.animate && "transition-[translate,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            )}
            style={indicator.box ? { translate: `0 ${indicator.box.top}px`, height: indicator.box.height } : { visibility: "hidden" }}
          />
          {items.map(({ id, label, href, icon: Icon }) => {
            const current = route === href;
            return (
              <li key={id} data-nav-item className="relative shrink-0">
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,translate] lg:h-9 lg:gap-3 lg:rounded-2xl lg:pr-3 lg:pl-1.5 lg:text-[0.9375rem] lg:tall:h-10",
                    current
                      ? "bg-brand-600 text-snow shadow-md shadow-brand-600/25 lg:bg-transparent lg:text-brand-700 lg:shadow-none"
                      : "bg-brand-50 text-brand-800 hover:bg-brand-100 lg:bg-transparent lg:text-snow/90 lg:hover:translate-x-0.5 lg:hover:bg-white/10 lg:hover:text-snow",
                    focusRing,
                    "lg:focus-visible:outline-white",
                  )}
                >
                  {/* From lg the icon sits on a little tile: frosted on the blue; in the current (white) pill, white with the icon in brand blue. */}
                  <span
                    className={cn(
                      "contents lg:grid lg:size-8 lg:shrink-0 lg:place-items-center lg:rounded-xl lg:transition-colors",
                      current ? "lg:bg-white lg:text-brand-600" : "lg:bg-white/10 lg:group-hover:bg-white/20",
                    )}
                  >
                    <Icon className={cn("size-4", !current && "max-lg:text-brand-600")} aria-hidden="true" />
                  </span>
                  {label}
                  {current && <span aria-hidden="true" className="ml-auto hidden size-2 rounded-full bg-sun-300 ring-2 ring-sun-300/30 lg:block" />}
                </Link>
              </li>
            );
          })}
          {/* Decorative: the room left between the links and Log Out (none when the screen is short), where the
              sign-in page's fizz rises, fading out before the links. */}
          <li
            aria-hidden="true"
            className="pointer-events-none relative hidden min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_top,#000_55%,transparent)] shell:block"
          >
            {bubbles.map((bubble) => (
              <span
                key={bubble.left}
                className="absolute top-full animate-bubble-rise"
                style={{ left: `${bubble.left}%`, width: `${bubble.size}rem`, animationDuration: `${bubble.duration}s`, animationDelay: `${bubble.delay}s` }}
              >
                <span
                  className="block aspect-square animate-bubble-sway rounded-full border border-white/25 bg-[radial-gradient(circle_at_32%_30%,rgb(255_255_255/0.45)_0,rgb(255_255_255/0.1)_35%,rgb(255_255_255/0.03)_70%)]"
                  style={{ animationDuration: `${2.5 + (bubble.size % 1) * 2}s` }}
                />
              </span>
            ))}
          </li>
          <li data-nav-logout className="shrink-0 lg:pt-2 lg:tall:pt-3">
            <button
              type="button"
              onClick={logOut}
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-full bg-rose-50 px-4 text-sm font-semibold whitespace-nowrap text-rose-700 transition-colors hover:bg-rose-100 lg:h-10 lg:justify-center lg:bg-linear-to-br lg:from-brand-100 lg:to-brand-200 lg:text-[0.9375rem] lg:font-bold lg:text-brand-800 lg:shadow-[0_10px_24px_-12px_rgb(15_33_71/0.55)] lg:hover:from-white lg:hover:to-brand-100 lg:hover:text-rose-600 lg:tall:h-11",
                focusRing,
                "lg:focus-visible:outline-white",
              )}
            >
              Log Out
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/**
 * From lg, where the current link's row sits in the navigation list, for the white pill that slides behind it:
 * measured when the list first lays out and whenever it resizes (a ResizeObserver's first report comes before
 * the first paint), and a frame after each page change. `animate` turns on once the pill is in place, so it
 * doesn't slide in from the top on arrival. `box` is null when no link is current.
 */
function useNavIndicator(list: RefObject<HTMLUListElement | null>, route: string) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const place = () => {
      const row = element.querySelector<HTMLElement>("[aria-current='page']")?.closest("li");
      setBox(row ? { top: row.offsetTop, height: row.offsetHeight } : null);
    };
    const observer = new ResizeObserver(place);
    observer.observe(element);
    const frame = requestAnimationFrame(place);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [list, route]);

  useEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  return { box, animate };
}

/**
 * From lg, the head of the navigation: a frosted card with the customer's picture (MemberAvatar) on the left and their name,
 * number beside it (not the email: it's in the details pop-up), and a small round Edit (the details pop-up).
 */
function MemberCard() {
  const { user, editDetails } = useSignedInAccount();
  const phone = accountPhone(user);

  return (
    // Ice blue on the column's blue, so it stands out from it; lifted on a soft blue shadow.
    // shrink-0: on a short screen the column scrolls rather than squeezing the card.
    <div
      data-nav-card
      className="relative hidden shrink-0 overflow-hidden rounded-3xl bg-linear-to-br from-brand-100 to-brand-200 p-3.5 shadow-[0_14px_30px_-12px_rgb(15_33_71/0.55)] lg:block tall:p-4"
    >
      {/* Decorative: a soft glow in the corner. */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-white/40" />

      <div className="relative flex items-center gap-3 text-brand-950">
        <MemberAvatar className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base leading-snug font-bold">{user.name}</p>
          <p className="font-numeric truncate text-[0.8125rem] font-medium text-brand-700">{phone ?? "No mobile number yet"}</p>
        </div>
        {/* A small round pencil beside the name, so the card stays one row tall. */}
        <button
          type="button"
          onClick={editDetails}
          aria-label="Edit your details"
          title="Edit your details"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-snow shadow-sm shadow-brand-700/30 transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <PencilLine className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
