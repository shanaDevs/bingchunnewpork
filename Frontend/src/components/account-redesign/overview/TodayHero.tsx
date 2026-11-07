"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import { cn } from "@/components/home-redesign/lib/cn";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { isProductInStock } from "@/lib/productAvailability";
import type { Product } from "@/types";
import { useSignedInAccount } from "../AccountShell";
import { focusRing } from "../accountUi";
import { formatLkr } from "../orders/orderParts";
import { firstName, GREETINGS, type DayPart } from "../colomboTime";
import { useLiveMenu, useTodaySpecial } from "./liveData";
import { MOOD_FOR, moodPool } from "./moods";
import { useProductDrawer } from "./useProductDrawer";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Colombo" };

/** A line for each part of the day. */
const LINES: Record<DayPart, string> = {
  morning: "Start the day light and fresh with something fruity.",
  afternoon: "Hot out there? Something icy and zesty will cool you down.",
  evening: "Evenings were made for something sweet.",
  night: "A late-night craving? A little treat never hurts.",
};

/** Each part of the day's sky (light, so it sits quietly under the page's blue hero) and its sun (a faint glow with no edge) or moon. */
const SCENES: Record<DayPart, { sky: string; orb: string }> = {
  morning: { sky: "from-amber-50 via-cream-50 to-brand-50", orb: "top-2 right-[27%] size-40 bg-[radial-gradient(circle,rgb(255_226_122/0.4),transparent_70%)]" },
  afternoon: { sky: "from-brand-100 via-brand-50 to-cream-50", orb: "-top-14 right-[24%] size-48 bg-[radial-gradient(circle,rgb(255_210_63/0.35),transparent_70%)]" },
  evening: { sky: "from-orange-100 via-rose-50 to-violet-100", orb: "-bottom-20 right-[26%] size-48 bg-[radial-gradient(circle,rgb(253_186_116/0.4),transparent_70%)]" },
  night: { sky: "from-indigo-100 via-brand-100 to-violet-100", orb: "top-7 right-[30%] size-16 bg-[radial-gradient(circle_at_35%_35%,#ffffff,#e0e7ff)] shadow-[0_0_40px_10px_rgb(255_255_255/0.6)]" },
};

/** Night only: a few twinkling stars. */
const STARS = ["top-6 right-[52%] size-1.5", "top-16 right-[44%] size-1 [animation-delay:-1s]", "top-10 right-[14%] size-1.5 [animation-delay:-2s]", "top-24 right-[38%] size-1 [animation-delay:-3s]"];

/**
 * The greeting, in a scene that follows the time of day in Sri Lanka (morning, afternoon, evening, night): today's
 * date, "Good evening, Amaya" (the real first name), a line for the moment and Order now (the app's order setup, as
 * the bottom bar's Order Now); on the right, today's pick (useTodaysPick), live from the menu, with Order it opening
 * the menu's own add-to-bag drawer.
 * Not on phones, where the hero greets the customer instead (AccountHero) and Order Now is in the bottom bar.
 */
export function TodayHero({ part }: { part: DayPart }) {
  const { user } = useSignedInAccount();
  const pick = useTodaysPick(part);
  const { open, drawer } = useProductDrawer();
  const scene = SCENES[part];

  return (
    <section
      aria-labelledby="today-heading"
      className={cn("relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br px-5 py-6 ring-1 ring-brand-100 max-md:hidden sm:rounded-[2rem] sm:px-8", scene.sky)}
    >
      {/* Decorative: the sun or moon, soft clouds, and stars at night. */}
      <span aria-hidden="true" className={cn("absolute -z-10 rounded-full", scene.orb)} />
      <span aria-hidden="true" className="absolute -bottom-10 -left-8 -z-10 h-24 w-64 rounded-full bg-white/50 blur-xl" />
      <span aria-hidden="true" className="absolute top-4 left-[42%] -z-10 h-10 w-40 rounded-full bg-white/40 blur-lg" />
      {part === "night" && STARS.map((className) => <span key={className} aria-hidden="true" className={cn("absolute -z-10 animate-pulse rounded-full bg-white", className)} />)}

      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.16em] text-brand-700 uppercase">{new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(new Date())}</p>
          <h2 id="today-heading" className="mt-2 font-display-condensed text-4xl leading-none text-brand-950 uppercase sm:text-5xl">
            {GREETINGS[part](firstName(user.name))}
          </h2>
          <p className="mt-2.5 max-w-lg text-sm text-slate-700 sm:text-base">{LINES[part]}</p>
          <button
            type="button"
            onClick={() => openOrderModal({ allowSkip: true })}
            className={cn(
              "mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-snow shadow-lg shadow-brand-600/25 transition-[background-color,translate] hover:-translate-y-0.5 hover:bg-brand-700",
              focusRing,
            )}
          >
            Order now
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        {pick && <TodaysPick product={pick.product} special={pick.special} onOrder={() => open(pick.product)} />}
      </div>
      {drawer}
    </section>
  );
}

/**
 * Today's pick, live: the admin's Daily Special while one is running and the branch can sell it; otherwise the top
 * product on the live menu for the mood that suits the time of day (overview/moods). Null while the menu loads or
 * when nothing fits. Checked again every minute (liveData).
 */
function useTodaysPick(part: DayPart): { product: Product; special: boolean } | null {
  const { data: menu } = useLiveMenu();
  const { data: special } = useTodaySpecial();
  if (!menu) return null;

  // The backend only answers with a special that's running now.
  if (special?.product) {
    // The branch's own copy of the product carries its stock there.
    const product = menu.find((item) => item.id === special.product.id) ?? special.product;
    if (isProductInStock(product)) return { product, special: true };
  }

  const top = moodPool(MOOD_FOR[part], menu)[0];
  return top ? { product: top, special: false } : null;
}

/**
 * Today's pick: the product standing on a soft white glow, "Today's special" or "Today's pick", its name and the menu
 * price (what the order will charge), and Order it.
 */
function TodaysPick({ product, special, onOrder }: { product: Product; special: boolean; onOrder: () => void }) {
  return (
    <div className="hidden shrink-0 items-center gap-5 md:flex">
      <div aria-hidden="true" data-pop className="group/pick relative grid h-48 w-40 place-items-center">
        <span className="absolute size-40 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(255_255_255/0.4)_55%,transparent_72%)]" />
        <span className="absolute bottom-3 h-3.5 w-24 rounded-[50%] bg-brand-950/15 blur-sm" />
        {product.imageUrl ? (
          // The menu's photos come from the backend's storage, as on the menu itself.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="relative max-h-44 w-auto animate-float object-contain drop-shadow-[0_16px_14px_rgb(15_33_71/0.25)] transition-transform duration-500 group-hover/pick:scale-105 group-hover/pick:-rotate-3 motion-reduce:animate-none"
          />
        ) : (
          <span className="relative text-7xl">🧋</span>
        )}
      </div>
      <div className="w-44">
        <p className="inline-flex rounded-full bg-white/80 px-2.5 py-0.5 text-[0.6875rem] font-bold tracking-[0.12em] text-brand-700 uppercase ring-1 ring-brand-200 ring-inset">
          {special ? "Today's special" : "Today's pick"}
        </p>
        <button type="button" onClick={onOrder} className={cn("mt-2 block rounded text-left text-base leading-snug font-bold text-brand-950 hover:underline", focusRing)}>
          {product.name}
        </button>
        <p className="font-numeric mt-1.5 text-sm font-extrabold text-brand-700">{formatLkr(product.basePrice)}</p>
        <button
          type="button"
          onClick={onOrder}
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-snow shadow-md shadow-brand-900/25 transition-[background-color,translate] hover:-translate-y-0.5 hover:bg-brand-700",
            focusRing,
          )}
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          Order it
        </button>
      </div>
    </div>
  );
}
