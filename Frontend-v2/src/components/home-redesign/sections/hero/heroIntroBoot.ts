/**
 * Pre-paint boot for the hero entrance.
 *
 * Rendered as an inline <script> in the document <head> (see app/layout.tsx), and active only on the
 * home page (the one page with the hero). Before first paint
 * it adds HERO_INTRO_PENDING_CLASS to <html>, which hides only the elements the entrance animates
 * (hero-intro.css), so the final layout never flashes before GSAP takes over.
 *
 * - Skipped entirely when the user prefers reduced motion: the static composition shows at once.
 * - Failsafe: if the client animation has not started within FAILSAFE_MS (JS failed or very slow
 *   hydration), the class is removed so content is never left hidden; the intro is then skipped.
 */
export const HERO_INTRO_PENDING_CLASS = "hero-intro-pending";

const FAILSAFE_MS = 3000;

declare global {
  interface Window {
    /** Set by HeroMotion once it has taken control of the entrance. */
    __bcHeroIntroStarted?: boolean;
    /** Set by the boot failsafe when it had to reveal the page itself. */
    __bcHeroIntroTimedOut?: boolean;
  }
}

export const heroIntroBootScript = `(function(){try{
var d=document.documentElement;
if(location.pathname!=="/")return;
if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
d.classList.add("${HERO_INTRO_PENDING_CLASS}");
setTimeout(function(){if(!window.__bcHeroIntroStarted){window.__bcHeroIntroTimedOut=true;d.classList.remove("${HERO_INTRO_PENDING_CLASS}");}},${FAILSAFE_MS});
}catch(e){}})();`;
