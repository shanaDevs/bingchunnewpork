import { cn } from "@/components/home-redesign/lib/cn";
import { Sparkle } from "@/components/offers-redesign/parts";

/** The little wheel's slices, round from the top: brand blues, white and sunny yellow. No prizes are named on it. */
const SLICES = ["#3079ea", "#ffffff", "#ffd23f", "#1a4fb2", "#ffffff", "#ff6fb5", "#5b9bf6", "#ffffff"];

const wheelGradient = `conic-gradient(${SLICES.map((colour, i) => `${colour} ${i * 45}deg ${(i + 1) * 45}deg`).join(", ")})`;

/**
 * A prize wheel drawn in CSS, decorative: eight plain slices, studs round the rim, a hub and the pointer on top. Sized
 * by `className` (it fills a square box). The turning part is `data-mini-wheel-face`, so a caller can rock or spin it
 * (`faceClassName`, or GSAP on that attribute) while the pointer stays put. `shadow` is the face's drop shadow.
 * Used by the Feeling Lucky banner and the floating Spin & Win button; the real wheel is in the pop-up.
 */
export function MiniWheel({
  className,
  faceClassName,
  shadow = "shadow-[0_18px_30px_-10px_rgb(15_33_71/0.45)]",
}: {
  className?: string;
  faceClassName?: string;
  shadow?: string;
}) {
  return (
    // A size container, so the rings (cqw) keep their proportions at any size.
    <span aria-hidden="true" className={cn("@container relative block shrink-0", className)}>
      <span data-mini-wheel-face className={cn("absolute inset-0 rounded-full bg-brand-800 p-[7%]", shadow, faceClassName)}>
        <span className="relative block size-full rounded-full ring-[2.5cqw] ring-white/90" style={{ backgroundImage: wheelGradient }}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="absolute inset-0" style={{ rotate: `${i * 45 + 22.5}deg` }}>
              <Sparkle className="absolute top-[12%] left-1/2 size-[13%] -translate-x-1/2 text-brand-900/25" />
            </span>
          ))}
        </span>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className="absolute inset-0" style={{ rotate: `${i * 22.5}deg` }}>
            <span className="absolute top-[2.2%] left-1/2 size-[4%] -translate-x-1/2 rounded-full bg-sun-300 shadow-[0_0_6px_rgb(255_226_122/0.9)]" />
          </span>
        ))}
        <span className="absolute top-1/2 left-1/2 grid size-[26%] -translate-1/2 place-items-center rounded-full bg-white shadow-md ring-[2.5cqw] ring-brand-800">
          <Sparkle className="size-[55%] text-sun-400" />
        </span>
      </span>
      {/* Pointer. */}
      <svg viewBox="0 0 24 28" className="absolute top-[-6%] left-1/2 w-[16%] -translate-x-1/2 drop-shadow-md">
        <path d="M12 28 2 8a10 10 0 1 1 20 0Z" className="fill-white" />
        <circle cx="12" cy="9" r="4" className="fill-[#ff6fb5]" />
      </svg>
    </span>
  );
}
