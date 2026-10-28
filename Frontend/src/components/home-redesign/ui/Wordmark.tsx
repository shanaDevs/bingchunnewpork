import Image from "next/image";
import Link from "next/link";
import { cn } from "@/components/home-redesign/lib/cn";

type WordmarkProps = {
  className?: string;
  /** Slightly smaller on phones (below sm), so the header row fits its buttons on narrow screens. */
  compact?: boolean;
  onClick?: () => void;
};

/**
 * Temporary text wordmark paired with the mascot artwork.
 * Text inherits the header colour (white over the hero, blue once scrolled past it).
 * Replace with the official logo file once Bing Chun supplies one.
 */
export function Wordmark({ className, compact = false, onClick }: WordmarkProps) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current",
        compact && "max-sm:gap-2",
        className,
      )}
    >
      <Image
        src="/images/logo.avif"
        alt=""
        width={467}
        height={600}
        className={cn("h-11 w-auto", compact && "max-sm:h-10")}
        preload
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-[1.5rem] font-extrabold tracking-[-0.01em] uppercase",
            compact && "max-sm:text-[1.3rem]",
          )}
        >
          Bing Chun
        </span>
        <span
          className={cn(
            "mt-1 text-[0.625rem] font-semibold tracking-[0.32em] uppercase opacity-70",
            compact && "max-sm:text-[0.5625rem] max-sm:tracking-[0.3em]",
          )}
        >
          Sri Lanka
        </span>
      </span>
    </Link>
  );
}
