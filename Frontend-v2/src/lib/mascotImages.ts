/** Mascot art served from frontend/public/mascots */
export const MASCOT_IMAGES = {
  /** Sad mascot holding an empty cup — empty cart state */
  emptyCartSad: '/mascots/sad-stitch-empty-cup.png',
  /** Thinking mascot — loading / detecting location */
  thinkingLoading: '/mascots/thinking.png',
  /** Ice-cream mascot — order confirmed celebration */
  orderConfirmed: '/mascots/order-confirmed.png',
  /** Delivery mode choice */
  delivery: '/mascots/delivery-rider.png',
  /** Takeaway mode choice */
  takeaway: '/mascots/takeaway.png',
  /** Welcome / choose order type */
  welcome: '/mascots/welcome.png',
  /** Location search step */
  search: '/mascots/search.png',
  /** Generic loading */
  loading: '/mascots/loading.png',
} as const;

export type MascotImageKey = keyof typeof MASCOT_IMAGES;
