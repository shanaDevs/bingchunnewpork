import { HERO_TARGETS, heroDrinks } from "./hero.config";
import { HeroDrink } from "./HeroDrink";

/**
 * Holds the floating drinks. It covers the whole canvas and deliberately has no z-index or
 * transform, so each drink's own z-index interleaves with the headline.
 */
export function HeroProductStage() {
  return (
    <div
      data-hero={HERO_TARGETS.stage}
      className="pointer-events-none absolute inset-0"
    >
      {heroDrinks.map((drink) => (
        <HeroDrink key={drink.id} drink={drink} />
      ))}
    </div>
  );
}
