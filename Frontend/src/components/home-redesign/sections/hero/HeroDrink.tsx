import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import {
  HERO_CANVAS,
  HERO_COMPACT_CANVAS,
  HERO_TARGETS,
  type DrinkPlacement,
  type HeroDrinkConfig,
} from "./hero.config";

type HeroDrinkProps = {
  drink: HeroDrinkConfig;
};

type Canvas = { width: number; height: number };

/** Rendered width of a drink as a fraction of stage width, for the `sizes` hint. */
function widthFraction(p: DrinkPlacement, stage: Canvas, imageAspect: number) {
  return (p.h / 100) * imageAspect / (stage.width / stage.height);
}

const vw = (fraction: number) => `${Math.ceil(Math.max(fraction, 0.1) * 100)}vw`;

/**
 * One floating drink. Outer wrapper = static placement + base tilt (CSS vars from config, one set
 * per layout: phone, tablet, desktop). Inner wrapper = free for animation transforms.
 * Drinks without a phone placement are hidden on phones.
 */
export function HeroDrink({ drink }: HeroDrinkProps) {
  const { desktop, tablet, phone } = drink;
  const imageAspect = drink.width / drink.height;

  const desktopFrac = widthFraction(desktop, HERO_CANVAS, imageAspect);
  const sizes = [
    `(min-width: 1600px) ${Math.ceil(desktopFrac * 1600)}px`,
    `(min-width: 1280px) ${Math.ceil(desktopFrac * 100)}vw`,
    `(min-width: 1024px) and (orientation: landscape) ${Math.ceil(desktopFrac * 100)}vw`,
    `(min-width: 640px) ${vw(widthFraction(tablet, HERO_COMPACT_CANVAS.tablet, imageAspect))}`,
    // Hidden on phones: the smallest candidate keeps the download to a few hundred bytes.
    phone ? vw(widthFraction(phone, HERO_COMPACT_CANVAS.phone, imageAspect)) : "1px",
  ].join(", ");

  const style = {
    "--ar": `${drink.width} / ${drink.height}`,
    "--x": `${desktop.x}%`,
    "--y": `${desktop.y}%`,
    "--h": `${desktop.h}%`,
    "--r": `${desktop.rotate}deg`,
    "--z": drink.layer,
    "--tx": `${tablet.x}%`,
    "--ty": `${tablet.y}%`,
    "--th": `${tablet.h}%`,
    "--tr": `${tablet.rotate}deg`,
    ...(phone && {
      "--px": `${phone.x}%`,
      "--py": `${phone.y}%`,
      "--ph": `${phone.h}%`,
      "--pr": `${phone.rotate}deg`,
    }),
  } as CSSProperties;

  return (
    <div
      data-hero={HERO_TARGETS.drink}
      data-drink={drink.id}
      style={style}
      className={cn(
        "absolute z-(--z) aspect-(--ar) -translate-x-1/2",
        phone ? "top-(--py) left-(--px) h-(--ph) rotate-(--pr)" : "max-sm:hidden",
        "sm:top-(--ty) sm:left-(--tx) sm:h-(--th) sm:rotate-(--tr)",
        "wide:top-(--y) wide:left-(--x) wide:block wide:h-(--h) wide:rotate-(--r)",
      )}
    >
      <div data-hero={HERO_TARGETS.drinkMotion} className="size-full">
        <Image
          src={drink.src}
          alt={drink.alt}
          width={drink.width}
          height={drink.height}
          sizes={sizes}
          preload={drink.id === "main"}
          loading="eager"
          className="size-full object-contain drop-shadow-[0_14px_16px_rgb(15_33_71/0.35)] wide:drop-shadow-[0_28px_28px_rgb(15_33_71/0.35)]"
        />
      </div>
    </div>
  );
}
