"use client";

import { gsap } from "@/components/home-redesign/lib/gsap";

/** The cart button the item flies into (the header's; the open mobile menu's copy is never on screen while adding). */
const CART_TARGET = "[data-cart-target]";

/** How long the item takes to reach the cart, after its little lift off the photo. */
const FLIGHT_S = 0.7;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let audio: AudioContext | null = null;

/**
 * Browsers only let a page start making sound during a click, so this runs straight from the Add to Cart
 * click; the pop itself plays later, as the item lands, on the context woken up here.
 */
function wakeAudio() {
  if (typeof AudioContext === "undefined") return null;
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

/**
 * A soft bubble pop, made in code (no sound file): a sine whose pitch springs up as it fades out, then a
 * fainter, higher plip just after, like a second little bubble. Quiet and about 0.2s long.
 */
function playPop(context: AudioContext) {
  const bubble = (start: number, fromHz: number, toHz: number, volume: number) => {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(fromHz, start);
    tone.frequency.exponentialRampToValueAtTime(toHz, start + 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    tone.connect(gain).connect(context.destination);
    tone.start(start);
    tone.stop(start + 0.16);
  };
  const now = context.currentTime;
  bubble(now, 320, 950, 0.22);
  bubble(now + 0.07, 700, 1600, 0.07);
}

function findCart() {
  return [...document.querySelectorAll<HTMLElement>(CART_TARGET)].find((cart) => cart.getClientRects().length > 0);
}

/** The cart button jumps up a little and springs back, as if it caught the item. */
function bounce(cart: HTMLElement) {
  gsap
    .timeline({ overwrite: "auto" })
    .to(cart, { scale: 1.22, duration: 0.12, ease: "power2.out" })
    .to(cart, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.35)", clearProps: "transform" });
}

/**
 * Add to Cart feedback: a copy of the product photo lifts off, flies in an arc into the header cart
 * button, which bounces as a soft bubble pop plays. Call from the click handler after a successful add.
 */
export function flyToCart(photo: HTMLImageElement | null, button: Element) {
  const context = wakeAudio();
  const pop = () => context && playPop(context);
  if (reducedMotion()) {
    pop();
    return;
  }

  const photoBox = photo?.getBoundingClientRect();
  const photoMiddle = photoBox && photoBox.top + photoBox.height / 2;
  const onScreen = photoMiddle !== undefined && photoMiddle > 0 && photoMiddle < window.innerHeight;
  const from = onScreen ? photoBox! : button.getBoundingClientRect();
  const src = photo?.currentSrc || photo?.src;

  requestAnimationFrame(() => {
    const cart = findCart();
    if (!cart || !src) {
      pop();
      return;
    }
    const to = cart.getBoundingClientRect();
    const size = gsap.utils.clamp(56, 140, Math.min(from.width, from.height));
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - fromX;
    const dy = to.top + to.height / 2 - fromY;

    const flyer = document.createElement("img");
    flyer.src = src;
    flyer.alt = "";
    flyer.setAttribute("aria-hidden", "true");
    Object.assign(flyer.style, {
      position: "fixed",
      left: `${fromX - size / 2}px`,
      top: `${fromY - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      objectFit: "contain",
      zIndex: "100",
      pointerEvents: "none",
      filter: "drop-shadow(0 10px 14px rgb(15 33 71 / 0.25))",
    });
    document.body.append(flyer);

    gsap
      .timeline({
        onComplete: () => {
          flyer.remove();
          pop();
          bounce(cart);
        },
      })
      .fromTo(flyer, { scale: 0.6, opacity: 0 }, { scale: 1.08, opacity: 1, duration: 0.18, ease: "back.out(2)" })
      .addLabel("flight")
      .to(flyer, { x: dx, duration: FLIGHT_S, ease: "power2.in" }, "flight")
      .to(flyer, { y: dy, duration: FLIGHT_S, ease: "power2.out" }, "flight")
      .to(flyer, { scale: 0.2, rotation: dx < 0 ? -20 : 20, duration: FLIGHT_S, ease: "power1.in" }, "flight")
      .to(flyer, { opacity: 0, duration: 0.1 }, `flight+=${FLIGHT_S - 0.1}`);
  });
}
