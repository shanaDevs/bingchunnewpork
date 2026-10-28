import { House, Plus, Search, ShoppingBag, UserRound } from "lucide-react";
import Image from "next/image";

const categories = ["Bubble Tea", "Fruit Tea", "Sundae"];

const popular = [
  { name: "Blueberry Bobo Tea", src: "/images/products/Blueberry-Bobo-Tea-500u.png", width: 481, height: 800 },
  { name: "Mango Pomelo Sago", src: "/images/products/Mango-Pomelo-Sago.png", width: 463, height: 800 },
];

/**
 * CSS-drawn phone showing an illustrative Bing Chun app home screen (no prices or offers, since none are
 * confirmed). Drawn at one fixed size; the promo stage scales the whole composition. Purely decorative (the
 * banner copy carries the message), so hidden from assistive tech.
 */
export function PhoneMockup() {
  return (
    <div aria-hidden="true" className="relative w-[18rem]">
      {/* Bezel */}
      <div className="rounded-[3rem] bg-brand-950 p-2.5 shadow-2xl shadow-brand-950/40 ring-1 ring-white/20">
        {/* Screen */}
        <div className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[2.5rem] bg-brand-50 text-brand-950">
          <div className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-brand-950" />

          {/* Status bar */}
          <div className="flex items-center justify-between px-7 pt-3.5 text-[0.625rem] font-semibold">
            <span>9:41</span>
            <span className="flex gap-1">
              <span className="h-2 w-3 rounded-sm bg-brand-950" />
              <span className="h-2 w-4 rounded-sm bg-brand-950" />
            </span>
          </div>

          {/* App header */}
          <div className="flex items-center gap-2.5 px-5 pt-6">
            <Image src="/images/logo.avif" alt="" width={467} height={600} className="h-9 w-auto" />
            <div className="leading-tight">
              <p className="text-[0.625rem] font-medium text-slate-500">Hi there!</p>
              <p className="text-[0.8125rem] font-bold text-brand-700">What are you craving?</p>
            </div>
            <span className="relative ml-auto grid size-8 place-items-center rounded-full bg-white shadow-sm">
              <ShoppingBag className="size-3.5 text-brand-700" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-sun-400" />
            </span>
          </div>

          <div className="mx-5 mt-4 flex items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-[0.6875rem] text-slate-400 shadow-sm">
            <Search className="size-3.5" />
            Search drinks &amp; desserts
          </div>

          <div className="mx-5 mt-3.5 flex gap-1.5">
            {categories.map((category, i) => (
              <span
                key={category}
                className={
                  i === 0
                    ? "rounded-full bg-brand-600 px-3 py-1.5 text-[0.625rem] font-bold text-snow"
                    : "rounded-full bg-white px-3 py-1.5 text-[0.625rem] font-semibold text-brand-800 ring-1 ring-brand-100"
                }
              >
                {category}
              </span>
            ))}
          </div>

          {/* Featured drink: blue card (as the offer cards) with the cup popping out of the top */}
          <div className="relative mx-5 mt-8">
            <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))] p-4 pr-24 text-snow">
              <span className="absolute -right-6 -bottom-10 size-32 rounded-full bg-white/10" />
              <p className="text-[0.5625rem] font-bold tracking-[0.18em] text-sun-300 uppercase">Today&apos;s pick</p>
              <p className="font-display-condensed mt-1 text-[1.375rem] leading-[0.95] uppercase">
                Strawberry Mango Lemon Tea
              </p>
              <span className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-[0.625rem] font-bold text-brand-700">
                Order now
              </span>
            </div>
            <Image
              src="/images/products/Strawberry-Mango-Lemon-Tea-v2.png"
              alt=""
              width={463}
              height={800}
              sizes="80px"
              className="absolute right-2 -bottom-1 h-36 w-auto drop-shadow-[0_8px_8px_rgb(15_33_71/0.25)]"
            />
          </div>

          <div className="mx-5 mt-5 flex items-baseline justify-between">
            <p className="text-[0.75rem] font-bold">Popular right now</p>
            <p className="text-[0.625rem] font-semibold text-brand-600">See all</p>
          </div>
          <div className="mx-5 mt-2.5 grid grid-cols-2 gap-2.5">
            {popular.map((item) => (
              <div key={item.name} className="relative rounded-2xl bg-white p-2.5 shadow-sm">
                <div className="flex h-20 justify-center rounded-xl bg-brand-50">
                  <Image src={item.src} alt="" width={item.width} height={item.height} sizes="60px" className="h-full w-auto" />
                </div>
                <p className="mt-1.5 pr-6 text-[0.625rem] leading-tight font-semibold">{item.name}</p>
                <span className="absolute right-2 bottom-2 grid size-5 place-items-center rounded-full bg-brand-600 text-snow">
                  <Plus className="size-3" strokeWidth={3} />
                </span>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="mt-auto flex items-center justify-around rounded-t-3xl bg-white px-4 pt-3 pb-5 text-slate-400 shadow-[0_-4px_12px_rgb(15_33_71/0.06)]">
            <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[0.625rem] font-bold text-brand-600">
              <House className="size-3.5" />
              Home
            </span>
            <Search className="size-4" />
            <ShoppingBag className="size-4" />
            <UserRound className="size-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
